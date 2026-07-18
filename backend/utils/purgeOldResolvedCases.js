const { withDB } = require('./db');

const RESOLVED_CASE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// db.cases has no other eviction (unlike db.reports, capped at 100 in
// server.js) and every case carries a full base64-encoded image, so it
// grows without bound for as long as the server runs. An open/responding
// case must never be dropped here regardless of age - only cases that are
// actually resolved, and only once they're old enough that nobody is going
// to look them up again, get removed.
async function purgeOldResolvedCases() {
  const now = Date.now();

  return withDB((db) => {
    const before = db.cases.length;
    db.cases = db.cases.filter((caseItem) => {
      if (caseItem.status !== 'resolved') return true;
      const resolvedAtMs = new Date(caseItem.resolvedAt || caseItem.timestamp).getTime();
      return now - resolvedAtMs < RESOLVED_CASE_RETENTION_MS;
    });
    return { purgedCount: before - db.cases.length };
  });
}

module.exports = { purgeOldResolvedCases, RESOLVED_CASE_RETENTION_MS };
