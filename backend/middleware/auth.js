const jwt = require('jsonwebtoken');
const { error } = require('../utils/respond');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

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
