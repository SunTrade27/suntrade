const { createClient } = require('@supabase/supabase-js');

const SITE_ORIGINS = new Set([
  'https://suntrade.store',
  'https://www.suntrade.store'
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server / same-origin requests may omit Origin
  if (SITE_ORIGINS.has(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function applyCors(req, res, methods) {
  const origin = req.headers?.origin || '';
  if (!isAllowedOrigin(origin)) return false;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

function getBearerToken(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function getSupabaseClients() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || serviceKey;
  if (!url || !serviceKey || !anonKey) return null;
  return {
    admin: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    auth: createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  };
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const clients = getSupabaseClients();
  if (!clients) return null;
  const { data, error } = await clients.auth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function getAdminUser(req) {
  const token = getBearerToken(req);
  const user = await getAuthenticatedUser(req);
  if (!user) return null;
  // Enable enforcement after every admin has enrolled a factor. Keeping this
  // opt-in avoids locking the owner out before the first TOTP factor exists.
  // Set ADMIN_MFA_REQUIRED=true in Vercel only after MFA enrollment is ready.
  const claims = decodeJwtPayload(token);
  if (process.env.ADMIN_MFA_REQUIRED === 'true' && claims?.aal !== 'aal2') return null;
  const clients = getSupabaseClients();
  if (!clients) return null;

  const { data: profile } = await clients.admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_admin === true) return user;

  // Keep the existing emergency allowlist usable, but move it to an env var.
  // Set ADMIN_EMAILS="admin1@example.com,admin2@example.com" in Vercel.
  const configuredEmails = String(process.env.ADMIN_EMAILS || '').trim();
  const allowedEmails = (configuredEmails || 'serjanyelemesov@gmail.com,sundetofficial@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(String(user.email || '').toLowerCase()) ? user : null;
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
}

module.exports = {
  applyCors,
  getAdminUser,
  getAuthenticatedUser,
  setSecurityHeaders
};
