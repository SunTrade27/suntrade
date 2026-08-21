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
// Existing Vercel projects may use the shorter SUPABASE_SERVICE_KEY name.
// Accept both names so translation write-back is not silently disabled.
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
// The anon key is public (it ships in js/supabase-client.js) and is needed to
// READ product rows for on-demand translation. Previously the hardcoded value
// was removed, which silently broke every free-mode request whenever the
// SUPABASE_ANON_KEY env var wasn't set on Vercel (reads then failed with
// "Product not found or no Supabase credentials"). Falling back to the public
// key keeps reads working out of the box; WRITES still require the service-role
// key and are skipped otherwise.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

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
  'https://lt.vern.cc',
  'https://translate.fortytwo-it.com',
  'https://trans.zillyhuhn.com',
  'https://lt.projectsegfau.lt'
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

// Pre-clean the HTML description BEFORE handing it to MyMemory / LibreTranslate.
// Why: Alibaba / 1688 / Taobao / AliExpress descriptions are full of UI shells
// (<!--StartFragment-->…<!--EndFragment-->, inline `style="--tw-…"`, data-spm
// tracking attrs, decorative <h1>/<h2> section headers). Translators preserve
// every visible tag, which means a) the user pays for translating CSS garbage,
// b) the output written back to desc_XX is full of the same junk, which then
// re-renders in the page on every visit. Stripping first gives a much smaller,
// faster, cleaner translation AND a clean cache write-back.
// Strip HTML tags and collapse whitespace so two differently-formatted
// versions of the same English text can be compared (used to detect
// "English source copied into a target column").
function stripText(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isSafeLabelTranslation(value, source) {
  const text = String(value || '').trim();
  if (!text || /[<>]/.test(text) || /javascript:|fontdatabase|uherhiy|data:image|function\s*\(/i.test(text)) return false;
  // Do not show a long provider echo as a translated short label.
  if (source && stripText(text) === stripText(source)) return false;
  return text.length <= Math.max(120, String(source || '').length * 4);
}

// Free providers can translate some chunks and echo the remaining English
// chunks when a quota is reached. Detect only a clearly dominant unchanged
// chunk: shorter brand names, model numbers, and spec labels may legitimately
// remain in English inside a Kazakh/Russian translation.
function containsUntranslatedSourceChunk(value, source) {
  const translated = stripText(value);
  const original = stripText(source);
  if (!translated || !original) return false;
  if (translated === original) return true;
  // A provider may translate only the tail and leave the opening English
  // paragraph intact. Catch that mixed response before it reaches the DB.
  if (original.length >= 160 && translated.length <= original.length * 1.35 &&
      translated.startsWith(original.slice(0, 160))) return true;
  // Long descriptions are intentionally bounded for Gemini. If it returns
  // that bounded English prefix, comparing it to 450-character chunks alone
  // misses the echo because the returned value is much longer than one chunk.
  if (translated.length >= 80 && original.startsWith(translated)) return true;
  const sourceLooksLikeHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(String(source || ''));
  const chunks = sourceLooksLikeHtml ? htmlChunks(String(source), 450) : sentenceChunks(String(source), 450);
  return chunks.some(chunk => {
    const visibleChunk = stripText(chunk);
    // Require a long exact echo and a translated result that is not much
    // longer than the echoed source. This avoids rejecting normal unchanged
    // product names/brands while catching a mostly-English fallback response.
    return visibleChunk.length >= 80 &&
      translated.length <= visibleChunk.length * 1.35 &&
      translated.includes(visibleChunk);
  });
}

function freePreCleanHtml(html) {
  if (!html || typeof html !== 'string') return html || '';
  let cleaned = html
    // HTML comments first — wrapper comments in particular
    .replace(/<!--[\s\S]*?-->/g, '')
    // Supplier boilerplate headers — we render our own h3 above the description
    .replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, '')
    .replace(/<h[1-6]\b[^>]*\/?>/gi, '')
    // Inline style + data- tracking attributes translate to garbage; drop them
    .replace(/\s+style\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+style\s*=\s*'[^']*'/gi, '');

  // CRITICAL: Extract lazy-loaded image URLs from data-* attributes BEFORE
  // stripping them. Supplier sites (Alibaba/1688/AliExpress) put the real
  // image URL in data-src, data-lazy-src, etc. while src is empty/placeholder.
  // Without this step, the translated description saved to DB loses all
  // image URLs, causing broken images on the product page.
  cleaned = cleaned.replace(
    /<img\b([^>]*?)\bdata-(src|lazy-src|original|url|image-src|ks-lazyload|actualsrc)\s*=\s*["']([^"']*?)["']([^>]*?)>/gi,
    (match, before, attr, url, after) => {
      if (!url) return match;
      // Only override src if it's empty, a data: URI, or missing
      const combined = before + after;
      if (/\bsrc\s*=\s*["'](?!data:)[^"']+["']/i.test(combined)) return match;
      return `<img src="${url}"${before}${after}>`;
    }
  );

  cleaned = cleaned
    .replace(/\s+data-[a-z0-9-]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+data-[a-z0-9-]+\s*=\s*'[^']*'/gi, '')
    // aria-* rarely carries meaning in product descriptions
    .replace(/\s+aria-[a-z-]+\s*=\s*"[^"]*"/gi, '')
    // Event handlers + javascript: hrefs
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"')
    // Supplier UI shells
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<button\b[^>]*\/?>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    .replace(/<div\b[^>]*?\bclass\s*=\s*["'][^"']*(?:breadcrumb|nav-|menu|sidebar|footer|cookie|banner|popup|modal|overlay|tab-?|filter|action-?bar|button-?bar|related-?product|recommend|sku|highlight|callout)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    // Trim class attributes that are pure-supplier (we let friendly class names through)
    .replace(/\sclass\s*=\s*"[^"]*(?:alibaba|1688|taobao|aliexpress|supplier|alicdn|sc-|tm-)[^"]*"/gi, '')
    .trim();
}

// Translate one piece of plain text. HTML in markup mode is preserved by
// passing it through as-is (translators are character-agnostic — they
// leave <b>, <ul>, etc. untouched). LibreTranslate gets format='html'
// when the input looks like markup so it doesn't re-flow whitespace
// around tags; MyMemory is character-agnostic and ignores the flag.
//
// For LONG inputs the strategy is to chunk into ~480-char paragraphs
// (splitting at <p>, <li>, <tr> boundaries for HTML, or sentence boundaries
// for plain text). Each chunk is translated independently and reassembled.
// This is far more reliable than a single mega-request because:
//   - MyMemory's anonymous per-request limit is ~500 chars/day/IP, and a
//     5 KB single request gets 403 BUT still counts against the daily
//     quota. Chunking keeps each call under the limit so we actually get
//     answers back.
//   - LibreTranslate public mirrors all rate-limit at request count, not
//     just total chars; chunking also gets us better coverage there.
async function freeTranslateText(text, targetLang) {
  if (!text || !text.trim()) return text || '';
  if (targetLang === 'en') return text;

  const looksLikeHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(text);
  const cacheKey = `${targetLang}::${text.length}::${text.slice(0, 240)}`;
  const cached = lcGet(cacheKey);
  if (cached != null) return cached;

  const code = ISO_CODES[targetLang];

  // Chunking strategy. We split into chunks ≤ MM_CHUNK_SIZE so we stay
  // well under MyMemory's anonymous per-request limit (with a safety
  // margin). We split at HTML paragraph boundaries when markup is
  // detected, otherwise at sentence boundaries.
  const MM_CHUNK_SIZE = 450;
  const chunks = looksLikeHtml ? htmlChunks(text, MM_CHUNK_SIZE) : sentenceChunks(text, MM_CHUNK_SIZE);
  if (chunks.length === 0) return text;

  // Translate chunks sequentially. Free APIs are rate-limited per-minute,
  // and a small per-chunk delay keeps us under the radar without making
  // a 30-locale grid take forever.
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const translated = await freeTranslateChunk(c, code, looksLikeHtml);
    // A failed provider must not contribute the original English chunk. An
    // empty result makes the whole description retryable instead of silently
    // persisting a mixed English/translated description.
    if (!translated || !String(translated).trim()) return '';
    out.push(translated);
    // Throttle: ~250 ms between chunks keeps us under most anonymous
    // rate limits (MyMemory ≅5 req/min, LibreTranslate ≅20 req/min).
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 250));
    }
  }
  const joined = out.join(looksLikeHtml ? '' : ' ');
  // Do not cache or return a partial source echo. The caller can retry this
  // field later and the product page will keep its valid English fallback.
  if (containsUntranslatedSourceChunk(joined, text)) return '';
  lcSet(cacheKey, joined);
  return joined;
}

