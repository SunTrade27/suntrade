// Visitor Count API + Meta (Facebook) Conversions API - Vercel Serverless Function
// GET  /api/visitor-count?months=N  — unique visitors from the last N months
// POST /api/visitor-count           — CAPI event forwarding (from js/pixel.js)
//
// CAPI part receives events from js/pixel.js (_sendToCapi) and forwards them to
// Facebook's Graph API so server-side tracking works alongside the browser pixel.
// event_id is used by Facebook to deduplicate browser + server events.
//
// Required env vars (set in Vercel):
//   FACEBOOK_ACCESS_TOKEN - long-lived token from Meta Events Manager
//   FB_PIXEL_ID           - optional, defaults to the pixel used on the site
const FB_PIXEL_ID = process.env.FB_PIXEL_ID || '1360976662857950';
const GRAPH_VERSION = 'v21.0';

// ===== Country dialing codes (GET /api/visitor-count?geo=1) =====
// Moved into this existing function to stay within the Hobby plan's
// 12-serverless-functions-per-deployment limit (no new api/ file).
const COUNTRY_CALLING = {
  AD: '+376', AE: '+971', AF: '+93', AG: '+1', AI: '+1', AL: '+355', AM: '+374',
  AO: '+244', AR: '+54', AS: '+1', AT: '+43', AU: '+61', AW: '+297', AX: '+358',
  AZ: '+994', BA: '+387', BB: '+1', BD: '+880', BE: '+32', BF: '+226', BG: '+359',
  BH: '+973', BI: '+257', BJ: '+229', BL: '+590', BM: '+1', BN: '+673', BO: '+591',
  BQ: '+599', BR: '+55', BS: '+1', BT: '+975', BW: '+267', BY: '+375', BZ: '+501',
  CA: '+1', CC: '+61', CD: '+243', CF: '+236', CG: '+242', CH: '+41', CI: '+225',
  CK: '+682', CL: '+56', CM: '+237', CN: '+86', CO: '+57', CR: '+506', CU: '+53',
  CV: '+238', CW: '+599', CX: '+61', CY: '+357', CZ: '+420', DE: '+49', DJ: '+253',
  DK: '+45', DM: '+1', DO: '+1', DZ: '+213', EC: '+593', EE: '+372', EG: '+20',
  EH: '+212', ER: '+291', ES: '+34', ET: '+251', FI: '+358', FJ: '+679', FK: '+500',
  FM: '+691', FO: '+298', FR: '+33', GA: '+241', GB: '+44', GD: '+1', GE: '+995',
  GF: '+594', GG: '+44', GH: '+233', GI: '+350', GL: '+299', GM: '+220', GN: '+224',
  GP: '+590', GQ: '+240', GR: '+30', GT: '+502', GU: '+1', GW: '+245', GY: '+592',
  HK: '+852', HN: '+504', HR: '+385', HT: '+509', HU: '+36', ID: '+62', IE: '+353',
  IL: '+972', IM: '+44', IN: '+91', IO: '+246', IQ: '+964', IR: '+98', IS: '+354',
  IT: '+39', JE: '+44', JM: '+1', JO: '+962', JP: '+81', KE: '+254', KG: '+996',
  KH: '+855', KI: '+686', KM: '+269', KN: '+1', KP: '+850', KR: '+82', KW: '+965',
  KY: '+1', KZ: '+7', LA: '+856', LB: '+961', LC: '+1', LI: '+423', LK: '+94',
  LR: '+231', LS: '+266', LT: '+370', LU: '+352', LV: '+371', LY: '+218', MA: '+212',
  MC: '+377', MD: '+373', ME: '+382', MF: '+590', MG: '+261', MH: '+692', MK: '+389',
  ML: '+223', MM: '+95', MN: '+976', MO: '+853', MP: '+1', MQ: '+596', MR: '+222',
  MS: '+1', MT: '+356', MU: '+230', MV: '+960', MW: '+265', MX: '+52', MY: '+60',
  MZ: '+258', NA: '+264', NC: '+687', NE: '+227', NF: '+672', NG: '+234', NI: '+505',
  NL: '+31', NO: '+47', NP: '+977', NR: '+674', NU: '+683', NZ: '+64', OM: '+968',
  PA: '+507', PE: '+51', PF: '+689', PG: '+675', PH: '+63', PK: '+92', PL: '+48',
  PM: '+508', PR: '+1', PS: '+970', PT: '+351', PW: '+680', PY: '+595', QA: '+974',
  RE: '+262', RO: '+40', RS: '+381', RU: '+7', RW: '+250', SA: '+966', SB: '+677',
  SC: '+248', SD: '+249', SE: '+46', SG: '+65', SH: '+290', SI: '+386', SJ: '+47',
  SK: '+421', SL: '+232', SM: '+378', SN: '+221', SO: '+252', SR: '+597', SS: '+211',
  ST: '+239', SV: '+503', SX: '+1', SY: '+963', SZ: '+268', TC: '+1', TD: '+235',
  TG: '+228', TH: '+66', TJ: '+992', TK: '+690', TL: '+670', TM: '+993', TN: '+216',
  TO: '+676', TR: '+90', TT: '+1', TV: '+688', TW: '+886', TZ: '+255', UA: '+380',
  UG: '+256', US: '+1', UY: '+598', UZ: '+998', VA: '+39', VC: '+1', VE: '+58',
  VG: '+1', VI: '+1', VN: '+84', VU: '+678', WF: '+681', WS: '+685', XK: '+383',
  YE: '+967', YT: '+262', ZA: '+27', ZM: '+260', ZW: '+263'
};

