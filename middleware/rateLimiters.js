'use strict';

const rateLimit = require('express-rate-limit');

// Stricter limit for AI endpoints (costly per-call)
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many AI requests — please wait a moment.' },
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests — please slow down.' },
});

module.exports = { chatLimiter, apiLimiter };
