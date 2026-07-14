const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'db.json');
const EMPTY_DB = { reports: [], responders: [], cases: [] };

function initializeDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
    console.log('Database initialized at', DB_PATH);
    return;
  }

  // Migrate older db.json shapes (e.g. { reports: [] } only) to include
  // the responders/cases collections without touching existing data.
  const db = readDB();
  let migrated = false;
  for (const key of Object.keys(EMPTY_DB)) {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      migrated = true;
    }
  }
  if (migrated) {
    writeDB(db);
    console.log('Database migrated to include responders/cases collections');
  }
}

function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return { ...EMPTY_DB, ...JSON.parse(data) };
  } catch (err) {
    console.error('Error reading DB:', err);
    return { ...EMPTY_DB };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

module.exports = { DB_PATH, initializeDB, readDB, writeDB };
