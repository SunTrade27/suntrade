// Stripe Save Order - Vercel Serverless Function
// Fallback for when webhook isn't configured or fails
// Saves order from the success page using Stripe session_id
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY is missing in Vercel env');
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY is missing in Vercel env');
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  console.log('[save-order] Incoming sessionId:', sessionId);

  try {
    // Check if order already exists for this session (avoid duplicates)
    const { data: existing, error: existingErr } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existingErr) {
      console.error('❌ Existing order check error:', existingErr);
      return res.status(500).json({ error: 'DB check failed: ' + existingErr.message });
    }

    if (existing) {
      console.log('[save-order] Order already exists:', existing.id);
      return res.status(200).json({ success: true, orderId: existing.id, message: 'Order already exists' });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('[save-order] Stripe session status:', session.payment_status, '| email:', session.customer_email);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed', status: session.payment_status });
    }

    // Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
    console.log('[save-order] Line items count:', lineItems.data?.length || 0);

    // Get shipping address
    const shipping = session.shipping_details?.address || {};
    const shippingName = session.shipping_details?.name || session.metadata?.customer_name || '';
    const customerPhone = session.metadata?.customer_phone || session.customer_details?.phone || '';
    const customerEmail = session.customer_email || session.customer_details?.email || session.metadata?.customer_email || '';

    // user_id және locale metadata-дан
    const userId = session.metadata?.user_id || null;
    const language = mapStripeLocale(session.locale) || session.metadata?.language || null;

    // user_id бос string болса, null-ге ауыстыру (UUID қателігін болдырмау)
    const safeUserId = (userId && userId.length > 0 && userId !== '') ? userId : null;

    // Save order (user_id + locale қосылды — "Менің тапсырыстарым" дұрыс жұмыс істеуі үшін)
    const orderPayload = {
      stripe_session_id: sessionId,
      user_id: safeUserId,
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
      amount: (session.amount_total || 0) / 100,
      currency: (session.currency || 'eur').toUpperCase(),
      status: 'paid',
    };

    console.log('[save-order] Inserting order payload:', JSON.stringify(orderPayload));

    const { data: order, error: orderError } = await supabase.from('orders').insert(orderPayload).select().single();

    if (orderError) {
      console.error('❌ Order insert error:', orderError);
      console.error('❌ Hint: orders кестесінде user_id/locale бағандары жоқ болуы мүмкін. fix-orders-complete.sql орындаңыз.');
      return res.status(500).json({
        error: 'Failed to save order: ' + orderError.message,
        hint: 'Run fix-orders-complete.sql in Supabase SQL Editor',
        code: orderError.code
      });
    }

    console.log('[save-order] ✅ Order saved:', order.id);

    // Save order_items
    if (order && lineItems.data && lineItems.data.length > 0) {
      const metaIds = (session.metadata?.product_ids || '').split(',').filter(Boolean);
      const productIdQty = metaIds.map(entry => {
        const [pid, qty] = entry.split(':');
        return { id: pid, qty: parseInt(qty) || 1 };
      }).filter(p => p.id);

      const orderItems = lineItems.data.map((li, index) => {
        let matchedProductId = null;
        if (productIdQty[index]) {
          matchedProductId = productIdQty[index].id;
        } else if (productIdQty.length === 1) {
          matchedProductId = productIdQty[0].id;
        }
        return {
          order_id: order.id,
          user_id: userId,
          product_id: matchedProductId,
          product_name: li.description || 'Product',
          product_image: '',
          quantity: li.quantity || 1,
          unit_price: (li.price?.unit_amount || 0) / 100
        };
      });

      // Fetch product images and proper names
      const productIds = [...new Set(orderItems.map(oi => oi.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name_en, name_kz, name_ru, images')
          .in('id', productIds);

        if (products) {
          const productMap = {};
          products.forEach(p => { productMap[p.id] = p; });
          orderItems.forEach(oi => {
            if (oi.product_id && productMap[oi.product_id]) {
              const p = productMap[oi.product_id];
              oi.product_name = p.name_en || p.name_kz || p.name_ru || oi.product_name;
              oi.product_image = (p.images && p.images[0]) || '';
            }
          });
        }
      }

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) {
        console.error('Order items insert error:', itemsError);
      }
    }

    // Trigger order confirmation email (multilingual + admin)
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || 'www.suntrade.store';
      const baseUrl = `${protocol}://${host}`;

      await fetch(`${baseUrl}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'order-confirmation', orderId: order.id, language })
      });
    } catch (emailErr) {
      console.error('Failed to trigger confirmation email:', emailErr.message);
    }

    return res.status(200).json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Save order error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
