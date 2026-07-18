const fs = require('fs');
const path = require('path');
const { pool, PG_SCHEMA } = require('../utils/pgPool');

// Runs every .sql file in this directory, in filename order, against
// whichever schema the pool's PG_SCHEMA points at. Safe to call every
// time the app boots (each file uses IF NOT EXISTS) and is what the test
// suite calls to stand up its isolated schema fresh in CI, where nothing
// has ever run the migration by hand.
async function applyMigrations() {
  if (PG_SCHEMA !== 'public') {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${PG_SCHEMA}"`);
  }

  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    // eslint-disable-next-line no-await-in-loop -- migrations must apply in filename order, not concurrently
    await pool.query(sql);
  }
}

module.exports = { applyMigrations };
