// One-time bulk translation backfill.
// For every active product in the catalogue, fires product_id × all 11
// target_lang combinations through /api/translate-product (mode: 'free').
// The endpoint already does pre-clean + chunking + write-back, so this
// will:
//   1. Replace Alibaba-style dirty HTML in desc_XX with clean translated copy.
//   2. Populate name_XX for products whose name stays English-only.
//   3. Leave desc_XX as no_description when desc_en is itself empty.
//
// Resumable: writes a list of completed (id,lang) pairs to a local progress
// file so we can re-run the script and skip what's already done. Failed pairs
// are intentionally retried on the next run.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';
const TRANSLATE_URL = process.env.TRANSLATE_URL || 'https://www.suntrade.store/api/translate-product';
const LANGUAGES = ['kz', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'pt', 'nl', 'pl', 'ar'];

const PROGRESS_FILE = path.join(__dirname, 'bulk-translate-progress.json');

async function getAllProducts() {
  // 200 = ample room; we only have 22 today but it may grow.
  const url = `${SUPABASE_URL}/rest/v1/products?select=id,name_en&active=eq.true&limit=200`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!resp.ok) throw new Error('Supabase fetch failed: ' + resp.status);
  return resp.json();
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
    catch { return { done: [] }; }
  }
  return { done: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function translateOne(productId, lang) {
  const resp = await fetch(TRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'free', product_id: productId, target_lang: lang })
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

async function main() {
  const products = await getAllProducts();
  const progress = loadProgress();
  const doneKey = (id, lang) => id + '|' + lang;
  const doneSet = new Set(progress.done.map(d => d.key));

  let attempted = 0;
  let wroteToDb = 0;
  let cached = 0;
  let failed = 0;
  let skipped = 0;

  for (const p of products) {
    if (!p.name_en) { console.log('  SKIP (no name_en):', p.id); continue; }
    for (const lang of LANGUAGES) {
      const k = doneKey(p.id, lang);
      const previous = progress.done.find(d => d.key === k);
      // Older progress files recorded `wrote:false, failed:false` even when
      // the API could not persist anything. Only skip a pair after a real DB
      // write or a confirmed cache hit; all other records must be retried.
      if (previous && !previous.failed && (previous.wrote || previous.cached)) {
        skipped++;
        continue;
      }
      attempted++;
      try {
        const r = await translateOne(p.id, lang);
        if (r.wrote_to_db) wroteToDb++;
        else if (r.cached) cached++;
        else if (r.failed) failed++;
        // Replace a previous failed record; successful/cached pairs are
        // skipped on the next run, while failed pairs remain retryable.
        progress.done = progress.done.filter(d => d.key !== k);
        progress.done.push({ key: k, id: p.id, lang, wrote: !!r.wrote_to_db, cached: !!r.cached, failed: !!r.failed, at: new Date().toISOString() });
        if (progress.done.length % 10 === 0) saveProgress(progress);
        // Pace: 1100 ms between calls. MyMemory ≅5 req/min, LibreTranslate ≅20 req/min
        // with chunking overhead this is ~22 calls/min — comfortable margin.
        await new Promise(r => setTimeout(r, 1100));
      } catch (e) {
        console.error('FAIL', p.id, lang, e.message);
        progress.done = progress.done.filter(d => d.key !== k);
        progress.done.push({ key: k, id: p.id, lang, wrote: false, failed: true, error: e.message, at: new Date().toISOString() });
        failed++;
      }
    }
    console.log(`  ${p.name_en.slice(0,40)}  [tried=${attempted} wrote=${wroteToDb} failed=${failed}]`);
  }
  saveProgress(progress);
  const s = `DONE: attempted=${attempted} wrote_db=${wroteToDb} cached=${cached} failed=${failed} skipped=${skipped}`;
  console.log('\n==========', s);
}

main().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