async function geoLookupByIp(ip) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch('https://ipapi.co/json/?fields=country_code&ip=' + encodeURIComponent(ip), { signal: ac.signal });
    const json = await res.json();
    return String(json.country_code || '').toUpperCase();
  } catch (err) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function handleGeo(req) {
  let cc = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  // Header is missing in local dev / previews — resolve the caller IP instead.
  if (!cc) {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      (req.socket && req.socket.remoteAddress) || '';
    cc = await geoLookupByIp(ip);
  }
  return { countryCode: cc, callingCode: COUNTRY_CALLING[cc] || '' };
}

// ===== Meta Conversions API =====
async function handleCapi(req, res) {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ FACEBOOK_ACCESS_TOKEN is missing in Vercel env');
    return res.status(500).json({ error: 'FACEBOOK_ACCESS_TOKEN not configured' });
  }

  const { event_name, event_id, event_time, custom_data } = req.body || {};

  if (!event_name || !event_id) {
    return res.status(400).json({ error: 'event_name and event_id are required' });
  }

  // user_data comes from the request headers (browser IP + UA) so Facebook
  // can match this server event to the browser event via event_id.
  const userData = {
    client_ip_address: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '',
    client_user_agent: req.headers['user-agent'] || ''
  };

  const event = {
    event_name,
    event_id,
    event_time: event_time || Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: req.headers['origin'] || req.headers.referer || '',
    user_data: userData,
    custom_data: custom_data || {}
  };

  try {
    const resp = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${FB_PIXEL_ID}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] })
      }
    );

    const result = await resp.json();

    if (!resp.ok) {
      console.error('❌ CAPI error:', resp.status, JSON.stringify(result));
      return res.status(resp.status).json({ error: 'Facebook API error', detail: result });
    }

    console.log(`✅ CAPI ${event_name} (${event_id}) sent, received:`, result.events_received);
    return res.status(200).json({ success: true, received: result.events_received });
  } catch (err) {
    console.error('CAPI request error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ===== Visitor Count =====
async function handleVisitorCount(req, res) {
  const { createClient } = require('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[visitor-count] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Server config missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Default: last 2 months
    const months = parseInt(req.query.months) || 2;
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const { data, error } = await supabase
      .from('visitor_events')
      .select('visitor_id')
      .eq('event_type', 'page_view')
      .gte('created_at', since.toISOString());

    if (error) {
      console.error('[visitor-count] Query error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Count unique visitor_ids
    const uniqueVisitors = new Set((data || []).map(r => r.visitor_id));

    return res.status(200).json({
      count: uniqueVisitors.size,
      months: months,
      since: since.toISOString()
    });
  } catch (err) {
    console.error('[visitor-count] Error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST = CAPI event forwarding (js/pixel.js)
  if (req.method === 'POST') {
    return handleCapi(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ?geo=1 → country dialing code for the current visitor (used by checkout.html
  // to pre-fill the phone field, e.g. KZ → +7, PL → +48, US → +1).
  if (req.query && req.query.geo !== undefined) {
    return handleGeo(req).then((geo) => res.status(200).json(geo));
  }

  return handleVisitorCount(req, res);
};