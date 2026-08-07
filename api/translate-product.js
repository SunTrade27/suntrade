// Vercel Serverless Function: Unified translate-product endpoint.
//
// One file, three modes:
//   1. FREE on-demand (no AI / no LLM) — MyMemory → LibreTranslate fallback,
//      cached in products table for next visitor.
//        POST /api/translate-product
//        Body: { mode: 'free', product_id?, name_en?, desc_en?, target_lang }
//        Responds: { success, translation: { name, desc }, cached?, wrote_to_db?, failed? }
//
//   2. AI HTML format/cleanup (for admin's HTML-pretty button — Gemini)
//        Body: { action: 'format', html }
//        Responds: { success, html }
//
//   3. AI batch translate (Gemini, used by admin + cron-translate)
//        Body: { name_en, desc_en }        (no mode → defaults to ai)
//        Responds: { success, translations: { kz: { name, desc }, ... } }
//
// Mode 1 was previously a separate file (translate-on-demand.js) which
// pushed the project over the Vercel Hobby plan's 12-function limit. Combining
// here keeps a single translation entry point without losing any feature.

// ===== Free mode constants and helpers =====

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wmznfdngucpsmjbxiwzn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const FREE_SUPPORTED_LANGS = ['en', 'kz', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'pt', 'nl', 'pl', 'ar'];
// ISO 639-1 codes used by both MyMemory and LibreTranslate. SunTrade uses
// "kz" as a friendly site key but it's properly "kk" in ISO (Kazakhstan's
// language is Kazakh = "kk", while "kz" is the country code).
const ISO_CODES = {
  en: 'en', kz: 'kk', ru: 'ru', de: 'de', fr: 'fr', es: 'es',
  it: 'it', tr: 'tr', pt: 'pt', nl: 'nl', pl: 'pl', ar: 'ar'
};

// Public LibreTranslate mirrors. MyMemory is the primary translator (faster
// + more reliable); LibreTranslate is the fallback when MyMemory is down
// or for inputs over its per-request limit. Some public instances are
// run by volunteers and may be slow / down — that's why we have multiple.
const LT_INSTANCES = [
  'https://translate.terraprint.co',
  'https://translate.argosopentech.com',
  'https://libretranslate.de',
  'https://lt.vern.cc'
];

// Per-instance in-process cache. Vercel keeps a warm instance alive for
// a few minutes so this absorbs quick repeat visitors (same text + lang)
// without re-hitting the free APIs. Cold starts = cold cache; the DB
// write-back below is the durable cache.
const lcCache = new Map();
function lcGet(key)    { return lcCache.get(key); }
function lcSet(key, v) { lcCache.set(key, v); if (lcCache.size > 500) lcCache.clear(); }

function freeReadBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

// Translate one piece of plain text. HTML in markup mode is preserved by
// passing it through as-is (translators are character-agnostic — they
// leave <b>, <ul>, etc. untouched). LibreTranslate gets format='html'
// when the input looks like markup so it doesn't re-flow whitespace
// around tags; MyMemory is character-agnostic and ignores the flag.
async function freeTranslateText(text, targetLang) {
  if (!text || !text.trim()) return text || '';
  if (targetLang === 'en') return text;

  const looksLikeHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(text);
  const cacheKey = `${targetLang}::${text.length}::${text.slice(0, 240)}`;
  const cached = lcGet(cacheKey);
  if (cached != null) return cached;

  const code = ISO_CODES[targetLang];

  // For inputs above the MyMemory anonymous per-request limit, skip
  // MyMemory entirely. Submitting a 5000-char string to MyMemory anonymous
  // gets a 403 that still counts against the daily 5k char quota — better
  // to spend that quota on a translation that will actually return.
  // LibreTranslate's per-request limit is much higher and gets format='html'
  // for markup preservation.
  const MM_SAFE_LIMIT = 480;
  const isLong = text.length > MM_SAFE_LIMIT;

  if (!isLong) {
    // 1) MyMemory — primary because it's faster and has a generous free tier.
    try {
      const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${code}`;
      const resp = await fetch(mmUrl, { headers: { 'User-Agent': 'SunTrade/1.0 (+suntrade.store)' } });
      if (resp.ok) {
        const data = await resp.json();
        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
          const out = data.responseData.translatedText;
          lcSet(cacheKey, out);
          return out;
        }
      }
    } catch (e) {
      console.warn('[translate-product:free] MyMemory threw:', e.message);
    }
  }

  // 2) LibreTranslate — fallback (also used directly for long text).
  for (const base of LT_INSTANCES) {
    try {
      const resp = await fetch(`${base}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: 'en',
          target: code,
          format: looksLikeHtml ? 'html' : 'text'
        })
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data && typeof data.translatedText === 'string' && data.translatedText.trim()) {
        lcSet(cacheKey, data.translatedText);
        return data.translatedText;
      }
    } catch (e) {
      console.warn('[translate-product:free] LibreTranslate instance failed:', base, e.message);
    }
  }

  console.error('[translate-product:free] All free translators failed for lang', targetLang);
  return text; // fallback to English
}

