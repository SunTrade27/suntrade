// Vercel Cron: daily background translate of products still missing
// non-EN columns. Runs at 05:00 UTC every day via vercel.json#crons.
//
// Required environment variables on Vercel:
//   SUPABASE_URL            (e.g. https://xxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY  (so we can bypass RLS and write without
//                              a logged-in admin user; the anon key alone
//                              cannot write)
//   GEMINI_API_KEY          (whatever /api/translate-product already needs;
//                              we never invoke Gemini ourselves — we just
//                              re-use the existing translation endpoint)
// Optional:
//   CRON_SECRET             gate requests with a secret token; otherwise
//                            we accept only Vercel's cron user-agent
//   TRANSLATE_CRON_RUN=1    enable real translations. Without this the
//                            endpoint runs in DRY-RUN mode and only
//                            reports what it would translate.
//
// Security default: we refuse any request whose user-agent doesn't look
// like Vercel-Cron when CRON_SECRET is unset. That keeps random browsers
// and crawlers from triggering the (expensive) scan.
//
// Schedule is configured in vercel.json:
//   { "crons": [{ "path": "/api/cron-translate", "schedule": "0 5 * * *" }] }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wmznfdngucpsmjbxiwzn.supabase.co';
if (!process.env.SUPABASE_URL) {
  console.warn('[cron-translate] SUPABASE_URL env var is missing — falling back to the project default. Set it on Vercel for clarity.');
}

const TARGET_LANGS = ['kz','ru','de','fr','es','it','tr','pt','nl','pl','ar'];

function supabaseHeadersRead() {
  // Reads use the service-role key when available, fall back to anon
  // for dry-runs so we can at least SCAN without env vars set up.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY env var must be set to read products.');
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function supabaseHeadersWrite() {
  // Writes REQUIRE the service-role key — anon would fail RLS for
  // updates and we never want to silently fall back to a read-only
  // failure here.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var must be set to write product translations.');
  }
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
  const resp = await fetch(url, { headers: supabaseHeadersRead() });
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
    headers: { ...supabaseHeadersWrite(), Prefer: 'return=minimal' },
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
