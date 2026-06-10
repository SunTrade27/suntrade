// Vercel Serverless Function: Send order confirmation emails
// - Multilingual email to customer (based on session locale / profile language)
// - Notification email to admin
// Uses Gmail SMTP via api/lib/email.js

const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured, ADMIN_EMAIL, ORDER_NOTIFICATION_EMAIL } = require('./lib/email');

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

// ============================================================
// КӨП ТІЛДЕГІ ШАБЛОНДАР (12 тіл)
// ============================================================
const TRANSLATIONS = {
  en: {
    subject: '✅ Order Confirmed',
    title: 'Order Confirmed ✓',
    greeting: 'Thank you for your order!',
    intro: (name) => `Hi ${name || 'there'},<br>We have received your order and we are getting it ready. You will receive a tracking number once your package ships.`,
    orderIdLabel: 'Order ID',
    itemsHeader: 'Items',
    productCol: 'Product',
    qtyCol: 'Qty',
    priceCol: 'Price',
    totalLabel: 'Total',
    shippingHeader: '📦 Shipping Address',
    viewOrdersBtn: 'View My Orders',
    footer: 'If you have any questions, contact us at',
    thanks: 'Thank you for shopping with SunTrade!',
    noEmail: 'No customer email on this order'
  },
  kz: {
    subject: '✅ Тапсырыс қабылданды',
    title: 'Тапсырыс қабылданды ✓',
    greeting: 'Тапсырысыңыз үшін рахмет!',
    intro: (name) => `Сәлеметсіз бе, ${name || 'құрметті клиент'}!<br>Сіздің тапсырысыңыз қабылданып, дайындалуда. Тауар жөнелтілгенде сізге трек-номер жіберіледі.`,
    orderIdLabel: 'Тапсырыс нөмірі',
    itemsHeader: 'Тауарлар',
    productCol: 'Тауар',
    qtyCol: 'Саны',
    priceCol: 'Бағасы',
    totalLabel: 'Жалпы сома',
    shippingHeader: '📦 Жеткізу мекенжайы',
    viewOrdersBtn: 'Менің тапсырыстарым',
    footer: 'Сұрақтарыңыз болса, хабарласыңыз:',
    thanks: 'SunTrade-пен сауда жасағаныңыз үшін рахмет!',
    noEmail: 'Тапсырыста клиенттің email-ы жоқ'
  },
  ru: {
    subject: '✅ Заказ принят',
    title: 'Заказ принят ✓',
    greeting: 'Спасибо за ваш заказ!',
    intro: (name) => `Здравствуйте, ${name || 'уважаемый клиент'}!<br>Ваш заказ принят и готовится к отправке. Как только посылка будет отправлена, мы пришлём вам трек-номер.`,
    orderIdLabel: 'Номер заказа',
    itemsHeader: 'Товары',
    productCol: 'Товар',
    qtyCol: 'Кол-во',
    priceCol: 'Цена',
    totalLabel: 'Итого',
    shippingHeader: '📦 Адрес доставки',
    viewOrdersBtn: 'Мои заказы',
    footer: 'Если у вас есть вопросы, свяжитесь с нами:',
    thanks: 'Спасибо за покупку в SunTrade!',
    noEmail: 'У заказа нет email клиента'
  },
  de: {
    subject: '✅ Bestellung bestätigt',
    title: 'Bestellung bestätigt ✓',
    greeting: 'Vielen Dank für Ihre Bestellung!',
    intro: (name) => `Hallo ${name || 'Kunde'},<br>Wir haben Ihre Bestellung erhalten und bereiten sie vor. Sie erhalten eine Sendungsverfolgungsnummer, sobald Ihr Paket versandt wurde.`,
    orderIdLabel: 'Bestellnummer',
    itemsHeader: 'Artikel',
    productCol: 'Produkt',
    qtyCol: 'Menge',
    priceCol: 'Preis',
    totalLabel: 'Gesamt',
    shippingHeader: '📦 Lieferadresse',
    viewOrdersBtn: 'Meine Bestellungen',
    footer: 'Bei Fragen kontaktieren Sie uns:',
    thanks: 'Vielen Dank für Ihren Einkauf bei SunTrade!',
    noEmail: 'Keine Kunden-E-Mail'
  },
  fr: {
    subject: '✅ Commande confirmée',
    title: 'Commande confirmée ✓',
    greeting: 'Merci pour votre commande !',
    intro: (name) => `Bonjour ${name || 'cher client'},<br>Nous avons bien reçu votre commande et nous la préparons. Vous recevrez un numéro de suivi dès que votre colis sera expédié.`,
    orderIdLabel: 'N° de commande',
    itemsHeader: 'Articles',
    productCol: 'Produit',
    qtyCol: 'Qté',
    priceCol: 'Prix',
    totalLabel: 'Total',
    shippingHeader: '📦 Adresse de livraison',
    viewOrdersBtn: 'Mes commandes',
    footer: 'Pour toute question, contactez-nous :',
    thanks: 'Merci d’avoir acheté chez SunTrade !',
    noEmail: 'Aucun email client'
  },
  es: {
    subject: '✅ Pedido confirmado',
    title: 'Pedido confirmado ✓',
    greeting: '¡Gracias por tu pedido!',
    intro: (name) => `Hola ${name || 'cliente'},<br>Hemos recibido tu pedido y lo estamos preparando. Recibirás un número de seguimiento cuando tu paquete sea enviado.`,
    orderIdLabel: 'Nº de pedido',
    itemsHeader: 'Artículos',
    productCol: 'Producto',
    qtyCol: 'Cant.',
    priceCol: 'Precio',
    totalLabel: 'Total',
    shippingHeader: '📦 Dirección de envío',
    viewOrdersBtn: 'Mis pedidos',
    footer: 'Si tienes preguntas, contáctanos:',
    thanks: '¡Gracias por comprar en SunTrade!',
    noEmail: 'Sin email del cliente'
  },
  it: {
    subject: '✅ Ordine confermato',
    title: 'Ordine confermato ✓',
    greeting: 'Grazie per il tuo ordine!',
    intro: (name) => `Ciao ${name || 'cliente'},<br>Abbiamo ricevuto il tuo ordine e lo stiamo preparando. Riceverai un numero di tracciamento una volta spedito il pacco.`,
    orderIdLabel: 'Numero ordine',
    itemsHeader: 'Articoli',
    productCol: 'Prodotto',
    qtyCol: 'Qtà',
    priceCol: 'Prezzo',
    totalLabel: 'Totale',
    shippingHeader: '📦 Indirizzo di spedizione',
    viewOrdersBtn: 'I miei ordini',
    footer: 'Per domande, contattaci:',
    thanks: 'Grazie per aver acquistato da SunTrade!',
    noEmail: 'Nessuna email cliente'
  },
  tr: {
    subject: '✅ Sipariş onaylandı',
    title: 'Sipariş onaylandı ✓',
    greeting: 'Siparişiniz için teşekkür ederiz!',
    intro: (name) => `Merhaba ${name || 'değerli müşteri'},<br>Siparişinizi aldık ve hazırlıyoruz. Paketiniz gönderildiğinde bir takip numarası alacaksınız.`,
    orderIdLabel: 'Sipariş No',
    itemsHeader: 'Ürünler',
    productCol: 'Ürün',
    qtyCol: 'Adet',
    priceCol: 'Fiyat',
    totalLabel: 'Toplam',
    shippingHeader: '📦 Teslimat adresi',
    viewOrdersBtn: 'Siparişlerim',
    footer: 'Sorularınız için bize ulaşın:',
    thanks: 'SunTrade’dan alışveriş yaptığınız için teşekkürler!',
    noEmail: 'Müşteri e-postası yok'
  },
  pt: {
    subject: '✅ Pedido confirmado',
    title: 'Pedido confirmado ✓',
    greeting: 'Obrigado pelo seu pedido!',
    intro: (name) => `Olá ${name || 'cliente'},<br>Recebemos o seu pedido e estamos a prepará-lo. Receberá um número de rastreio assim que o pacote for enviado.`,
    orderIdLabel: 'Nº do pedido',
    itemsHeader: 'Itens',
    productCol: 'Produto',
    qtyCol: 'Qtd',
    priceCol: 'Preço',
    totalLabel: 'Total',
    shippingHeader: '📦 Endereço de envio',
    viewOrdersBtn: 'Meus pedidos',
    footer: 'Se tiver dúvidas, contacte-nos:',
    thanks: 'Obrigado por comprar na SunTrade!',
    noEmail: 'Sem email do cliente'
  },
  nl: {
    subject: '✅ Bestelling bevestigd',
    title: 'Bestelling bevestigd ✓',
    greeting: 'Bedankt voor uw bestelling!',
    intro: (name) => `Hallo ${name || 'klant'},<br>We hebben uw bestelling ontvangen en bereiden deze voor. U ontvangt een trackingnummer zodra uw pakket is verzonden.`,
    orderIdLabel: 'Bestelnummer',
    itemsHeader: 'Artikelen',
    productCol: 'Product',
    qtyCol: 'Aantal',
    priceCol: 'Prijs',
    totalLabel: 'Totaal',
    shippingHeader: '📦 Verzendadres',
    viewOrdersBtn: 'Mijn bestellingen',
    footer: 'Voor vragen, neem contact op:',
    thanks: 'Bedankt voor het winkelen bij SunTrade!',
    noEmail: 'Geen klant-e-mail'
  },
  pl: {
    subject: '✅ Zamówienie potwierdzone',
    title: 'Zamówienie potwierdzone ✓',
    greeting: 'Dziękujemy za zamówienie!',
    intro: (name) => `Cześć ${name || 'kliencie'},<br>Otrzymaliśmy Twoje zamówienie i przygotowujemy je. Otrzymasz numer śledzenia, gdy paczka zostanie wysłana.`,
    orderIdLabel: 'Numer zamówienia',
    itemsHeader: 'Produkty',
    productCol: 'Produkt',
    qtyCol: 'Ilość',
    priceCol: 'Cena',
    totalLabel: 'Suma',
    shippingHeader: '📦 Adres dostawy',
    viewOrdersBtn: 'Moje zamówienia',
    footer: 'W razie pytań skontaktuj się z nami:',
    thanks: 'Dziękujemy za zakupy w SunTrade!',
    noEmail: 'Brak e-maila klienta'
  },
  ar: {
    subject: '✅ تم تأكيد الطلب',
    title: 'تم تأكيد الطلب ✓',
    greeting: 'شكراً لطلبك!',
    intro: (name) => `مرحباً ${name || 'عزيزي العميل'},<br>لقد استلمنا طلبك ونقوم بتجهيزه. سوف تستلم رقم تتبع بمجرد شحن الطرد.`,
    orderIdLabel: 'رقم الطلب',
    itemsHeader: 'العناصر',
    productCol: 'المنتج',
    qtyCol: 'الكمية',
    priceCol: 'السعر',
    totalLabel: 'المجموع',
    shippingHeader: '📦 عنوان الشحن',
    viewOrdersBtn: 'طلباتي',
    footer: 'لأي استفسار، اتصل بنا:',
    thanks: 'شكراً لتسوقك من SunTrade!',
    noEmail: 'لا يوجد بريد إلكتروني للعميل'
  }
};

