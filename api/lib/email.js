// Shared email helper for Vercel serverless functions
// Uses Resend (resend.com) - free tier: 100 emails/day, 3000/month
// Works on Vercel Hobby plan (no SMTP port blocking)
//
// Env vars required (in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  = re_xxxxx...              (from resend.com → API Keys)
//   SMTP_FROM       = SunTrade <onboarding@resend.dev>  (sandbox sender; verify your own domain later for noreply@suntrade.store)
//   ADMIN_EMAIL     = sundetofficial@gmail.com (optional; defaults to this)
//
// To use your own domain (e.g. noreply@suntrade.store):
//   1. Resend → Domains → Add Domain → suntrade.store
//   2. Add the DNS records Resend gives you
//   3. Wait for verification
//   4. Change SMTP_FROM to "SunTrade <noreply@suntrade.store>"

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SMTP_FROM = process.env.SMTP_FROM || 'SunTrade <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sundetofficial@gmail.com';
const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return !!RESEND_API_KEY;
}

/**
 * Send a single email via Resend. Returns { ok, id | error }.
 */
async function sendMail({ to, subject, html, text, replyTo }) {
  if (!isConfigured()) {
    const msg = 'RESEND_API_KEY not configured in Vercel env vars';
    console.error('[email]', msg);
    return { ok: false, error: msg };
  }

  if (!to) {
    return { ok: false, error: 'No recipient (to) provided' };
  }

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: SMTP_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || stripHtml(html),
        reply_to: replyTo
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const errMsg = data?.message || data?.error || `HTTP ${resp.status}`;
      console.error('[email] ❌ Resend error:', errMsg, '| to:', to);
      return { ok: false, error: errMsg };
    }

    console.log('[email] ✅ sent to', to, '| subject:', subject, '| id:', data.id);
    return { ok: true, id: data.id };
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
  isConfigured,
  sendMail,
  sendMailAll,
  ADMIN_EMAIL,
  SMTP_FROM
};
