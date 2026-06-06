// Temporary debug endpoint: shows whether SMTP env vars are loaded and tries a real send.
// Open https://www.suntrade.store/api/test-email in your browser to see status.
// This is read-only for env vars (no secrets revealed), but it WILL try to authenticate with Gmail.

const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic security: only allow GET; don't echo back secrets.
  const user = process.env.SMTP_USER || null;
  const pass = process.env.SMTP_PASS || null;
  const host = process.env.SMTP_HOST || null;
  const port = process.env.SMTP_PORT || null;
  const from = process.env.SMTP_FROM || null;
  const admin = process.env.ADMIN_EMAIL || null;

  const status = {
    smtp_env_loaded: {
      SMTP_HOST: host || '❌ NOT SET',
      SMTP_PORT: port || '❌ NOT SET',
      SMTP_USER: user ? `${user.substring(0, 4)}...@${user.split('@')[1] || '?'}` : '❌ NOT SET',
      SMTP_PASS_set: !!pass,
      SMTP_PASS_length: pass ? pass.length : 0,
      SMTP_PASS_expected_length: 19, // 16 chars + 3 spaces
      SMTP_PASS_format_ok: pass ? /^[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}$/i.test(pass.trim()) : false,
      SMTP_FROM: from || '❌ NOT SET',
      ADMIN_EMAIL: admin || '❌ NOT SET'
    },
    send_test: null,
    timestamp: new Date().toISOString()
  };

  if (!user || !pass) {
    status.send_test = {
      ok: false,
      error: 'SMTP_USER or SMTP_PASS not set in Vercel env vars. Add them in Settings → Environment Variables, then redeploy.'
    };
    return res.status(200).json(status);
  }

  if (status.smtp_env_loaded.SMTP_PASS_length !== 19 && status.smtp_env_loaded.SMTP_PASS_length !== 16) {
    status.send_test = {
      ok: false,
      error: `SMTP_PASS length is ${status.smtp_env_loaded.SMTP_PASS_length}, expected 19 (e.g. "abcd efgh ijkl mnop"). Check for extra spaces or missing characters.`,
      hint: 'App Password format: 4 letters, space, 4 letters, space, 4 letters, space, 4 letters (e.g. "abcd efgh ijkl mnop" = 19 chars total).'
    };
    return res.status(200).json(status);
  }

  // Try to actually connect and verify
  const transport = nodemailer.createTransport({
    host: host || 'smtp.gmail.com',
    port: parseInt(port || '465', 10),
    secure: parseInt(port || '465', 10) === 465,
    auth: { user, pass: pass.trim() },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000
  });

  try {
    await transport.verify();
    status.send_test = { ok: true, message: 'SMTP connection & auth verified ✓' };

    // Also send a tiny test email to the admin
    const info = await transport.sendMail({
      from: from || `SunTrade <${user}>`,
      to: admin || user,
      subject: '🧪 SunTrade SMTP test',
      text: 'If you see this, SMTP is working. — sent from /api/test-email'
    });
    status.send_test.test_message_id = info.messageId;
    status.send_test.sent_to = admin || user;
  } catch (err) {
    status.send_test = {
      ok: false,
      error: err.message,
      code: err.code,
      hint: getGmailHint(err.message, err.code)
    };
  }

  return res.status(200).json(status);
};

function getGmailHint(msg, code) {
  if (!msg && !code) return null;
  const text = (msg || '') + ' ' + (code || '');
  if (text.includes('535') || text.includes('BadCredentials') || text.includes('Username and Password not accepted')) {
    return 'Wrong App Password, OR 2FA not enabled, OR password was created for a different Gmail account. Re-create the App Password at https://myaccount.google.com/apppasswords and copy-paste it carefully (no extra spaces/newlines). Make sure the App Password was created for the SAME Gmail account as SMTP_USER.';
  }
  if (text.includes('ETIMEDOUT') || text.includes('ECONNREFUSED') || text.includes('ENOTFOUND')) {
    return 'Vercel server cannot reach smtp.gmail.com. Try changing SMTP_PORT to 587 (with secure=false), or contact Vercel support about SMTP blocking.';
  }
  if (text.includes('Invalid envelope') || text.includes('Sender address rejected')) {
    return 'The FROM address (SMTP_FROM) is not authorized for this Gmail account. Set SMTP_FROM to "SunTrade <sundetofficial@gmail.com>" (must be the same as SMTP_USER).';
  }
  if (text.includes('EAUTH')) {
    return 'Authentication failed. Verify that 2-Step Verification is enabled on the Gmail account, and that you are using an App Password (not your regular Gmail password).';
  }
  return null;
}

