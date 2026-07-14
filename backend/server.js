require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // distance in km
};

// Load facilities
const loadFacilities = () => {
  try {
    const facilitiesPath = path.join(__dirname, 'facilities.json');
    const data = fs.readFileSync(facilitiesPath, 'utf8');
    return JSON.parse(data).facilities;
  } catch (err) {
    console.error('Error loading facilities:', err);
    return [];
  }
};

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, 'db.json');
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: false,
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Initialize DB file if it doesn't exist
const initializeDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    const initialDB = { reports: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
    console.log(' Database initialized at', DB_PATH);
  }
};

// Read database
const readDB = () => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB:', err);
    return { reports: [] };
  }
};

// Write database
const writeDB = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing DB:', err);
  }
};

// POST /api/report - Accept image + notes + location, forward to AI, save result
app.post('/api/report', async (req, res) => {
  try {
    const { image, notes, location, lat, lng } = req.body;

    console.log(' Received report request');
    console.log(' Location:', { lat, lng });

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    if (typeof image !== 'string') {
      return res.status(400).json({ error: 'Invalid image format' });
    }
    if (image.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 10MB)' });
    }

    // Calculate nearest facilities FIRST
    const userLat = lat || 26.8467; // Default to Lucknow center
    const userLng = lng || 80.9462;
    
    const facilities = loadFacilities();
    const facilitiesWithDistance = facilities.map(f => ({
      ...f,
      distance: calculateDistance(userLat, userLng, f.lat, f.lng)
    }));
    
    // Sort by distance and get top 3
    const nearestFacilities = facilitiesWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    console.log(' Found', nearestFacilities.length, 'nearby facilities');

    // Forward image to AI service
    let aiResult = null;
    try {
      console.log(' Calling AI service...');
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/analyze`, {
        image: image,
      }, {
        timeout: 15000,
      });
      aiResult = aiResponse.data;
      console.log(' AI analysis complete:', aiResult);
    } catch (aiErr) {
      console.error(' AI service error:', aiErr.message);
      // Provide fallback result if AI service fails
      aiResult = {
        species: 'Unknown',
        severity: 'Mild',
        injuries: ['Unable to analyze - AI service unavailable'],
        confidence: 0.5,
        first_aid: ['Please consult a veterinarian for professional assessment'],
      };
    }

    // Add nearest facilities to AI result
    aiResult.nearestFacilities = nearestFacilities;

    // Generate report ID
    const reportId = `report_${Date.now()}`;

    // Create report object
    const report = {
      id: reportId,
      timestamp: new Date().toISOString(),
      location: location || 'Location not specified',
      notes: notes || 'No notes provided',
      image: `data:image/jpeg;base64,${image}`, // Add data URL prefix
      lat: userLat,
      lng: userLng,
      result: aiResult,
    };

    // Save to DB
    const db = readDB();
    db.reports.unshift(report); // Add to beginning
    if (db.reports.length > 100) {
      db.reports = db.reports.slice(0, 100); // Keep only last 100
    }
    writeDB(db);

    console.log(' Report saved:', reportId);
    console.log('────────────────────────────────');

    res.status(201).json(report);
  } catch (err) {
    console.error(' Error in /api/report:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports - Return all saved reports
app.get('/api/reports', (req, res) => {
  try {
    const db = readDB();
    res.json(db);
  } catch (err) {
    console.error('Error in /api/reports:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'paw-rescue-backend' });
});

// Start server
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