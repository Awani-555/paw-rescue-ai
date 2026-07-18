const crypto = require('crypto');
const { pool } = require('./pgPool');
const { decrypt } = require('./encryption');

const TOKEN_TTL_MS = 5 * 60 * 1000; // long enough to tap through, short enough to not linger

// References the helper by id rather than storing a decrypted phone number
// in the token row: the phone is only ever decrypted in application memory
// at the moment consumeCallToken() redeems the token, same guarantee the
// in-memory version made, now also true of what's briefly at rest here.
async function issueCallToken(helperId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await pool.query(
    `INSERT INTO call_tokens (token, helper_id, expires_at, used)
     VALUES ($1, $2, now() + ($3::text)::interval, false)`,
    [token, helperId, `${TOKEN_TTL_MS} milliseconds`]
  );
  return token;
}

// Single-use: deletes the row on the first successful lookup, so a second
// attempt with the same token - a retry, a shared/logged link, someone
// re-visiting browser history - gets nothing. The expiry check happens
// entirely in SQL (expires_at > now()) rather than fetching the timestamp
// and comparing it against JS's Date.now(): expires_at was set relative to
// the database's own now() at issue time, and comparing it against a
// different clock (this process's) would make the check depend on clock
// skew between the two.
async function consumeCallToken(token) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT ph.phone_encrypted
       FROM call_tokens ct
       JOIN public_helpers ph ON ph.id = ct.helper_id
       WHERE ct.token = $1 AND ct.expires_at > now()
       FOR UPDATE OF ct`,
      [token]
    );

    await client.query('DELETE FROM call_tokens WHERE token = $1', [token]);
    await client.query('COMMIT');

    if (rows.length === 0) return null;
    return decrypt(rows[0].phone_encrypted);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Best-effort cleanup for tokens that were issued but never redeemed -
// consumeCallToken() already deletes on use, this only catches the ones
// that expired unused. Called on the same schedule as the other retention
// sweeps (see server.js).
async function purgeExpiredCallTokens() {
  const { rowCount } = await pool.query('DELETE FROM call_tokens WHERE expires_at < now()');
  return rowCount;
}

module.exports = { issueCallToken, consumeCallToken, purgeExpiredCallTokens, TOKEN_TTL_MS };
