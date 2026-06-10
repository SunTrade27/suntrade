// ============================================================
// БІРІКТІРІЛГЕН EMAIL API
// POST /api/email?action=... немесе body-да { action: ... }
//
// Actions:
//   notify-review       — админге жаңа пікір туралы хабарлама
//   order-confirmation  — клиентке тапсырыс растау email
//   status-update       — тапсырыс статусы өзгергенде email
//   review-request      — клиентке пікір сұрау email
//   test                — email тексеру (GET)
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured, ADMIN_EMAIL, ORDER_NOTIFICATION_EMAIL, SMTP_FROM } = require('./lib/email');

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// ЖАЛПЫ КӨМЕКШІ ФУНКЦИЯЛАР
// ============================================================
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ============================================================
// NOTIFY REVIEW — админге жаңа пікір туралы хабарлама
// ============================================================
async function handleNotifyReview(req, res) {
  try {
    const { review, product } = req.body;
    if (!review) return res.status(400).json({ error: 'review data required' });

    let dbReview = null;
    try {
      const { data: found } = await supabase
        .from('reviews')
        .select('*, products(name_en, name_kz, name_ru, price, images)')
        .eq('product_id', review.product_id)
        .eq('customer_name', review.customer_name)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (found) dbReview = found;
    } catch (e) {}

    const reviewData = dbReview || review;
    const productData = dbReview?.products || product || null;

    const productName = productData
      ? (productData.name_kz || productData.name_ru || productData.name_en || 'Product')
      : 'Unknown product';
    const productPrice = productData ? parseFloat(productData.price).toFixed(2) : '';
    const productImage = productData?.images?.[0] || '';

    const result = await sendMail({
      to: ADMIN_EMAIL,
      subject: `Жаңа пікір: ${productName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAFAFA; margin: 0; padding: 2rem;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #FF6B00, #E05E00); padding: 2rem; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 1.5rem;">Жаңа пікір келді!</h1>
            </div>
            <div style="padding: 2rem;">
              <div style="background: #FFF9E6; border-left: 4px solid #FFC107; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666;">Бағалау:</p>
                <p style="margin: 0; font-size: 2rem; color: #FFC107;">${'★'.repeat(reviewData.rating)}${'☆'.repeat(5 - reviewData.rating)}</p>
              </div>
              <div style="background: #F0F9FF; border-left: 4px solid #0EA5E9; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666;">Пікір:</p>
                <p style="margin: 0; font-size: 1.1rem; color: #1F2937; line-height: 1.6;">${esc(reviewData.comment || 'No comment')}</p>
              </div>
              <div style="background: #F3F4F6; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="margin: 0.25rem 0;"><strong>Клиент:</strong> ${esc(reviewData.customer_name || 'Anonymous')}</p>
                ${reviewData.customer_email ? `<p style="margin: 0.25rem 0;"><strong>Email:</strong> ${esc(reviewData.customer_email)}</p>` : ''}
                <p style="margin: 0.25rem 0;"><strong>Уақыты:</strong> ${new Date(reviewData.created_at || Date.now()).toLocaleString('kk-KZ')}</p>
                ${reviewData.verified ? '<p style="margin: 0.25rem 0; color: #059669;"><strong>Расталған сатып алушы</strong></p>' : ''}
              </div>
              <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666;">Тауар:</p>
                <div style="display: flex; gap: 1rem; align-items: center;">
                  ${productImage ? `<img src="${esc(productImage)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">` : ''}
                  <div>
                    <p style="margin: 0; font-weight: 600; color: #1F2937;">${esc(productName)}</p>
                    ${productPrice ? `<p style="margin: 0.25rem 0 0 0; color: #059669; font-weight: 600;">€${productPrice}</p>` : ''}
                  </div>
                </div>
              </div>
              ${reviewData.images && reviewData.images.length > 0 ? `
                <div style="margin-bottom: 1.5rem;">
                  <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666;">Фото (${reviewData.images.length}):</p>
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${reviewData.images.map(url => `<img src="${esc(url)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">`).join('')}
                  </div>
                </div>
              ` : ''}
              <div style="text-align: center; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #E5E7EB;">
                <a href="${SITE_URL}/admin-reviews.html" style="display: inline-flex; align-items: center; gap: 6px; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  Админ панель →
                </a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'Failed to send email: ' + result.error });
    }
    return res.status(200).json({ success: true, message: 'Admin notified' });
  } catch (err) {
    console.error('Admin notification error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// ORDER CONFIRMATION — тапсырыс растау email
// ============================================================
const CONFIRMATION_TRANSLATIONS = {
  en: {
    subject: '✅ Order Confirmed', title: 'Order Confirmed ✓',
    greeting: 'Thank you for your order!',
    intro: (name) => `Hi ${name || 'there'},<br>We have received your order and we are getting it ready. You will receive a tracking number once your package ships.`,
    orderIdLabel: 'Order ID', itemsHeader: 'Items', productCol: 'Product', qtyCol: 'Qty', priceCol: 'Price',
    totalLabel: 'Total', shippingHeader: '📦 Shipping Address',
    viewOrdersBtn: 'View My Orders', footer: 'If you have any questions, contact us at',
    thanks: 'Thank you for shopping with SunTrade!', noEmail: 'No customer email on this order'
  },
  kz: {
    subject: '✅ Тапсырыс қабылданды', title: 'Тапсырыс қабылданды ✓',
    greeting: 'Тапсырысыңыз үшін рахмет!',
    intro: (name) => `Сәлеметсіз бе, ${name || 'құрметті клиент'}!<br>Сіздің тапсырысыңыз қабылданып, дайындалуда. Тауар жөнелтілгенде сізге трек-номер жіберіледі.`,
    orderIdLabel: 'Тапсырыс нөмірі', itemsHeader: 'Тауарлар', productCol: 'Тауар', qtyCol: 'Саны', priceCol: 'Бағасы',
    totalLabel: 'Жалпы сома', shippingHeader: '📦 Жеткізу мекенжайы',
    viewOrdersBtn: 'Менің тапсырыстарым', footer: 'Сұрақтарыңыз болса, хабарласыңыз:',
    thanks: 'SunTrade-пен сауда жасағаныңыз үшін рахмет!', noEmail: 'Тапсырыста клиенттің email-ы жоқ'
  },
  ru: {
    subject: '✅ Заказ принят', title: 'Заказ принят ✓',
    greeting: 'Спасибо за ваш заказ!',
    intro: (name) => `Здравствуйте, ${name || 'уважаемый клиент'}!<br>Ваш заказ принят и готовится к отправке. Как только посылка будет отправлена, мы пришлём вам трек-номер.`,
    orderIdLabel: 'Номер заказа', itemsHeader: 'Товары', productCol: 'Товар', qtyCol: 'Кол-во', priceCol: 'Цена',
    totalLabel: 'Итого', shippingHeader: '📦 Адрес доставки',
    viewOrdersBtn: 'Мои заказы', footer: 'Если у вас есть вопросы, свяжитесь с нами:',
    thanks: 'Спасибо за покупку в SunTrade!', noEmail: 'У заказа нет email клиента'
  },
  de: {
    subject: '✅ Bestellung bestätigt', title: 'Bestellung bestätigt ✓',
    greeting: 'Vielen Dank für Ihre Bestellung!',
    intro: (name) => `Hallo ${name || 'Kunde'},<br>Wir haben Ihre Bestellung erhalten und bereiten sie vor.`,
    orderIdLabel: 'Bestellnummer', itemsHeader: 'Artikel', productCol: 'Produkt', qtyCol: 'Menge', priceCol: 'Preis',
    totalLabel: 'Gesamt', shippingHeader: '📦 Lieferadresse', viewOrdersBtn: 'Meine Bestellungen',
    footer: 'Bei Fragen kontaktieren Sie uns:', thanks: 'Vielen Dank für Ihren Einkauf bei SunTrade!', noEmail: 'Keine Kunden-E-Mail'
  },
  fr: {
    subject: '✅ Commande confirmée', title: 'Commande confirmée ✓',
    greeting: 'Merci pour votre commande !',
    intro: (name) => `Bonjour ${name || 'cher client'},<br>Nous avons bien reçu votre commande et nous la préparons.`,
    orderIdLabel: 'N° de commande', itemsHeader: 'Articles', productCol: 'Produit', qtyCol: 'Qté', priceCol: 'Prix',
    totalLabel: 'Total', shippingHeader: '📦 Adresse de livraison', viewOrdersBtn: 'Mes commandes',
    footer: 'Pour toute question, contactez-nous :', thanks: 'Merci d\'avoir acheté chez SunTrade !', noEmail: 'Aucun email client'
  },
  es: {
    subject: '✅ Pedido confirmado', title: 'Pedido confirmado ✓',
    greeting: '¡Gracias por tu pedido!',
    intro: (name) => `Hola ${name || 'cliente'},<br>Hemos recibido tu pedido y lo estamos preparando.`,
    orderIdLabel: 'Nº de pedido', itemsHeader: 'Artículos', productCol: 'Producto', qtyCol: 'Cant.', priceCol: 'Precio',
    totalLabel: 'Total', shippingHeader: '📦 Dirección de envío', viewOrdersBtn: 'Mis pedidos',
    footer: 'Si tienes preguntas, contáctanos:', thanks: '¡Gracias por comprar en SunTrade!', noEmail: 'Sin email del cliente'
  },
  it: {
    subject: '✅ Ordine confermato', title: 'Ordine confermato ✓',
    greeting: 'Grazie per il tuo ordine!',
    intro: (name) => `Ciao ${name || 'cliente'},<br>Abbiamo ricevuto il tuo ordine e lo stiamo preparando.`,
    orderIdLabel: 'Numero ordine', itemsHeader: 'Articoli', productCol: 'Prodotto', qtyCol: 'Qtà', priceCol: 'Prezzo',
    totalLabel: 'Totale', shippingHeader: '📦 Indirizzo di spedizione', viewOrdersBtn: 'I miei ordini',
    footer: 'Per domande, contattaci:', thanks: 'Grazie per aver acquistato da SunTrade!', noEmail: 'Nessuna email cliente'
  },
  tr: {
    subject: '✅ Sipariş onaylandı', title: 'Sipariş onaylandı ✓',
    greeting: 'Siparişiniz için teşekkür ederiz!',
    intro: (name) => `Merhaba ${name || 'değerli müşteri'},<br>Siparişinizi aldık ve hazırlıyoruz.`,
    orderIdLabel: 'Sipariş No', itemsHeader: 'Ürünler', productCol: 'Ürün', qtyCol: 'Adet', priceCol: 'Fiyat',
    totalLabel: 'Toplam', shippingHeader: '📦 Teslimat adresi', viewOrdersBtn: 'Siparişlerim',
    footer: 'Sorularınız için bize ulaşın:', thanks: 'SunTrade\'dan alışveriş yaptığınız için teşekkürler!', noEmail: 'Müşteri e-postası yok'
  },
  pt: {
    subject: '✅ Pedido confirmado', title: 'Pedido confirmado ✓',
    greeting: 'Obrigado pelo seu pedido!',
    intro: (name) => `Olá ${name || 'cliente'},<br>Recebemos o seu pedido e estamos a prepará-lo.`,
    orderIdLabel: 'Nº do pedido', itemsHeader: 'Itens', productCol: 'Produto', qtyCol: 'Qtd', priceCol: 'Preço',
    totalLabel: 'Total', shippingHeader: '📦 Endereço de envio', viewOrdersBtn: 'Meus pedidos',
    footer: 'Se tiver dúvidas, contacte-nos:', thanks: 'Obrigado por comprar na SunTrade!', noEmail: 'Sem email do cliente'
  },
  nl: {
    subject: '✅ Bestelling bevestigd', title: 'Bestelling bevestigd ✓',
    greeting: 'Bedankt voor uw bestelling!',
    intro: (name) => `Hallo ${name || 'klant'},<br>We hebben uw bestelling ontvangen en bereiden deze voor.`,
    orderIdLabel: 'Bestelnummer', itemsHeader: 'Artikelen', productCol: 'Product', qtyCol: 'Aantal', priceCol: 'Prijs',
    totalLabel: 'Totaal', shippingHeader: '📦 Verzendadres', viewOrdersBtn: 'Mijn bestellingen',
    footer: 'Voor vragen, neem contact op:', thanks: 'Bedankt voor het winkelen bij SunTrade!', noEmail: 'Geen klant-e-mail'
  },
  pl: {
    subject: '✅ Zamówienie potwierdzone', title: 'Zamówienie potwierdzone ✓',
    greeting: 'Dziękujemy za zamówienie!',
    intro: (name) => `Cześć ${name || 'kliencie'},<br>Otrzymaliśmy Twoje zamówienie i przygotowujemy je.`,
    orderIdLabel: 'Numer zamówienia', itemsHeader: 'Produkty', productCol: 'Produkt', qtyCol: 'Ilość', priceCol: 'Cena',
    totalLabel: 'Suma', shippingHeader: '📦 Adres dostawy', viewOrdersBtn: 'Moje zamówienia',
    footer: 'W razie pytań skontaktuj się z nami:', thanks: 'Dziękujemy za zakupy w SunTrade!', noEmail: 'Brak e-maila klienta'
  },
  ar: {
    subject: '✅ تم تأكيد الطلب', title: 'تم تأكيد الطلب ✓',
    greeting: 'شكراً لطلبك!',
    intro: (name) => `مرحباً ${name || 'عزيزي العميل'},<br>لقد استلمنا طلبك ونقوم بتجهيزه.`,
    orderIdLabel: 'رقم الطلب', itemsHeader: 'العناصر', productCol: 'المنتج', qtyCol: 'الكمية', priceCol: 'السعر',
    totalLabel: 'المجموع', shippingHeader: '📦 عنوان الشحن', viewOrdersBtn: 'طلباتي',
    footer: 'لأي استفسار، اتصل بنا:', thanks: 'شكراً لتسوقك من SunTrade!', noEmail: 'لا يوجد بريد إلكتروني للعميل'
  }
};

async function handleOrderConfirmation(req, res) {
  try {
    const { orderId, language: langHint } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderError);
      return res.status(404).json({ error: 'Order not found' });
    }

    let language = 'en';
    if (langHint && CONFIRMATION_TRANSLATIONS[langHint]) language = langHint;
    else if (order.locale && CONFIRMATION_TRANSLATIONS[order.locale]) language = order.locale;
    else if (order.user_id) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('language')
          .eq('id', order.user_id)
          .single();
        if (profile?.language && CONFIRMATION_TRANSLATIONS[profile.language]) language = profile.language;
      } catch (e) {}
    } else if (order.customer_email) {
      const email = order.customer_email.toLowerCase();
      if (email.endsWith('.kz')) language = 'kz';
      else if (email.endsWith('.ru')) language = 'ru';
    }

    const t = CONFIRMATION_TRANSLATIONS[language] || CONFIRMATION_TRANSLATIONS.en;
    const isRtl = language === 'ar';

    const items = order.order_items || [];
    const itemsHtml = items.length > 0 ? items.map(item => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;">
          ${item.product_image ? `<img src="${esc(item.product_image)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-${isRtl ? 'left' : 'right'}:12px;">` : ''}
          <span style="vertical-align:middle;">${esc(item.product_name || 'Product')}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;text-align:center;">${item.quantity || 1}</td>
        <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;text-align:${isRtl ? 'left' : 'right'};font-weight:600;">€${parseFloat(item.unit_price || 0).toFixed(2)}</td>
      </tr>
    `).join('') : `<tr><td colspan="3" style="padding:12px 0;color:#6B7280;">#${order.id.substring(0, 8).toUpperCase()}</td></tr>`;

    const shippingAddr = order.shipping_address_line1 ? `
      <p style="margin:0;color:#1A1A2E;"><strong>${esc(order.shipping_name || order.customer_name || '')}</strong></p>
      <p style="margin:4px 0;color:#6B7280;line-height:1.5;">
        ${esc(order.shipping_address_line1)}<br>
        ${order.shipping_address_line2 ? esc(order.shipping_address_line2) + '<br>' : ''}
        ${esc(order.shipping_city || '')}${order.shipping_postal_code ? ', ' + esc(order.shipping_postal_code) : ''}<br>
        ${esc(order.shipping_country || '')}
      </p>
    ` : '';

    const orderIdShort = order.id.substring(0, 8).toUpperCase();
    const customerName = order.customer_name || order.shipping_name || '';
    const amount = parseFloat(order.amount || 0).toFixed(2);

    const customerEmailHtml = `
      <!DOCTYPE html>
      <html dir="${isRtl ? 'rtl' : 'ltr'}">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAFAFA; margin: 0; padding: 2rem;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #FF6B00, #E05E00); padding: 2rem; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 1.8rem;">SunTrade</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0; font-size: 0.95rem;">${esc(t.title)}</p>
          </div>
          <div style="padding: 2rem;">
            <h2 style="color: #1A1A2E; margin: 0 0 0.5rem;">${esc(t.greeting)}</h2>
            <p style="color: #6B7280; line-height: 1.6; margin: 0 0 1.5rem;">${t.intro(customerName)}</p>
            <div style="background: #F9FAFB; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
              <p style="margin: 0; font-size: 0.8rem; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">${esc(t.orderIdLabel)}</p>
              <p style="margin: 4px 0 0; font-size: 1.1rem; font-weight: 700; color: #1A1A2E; font-family: monospace;">#${esc(orderIdShort)}</p>
            </div>
            <h3 style="color: #1A1A2E; font-size: 1rem; margin: 0 0 0.75rem;">${esc(t.itemsHeader)}</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;" dir="${isRtl ? 'rtl' : 'ltr'}">
              <thead>
                <tr style="border-bottom: 2px solid #E5E7EB;">
                  <th style="text-align: ${isRtl ? 'right' : 'left'}; padding: 8px 0; color: #6B7280; font-size: 0.85rem;">${esc(t.productCol)}</th>
                  <th style="text-align: center; padding: 8px 0; color: #6B7280; font-size: 0.85rem;">${esc(t.qtyCol)}</th>
                  <th style="text-align: ${isRtl ? 'left' : 'right'}; padding: 8px 0; color: #6B7280; font-size: 0.85rem;">${esc(t.priceCol)}</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div style="background: #FEF3C7; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #1A1A2E; font-weight: 600;">${esc(t.totalLabel)}</span>
              <span style="color: #FF6B00; font-size: 1.4rem; font-weight: 700;">€${amount}</span>
            </div>
            ${shippingAddr ? `
              <h3 style="color: #1A1A2E; font-size: 1rem; margin: 1.5rem 0 0.75rem;">${esc(t.shippingHeader)}</h3>
              <div style="background: #F9FAFB; border-radius: 12px; padding: 1rem 1.25rem;">${shippingAddr}</div>
            ` : ''}
            <div style="text-align: center; margin: 2rem 0 0;">
              <a href="${SITE_URL}/account.html#orders" style="display: inline-block; background: #FF6B00; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 1rem;">${esc(t.viewOrdersBtn)}</a>
            </div>
            <p style="color: #9CA3AF; font-size: 0.85rem; text-align: center; margin-top: 2rem; line-height: 1.5;">
              ${esc(t.footer)} <a href="mailto:${ADMIN_EMAIL}" style="color: #FF6B00;">${ADMIN_EMAIL}</a><br>
              ${esc(t.thanks)}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAFA;margin:0;padding:1.5rem;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
          <div style="background: linear-gradient(135deg, #FF6B00, #E05E00); padding: 1.25rem 1.5rem;">
            <h2 style="color:white;margin:0;font-size:1.25rem;">🆕 New Order Received</h2>
          </div>
          <div style="padding: 1.5rem;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;width:140px;">Order ID</td><td style="padding:6px 0;font-family:monospace;font-weight:700;">#${esc(orderIdShort)}</td></tr>
              <tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Date</td><td style="padding:6px 0;">${new Date(order.created_at).toLocaleString('en-GB')}</td></tr>
              <tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Customer</td><td style="padding:6px 0;"><strong>${esc(order.customer_name || order.shipping_name || 'N/A')}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Email</td><td style="padding:6px 0;"><a href="mailto:${esc(order.customer_email || '')}" style="color:#FF6B00;">${esc(order.customer_email || 'N/A')}</a></td></tr>
              ${order.customer_phone ? `<tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Phone</td><td style="padding:6px 0;"><a href="tel:${esc(order.customer_phone)}" style="color:#FF6B00;">📞 ${esc(order.customer_phone)}</a></td></tr>` : ''}
              <tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Total</td><td style="padding:6px 0;font-weight:700;color:#FF6B00;font-size:1.1rem;">€${amount}</td></tr>
              <tr><td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Status</td><td style="padding:6px 0;"><span style="background:#22C55E;color:white;padding:2px 10px;border-radius:12px;font-size:0.8rem;font-weight:600;">${esc(order.status || 'paid')}</span></td></tr>
            </table>
            <h3 style="color:#1A1A2E;font-size:1rem;margin:1.5rem 0 0.75rem;">📦 Items</h3>
            <table style="width:100%;border-collapse:collapse;border-top:2px solid #E5E7EB;">
              ${items.map(item => `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:8px 4px;font-size:0.9rem;">${esc(item.product_name || 'Product')}</td>
                  <td style="padding:8px 4px;font-size:0.9rem;text-align:center;color:#6B7280;">×${item.quantity || 1}</td>
                  <td style="padding:8px 4px;font-size:0.9rem;text-align:right;font-weight:600;">€${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </table>
            ${shippingAddr ? `
              <h3 style="color:#1A1A2E;font-size:1rem;margin:1.5rem 0 0.75rem;">📍 Shipping to</h3>
              <div style="background:#F9FAFB;border-radius:8px;padding:0.75rem 1rem;font-size:0.9rem;">${shippingAddr}</div>
            ` : ''}
            <div style="text-align:center;margin-top:1.5rem;">
              <a href="${SITE_URL}/admin.html#orders" style="display:inline-block;background:#FF6B00;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.9rem;">View in Admin Panel</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const results = { customer: null, admin: null };

    if (order.customer_email) {
      results.customer = await sendMail({
        to: order.customer_email,
        subject: `${t.subject} — #${orderIdShort}`,
        html: customerEmailHtml,
        replyTo: ADMIN_EMAIL
      });
    } else {
      results.customer = { ok: false, error: t.noEmail };
    }

    const adminRecipients = [ADMIN_EMAIL];
    if (ORDER_NOTIFICATION_EMAIL && ORDER_NOTIFICATION_EMAIL !== ADMIN_EMAIL) {
      adminRecipients.push(ORDER_NOTIFICATION_EMAIL);
    }
    results.admin = await sendMail({
      to: adminRecipients,
      subject: `🆕 New order #${orderIdShort} — €${amount} — ${esc(order.customer_name || order.shipping_name || 'Customer')}`,
      html: adminEmailHtml,
      replyTo: order.customer_email || undefined
    });

    return res.status(200).json({ success: true, language, orderId: order.id, adminRecipients, ...results });
  } catch (err) {
    console.error('Order confirmation error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// STATUS UPDATE — тапсырыс статусы өзгергенде email
// ============================================================
const STATUS_TRANSLATIONS = {
  pending:   { en: 'Order Placed',  kz: 'Тапсырыс берілді',     ru: 'Заказ оформлен' },
  accepted:  { en: 'Accepted',      kz: 'Қабылданды',           ru: 'Принят в работу' },
  packing:   { en: 'Packing',       kz: 'Жиналуда',             ru: 'Упаковывается' },
  shipped:   { en: 'Shipped',       kz: 'Жолға шықты',          ru: 'В пути' },
  delivered: { en: 'Delivered',     kz: 'Жеткізілді',           ru: 'Доставлен' }
};

const STATUS_EMAIL_TEXTS = {
  en: {
    subject: (s) => `📦 Order Update: ${STATUS_TRANSLATIONS[s]?.en || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.en || s,
    intro: (s) => ({
      pending:   'Your order has been placed successfully!',
      accepted:  'Great news! Your order has been accepted and is being prepared.',
      packing:   'Your order is being packed with care.',
      shipped:   'Your order is on its way! Track it soon.',
      delivered: '🎉 Your order has been delivered! We hope you enjoy your purchase. Please leave a review to help other customers.'
    })[s] || `Order status updated: ${s}`
  },
  kz: {
    subject: (s) => `📦 Тапсырыс жаңартылды: ${STATUS_TRANSLATIONS[s]?.kz || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.kz || s,
    intro: (s) => ({
      pending:   'Сіздің тапсырысыңыз сәтті қабылданды!',
      accepted:  'Жақсы жаңалық! Сіздің тапсырысыңыз қабылданып, дайындалуда.',
      packing:   'Сіздің тапсырысыңыз мұқият жиналуда.',
      shipped:   'Сіздің тапсырысыңыз жолға шықты! Жақында трек-номер аласыз.',
      delivered: '🎉 Сіздің тапсырысыңыз жеткізілді! Тауарыңызды ұнатады деп үміттенеміз. Басқа клиенттерге көмектесу үшін пікір қалдырыңыз.'
    })[s] || `Тапсырыс статусы жаңартылды: ${s}`
  },
  ru: {
    subject: (s) => `📦 Заказ обновлён: ${STATUS_TRANSLATIONS[s]?.ru || s}`,
    title: (s) => STATUS_TRANSLATIONS[s]?.ru || s,
    intro: (s) => ({
      pending:   'Ваш заказ успешно оформлен!',
      accepted:  'Отличные новости! Ваш заказ принят и готовится.',
      packing:   'Ваш заказ аккуратно упаковывается.',
      shipped:   'Ваш заказ в пути! Скоро мы пришлём трек-номер.',
      delivered: '🎉 Ваш заказ доставлен! Надеемся, вам понравится покупка. Пожалуйста, оставьте отзыв — это поможет другим клиентам.'
    })[s] || `Статус заказа обновлён: ${s}`
  },
  de: { subject: (s) => `📦 Bestellupdate: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Ihre Bestellung wurde aktualisiert: ${s}` },
  fr: { subject: (s) => `📦 Mise à jour: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Votre commande a été mise à jour: ${s}` },
  es: { subject: (s) => `📦 Actualización: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Tu pedido ha sido actualizado: ${s}` },
  it: { subject: (s) => `📦 Aggiornamento: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Il tuo ordine è stato aggiornato: ${s}` },
  tr: { subject: (s) => `📦 Güncelleme: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Siparişiniz güncellendi: ${s}` },
  pt: { subject: (s) => `📦 Atualização: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Seu pedido foi atualizado: ${s}` },
  nl: { subject: (s) => `📦 Update: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Uw bestelling is bijgewerkt: ${s}` },
  pl: { subject: (s) => `📦 Aktualizacja: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `Twoje zamówienie zostało zaktualizowane: ${s}` },
  ar: { subject: (s) => `📦 تحديث: ${STATUS_TRANSLATIONS[s]?.en || s}`, title: (s) => STATUS_TRANSLATIONS[s]?.en || s, intro: (s) => `تم تحديث طلبك: ${s}` }
};

async function handleStatusUpdate(req, res) {
  try {
    const { orderId, status, language } = req.body;
    if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' });

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error('Order not found:', orderErr);
      return res.status(404).json({ error: 'Order not found' });
    }

    const lang = language || order.locale || 'en';
    const results = { customer: null, admin: null };

    // Customer email
    if (order.customer_email) {
      const t = STATUS_EMAIL_TEXTS[lang] || STATUS_EMAIL_TEXTS.en;
      const statusInfo = STATUS_TRANSLATIONS[status] || { en: status, kz: status, ru: status };
      const statusTitle = typeof t.title === 'function' ? t.title(status) : statusInfo.en;
      const statusIntro = typeof t.intro === 'function' ? t.intro(status) : '';

      const colors = { pending: '#F59E0B', accepted: '#3B82F6', packing: '#8B5CF6', shipped: '#06B6D4', delivered: '#22C55E' };
      const color = colors[status] || '#3B82F6';

      const reviewButtonsHtml = status === 'delivered' ? `
        <div style="background:#FEF3C7;border-radius:12px;padding:20px;margin:24px 0;">
          <p style="margin:0 0 16px;color:#92400E;font-size:15px;text-align:center;font-weight:600;">⭐ Enjoyed your order? Leave a review to help other customers!</p>
          ${(order.order_items || []).filter(item => item.product_id).map(item => `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
              <tr>
                <td style="padding:10px 12px;background:#FFFFFF;border-radius:8px;border:1px solid #FDE68A;">
                  <table width="100%" cellpadding="0" cellspacing="0"><tr>
                    <td style="vertical-align:middle;"><p style="margin:0;color:#1A1A2E;font-size:14px;font-weight:600;">${esc(item.product_name || 'Product')}</p></td>
                    <td align="right" style="vertical-align:middle;width:140px;">
                      <a href="${SITE_URL}/review.html?product=${item.product_id}&order=${order.id}" style="display:inline-block;background:#FF6B00;color:#FFFFFF;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Leave a Review</a>
                    </td>
                  </tr></table>
                </td>
              </tr>
            </table>
          `).join('')}
        </div>
      ` : '';

      results.customer = await sendMail({
        to: order.customer_email,
        subject: typeof t.subject === 'function' ? t.subject(status) : `Order Update: ${statusTitle}`,
        html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F3F4F6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;"><tr><td align="center">
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
          <td style="padding:12px;color:#1A1A2E;font-size:14px;">${esc(item.product_name || 'Product')}</td>
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
</td></tr></table>
</body></html>`,
        replyTo: ADMIN_EMAIL
      });
    }

    // Admin email
    const statusEmoji = { pending: '🆕', accepted: '✅', packing: '📦', shipped: '🚚', delivered: '🎉' };
    const adminRecipients = [ADMIN_EMAIL];
    if (ORDER_NOTIFICATION_EMAIL && ORDER_NOTIFICATION_EMAIL !== ADMIN_EMAIL) {
      adminRecipients.push(ORDER_NOTIFICATION_EMAIL);
    }
    results.admin = await sendMail({
      to: adminRecipients,
      subject: `${statusEmoji[status] || '📋'} Order ${status.toUpperCase()} — ${order.id.substring(0, 8).toUpperCase()}`,
      html: `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;">
<h2>Order Status Update</h2>
<p><strong>Status:</strong> ${statusEmoji[status] || ''} ${status.toUpperCase()}</p>
<p><strong>Order ID:</strong> ${order.id}</p>
<p><strong>Customer:</strong> ${esc(order.customer_name || 'N/A')} (${esc(order.customer_email || 'no email')})</p>
<p><strong>Phone:</strong> ${esc(order.customer_phone || 'N/A')}</p>
<p><strong>Amount:</strong> €${parseFloat(order.amount || 0).toFixed(2)} ${order.currency || 'EUR'}</p>
<p><strong>Shipping:</strong> ${esc(order.shipping_address_line1 || '')}, ${esc(order.shipping_city || '')}, ${esc(order.shipping_country || '')}</p>
<p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
<hr>
<h3>Items:</h3>
<ul>${(order.order_items || []).map(item => `<li>${esc(item.product_name)} × ${item.quantity} — €${parseFloat(item.unit_price || 0).toFixed(2)}</li>`).join('')}</ul>
<hr>
<p><a href="${SITE_URL}/admin.html#orders">View in admin panel →</a></p>
</body></html>`,
      replyTo: order.customer_email || undefined
    });

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Status email error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// REVIEW REQUEST — клиентке пікір сұрау email
// ============================================================
async function handleReviewRequest(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return res.status(404).json({ error: 'Order not found' });
    if (!order.customer_email) return res.status(400).json({ error: 'No customer email on file' });

    // Check if already sent
    const { data: existingRequest } = await supabase
      .from('review_requests')
      .select('id')
      .eq('order_id', orderId)
      .limit(1);
    if (existingRequest && existingRequest.length > 0) {
      return res.status(200).json({ success: true, message: 'Review request already sent' });
    }

    const firstItem = order.order_items && order.order_items[0];
    let productId = firstItem ? firstItem.product_id : (order.product_id || null);
    let productName = firstItem ? (firstItem.product_name || 'your product') : 'your product';
    let productImage = firstItem ? (firstItem.product_image || '') : '';
    let productPrice = firstItem && firstItem.unit_price ? parseFloat(firstItem.unit_price).toFixed(2) : '';

    // Try to get more details from products table
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
      : SITE_URL;
    const productUrl = productId
      ? `${SITE_URL}/product.html?id=${productId}`
      : SITE_URL;

    const result = await sendMail({
      to: order.customer_email,
      subject: `How was your ${productName}? Leave a review!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>@media (max-width:480px){.email-body{padding:1rem!important}.product-img{width:100%!important;max-width:280px!important}.btn{display:block!important;width:100%!important;box-sizing:border-box!important}}</style>
        </head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAFA;margin:0;padding:2rem;">
          <div class="email-body" style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            ${productImage ? `
              <div style="text-align:center;padding:2rem 2rem 0;">
                <a href="${productUrl}" target="_blank">
                  <img class="product-img" src="${esc(productImage)}" alt="${esc(productName)}" style="width:100%;max-width:320px;height:auto;border-radius:16px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,0.1);">
                </a>
              </div>
            ` : '<div style="background:linear-gradient(135deg,#1A1A2E,#16213E);padding:2rem;text-align:center;"><h1 style="color:white;margin:0;font-size:1.5rem;">SunTrade</h1></div>'}
            <div style="padding:1.5rem 2rem 2rem;text-align:center;">
              <h2 style="color:#1A1A2E;margin:0 0 0.25rem;font-size:1.3rem;">${esc(productName)}</h2>
              ${productPrice ? `<div style="font-size:1.6rem;font-weight:800;color:#FF6B00;margin-bottom:1.5rem;">€${productPrice}</div>` : ''}
              <p style="color:#6B7280;line-height:1.6;margin-bottom:1.5rem;">
                Hi ${esc(order.customer_name || 'there')},<br><br>
                Your <strong>${esc(productName)}</strong> has been delivered! We hope you love it.<br>
                Please take a moment to share your experience — your feedback helps other customers make better choices!
              </p>
              <div style="text-align:center;margin:1.5rem 0;">
                <a class="btn" href="${reviewUrl}" style="display:inline-block;background:#FF6B00;color:white;padding:15px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:1.05rem;">⭐ Leave a Review</a>
              </div>
              <p style="margin-top:1.5rem;"><a href="${productUrl}" style="color:#FF6B00;font-size:0.9rem;text-decoration:none;">View product details →</a></p>
              <p style="color:#9CA3AF;font-size:0.85rem;margin-top:2rem;border-top:1px solid #F3F4F6;padding-top:1.5rem;">Thank you for shopping with <strong>SunTrade</strong>!</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (!result.ok) return res.status(500).json({ error: 'Failed to send email: ' + result.error });

    await supabase.from('review_requests').insert({
      order_id: orderId,
      customer_email: order.customer_email
    });

    return res.status(200).json({ success: true, message: 'Review request email sent' });
  } catch (err) {
    console.error('Review request error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// TEST — email конфигурациясын тексеру
// ============================================================
async function handleTest(req, res) {
  const apiKey = process.env.RESEND_API_KEY || null;
  const from = process.env.SMTP_FROM || null;
  const admin = process.env.ADMIN_EMAIL || null;

  const status = {
    env_loaded: {
      RESEND_API_KEY_set: !!apiKey,
      RESEND_API_KEY_length: apiKey ? apiKey.length : 0,
      RESEND_API_KEY_starts_with_re: apiKey ? apiKey.startsWith('re_') : false,
      SMTP_FROM: from || '❌ NOT SET',
      ADMIN_EMAIL: admin || '❌ NOT SET'
    },
    send_test: null,
    timestamp: new Date().toISOString()
  };

  if (!apiKey) {
    status.send_test = { ok: false, error: 'RESEND_API_KEY not set in Vercel env vars.' };
    return res.status(200).json(status);
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: from || 'SunTrade <onboarding@resend.dev>',
        to: [admin || 'sundetofficial@gmail.com'],
        subject: '🧪 SunTrade SMTP test',
        html: '<p>If you see this in your inbox, email is working! 🎉</p><p>— sent from /api/email?action=test</p>',
        text: 'Email is working! — sent from /api/email?action=test'
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      status.send_test = { ok: false, error: data?.message || data?.error || `HTTP ${resp.status}` };
      return res.status(200).json(status);
    }

    status.send_test = { ok: true, message: 'Email sent successfully ✓', sent_to: admin || 'sundetofficial@gmail.com', email_id: data.id };
  } catch (err) {
    status.send_test = { ok: false, error: err.message };
  }

  return res.status(200).json(status);
}

// ============================================================
// MAIN ROUTER
// ============================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // action параметрін алу
  let action;
  if (req.method === 'GET') {
    action = req.query.action;
  } else {
    action = req.body?.action;
    if (!action && req.url) {
      try { action = new URL(req.url, 'http://localhost').searchParams.get('action'); } catch (e) {}
    }
  }

  if (!action) {
    return res.status(400).json({
      error: 'Missing action parameter. Use: notify-review, order-confirmation, status-update, review-request, test',
      available: ['notify-review', 'order-confirmation', 'status-update', 'review-request', 'test']
    });
  }

  switch (action) {
    case 'notify-review':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      if (!isConfigured()) {
        console.error('SMTP not configured');
        return res.status(500).json({ error: 'Email service not configured' });
      }
      return handleNotifyReview(req, res);

    case 'order-confirmation':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      if (!isConfigured()) {
        console.log('SMTP not configured, skipping email');
        return res.status(200).json({ success: true, message: 'Email service not configured' });
      }
      return handleOrderConfirmation(req, res);

    case 'status-update':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      if (!isConfigured()) return res.status(500).json({ error: 'Email service not configured' });
      return handleStatusUpdate(req, res);

    case 'review-request':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      if (!isConfigured()) return res.status(500).json({ error: 'Email service not configured' });
      return handleReviewRequest(req, res);

    case 'test':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
      return handleTest(req, res);

    default:
      return res.status(400).json({ error: 'Unknown action: ' + action });
  }
};
