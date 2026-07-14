const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'db.test.json');
process.env.DB_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret';
process.env.AI_SERVICE_URL = 'http://localhost:9999'; // deliberately unreachable -> exercises fallback path

const request = require('supertest');
const app = require('./server');

// Minimal valid 1x1 JPEG, base64-encoded (no data URL prefix).
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

afterAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

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

describe('rate limiting', () => {
  it('blocks requests to /api/ after the limit is exceeded', async () => {
    let lastStatus = 200;
    for (let i = 0; i < 101; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/reports');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  }, 30000);
});
