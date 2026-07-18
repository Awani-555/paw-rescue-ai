require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const { initializeDB, readDB, withDB, DB_PATH } = require('./utils/db');
const { initializeStore: initializeVolunteerStore, withStore } = require('./utils/volunteerStore');
const { calculateDistance, loadFacilities } = require('./utils/distance');
const { alertNearbyVolunteers } = require('./utils/alertNearbyVolunteers');
const { purgeExpiredHelpers } = require('./utils/purgeExpiredHelpers');
const { purgeStaleVolunteers } = require('./utils/purgeStaleVolunteers');
const { purgeOldResolvedCases } = require('./utils/purgeOldResolvedCases');
const { encrypt, decrypt } = require('./utils/encryption');
const { issueCallToken, consumeCallToken } = require('./utils/callTokens');
const { success, error } = require('./utils/respond');
const { sanitizeBody, isValidCoordinate, isValidPushSubscription } = require('./middleware/sanitize');
const requestLogger = require('./middleware/requestLogger');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');
const caseRoutes = require('./routes/caseRoutes');
const volunteerRoutes = require('./routes/volunteerRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
const MAX_IMAGE_BASE64_CHARS = 15 * 1024 * 1024;
// Shared fallback origin for any report/case that arrives without a real
// GPS fix - kept as one named constant rather than the same two numbers
// copy-pasted across frontend and backend (it used to be).
const DEFAULT_LOCATION = { lat: 26.8467, lng: 80.9462 };

// Shared secret with ai-service (see ai-service/main.py's
// require_internal_token) so that service can't be called by anyone except
// this backend. Required in the same fail-fast way as JWT_SECRET: booting
// with no token configured would either send an empty header (indistinguishable
// from a misconfigured deployment) or silently skip auth, neither of which
// should happen quietly.
const AI_SERVICE_TOKEN = process.env.AI_SERVICE_TOKEN;
if (!AI_SERVICE_TOKEN) {
  throw new Error(
    'AI_SERVICE_TOKEN environment variable is required. Generate one with: ' +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      'and set the same value as INTERNAL_SERVICE_TOKEN in ai-service/.env.'
  );
}

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: false,
  })
);
// Set above the 15MB application-level image check (server.js /api/report handler)
// so oversized payloads hit our own validation and get a clean JSON 400 instead
// of body-parser's default HTML 413.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(sanitizeBody);
app.use(requestLogger);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});
app.use('/api/', limiter);

// Tighter limit layered on top of the general one above, specifically for
// endpoints that collect contact info or register a device without any
// login: report creation and the Tier 1 anonymous public flows. Neither
// of those has an account behind it to rate-limit by, so IP is all we have.
const anonymousActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});

