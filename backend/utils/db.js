const { pool } = require('./pgPool');
const { applyMigrations } = require('../migrations/apply');

async function initializeDB() {
  await applyMigrations();
}

// Maps a cases row (snake_case columns) to the camelCase shape the rest of
// the app already expects in API responses - keeps every existing response
// shape unchanged even though storage moved from JSON to SQL.
function rowToCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportId: row.report_id,
    species: row.species,
    severity: row.severity,
    detectedLabel: row.detected_label,
    confidence: row.confidence,
    injuries: row.injuries,
    firstAid: row.first_aid,
    severityNote: row.severity_note,
    nearestFacilities: row.nearest_facilities,
    image: row.image,
    location: row.location,
    notes: row.notes,
    lat: row.lat,
    lng: row.lng,
    hasGpsLocation: row.has_gps_location,
    nearbyAlertsSkipped: row.nearby_alerts_skipped,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    status: row.status,
    respondedBy: row.responded_by,
    respondedAt: row.responded_at instanceof Date ? row.responded_at.toISOString() : row.responded_at,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
    // Only present when the query aggregated it in (see getActiveCases) -
    // matches the old in-memory shape exactly: still-encrypted name/phone,
    // never decrypted for the responder-facing case list.
    ...(row.public_helpers !== undefined ? { publicHelpers: row.public_helpers } : {}),
  };
}

function rowToResponder(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    phone: row.phone,
    passwordHash: row.password_hash,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToHelper(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name_encrypted,
    phone: row.phone_encrypted,
    respondedAt: row.responded_at instanceof Date ? row.responded_at.toISOString() : row.responded_at,
  };
}

// Full result of POST /api/report: creates one row that serves both the
// reporter's own view (species/severity/AI detail/facilities) and the
// responder dashboard's view of the same event - these used to be two
// separate JSON objects (report + case) written 1:1 on every submission;
// merged into one row here since nothing ever diverges them afterward.
async function createCase(data) {
  const { rows } = await pool.query(
    `INSERT INTO cases (
       id, report_id, species, severity, detected_label, confidence, injuries, first_aid,
       severity_note, nearest_facilities, image, location, notes, lat, lng,
       has_gps_location, nearby_alerts_skipped, status, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'open',$18)
     RETURNING *`,
    [
      data.id,
      data.reportId,
      data.species,
      data.severity,
      data.detectedLabel,
      data.confidence,
      JSON.stringify(data.injuries || []),
      JSON.stringify(data.firstAid || []),
      data.severityNote,
      JSON.stringify(data.nearestFacilities || []),
      data.image,
      data.location,
      data.notes,
      data.lat,
      data.lng,
      // Explicit undefined binds as SQL NULL (not "omit, use the column
      // default"), which would violate these two NOT NULL columns -
      // coerce so a caller that omits them still gets the intended
      // false/true default rather than an insert error.
      Boolean(data.hasGpsLocation),
      data.nearbyAlertsSkipped === undefined ? true : Boolean(data.nearbyAlertsSkipped),
      data.timestamp,
    ]
  );
  return rowToCase(rows[0]);
}

async function getCaseById(id) {
  const { rows } = await pool.query('SELECT * FROM cases WHERE id = $1', [id]);
  return rowToCase(rows[0]);
}

// GET /api/cases - every non-resolved case, closest-severity-first then
// (when the caller's own lat/lng is known) nearest-first, then oldest
// first - same ordering the in-memory version applied in JS, done here as
// a single query instead. Each case's (still-encrypted) public helpers are
// aggregated in via a correlated subquery rather than N+1 round-trips.
async function getActiveCases() {
  const { rows } = await pool.query(
    `SELECT c.*,
       COALESCE(
         (SELECT json_agg(
            json_build_object(
              'id', ph.id, 'name', ph.name_encrypted, 'phone', ph.phone_encrypted, 'respondedAt', ph.responded_at
            ) ORDER BY ph.responded_at
          ) FROM public_helpers ph WHERE ph.case_id = c.id),
         '[]'
       ) AS public_helpers
     FROM cases c
     WHERE c.status != 'resolved'
     ORDER BY
       CASE c.severity WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 WHEN 'mild' THEN 2 ELSE 3 END,
       c.created_at ASC`
  );
  return rows.map(rowToCase);
}

