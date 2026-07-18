const crypto = require('crypto');

const TOKEN_TTL_MS = 5 * 60 * 1000; // long enough to tap through, short enough to not linger

// In-memory by design: a call token is meant to live for a few minutes at
// most and be used at most once, so there's no reason to persist it to
// disk (a server restart invalidating outstanding tokens is fine, and
// arguably desirable). Never put a phone number in a JSON response body;
// this is the one place the decrypted value exists at all, and only for
// as long as it takes the browser to follow the redirect it's used for.
const tokens = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt < now) tokens.delete(token);
  }
}

function issueCallToken(phone) {
  pruneExpired();
  const token = crypto.randomBytes(24).toString('base64url');
  tokens.set(token, { phone, expiresAt: Date.now() + TOKEN_TTL_MS, used: false });
  return token;
}

// Single-use: the first successful lookup consumes it. A second attempt
// with the same token, whether from a retry, a shared/logged link, or
// someone re-visiting browser history, gets nothing.
function consumeCallToken(token) {
  const entry = tokens.get(token);
  if (!entry) return null;
  tokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.phone;
}

module.exports = { issueCallToken, consumeCallToken, TOKEN_TTL_MS };
