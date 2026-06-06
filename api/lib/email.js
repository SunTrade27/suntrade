// Shared email helper for Vercel serverless functions
// Uses Gmail SMTP via nodemailer (same credentials as Supabase SMTP settings)
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   SMTP_HOST     = smtp.gmail.com
//   SMTP_PORT     = 465
//   SMTP_USER     = sundetofficial@gmail.com   (the Gmail account)
//   SMTP_PASS     = xxxx xxxx xxxx xxxx        (16-char App Password)
//   SMTP_FROM     = "SunTrade <sundetofficial@gmail.com>"
//   ADMIN_EMAIL   = sundetofficial@gmail.com   (where admin notifications go)
//
// Gmail free tier: 500 emails/day → enough for the whole site.
// To create an App Password: https://myaccount.google.com/apppasswords
// (requires 2-Step Verification to be enabled first)

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER ? `SunTrade <${SMTP_USER}>` : 'SunTrade <noreply@suntrade.store>');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sundetofficial@gmail.com';

let cachedTransport = null;

function getTransport() {
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }
  if (cachedTransport) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // SSL for 465, STARTTLS for 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS.trim() // strip accidental whitespace from env var copy-paste
    },
    // Pool connections for repeated sends in a single invocation
    pool: true,
    maxConnections: 3,
    // Gmail often has TLS quirks in serverless — be permissive
    tls: {
      rejectUnauthorized: false
    }
  });

  return cachedTransport;
}

function isConfigured() {
  return !!(SMTP_USER && SMTP_PASS);
}

/**
 * Send a single email. Returns { ok, id | error }.
 */
async function sendMail({ to, subject, html, text, replyTo }) {
  const transport = getTransport();
  if (!transport) {
    const msg = 'SMTP not configured (SMTP_USER / SMTP_PASS missing)';
    console.warn('[email]', msg);
    return { ok: false, error: msg };
  }

  if (!to) {
    return { ok: false, error: 'No recipient (to) provided' };
  }

  try {
    const info = await transport.sendMail({
      from: SMTP_FROM,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || stripHtml(html),
      replyTo
    });
    console.log('[email] ✅ sent to', to, '| subject:', subject, '| id:', info.messageId);
    return { ok: true, id: info.messageId };
  } catch (err) {
    console.error('[email] ❌ send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send to multiple recipients in parallel. Returns array of results.
 */
async function sendMailAll(messages) {
  return Promise.all(messages.map(m => sendMail(m)));
}

// Strip HTML tags for the plaintext fallback
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  getTransport,
  isConfigured,
  sendMail,
  sendMailAll,
  ADMIN_EMAIL,
  SMTP_FROM
};
