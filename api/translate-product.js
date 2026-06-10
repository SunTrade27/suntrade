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
                  text: `You are an HTML cleanup expert for an e-commerce store. Clean up and format the HTML product description.

Rules:
1. Keep images, links, tables, lists, and all content intact
2. Make it look professional and well-structured using proper HTML
3. Remove inline styles EXCEPT width/height/max-width on images and table borders
4. Add proper paragraph tags, headings, and structure
5. Ensure the HTML is valid
6. Keep the exact same text content - only improve formatting
7. Wrap text in <p> tags where appropriate
8. Ensure images have max-width:100% and height:auto
9. Reply ONLY with the cleaned HTML, nothing else, no markdown formatting`
                }]
              },
              contents: [{ role: 'user', parts: [{ text: html }] }],
              generationConfig: { maxOutputTokens: 2000, temperature: 0.2 }
            })
          }
        );

        const data = await resp.json();
        let cleanedHtml = data.candidates?.[0]?.content?.parts?.[0]?.text || html;

        // Remove any markdown code blocks
        cleanedHtml = cleanedHtml.replace(/^```html?\s*/gm, '').replace(/^```\s*$/gm, '').trim();

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
