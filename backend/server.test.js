const path = require('path');

// Points every query in this run at an isolated schema inside the *same*
// Supabase project/DATABASE_URL, rather than the real 'public' schema -
// see utils/pgPool.js. Loaded from backend/.env (never hardcoded, never
// logged - DATABASE_URL is a live credential) before anything that reads
// it is required.
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.PG_SCHEMA = 'test_paw_rescue';

process.env.JWT_SECRET = 'test-secret';
process.env.AI_SERVICE_URL = 'http://localhost:9999'; // deliberately unreachable -> exercises fallback path
process.env.AI_SERVICE_TOKEN = 'test-ai-service-token';
process.env.VAPID_PUBLIC_KEY =
  'BAe7NnYq3lxpwl2kElKT_1RVRAGaEwyCm0tkfc5pVuajbnsHAZi4x8SmOvtifc9OfkbKOcJlCuzxEBJQ-eMMpeQ';
process.env.VAPID_PRIVATE_KEY = 'UMt3bPUPRH-psqMtS8CJ515m6cV8A00bXuDyuDkUmJU';
process.env.ALERT_RADIUS_METERS = '5000'; // generous radius so fixed test coordinates reliably match
// Fixed test key so this doesn't silently depend on the real (gitignored)
// .env file being present, which it won't be in a fresh CI checkout.
process.env.HELPER_DATA_ENCRYPTION_KEY = '0'.repeat(63) + '1'; // 64 hex chars = 32 bytes

// Auto-mocked: setVapidDetails/sendNotification become jest.fn()s that
// resolve to undefined, so no real push service is ever contacted.
jest.mock('web-push');
const webpush = require('web-push');

const request = require('supertest');
const { pool } = require('./utils/pgPool');
const { applyMigrations } = require('./migrations/apply');
const app = require('./server');

// Minimal valid 1x1 JPEG, base64-encoded (no data URL prefix).
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

// Runs the full app against a real, isolated Postgres schema - not a mock
// or an in-memory store. Applies migrations to test_paw_rescue (creating
// it fresh if this is the first run in this environment) and truncates
// every table first, so a previous run's data (or a previous run crashing
// mid-suite) can never leak into this one - e.g. a stale 'responder1@
// example.com' row would otherwise turn the registration test's 201 into
// a 409 on the second run.
beforeAll(async () => {
  await applyMigrations();
  await pool.query('TRUNCATE cases, responders, volunteer_locations, call_tokens CASCADE');
});

afterAll(async () => {
  await pool.end();
});

// alertNearbyVolunteers() is fire-and-forget from the request handler, and
// now involves a real network round-trip to Postgres (getTrackedVolunteers)
// before it can even call webpush.sendNotification - unlike the old flat-
// file version, where everything before that call was synchronous, so a
// single setImmediate tick is no longer reliably enough time for it to
// finish. Polls until the mock has actually been called instead of
// guessing a fixed delay, so this passes as fast as the real round-trip
// allows and only takes the full timeout if something is actually broken.
async function waitForPushCall(timeoutMs = 3000) {
  const start = Date.now();
  while (webpush.sendNotification.mock.calls.length === 0) {
    if (Date.now() - start > timeoutMs) return;
    // eslint-disable-next-line no-await-in-loop -- polling by nature
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// For asserting a push was *not* sent there's no event to poll for, so
// this waits a fixed margin generous enough for that same async round-trip
// to have completed either way.
function waitForNoPushCall() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ status: 'ok', service: 'paw-rescue-backend' });
  });
});

