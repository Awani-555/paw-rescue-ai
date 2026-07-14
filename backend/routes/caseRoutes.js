const express = require('express');
const { readDB, writeDB } = require('../utils/db');
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

router.post('/:id/respond', (req, res) => {
  const db = readDB();
  const caseItem = db.cases.find((c) => c.id === req.params.id);

  if (!caseItem) {
    return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
  }

  caseItem.status = 'responding';
  caseItem.respondedBy = req.responder?.email || null;
  caseItem.respondedAt = new Date().toISOString();
  writeDB(db);

  return success(res, { case: caseItem });
});

router.post('/:id/resolve', (req, res) => {
  const db = readDB();
  const caseItem = db.cases.find((c) => c.id === req.params.id);

  if (!caseItem) {
    return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
  }

  caseItem.status = 'resolved';
  caseItem.resolvedBy = req.responder?.email || null;
  caseItem.resolvedAt = new Date().toISOString();
  writeDB(db);

  return success(res, { case: caseItem });
});

module.exports = router;
