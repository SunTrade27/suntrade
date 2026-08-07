// Vercel Serverless Function: On-demand client-side translation
// Translates a single product's name + description from English to ONE target language.
// Cheaper than /api/translate-product (which always translates to all 11 languages).
//
// POST /api/translate-on-demand
// Body: { texts: { name: string, desc: string }, target_lang: 'kz'|'ru'|... }
// Response: { success: true, translations: { name, desc } }
//           { success: false, error: string }

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

const LANG_NAMES = {
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
  ar: 'Arabic',
  en: 'English'
};

async function callGemini(prompt, systemInstruction, config = {}) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');

  for (const model of GEMINI_MODELS) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: config.maxTokens || 4000,
              temperature: config.temperature ?? 0.2
            }
          })
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return { model, text };
      } else {
        const errBody = await resp.text().catch(() => '');
        console.warn(`Gemini model ${model} failed (${resp.status}), trying next...`);
      }
    } catch (e) {
      console.warn(`Gemini model ${model} error:`, e.message);
    }
  }
  return { model: '', text: '' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GEMINI_API_KEY) {
    // Soft-fail so the client can continue showing English without breaking the page
    return res.status(200).json({ success: false, error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const body = req.body || {};
    const { texts, target_lang } = body;

    if (!texts || typeof texts !== 'object') {
      return res.status(400).json({ error: 'texts is required' });
    }
    if (!target_lang || !LANG_NAMES[target_lang]) {
      return res.status(400).json({ error: 'valid target_lang is required (one of: ' + Object.keys(LANG_NAMES).join(', ') + ')' });
    }

    const langName = LANG_NAMES[target_lang];

    // Nothing to translate? Return success with empty strings.
    if (!texts.name && !texts.desc) {
      return res.status(200).json({
        success: true,
        translations: { name: '', desc: '' }
      });
    }

    const prompt = `You are a professional e-commerce translator. Translate the following product information from English to ${langName}.

Product Name: "${texts.name || ''}"
Product Description: "${(texts.desc || '').slice(0, 8000)}"

Rules — STRICT:
1. Translate naturally — do NOT add, remove, or invent information
2. Keep ALL HTML tags in the description intact (<b>, <i>, <img>, <ul>, <li>, <br>, <p>, <div>, <table>, <tr>, <td>, <th>, <h2>, <h3>, <hr>, etc.)
3. Do NOT translate brand names (Apple, Samsung, Xiaomi etc.), model numbers, or prices
4. If description is empty, return empty string for desc
5. Reply ONLY in valid JSON — no markdown, no code fences, no explanations:
{"name": "<translated name>", "desc": "<translated description>"}`;

    const sysInstruction = `You are a professional e-commerce translator. Always translate from English to ${langName}. Reply ONLY with valid JSON, never with markdown or extra text.`;

    const result = await callGemini(prompt, sysInstruction, { maxTokens: 4000, temperature: 0.2 });
    const text = result.text || '';

    if (!text) {
      return res.status(200).json({
        success: false,
        error: 'all_models_failed',
        translations: { name: '', desc: '' }
      });
    }

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    try {
      const parsed = JSON.parse(jsonStr);
      return res.status(200).json({
        success: true,
        model: result.model,
        translations: {
          name: parsed.name || texts.name || '',
          desc: parsed.desc || texts.desc || ''
        }
      });
    } catch (parseErr) {
      console.warn('translate-on-demand: JSON parse failed:', parseErr.message, 'Raw:', text.slice(0, 300));
      // Fallback: return originals so client doesn't break (UI stays in English)
      return res.status(200).json({
        success: false,
        error: 'parse_error',
        translations: { name: texts.name || '', desc: texts.desc || '' }
      });
    }
  } catch (err) {
    console.error('translate-on-demand error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
};