// POST /api/report - Accept image + notes + location, forward to AI, save result + create a case
app.post('/api/report', anonymousActionLimiter, async (req, res) => {
  try {
    const { image, notes, location, lat, lng, locationSource } = req.body || {};

    if (!image) {
      return error(res, 400, 'VALIDATION_ERROR', 'Image is required');
    }
    if (typeof image !== 'string') {
      return error(res, 400, 'VALIDATION_ERROR', 'Invalid image format');
    }
    if (image.length > MAX_IMAGE_BASE64_CHARS) {
      return error(res, 400, 'VALIDATION_ERROR', 'Image too large (max 15MB)');
    }

    const hasValidCoords = isValidCoordinate(Number(lat), Number(lng));
    // 'gps' is the only locationSource the frontend sends when
    // navigator.geolocation actually succeeded (see useGeolocation.js's
    // 'granted' status); anything else means lat/lng are a hardcoded
    // city-center default, not the reporter's real location - trusting
    // that for nearby-volunteer dispatch would alert the wrong people
    // entirely rather than just being imprecise, so it's tracked
    // separately from "do we have a number in range at all".
    const hasGpsLocation = hasValidCoords && locationSource === 'gps';
    const userLat = hasValidCoords ? Number(lat) : DEFAULT_LOCATION.lat;
    const userLng = hasValidCoords ? Number(lng) : DEFAULT_LOCATION.lng;

    const facilities = loadFacilities();
    const nearestFacilities = facilities
      .map((f) => ({ ...f, distance: calculateDistance(userLat, userLng, f.lat, f.lng) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    let aiResult;
    try {
      const aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze`,
        { image },
        { timeout: 15000, headers: { 'X-Internal-Token': AI_SERVICE_TOKEN } }
      );
      aiResult = aiResponse.data;
    } catch (aiErr) {
      console.error('AI service call failed, falling back to Urgent:', aiErr.message);
      // An unreachable/failed AI call is an unknown, not a reassurance:
      // defaulting to "Mild" here would be the exact false-negative the
      // severity signal exists to avoid, so an assessment that didn't
      // actually run leans toward "Urgent" instead (mirrors the same
      // fallback in ai-service/main.py's analyze_animal).
      aiResult = {
        species: 'Unknown',
        severity: 'Urgent',
        injuries: ['Unable to analyze, AI service unavailable'],
        confidence: 0.5,
        first_aid: ['Please consult a veterinarian for professional assessment'],
        detected_label: null,
        severity_note:
          'AI analysis was unavailable for this report. Severity was not assessed - use your own judgment and treat it as urgent if unsure.',
      };
    }

    aiResult.nearestFacilities = nearestFacilities;

    // crypto.randomUUID() rather than Date.now(): two reports submitted in
    // the same millisecond (a real possibility under concurrent load, not
    // just a load test) would otherwise get identical ids, silently
    // colliding in every downstream lookup keyed on report/case id.
    const reportId = `report_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const report = {
      id: reportId,
      timestamp,
      location: location || 'Location not specified',
      notes: notes || 'No notes provided',
      image: `data:image/jpeg;base64,${image}`,
      lat: userLat,
      lng: userLng,
      hasGpsLocation,
      nearbyAlertsSkipped: !hasGpsLocation,
      result: aiResult,
    };

    const newCase = {
      id: `case_${reportId}`,
      reportId,
      species: aiResult.species,
      severity: (aiResult.severity || 'mild').toLowerCase(),
      image: report.image,
      location: report.location,
      notes: report.notes,
      lat: userLat,
      lng: userLng,
      hasGpsLocation,
      timestamp,
      status: 'open',
      respondedBy: null,
      publicHelpers: [],
    };

    await withDB((db) => {
      db.reports.unshift(report);
      if (db.reports.length > 100) {
        db.reports = db.reports.slice(0, 100);
      }

      // Every report also creates a live case for responders
      db.cases.unshift(newCase);
    });

    // Fire-and-forget: nearby-volunteer alerting must never block or fail
    // the reporter's submission. alertNearbyVolunteers() already catches
    // its own errors, but this is deliberately not awaited so a slow push
    // fan-out (many volunteers) doesn't add latency to the report response.
    // Skipped entirely without a real GPS fix: alerting "nearby" volunteers
    // using the hardcoded default location would notify people near that
    // default city instead of near the actual animal, which is worse than
    // not alerting at all. The case is still fully visible to registered
    // responders via the normal case feed either way.
    if (hasGpsLocation) {
      alertNearbyVolunteers(newCase).catch((err) => {
        console.error('alertNearbyVolunteers failed:', err);
      });
    }

    return success(res, report, 201);
  } catch (err) {
    console.error('Error in /api/report:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Our servers had an issue. Your report was saved locally.');
  }
});

// GET /api/reports - Return all saved reports
app.get('/api/reports', (req, res) => {
  try {
    const db = readDB();
    return success(res, { reports: db.reports });
  } catch (err) {
    console.error('Error in /api/reports:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Could not load reports.');
  }
});

// ---- Tier 1: anonymous public endpoints -----------------------------
// These intentionally sit outside auth, registered before the
// requireAuth-gated /api/cases and /api/volunteers mounts below. Express
// matches routes in registration order, so a request to one of these
// exact path+method combos is handled here and never reaches requireAuth.
// Keeping that gate at the mount level (rather than threading an
// "optional auth" check through every case/volunteer route) means the
// registered-only endpoints can't accidentally end up unauthenticated by
// a future edit; only these explicitly-public ones bypass it, and only
// because they're declared first.

function isValidPublicHelperInput(name, phone, consent) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 100 &&
    typeof phone === 'string' &&
    phone.length > 0 &&
    phone.length <= 32 &&
    consent === true
  );
}

// Deliberately vague: no species, no severity, no coordinates, no
// reporter identity. Just enough for the "I'll Help" landing page to
// confirm the case is still open and say roughly how long ago it came in.
app.get('/api/cases/:id/public-summary', (req, res) => {
  try {
    const db = readDB();
    const caseItem = db.cases.find((c) => c.id === req.params.id);

    if (!caseItem) {
      return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
    }

    return success(res, { id: caseItem.id, status: caseItem.status, timestamp: caseItem.timestamp });
  } catch (err) {
    console.error('Error in /api/cases/:id/public-summary:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

// Lets the reporter (who never logs in, so there's no account to scope
// this to) see who has offered to help on their own case. The case id
// itself is the access scope here, same as public-summary and the help
// submission above: it's not secret in the way a password is, but it's
// only ever handed to the person who filed the report and to opted-in
// nearby volunteers, and isn't guessable or enumerable in practice given
// the report-id timestamp component. Anyone building on this later and
// wanting tighter scoping should look at issuing a separate per-report
// access token instead of reusing the case id.
// Never includes phone: only a helper id the reporter can exchange for a
// one-time call-token (below), which redirects to tel: without the number
// ever appearing in this response, the page DOM, or frontend JS state.
app.get('/api/cases/:id/helpers', (req, res) => {
  try {
    const db = readDB();
    const caseItem = db.cases.find((c) => c.id === req.params.id);

    if (!caseItem) {
      return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
    }

    const helpers = (caseItem.publicHelpers || []).map((helper) => ({
      id: helper.id,
      name: decrypt(helper.name),
      respondedAt: helper.respondedAt,
    }));

    return success(res, { helpers });
  } catch (err) {
    console.error('Error in /api/cases/:id/helpers:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

// Issues a short-lived, single-use token that /api/call/:token below will
// redeem for exactly one tel: redirect. The decrypted phone number exists
// only inside that token's in-memory record (utils/callTokens.js) for up
// to 5 minutes, never in this endpoint's JSON response.
app.get('/api/cases/:caseId/helpers/:helperId/call-token', (req, res) => {
  try {
    const db = readDB();
    const caseItem = db.cases.find((c) => c.id === req.params.caseId);

    if (!caseItem) {
      return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
    }

    const helper = (caseItem.publicHelpers || []).find((h) => h.id === req.params.helperId);
    if (!helper) {
      return error(res, 404, 'HELPER_NOT_FOUND', 'This helper could not be found.');
    }

    const token = issueCallToken(decrypt(helper.phone));
    return success(res, { token });
  } catch (err) {
    console.error('Error in /api/cases/:caseId/helpers/:helperId/call-token:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

// Redeems a call-token: 302s straight to tel:, so the phone number passes
// through a redirect Location header rather than ever being rendered
// into the reporter's page or held in frontend JS memory.
app.get('/api/call/:token', (req, res) => {
  const phone = consumeCallToken(req.params.token);
  if (!phone) {
    return error(res, 410, 'TOKEN_EXPIRED', 'This call link has expired or was already used.');
  }
  return res.redirect(302, `tel:${phone}`);
});

// Tier 1 "I'll Help" submission. One-way: the helper's name/phone go into
// the case for the reporter to see (via a tel: link, never rendered as
// text - see FacilityCard-style handling on the frontend), and the
// reporter's own identity/location is never exposed back to the helper
// at any point, not here or in the public-summary endpoint above.
app.post('/api/cases/:id/help', anonymousActionLimiter, async (req, res) => {
  try {
    const { name, phone, consent } = req.body || {};

    if (!isValidPublicHelperInput(name, phone, consent)) {
      return error(
        res,
        400,
        'VALIDATION_ERROR',
        'Name and phone are required, and you must confirm sharing them with the reporter.'
      );
    }

    const outcome = await withDB((db) => {
      const caseItem = db.cases.find((c) => c.id === req.params.id);
      if (!caseItem) return { notFound: true };
      if (caseItem.status === 'resolved') return { resolved: true };

      if (!Array.isArray(caseItem.publicHelpers)) caseItem.publicHelpers = [];
      // name and phone are encrypted at rest (utils/encryption.js); name
      // is decrypted back for the reporter-facing helper list, phone is
      // only ever decrypted server-side at call-token issuance time.
      caseItem.publicHelpers.push({
        id: crypto.randomUUID(),
        name: encrypt(name),
        phone: encrypt(phone),
        respondedAt: new Date().toISOString(),
      });
      return { ok: true };
    });

    if (outcome.notFound) {
      return error(res, 404, 'CASE_NOT_FOUND', 'This case could not be found.');
    }
    if (outcome.resolved) {
      return error(res, 409, 'CASE_RESOLVED', 'This case has already been resolved.');
    }

    return success(res, { submitted: true }, 201);
  } catch (err) {
    console.error('Error in /api/cases/:id/help:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

// Tier 1 location + push-subscription opt-in. No account: the client
// generates its own deviceId (see frontend/src/hooks/useDeviceId.js) and
// that's the only identity this ever has. Role is hardcoded to 'public'
// here, never taken from the request body, since role is what determines
// how much case detail a push payload is allowed to carry.
app.post('/api/volunteers/public-location', anonymousActionLimiter, async (req, res) => {
  try {
    const { deviceId, lat, lng, trackingEnabled, pushSubscription } = req.body || {};
    const numLat = Number(lat);
    const numLng = Number(lng);

    if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 128) {
      return error(res, 400, 'VALIDATION_ERROR', 'A valid deviceId is required.');
    }
    if (!isValidCoordinate(numLat, numLng)) {
      return error(res, 400, 'VALIDATION_ERROR', 'A valid lat/lng is required.');
    }
    if (trackingEnabled && !isValidPushSubscription(pushSubscription)) {
      return error(res, 400, 'VALIDATION_ERROR', 'A valid push subscription is required to enable tracking.');
    }

    const volunteerId = `device:${deviceId}`;

    const record = await withStore((store) => {
      let entry = store.volunteers.find((v) => v.id === volunteerId);
      if (!entry) {
        entry = { id: volunteerId, role: 'public' };
        store.volunteers.push(entry);
      }
      entry.role = 'public';
      entry.lat = numLat;
      entry.lng = numLng;
      entry.lastSeen = new Date().toISOString();
      entry.trackingEnabled = Boolean(trackingEnabled);
      entry.pushSubscription = trackingEnabled ? pushSubscription : null;
      return { id: entry.id, trackingEnabled: entry.trackingEnabled };
    });

    return success(res, record);
  } catch (err) {
    console.error('Error in /api/volunteers/public-location:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

// Full opt-out: removes the entry entirely rather than flipping
// trackingEnabled to false, so a disabled device leaves no lat/lng or
// pushSubscription sitting in the store. Knowing the deviceId is the
// same proof-of-ownership the POST endpoint above already relies on;
// this doesn't introduce a new, weaker trust boundary.
app.delete('/api/volunteers/public-location/:deviceId', async (req, res) => {
  try {
    const volunteerId = `device:${req.params.deviceId}`;
    const removed = await withStore((store) => {
      const before = store.volunteers.length;
      store.volunteers = store.volunteers.filter((v) => v.id !== volunteerId);
      return before !== store.volunteers.length;
    });

    return success(res, { removed });
  } catch (err) {
    console.error('Error in DELETE /api/volunteers/public-location/:deviceId:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

// Responder auth (public), case management and volunteer location
// tracking (both JWT-protected)
app.use('/api/auth', authRoutes);
app.use('/api/cases', requireAuth, caseRoutes);
app.use('/api/volunteers', requireAuth, volunteerRoutes);

// Health check
app.get('/health', (req, res) => {
  success(res, { status: 'ok', service: 'paw-rescue-backend' });
});

// Global error handler: keeps every response (including body-parser
// failures like oversized payloads) in the standard { success, error } shape.
// Express only recognizes this as error-handling middleware because it has
// exactly 4 parameters; `next` is required by that arity check even though
// it's never called.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return error(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large.');
  }
  // express.json() throws a SyntaxError for a malformed body - that's a
  // client mistake, not a server fault, and shouldn't be a 500 (which
  // would also wrongly flag it as a real outage in logs/monitoring).
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return error(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON.');
  }
  console.error('Unhandled error:', err);
  return error(res, 500, 'INTERNAL_ERROR', 'Our servers had an issue. Please try again.');
});

// Only boot an HTTP listener when run directly (`node server.js`).
// When required by tests (e.g. supertest), the app is exported unstarted.
if (require.main === module) {
  initializeDB();
  initializeVolunteerStore();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Database location: ${DB_PATH}`);
    console.log(`AI service: ${AI_SERVICE_URL}`);
  });

  // Belt-and-suspenders alongside the immediate purge on case resolve
  // (caseRoutes.js): catches helper info for cases that never get
  // explicitly resolved. Every 30 minutes is frequent enough that no
  // entry lives meaningfully past the 48h retention window.
  const purgeInterval = setInterval(
    () => {
      purgeExpiredHelpers().catch((err) => console.error('purgeExpiredHelpers failed:', err));
    },
    30 * 60 * 1000
  );
  purgeInterval.unref();

  // Passive backstop for Tier 1 (public) location tracking: catches
  // abandoned tabs and uninstalled PWAs that never hit the explicit
  // opt-out endpoint. See utils/purgeStaleVolunteers.js.
  const staleVolunteerInterval = setInterval(
    () => {
      purgeStaleVolunteers().catch((err) => console.error('purgeStaleVolunteers failed:', err));
    },
    30 * 60 * 1000
  );
  staleVolunteerInterval.unref();

  // db.cases has no other size cap (unlike db.reports) and every case
  // carries a full base64 image, so this is what actually keeps db.json
  // from growing forever. Only removes cases that are both resolved and
  // past the retention window - an open/responding case is never touched
  // regardless of age. Runs once daily since a 30-day retention window
  // doesn't need 30-minute granularity.
  const resolvedCaseInterval = setInterval(
    () => {
      purgeOldResolvedCases().catch((err) => console.error('purgeOldResolvedCases failed:', err));
    },
    24 * 60 * 60 * 1000
  );
  resolvedCaseInterval.unref();

  process.on('SIGTERM', () => {
    console.log('Server shutting down...');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('Server shutting down...');
    process.exit(0);
  });
}

module.exports = app;
