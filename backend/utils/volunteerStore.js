const { pool } = require('./pgPool');

// Migrations (including the volunteer_locations table) are applied once by
// utils/db.js#initializeDB() at boot; this is a no-op kept only so
// server.js's existing initializeStore() call site doesn't need to change.
function initializeStore() {}

function rowToVolunteer(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    lat: row.lat,
    lng: row.lng,
    lastSeen: row.last_seen instanceof Date ? row.last_seen.toISOString() : row.last_seen,
    trackingEnabled: row.tracking_enabled,
    pushSubscription: row.push_subscription,
  };
}

// Shared by both Tier 1 (device:<id>, role 'public') and Tier 2
// (responder:<id>, role 'registered') location opt-in - id/role are always
// server-derived, never taken from the request body, so a client can't
// claim a different identity or a stronger role for itself.
async function upsertVolunteerLocation(id, role, { lat, lng, trackingEnabled, pushSubscription }) {
  const { rows } = await pool.query(
    `INSERT INTO volunteer_locations (id, role, lat, lng, last_seen, tracking_enabled, push_subscription)
     VALUES ($1,$2,$3,$4,now(),$5,$6)
     ON CONFLICT (id) DO UPDATE SET
       role = EXCLUDED.role,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       last_seen = now(),
       tracking_enabled = EXCLUDED.tracking_enabled,
       push_subscription = EXCLUDED.push_subscription
     RETURNING *`,
    [id, role, lat, lng, Boolean(trackingEnabled), trackingEnabled ? JSON.stringify(pushSubscription) : null]
  );
  return rowToVolunteer(rows[0]);
}

// Full delete rather than flipping tracking_enabled to false, so an opted-
// out device leaves no lat/lng or pushSubscription sitting in the table.
async function deleteVolunteerLocation(id) {
  const { rowCount } = await pool.query('DELETE FROM volunteer_locations WHERE id = $1', [id]);
  return rowCount > 0;
}

// Every volunteer with an active push subscription, for alertNearbyVolunteers
// to distance-filter in JS (same as the flat-file version did) - a
// PostGIS-backed radius query would be the "proper" next step but is more
// than this migration needs to take on.
async function getTrackedVolunteers() {
  const { rows } = await pool.query(
    'SELECT * FROM volunteer_locations WHERE tracking_enabled = true AND push_subscription IS NOT NULL'
  );
  return rows.map(rowToVolunteer);
}

async function deleteVolunteerLocations(ids) {
  if (ids.length === 0) return;
  await pool.query('DELETE FROM volunteer_locations WHERE id = ANY($1::text[])', [ids]);
}

// Passive backstop for Tier 1 (public) devices that never hit the explicit
// opt-out endpoint - an abandoned tab, an uninstalled PWA, a device that
// just stopped sending location pings. Scoped to role 'public' only: a
// registered responder's tracking preference is tied to their account and
// is expected to persist the way a login-gated setting normally would.
async function deleteStalePublicVolunteers(staleMs) {
  const { rowCount } = await pool.query(
    `DELETE FROM volunteer_locations WHERE role = 'public' AND last_seen < now() - ($1::text)::interval`,
    [`${staleMs} milliseconds`]
  );
  return rowCount;
}

module.exports = {
  initializeStore,
  upsertVolunteerLocation,
  deleteVolunteerLocation,
  getTrackedVolunteers,
  deleteVolunteerLocations,
  deleteStalePublicVolunteers,
};