function freeReadKey() {
  return SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || '';
}

async function freeFetchProductRow(productId) {
  const key = freeReadKey();
  if (!key) return null;
  const cols = [
    'id', 'name_en', 'desc_en',
    ...FREE_SUPPORTED_LANGS.flatMap(l => [`name_${l}`, `desc_${l}`])
  ];
  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=${cols.join(',')}&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!resp.ok) {
    console.warn('[translate-product:free] fetchProductRow HTTP', resp.status);
    return null;
  }
  const arr = await resp.json();
  return arr && arr[0] ? arr[0] : null;
}

async function freeWriteTranslation(productId, lang, name, desc) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return false; // anon can't write — fine
  const fields = { updated_at: new Date().toISOString() };
  if (name) fields[`name_${lang}`] = name;
  if (desc !== undefined) fields[`desc_${lang}`] = desc;
  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(fields)
  });
  if (!resp.ok) {
    console.warn('[translate-product:free] writeTranslation HTTP', resp.status);
    return false;
  }
  return true;
}

// ===== Gemini mode (admin HTML cleanup + admin/cron translate) =====

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

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
            generationConfig: { maxOutputTokens: config.maxTokens || 4000, temperature: config.temperature ?? 0.2 }
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

// ===== Handler =====

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')  return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};

    // ===== Mode 1: FREE on-demand translation (no AI) =====
    if (body.mode === 'free') {
      const targetLang = body.target_lang;
      if (!FREE_SUPPORTED_LANGS.includes(targetLang)) {
        return res.status(400).json({ error: 'Invalid target_lang', supported: FREE_SUPPORTED_LANGS });
      }
      if (targetLang === 'en') {
        return res.status(200).json({
          success: true,
          translation: { name: body.name_en || '', desc: body.desc_en || '' }
        });
      }

      let product = null;
      let productId = body.product_id;
      let sourceName = '';
      let sourceDesc = '';
      let existingName = '';
      let existingDesc = '';

      if (productId) {
        product = await freeFetchProductRow(productId);
        if (!product) {
          return res.status(200).json({
            success: false,
            error: 'Product not found or no Supabase credentials',
            translation: { name: '', desc: '' }
          });
        }
        if (!product.name_en) {
          return res.status(200).json({
            success: false,
            error: 'Product has no English source',
            translation: { name: '', desc: '' }
          });
        }
        sourceName = product.name_en;
        sourceDesc = product.desc_en || '';
        existingName = product[`name_${targetLang}`] || '';
        existingDesc = product[`desc_${targetLang}`] || '';
      } else {
        if (!body.name_en) return res.status(400).json({ error: 'name_en or product_id required' });
        sourceName = body.name_en;
        sourceDesc = body.desc_en || '';
      }

      // DB cache hit?
      // Real cache hit requires: target column has actual translated content,
      // not just the English source mirrored into target. A leftover "English"
      // value in name_kz (from prior admins or cron failures) should NOT be
      // treated as cached — we want a fresh translation instead.
      const existingIsEnglishCopy = !!(existingName.trim() &&
        sourceName.trim() &&
        existingName.trim().toLowerCase() === sourceName.trim().toLowerCase());
      const existingDescIsEnglishCopy = !!(existingDesc.trim() &&
        sourceDesc.trim() &&
        existingDesc.trim().toLowerCase().slice(0, 200) ===
        sourceDesc.trim().toLowerCase().slice(0, 200));
      if (existingName.trim() &&
          (sourceDesc.trim() === '' || existingDesc.trim()) &&
          !existingIsEnglishCopy && !existingDescIsEnglishCopy) {
        return res.status(200).json({
          success: true,
          cached: true,
          translation: { name: existingName, desc: existingDesc || '' }
        });
      }

      // Translate both in parallel.
      const [translatedName, translatedDesc] = await Promise.all([
        freeTranslateText(sourceName.substring(0, 5000), targetLang),
        sourceDesc ? freeTranslateText(sourceDesc.substring(0, 5000), targetLang) : Promise.resolve('')
      ]);

      const failed = translatedName === sourceName && translatedDesc === sourceDesc;

      let wroteToDb = false;
      if (productId && !failed) {
        try {
          wroteToDb = await freeWriteTranslation(productId, targetLang, translatedName, translatedDesc);
          if (wroteToDb) console.log(`[translate-product:free] cached ${productId} → ${targetLang}`);
        } catch (e) {
          console.warn('[translate-product:free] write-back failed:', e.message);
        }
      }

      return res.status(200).json({
        success: true,
        failed,
        wrote_to_db: wroteToDb,
        translation: { name: translatedName, desc: translatedDesc }
      });
    }

    // ===== Modes 2 & 3 require Gemini AI =====
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

    // ===== Mode 2: AI HTML format/cleanup (admin) =====
    if (body.action === 'format') {
      const { html } = body;
      if (!html) return res.status(400).json({ error: 'html is required' });

      try {
        const sysInstruction = `You are an HTML cleanup expert for an e-commerce store (SunTrade). The input HTML is a product description that was pasted from a supplier site (e.g. Alibaba, 1688, Taobao) and may contain junk UI artifacts from those sites. Your job is to extract ONLY the real product description content and re-format it beautifully.

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

3. RE-FORMAT for beauty using these specific HTML structures:
   - Use <h2> for major sections ("Features", "Specifications", "Package Includes", etc.)
   - Use <h3> for sub-sections within a major section
   - Do NOT add a product title heading — the product name is already shown as an h1 outside the description
   - Wrap every paragraph of text in <p> tags
   - Use <ul><li> for feature lists, <ol><li> for step-by-step instructions
   - For feature lists, start each <li> with <strong>Key Term:</strong> followed by the description
   - Use <table><thead><tr><th> for spec table headers and <tbody><tr><td> for data rows (do NOT invent specs; only keep what's in the source)
   - Use <strong> for emphasis on key terms within paragraphs
   - Use <hr /> between major sections (e.g., between Features and Specifications) for visual separation
   - If the source has a highlighted tip, note, or callout, wrap it in: <div class="desc-callout"><strong>Note:</strong> the text here</div>
   - Add empty lines between major sections for breathing room

4. DO NOT add, invent, or guess any product information that isn't in the source.

5. DO NOT change, translate, or rephrase the product text — keep it word-for-word. Only restructure.

6. All <img> tags must have: loading="lazy" and the original src unchanged.

7. Output: reply with ONLY the cleaned HTML (no markdown, no code fences, no explanations, no preamble). The HTML should be valid and ready to insert into a webpage.`;

        const result = await callGemini(html, sysInstruction, { maxTokens: 4000, temperature: 0.1 });
        let cleanedHtml = result.text || html;

        cleanedHtml = cleanedHtml
          .replace(/^```html?\s*/i, '')
          .replace(/^```\s*$/gm, '')
          .replace(/```$/g, '')
          .trim();

        if (cleanedHtml) {
          cleanedHtml = cleanedHtml.replace(/<img(?![^>]*loading=)([^>]*)>/gi, '<img loading="lazy"$1>');
          cleanedHtml = cleanedHtml.replace(/<img([^>]*?)\sstyle=(["'])([^"']*?)\2/gi, (m, attrs, q, css) => {
            if (/max-width/i.test(css)) return m;
            return `<img${attrs} style="max-width:100%;height:auto;border-radius:8px;${css}"`;
          });
        }
        if (!cleanedHtml) cleanedHtml = html;
        return res.status(200).json({ success: result.model ? true : false, html: cleanedHtml });
      } catch (formatErr) {
        console.error('Format error:', formatErr);
        return res.status(200).json({ success: false, html, error: formatErr.message });
      }
    }

    // ===== Mode 3: AI batch translate (admin + cron) =====
    const { name_en, desc_en } = body;
    if (!name_en) return res.status(400).json({ error: 'name_en is required' });

    const targetLangs = {
      kz: 'Kazakh', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish',
      it: 'Italian', tr: 'Turkish', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ar: 'Arabic'
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

        const result = await callGemini(prompt, `You are a professional e-commerce translator. Translate from English to ${langName}. Reply ONLY with valid JSON.`, {
          maxTokens: 1000, temperature: 0.2
        });
        const text = result.text || '';
        if (!text) {
          translations[langCode] = { name: '', desc: '' };
          continue;
        }
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
          console.error(`JSON parse error for ${langCode}:`, parseErr.message);
          translations[langCode] = { name: '', desc: '' };
        }
      } catch (langErr) {
        console.error(`Translation error for ${langCode}:`, langErr.message);
        translations[langCode] = { name: '', desc: '' };
      }
    }

    return res.status(200).json({ success: true, translations });
  } catch (err) {
    console.error('translate-product error:', err);
    return res.status(500).json({ error: err.message });
  }
};
