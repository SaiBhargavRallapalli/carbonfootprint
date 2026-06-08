'use strict';

/**
 * Structured request logger — prints method, path, status, and duration.
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
}

/**
 * Validates that required environment variables are present.
 * Warns — does not crash — so the app runs in demo mode without API keys.
 */
function validateEnvironment() {
  const required = ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn(`[ENV] Missing optional env vars (demo mode active): ${missing.join(', ')}`);
  }
}

module.exports = { requestLogger, validateEnvironment };
