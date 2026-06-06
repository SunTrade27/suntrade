// Stripe Webhook - Vercel Serverless Function
// This saves completed orders to Supabase
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured } = require('./lib/email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

// Stripe locale → біздің ISO кодымыз
function mapStripeLocale(locale) {
  if (!locale) return null;
  const l = locale.toLowerCase();
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('kk') || l.startsWith('kz')) return 'kz';
  if (l.startsWith('ru')) return 'ru';
  if (l.startsWith('de')) return 'de';
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('it')) return 'it';
  if (l.startsWith('tr')) return 'tr';
  if (l.startsWith('pt')) return 'pt';
  if (l.startsWith('nl')) return 'nl';
  if (l.startsWith('pl')) return 'pl';
  if (l.startsWith('ar')) return 'ar';
  return null;
}

async function sendReviewRequestEmail(order, product) {
  if (!isConfigured() || !order.customer_email) return;

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
    await sendMail({
      to: order.customer_email,
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

  // Get raw body for signature verification
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
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

      // Retrieve shipping address from Stripe
      const shipping = session.shipping_details?.address || {};
      const shippingName = session.shipping_details?.name || session.metadata?.customer_name || '';
      const customerPhone = session.metadata?.customer_phone || session.customer_details?.phone || '';
      const customerEmail = session.customer_email || session.metadata?.customer_email;

      // user_id және locale metadata-дан
      const userId = session.metadata?.user_id || null;
      const language = mapStripeLocale(session.locale) || session.metadata?.language || null;

      // Save order to Supabase
      const { data: order } = await supabase.from('orders').insert({
        stripe_session_id: session.id,
        user_id: userId,
        locale: language,
        customer_email: customerEmail,
        customer_name: shippingName,
        customer_phone: customerPhone,
        shipping_name: shippingName,
        shipping_address_line1: shipping.line1 || '',
        shipping_address_line2: shipping.line2 || '',
        shipping_city: shipping.city || '',
        shipping_postal_code: shipping.postal_code || '',
        shipping_country: shipping.country || '',
        amount: session.amount_total / 100,
        currency: session.currency?.toUpperCase() || 'EUR',
        status: 'paid',
      }).select().single();

      console.log('Order saved:', session.id, 'user_id:', userId, 'lang:', language);

      // Save order_items
      if (order && lineItems.data && lineItems.data.length > 0) {
        const metaIds = (session.metadata?.product_ids || '').split(',').filter(Boolean);
        const productIdQty = metaIds.map(entry => {
          const [pid, qty] = entry.split(':');
          return { id: pid, qty: parseInt(qty) || 1 };
        }).filter(p => p.id);

        const orderItems = lineItems.data.map((li, index) => {
          let matchedProductId = null;
          let productImage = '';
          let productName = li.description || 'Product';

          if (productIdQty[index]) {
            matchedProductId = productIdQty[index].id;
          } else if (productIdQty.length === 1) {
            matchedProductId = productIdQty[0].id;
          }

          return {
            order_id: order.id,
            user_id: userId,
            product_id: matchedProductId,
            product_name: productName,
            product_image: productImage,
            quantity: li.quantity || 1,
            unit_price: (li.price?.unit_amount || 0) / 100
          };
        });

        // Fetch product images and proper names from our database
        const productIds = [...new Set(orderItems.map(oi => oi.product_id).filter(Boolean))];
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, name_en, name_kz, name_ru, images')
            .in('id', productIds);

          if (products) {
            const productMap = {};
            products.forEach(p => {
              productMap[p.id] = p;
            });

            orderItems.forEach(oi => {
              if (oi.product_id && productMap[oi.product_id]) {
                const p = productMap[oi.product_id];
                oi.product_name = p.name_en || p.name_kz || p.name_ru || oi.product_name;
                oi.product_image = (p.images && p.images[0]) || '';
              }
            });
          }
        }

        await supabase.from('order_items').insert(orderItems);
        console.log('Order items saved:', orderItems.length, 'items for order:', order.id);
      }

      // Send order confirmation email (multilingual + admin)
      if (order && customerEmail) {
        try {
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const host = req.headers.host || process.env.SITE_URL?.replace('https://', '') || 'www.suntrade.store';
          const baseUrl = `${protocol}://${host}`;

          await fetch(`${baseUrl}/api/send-order-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id, language })
          });
          console.log('Order confirmation email triggered for:', order.id, 'lang:', language);
        } catch (emailErr) {
          console.error('Failed to send confirmation email:', emailErr.message);
        }
      }
    } catch (err) {
      console.error('Error saving order:', err);
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
