const { Pool } = require('pg');

// PG_SCHEMA lets the test suite point at an isolated schema
// ('test_paw_rescue') inside the same Supabase project/DATABASE_URL,
// rather than writing test data into the real production tables. Defaults
// to 'public' - the schema Supabase creates by default - for local dev and
// production.
const PG_SCHEMA = process.env.PG_SCHEMA || 'public';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required. Set it in backend/.env to your Supabase ' +
      'connection string (Project Settings -> Database -> Connection string -> Node.js).'
  );
}

// Supabase's generated connection strings include ?sslmode=require in the
// URL itself. Recent pg-connection-string versions treat that as an alias
// for verify-full (full certificate *chain* + hostname verification, not
// just "use TLS"), which then fails against Supabase's certificate chain
// with SELF_SIGNED_CERT_IN_CHAIN - and an embedded sslmode takes priority
// over the explicit `ssl` option below unless it's removed from the URL
// first. Supabase's own CA certificate lives behind a dashboard login and
// isn't available to pin here, so this accepts the chain without
// verifying it instead (the connection itself is still encrypted, just
// not certificate-pinned) - swap for `ssl: { ca: fs.readFileSync(...) }`
// if tighter verification is ever needed.
const connectionUrl = new URL(process.env.DATABASE_URL);
connectionUrl.searchParams.delete('sslmode');

const pool = new Pool({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: false },
  options: `-c search_path=${PG_SCHEMA}`,
});

module.exports = { pool, PG_SCHEMA };
