const webpush = require('web-push');
const { readStore, writeStore } = require('./volunteerStore');
const { calculateDistance } = require('./distance');

function formatSeverity(severity) {
  if (!severity) return 'Unknown severity';
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

// GPS accuracy on a phone is commonly 5-50m outdoors and much worse
// indoors/urban-canyon, so this needs to be generous enough that a real
// nearby volunteer isn't missed, not a tight precision radius.
const ALERT_RADIUS_METERS = Number(process.env.ALERT_RADIUS_METERS) || 100;

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
  return true;
}

// Tier 2 (registered, logged-in responders): the existing full case detail,
// same shape already used by the responder dashboard/claim flow.
// Tier 1 (anonymous public opt-in): deliberately vague. No species, no
// severity, no exact coordinates, no reporter identity, anywhere in the
// payload, not just hidden in the UI, since a payload can be inspected.
function buildPayload(caseItem, role) {
  if (role === 'registered') {
    return {
      detail: 'full',
      title: 'An animal near you needs help',
      body: `${caseItem.species || 'Unknown animal'} - ${formatSeverity(caseItem.severity)}`,
      caseId: caseItem.id,
      species: caseItem.species,
      severity: caseItem.severity,
      lat: caseItem.lat,
      lng: caseItem.lng,
      timestamp: caseItem.timestamp,
      url: `/?case=${encodeURIComponent(caseItem.id)}`,
    };
  }

  return {
    detail: 'soft',
    title: 'An animal nearby may need help',
    body: 'Tap to see if you can help.',
    caseId: caseItem.id,
    url: `/?help=${encodeURIComponent(caseItem.id)}`,
  };
}

function findNearbyVolunteers(store, caseItem) {
  return store.volunteers.filter((volunteer) => {
    if (!volunteer.trackingEnabled || !volunteer.pushSubscription) return false;
    if (typeof volunteer.lat !== 'number' || typeof volunteer.lng !== 'number') return false;

    const distanceMeters = calculateDistance(caseItem.lat, caseItem.lng, volunteer.lat, volunteer.lng) * 1000;
    return distanceMeters <= ALERT_RADIUS_METERS;
  });
}

// Fans a new case out to every opted-in volunteer within ALERT_RADIUS_METERS,
// sending each the payload appropriate to their tier. Never throws: a push
// delivery failure should never fail the report submission that triggered it.
async function alertNearbyVolunteers(caseItem) {
  if (!ensureVapidConfigured()) {
    console.warn('VAPID keys not configured; skipping nearby-volunteer push notifications.');
    return { notified: 0, expired: 0 };
  }

  const store = readStore();
  const nearby = findNearbyVolunteers(store, caseItem);

  let notified = 0;
  const expiredIds = [];

  await Promise.all(
    nearby.map(async (volunteer) => {
      const payload = buildPayload(caseItem, volunteer.role);
      try {
        await webpush.sendNotification(volunteer.pushSubscription, JSON.stringify(payload));
        notified += 1;
      } catch (err) {
        // 404/410 means the browser unsubscribed or the subscription
        // expired; anything else is a transient failure worth logging
        // but not worth deleting the volunteer's registration over.
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredIds.push(volunteer.id);
        } else {
          console.error(`Push notification failed for volunteer ${volunteer.id}:`, err.message);
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    const fresh = readStore();
    fresh.volunteers = fresh.volunteers.filter((v) => !expiredIds.includes(v.id));
    writeStore(fresh);
  }

  return { notified, expired: expiredIds.length };
}

module.exports = { alertNearbyVolunteers, findNearbyVolunteers, buildPayload, ALERT_RADIUS_METERS };
