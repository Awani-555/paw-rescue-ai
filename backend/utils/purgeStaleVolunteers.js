const { withStore } = require('./volunteerStore');

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
  const now = Date.now();

  return withStore((store) => {
    const before = store.volunteers.length;
    store.volunteers = store.volunteers.filter((volunteer) => {
      if (volunteer.role !== 'public') return true;
      const lastSeenMs = new Date(volunteer.lastSeen || 0).getTime();
      return now - lastSeenMs < STALE_VOLUNTEER_MS;
    });
    return { purgedCount: before - store.volunteers.length };
  });
}

module.exports = { purgeStaleVolunteers, STALE_VOLUNTEER_MS };
