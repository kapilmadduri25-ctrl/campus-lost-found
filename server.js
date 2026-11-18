require('dotenv').config();
const app = require('./src/app');
const { connectDB, closeDB } = require('./src/config/db');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();

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
