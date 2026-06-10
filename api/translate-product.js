// Vercel Serverless Function: Translate product name & description to all languages
// OR format/clean up product description HTML
// Uses Gemini AI (same as chat.js)
//
// POST /api/translate-product
// Body (translate): { name_en: string, desc_en: string }
// Body (format): { action: 'format', html: string }
// Response (translate): { success: true, translations: { kz: { name, desc }, ... } }
// Response (format): { success: true, html: string }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const body = req.body || {};

    // ===== FORMAT ACTION =====
    if (body.action === 'format') {
      const { html } = body;
      if (!html) return res.status(400).json({ error: 'html is required' });

      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: `You are an HTML cleanup expert for an e-commerce store (SunTrade). The input HTML is a product description that was pasted from a supplier site (e.g. Alibaba, 1688, Taobao) and may contain junk UI artifacts from those sites. Your job is to extract ONLY the real product description content and re-format it beautifully.

RULES — STRICT:

1. REMOVE these site UI artifacts (they are NOT product content):
   - "Report abuse", "Report this item", "Report image"
   - "Frequently bought together", "Customers who bought this", "Customers also bought", "You may also like", "Related products", "Sponsored products", "Edit selections"
   - "Add to Cart", "Buy Now", "Shop Now", "Order Now", "Contact Supplier", "Start Order", "Send Inquiry", "Chat Now", "Negotiate", "Request Quote", "Message Supplier"
   - "Add to Wishlist", "Add to Favorites", "Share"
   - Navigation breadcrumbs, header/footer text, "Home > ... > ..."
   - Cookie banners: "We use cookies", "Accept cookies", "I agree", "Got it", "Learn more"
   - "Skip to content", "Back to top", "Loading...", "Please wait..."
   - "Subscribe to newsletter", "Sign up for newsletter", "Follow us on..."
   - "Translation missing", "Powered by ...", "Copyright ©", "All rights reserved"
   - "Free shipping", "Secure payment", "Limited time offer", "Best seller", "Hot sale", "Promotion", "Discount"
   - SKU numbers, "Vendor info", "Seller info", "Store info"

2. KEEP all real product content:
   - Product name, key features, specifications
   - All product images (keep <img> tags with their src exactly as given)
   - All product description text, bullet lists, tables
   - Size charts, specification tables, package contents

3. RE-FORMAT for beauty:
   - Use <h2> for the main product title, <h3> for section headings ("Features", "Specifications", "Package Includes", etc.)
   - Wrap every paragraph of text in <p> tags
   - Use <ul><li> for feature lists, <ol><li> for step-by-step instructions
   - Use <table><tr><td> for spec tables (do NOT invent specs; only keep what's in the source)
   - Add <strong> for emphasis on key terms
   - Add <br> between list items only if the original had line breaks
   - Add an empty line (extra <br> or <p></p>) between major sections for breathing room

4. DO NOT add, invent, or guess any product information that isn't in the source.

5. DO NOT change, translate, or rephrase the product text — keep it word-for-word. Only restructure.

6. All <img> tags must have: loading="lazy" and the original src unchanged.

7. Output: reply with ONLY the cleaned HTML (no markdown, no code fences, no explanations, no preamble). The HTML should be valid and ready to insert into a webpage.`
                }]
              },
              contents: [{ role: 'user', parts: [{ text: html }] }],
              generationConfig: { maxOutputTokens: 4000, temperature: 0.1 }
            })
          }
        );

        const data = await resp.json();
        let cleanedHtml = data.candidates?.[0]?.content?.parts?.[0]?.text || html;

        // Remove any markdown code blocks Gemini might wrap the answer in
        cleanedHtml = cleanedHtml
          .replace(/^```html?\s*/i, '')
          .replace(/^```\s*$/gm, '')
          .replace(/```$/g, '')
          .trim();

        // Ensure images have lazy loading and responsive sizing
        if (cleanedHtml) {
          cleanedHtml = cleanedHtml.replace(/<img(?![^>]*loading=)([^>]*)>/gi, '<img loading="lazy"$1>');
          cleanedHtml = cleanedHtml.replace(/<img([^>]*?)\sstyle=(["'])([^"']*?)\2/gi, (m, attrs, q, css) => {
            if (/max-width/i.test(css)) return m;
            return `<img${attrs} style="max-width:100%;height:auto;border-radius:8px;${css}"`;
          });
        }

        if (!cleanedHtml) cleanedHtml = html;

        return res.status(200).json({ success: true, html: cleanedHtml });
      } catch (formatErr) {
        console.error('Format error:', formatErr);
        return res.status(200).json({ success: false, html, error: formatErr.message });
      }
    }

    // ===== TRANSLATE ACTION =====
    const { name_en, desc_en } = body;
    if (!name_en) return res.status(400).json({ error: 'name_en is required' });

    const targetLangs = {
      kz: 'Kazakh',
      ru: 'Russian',
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      it: 'Italian',
      tr: 'Turkish',
      pt: 'Portuguese',
      nl: 'Dutch',
      pl: 'Polish',
      ar: 'Arabic'
    };

    const translations = {};

    for (const [langCode, langName] of Object.entries(targetLangs)) {
      try {
        const prompt = `You are a professional translator for an e-commerce store. Translate the following product information from English to ${langName}.

Product Name: "${name_en}"
Product Description: "${desc_en || ''}"

Rules:
1. Translate naturally and accurately — do NOT add or remove information
2. Keep HTML tags in the description intact (e.g., <b>, <i>, <img>, <ul>, <li>, <br>, <p>, <div>, etc.)
3. Do NOT translate brand names or prices
4. Reply ONLY in valid JSON format: {"name": "translated_name", "desc": "translated_description"}
5. The "desc" field should preserve any HTML formatting exactly as in the original
6. If description is empty, return empty string for desc`;

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: `You are a professional e-commerce translator. Translate from English to ${langName}. Reply ONLY with valid JSON.` }]
              },
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1000, temperature: 0.2 }
            })
          }
        );

        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Extract JSON from response (handle potential markdown wrapping)
        let jsonStr = text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        try {
          const parsed = JSON.parse(jsonStr);
          translations[langCode] = {
            name: parsed.name || name_en,
            desc: parsed.desc || (desc_en || '')
          };
        } catch (parseErr) {
          console.error(`JSON parse error for ${langCode}:`, parseErr, 'Raw:', text);
          // Fallback: use the raw response or original
          translations[langCode] = {
            name: text.replace(/^["']|["']$/g, '').substring(0, 200) || name_en,
            desc: desc_en || ''
          };
        }
      } catch (langErr) {
        console.error(`Translation error for ${langCode}:`, langErr);
        translations[langCode] = { name: name_en, desc: desc_en || '' };
      }
    }

    return res.status(200).json({ success: true, translations });
  } catch (err) {
    console.error('translate-product error:', err);
    return res.status(500).json({ error: err.message });
  }
};
