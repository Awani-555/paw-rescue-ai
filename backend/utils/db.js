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

// readDB() and writeDB() are each individually synchronous, but a
// read-mutate-write sequence with an `await` in between (e.g. bcrypt
// hashing during registration) is not atomic: a second request can read
// the same pre-mutation snapshot before the first request writes, and
// whichever write happens last silently discards the other's change.
// This queue serializes every read-mutate-write cycle in the app through
// a single promise chain so they can never interleave, without needing a
// real database transaction.
let writeQueue = Promise.resolve();

function withDB(mutator) {
  const result = writeQueue.then(async () => {
    const db = readDB();
    const returnValue = await mutator(db);
    writeDB(db);
    return returnValue;
  });

  // Keep the queue moving even if this mutation throws, so one failed
  // request doesn't permanently stall every later request.
  writeQueue = result.then(
    () => {},
    () => {}
  );

  return result;
}

module.exports = { DB_PATH, initializeDB, readDB, writeDB, withDB };
