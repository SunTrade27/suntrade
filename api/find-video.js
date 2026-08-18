// Vercel Serverless Function: search YouTube for a product video.
// Uses the free YouTube Data API v3 (search.list, 100 units/call → ~100
// searches/day on the free 10,000-unit quota — plenty for admin use).
// Requires YOUTUBE_API_KEY environment variable in Vercel.
//
// POST /api/find-video
//   body: { query: "Men's automatic wrist watch with steel strap" }
//   → 200 { success, query, results: [{ videoId, title, channel, thumbnail, url }] }

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// YouTube Shorts are the wrong format for a product page. We detect them from
// three public signals: the "#Shorts" hashtag YouTube appends to the title,
// a portrait (taller-than-wide) thumbnail, and a duration under a minute.
const SHORTS_TITLE_RE = /#\s*shorts\b/i;
const MIN_VIDEO_SECONDS = 60;

function durationToSeconds(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return null;
  return (parseInt(m[1] || '0', 10) * 3600)
    + (parseInt(m[2] || '0', 10) * 60)
    + (parseInt(m[3] || '0', 10));
}

// Shorts thumbnails are portrait (height > width); regular videos are landscape.
function isPortraitThumbnail(thumbnails) {
  const thumb = (thumbnails && (thumbnails.medium || thumbnails.high || thumbnails.default)) || null;
  if (thumb && thumb.width && thumb.height) return thumb.height > thumb.width;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({
      error: 'YOUTUBE_API_KEY not configured',
      hint: 'Create a free YouTube Data API v3 key in Google Cloud Console and add it to Vercel env vars (Project → Settings → Environment Variables), then redeploy.'
    });
  }

  try {
    const query = String(req.body?.query || '').trim();
    if (query.length < 3) {
      return res.status(400).json({ error: 'Provide a product name (at least 3 characters).' });
    }

    // Fetch more than we need so Shorts can be filtered out and there are
    // still enough real candidates left to show. search.list costs 100 units
    // per call regardless of maxResults. Only embeddable videos are kept so
    // the chosen video actually plays on the product page.
    const url = 'https://www.googleapis.com/youtube/v3/search' +
      '?part=snippet' +
      '&type=video' +
      '&maxResults=12' +
      '&videoEmbeddable=true' +
      '&relevanceLanguage=en' +
      '&q=' + encodeURIComponent(query) +
      '&key=' + encodeURIComponent(YOUTUBE_API_KEY);

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiMsg = data?.error?.message || ('YouTube API error ' + response.status);
      const code = data?.error?.errors?.[0]?.reason || '';
      if (code === 'quotaExceeded') {
        return res.status(429).json({ error: 'YouTube daily search quota exceeded. Try again tomorrow.', code });
      }
      if (code === 'keyInvalid' || code === 'forbidden' || response.status === 403) {
        return res.status(500).json({ error: 'Invalid or unauthorized YouTube API key. Check YOUTUBE_API_KEY in Vercel env vars.', code });
      }
      return res.status(response.status).json({ error: apiMsg, code });
    }

    const items = (Array.isArray(data.items) ? data.items : [])
      .filter(item => item?.id?.videoId && item?.snippet?.title);

    // Look up each candidate's duration so ultra-short (Shorts) clips can be
    // excluded. videos.list costs 1 unit regardless of how many IDs are sent,
    // so this is negligible next to the search call. If it fails we fall back
    // to title/thumbnail filtering only.
    let durationById = {};
    const ids = items.map(item => item.id.videoId);
    if (ids.length) {
      try {
        const vurl = 'https://www.googleapis.com/youtube/v3/videos' +
          '?part=contentDetails' +
          '&id=' + encodeURIComponent(ids.join(',')) +
          '&key=' + encodeURIComponent(YOUTUBE_API_KEY);
        const vresp = await fetch(vurl, { headers: { Accept: 'application/json' } });
        const vdata = await vresp.json().catch(() => ({}));
        (Array.isArray(vdata.items) ? vdata.items : []).forEach(v => {
          if (v?.id) durationById[v.id] = durationToSeconds(v?.contentDetails?.duration);
        });
      } catch (e) {
        console.error('[find-video] duration lookup failed', e);
      }
    }

    const results = items
      .filter(item => {
        const title = String(item.snippet.title || '');
        if (SHORTS_TITLE_RE.test(title)) return false;
        if (isPortraitThumbnail(item.snippet.thumbnails)) return false;
        const secs = durationById[item.id.videoId];
        if (secs !== null && secs !== undefined && secs < MIN_VIDEO_SECONDS) return false;
        return true;
      })
      .slice(0, 3)
      .map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle || '',
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
        url: 'https://www.youtube.com/watch?v=' + item.id.videoId
      }));

    if (!results.length) {
      return res.status(404).json({ success: false, query, results: [], error: 'No video found for "' + query + '" (Shorts are excluded).' });
    }

    return res.status(200).json({ success: true, query, results });
  } catch (error) {
    console.error('[find-video]', error);
    return res.status(500).json({ error: error.message || 'Could not search YouTube' });
  }
};