describe('POST /api/report', () => {
  it('returns 201 with a saved report for valid data', async () => {
    const res = await request(app)
      .post('/api/report')
      .send({ image: TINY_JPEG_BASE64, notes: 'test note', location: 'Test St', lat: 26.85, lng: 80.95 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('result');
  });

  it('returns 400 with the standard error shape when image is missing', async () => {
    const res = await request(app).post('/api/report').send({ notes: 'no image here' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Image is required' },
    });
  });

  it('returns 400 when the image payload is oversized', async () => {
    const hugeImage = 'a'.repeat(16 * 1024 * 1024);
    const res = await request(app).post('/api/report').send({ image: hugeImage });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/reports', () => {
  it('returns an array of reports', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.reports)).toBe(true);
  });
});

describe('POST /api/auth/register', () => {
  it('registers a new responder and returns a token without the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test Responder',
      email: 'responder1@example.com',
      password: 'testpass123',
      organization: 'Test NGO',
      phone: '9999999999',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.responder).toMatchObject({ email: 'responder1@example.com', name: 'Test Responder' });
    expect(res.body.data.responder).not.toHaveProperty('passwordHash');
  });

  it('returns 400 with the standard error shape when a required field is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@example.com', password: 'testpass123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when the password is shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Short Pw',
      email: 'shortpw@example.com',
      password: 'short',
      organization: 'Org',
      phone: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when the email is already registered', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Duplicate',
      email: 'responder1@example.com',
      password: 'testpass123',
      organization: 'Org',
      phone: '123',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'responder1@example.com', password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
  });

  it('returns 401 for a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'responder1@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'testpass123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('/api/cases (JWT protected)', () => {
  let token;
  let caseId;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'responder1@example.com', password: 'testpass123' });
    token = loginRes.body.data.token;

    const reportRes = await request(app)
      .post('/api/report')
      .send({ image: TINY_JPEG_BASE64, notes: 'case test', location: 'Case St', lat: 26.85, lng: 80.95 });
    caseId = `case_${reportRes.body.data.id}`;
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/cases');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests with an invalid token', async () => {
    const res = await request(app).get('/api/cases').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the active cases list for an authenticated responder', async () => {
    const res = await request(app).get('/api/cases').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.cases)).toBe(true);
    expect(res.body.data.cases.some((c) => c.id === caseId)).toBe(true);
  });

  it('marks a case as responding', async () => {
    const res = await request(app).post(`/api/cases/${caseId}/respond`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.case.status).toBe('responding');
    expect(res.body.data.case.respondedBy).toBe('responder1@example.com');
  });

  it('returns 404 when responding to a case that does not exist', async () => {
    const res = await request(app)
      .post('/api/cases/case_does_not_exist/respond')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CASE_NOT_FOUND');
  });

  it('marks a case as resolved and removes it from the active cases list', async () => {
    const resolveRes = await request(app).post(`/api/cases/${caseId}/resolve`).set('Authorization', `Bearer ${token}`);
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.case.status).toBe('resolved');

    const listRes = await request(app).get('/api/cases').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data.cases.some((c) => c.id === caseId)).toBe(false);
  });
});

