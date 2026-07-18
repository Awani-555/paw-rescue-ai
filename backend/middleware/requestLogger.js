const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_PATH = path.join(LOG_DIR, 'app.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const line = `[${formatTimestamp(new Date())}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms\n`;

    console.log(line.trim());

    // Async, fire-and-forget: appendFileSync here would block Node's
    // single event loop thread on disk I/O for every request that
    // finishes, which is the request-handling hot path itself.
    try {
      ensureLogDir();
      fs.appendFile(LOG_PATH, line, (err) => {
        if (err) console.error('Failed to write request log:', err.message);
      });
    } catch (err) {
      console.error('Failed to write request log:', err.message);
    }
  });

  next();
}

module.exports = requestLogger;
