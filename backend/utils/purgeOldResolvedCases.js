const { pool } = require('./pgPool');

const RESOLVED_CASE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// The cases table has no other eviction and every row carries a full
// base64-encoded image, so it grows without bound for as long as the
// server runs. An open/responding case must never be dropped here
// regardless of age - only cases that are actually resolved, and only
// once they're old enough that nobody is going to look them up again,
// get removed.
async function purgeOldResolvedCases() {
  const { rowCount } = await pool.query(
    `DELETE FROM cases
     WHERE status = 'resolved'
       AND COALESCE(resolved_at, created_at) < now() - ($1::text)::interval`,
    [`${RESOLVED_CASE_RETENTION_MS} milliseconds`]
  );
  return { purgedCount: rowCount };
}

module.exports = { purgeOldResolvedCases, RESOLVED_CASE_RETENTION_MS };
