// Stripe Checkout Session - Vercel Serverless Function
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { applyCors, setSecurityHeaders } = require('../lib/security');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);
const checkoutRequests = new Map();

function checkoutRateLimit(req) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 80);
  const now = Date.now();
  const current = checkoutRequests.get(ip);
  if (!current || current.resetAt <= now) {
    checkoutRequests.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= 20;
}

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
    if (process.env.NODE_ENV === 'production') {
      console.error('[create-checkout] TURNSTILE_SECRET_KEY is required in production');
      return { success: false, 'error-codes': ['server-misconfigured'] };
    }
    console.warn('[create-checkout] TURNSTILE_SECRET_KEY not set — skipping bot verification (DEV ONLY)');
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
  setSecurityHeaders(res);
  if (!applyCors(req, res, 'POST, OPTIONS')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!checkoutRateLimit(req)) {
    return res.status(429).json({ error: 'Too many checkout attempts. Please try again later.' });
  }

  // Check if Stripe key is configured
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set in environment variables');
    return res.status(500).json({
      error: 'Server configuration error: STRIPE_SECRET_KEY is missing. Please add it in Vercel Dashboard → Settings → Environment Variables.'
    });
  }

  try {
    const { items, customer, turnstileToken, turnstile_token, action } = req.body;

    // ===== Ad Checkout (merged from create-ad-checkout.js) =====
    if (action === 'ad_checkout') {
      const { ad_id, ad_title, email, name } = req.body;
      if (!ad_id || !email) {
        return res.status(400).json({ error: 'Missing required fields: ad_id and email' });
      }
      const { data: ad, error: adError } = await supabase
        .from('ads').select('id, title, active').eq('id', ad_id).single();
      if (adError || !ad) return res.status(404).json({ error: 'Ad not found' });
      if (ad.active) return res.status(400).json({ error: 'Ad is already active' });
      const origin = req.headers.origin || 'https://www.suntrade.store';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: 'Ad: ' + (ad_title || ad.title || 'SunTrade Ad'), description: '1 month ad placement — SunTrade', images: [] },
            unit_amount: 1800
          },
          quantity: 1
        }],
        mode: 'payment',
        customer_email: email,
        metadata: { ad_id, ad_title: (ad_title || '').substring(0, 200), advertiser_name: (name || '').substring(0, 200), advertiser_email: email.substring(0, 200), payment_type: 'advertisement' },
        success_url: origin + '/ads.html?payment=success&ad_id=' + ad_id + '&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: origin + '/ads.html?payment=cancelled'
      });
      return res.status(200).json({ url: session.url, session_id: session.id });
    }

    // ===== Product Checkout =====

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

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'Invalid cart items' });
    }

    // Never trust name, image, price, or discount values from localStorage.
    // The browser cart is user-controlled. Rebuild every Stripe line item from
    // the active product row in Supabase, then apply the same volume discount
    // rules on the server.
    const requestedItems = items.map(item => ({
      id: String(item?.id || item?.productId || '').trim(),
      qty: Number.parseInt(item?.qty, 10),
      variantParts: Array.isArray(item?.variantParts)
        ? item.variantParts.map(part => ({
            group: String(part?.group || '').trim().slice(0, 120),
            value: String(part?.value || '').trim().slice(0, 120)
          })).filter(part => part.value).slice(0, 20)
        : []
    })).filter(item => item.id && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 10000);

    if (requestedItems.length !== items.length || requestedItems.length === 0) {
      return res.status(400).json({ error: 'Invalid cart items' });
    }

    const ids = [...new Set(requestedItems.map(item => item.id))];
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name_en, name_kz, name_ru, name_de, name_fr, name_es, name_it, name_tr, name_pt, name_nl, name_pl, name_ar, images, price, stock, active, types, option_groups, type, type2, type3, type4, type5')
      .in('id', ids);

    if (productError) throw productError;
    const productMap = new Map((products || []).map(product => [String(product.id), product]));
    const requestedByVariant = new Map();
    for (const item of requestedItems) {
      const variantKey = `${item.id}:${JSON.stringify(item.variantParts)}`;
      const current = requestedByVariant.get(variantKey);
      if (current) current.qty += item.qty;
      else requestedByVariant.set(variantKey, { ...item });
    }

    const language = String(customer?.language || 'en').toLowerCase();
    const lineItems = [];
    for (const item of requestedByVariant.values()) {
      const { id, qty, variantParts } = item;
      const product = productMap.get(id);
      if (!product || product.active !== true) {
        return res.status(400).json({ error: 'One or more products are no longer available' });
      }
      if (!Number.isFinite(Number(product.stock)) || qty > Number(product.stock)) {
        return res.status(400).json({ error: 'Requested quantity is unavailable' });
      }
      const basePrice = Number(product.price);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return res.status(400).json({ error: 'Product price is invalid' });
      }

      // Resolve the selected variant from trusted product JSON. Client labels
      // are only selectors; their price/image/name are never accepted.
      let variantPrice = basePrice;
      let availableStock = Number(product.stock);
      const typePart = variantParts.find(part => !part.group);
      if (typePart?.value) {
        const types = Array.isArray(product.types) ? product.types : [];
        const matchedType = types.find(type => String(type?.label || '').trim() === typePart.value);
        if (matchedType) {
          const typePrice = Number(matchedType.price);
          const typeStock = Number(matchedType.stock);
          if (!Number.isFinite(typePrice) || typePrice <= 0) {
            return res.status(400).json({ error: 'Product variant price is invalid' });
          }
          if (Number.isFinite(typeStock) && typeStock >= 0) availableStock = typeStock;
          variantPrice = typePrice;
        } else {
          const legacyTypes = [product.type, product.type2, product.type3, product.type4, product.type5]
            .map(value => String(value || '').trim());
          if (!legacyTypes.includes(typePart.value)) {
            return res.status(400).json({ error: 'Invalid product variant' });
          }
        }
      }
      if (!Number.isFinite(availableStock) || availableStock < 0 || qty > availableStock) {
        return res.status(400).json({ error: 'Requested variant quantity is unavailable' });
      }

      for (const part of variantParts.filter(itemPart => itemPart.group)) {
        const group = Array.isArray(product.option_groups)
          ? product.option_groups.find(optionGroup => String(optionGroup?.name || '').trim() === part.group)
          : null;
        const option = group && Array.isArray(group.options)
          ? group.options.find(value => String(value?.label || '').trim() === part.value)
          : null;
        if (!option) return res.status(400).json({ error: 'Invalid product option' });
        const modifier = Number(option.price_mod || 0);
        if (!Number.isFinite(modifier)) return res.status(400).json({ error: 'Invalid product option price' });
        variantPrice += modifier;
      }

      // Permanent volume discounts, matching the product page tiers:
      // 10% on a single item, 20% for 2-4 pieces, 30% for 5+ pieces.
      const discount = qty >= 5 ? 0.7 : qty >= 2 ? 0.8 : 0.9;
      const unitPrice = Math.round(variantPrice * discount * 100);
      const localizedName = product['name_' + language] || product.name_en || product.name_ru || 'Product';
      const image = Array.isArray(product.images) && /^https?:\/\//i.test(String(product.images[0] || ''))
        ? String(product.images[0]).substring(0, 2000)
        : '';
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: String(localizedName).substring(0, 250), images: image ? [image] : [] },
          unit_amount: unitPrice
        },
        quantity: qty
      });
    }

    // Store all product IDs and quantities in metadata (so webhook can save order_items)
    // Stripe metadata has a 500 char limit per key, so truncate if needed
    let productIds = Array.from(requestedByVariant.values(), item => `${item.id}:${item.qty}`).join(',');
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
