// Stripe Webhook - Vercel Serverless Function
// Saves orders, sends Telegram alert + email confirmation
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured } = require('./lib/email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

// ===== Telegram Alert =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramAlert(order, items) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const name = order.customer_name || 'Unknown';
    const amount = parseFloat(order.amount).toFixed(2);
    const phone = order.customer_phone || '';
    const city = order.shipping_city || '';
    const country = order.shipping_country || '';
    const email = order.customer_email || '';

    // Build product lines
    let productLines = '';
    let totalItems = 0;
    if (items && items.length > 0) {
      productLines = '\n' + items.map(item => {
        const pName = item.product_name || 'Product';
        const pQty = item.quantity || 1;
        const pPrice = parseFloat(item.unit_price || 0).toFixed(2);
        totalItems += pQty;
        return '\u{1F4E6} ' + pName + ' \u2014 ' + pQty + ' x \u20AC' + pPrice;
      }).join('\n');
    }

    const msg = [
      '\u{1F6D2} <b>NEW ORDER!</b>',
      '',
      '\u{1F4B0} <b>Total: \u20AC' + amount + '</b>',
      '\u{1F4E6} Items: <b>' + totalItems + ' pcs</b>',
      productLines,
      '',
      '\u{1F464} ' + name,
      email ? '\u{1F4E7} ' + email : '',
      phone ? '\u{1F4DE} ' + phone : '',
      (city || country) ? '\u{1F4CD} ' + [city, country].filter(Boolean).join(', ') : '',
      '',
      '<a href="' + SITE_URL + '/admin.html">\u{1F4CB} Admin Panel</a>'
    ].filter(function(l) { return l !== ''; }).join('\n');

    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    console.log('Telegram alert sent for order:', order.id);
  } catch (err) {
    console.error('Telegram alert error:', err.message);
  }
}

function mapStripeLocale(locale) {
  if (!locale) return null;
  var l = locale.toLowerCase();
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

  var existingRes = await supabase
    .from('review_requests')
    .select('id')
    .eq('order_id', order.id)
    .limit(1);
  var existing = existingRes.data;
  if (existing && existing.length > 0) return;

  var productName = (product && product.name_en) || (product && product.name_kz) || (product && product.name_ru) || 'your product';
  var productImage = (product && product.images && product.images[0]) || '';

  var productId = order.product_id || null;
  if (!productId) {
    var itemsRes = await supabase
      .from('order_items')
      .select('product_id')
      .eq('order_id', order.id)
      .limit(1);
    var items = itemsRes.data;
    if (items && items.length > 0 && items[0].product_id) {
      productId = items[0].product_id;
    }
  }

  var reviewUrl = productId
    ? SITE_URL + '/review.html?product=' + productId + '&order=' + order.id
    : SITE_URL;

  try {
    await sendMail({
      to: order.customer_email,
      subject: 'How was your ' + productName + '? Leave a review!',
      html: '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#FAFAFA;margin:0;padding:2rem;"><div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;"><div style="background:linear-gradient(135deg,#FF6B00,#E05E00);padding:2rem;text-align:center;"><h1 style="color:white;margin:0;">SunTrade</h1></div><div style="padding:2rem;"><h2>How was your order?</h2><p>Hi ' + (order.customer_name || 'there') + ',</p><p>Your order of <strong>' + productName + '</strong> has been delivered!</p>' + (productImage ? '<div style="text-align:center;margin:1rem 0;"><img src="' + productImage + '" style="width:200px;height:200px;object-fit:cover;border-radius:12px;"></div>' : '') + '<p>Share your experience!</p><div style="text-align:center;margin:2rem 0;"><a href="' + reviewUrl + '" style="display:inline-block;background:#FF6B00;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Leave a Review</a></div></div></div></body></html>'
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

  var chunks = [];
  for await (var chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  var rawBody = Buffer.concat(chunks).toString('utf8');

  var sig = req.headers['stripe-signature'];
  var event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    var session = event.data.object;

    try {
      var lineItems = await stripe.checkout.sessions.listLineItems(session.id);

      var shipping = (session.shipping_details && session.shipping_details.address) || {};
      var shippingName = (session.shipping_details && session.shipping_details.name) || (session.metadata && session.metadata.customer_name) || '';
      var customerPhone = (session.metadata && session.metadata.customer_phone) || (session.customer_details && session.customer_details.phone) || '';
      var customerEmail = session.customer_email || (session.metadata && session.metadata.customer_email);

      var userId = (session.metadata && session.metadata.user_id) || null;
      var language = mapStripeLocale(session.locale) || (session.metadata && session.metadata.language) || null;

      var orderRes = await supabase.from('orders').insert({
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
        currency: (session.currency || 'EUR').toUpperCase(),
        status: 'paid',
      }).select().single();
      var order = orderRes.data;

      console.log('Order saved:', session.id, 'user_id:', userId, 'lang:', language);

      // Save order_items
      var savedOrderItems = [];

      if (order && lineItems.data && lineItems.data.length > 0) {
        var metaIds = ((session.metadata && session.metadata.product_ids) || '').split(',').filter(Boolean);
        var productIdQty = metaIds.map(function (entry) {
          var parts = entry.split(':');
          return { id: parts[0], qty: parseInt(parts[1]) || 1 };
        }).filter(function (p) { return p.id; });

        var orderItems = lineItems.data.map(function (li, index) {
          var matchedProductId = null;
          var productName = li.description || 'Product';

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
            product_image: '',
            quantity: li.quantity || 1,
            unit_price: ((li.price && li.price.unit_amount) || 0) / 100
          };
        });

        // Fetch real product names from database
        var productIds = Array.from(new Set(orderItems.map(function (oi) { return oi.product_id; }).filter(Boolean)));
        if (productIds.length > 0) {
          var productsRes = await supabase
            .from('products')
            .select('id, name_en, name_kz, name_ru, images')
            .in('id', productIds);
          var products = productsRes.data;

          if (products) {
            var productMap = {};
            products.forEach(function (p) {
              productMap[p.id] = p;
            });

            orderItems.forEach(function (oi) {
              if (oi.product_id && productMap[oi.product_id]) {
                var p = productMap[oi.product_id];
                oi.product_name = p.name_en || p.name_kz || p.name_ru || oi.product_name;
                oi.product_image = (p.images && p.images[0]) || '';
              }
            });
          }
        }

        await supabase.from('order_items').insert(orderItems);
        savedOrderItems = orderItems;
        console.log('Order items saved:', orderItems.length, 'items for order:', order.id);
      }

      // Telegram alert WITH product details (after items are saved)
      sendTelegramAlert(order, savedOrderItems).catch(function (err) {
        console.error('Telegram fail:', err);
      });

      // Send order confirmation email
      if (order && customerEmail) {
        try {
          var protocol = req.headers['x-forwarded-proto'] || 'https';
          var host = req.headers.host || (process.env.SITE_URL || '').replace('https://', '') || 'www.suntrade.store';
          var baseUrl = protocol + '://' + host;

          await fetch(baseUrl + '/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'order-confirmation', orderId: order.id, language: language })
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
