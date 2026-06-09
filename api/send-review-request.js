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

    // Get order details with order_items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
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

    // Get product_id from order_items (first item) or from order.product_id
    const firstItem = order.order_items && order.order_items[0];
    const productId = firstItem ? firstItem.product_id : (order.product_id || null);

    // Fetch product details
    let productName = 'your product';
    let productPrice = '';
    let productImage = '';

    if (firstItem) {
      productName = firstItem.product_name || 'your product';
      productImage = firstItem.product_image || '';
      productPrice = firstItem.unit_price ? parseFloat(firstItem.unit_price).toFixed(2) : '';
    }

    // Try to get more product details from products table
    if (productId) {
      const { data: product } = await supabase
        .from('products')
        .select('name_en, name_kz, name_ru, images, price')
        .eq('id', productId)
        .single();

      if (product) {
        productName = product.name_en || product.name_kz || product.name_ru || productName;
        productImage = (product.images && product.images[0]) || productImage;
        productPrice = product.price ? parseFloat(product.price).toFixed(2) : productPrice;
      }
    }

    const reviewUrl = productId
      ? `${SITE_URL}/review.html?product=${productId}&order=${orderId}`
      : `${SITE_URL}`;

    // Product page link
    const productUrl = productId
      ? `${SITE_URL}/product.html?id=${productId}`
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
          <style>
            @media (max-width: 480px) {
              .email-body { padding: 1rem !important; }
              .product-img { width: 100% !important; max-width: 280px !important; }
              .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; }
            }
          </style>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAFAFA; margin: 0; padding: 2rem;">
          <div class="email-body" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Product Image Hero -->
            ${productImage ? `
            <div style="text-align: center; padding: 2rem 2rem 0;">
              <a href="${productUrl}" target="_blank">
                <img class="product-img" src="${productImage}" alt="${productName}" style="width: 100%; max-width: 320px; height: auto; border-radius: 16px; object-fit: cover; box-shadow: 0 8px 24px rgba(0,0,0,0.1);">
              </a>
            </div>
            ` : `
            <div style="background: linear-gradient(135deg, #1A1A2E, #16213E); padding: 2rem; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 1.5rem;">SunTrade</h1>
            </div>
            `}

            <!-- Product Info -->
            <div style="padding: 1.5rem 2rem 2rem; text-align: center;">
              <h2 style="color: #1A1A2E; margin: 0 0 0.25rem; font-size: 1.3rem;">${productName}</h2>
              ${productPrice ? `<div style="font-size: 1.6rem; font-weight: 800; color: #FF6B00; margin-bottom: 1.5rem;">€${productPrice}</div>` : ''}
              
              <p style="color: #6B7280; line-height: 1.6; margin-bottom: 1.5rem;">
                Hi ${order.customer_name || 'there'},<br><br>
                Your <strong>${productName}</strong> has been delivered! We hope you love it.<br>
                Please take a moment to share your experience — your feedback helps other customers make better choices!
              </p>

              <!-- Review Button -->
              <div style="text-align: center; margin: 1.5rem 0;">
                <a class="btn" href="${reviewUrl}" style="display: inline-block; background: #FF6B00; color: white; padding: 15px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 1.05rem;">
                  ⭐ Leave a Review
                </a>
              </div>

              <!-- Product Link -->
              <p style="margin-top: 1.5rem;">
                <a href="${productUrl}" style="color: #FF6B00; font-size: 0.9rem; text-decoration: none;">
                  View product details →
                </a>
              </p>

              <p style="color: #9CA3AF; font-size: 0.85rem; margin-top: 2rem; border-top: 1px solid #F3F4F6; padding-top: 1.5rem;">
                Thank you for shopping with <strong>SunTrade</strong>!
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
