const { withDB } = require('./db');

const HELPER_RETENTION_MS = 48 * 60 * 60 * 1000;

// Contact info a Tier 1 public helper submits is only meant to live long
// enough for the reporter to actually call them. This purges individual
// helper entries once they're older than 48h, independent of the case's
// own status (resolve-time purging is handled separately, in
// caseRoutes.js, since that's an immediate event rather than a sweep).
async function purgeExpiredHelpers() {
  const now = Date.now();

  return withDB((db) => {
    let purgedCount = 0;

    for (const caseItem of db.cases) {
      if (!Array.isArray(caseItem.publicHelpers) || caseItem.publicHelpers.length === 0) continue;

      const before = caseItem.publicHelpers.length;
      caseItem.publicHelpers = caseItem.publicHelpers.filter((helper) => {
        const age = now - new Date(helper.respondedAt).getTime();
        return age < HELPER_RETENTION_MS;
      });
      purgedCount += before - caseItem.publicHelpers.length;
    }

    return { purgedCount };
  });
}

module.exports = { purgeExpiredHelpers, HELPER_RETENTION_MS };
