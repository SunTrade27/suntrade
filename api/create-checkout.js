// Stripe Checkout Session - Vercel Serverless Function
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Cloudflare Turnstile токенді сервер жағында растау.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Егер TURNSTILE_SECRET_KEY орнатылмаған болса — dev/test режимінде өткізіп жібереміз.
 * Vercel-де MІНДЕТТІ ТҮРДЕ орнату керек: TURNSTILE_SECRET_KEY=0x...
 */
async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn('[create-checkout] ⚠️ TURNSTILE_SECRET_KEY not set — skipping bot verification (DEV ONLY)');
    return { success: true, skipped: true, 'error-codes': [] };
  }

  if (!token || typeof token !== 'string' || token.length === 0) {
    return { success: false, 'error-codes': ['missing-input-response'] };
  }

  try {
    const body = new URLSearchParams();
    body.append('secret', secret);
    body.append('response', token);
    if (remoteIp) body.append('remoteip', remoteIp);

    const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!verifyResp.ok) {
      console.error('[create-checkout] Turnstile verify HTTP error:', verifyResp.status);
      return { success: false, 'error-codes': ['http-error'] };
    }

    const result = await verifyResp.json();
    console.log('[create-checkout] Turnstile verify result:', JSON.stringify({
      success: result.success,
      hostname: result.hostname,
      'error-codes': result['error-codes'] || []
    }));

    // Hostname тексеру — сайт кілті дұрыс доменде қолданылатынын кепілдеу.
    // Сайт кілті ұрланған жағдайда немесе басқа доменде пайдаланылса — reject.
    const allowedHostnames = ['suntrade.store', 'www.suntrade.store'];
    if (result.success && result.hostname && !allowedHostnames.includes(result.hostname)) {
      console.warn('[create-checkout] ❌ Turnstile hostname mismatch:', result.hostname);
      return { success: false, 'error-codes': ['hostname-mismatch'] };
    }

    return result;
  } catch (err) {
    console.error('[create-checkout] Turnstile verification failed:', err);
    return { success: false, 'error-codes': ['network-error'] };
  }
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if Stripe key is configured
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set in environment variables');
    return res.status(500).json({
      error: 'Server configuration error: STRIPE_SECRET_KEY is missing. Please add it in Vercel Dashboard → Settings → Environment Variables.'
    });
  }

  try {
    const { items, customer, turnstileToken, turnstile_token } = req.body;

    // ===== Cloudflare Turnstile verification (bot protection) =====
    const tokenToVerify = turnstileToken || turnstile_token;
    const remoteIp =
      (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
      (req.headers['x-real-ip']) ||
      (req.socket?.remoteAddress) ||
      null;

    const turnstileResult = await verifyTurnstile(tokenToVerify, remoteIp);

    if (!turnstileResult.success) {
      const codes = turnstileResult['error-codes'] || [];
      console.warn('[create-checkout] ❌ Bot verification failed. Codes:', codes, 'IP:', remoteIp);
      return res.status(403).json({
        error: 'Bot verification failed. Please complete the human verification and try again.',
        codes,
        hint: codes.includes('missing-input-response')
          ? 'Refresh the page and complete the Turnstile widget before paying.'
          : 'Try refreshing the Turnstile widget.'
      });
    }

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Validate and sanitize items - filter out invalid ones
    const validItems = items.filter(item =>
      item && item.name && String(item.name).trim() !== '' &&
      item.price && !isNaN(parseFloat(item.price)) && parseFloat(item.price) > 0 &&
      item.qty && parseInt(item.qty) > 0
    );

    if (validItems.length === 0) {
      // Log invalid items for debugging
      console.error('Invalid cart items received:', JSON.stringify(items, null, 2));
      return res.status(400).json({
        error: 'No valid items in cart. Items must have a name, price, and quantity. Please clear your cart and try again.'
      });
    }

    // Create Stripe line items with sanitized data
    const lineItems = validItems.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: String(item.name).substring(0, 250), // Stripe has 250 char limit
          images: item.image ? [String(item.image).substring(0, 2000)] : [],
        },
        unit_amount: Math.round(parseFloat(item.price) * 100), // Stripe uses cents
      },
      quantity: parseInt(item.qty) || 1,
    }));

    // Store all product IDs and quantities in metadata (so webhook can save order_items)
    // Stripe metadata has a 500 char limit per key, so truncate if needed
    let productIds = validItems.map(i => `${i.id || i.productId || ''}:${i.qty}`).filter(s => s.split(':')[0]).join(',');
    if (productIds.length > 500) {
      productIds = productIds.substring(0, 497) + '...';
    }

    // Біздің locale → Stripe қолдайтын locale
    // Stripe қолдамайтын тілдер: kz (қазақ), ar (араб) — оларды ең жақын қолдаулы тілге аударамыз.
    // Төлем бетінің тілі ғана ауысады; email-дер әлі де клиенттің нақты тілінде жіберіледі (metadata.language арқылы).
    function getStripeLocale(lang) {
      const map = {
        en: 'en',
        kz: 'ru',   // Қазақ тілі жоқ → орыс тіліне (Қазақстанда кең тараған)
        ru: 'ru',
        de: 'de',
        fr: 'fr',
        es: 'es',
        it: 'it',
        tr: 'tr',
        pt: 'pt',
        nl: 'nl',
        pl: 'pl',
        ar: 'en'    // Араб тілі жоқ → ағылшын тіліне
      };
      return map[lang] || 'auto';
    }

    const stripeLocale = getStripeLocale(customer?.language);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: customer?.email,
      shipping_address_collection: {
        allowed_countries: ['DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'PT', 'TR', 'KZ', 'RU', 'GB', 'US', 'AT', 'BE', 'CH', 'SE', 'NO', 'DK', 'FI', 'CZ', 'RO', 'HU', 'GR', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'IE', 'LU', 'MT', 'CY'],
      },
      phone_number_collection: { enabled: true },
      // Stripe Checkout UI-ның тілі — тек Stripe қолдайтын тілдер
      locale: stripeLocale,
      metadata: {
        customer_name: (customer?.name || '').substring(0, 500),
        customer_phone: (customer?.phone || '').substring(0, 500),
        product_ids: productIds,
        user_id: (customer?.user_id || '').substring(0, 500),
        // Түпнұсқа тіл (kz, ar, т.б.) — email үшін сақталады
        language: (customer?.language || '').substring(0, 10),
      },
      success_url: `${req.headers.origin || 'https://www.suntrade.store'}/account.html?success=true&session_id={CHECKOUT_SESSION_ID}#orders`,
      cancel_url: `${req.headers.origin || 'https://www.suntrade.store'}/cart.html`,
    });

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Stripe error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      raw: error.raw
    });
    return res.status(500).json({
      error: error.message || 'Unknown error',
      type: error.type || null
    });
  }
};
