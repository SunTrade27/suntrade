// Temporary debug endpoint: shows whether RESEND_API_KEY is loaded and sends a real test email.
// Open https://www.suntrade.store/api/test-email in your browser to see status.
//
// After confirming email works, delete this file.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.RESEND_API_KEY || null;
  const from = process.env.SMTP_FROM || null;
  const admin = process.env.ADMIN_EMAIL || null;

  const status = {
    env_loaded: {
      RESEND_API_KEY_set: !!apiKey,
      RESEND_API_KEY_length: apiKey ? apiKey.length : 0,
      RESEND_API_KEY_starts_with_re: apiKey ? apiKey.startsWith('re_') : false,
      SMTP_FROM: from || '❌ NOT SET',
      ADMIN_EMAIL: admin || '❌ NOT SET'
    },
    send_test: null,
    timestamp: new Date().toISOString()
  };

  if (!apiKey) {
    status.send_test = {
      ok: false,
      error: 'RESEND_API_KEY not set in Vercel env vars. Add it in Settings → Environment Variables, then redeploy.'
    };
    return res.status(200).json(status);
  }

  // Try to send a real test email
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: from || 'SunTrade <onboarding@resend.dev>',
        to: [admin || 'sundetofficial@gmail.com'],
        subject: '🧪 SunTrade SMTP test',
        html: '<p>If you see this in your inbox, email is working! 🎉</p><p>— sent from /api/test-email</p>',
        text: 'If you see this in your inbox, email is working! — sent from /api/test-email'
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      status.send_test = {
        ok: false,
        error: data?.message || data?.error || `HTTP ${resp.status}`,
        hint: getHint(data)
      };
      return res.status(200).json(status);
    }

    status.send_test = {
      ok: true,
      message: 'Email sent successfully ✓',
      sent_to: admin || 'sundetofficial@gmail.com',
      email_id: data.id
    };
  } catch (err) {
    status.send_test = {
      ok: false,
      error: err.message
    };
  }

  return res.status(200).json(status);
};

function getHint(data) {
  const msg = (data?.message || data?.error || '').toLowerCase();
  if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('invalid')) {
    return 'API key is invalid. Re-check that you copied the full key from Resend → API Keys, and that it starts with "re_".';
  }
  if (msg.includes('domain') || msg.includes('from')) {
    return 'The "from" address is not allowed. Use "SunTrade <onboarding@resend.dev>" for now (sandbox), or verify your own domain in Resend → Domains.';
  }
  if (msg.includes('rate')) {
    return 'Resend rate limit hit. Free tier is 100 emails/day, 2 requests/second.';
  }
  return null;
}
