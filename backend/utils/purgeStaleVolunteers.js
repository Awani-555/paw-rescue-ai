const { deleteStalePublicVolunteers } = require('./volunteerStore');

const STALE_VOLUNTEER_MS = 24 * 60 * 60 * 1000;

// A user tapping "turn off alerts" triggers immediate deletion (see the
// DELETE /api/volunteers/public-location/:deviceId route in server.js).
// This is the passive backstop for everyone who never taps that: an
// abandoned tab, an uninstalled PWA, a device that just stopped sending
// location pings. Scoped to role 'public' specifically, a registered
// responder's tracking preference is tied to their account and is
// expected to persist across sessions the way a login-gated setting
// normally would.
async function purgeStaleVolunteers() {
  const purgedCount = await deleteStalePublicVolunteers(STALE_VOLUNTEER_MS);
  return { purgedCount };
}

module.exports = { purgeStaleVolunteers, STALE_VOLUNTEER_MS };
