// Stripe Checkout Session - Vercel Serverless Function
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const { items, customer } = req.body;

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
