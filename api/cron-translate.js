// Vercel Cron: daily background translate of products still missing
// non-EN columns. Runs at 05:00 UTC every day via vercel.json#crons.
//
// Security: If CRON_SECRET env var is set, the request must pass
// `?secret=...` OR an `Authorization: Bearer ...` header that matches.
// Vercel always sends cron requests to the registered path on schedule,
// regardless of auth — this is just to keep random visitors from
// triggering expensive work.
//
// Behaviour:
//   1. Reads all active products from Supabase
//   2. For each product with name_en filled but ANY of the 11 non-EN
//      name_<lang> or desc_<lang> columns empty, queues it
//   3. Calls /api/translate-product (existing endpoint) which translates
//      all 11 languages in one POST and writes the result back via
//      adminSaveProduct-style field merge
//   4. Paces requests at ~4200 ms (=14 RPM) so we stay under Gemini
//      free-tier 15 RPM even if a chat visitor or a manual batch is
//      running at the same minute.
//
// GET /api/cron-translate        ?secret=CRON_SECRET (env)
// Authorization: Bearer CRON_SECRET
// Response: { ok, scanned, todo, translated, errors, failed, note }
//
// Schedule is configured in vercel.json:
//   { "crons": [{ "path": "/api/cron-translate", "schedule": "0 5 * * *" }] }

const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
// Service-role key would write through RLS, but RLS already lets admins
// pass. We use the anon key + the same flow adminSaveProduct() uses; if
// the cron is called from server-side Vercel with no admin session we
// fall back to the SERVICE_ROLE env var. Otherwise the cron simply skips
// "ready" work to a manual admin batch trigger.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

const TARGET_LANGS = ['kz','ru','de','fr','es','it','tr','pt','nl','pl','ar'];

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function escStatus(s) { return (s == null ? '' : String(s)).substring(0, 200); }

function needsTranslate(p) {
  if (!p.name_en || !String(p.name_en).trim()) return false;
  for (const lang of TARGET_LANGS) {
    const n = (p['name_' + lang] || '').trim();
    const d = (p['desc_' + lang] || '').trim();
    if (!n || !d) return true;
  }
  return false;
}

async function fetchProducts() {
  // Pull all active products. We need name_en + 24 language columns.
  // Supabase's PostgREST caps a single select at 1000 rows by default;
  // for an e-commerce catalog with hundreds of products that's fine.
  // If you grow past 1000, page by id ranges instead.
  const url = `${SUPABASE_URL}/rest/v1/products?select=id,name_en,name_kz,name_ru,name_de,name_fr,name_es,name_it,name_tr,name_pt,name_nl,name_pl,name_ar,desc_en,desc_kz,desc_ru,desc_de,desc_fr,desc_es,desc_it,desc_tr,desc_pt,desc_nl,desc_pl,desc_ar,active&active=eq.true&limit=1000`;
  const resp = await fetch(url, { headers: supabaseHeaders() });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Supabase fetch failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
  return await resp.json();
}

async function updateProduct(id, fields) {
  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(fields)
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Supabase update failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
  return true;
}

async function translateOne(p) {
  const resp = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://www.suntrade.store'}/api/translate-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_en: p.name_en || '', desc_en: p.desc_en || '' })
  });
  const json = await resp.json().catch(() => ({}));
  if (!json.success || !json.translations) {
    throw new Error(json.error || 'translate_product_failed');
  }
  const updateFields = { updated_at: new Date().toISOString() };
  for (const [lang, data] of Object.entries(json.translations)) {
    if (data && data.name) updateFields['name_' + lang] = data.name;
    if (data && data.desc) updateFields['desc_' + lang] = data.desc;
  }
  await updateProduct(p.id, updateFields);
  return Object.keys(json.translations).length;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ----- auth gate -----
  // Vercel Cron will hit this URL daily. If CRON_SECRET is set we require
  // a matching ?secret=... or Authorization: Bearer ... header. If unset
  // (recommended during initial setup) we still allow cron but block
  // arbitrary GETs from browsers / search engine crawlers by checking the
  // Vercel cron user-agent header as a fallback.
  const expected = process.env.CRON_SECRET;
  const provided = (req.query && req.query.secret)
    || (req.headers && req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
  const ua = (req.headers && req.headers['user-agent']) || '';
  const isVercelCron = /^vercel-cron/i.test(ua) || ua.includes('Vercel');

  if (expected) {
    if (!provided || provided !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  } else if (!isVercelCron) {
    // No secret configured AND not coming from Vercel's cron scheduler.
    // Refuse so random browsers/crawlers can't trigger the heavy job.
    return res.status(403).json({ ok: false, error: 'cron_only' });
  }

  // ----- run -----
  const t0 = Date.now();
  const result = {
    ok: true,
    scanned: 0,
    todo: 0,
    translated: 0,
    errors: 0,
    failed: [],
    note: 'Dry-run by default — set TRANSLATE_CRON_RUN=1 to actually translate.',
    elapsed_ms: 0
  };

  const DRY_RUN = process.env.TRANSLATE_CRON_RUN !== '1';

  try {
    const products = await fetchProducts();
    result.scanned = products.length;

    const todo = products.filter(needsTranslate);
    result.todo = todo.length;

    if (DRY_RUN) {
      result.note = `Dry-run: would translate ${todo.length} of ${products.length} products. Set TRANSLATE_CRON_RUN=1 to enable.`;
      return res.status(200).json(result);
    }

    if (todo.length === 0) {
      result.note = 'All products already translated — nothing to do.';
      result.elapsed_ms = Date.now() - t0;
      return res.status(200).json(result);
    }

    // Rate limit to ~14 RPM. The existing admin batch also paces at 4.2s
    // so we won't fight for slots — the user can run admin batch manually
    // in parallel and both stay under 15 RPM together.
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const MS_PER_CALL = 4200;
    const MAX_RETRIES = 2;

    for (let i = 0; i < todo.length; i++) {
      const p = todo[i];
      let attempt = 0;
      let ok = false;
      while (attempt < MAX_RETRIES && !ok) {
        attempt++;
        try {
          const n = await translateOne(p);
          ok = true;
          result.translated += 1;
          console.log(`[cron-translate] ${i+1}/${todo.length} OK ${p.id} -> ${n} langs`);
        } catch (e) {
          if (attempt >= MAX_RETRIES) {
            result.errors += 1;
            result.failed.push({ id: p.id, name: escStatus(p.name_en), err: escStatus(e.message) });
            console.warn(`[cron-translate] FAIL ${p.id}: ${e.message}`);
          } else {
            await pause(2000 * attempt);
          }
        }
      }
      if (i < todo.length - 1) await pause(MS_PER_CALL);
    }

    result.elapsed_ms = Date.now() - t0;
    result.note = `Cron ran for ${Math.round(result.elapsed_ms / 1000)}s and translated ${result.translated} of ${result.todo} products.`;
    return res.status(200).json(result);
  } catch (err) {
    console.error('cron-translate error:', err);
    return res.status(500).json({ ok: false, error: err.message, ...result });
  }
};
