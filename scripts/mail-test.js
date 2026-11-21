/**
 * Checks the SMTP settings and optionally sends one test message.
 *
 *   npm run mail:test              -> just reports whether SMTP is configured
 *   npm run mail:test -- you@x.com -> sends a real test email
 *
 * Run it locally before touching Render: if this fails, the deployed app will fail the
 * same way, and the error message is much easier to read here.
 */
require('dotenv').config();
const mailer = require('../src/utils/mailer');

(async () => {
  const to = process.argv[2];

  if (!mailer.isConfigured()) {
    console.log('[mail] SMTP is NOT configured.');
    console.log('       Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env (see docs/DEPLOYMENT.md).');
    process.exit(1);
  }

  console.log(`[mail] SMTP configured: host=${process.env.SMTP_HOST} port=${process.env.SMTP_PORT || 587} user=${process.env.SMTP_USER}`);

  if (!to) {
    console.log('[mail] Add an address to send a test message: npm run mail:test -- you@example.com');
    process.exit(0);
  }

  try {
    const sent = await mailer.sendPasswordReset({
      to,
      name: 'Test',
      token: 'test-token-only-for-checking-smtp',
      appUrl: process.env.APP_URL || 'http://localhost:5000',
    });
    console.log(sent ? `[mail] test message accepted for ${to} — check the inbox and the spam folder` : '[mail] not sent');
    process.exit(sent ? 0 : 1);
  } catch (err) {
    console.error('[mail] failed:', err.message);
    process.exit(1);
  }
})();
