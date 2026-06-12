// Vercel Serverless Function: Generate trending products based on Google search trends
// Uses Gemini AI to analyze what people are searching for and generate product listings
// POST /api/trending-products
// Response: { success: true, products: [...] }

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';

async function searchUnsplashImages(query) {
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      // Fallback: use source.unsplash.com which works without API key
      return [`https://source.unsplash.com/400x400/?${encodeURIComponent(query + ' product')}`];
    }
    const resp = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' product')}&per_page=1&orientation=squarish`,
      {
        headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` }
      }
    );
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      return data.results.map(r => r.urls?.small || r.urls?.regular).filter(Boolean);
    }
    return [`https://source.unsplash.com/400x400/?${encodeURIComponent(query + ' product')}`];
  } catch (e) {
    return [`https://source.unsplash.com/400x400/?${encodeURIComponent(query + ' product')}`];
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const { count = 10, category = '' } = req.body || {};

    // Step 1: Use Gemini AI to analyze trending searches and generate product ideas
    const trendPrompt = `You are a market research and e-commerce expert. Your task is to identify the TOP ${count} most searched products globally right now (based on Google Trends, Amazon best-sellers, and current e-commerce data for 2025-2026).

${category ? `Focus specifically on the "${category}" category.` : 'Focus on general trending products across all categories (electronics, home, fashion, beauty, sports, etc.)'}

For EACH product, provide:
1. A compelling English product name (include brand if applicable, e.g. "Xiaomi", "Samsung", "Dyson")
2. A detailed HTML description with:
   - <h2>Features</h2> with <ul><li> bullet points (6-8 features, each starting with <strong>bold term</strong>:)
   - <hr /> separator
   - <h3>Specifications</h3> with <table> containing specifications
3. A realistic price in EUR (€5-€200 range)
4. A stock quantity (20-100)
5. A category slug (one word, lowercase, e.g. "electronics", "home", "fashion", "beauty", "sports")
6. An image search keyword (2-4 words for finding a relevant image, e.g. "wireless bluetooth earbuds")

IMPORTANT: These must be REAL trending products that people are actively searching for on Google in 2025-2026. Do NOT make up random products.

Reply ONLY in valid JSON format (no markdown, no code fences):
{
  "products": [
    {
      "name": "Product Name",
      "desc": "<h2>Features</h2><ul>...</ul><hr /><h3>Specifications</h3><table>...</table>",
      "price": 29.99,
      "stock": 50,
      "category_slug": "electronics",
      "image_keyword": "wireless bluetooth earbuds"
    }
  ]
}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You are a market research expert who analyzes Google Trends data. Reply ONLY with valid JSON.' }]
          },
          contents: [{ role: 'user', parts: [{ text: trendPrompt }] }],
          generationConfig: { maxOutputTokens: 8000, temperature: 0.4 }
        })
      }
    );

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response
    let jsonStr = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let trendData;
    try {
      trendData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw:', text.substring(0, 500));
      return res.status(500).json({ error: 'Failed to parse AI response', raw: text.substring(0, 500) });
    }

    if (!trendData.products || !Array.isArray(trendData.products)) {
      return res.status(500).json({ error: 'Invalid AI response format', data: trendData });
    }

    // Step 2: Look up categories in the database to find matching category IDs
    // We'll get the category from the database on the client side, so return slug for now

    // Step 3: Get images for each product
    const products = await Promise.all(
      trendData.products.map(async (p) => {
        const images = await searchUnsplashImages(p.image_keyword || p.name);
        return {
          name_en: p.name,
          desc_en: p.desc,
          price: p.price,
          stock: p.stock,
          category_slug: p.category_slug || 'electronics',
          images: images
        };
      })
    );

    return res.status(200).json({
      success: true,
      products,
      note: 'Images are from Unsplash. You can replace them with actual product photos.'
    });

  } catch (err) {
    console.error('trending-products error:', err);
    return res.status(500).json({ error: err.message });
  }
};