describe('POST /api/volunteers/registered-location and nearby alerting', () => {
  let token;

  const fakeSubscription = {
    endpoint: 'https://push.example.com/subscription-id',
    keys: { p256dh: 'fake-p256dh-key', auth: 'fake-auth-key' },
  };

  beforeAll(async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Volunteer One',
      email: 'volunteer1@example.com',
      password: 'testpass123',
      organization: 'Test NGO',
      phone: '9999999999',
    });
    token = registerRes.body.data.token;
  });

  beforeEach(() => {
    webpush.sendNotification.mockClear();
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).post('/api/volunteers/registered-location').send({ lat: 26.85, lng: 80.95 });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid coordinate', async () => {
    const res = await request(app)
      .post('/api/volunteers/registered-location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 999, lng: 80.95, trackingEnabled: false });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when enabling tracking without a push subscription', async () => {
    const res = await request(app)
      .post('/api/volunteers/registered-location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 26.85, lng: 80.95, trackingEnabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a valid location update with tracking enabled', async () => {
    const res = await request(app)
      .post('/api/volunteers/registered-location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 26.85, lng: 80.95, trackingEnabled: true, pushSubscription: fakeSubscription });
    expect(res.status).toBe(200);
    expect(res.body.data.trackingEnabled).toBe(true);
  });

  it('sends a full-detail push notification to a nearby registered volunteer when a new report is submitted', async () => {
    const res = await request(app).post('/api/report').send({
      image: TINY_JPEG_BASE64,
      notes: 'alert test',
      location: 'Near volunteer',
      lat: 26.85,
      lng: 80.95,
      locationSource: 'gps',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.nearbyAlertsSkipped).toBe(false);

    // alertNearbyVolunteers is fire-and-forget from the request handler,
    // so give its promise chain a tick to actually run before asserting.
    await waitForPushCall();

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [subscriptionArg, payloadArg] = webpush.sendNotification.mock.calls[0];
    expect(subscriptionArg).toEqual(fakeSubscription);

    const payload = JSON.parse(payloadArg);
    expect(payload.detail).toBe('full');
    expect(payload.caseId).toMatch(/^case_/);
    expect(payload).toHaveProperty('species');
    expect(payload).toHaveProperty('severity');
  });

  it('does not alert a volunteer who has tracking disabled', async () => {
    await request(app)
      .post('/api/volunteers/registered-location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 26.85, lng: 80.95, trackingEnabled: false });

    webpush.sendNotification.mockClear();

    await request(app).post('/api/report').send({
      image: TINY_JPEG_BASE64,
      notes: 'no alert test',
      location: 'Near volunteer',
      lat: 26.85,
      lng: 80.95,
      locationSource: 'gps',
    });

    await waitForNoPushCall();

    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('skips nearby-volunteer alerting entirely when the report has no real GPS fix, even if the fallback coordinates happen to match a tracked volunteer', async () => {
    // The previous test left this volunteer's tracking disabled; re-enable
    // it so this test genuinely isolates the GPS-gating behavior rather
    // than accidentally passing because tracking was already off.
    await request(app)
      .post('/api/volunteers/registered-location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 26.85, lng: 80.95, trackingEnabled: true, pushSubscription: fakeSubscription });

    webpush.sendNotification.mockClear();

    const res = await request(app).post('/api/report').send({
      image: TINY_JPEG_BASE64,
      notes: 'no gps test',
      location: 'Typed in manually, GPS denied',
      lat: 26.85,
      lng: 80.95,
      // locationSource omitted/not 'gps': this must never be treated as a
      // real fix, even though 26.85/80.95 is right next to the volunteer
      // registered earlier in this describe block.
    });
    expect(res.status).toBe(201);
    expect(res.body.data.nearbyAlertsSkipped).toBe(true);
    expect(res.body.data.hasGpsLocation).toBe(false);

    await waitForNoPushCall();

    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("Tier 1: anonymous public volunteers and I'll Help", () => {
  const publicFakeSubscription = {
    endpoint: 'https://push.example.com/public-subscription-id',
    keys: { p256dh: 'fake-p256dh-public', auth: 'fake-auth-public' },
  };

  let responderToken;
  let openCaseId;

  beforeAll(async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Tier1 Test Responder',
      email: 'tier1-responder@example.com',
      password: 'testpass123',
      organization: 'Test NGO',
      phone: '9999999999',
    });
    responderToken = registerRes.body.data.token;

    const reportRes = await request(app)
      .post('/api/report')
      .send({ image: TINY_JPEG_BASE64, notes: 'tier1 test', location: 'Tier1 St', lat: 26.86, lng: 80.96 });
    openCaseId = `case_${reportRes.body.data.id}`;
  });

  describe('POST /api/volunteers/public-location', () => {
    it('rejects a missing or too-short deviceId', async () => {
      const res = await request(app)
        .post('/api/volunteers/public-location')
        .send({ deviceId: 'short', lat: 26.86, lng: 80.96, trackingEnabled: false });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an invalid coordinate', async () => {
      const res = await request(app)
        .post('/api/volunteers/public-location')
        .send({ deviceId: 'device-abc-123456', lat: 999, lng: 80.96, trackingEnabled: false });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects enabling tracking without a push subscription', async () => {
      const res = await request(app)
        .post('/api/volunteers/public-location')
        .send({ deviceId: 'device-abc-123456', lat: 26.86, lng: 80.96, trackingEnabled: true });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts a valid opt-in with tracking enabled, forcing role to public regardless of input', async () => {
      const res = await request(app).post('/api/volunteers/public-location').send({
        deviceId: 'device-abc-123456',
        lat: 26.86,
        lng: 80.96,
        trackingEnabled: true,
        pushSubscription: publicFakeSubscription,
        role: 'registered', // must be ignored: role is never client-controlled
      });
      expect(res.status).toBe(200);
      expect(res.body.data.trackingEnabled).toBe(true);
    });
  });

  describe('GET /api/cases/:id/public-summary', () => {
    it('returns 404 for an unknown case', async () => {
      const res = await request(app).get('/api/cases/case_does_not_exist/public-summary');
      expect(res.status).toBe(404);
    });

    it('returns only id/status/timestamp, never species, severity, coordinates, or images', async () => {
      const res = await request(app).get(`/api/cases/${openCaseId}/public-summary`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(['id', 'status', 'timestamp']);
      expect(res.body.data.status).toBe('open');
    });
  });

  describe('POST /api/cases/:id/help', () => {
    it('rejects submission without consent', async () => {
      const res = await request(app)
        .post(`/api/cases/${openCaseId}/help`)
        .send({ name: 'Jamie Helper', phone: '5551234567', consent: false });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects submission with a missing name', async () => {
      const res = await request(app).post(`/api/cases/${openCaseId}/help`).send({ phone: '5551234567', consent: true });
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown case', async () => {
      const res = await request(app)
        .post('/api/cases/case_does_not_exist/help')
        .send({ name: 'Jamie Helper', phone: '5551234567', consent: true });
      expect(res.status).toBe(404);
    });

    it('accepts a valid submission, stores name/phone encrypted at rest, and exposes only the decrypted name to the reporter', async () => {
      const res = await request(app)
        .post(`/api/cases/${openCaseId}/help`)
        .send({ name: 'Jamie Helper', phone: '5551234567', consent: true });
      expect(res.status).toBe(201);

      // Encrypted at rest: the raw case record (as a responder would see
      // it via the authenticated case feed, which never decrypts) must
      // not contain the plaintext name or phone anywhere.
      const casesRes = await request(app).get('/api/cases').set('Authorization', `Bearer ${responderToken}`);
      const rawCase = casesRes.body.data.cases.find((c) => c.id === openCaseId);
      expect(rawCase.publicHelpers).toHaveLength(1);
      const rawHelper = rawCase.publicHelpers[0];
      expect(rawHelper.name).not.toBe('Jamie Helper');
      expect(rawHelper.phone).not.toBe('5551234567');
      expect(rawHelper.name).not.toContain('Jamie');
      // Checking a short substring like '555' against high-entropy hex
      // ciphertext is a coin flip (plenty of random hex strings happen to
      // contain any given 3-digit run) - the full number is what actually
      // must never appear.
      expect(rawHelper.phone).not.toContain('5551234567');
      // encrypt() output shape: iv:authTag:ciphertext, all hex
      expect(rawHelper.name).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(rawHelper.phone).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(rawHelper).toHaveProperty('id');
      expect(rawHelper).toHaveProperty('respondedAt');

      // Decrypted round-trip, but only the name, and only through the
      // dedicated reporter-facing endpoint. Phone is never in this body.
      const helpersRes = await request(app).get(`/api/cases/${openCaseId}/helpers`);
      expect(helpersRes.status).toBe(200);
      expect(helpersRes.body.data.helpers).toHaveLength(1);
      const publicHelper = helpersRes.body.data.helpers[0];
      expect(publicHelper.name).toBe('Jamie Helper');
      expect(publicHelper).not.toHaveProperty('phone');
      expect(publicHelper).toHaveProperty('id', rawHelper.id);
    });

    it('returns 409 when the case is already resolved, and resolving purges existing helper contact info', async () => {
      await request(app).post(`/api/cases/${openCaseId}/respond`).set('Authorization', `Bearer ${responderToken}`);
      const resolveRes = await request(app)
        .post(`/api/cases/${openCaseId}/resolve`)
        .set('Authorization', `Bearer ${responderToken}`);
      expect(resolveRes.body.data.case.publicHelpers).toEqual([]);

      const helpRes = await request(app)
        .post(`/api/cases/${openCaseId}/help`)
        .send({ name: 'Late Helper', phone: '5559999999', consent: true });
      expect(helpRes.status).toBe(409);
      expect(helpRes.body.error.code).toBe('CASE_RESOLVED');
    });
  });

  describe('nearby alerting for Tier 1 public volunteers', () => {
    it('sends a soft, vague push payload with no species/severity/coordinates', async () => {
      await request(app)
        .post('/api/volunteers/public-location')
        .send({
          deviceId: 'device-nearby-999999',
          lat: 26.8467,
          lng: 80.9462,
          trackingEnabled: true,
          pushSubscription: {
            endpoint: 'https://push.example.com/nearby-public-sub',
            keys: { p256dh: 'k1', auth: 'k2' },
          },
        });

      webpush.sendNotification.mockClear();

      const reportRes = await request(app).post('/api/report').send({
        image: TINY_JPEG_BASE64,
        notes: 'soft alert test',
        location: 'Near public volunteer',
        lat: 26.8467,
        lng: 80.9462,
        locationSource: 'gps',
      });
      expect(reportRes.status).toBe(201);

      await waitForPushCall();

      expect(webpush.sendNotification).toHaveBeenCalled();
      const softCall = webpush.sendNotification.mock.calls.find((call) => {
        const payload = JSON.parse(call[1]);
        return payload.detail === 'soft';
      });
      expect(softCall).toBeDefined();

      const payload = JSON.parse(softCall[1]);
      expect(payload).not.toHaveProperty('species');
      expect(payload).not.toHaveProperty('severity');
      expect(payload).not.toHaveProperty('lat');
      expect(payload).not.toHaveProperty('lng');
      expect(payload.title).toBe('An animal nearby may need help');
    });
  });
});

describe('Call-token redirect (phone number never sent to the frontend)', () => {
  let helpCaseId;
  let helperId;

  beforeAll(async () => {
    const reportRes = await request(app)
      .post('/api/report')
      .send({ image: TINY_JPEG_BASE64, notes: 'call token test', location: 'Token St', lat: 26.87, lng: 80.97 });
    helpCaseId = `case_${reportRes.body.data.id}`;

    await request(app)
      .post(`/api/cases/${helpCaseId}/help`)
      .send({ name: 'Token Helper', phone: '5557778888', consent: true });

    const helpersRes = await request(app).get(`/api/cases/${helpCaseId}/helpers`);
    helperId = helpersRes.body.data.helpers[0].id;
  });

  it('never includes the phone number in the helpers list response', async () => {
    const res = await request(app).get(`/api/cases/${helpCaseId}/helpers`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('5557778888');
  });

  it('returns 404 for a call-token request against an unknown helper', async () => {
    const res = await request(app).get(`/api/cases/${helpCaseId}/helpers/not-a-real-helper-id/call-token`);
    expect(res.status).toBe(404);
  });

  it('issues a token, and does not include the phone number in that response either', async () => {
    const res = await request(app).get(`/api/cases/${helpCaseId}/helpers/${helperId}/call-token`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(JSON.stringify(res.body)).not.toContain('5557778888');
  });

  it('redeems a valid token with a 302 redirect straight to tel:, then rejects reuse of the same token', async () => {
    const tokenRes = await request(app).get(`/api/cases/${helpCaseId}/helpers/${helperId}/call-token`);
    const { token } = tokenRes.body.data;

    const firstUse = await request(app).get(`/api/call/${token}`).redirects(0);
    expect(firstUse.status).toBe(302);
    expect(firstUse.headers.location).toBe('tel:5557778888');

    const secondUse = await request(app).get(`/api/call/${token}`).redirects(0);
    expect(secondUse.status).toBe(410);
    expect(secondUse.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 410 for a token that was never issued', async () => {
    const res = await request(app).get('/api/call/not-a-real-token').redirects(0);
    expect(res.status).toBe(410);
  });

  it('expires a token after its TTL even if never redeemed', async () => {
    const { issueCallToken, consumeCallToken } = require('./utils/callTokens');

    const token = await issueCallToken(helperId);
    // Expiry is computed by the database's own now() at insert time (see
    // utils/callTokens.js), not JS's Date.now() - fake timers can't affect
    // Postgres's clock, so this backdates the row directly instead of
    // waiting out the real 5-minute TTL.
    await pool.query("UPDATE call_tokens SET expires_at = now() - interval '1 second' WHERE token = $1", [token]);

    expect(await consumeCallToken(token)).toBeNull();
  });
});

describe('purgeOldResolvedCases (bounds the cases table, which has no other size cap)', () => {
  const { createCase, resolveCase } = require('./utils/db');
  const { purgeOldResolvedCases, RESOLVED_CASE_RETENTION_MS } = require('./utils/purgeOldResolvedCases');

  it('removes a resolved case past the retention window, keeps a recently-resolved one, and never removes an open case regardless of age', async () => {
    const longAgo = new Date(Date.now() - RESOLVED_CASE_RETENTION_MS - 60 * 60 * 1000).toISOString();

    await createCase({ id: 'case_old_resolved', reportId: 'report_old_resolved', severity: 'mild', timestamp: longAgo });
    await createCase({
      id: 'case_recent_resolved',
      reportId: 'report_recent_resolved',
      severity: 'mild',
      timestamp: new Date().toISOString(),
    });
    await createCase({ id: 'case_old_but_open', reportId: 'report_old_but_open', severity: 'mild', timestamp: longAgo });

    await resolveCase('case_old_resolved', 'tester@example.com');
    await resolveCase('case_recent_resolved', 'tester@example.com');
    // case_old_but_open is deliberately never resolved.

    // resolveCase() always stamps resolved_at as now(); backdating it
    // directly is how this simulates a case that was resolved long ago
    // without waiting out the real 30-day retention window.
    await pool.query('UPDATE cases SET resolved_at = $1 WHERE id = $2', [longAgo, 'case_old_resolved']);

    const { purgedCount } = await purgeOldResolvedCases();
    expect(purgedCount).toBe(1);

    const { rows } = await pool.query('SELECT id FROM cases WHERE id = ANY($1::text[])', [
      ['case_old_resolved', 'case_recent_resolved', 'case_old_but_open'],
    ]);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('case_old_resolved');
    expect(ids).toContain('case_recent_resolved');
    expect(ids).toContain('case_old_but_open');
  });
});

describe('DELETE /api/volunteers/public-location/:deviceId (Tier 1 opt-out)', () => {
  const deviceId = 'device-optout-test-000001';
  const subscription = {
    endpoint: 'https://push.example.com/optout-sub',
    keys: { p256dh: 'k1', auth: 'k2' },
  };

  it('returns removed: false for a device that was never registered', async () => {
    const res = await request(app).delete('/api/volunteers/public-location/never-registered-device');
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(false);
  });

  it('removes a previously opted-in device, stopping further alerts to it', async () => {
    await request(app)
      .post('/api/volunteers/public-location')
      .send({ deviceId, lat: 26.85, lng: 80.95, trackingEnabled: true, pushSubscription: subscription });

    const deleteRes = await request(app).delete(`/api/volunteers/public-location/${deviceId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.removed).toBe(true);

    webpush.sendNotification.mockClear();

    await request(app).post('/api/report').send({
      image: TINY_JPEG_BASE64,
      notes: 'post opt-out test',
      location: 'Opt-out St',
      lat: 26.85,
      lng: 80.95,
      locationSource: 'gps',
    });

    await waitForNoPushCall();

    const wasCalledForOptedOutDevice = webpush.sendNotification.mock.calls.some(
      (call) => call[0].endpoint === subscription.endpoint
    );
    expect(wasCalledForOptedOutDevice).toBe(false);
  });
});

describe('rate limiting', () => {
  it('blocks requests to /api/ after the limit is exceeded', async () => {
    let lastStatus = 200;
    for (let i = 0; i < 101; i++) {
      // Sequential on purpose: needs to count toward the rate limit in order.
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/reports');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  }, 30000);
});

describe('malformed request bodies', () => {
  it('returns 400 VALIDATION_ERROR (not 500) for a body that is not valid JSON', async () => {
    const res = await request(app)
      .post('/api/report')
      .set('Content-Type', 'application/json')
      .send('{this is not json');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
