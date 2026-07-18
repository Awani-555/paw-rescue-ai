function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj) {
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) continue; // strip mongo-style operator injection keys
    clean[key] = sanitizeValue(obj[key]);
  }
  return clean;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// Same shape is required for both Tier 2 (registered responders,
// routes/volunteerRoutes.js) and Tier 1 (anonymous public, server.js)
// opt-in - this used to be two separately hand-rolled checks that had
// drifted apart, with the anonymous path's version silently accepting a
// subscription missing its `keys`. One shared check means they can't
// drift again.
function isValidPushSubscription(sub) {
  return (
    sub &&
    typeof sub === 'object' &&
    typeof sub.endpoint === 'string' &&
    sub.keys &&
    typeof sub.keys.p256dh === 'string' &&
    typeof sub.keys.auth === 'string'
  );
}

module.exports = { sanitizeBody, isValidCoordinate, isValidPushSubscription };
