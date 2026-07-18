const express = require('express');
const { readDB, withDB } = require('../utils/db');
const { calculateDistance } = require('../utils/distance');
const { success, error } = require('../utils/respond');
const { isValidCoordinate } = require('../middleware/sanitize');

const router = express.Router();
const SEVERITY_ORDER = { critical: 0, urgent: 1, mild: 2 };

router.get('/', (req, res) => {
  const db = readDB();
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
  const hasOrigin = isValidCoordinate(lat, lng);

  const activeCases = db.cases
    .filter((c) => c.status !== 'resolved')
    .map((c) => ({
      ...c,
      distance: hasOrigin ? calculateDistance(lat, lng, c.lat, c.lng) : null,
    }))
    .sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
      if (severityDiff !== 0) return severityDiff;

      if (hasOrigin) {
        const distanceDiff = (a.distance ?? Infinity) - (b.distance ?? Infinity);
        if (distanceDiff !== 0) return distanceDiff;
      }

      return new Date(a.timestamp) - new Date(b.timestamp);
    });

  return success(res, { cases: activeCases });
});

router.post('/:id/respond', async (req, res) => {
  try {
    const caseItem = await withDB((db) => {
      const found = db.cases.find((c) => c.id === req.params.id);
      if (!found) return null;

      found.status = 'responding';
      found.respondedBy = req.responder?.email || null;
      found.respondedAt = new Date().toISOString();
      return found;
    });

    if (!caseItem) {
      return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
    }
    return success(res, { case: caseItem });
  } catch (err) {
    console.error('Error in /api/cases/:id/respond:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

router.post('/:id/resolve', async (req, res) => {
  try {
    const caseItem = await withDB((db) => {
      const found = db.cases.find((c) => c.id === req.params.id);
      if (!found) return null;

      found.status = 'resolved';
      found.resolvedBy = req.responder?.email || null;
      found.resolvedAt = new Date().toISOString();
      // Public helper contact info only needs to live long enough for the
      // reporter to call them; once the case is resolved, there's nothing
      // left to coordinate, so purge it immediately rather than waiting
      // for the 48h sweep (utils/purgeExpiredHelpers.js).
      found.publicHelpers = [];
      return found;
    });

    if (!caseItem) {
      return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
    }
    return success(res, { case: caseItem });
  } catch (err) {
    console.error('Error in /api/cases/:id/resolve:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

module.exports = router;
