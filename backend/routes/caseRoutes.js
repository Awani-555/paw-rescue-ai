const express = require('express');
const { getActiveCases, respondToCase, resolveCase } = require('../utils/db');
const { calculateDistance } = require('../utils/distance');
const { success, error } = require('../utils/respond');
const { isValidCoordinate } = require('../middleware/sanitize');

const router = express.Router();
const SEVERITY_ORDER = { critical: 0, urgent: 1, mild: 2 };

router.get('/', async (req, res) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
    const hasOrigin = isValidCoordinate(lat, lng);

    // getActiveCases() already orders by severity then created_at in SQL,
    // which is sufficient when the caller's own location isn't known. When
    // it is, distance becomes a tiebreaker *within* each severity group,
    // not a replacement for severity ordering - re-sorting by distance
    // alone here would lose that, so the full 3-tier comparison happens
    // in JS the same way it always has.
    const cases = await getActiveCases();
    const activeCases = cases
      .map((c) => ({ ...c, distance: hasOrigin ? calculateDistance(lat, lng, c.lat, c.lng) : null }))
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
  } catch (err) {
    console.error('Error in GET /api/cases:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

router.post('/:id/respond', async (req, res) => {
  try {
    const caseItem = await respondToCase(req.params.id, req.responder?.email || null);

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
    // Public helper contact info only needs to live long enough for the
    // reporter to call them; once the case is resolved, there's nothing
    // left to coordinate, so resolveCase() purges it immediately (in the
    // same transaction) rather than waiting for the 48h sweep
    // (utils/purgeExpiredHelpers.js).
    const caseItem = await resolveCase(req.params.id, req.responder?.email || null);

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