// Used only for the reporter-facing "N active cases" count on the landing
// page today - a count is all that's ever read from the result.
async function getActiveCaseCount() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM cases WHERE status != 'resolved'");
  return rows[0].count;
}

async function respondToCase(id, responderEmail) {
  const { rows } = await pool.query(
    `UPDATE cases SET status = 'responding', responded_by = $2, responded_at = now()
     WHERE id = $1 RETURNING *`,
    [id, responderEmail]
  );
  if (!rows[0]) return null;

  const helpers = await getHelpersForCase(id);
  return { ...rowToCase(rows[0]), publicHelpers: helpers.map((h) => ({ id: h.id, name: h.name, phone: h.phone, respondedAt: h.respondedAt })) };
}

// Resolving also purges that case's public helper contact info immediately
// (same behavior as before: helper data only needs to live long enough for
// the reporter to call them, and there's nothing left to coordinate once
// resolved) rather than waiting for the 48h sweep.
async function resolveCase(id, responderEmail) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE cases SET status = 'resolved', resolved_by = $2, resolved_at = now()
       WHERE id = $1 RETURNING *`,
      [id, responderEmail]
    );
    if (rows[0]) {
      await client.query('DELETE FROM public_helpers WHERE case_id = $1', [id]);
    }
    await client.query('COMMIT');
    if (!rows[0]) return null;
    return { ...rowToCase(rows[0]), publicHelpers: [] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getResponderByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM responders WHERE lower(email) = lower($1)', [email]);
  return rowToResponder(rows[0]);
}

// Relies on the UNIQUE constraint on responders.email to make the
// check-then-insert atomic at the database level (Postgres error code
// 23505 on violation) instead of the JS-side write-queue serialization the
// flat-file version needed to prevent two concurrent registrations with
// the same email both passing a separate existence check before either
// wrote - a real database can just enforce this directly.
async function createResponder(data) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO responders (id, name, email, organization, phone, password_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.id, data.name, data.email, data.organization, data.phone, data.passwordHash, data.createdAt]
    );
    return { responder: rowToResponder(rows[0]) };
  } catch (err) {
    if (err.code === '23505') {
      return { conflict: true };
    }
    throw err;
  }
}

async function getHelpersForCase(caseId) {
  const { rows } = await pool.query(
    'SELECT * FROM public_helpers WHERE case_id = $1 ORDER BY responded_at ASC',
    [caseId]
  );
  return rows.map(rowToHelper);
}

async function getHelperById(helperId) {
  const { rows } = await pool.query('SELECT * FROM public_helpers WHERE id = $1', [helperId]);
  return rowToHelper(rows[0]);
}

// Returns null if the case doesn't exist, 'resolved' if it's already
// resolved (help offers aren't accepted after that), or the created helper
// row otherwise - callers translate these into the same 404/409/201
// responses as before.
async function addPublicHelper(caseId, { id, nameEncrypted, phoneEncrypted }) {
  const caseRow = await getCaseById(caseId);
  if (!caseRow) return { notFound: true };
  if (caseRow.status === 'resolved') return { resolved: true };

  const { rows } = await pool.query(
    `INSERT INTO public_helpers (id, case_id, name_encrypted, phone_encrypted, consented, responded_at)
     VALUES ($1,$2,$3,$4,true,now()) RETURNING *`,
    [id, caseId, nameEncrypted, phoneEncrypted]
  );
  return { helper: rowToHelper(rows[0]) };
}

module.exports = {
  initializeDB,
  createCase,
  getCaseById,
  getActiveCases,
  getActiveCaseCount,
  respondToCase,
  resolveCase,
  getResponderByEmail,
  createResponder,
  getHelpersForCase,
  getHelperById,
  addPublicHelper,
};
