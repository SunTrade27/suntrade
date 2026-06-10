// Vercel Serverless Function: Send order status update emails
// - Customer email (multilingual) on order status change
// - Admin notification on new orders
// Uses Gmail SMTP via api/lib/email.js

const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured, ADMIN_EMAIL, ORDER_NOTIFICATION_EMAIL } = require('./lib/email');

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

// ============================================================
// КӨП ТІЛДЕГІ ХАБАРЛАМАЛАР
// ============================================================
const STATUS_TRANSLATIONS = {
  pending:   { en: 'Order Placed',  kz: 'Тапсырыс берілді',     ru: 'Заказ оформлен',     icon: 'clock' },
  accepted:  { en: 'Accepted',      kz: 'Қабылданды',           ru: 'Принят в работу',    icon: 'check' },
  packing:   { en: 'Packing',       kz: 'Жиналуда',             ru: 'Упаковывается',      icon: 'package' },
  shipped:   { en: 'Shipped',       kz: 'Жолға шықты',          ru: 'В пути',             icon: 'truck' },
  delivered: { en: 'Delivered',     kz: 'Жеткізілді',           ru: 'Доставлен',          icon: 'check-circle' }
};

const TRANSLATIONS = {
  en: {
    subject: (s) => `📦 Order Update: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => {
      const map = {
        pending:   'Your order has been placed successfully!',
        accepted:  'Great news! Your order has been accepted and is being prepared.',
        packing:   'Your order is being packed with care.',
        shipped:   'Your order is on its way! Track it soon.',
        delivered: '🎉 Your order has been delivered! We hope you enjoy your purchase. Please leave a review to help other customers.'
      };
      return map[s] || `Order status updated: ${s}`;
    }
  },
  kz: {
    subject: (s) => `📦 Тапсырыс жаңартылды: ${STATUS_TRANSLATIONS[s]?.kz || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.kz || s,
    intro: (s) => {
      const map = {
        pending:   'Сіздің тапсырысыңыз сәтті қабылданды!',
        accepted:  'Жақсы жаңалық! Сіздің тапсырысыңыз қабылданып, дайындалуда.',
        packing:   'Сіздің тапсырысыңыз мұқият жиналуда.',
        shipped:   'Сіздің тапсырысыңыз жолға шықты! Жақында трек-номер аласыз.',
        delivered: '🎉 Сіздің тапсырысыңыз жеткізілді! Тауарыңызды ұнатады деп үміттенеміз. Басқа клиенттерге көмектесу үшін пікір қалдырыңыз.'
      };
      return map[s] || `Тапсырыс статусы жаңартылды: ${s}`;
    }
  },
  ru: {
    subject: (s) => `📦 Заказ обновлён: ${STATUS_TRANSLATIONS[s]?.ru || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.ru || s,
    intro: (s) => {
      const map = {
        pending:   'Ваш заказ успешно оформлен!',
        accepted:  'Отличные новости! Ваш заказ принят и готовится.',
        packing:   'Ваш заказ аккуратно упаковывается.',
        shipped:   'Ваш заказ в пути! Скоро мы пришлём трек-номер.',
        delivered: '🎉 Ваш заказ доставлен! Надеемся, вам понравится покупка. Пожалуйста, оставьте отзыв — это поможет другим клиентам.'
      };
      return map[s] || `Статус заказа обновлён: ${s}`;
    }
  },
  de: {
    subject: (s) => `📦 Bestellupdate: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Ihre Bestellung wurde aktualisiert: ${s}`
  },
  fr: {
    subject: (s) => `📦 Mise à jour: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Votre commande a été mise à jour: ${s}`
  },
  es: {
    subject: (s) => `📦 Actualización: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Tu pedido ha sido actualizado: ${s}`
  },
  it: {
    subject: (s) => `📦 Aggiornamento: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Il tuo ordine è stato aggiornato: ${s}`
  },
  tr: {
    subject: (s) => `📦 Güncelleme: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Siparişiniz güncellendi: ${s}`
  },
  pt: {
    subject: (s) => `📦 Atualização: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Seu pedido foi atualizado: ${s}`
  },
  nl: {
    subject: (s) => `📦 Update: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Uw bestelling is bijgewerkt: ${s}`
  },
  pl: {
    subject: (s) => `📦 Aktualizacja: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `Twoje zamówienie zostało zaktualizowane: ${s}`
  },
  ar: {
    subject: (s) => `📦 تحديث: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => `تم تحديث طلبك: ${s}`
  }
};

// ============================================================
// EMAIL ШАБЛОНДАРЫ (HTML)
// ============================================================
function buildCustomerEmail(order, status, language) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const statusInfo = STATUS_TRANSLATIONS[status] || { en: status, kz: status, ru: status };
  const statusTitle = typeof t.title === 'function' ? t.title(status) : statusInfo.en;
  const statusIntro = typeof t.intro === 'function' ? t.intro(status) : '';

  const colors = {
    pending:   '#F59E0B',
    accepted:  '#3B82F6',
    packing:   '#8B5CF6',
    shipped:   '#06B6D4',
    delivered: '#22C55E'
  };
  const color = colors[status] || '#3B82F6';

  // Delivered статусында — әр тауар үшін пікір қалдыру батырмасы
  const reviewButtonsHtml = status === 'delivered' ? `
    <div style="background:#FEF3C7;border-radius:12px;padding:20px;margin:24px 0;">
      <p style="margin:0 0 16px;color:#92400E;font-size:15px;text-align:center;font-weight:600;">⭐ Enjoyed your order? Leave a review to help other customers!</p>
      ${(order.order_items || []).filter(item => item.product_id).map(item => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
          <tr>
            <td style="padding:10px 12px;background:#FFFFFF;border-radius:8px;border:1px solid #FDE68A;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;color:#1A1A2E;font-size:14px;font-weight:600;">${item.product_name || 'Product'}</p>
                  </td>
                  <td align="right" style="vertical-align:middle;width:140px;">
                    <a href="${SITE_URL}/review.html?product=${item.product_id}&order=${order.id}" style="display:inline-block;background:#FF6B00;color:#FFFFFF;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Leave a Review</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `).join('')}
    </div>
  ` : '';

  return {
    subject: typeof t.subject === 'function' ? t.subject(status) : `Order Update: ${statusTitle}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F3F4F6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="background:linear-gradient(135deg,#F59E0B 0%,#FB923C 100%);padding:32px 24px;text-align:center;">
    <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:700;">SunTrade</h1>
    <p style="margin:8px 0 0;color:#FFFFFF;opacity:0.95;font-size:14px;">${statusTitle}</p>
  </td></tr>
  <tr><td style="padding:32px 24px;">
    <h2 style="margin:0 0 16px;color:#1A1A2E;font-size:22px;">${statusIntro}</h2>
    <div style="background:${color}15;border-left:4px solid ${color};padding:16px;border-radius:8px;margin:24px 0;">
      <p style="margin:0;color:#374151;font-size:14px;"><strong>Order ID:</strong> ${order.id.substring(0, 8).toUpperCase()}</p>
      <p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Status:</strong> ${statusTitle}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
      <thead><tr style="background:#F9FAFB;">
        <th style="padding:12px;text-align:left;color:#6B7280;font-size:13px;font-weight:600;">Product</th>
        <th style="padding:12px;text-align:center;color:#6B7280;font-size:13px;font-weight:600;">Qty</th>
        <th style="padding:12px;text-align:right;color:#6B7280;font-size:13px;font-weight:600;">Price</th>
      </tr></thead>
      <tbody>
        ${(order.order_items || []).map(item => `
        <tr style="border-bottom:1px solid #F3F4F6;">
          <td style="padding:12px;color:#1A1A2E;font-size:14px;">${item.product_name || 'Product'}</td>
          <td style="padding:12px;text-align:center;color:#6B7280;font-size:14px;">${item.quantity}</td>
          <td style="padding:12px;text-align:right;color:#1A1A2E;font-size:14px;font-weight:600;">€${parseFloat(item.unit_price || 0).toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td align="center">
        <a href="${SITE_URL}/account.html#orders" style="display:inline-block;background:${color};color:#FFFFFF;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View My Orders</a>
      </td></tr>
    </table>
    ${reviewButtonsHtml}
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:24px;text-align:center;">
    <p style="margin:0;color:#6B7280;font-size:13px;">SunTrade — Quality products, fast delivery</p>
    <p style="margin:8px 0 0;color:#9CA3AF;font-size:12px;">If you have questions, contact us at ${ADMIN_EMAIL}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
  };
}

function buildAdminEmail(order, status) {
  const statusEmoji = {
    pending: '🆕', accepted: '✅', packing: '📦', shipped: '🚚', delivered: '🎉'
  };
  return {
    subject: `${statusEmoji[status] || '📋'} Order ${status.toUpperCase()} — ${order.id.substring(0, 8).toUpperCase()}`,
    html: `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;">
<h2>Order Status Update</h2>
<p><strong>Status:</strong> ${statusEmoji[status] || ''} ${status.toUpperCase()}</p>
<p><strong>Order ID:</strong> ${order.id}</p>
<p><strong>Customer:</strong> ${order.customer_name || 'N/A'} (${order.customer_email || 'no email'})</p>
<p><strong>Phone:</strong> ${order.customer_phone || 'N/A'}</p>
<p><strong>Amount:</strong> €${parseFloat(order.amount || 0).toFixed(2)} ${order.currency || 'EUR'}</p>
<p><strong>Shipping:</strong> ${order.shipping_address_line1 || ''}, ${order.shipping_city || ''}, ${order.shipping_country || ''}</p>
<p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
<hr>
<h3>Items:</h3>
<ul>
  ${(order.order_items || []).map(item => `<li>${item.product_name} × ${item.quantity} — €${parseFloat(item.unit_price || 0).toFixed(2)}</li>`).join('')}
</ul>
<hr>
<p><a href="${SITE_URL}/admin.html#orders">View in admin panel →</a></p>
</body></html>`
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isConfigured()) {
    console.error('❌ SMTP not configured (SMTP_USER / SMTP_PASS missing in Vercel env vars)');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { orderId, status, language } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({ error: 'orderId and status required' });
  }

  try {
    // 1) Тапсырысты DB-дан алу
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error('❌ Order not found:', orderErr);
      return res.status(404).json({ error: 'Order not found' });
    }

    const lang = language || order.locale || 'en';
    const results = { customer: null, admin: null };

    // 2) Клиентке email жіберу (статус өзгергенде)
    if (order.customer_email) {
      const email = buildCustomerEmail(order, status, lang);
      results.customer = await sendMail({
        to: order.customer_email,
        subject: email.subject,
        html: email.html,
        replyTo: ADMIN_EMAIL
      });
    }

    // 3) Админге email жіберу (ADMIN_EMAIL + ORDER_NOTIFICATION_EMAIL)
    const adminEmail = buildAdminEmail(order, status);
    const adminRecipients = [ADMIN_EMAIL];
    if (ORDER_NOTIFICATION_EMAIL && ORDER_NOTIFICATION_EMAIL !== ADMIN_EMAIL) {
      adminRecipients.push(ORDER_NOTIFICATION_EMAIL);
    }
    results.admin = await sendMail({
      to: adminRecipients,
      subject: adminEmail.subject,
      html: adminEmail.html,
      replyTo: order.customer_email || undefined
    });

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('❌ Status email error:', err);
    return res.status(500).json({ error: err.message });
  }
};
