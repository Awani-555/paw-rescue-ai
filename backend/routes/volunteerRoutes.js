const express = require('express');
const { withStore } = require('../utils/volunteerStore');
const { success, error } = require('../utils/respond');
const { isValidCoordinate, isValidPushSubscription } = require('../middleware/sanitize');

const router = express.Router();

// Tier 2: registered responders who are logged in and have opted into
// location tracking on the dashboard. Identity comes from the JWT, never
// from the request body, so a client can't claim a different responder's
// slot or (more importantly) claim the 'registered' role for itself.
router.post('/registered-location', async (req, res) => {
  try {
    const { lat, lng, trackingEnabled, pushSubscription } = req.body || {};
    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!isValidCoordinate(numLat, numLng)) {
      return error(res, 400, 'VALIDATION_ERROR', 'A valid lat/lng is required.');
    }
    if (trackingEnabled && !isValidPushSubscription(pushSubscription)) {
      return error(res, 400, 'VALIDATION_ERROR', 'A valid push subscription is required to enable tracking.');
    }

    const volunteerId = `responder:${req.responder.id}`;

    const record = await withStore((store) => {
      let entry = store.volunteers.find((v) => v.id === volunteerId);
      if (!entry) {
        entry = { id: volunteerId, role: 'registered' };
        store.volunteers.push(entry);
      }
      entry.role = 'registered';
      entry.lat = numLat;
      entry.lng = numLng;
      entry.lastSeen = new Date().toISOString();
      entry.trackingEnabled = Boolean(trackingEnabled);
      entry.pushSubscription = trackingEnabled ? pushSubscription : null;
      return { id: entry.id, trackingEnabled: entry.trackingEnabled };
    });

    return success(res, record);
  } catch (err) {
    console.error('Error in /api/volunteers/registered-location:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

module.exports = router;
