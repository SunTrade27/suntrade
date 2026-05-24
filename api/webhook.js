// Stripe Webhook - Vercel Serverless Function
// This saves completed orders to Supabase
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Get line items
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const item = lineItems.data[0];

      // Save order to Supabase
      await supabase.from('orders').insert({
        stripe_session_id: session.id,
        customer_email: session.customer_email || session.metadata?.customer_email,
        customer_name: session.metadata?.customer_name,
        customer_phone: session.metadata?.customer_phone,
        shipping_address: JSON.stringify(session.shipping_details || {}),
        amount: session.amount_total / 100,
        currency: session.currency?.toUpperCase() || 'EUR',
        status: 'paid',
        product_id: session.metadata?.product_id || null,
      });

      console.log('Order saved:', session.id);
    } catch (err) {
      console.error('Error saving order:', err);
    }
  }

  return res.status(200).json({ received: true });
};
