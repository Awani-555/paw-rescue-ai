const jwt = require('jsonwebtoken');
const { error } = require('../utils/respond');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Without it the server would either ' +
      'refuse to start (safe) or silently sign tokens with a guessable default (not safe). ' +
      'Set JWT_SECRET in your .env file or deployment environment.'
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  }

  try {
    req.responder = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return error(res, 401, 'INVALID_TOKEN', 'Your session has expired. Please log in again.');
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { requireAuth, signToken, JWT_SECRET };
