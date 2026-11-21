/**
 * Optional SMTP delivery.
 *
 * Nothing is sent unless SMTP_HOST / SMTP_USER / SMTP_PASS are set. That keeps the
 * project runnable with no third-party account, and makes the "forgot password" page
 * honest: when mail is not configured the API says so instead of promising an email
 * that will never arrive.
 *
 * Any SMTP provider works - Brevo, Resend, Mailgun, or a Gmail app password.
 */
let transport = null;
let loaded = false;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (!isConfigured()) return null;
  if (!loaded) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT) === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    loaded = true;
  }
  return transport;
}

/** Sends the reset link. Returns true when the message was accepted by the server. */
async function sendPasswordReset({ to, name, token, appUrl }) {
  const mailer = getTransport();
  if (!mailer) return false;

  const link = `${appUrl || process.env.APP_URL || 'http://localhost:5000'}/reset-password.html?token=${encodeURIComponent(token)}`;

  try {
    await send(mailer, { to, name, link });
  } catch (err) {
    throw new Error(explain(err));
  }
  return true;
}

/** Turns an SMTP failure into the sentence the person setting it up needs to read. */
function explain(err) {
  const code = err.code || '';
  const text = String(err.response || err.message || '');

  if (code === 'EAUTH' || /535|Invalid login|authentication failed/i.test(text)) {
    return `${err.message} - the SMTP login is the one Brevo shows on the SMTP tab (usually something@smtp-brevo.com), and the password must be an SMTP key, not your Brevo account password.`;
  }
  if (/550|sender|from address/i.test(text)) {
    return `${err.message} - Brevo only sends from a verified sender: add this address under Senders, click the link in the confirmation email, then try again.`;
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET') {
    return `${err.message} - the port is unreachable. Try SMTP_PORT=587, then 2525.`;
  }
  return err.message;
}

async function send(mailer, { to, name, link }) {
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your Lostly password',
    text: `Hello ${name || 'there'},\n\nUse this link to choose a new password. It works once and expires in 30 minutes.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.\n\n— Lostly, Campus Lost & Found`,
    html: `<p>Hello ${name || 'there'},</p>
<p>Use the link below to choose a new password. It works once and expires in 30 minutes.</p>
<p><a href="${link}">Reset my password</a></p>
<p style="color:#5b6670;font-size:13px">If you did not ask for this, you can ignore this email.</p>
<p style="color:#5b6670;font-size:13px">— Lostly, Campus Lost &amp; Found</p>`,
  });
  return true;
}

module.exports = { isConfigured, sendPasswordReset };
