// Vercel Serverless Function: Send review request email
// Uses Gmail SMTP (see api/lib/email.js for env vars)

const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured, SMTP_FROM } = require('./lib/email');

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isConfigured()) {
    console.error('❌ SMTP not configured (SMTP_USER / SMTP_PASS missing in Vercel env vars)');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(name_en, name_kz, name_ru, images)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.customer_email) {
      return res.status(400).json({ error: 'No customer email on file' });
    }

    // Check if we already sent a review request for this order
    const { data: existingRequest } = await supabase
      .from('review_requests')
      .select('id')
      .eq('order_id', orderId)
      .limit(1);

    if (existingRequest && existingRequest.length > 0) {
      return res.status(200).json({ success: true, message: 'Review request already sent' });
    }

    const productName = order.products
      ? (order.products.name_en || order.products.name_kz || order.products.name_ru || 'your product')
      : 'your product';

    const productImage = order.products?.images?.[0] || '';

    const reviewUrl = order.product_id
      ? `${SITE_URL}/product.html?id=${order.product_id}`
      : `${SITE_URL}`;

    // Send email via Gmail SMTP (nodemailer)
    const result = await sendMail({
      to: order.customer_email,
      subject: `How was your ${productName}? Leave a review!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAFAFA; margin: 0; padding: 2rem;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #FF6B00, #E05E00); padding: 2rem; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 1.5rem;">SunTrade</h1>
            </div>
            <div style="padding: 2rem;">
              <h2 style="color: #1A1A2E; margin-bottom: 1rem;">How was your order?</h2>
              <p style="color: #6B7280; line-height: 1.6;">
                Hi ${order.customer_name || 'there'},<br><br>
                Your order of <strong>${productName}</strong> has been delivered! We hope you love it.
              </p>
              ${productImage ? `<div style="text-align: center; margin: 1.5rem 0;"><img src="${productImage}" style="width: 200px; height: 200px; object-fit: cover; border-radius: 12px;"></div>` : ''}
              <p style="color: #6B7280; line-height: 1.6; margin-bottom: 1.5rem;">
                Would you mind taking a moment to share your experience? Your feedback helps other customers and helps us improve!
              </p>
              <div style="text-align: center; margin: 2rem 0;">
                <a href="${reviewUrl}" style="display: inline-block; background: #FF6B00; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 1rem;">Leave a Review</a>
              </div>
              <p style="color: #9CA3AF; font-size: 0.85rem; text-align: center; margin-top: 2rem;">
                Thank you for shopping with SunTrade!
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'Failed to send email: ' + result.error });
    }

    // Record the review request
    await supabase.from('review_requests').insert({
      order_id: orderId,
      customer_email: order.customer_email
    });

    return res.status(200).json({ success: true, message: 'Review request email sent' });
  } catch (err) {
    console.error('Review request error:', err);
    return res.status(500).json({ error: err.message });
  }
};
