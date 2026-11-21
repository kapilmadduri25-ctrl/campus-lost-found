/**
 * Archives stale listings.
 *
 *   npm run expire
 *
 * Anything still open after LISTING_TTL_DAYS (default 90) is marked `expired` and its
 * outstanding claims are rejected, so the board never fills with reports from last
 * semester. Run it from a Render Cron Job, or by hand once a term.
 */
require('dotenv').config();
const { connectDB, query, closeDB } = require('../src/config/db');

(async () => {
  const days = Math.max(1, parseInt(process.env.LISTING_TTL_DAYS, 10) || 90);
  try {
    await connectDB();

    const { rows } = await query(
      `update items
          set status = 'expired', updated_at = now()
        where status in ('active', 'claim_requested')
          and created_at < now() - ($1 || ' days')::interval
        returning id`,
      [days]
    );

    if (rows.length) {
      await query(
        `update claims set status = 'rejected', decision_note = 'The listing expired', updated_at = now()
          where item = any($1) and status in ('pending', 'info_requested')`,
        [rows.map((r) => r.id)]
      );
    }

    console.log(`[expire] ${rows.length} listing(s) older than ${days} days archived`);
    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('[expire] failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
})();
