// Vercel Serverless Function: Notify admin when new review is submitted
const { createClient } = require('@supabase/supabase-js');
const { sendMail, isConfigured } = require('./lib/email');

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

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
    console.error('SMTP not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const { reviewId } = req.body;
    if (!reviewId) return res.status(400).json({ error: 'reviewId required' });

    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('*, products(name_en, name_kz, name_ru, price, images)')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const productName = review.products
      ? (review.products.name_kz || review.products.name_ru || review.products.name_en || 'Product')
      : 'Unknown product';
    
    const productPrice = review.products ? parseFloat(review.products.price).toFixed(2) : '';
    const productImage = review.products?.images?.[0] || '';

    const result = await sendMail({
      to: 'serjanyelemesov@gmail.com',
      subject: `Жаңа пікір: ${productName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAFAFA; margin: 0; padding: 2rem;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #FF6B00, #E05E00); padding: 2rem; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 1.5rem;">
                <svg class="icon icon-lg" style="color:white;vertical-align:middle;margin-right:8px"><use href="#icon-star"/></svg>
                Жаңа пікір келді!
              </h1>
            </div>

            <div style="padding: 2rem;">
              
              <!-- ПІКІР (ЕҢ БІРІНШІ) -->
              <div style="background: #FFF9E6; border-left: 4px solid #FFC107; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-sm" style="color:#FFC107"><use href="#icon-star"/></svg>
                  Бағалау:
                </p>
                <p style="margin: 0; font-size: 2rem; color: #FFC107; display:flex;gap:4px;">
                  ${Array(review.rating).fill('<svg class="icon icon-md" style="color:#FFC107"><use href="#icon-star"/></svg>').join('')}
                  ${Array(5 - review.rating).fill('<svg class="icon icon-md" style="color:#ccc"><use href="#icon-star-outline"/></svg>').join('')}
                </p>
              </div>

              <div style="background: #F0F9FF; border-left: 4px solid #0EA5E9; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-sm" style="color:#0EA5E9"><use href="#icon-message"/></svg>
                  Пікір:
                </p>
                <p style="margin: 0; font-size: 1.1rem; color: #1F2937; line-height: 1.6;">${review.comment || 'No comment'}</p>
              </div>

              <!-- Клиент ақпараты -->
              <div style="background: #F3F4F6; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="margin: 0.25rem 0; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-xs" style="color:#666"><use href="#icon-user"/></svg>
                  <strong>Клиент:</strong> ${review.customer_name || 'Anonymous'}
                </p>
                ${review.customer_email ? `<p style="margin: 0.25rem 0; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-xs" style="color:#666"><use href="#icon-mail"/></svg>
                  <strong>Email:</strong> ${review.customer_email}
                </p>` : ''}
                <p style="margin: 0.25rem 0; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-xs" style="color:#666"><use href="#icon-clock"/></svg>
                  <strong>Уақыты:</strong> ${new Date(review.created_at).toLocaleString('kk-KZ')}
                </p>
                ${review.verified ? `<p style="margin: 0.25rem 0; color: #059669; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-xs" style="color:#059669"><use href="#icon-check"/></svg>
                  <strong>Расталған сатып алушы</strong>
                </p>` : ''}
              </div>

              <!-- ТАУАР (ПІКІРДЕН КЕЙІН) -->
              <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666; display:flex;align-items:center;gap:6px;">
                  <svg class="icon icon-sm" style="color:#666"><use href="#icon-package"/></svg>
                  Тауар:
                </p>
                <div style="display: flex; gap: 1rem; align-items: center;">
                  ${productImage ? `<img src="${productImage}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">` : ''}
                  <div>
                    <p style="margin: 0; font-weight: 600; color: #1F2937;">${productName}</p>
                    ${productPrice ? `<p style="margin: 0.25rem 0 0 0; color: #059669; font-weight: 600;">€${productPrice}</p>` : ''}
                  </div>
                </div>
              </div>

              <!-- Фото -->
              ${review.images && review.images.length > 0 ? `
                <div style="margin-bottom: 1.5rem;">
                  <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666; display:flex;align-items:center;gap:6px;">
                    <svg class="icon icon-sm" style="color:#666"><use href="#icon-image"/></svg>
                    Фото (${review.images.length}):
                  </p>
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${review.images.map(url => `<img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">`).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Admin Actions -->
              <div style="text-align: center; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0 0 1rem 0; color: #6B7280; font-size: 0.9rem;">Пікірді басқару:</p>
                <a href="${SITE_URL}/admin/reviews.html" 
                   style="display: inline-flex; align-items: center; gap: 6px; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 0 0.5rem;">
                  <svg class="icon icon-sm" style="color:white"><use href="#icon-settings"/></svg>
                  Админ панель
                  <svg class="icon icon-sm" style="color:white"><use href="#icon-arrow-right"/></svg>
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
};