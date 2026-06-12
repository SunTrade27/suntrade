// SunTrade Dynamic Sitemap - Vercel Serverless Function
// Generates an XML sitemap listing all active product pages
// Auto-discovers product URLs from Supabase
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const baseUrl = 'https://www.suntrade.store';

  // Set XML content type
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    if (!process.env.SUPABASE_SERVICE_KEY) {
      // Fallback: return static sitemap if no DB access
      return res.status(200).send(generateStaticSitemap(baseUrl));
    }

    // Fetch all active products
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name_en, updated_at, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Sitemap DB error:', error);
      return res.status(200).send(generateStaticSitemap(baseUrl));
    }

    const staticPages = [
      { loc: baseUrl, priority: '1.0', changefreq: 'daily' },
      { loc: `${baseUrl}/catalog.html`, priority: '0.9', changefreq: 'daily' },
      { loc: `${baseUrl}/cart.html`, priority: '0.3', changefreq: 'monthly' },
      { loc: `${baseUrl}/reviews.html`, priority: '0.7', changefreq: 'weekly' },
      { loc: `${baseUrl}/auth.html`, priority: '0.3', changefreq: 'monthly' },
      { loc: `${baseUrl}/privacy-policy.html`, priority: '0.3', changefreq: 'monthly' },
      { loc: `${baseUrl}/terms.html`, priority: '0.3', changefreq: 'monthly' },
    ];

    const productUrls = (products || []).map(p => ({
      loc: `${baseUrl}/product.html?id=${p.id}`,
      lastmod: p.updated_at || p.created_at || new Date().toISOString(),
      priority: '0.8',
      changefreq: 'weekly',
    }));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${[...staticPages, ...productUrls].map(page => `
  <url>
    <loc>${escapeXml(page.loc)}</loc>
    ${page.lastmod ? `<lastmod>${new Date(page.lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('')}
</urlset>`;

    return res.status(200).send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    return res.status(200).send(generateStaticSitemap(baseUrl));
  }
};

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateStaticSitemap(baseUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/catalog.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${baseUrl}/cart.html</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>
  <url><loc>${baseUrl}/reviews.html</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${baseUrl}/auth.html</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>
  <url><loc>${baseUrl}/privacy-policy.html</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>
  <url><loc>${baseUrl}/terms.html</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>
</urlset>`;
}
