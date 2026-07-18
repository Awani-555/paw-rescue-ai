const fs = require('fs');
const path = require('path');

// Separate flat-file store from db.json: volunteer location/subscription
// data churns far more often (updated on every location ping) and has a
// different lifecycle (pruned on expiry) than reports/cases/responders,
// so it gets its own file and its own write queue rather than sharing
// db.json's.
const STORE_PATH = process.env.VOLUNTEER_STORE_PATH || path.join(__dirname, '..', 'volunteer-locations.json');
const EMPTY_STORE = { volunteers: [] };

function initializeStore() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2));
    console.log('Volunteer location store initialized at', STORE_PATH);
  }
}

function readStore() {
  try {
    const data = fs.readFileSync(STORE_PATH, 'utf8');
    return { ...EMPTY_STORE, ...JSON.parse(data) };
  } catch (err) {
    console.error('Error reading volunteer store:', err);
    return { ...EMPTY_STORE };
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing volunteer store:', err);
  }
}

// Same read-mutate-write serialization pattern as utils/db.js, kept as its
// own independent queue since it guards a different file.
let writeQueue = Promise.resolve();

function withStore(mutator) {
  const result = writeQueue.then(async () => {
    const store = readStore();
    const returnValue = await mutator(store);
    writeStore(store);
    return returnValue;
  });

  writeQueue = result.then(
    () => {},
    () => {}
  );

  return result;
}

module.exports = { STORE_PATH, initializeStore, readStore, writeStore, withStore };
