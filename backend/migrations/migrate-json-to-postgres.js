// One-time data migration: db.json / volunteer-locations.json -> Postgres.
//
// Not run automatically anywhere (not wired into server.js's boot
// sequence, not part of any npm script) - run it by hand, once:
//   node migrations/migrate-json-to-postgres.js
//
// Safe to run more than once by accident: every insert below is
// ON CONFLICT (id) DO NOTHING, so re-running just skips rows that already
// made it over on a previous run rather than erroring or duplicating.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../utils/pgPool');
const { applyMigrations } = require('./apply');

const DB_JSON_PATH = path.join(__dirname, '..', 'db.json');
const VOLUNTEER_JSON_PATH = path.join(__dirname, '..', 'volunteer-locations.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function migrateResponders(responders) {
  let count = 0;
  for (const r of responders || []) {
    // eslint-disable-next-line no-await-in-loop -- small one-time dataset, sequential is fine and easier to reason about
    const { rowCount } = await pool.query(
      `INSERT INTO responders (id, name, email, organization, phone, password_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.email, r.organization, r.phone, r.passwordHash, r.createdAt]
    );
    count += rowCount;
  }
  return count;
}

// db.json historically stored two parallel objects per submission - a
// `report` (full AI detail, capped at 100) and a `case` (the responder-
// facing subset). The new schema merges these into one `cases` row; this
// migration prefers the `case` object's fields (status/respondedBy/
// resolvedBy live there) and fills in from the matching `report` (by
// reportId) for the AI-detail fields the case object never carried
// (confidence, injuries, first_aid, detected_label, severity_note,
// nearestFacilities).
async function migrateCases(cases, reports) {
  const reportsById = new Map((reports || []).map((r) => [r.id, r]));
  let count = 0;

  for (const c of cases || []) {
    const report = reportsById.get(c.reportId) || {};
    const result = report.result || {};

    // eslint-disable-next-line no-await-in-loop
    const { rowCount } = await pool.query(
      `INSERT INTO cases (
         id, report_id, species, severity, detected_label, confidence, injuries, first_aid,
         severity_note, nearest_facilities, image, location, notes, lat, lng,
         has_gps_location, nearby_alerts_skipped, status, responded_by, responded_at,
         resolved_by, resolved_at, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO NOTHING`,
      [
        c.id,
        c.reportId,
        c.species,
        c.severity,
        result.detected_label ?? null,
        result.confidence ?? null,
        JSON.stringify(result.injuries || []),
        JSON.stringify(result.first_aid || []),
        result.severity_note ?? null,
        JSON.stringify(result.nearestFacilities || []),
        c.image,
        c.location,
        c.notes,
        c.lat,
        c.lng,
        Boolean(c.hasGpsLocation),
        report.nearbyAlertsSkipped ?? !c.hasGpsLocation,
        c.status || 'open',
        c.respondedBy ?? null,
        c.respondedAt ?? null,
        c.resolvedBy ?? null,
        c.resolvedAt ?? null,
        c.timestamp,
      ]
    );
    count += rowCount;

    // eslint-disable-next-line no-await-in-loop
    count += await migratePublicHelpers(c.id, c.publicHelpers);
  }

  return count;
}

// publicHelpers entries were already AES-256-GCM encrypted at rest in the
// JSON version (see utils/encryption.js) - the ciphertext strings carry
// straight over into name_encrypted/phone_encrypted unchanged, no
// decrypt/re-encrypt step needed.
async function migratePublicHelpers(caseId, helpers) {
  let count = 0;
  for (const h of helpers || []) {
    // eslint-disable-next-line no-await-in-loop
    const { rowCount } = await pool.query(
      `INSERT INTO public_helpers (id, case_id, name_encrypted, phone_encrypted, consented, responded_at)
       VALUES ($1,$2,$3,$4,true,$5)
       ON CONFLICT (id) DO NOTHING`,
      [h.id, caseId, h.name, h.phone, h.respondedAt]
    );
    count += rowCount;
  }
  return count;
}

async function migrateVolunteers(volunteers) {
  let count = 0;
  for (const v of volunteers || []) {
    // eslint-disable-next-line no-await-in-loop
    const { rowCount } = await pool.query(
      `INSERT INTO volunteer_locations (id, role, lat, lng, last_seen, tracking_enabled, push_subscription)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        v.id,
        v.role,
        v.lat,
        v.lng,
        v.lastSeen,
        Boolean(v.trackingEnabled),
        v.pushSubscription ? JSON.stringify(v.pushSubscription) : null,
      ]
    );
    count += rowCount;
  }
  return count;
}

async function main() {
  await applyMigrations();

  const db = readJson(DB_JSON_PATH);
  const volunteerStore = readJson(VOLUNTEER_JSON_PATH);

  if (!db && !volunteerStore) {
    console.log('Neither db.json nor volunteer-locations.json exist locally - nothing to migrate.');
    await pool.end();
    return;
  }

  const responderCount = await migrateResponders(db?.responders);
  const caseCount = await migrateCases(db?.cases, db?.reports);
  const volunteerCount = await migrateVolunteers(volunteerStore?.volunteers);

  console.log('Migration complete:');
  console.log(`  responders inserted: ${responderCount}`);
  console.log(`  cases inserted:      ${caseCount}`);
  console.log(`  volunteers inserted: ${volunteerCount}`);
  console.log(
    '(counts of 0 across the board on a second run is expected - ON CONFLICT DO NOTHING skips rows already migrated.)'
  );

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