async function freeTranslateChunk(text, code, looksLikeHtml) {
  // 1) MyMemory — primary because it's faster and has a generous free tier.
  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${code}`;
    const resp = await fetch(mmUrl, { headers: { 'User-Agent': 'SunTrade/1.0 (+suntrade.store)' } });
    if (resp.ok) {
      const data = await resp.json();
      if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (e) { /* fall through */ }

  // 2) LibreTranslate — fallback.
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
        return data.translatedText;
      }
    } catch (e) { /* try next instance */ }
  }
  // Both providers failed. Returning the source here used to poison desc_kz /
  // desc_ru with English (and made later requests look like a translation).
  return '';
}

// Split HTML into ≤maxSize chunks at </p>, </li>, </tr>, <br>, <h1-6>
// boundaries. This preserves sentence/paragraph structure instead of
// cutting mid-word, which both translators handle much more reliably.
function htmlChunks(html, maxSize) {
  if (html.length <= maxSize) return [html];
  const out = [];
  // Split on common block-level closers, keeping the closer appended
  // to the chunk it belongs to so the output re-concatenates cleanly.
  const parts = html.split(/(?=<p\b|<li\b|<tr\b|<br\b|<h[1-6]\b|<\/p>|<\/li>|<\/tr>|<\/h[1-6]>)/i);
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > maxSize && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf += p;
    }
  }
  if (buf) out.push(buf);
  // If for some reason no boundary matched (e.g. one giant <pre> block),
  // hard-split at maxSize and emit the remainder.
  if (out.length === 0) {
    for (let i = 0; i < html.length; i += maxSize) out.push(html.slice(i, i + maxSize));
  }
  // Hard-cap any single chunk that's still over maxSize (single huge <li>).
  const finalChunks = [];
  for (const c of out) {
    if (c.length <= maxSize) { finalChunks.push(c); continue; }
    for (let i = 0; i < c.length; i += maxSize) finalChunks.push(c.slice(i, i + maxSize));
  }
  return finalChunks;
}

// Split plain text into ≤maxSize chunks at sentence boundaries (. ! ? + space)
// then word boundaries if needed. Keeps punctuation attached to the token.
function sentenceChunks(text, maxSize) {
  if (text.length <= maxSize) return [text];
  const out = [];
  let buf = '';
  // First split on sentence boundaries.
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if ((buf + ' ' + s).trim().length > maxSize && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = (buf ? buf + ' ' : '') + s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  // If any single sentence is still > maxSize, hard-split on word boundary.
  const finalChunks = [];
  for (const c of out) {
    if (c.length <= maxSize) { finalChunks.push(c); continue; }
    const words = c.split(/\s+/);
    let b = '';
    for (const w of words) {
      if ((b + ' ' + w).trim().length > maxSize && b) {
        finalChunks.push(b.trim());
        b = w;
      } else {
        b = (b ? b + ' ' : '') + w;
      }
    }
    if (b.trim()) finalChunks.push(b.trim());
  }
  return finalChunks;
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

  const retries = Math.max(1, config.retries || 2);
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 600 * attempt));
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
          // 200 but no usable candidates — try the next model.
        } else {
          const errBody = await resp.text().catch(() => '');
          console.warn(`Gemini model ${model} failed (${resp.status}), trying next...`);
          // Rate-limited / transient server errors: brief backoff before the
          // next model so a burst of calls doesn't fail all at once.
          if (resp.status === 429 || resp.status >= 500) {
            await new Promise(r => setTimeout(r, 400));
          }
        }
      } catch (e) {
        console.warn(`Gemini model ${model} error:`, e.message);
      }
    }
  }
  return { model: '', text: '' };
}

// Gemini single-language translate for the on-demand (free) mode: one call
// returns both the translated name and the (HTML-preserving) description.
// Returns null when the model had no usable output so the caller can fall
// back to MyMemory / LibreTranslate.
async function aiTranslateOne(nameEn, descEn, langCode) {
  const langNames = {
    kz: 'Kazakh', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish',
    it: 'Italian', tr: 'Turkish', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ar: 'Arabic'
  };
  const langName = langNames[langCode] || langCode;
  // Supplier descriptions can be tens of thousands of characters long. Sending
  // the raw HTML to Gemini makes the request time out or return incomplete JSON,
  // which was especially visible for Kazakh and Russian. Translate a bounded,
  // cleaned excerpt; the UI already uses the same first portion for the initial
  // description and future retries can process a later source revision.
  const cleanedDesc = freePreCleanHtml(String(descEn || ''));
  const boundedDesc = cleanedDesc.slice(0, 5000);
  const prompt = `You are a professional translator for an e-commerce store. Translate the following product information from English to ${langName}.

Product Name: "${nameEn}"
Product Description: "${boundedDesc}"

Rules:
1. Translate naturally and accurately — do NOT add or remove information
2. Keep HTML tags in the description intact (e.g., <b>, <i>, <img>, <ul>, <li>, <br>, <p>, <div>, <table>)
3. Do NOT translate brand names, model numbers, or prices
4. Reply ONLY in valid JSON format: {"name": "translated_name", "desc": "translated_description"}
5. The "desc" field should preserve any HTML formatting exactly as in the original
6. If the description is empty, return an empty string for "desc"
7. Translate every character of the provided description excerpt; never return the English source text.`;
  const result = await callGemini(prompt, `You are a professional e-commerce translator. Translate from English to ${langName}. Reply ONLY with valid JSON.`, {
    maxTokens: 4000, temperature: 0.2
  });
  if (!result.text) return null;
  const jsonStr = (result.text.match(/\{[\s\S]*\}/) || [result.text])[0];
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    // Name and description are independent. A provider may complete one field
    // while rate-limiting or truncating the other; keep the valid field so the
    // caller can persist it and retry only the missing field.
    const parsedName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const parsedDesc = typeof parsed.desc === 'string' ? parsed.desc : '';
    return { name: parsedName, desc: parsedDesc };
  } catch (e) {
    console.warn('[translate-product:free] Gemini JSON parse failed:', e.message);
    return null;
  }
}

// Translate short variant/option labels such as "Black" and "Rose Gold".
// These labels live inside the existing JSONB types/option_groups fields, so
// they can be localized on demand without a database migration or changing
// the English source values used for matching/cart data.
const KAZAKH_LABEL_OVERRIDES = {
  'black': 'Қара',
  'white': 'Ақ',
  'red': 'Қызыл',
  'blue': 'Көк',
  'green': 'Жасыл',
  'yellow': 'Сары',
  'gold': 'Алтын',
  'silver': 'Күміс',
  'gray': 'Сұр',
  'grey': 'Сұр',
  'rose gold': 'Алтын раушан',
  'color': 'Түс',
  'colour': 'Түс',
  'size': 'Өлшем',
  'type': 'Түрі'
};

async function aiTranslateLabels(labels, langCode) {
  const langNames = {
    kz: 'Kazakh', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish',
    it: 'Italian', tr: 'Turkish', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ar: 'Arabic'
  };
  const langName = langNames[langCode] || langCode;
  const kazakhRules = langCode === 'kz'
    ? `\n5. For Kazakh, write natural modern Kazakh in Cyrillic, not Russian transliteration. Use Қара for Black, Ақ for White, Түс for Color, Өлшем for Size, and Алтын раушан for Rose Gold.\n6. Never return markup, code, font names, or technical tokens.`
    : '';
  const prompt = `Translate these e-commerce variant labels from English to ${langName}.\n\n` +
    JSON.stringify(labels) +
    `\n\nRules:\n1. Return ONLY a valid JSON object with exactly the same keys.\n` +
    `2. Translate ordinary words naturally (for example Black, Rose Gold, Size, Color).\n` +
    `3. Keep brand names, model numbers, measurements, plug codes, and abbreviations unchanged when appropriate.\n` +
    `4. Do not add explanations or markdown.` + kazakhRules;
  const result = await callGemini(prompt, `You translate short e-commerce variant labels from English to ${langName}. Reply only with JSON.`, {
    maxTokens: 1200, temperature: 0.1
  });
  if (!result.text) return {};
  const jsonStr = (result.text.match(/\{[\s\S]*\}/) || [result.text])[0];
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    Object.keys(labels).forEach(key => {
      let value = typeof parsed[key] === 'string' ? parsed[key].trim() : '';
      // Strip 'color'/'colour' that the model sometimes appends (with or without space)
      value = value.replace(/\s*colou?r\s*$/i, '').trim();
      // Also strip 'color'/'colour' if it appears mid-label (e.g. 'қызылcolor')
      value = value.replace(/colou?r/gi, '').trim();
      // A malformed model response must never be shown as a label. In
      // particular, reject leaked HTML/code/font tokens seen in old output.
      if (value && !/[<>]/.test(value) && !/fontdatabase|uherhiy/i.test(value)) out[key] = value;
    });
    if (langCode === 'kz') {
      Object.keys(labels).forEach(key => {
        const override = KAZAKH_LABEL_OVERRIDES[String(labels[key] || '').trim().toLowerCase()];
        if (override) out[key] = override;
      });
    }
    return out;
  } catch (e) {
    console.warn('[translate-product:labels] Gemini JSON parse failed:', e.message);
    return {};
  }
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
      const nameOnly = body.name_only === true;
      if (!FREE_SUPPORTED_LANGS.includes(targetLang)) {
        return res.status(400).json({ error: 'Invalid target_lang', supported: FREE_SUPPORTED_LANGS });
      }

      // Short labels are translated independently from product descriptions.
      // The English keys remain untouched in the product JSON; the browser uses
      // this response only for the current site language.
      if (body.labels && typeof body.labels === 'object' && !Array.isArray(body.labels)) {
        const sourceLabels = {};
        Object.entries(body.labels).slice(0, 100).forEach(([key, value]) => {
          const text = String(value || '').trim();
          if (key && text) sourceLabels[String(key)] = text;
        });
        if (!Object.keys(sourceLabels).length) {
          return res.status(200).json({ success: true, labels: {} });
        }
        if (targetLang === 'en') {
          return res.status(200).json({ success: true, labels: sourceLabels });
        }

        let translatedLabels = {};
        if (process.env.GEMINI_API_KEY) {
          try { translatedLabels = await aiTranslateLabels(sourceLabels, targetLang); } catch (e) {
            console.warn('[translate-product:labels] AI failed:', e.message);
          }
        }
        if (targetLang === 'kz') {
          Object.entries(sourceLabels).forEach(([key, source]) => {
            const override = KAZAKH_LABEL_OVERRIDES[String(source).trim().toLowerCase()];
            if (override) translatedLabels[key] = override;
          });
        }
        for (const [key, source] of Object.entries(sourceLabels)) {
          if (translatedLabels[key]) continue;
          try {
            const translated = await freeTranslateText(source, targetLang);
            // If a public provider cannot translate a short word, keep the
            // English label as a safe fallback instead of showing blank UI.
            translatedLabels[key] = isSafeLabelTranslation(translated, source)
              ? translated.trim().replace(/\s*colou?r\s*$/i, '').trim() : source;
          } catch (_) {
            translatedLabels[key] = source;
          }
        }
        return res.status(200).json({ success: true, labels: translatedLabels });
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
        if (product && product.name_en) {
          sourceName = product.name_en;
          sourceDesc = freePreCleanHtml(product.desc_en || '');
          existingName = product[`name_${targetLang}`] || '';
          existingDesc = product[`desc_${targetLang}`] || '';
        } else if (body.name_en) {
          // The admin post-save worker sends the English source explicitly as
          // a short-lived fallback for a just-created row. Prefer the DB row,
          // but continue when the read is momentarily unavailable.
          sourceName = body.name_en;
          sourceDesc = freePreCleanHtml(body.desc_en || '');
        } else {
          return res.status(200).json({
            success: false,
            error: product ? 'Product has no English source' : 'Product not found or no Supabase credentials',
            translation: { name: '', desc: '' }
          });
        }
      } else {
        if (!body.name_en) return res.status(400).json({ error: 'name_en or product_id required' });
        sourceName = body.name_en;
        sourceDesc = freePreCleanHtml(body.desc_en || '');
      }

      // Name requests intentionally run independently from long descriptions.
      // Product cards and the title must not wait for a many-chunk supplier
      // description translation to finish.
      if (nameOnly) sourceDesc = '';

      // DB cache hit?
      // Real cache hit requires: target column has actual translated content,
      // not just the English source mirrored into target. A leftover "English"
      // value in name_kz (from prior admins or cron failures) should NOT be
      // treated as cached — we want a fresh translation instead.
      const existingIsEnglishCopy = !!(existingName.trim() &&
        sourceName.trim() &&
        (existingName.trim().toLowerCase() === sourceName.trim().toLowerCase() ||
         containsUntranslatedSourceChunk(existingName, sourceName)));
      // Compare the VISIBLE text (tags stripped) so an English copy stored
      // with different formatting (cleaned vs raw HTML, whitespace, etc.)
      // is still recognized as untranslated. Substring containment is used
      // because freePreCleanHtml() may strip leading headings from the
      // source (e.g. an <h1>Features</h1>) that the stored copy still has.
      const srcV = stripText(sourceDesc);
      const exV = stripText(existingDesc);
      const existingDescIsEnglishCopy = !!(existingDesc.trim() &&
        sourceDesc.trim() &&
        (containsUntranslatedSourceChunk(existingDesc, sourceDesc) ||
         exV === srcV ||
         exV.includes(srcV.slice(0, 200)) ||
         srcV.includes(exV.slice(0, 200))));
      if (existingName.trim() &&
          (sourceDesc.trim() === '' || existingDesc.trim()) &&
          !existingIsEnglishCopy && !existingDescIsEnglishCopy) {
        return res.status(200).json({
          success: true,
          cached: true,
          translation: { name: existingName, desc: existingDesc || '' }
        });
      }

      // Translate name + description.
      // When a GEMINI_API_KEY is configured we prefer one AI call: it handles
      // long HTML descriptions reliably in a single request and has no
      // per-minute anonymous rate limits (the reason MyMemory / LibreTranslate
      // only ever managed the first few products of a grid). Free APIs remain
      // the fallback when the key is missing or the AI call produced nothing.
      let translatedName = '';
      let translatedDesc = '';
      if (process.env.GEMINI_API_KEY) {
        const ai = await aiTranslateOne(sourceName, sourceDesc, targetLang);
        if (ai) {
          // Name and description are handled independently. This is important
          // for every locale: one incomplete Gemini field must not discard the
          // other valid translation.
          if (ai.name && !containsUntranslatedSourceChunk(ai.name, sourceName)) {
            translatedName = ai.name;
          }
          // For long descriptions Gemini only saw a bounded excerpt. Do not
          // store that excerpt as the complete product description; the free
          // chunked path below must translate and reassemble the full source.
          if (!sourceDesc.trim() ||
              (sourceDesc.length <= 5000 && ai.desc && !containsUntranslatedSourceChunk(ai.desc, sourceDesc))) {
            translatedDesc = ai.desc || '';
          }
        }
      }
      // Fill each missing field independently. Previously this fallback ran
      // only when the name was missing, so a valid Gemini name plus an empty
      // description permanently returned a partial translation.
      if (!translatedName || (sourceDesc.trim() && !translatedDesc)) {
        const [fn, fd] = await Promise.all([
          !translatedName
            ? freeTranslateText(sourceName.substring(0, 5000), targetLang)
            : Promise.resolve(''),
          sourceDesc && !translatedDesc
            ? freeTranslateText(sourceDesc, targetLang)
            : Promise.resolve('')
        ]);
        if (!translatedName) translatedName = fn;
        if (!translatedDesc) translatedDesc = fd;
      }

      // A provider can return one translated field and echo the other source
      // field (especially when it hits a free-tier limit). Never persist that
      // English echo as a target-language description.
      const nameIsCopy = !!(translatedName && sourceName &&
        stripText(translatedName) === stripText(sourceName));
      const descIsCopy = !!(translatedDesc && sourceDesc &&
        containsUntranslatedSourceChunk(translatedDesc, sourceDesc));
      const safeName = nameIsCopy ? '' : translatedName;
      const safeDesc = descIsCopy ? '' : translatedDesc;
      // A non-empty source description is a required part of this request.
      // Returning `failed:false` with only a translated name made the browser
      // assume the request was complete and leave the English description on
      // screen forever. Name-only results remain usable for a later retry, but
      // are explicitly marked partial so callers can retry the description.
      const failed = !safeName || (sourceDesc.trim() && !safeDesc);

      let wroteToDb = false;
      // Persist whichever independent field succeeded. A missing name must not
      // prevent a valid description from being written (or vice versa).
      if (productId && (safeName || safeDesc)) {
        try {
          const descForWrite = safeDesc || undefined;
          wroteToDb = await freeWriteTranslation(productId, targetLang, safeName, descForWrite);
          if (wroteToDb) console.log(`[translate-product:free] cached ${productId} → ${targetLang}`);
        } catch (e) {
          console.warn('[translate-product:free] write-back failed:', e.message);
        }
      }

      return res.status(200).json({
        success: true,
        failed,
        wrote_to_db: wroteToDb,
        translation: { name: safeName, desc: safeDesc }
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
        // Batch translation uses the same bounded, cleaned source as the
        // single-language endpoint. The old raw supplier HTML could be tens of
        // thousands of characters while maxTokens was only 1000, so every
        // language after the first few often returned an empty/partial desc.
        const cleanedBatchDesc = freePreCleanHtml(String(desc_en || ''));
        const batchDesc = cleanedBatchDesc.slice(0, 5000);
        const prompt = `You are a professional translator for an e-commerce store. Translate the following product information from English to ${langName}.

Product Name: "${name_en}"
Product Description: "${batchDesc}"

Rules:
1. Translate naturally and accurately — do NOT add or remove information
2. Keep HTML tags in the description intact (e.g., <b>, <i>, <img>, <ul>, <li>, <br>, <p>, <div>, etc.)
3. Do NOT translate brand names or prices
4. Reply ONLY in valid JSON format: {"name": "translated_name", "desc": "translated_description"}
5. The "desc" field should preserve any HTML formatting exactly as in the original
6. If description is empty, return empty string for desc
7. Translate every character of the provided description excerpt and never echo the English source.`;

        const result = await callGemini(prompt, `You are a professional e-commerce translator. Translate from English to ${langName}. Reply ONLY with valid JSON.`, {
          maxTokens: 4000, temperature: 0.2
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
          // Never use the English source as a silent fallback. An empty
          // target value is intentional: the admin/cron worker can retry it,
          // while copying English here makes the site look translated and
          // permanently poisons the target column.
          const parsedName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
          const parsedDesc = typeof parsed.desc === 'string' ? parsed.desc : '';
          // Reject exact or dominant English echoes from Gemini. Empty fields
          // remain empty so the admin worker can retry that field only.
          const safeName = parsedName && !containsUntranslatedSourceChunk(parsedName, name_en)
            ? parsedName : '';
          // For a long source, batch Gemini only received an excerpt. Leave
          // desc empty so the admin worker uses the full free chunked fallback
          // instead of saving a truncated description.
          const safeDesc = cleanedBatchDesc.length <= 5000 && parsedDesc &&
              !containsUntranslatedSourceChunk(parsedDesc, batchDesc)
            ? parsedDesc : '';
          translations[langCode] = { name: safeName, desc: safeDesc };
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
