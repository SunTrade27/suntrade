// Facebook Conversions API (CAPI) — Vercel Serverless Function
// Receives browser events and forwards them to Facebook Graph API
// for improved conversion tracking (deduplication via event_id)
//
// Required env vars:
//   FACEBOOK_PIXEL_ID  — your Meta Pixel ID
//   FACEBOOK_CAPI_TOKEN — CAPI Access Token from Facebook Events Manager
//
// Optional:
//   FACEBOOK_TEST_EVENT_CODE — for testing in Facebook Events Manager

const FB_PIXEL_ID = process.env.FACEBOOK_PIXEL_ID || '1360976662857950';
const FB_CAPI_TOKEN = process.env.FACEBOOK_CAPI_TOKEN;
const FB_TEST_EVENT_CODE = process.env.FACEBOOK_TEST_EVENT_CODE || '';

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!FB_CAPI_TOKEN) {
    console.error('[capi] FACEBOOK_CAPI_TOKEN is not set in Vercel env');
    return res.status(500).json({ error: 'CAPI token not configured' });
  }

  try {
    const { event_name, event_id, event_time, user_data, custom_data } = req.body;

    if (!event_name) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    // Build the CAPI event payload
    const payload = {
      data: [
        {
          event_name,
          event_time: event_time || Math.floor(Date.now() / 1000),
          event_id: event_id || undefined,
          action_source: 'website',
          event_source_url: req.headers.referer || 'https://www.suntrade.store',
          user_data: {
            // Client IP (Facebook uses this for matching)
            client_ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
            // Client browser user agent
            client_user_agent: req.headers['user-agent'] || '',
            // External ID (hashed) — helps with matching
            ...(user_data?.external_id ? { external_id: user_data.external_id } : {}),
            // Email (hashed) — if available
            ...(user_data?.em ? { em: user_data.em } : {}),
            // Phone (hashed) — if available
            ...(user_data?.ph ? { ph: user_data.ph } : {}),
          },
          custom_data: custom_data || {},
        },
      ],
    };

    // Add test event code if configured
    if (FB_TEST_EVENT_CODE) {
      payload.test_event_code = FB_TEST_EVENT_CODE;
    }

    // Send to Facebook Graph API
    const url = `https://graph.facebook.com/v19.0/${FB_PIXEL_ID}/events`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result.error) {
      console.error('[capi] Facebook API error:', result.error);
      return res.status(502).json({ error: 'Facebook API error', details: result.error });
    }

    console.log(`[capi] ✅ Event sent: ${event_name} | event_id: ${event_id || 'none'} | status: ${result.events_received}`);
    return res.status(200).json({ success: true, events_received: result.events_received });
  } catch (err) {
    console.error('[capi] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
