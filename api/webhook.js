// Stripe Webhook - Vercel Serverless Function
// This saves completed orders to Supabase
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

async function sendReviewRequestEmail(order, product) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY || !order.customer_email) return;

  // Check if already sent
  const { data: existing } = await supabase
    .from('review_requests')
    .select('id')
    .eq('order_id', order.id)
    .limit(1);
  if (existing && existing.length > 0) return;

  const productName = product?.name_en || product?.name_kz || product?.name_ru || 'your product';
  const productImage = product?.images?.[0] || '';
  const reviewUrl = order.product_id
    ? `${SITE_URL}/product.html?id=${order.product_id}`
    : SITE_URL;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SunTrade <noreply@suntrade.store>',
        to: [order.customer_email],
        subject: `How was your ${productName}? Leave a review!`,
        html: `
          <!DOCTYPE html>
          <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAFA;margin:0;padding:2rem;">
            <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              <div style="background:linear-gradient(135deg,#FF6B00,#E05E00);padding:2rem;text-align:center;">
                <h1 style="color:white;margin:0;font-size:1.5rem;">SunTrade</h1>
              </div>
              <div style="padding:2rem;">
                <h2 style="color:#1A1A2E;margin-bottom:1rem;">How was your order?</h2>
                <p style="color:#6B7280;line-height:1.6;">Hi ${order.customer_name || 'there'},<br><br>Your order of <strong>${productName}</strong> has been delivered! We hope you love it.</p>
                ${productImage ? `<div style="text-align:center;margin:1.5rem 0;"><img src="${productImage}" style="width:200px;height:200px;object-fit:cover;border-radius:12px;"></div>` : ''}
                <p style="color:#6B7280;line-height:1.6;margin-bottom:1.5rem;">Would you mind taking a moment to share your experience? Your feedback helps other customers!</p>
                <div style="text-align:center;margin:2rem 0;">
                  <a href="${reviewUrl}" style="display:inline-block;background:#FF6B00;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Leave a Review</a>
                </div>
                <p style="color:#9CA3AF;font-size:0.85rem;text-align:center;">Thank you for shopping with SunTrade!</p>
              </div>
            </div>
          </body></html>
        `
      })
    });

    await supabase.from('review_requests').insert({
      order_id: order.id,
      customer_email: order.customer_email
    });

    console.log('Review request sent for order:', order.id);
  } catch (err) {
    console.error('Review request email error:', err);
  }
}

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
      const { data: order } = await supabase.from('orders').insert({
        stripe_session_id: session.id,
        customer_email: session.customer_email || session.metadata?.customer_email,
        customer_name: session.metadata?.customer_name,
        customer_phone: session.metadata?.customer_phone,
        shipping_address: JSON.stringify(session.shipping_details || {}),
        amount: session.amount_total / 100,
        currency: session.currency?.toUpperCase() || 'EUR',
        status: 'paid',
        product_id: session.metadata?.product_id || null,
      }).select().single();

      console.log('Order saved:', session.id);

      // Auto-send review request after a delay for delivered orders
      // In production, you'd trigger this when shipping confirms delivery
      // For now, it's triggered manually from admin panel
    } catch (err) {
      console.error('Error saving order:', err);
    }
  }

  return res.status(200).json({ received: true });
};
