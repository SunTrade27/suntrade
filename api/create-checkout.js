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

  try {
    const { items, customer } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Create Stripe line items
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100), // Stripe uses cents
      },
      quantity: item.qty,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'ideal', 'bancontact', 'sofort', 'giropay'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: customer?.email,
      shipping_address_collection: {
        allowed_countries: ['DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'PT', 'TR', 'KZ', 'RU', 'GB', 'US', 'AT', 'BE', 'CH', 'SE', 'NO', 'DK', 'FI', 'CZ', 'RO', 'HU', 'GR', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'IE', 'LU', 'MT', 'CY'],
      },
      metadata: {
        customer_name: customer?.name || '',
        customer_phone: customer?.phone || '',
        customer_address: customer?.address || '',
        customer_city: customer?.city || '',
        customer_zip: customer?.zip || '',
        customer_country: customer?.country || '',
      },
      success_url: `${req.headers.origin || 'https://your-domain.vercel.app'}/checkout.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://your-domain.vercel.app'}/cart.html`,
    });

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
};
