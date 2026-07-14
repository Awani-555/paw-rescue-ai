require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const { initializeDB, readDB, writeDB, DB_PATH } = require('./utils/db');
const { calculateDistance, loadFacilities } = require('./utils/distance');
const { success, error } = require('./utils/respond');
const { sanitizeBody, isValidCoordinate } = require('./middleware/sanitize');
const requestLogger = require('./middleware/requestLogger');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');
const caseRoutes = require('./routes/caseRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

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

// POST /api/report - Accept image + notes + location, forward to AI, save result + create a case
app.post('/api/report', async (req, res) => {
  try {
    const { image, notes, location, lat, lng } = req.body || {};

    if (!image) {
      return error(res, 400, 'VALIDATION_ERROR', 'Image is required');
    }
    if (typeof image !== 'string') {
      return error(res, 400, 'VALIDATION_ERROR', 'Invalid image format');
    }
    if (image.length > 15 * 1024 * 1024) {
      return error(res, 400, 'VALIDATION_ERROR', 'Image too large (max 10MB)');
    }

    const userLat = isValidCoordinate(Number(lat), Number(lng)) ? Number(lat) : 26.8467;
    const userLng = isValidCoordinate(Number(lat), Number(lng)) ? Number(lng) : 80.9462;

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
        { timeout: 15000 }
      );
      aiResult = aiResponse.data;
    } catch (aiErr) {
      aiResult = {
        species: 'Unknown',
        severity: 'Mild',
        injuries: ['Unable to analyze - AI service unavailable'],
        confidence: 0.5,
        first_aid: ['Please consult a veterinarian for professional assessment'],
      };
    }

    aiResult.nearestFacilities = nearestFacilities;

    const reportId = `report_${Date.now()}`;
    const timestamp = new Date().toISOString();

    const report = {
      id: reportId,
      timestamp,
      location: location || 'Location not specified',
      notes: notes || 'No notes provided',
      image: `data:image/jpeg;base64,${image}`,
      lat: userLat,
      lng: userLng,
      result: aiResult,
    };

    const db = readDB();
    db.reports.unshift(report);
    if (db.reports.length > 100) {
      db.reports = db.reports.slice(0, 100);
    }

    // Every report also creates a live case for responders
    db.cases.unshift({
      id: `case_${reportId}`,
      reportId,
      species: aiResult.species,
      severity: (aiResult.severity || 'mild').toLowerCase(),
      image: report.image,
      location: report.location,
      notes: report.notes,
      lat: userLat,
      lng: userLng,
      timestamp,
      status: 'open',
      respondedBy: null,
    });

    writeDB(db);

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

// Responder auth (public) and case management (JWT-protected)
app.use('/api/auth', authRoutes);
app.use('/api/cases', requireAuth, caseRoutes);

// Health check
app.get('/health', (req, res) => {
  success(res, { status: 'ok', service: 'paw-rescue-backend' });
});

// Global error handler — keeps every response (including body-parser
// failures like oversized payloads) in the standard { success, error } shape.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return error(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large.');
  }
  console.error('Unhandled error:', err);
  return error(res, 500, 'INTERNAL_ERROR', 'Our servers had an issue. Please try again.');
});

// Only boot an HTTP listener when run directly (`node server.js`).
// When required by tests (e.g. supertest), the app is exported unstarted.
if (require.main === module) {
  initializeDB();
  app.listen(PORT, () => {
    console.log(`\n Backend running on http://localhost:${PORT}`);
    console.log(` Database location: ${DB_PATH}`);
    console.log(` CORS enabled for frontend`);
    console.log(` AI Service: ${AI_SERVICE_URL}`);
    console.log('────────────────────────────────\n');
  });

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
