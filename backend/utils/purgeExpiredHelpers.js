const { pool } = require('./pgPool');

const HELPER_RETENTION_MS = 48 * 60 * 60 * 1000;

// Contact info a Tier 1 public helper submits is only meant to live long
// enough for the reporter to actually call them. This purges individual
// helper entries once they're older than 48h, independent of the case's
// own status (resolve-time purging is handled separately, in db.js's
// resolveCase(), since that's an immediate event rather than a sweep).
async function purgeExpiredHelpers() {
  const { rowCount } = await pool.query(
    `DELETE FROM public_helpers WHERE responded_at < now() - ($1::text)::interval`,
    [`${HELPER_RETENTION_MS} milliseconds`]
  );
  return { purgedCount: rowCount };
}

module.exports = { purgeExpiredHelpers, HELPER_RETENTION_MS };