// Stripe locale → біздің код
function mapStripeLocale(locale) {
  if (!locale) return 'en';
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
  return 'en';
}

// HTML escape
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isConfigured()) {
    console.log('SMTP not configured, skipping email');
    return res.status(200).json({ success: true, message: 'Email service not configured' });
  }

  try {
    const { orderId, language: langHint } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    // 1) Тапсырысты жүктеу
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items ( product_id, product_name, product_image, quantity, unit_price )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderError);
      return res.status(404).json({ error: 'Order not found' });
    }

    // 2) Тілді анықтау: explicit param > session locale > profile language > 'en'
    let language = 'en';
    if (langHint && TRANSLATIONS[langHint]) {
      language = langHint;
    } else if (order.locale && TRANSLATIONS[order.locale]) {
      language = order.locale;
    } else if (order.user_id) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('language')
          .eq('id', order.user_id)
          .single();
        if (profile?.language && TRANSLATIONS[profile.language]) {
          language = profile.language;
        }
      } catch (e) { /* ignore */ }
    } else if (order.customer_email) {
      const email = order.customer_email.toLowerCase();
      if (email.endsWith('.kz')) language = 'kz';
      else if (email.endsWith('.ru')) language = 'ru';
    }

    const t = TRANSLATIONS[language] || TRANSLATIONS.en;
    const isRtl = language === 'ar';

    // 3) Тауарлар тізімін құру
    const items = order.order_items || [];
    let itemsHtml = '';
    if (items.length > 0) {
      itemsHtml = items.map(item => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;">
            ${item.product_image ? `<img src="${esc(item.product_image)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-${isRtl ? 'left' : 'right'}:12px;">` : ''}
            <span style="vertical-align:middle;">${esc(item.product_name || 'Product')}</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;text-align:center;">${item.quantity || 1}</td>
          <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;text-align:${isRtl ? 'left' : 'right'};font-weight:600;">€${parseFloat(item.unit_price || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else {
      itemsHtml = `<tr><td colspan="3" style="padding:12px 0;color:#6B7280;">#${order.id.substring(0, 8).toUpperCase()}</td></tr>`;
    }

    // 4) Жеткізу мекенжайы
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

    // 5) Клиентке email
    const customerEmailHtml = `
      <!DOCTYPE html>
      <html dir="${isRtl ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
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

    // 6) Админге хабарлама email
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
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;width:140px;">Order ID</td>
                <td style="padding:6px 0;font-family:monospace;font-weight:700;">#${esc(orderIdShort)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Date</td>
                <td style="padding:6px 0;">${new Date(order.created_at).toLocaleString('en-GB')}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Customer</td>
                <td style="padding:6px 0;"><strong>${esc(order.customer_name || order.shipping_name || 'N/A')}</strong></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Email</td>
                <td style="padding:6px 0;"><a href="mailto:${esc(order.customer_email || '')}" style="color:#FF6B00;">${esc(order.customer_email || 'N/A')}</a></td>
              </tr>
              ${order.customer_phone ? `
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Phone</td>
                <td style="padding:6px 0;"><a href="tel:${esc(order.customer_phone)}" style="color:#FF6B00;">📞 ${esc(order.customer_phone)}</a></td>
              </tr>` : ''}
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Total</td>
                <td style="padding:6px 0;font-weight:700;color:#FF6B00;font-size:1.1rem;">€${amount}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6B7280;font-size:0.85rem;">Status</td>
                <td style="padding:6px 0;"><span style="background:#22C55E;color:white;padding:2px 10px;border-radius:12px;font-size:0.8rem;font-weight:600;">${esc(order.status || 'paid')}</span></td>
              </tr>
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

    // 7) Клиентке email жіберу
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

    // 8) Админге email жіберу (ADMIN_EMAIL + ORDER_NOTIFICATION_EMAIL)
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

    return res.status(200).json({
      success: true,
      language,
      orderId: order.id,
      adminRecipients,
      ...results
    });
  } catch (err) {
    console.error('Order confirmation error:', err);
    return res.status(500).json({ error: err.message });
  }
};
