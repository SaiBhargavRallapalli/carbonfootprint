import { Router } from 'express';
import { EMISSION_FACTORS, AVERAGES } from '../data/carbonData';
import { apiLimiter } from '../middleware/rateLimiters';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

router.get('/config', apiLimiter, (_req, res) => {
  const firebaseApiKey            = process.env.FIREBASE_API_KEY            ?? null;
  const firebaseAuthDomain        = process.env.FIREBASE_AUTH_DOMAIN        ?? null;
  const firebaseProjectId         = process.env.FIREBASE_PROJECT_ID         ?? null;
  const firebaseStorageBucket     = process.env.FIREBASE_STORAGE_BUCKET     ?? null;
  const firebaseMessagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID ?? null;
  const firebaseAppId             = process.env.FIREBASE_APP_ID             ?? null;
  const firebaseMeasurementId     = process.env.FIREBASE_MEASUREMENT_ID     ?? null;
  const demoMode                  = !process.env.GEMINI_API_KEY;
  res.json({
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseStorageBucket,
    firebaseMessagingSenderId,
    firebaseAppId,
    firebaseMeasurementId,
    demoMode,
  });
});

router.get('/emission-factors', apiLimiter, (_req, res) => {
  res.json({ factors: EMISSION_FACTORS, averages: AVERAGES });
});

export default router;
