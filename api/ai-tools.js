// Vercel Serverless Function: Combined AI tools
// Handles: remove-bg, find-video
// Keeps total serverless function count under Vercel Hobby plan limit (12)

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// ── YouTube helpers ──
const SHORTS_TITLE_RE = /#\s*shorts\b/i;
const MIN_VIDEO_SECONDS = 60;

function durationToSeconds(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return null;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
}

function isPortraitThumbnail(thumbnails) {
  const thumb = (thumbnails && (thumbnails.medium || thumbnails.high || thumbnails.default)) || null;
  if (thumb && thumb.width && thumb.height) return thumb.height > thumb.width;
  return false;
}

// ── Remove BG handler ──
async function handleRemoveBg(req) {
  if (!REMOVE_BG_API_KEY) return { status: 500, body: { error: 'REMOVE_BG_API_KEY not configured' } };

  const { imageUrl, imageBase64 } = req.body;
  const form = new FormData();

  if (imageBase64) {
    const buffer = Buffer.from(imageBase64, 'base64');
    const imageMime = req.body.imageMime || 'image/png';
    const safeMime = /^image\/(png|jpeg|jpg|webp|gif|avif)$/i.test(imageMime) ? imageMime.toLowerCase() : 'image/png';
    const extension = safeMime.split('/')[1] === 'jpeg' ? 'jpg' : safeMime.split('/')[1];
    const blob = new Blob([buffer], { type: safeMime });
    form.append('image_file', blob, 'image.' + extension);
  } else if (imageUrl) {
    form.append('image_url', imageUrl);
  } else {
    return { status: 400, body: { error: 'Provide imageUrl or imageBase64' } };
  }

  form.append('size', 'auto');
  form.append('format', 'png');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': REMOVE_BG_API_KEY },
    body: form
  });

  if (!response.ok) {
    const errText = await response.text();
    return { status: response.status, body: { error: 'remove.bg API error: ' + errText } };
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { status: 200, body: { success: true, imageUrl: `data:image/png;base64,${base64}` } };
}

// ── Find Video handler ──
async function handleFindVideo(req) {
  if (!YOUTUBE_API_KEY) {
    return { status: 500, body: { error: 'YOUTUBE_API_KEY not configured' } };
  }

  const query = String(req.body?.query || '').trim();
  if (query.length < 3) {
    return { status: 400, body: { error: 'Provide a product name (at least 3 characters).' } };
  }

  const url = 'https://www.googleapis.com/youtube/v3/search' +
    '?part=snippet&type=video&maxResults=12&videoEmbeddable=true&relevanceLanguage=en' +
    '&q=' + encodeURIComponent(query) + '&key=' + encodeURIComponent(YOUTUBE_API_KEY);

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMsg = data?.error?.message || ('YouTube API error ' + response.status);
    const code = data?.error?.errors?.[0]?.reason || '';
    return { status: response.status, body: { error: apiMsg, code } };
  }

  const items = (Array.isArray(data.items) ? data.items : []).filter(item => item?.id?.videoId && item?.snippet?.title);

  let durationById = {};
  const ids = items.map(item => item.id.videoId);
  if (ids.length) {
    try {
      const vresp = await fetch('https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=' +
        encodeURIComponent(ids.join(',')) + '&key=' + encodeURIComponent(YOUTUBE_API_KEY),
        { headers: { Accept: 'application/json' } });
      const vdata = await vresp.json().catch(() => ({}));
      (Array.isArray(vdata.items) ? vdata.items : []).forEach(v => {
        if (v?.id) durationById[v.id] = durationToSeconds(v?.contentDetails?.duration);
      });
    } catch (e) { console.error('[ai-tools] duration lookup failed', e); }
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
    return { status: 404, body: { success: false, query, results: [], error: 'No video found for "' + query + '"' } };
  }
  return { status: 200, body: { success: true, query, results } };
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Route by ?action= query param or path segment
  const action = req.query?.action || '';

  try {
    let result;
    if (action === 'remove-bg' || action === 'removebg') {
      result = await handleRemoveBg(req);
    } else if (action === 'find-video' || action === 'findvideo') {
      result = await handleFindVideo(req);
    } else {
      return res.status(400).json({ error: 'Unknown action. Use ?action=remove-bg or ?action=find-video' });
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[ai-tools]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};
