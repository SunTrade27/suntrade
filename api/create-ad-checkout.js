// Stripe Ad Checkout Session - Vercel Serverless Function
// Creates a Stripe Checkout session for advertising payment
// Price: 10,000 KZT ≈ 18 EUR for 1 month
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { applyCors, setSecurityHeaders } = require('../lib/security');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Rate limiting
const adCheckoutRequests = new Map();
function adCheckoutRateLimit(req) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 80);
  const now = Date.now();
  const current = adCheckoutRequests.get(ip);
  if (!current || current.resetAt <= now) {
    adCheckoutRequests.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= 10;
}

module.exports = async (req, res) => {
  setSecurityHeaders(res);
  if (!applyCors(req, res, 'POST, OPTIONS')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!adCheckoutRateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[create-ad-checkout] STRIPE_SECRET_KEY not set');
    return res.status(500).json({ error: 'Payment system not configured' });
  }

  try {
    const { ad_id, ad_title, email, name } = req.body;

    if (!ad_id || !email) {
      return res.status(400).json({ error: 'Missing required fields: ad_id and email' });
    }

    // Verify the ad exists and is not yet active
    const { data: ad, error: adError } = await supabase
      .from('ads')
      .select('id, title, active')
      .eq('id', ad_id)
      .single();

    if (adError || !ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    if (ad.active) {
      return res.status(400).json({ error: 'Ad is already active' });
    }

    const origin = req.headers.origin || 'https://www.suntrade.store';

    // Create Stripe Checkout session
    // 10,000 KZT ≈ 18 EUR
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Жарнама: ' + (ad_title || ad.title || 'SunTrade Ad'),
            description: '1 ай жарнама орналастыру — SunTrade',
            images: []
          },
          unit_amount: 1800  // 18 EUR in cents
        },
        quantity: 1
      }],
      mode: 'payment',
      customer_email: email,
      phone_number_collection: { enabled: false },
      metadata: {
        ad_id: ad_id,
        ad_title: (ad_title || ad.title || '').substring(0, 200),
        advertiser_name: (name || '').substring(0, 200),
        advertiser_email: email.substring(0, 200),
        payment_type: 'advertisement'
      },
      success_url: origin + '/ads.html?payment=success&ad_id=' + ad_id + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/ads.html?payment=cancelled'
    });

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('[create-ad-checkout] Error:', error.message, error.type);
    return res.status(500).json({ error: error.message || 'Payment creation failed' });
  }
};
