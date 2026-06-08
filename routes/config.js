'use strict';

const { Router } = require('express');
const { EMISSION_FACTORS, AVERAGES } = require('../data/carbonData');
const { apiLimiter } = require('../middleware/rateLimiters');

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

router.get('/config', apiLimiter, (_req, res) => {
  res.json({
    firebaseApiKey:          process.env.FIREBASE_API_KEY          || null,
    firebaseAuthDomain:      process.env.FIREBASE_AUTH_DOMAIN      || null,
    firebaseProjectId:       process.env.FIREBASE_PROJECT_ID       || null,
    firebaseStorageBucket:   process.env.FIREBASE_STORAGE_BUCKET   || null,
    firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || null,
    firebaseAppId:           process.env.FIREBASE_APP_ID           || null,
    firebaseMeasurementId:   process.env.FIREBASE_MEASUREMENT_ID   || null,
    demoMode: !process.env.GEMINI_API_KEY,
  });
});

router.get('/emission-factors', apiLimiter, (_req, res) => {
  res.json({ factors: EMISSION_FACTORS, averages: AVERAGES });
});

module.exports = router;
