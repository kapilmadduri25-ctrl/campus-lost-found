require('dotenv').config();
const app = require('./src/app');
const { connectDB, closeDB, migrate } = require('./src/config/db');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    await migrate(); // idempotent: keeps the deployed schema in step with the code

    const mailer = require('./src/utils/mailer');
    console.log(mailer.isConfigured()
      ? `[mail] SMTP ready via ${process.env.SMTP_HOST} - reset links will be emailed`
      : '[mail] no SMTP configured - reset links are written to this log only');

    const server = app.listen(PORT, () => {
      console.log(`[server] LOSTLY running on http://localhost:${PORT}`);
    });

    // graceful shutdown - Render sends SIGTERM on every redeploy
    const shutdown = (signal) => {
      console.log(`[server] ${signal} received, closing connections`);
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
})();
