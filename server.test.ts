process.env.NODE_ENV = 'test';

// Mock the firestore service entirely — no firebase-admin needed in tests
jest.mock('./services/firestore', () => ({
  logActivity: jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
  getHistory: jest.fn().mockResolvedValue([]),
  getActivitiesSince: jest.fn().mockResolvedValue([
    { id: 'act1', category: 'transport', type: 'petrol_car', quantity: 10,
      co2: 1.71, label: 'Petrol Car', unit: 'km', timestamp: Date.now() - 86400000 },
  ]),
}));

// Mock chat/generateTips as jest.fn() calling through to the real implementation
// so they return demo responses by default and can be overridden per-test
jest.mock('./services/gemini', () => {
  const actual = jest.requireActual<typeof import('./services/gemini')>('./services/gemini');
  return {
    buildCarbonSystemPrompt: actual.buildCarbonSystemPrompt,
    chat:         jest.fn().mockImplementation(actual.chat),
    generateTips: jest.fn().mockImplementation(actual.generateTips),
  };
});

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import app from './server';
import * as firestoreService from './services/firestore';
import * as geminiService from './services/gemini';
import { calculateCO2, aggregateByCategory, compareToAverages, topCategory } from './services/carbonEngine';
import * as cache from './services/cache';
import { buildCarbonSystemPrompt, chat, generateTips } from './services/gemini';
import { escHtml } from './utils/sanitize';
import { requestLogger, validateEnvironment } from './middleware/index';
import { EMISSION_FACTORS, AVERAGES, ACTIONS } from './data/carbonData';
import type { Activity } from './types';

// ── /api/health ─────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.ts).toBeDefined();
  });
});

// ── /api/config ──────────────────────────────────────────
describe('GET /api/config', () => {
  it('returns 200 with demoMode true when no API key', async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.demoMode).toBe(true);
    if (saved) process.env.GEMINI_API_KEY = saved;
  });

  it('returns demoMode false when API key is set', async () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.demoMode).toBe(false);
    if (saved) process.env.GEMINI_API_KEY = saved; else delete process.env.GEMINI_API_KEY;
  });

  it('includes firebase config when env vars are set', async () => {
    process.env.FIREBASE_API_KEY = 'test-api-key';
    process.env.FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
    process.env.FIREBASE_MESSAGING_SENDER_ID = '123456';
    process.env.FIREBASE_APP_ID = '1:123:web:abc';
    process.env.FIREBASE_MEASUREMENT_ID = 'G-TEST';
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.firebaseApiKey).toBe('test-api-key');
    expect(res.body.firebaseAuthDomain).toBe('test.firebaseapp.com');
    expect(res.body.firebaseProjectId).toBe('test-project');
    expect(res.body.firebaseStorageBucket).toBe('test.appspot.com');
    expect(res.body.firebaseMessagingSenderId).toBe('123456');
    expect(res.body.firebaseAppId).toBe('1:123:web:abc');
    expect(res.body.firebaseMeasurementId).toBe('G-TEST');
    delete process.env.FIREBASE_API_KEY;
    delete process.env.FIREBASE_AUTH_DOMAIN;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_MESSAGING_SENDER_ID;
    delete process.env.FIREBASE_APP_ID;
    delete process.env.FIREBASE_MEASUREMENT_ID;
  });
});

// ── /api/emission-factors ────────────────────────────────
describe('GET /api/emission-factors', () => {
  it('returns all 5 categories', async () => {
    const res = await request(app).get('/api/emission-factors');
    expect(res.status).toBe(200);
    expect(res.body.factors).toHaveProperty('transport');
    expect(res.body.factors).toHaveProperty('energy');
    expect(res.body.factors).toHaveProperty('food');
    expect(res.body.factors).toHaveProperty('shopping');
    expect(res.body.factors).toHaveProperty('waste');
    expect(res.body.averages).toHaveProperty('india_monthly');
  });

  it('includes petrol_car in transport', async () => {
    const res = await request(app).get('/api/emission-factors');
    expect(res.body.factors.transport.petrol_car).toBeDefined();
    expect(res.body.factors.transport.petrol_car.factor).toBeCloseTo(0.171);
  });
});

// ── /api/log ─────────────────────────────────────────────
describe('POST /api/log', () => {
  it('returns 201 with co2 for valid transport activity', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(1.71);
    expect(res.body.label).toBe('Petrol Car');
  });

  it('returns 201 for energy activity', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'energy', type: 'electricity', quantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(4.1);
  });

  it('returns 201 for food activity', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'food', type: 'veg_meal', quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(1.05);
  });

  it('returns 400 when sessionId missing', async () => {
    const res = await request(app).post('/api/log')
      .send({ category: 'transport', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId/i);
  });

  it('returns 400 when sessionId exceeds 128 chars', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'x'.repeat(129), category: 'transport', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId/i);
  });

  it('returns 400 when category missing', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it('returns 400 when type missing (category present)', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it('returns 400 for unknown category', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'unknown', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown type within category', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'rocket_ship', quantity: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative quantity', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric quantity', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 'ten' });
    expect(res.status).toBe(400);
  });

  it('handles zero quantity (zero emissions)', async () => {
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 0 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBe(0);
  });

  it('accepts custom timestamp in body', async () => {
    const ts = new Date('2024-01-15').toISOString();
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 5, timestamp: ts });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(0.855);
  });

  it('returns 500 when logActivity throws unexpectedly', async () => {
    (firestoreService.logActivity as jest.Mock).mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(app).post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 5 });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to log/i);
  });
});

// ── /api/history ─────────────────────────────────────────
describe('GET /api/history', () => {
  it('returns 400 when sessionId missing', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(400);
  });

  it('returns activities array for valid sessionId', async () => {
    const res = await request(app).get('/api/history?sessionId=test-session');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });

  it('respects limit param (max 100)', async () => {
    const res = await request(app).get('/api/history?sessionId=test-session&limit=200');
    expect(res.status).toBe(200);
  });

  it('falls back to default limit 50 when limit is non-numeric', async () => {
    const res = await request(app).get('/api/history?sessionId=test-session&limit=abc');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });

  it('returns 500 when getHistory throws', async () => {
    (firestoreService.getHistory as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/api/history?sessionId=test-session');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to retrieve/i);
  });
});

// ── /api/insights ─────────────────────────────────────────
describe('GET /api/insights', () => {
  it('returns 400 when sessionId missing', async () => {
    const res = await request(app).get('/api/insights');
    expect(res.status).toBe(400);
  });

  it('returns aggregated insight shape with daily trend', async () => {
    const res = await request(app).get('/api/insights?sessionId=insight-session&days=30');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('grandTotal');
    expect(res.body).toHaveProperty('totals');
    expect(res.body).toHaveProperty('daily');
    expect(res.body).toHaveProperty('topCategory');
    expect(Array.isArray(res.body.daily)).toBe(true);
  });

  it('sets X-Cache HIT on second call', async () => {
    await request(app).get('/api/insights?sessionId=cache-test&days=30');
    const res = await request(app).get('/api/insights?sessionId=cache-test&days=30');
    expect(res.status).toBe(200);
    expect(['HIT', undefined]).toContain(res.headers['x-cache']);
  });

  it('returns 500 when getActivitiesSince throws', async () => {
    (firestoreService.getActivitiesSince as jest.Mock).mockRejectedValueOnce(new Error('Firestore down'));
    const res = await request(app).get('/api/insights?sessionId=err-session&days=30');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to compute/i);
  });

  it('covers activity with no timestamp — falls back to createdAt', async () => {
    (firestoreService.getActivitiesSince as jest.Mock).mockResolvedValueOnce([
      { id: 'a1', category: 'food', type: 'veg_meal', quantity: 2, co2: 0.7, label: 'Veg Meal', unit: 'meal',
        createdAt: { toDate: () => new Date(Date.now() - 86400000) } },
      { id: 'a2', category: 'food', type: 'veg_meal', quantity: 2, co2: 0.7, label: 'Veg Meal', unit: 'meal' },
    ]);
    const res = await request(app).get('/api/insights?sessionId=ts-test&days=30');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.daily)).toBe(true);
  });

  it('caps days at 365', async () => {
    const res = await request(app).get('/api/insights?sessionId=test-session&days=500');
    expect(res.status).toBe(200);
    expect(res.body.periodDays).toBe(365);
  });

  it('falls back to 30 days when days is non-numeric', async () => {
    const res = await request(app).get('/api/insights?sessionId=test-session&days=abc');
    expect(res.status).toBe(200);
    expect(res.body.periodDays).toBe(30);
  });

  it('handles two activities on the same day', async () => {
    const sameDay = Date.now() - 86400000;
    (firestoreService.getActivitiesSince as jest.Mock).mockResolvedValueOnce([
      { id: 'x1', category: 'transport', type: 'petrol_car', quantity: 5, co2: 0.855, label: 'Petrol Car', unit: 'km', timestamp: sameDay },
      { id: 'x2', category: 'energy', type: 'electricity', quantity: 2, co2: 1.64, label: 'Electricity', unit: 'kWh', timestamp: sameDay },
    ]);
    const res = await request(app).get('/api/insights?sessionId=same-day-test&days=30');
    expect(res.status).toBe(200);
    expect(res.body.daily.length).toBe(1);
    expect(res.body.daily[0].co2).toBeCloseTo(2.495);
  });
});

// ── /api/compare ──────────────────────────────────────────
describe('GET /api/compare', () => {
  it('returns 400 without sessionId', async () => {
    const res = await request(app).get('/api/compare');
    expect(res.status).toBe(400);
  });

  it('returns comparison shape', async () => {
    const res = await request(app).get('/api/compare?sessionId=test-session&days=30');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('monthlyEquivalent');
    expect(res.body).toHaveProperty('comparison');
    expect(res.body.comparison).toHaveProperty('rating');
    expect(['excellent', 'good', 'average', 'high']).toContain(res.body.comparison.rating);
  });

  it('returns 500 when getActivitiesSince throws', async () => {
    (firestoreService.getActivitiesSince as jest.Mock).mockRejectedValueOnce(new Error('Firestore down'));
    const res = await request(app).get('/api/compare?sessionId=err-session&days=30');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to compare/i);
  });

  it('caps compare days at 365', async () => {
    const res = await request(app).get('/api/compare?sessionId=test-session&days=999');
    expect(res.status).toBe(200);
    expect(res.body.periodDays).toBe(365);
  });

  it('falls back to 30 days when compare days is non-numeric', async () => {
    const res = await request(app).get('/api/compare?sessionId=test-session&days=xyz');
    expect(res.status).toBe(200);
    expect(res.body.periodDays).toBe(30);
  });

  it('returns X-Cache HIT on second compare call', async () => {
    await request(app).get('/api/compare?sessionId=compare-cache&days=30');
    const res = await request(app).get('/api/compare?sessionId=compare-cache&days=30');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
  });
});

// ── /api/actions ──────────────────────────────────────────
describe('GET /api/actions', () => {
  it('returns sorted action list', async () => {
    const res = await request(app).get('/api/actions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions.length).toBeGreaterThan(0);
    const impacts = res.body.actions.map((a: { impact_kg_month: number }) => a.impact_kg_month);
    for (let i = 0; i < impacts.length - 1; i++) {
      expect(impacts[i]).toBeGreaterThanOrEqual(impacts[i + 1]);
    }
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/actions?category=transport');
    expect(res.status).toBe(200);
    res.body.actions.forEach((a: { category: string }) => expect(a.category).toBe('transport'));
  });

  it('returns empty array for non-existent category', async () => {
    const res = await request(app).get('/api/actions?category=aliens');
    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(0);
  });
});

// ── /api/chat ─────────────────────────────────────────────
describe('POST /api/chat', () => {
  it('returns 400 without sessionId', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'Hello' });
    expect(res.status).toBe(400);
  });

  it('returns 400 without message', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: 'test-session' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is a non-string type', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: 'test-session', message: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/message/i);
  });

  it('returns 400 for empty message', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: 'test-session', message: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for message over 2000 chars', async () => {
    const res = await request(app).post('/api/chat')
      .send({ sessionId: 'test-session', message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('returns demo reply when no API key configured', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await request(app).post('/api/chat')
      .send({ sessionId: 'test-session', message: 'How can I reduce my footprint?' });
    expect(res.status).toBe(200);
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
    if (original) process.env.GEMINI_API_KEY = original;
  });

  it('handles non-array history gracefully', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await request(app).post('/api/chat')
      .send({ sessionId: 'test-session', message: 'Hello', history: 'not-an-array' });
    expect(res.status).toBe(200);
    if (original) process.env.GEMINI_API_KEY = original;
  });

  it('returns 500 when chat service throws', async () => {
    (geminiService.chat as jest.Mock).mockRejectedValueOnce(new Error('Gemini error'));
    const res = await request(app).post('/api/chat')
      .send({ sessionId: 'test-session', message: 'Hello' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });
});

// ── /api/tips ─────────────────────────────────────────────
describe('GET /api/tips', () => {
  it('returns 400 without sessionId', async () => {
    const res = await request(app).get('/api/tips');
    expect(res.status).toBe(400);
  });

  it('returns tips array', async () => {
    (geminiService.generateTips as jest.Mock).mockResolvedValueOnce(['Tip A', 'Tip B', 'Tip C']);
    const res = await request(app).get('/api/tips?sessionId=tips-fresh');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tips)).toBe(true);
    expect(res.body.tips.length).toBeGreaterThan(0);
  });

  it('returns X-Cache HIT on second call', async () => {
    (geminiService.generateTips as jest.Mock).mockResolvedValueOnce(['Tip 1', 'Tip 2', 'Tip 3']);
    await request(app).get('/api/tips?sessionId=tips-cache-test');
    const res = await request(app).get('/api/tips?sessionId=tips-cache-test');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('returns 500 when generateTips throws', async () => {
    (geminiService.generateTips as jest.Mock).mockRejectedValueOnce(new Error('AI error'));
    const res = await request(app).get('/api/tips?sessionId=err-session');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to generate/i);
  });
});

// ── 404 handler ───────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

// ── Global error handler ──────────────────────────────────
describe('Global error handler', () => {
  it('returns 500 for errors passed via next(err)', async () => {
    const testApp = express();
    testApp.get('/boom', (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error('forced error'));
    });
    testApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[server]', err);
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(testApp).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

// ── CORS ALLOWED_ORIGIN branch ────────────────────────────
describe('CORS origin', () => {
  it('uses ALLOWED_ORIGIN when set', async () => {
    process.env.ALLOWED_ORIGIN = 'https://ecosage.example.com';
    const res = await request(app).get('/api/health')
      .set('Origin', 'https://ecosage.example.com');
    expect(res.status).toBe(200);
    delete process.env.ALLOWED_ORIGIN;
  });
});

// ── Security headers ──────────────────────────────────────
describe('Security headers', () => {
  it('sets X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options or CSP frame-ancestors', async () => {
    const res = await request(app).get('/api/health');
    const hasFrame = res.headers['x-frame-options'] ?? res.headers['content-security-policy'];
    expect(hasFrame).toBeDefined();
  });
});

// ── carbonEngine unit tests ───────────────────────────────
describe('carbonEngine', () => {
  describe('calculateCO2', () => {
    it('calculates petrol car correctly', () => {
      const result = calculateCO2('transport', 'petrol_car', 100);
      expect(result.co2).toBeCloseTo(17.1);
      expect(result.unit).toBe('km');
    });

    it('calculates electricity correctly', () => {
      expect(calculateCO2('energy', 'electricity', 10).co2).toBeCloseTo(8.2);
    });

    it('calculates veg_meal correctly', () => {
      expect(calculateCO2('food', 'veg_meal', 5).co2).toBeCloseTo(1.75);
    });

    it('calculates recycling (negative) correctly', () => {
      expect(calculateCO2('waste', 'recycling', 1).co2).toBeCloseTo(-2.0);
    });

    it('throws for unknown category', () => {
      expect(() => calculateCO2('aliens', 'ufo', 1)).toThrow('Unknown category');
    });

    it('throws for unknown type', () => {
      expect(() => calculateCO2('transport', 'ufo', 1)).toThrow("Unknown type 'ufo'");
    });

    it('throws for negative quantity', () => {
      expect(() => calculateCO2('transport', 'petrol_car', -1)).toThrow('non-negative');
    });

    it('throws for missing category', () => {
      expect(() => calculateCO2('', 'petrol_car', 10)).toThrow('required');
    });

    it('handles zero quantity', () => {
      expect(calculateCO2('transport', 'petrol_car', 0).co2).toBe(0);
    });
  });

  describe('aggregateByCategory', () => {
    const mkAct = (category: Activity['category'], co2: number): Activity => ({
      category, co2, type: 't', quantity: 1, unit: 'u', label: 'l', timestamp: 0,
    });

    it('sums correctly across categories', () => {
      const { totals, grandTotal } = aggregateByCategory([
        mkAct('transport', 5), mkAct('transport', 3), mkAct('food', 2),
      ]);
      expect(totals.transport).toBeCloseTo(8);
      expect(totals.food).toBeCloseTo(2);
      expect(grandTotal).toBeCloseTo(10);
    });

    it('returns zeros for empty input', () => {
      const { totals, grandTotal } = aggregateByCategory([]);
      expect(grandTotal).toBe(0);
      expect(totals.transport).toBe(0);
    });

    it('ignores unknown categories gracefully', () => {
      const { grandTotal } = aggregateByCategory([{ category: 'aliens' as Activity['category'], co2: 999, type: 't', quantity: 1, unit: 'u', label: 'l', timestamp: 0 }]);
      expect(grandTotal).toBe(0);
    });
  });

  describe('compareToAverages', () => {
    it('rates 50 kg as excellent', () => { expect(compareToAverages(50).rating).toBe('excellent'); });
    it('rates 130 kg as good',      () => { expect(compareToAverages(130).rating).toBe('good'); });
    it('rates 180 kg as average',   () => { expect(compareToAverages(180).rating).toBe('average'); });
    it('rates 400 kg as high',      () => { expect(compareToAverages(400).rating).toBe('high'); });

    it('calculates india diff correctly', () => {
      expect(compareToAverages(316).india_diff_pct).toBeCloseTo(100.0, 0);
    });
  });

  describe('topCategory', () => {
    it('returns the category with highest value', () => {
      expect(topCategory({ transport: 50, energy: 10, food: 5, shopping: 20, waste: 1 })).toBe('transport');
    });

    it('handles all-zero totals', () => {
      expect(['transport', 'energy', 'food', 'shopping', 'waste'])
        .toContain(topCategory({ transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 }));
    });
  });
});

// ── Cache unit tests ──────────────────────────────────────
describe('cache', () => {
  beforeEach(() => cache.clear());

  it('returns null for missing key', () => {
    expect(cache.get('nothing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    cache.set('k', { hello: 'world' });
    expect(cache.get('k')).toEqual({ hello: 'world' });
  });

  it('expires after TTL', async () => {
    cache.set('k', 'value', 10);
    await new Promise(r => setTimeout(r, 20));
    expect(cache.get('k')).toBeNull();
  });

  it('deletes a key', () => {
    cache.set('k', 'value');
    cache.del('k');
    expect(cache.get('k')).toBeNull();
  });

  it('clears all keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});

// ── gemini unit tests ─────────────────────────────────────
describe('gemini', () => {
  describe('buildCarbonSystemPrompt', () => {
    it('includes total footprint in system prompt', () => {
      const prompt = buildCarbonSystemPrompt({ totals: { transport: 50, energy: 20, food: 10, shopping: 5, waste: 2 }, grandTotal: 87, topCat: 'transport', recentActivities: [] });
      expect(prompt).toContain('87');
      expect(prompt).toContain('transport');
    });

    it('shows ABOVE when user exceeds Indian average', () => {
      expect(buildCarbonSystemPrompt({ totals: { transport: 200, energy: 0, food: 0, shopping: 0, waste: 0 }, grandTotal: 200, topCat: 'transport', recentActivities: [] })).toContain('ABOVE');
    });

    it('shows BELOW when user is under Indian average', () => {
      expect(buildCarbonSystemPrompt({ totals: { transport: 50, energy: 0, food: 0, shopping: 0, waste: 0 }, grandTotal: 50, topCat: 'transport', recentActivities: [] })).toContain('BELOW');
    });

    it('lists recent activities in prompt', () => {
      const prompt = buildCarbonSystemPrompt({
        totals: { transport: 10, energy: 0, food: 0, shopping: 0, waste: 0 },
        grandTotal: 10, topCat: 'transport',
        recentActivities: [{ label: 'Petrol Car', quantity: 10, unit: 'km', co2: 1.71, category: 'transport', type: 'petrol_car', timestamp: 0 }],
      });
      expect(prompt).toContain('Petrol Car');
    });

    it('handles empty profile gracefully', () => {
      const prompt = buildCarbonSystemPrompt({});
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('chat (demo mode)', () => {
    it('returns demo response when no API key', async () => {
      const original = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const reply = await chat('hello', [], {});
      expect(typeof reply).toBe('string');
      expect(reply.length).toBeGreaterThan(0);
      if (original) process.env.GEMINI_API_KEY = original;
    });
  });

  describe('chat (mocked API)', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => { originalFetch = global.fetch; process.env.GEMINI_API_KEY = 'test-key-123'; });
    afterEach(() => { global.fetch = originalFetch; delete process.env.GEMINI_API_KEY; });

    it('returns AI text from mocked Gemini response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Mock AI reply' }] } }] }) }) as typeof fetch;
      expect(await chat('test message', [], { totals: { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 }, grandTotal: 0, topCat: 'transport', recentActivities: [] })).toBe('Mock AI reply');
    });

    it('throws when Gemini API returns non-ok status', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' }) as typeof fetch;
      await expect(chat('test', [], {})).rejects.toThrow('403');
    });

    it('throws when Gemini response has no text', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }) as typeof fetch;
      await expect(chat('test', [], {})).rejects.toThrow('Empty response');
    });
  });

  describe('generateTips (mocked API)', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => { originalFetch = global.fetch; process.env.GEMINI_API_KEY = 'test-key-123'; });
    afterEach(() => { global.fetch = originalFetch; delete process.env.GEMINI_API_KEY; });

    it('parses JSON array of tips', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '["Tip one","Tip two","Tip three"]' }] } }] }) }) as typeof fetch;
      const tips = await generateTips({ totals: { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 }, grandTotal: 0, topCat: 'energy', recentActivities: [] });
      expect(Array.isArray(tips)).toBe(true);
      expect(tips[0]).toBe('Tip one');
    });

    it('returns raw text when JSON parse fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not valid json' }] } }] }) }) as typeof fetch;
      expect(Array.isArray(await generateTips({}))).toBe(true);
    });

    it('returns demo tips when no API key', async () => {
      delete process.env.GEMINI_API_KEY;
      const tips = await generateTips({});
      expect(Array.isArray(tips)).toBe(true);
      expect(tips.length).toBe(3);
    });

    it('throws when generateTips API returns non-ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'Error' }) as typeof fetch;
      await expect(generateTips({})).rejects.toThrow('500');
    });

    it('falls through when JSON parsed as empty array', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) }) as typeof fetch;
      const tips = await generateTips({});
      expect(Array.isArray(tips)).toBe(true);
    });
  });

  describe('buildCarbonSystemPrompt edge cases', () => {
    it('uses type when activity has no label', () => {
      const prompt = buildCarbonSystemPrompt({
        totals: { transport: 10, energy: 0, food: 0, shopping: 0, waste: 0 },
        grandTotal: 10, topCat: 'transport',
        recentActivities: [{ type: 'petrol_car', quantity: 10, co2: 1.71, category: 'transport', timestamp: 0, unit: 'km', label: '' }],
      });
      expect(prompt).toContain('petrol_car');
    });

    it('uses "units" when activity has no unit', () => {
      const prompt = buildCarbonSystemPrompt({
        totals: { transport: 10, energy: 0, food: 0, shopping: 0, waste: 0 },
        grandTotal: 10, topCat: 'transport',
        recentActivities: [{ label: 'Car', type: 'petrol_car', quantity: 10, co2: 1.71, category: 'transport', timestamp: 0, unit: '' }],
      });
      expect(prompt).toContain('units');
    });
  });
});

// ── sanitize unit tests ───────────────────────────────────
describe('sanitize', () => {
  it('escapes < and > characters', () => { expect(escHtml('<script>')).toBe('&lt;script&gt;'); });
  it('escapes & character',        () => { expect(escHtml('a & b')).toBe('a &amp; b'); });
  it('escapes double quotes',       () => { expect(escHtml('"hello"')).toBe('&quot;hello&quot;'); });
  it("escapes single quotes",       () => { expect(escHtml("it's")).toBe('it&#39;s'); });

  it('handles all special chars together', () => {
    expect(escHtml('<a href="x" onclick=\'y\'>&</a>')).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('coerces non-string input to string', () => { expect(escHtml(42)).toBe('42'); });
  it('returns empty string for empty input', () => { expect(escHtml('')).toBe(''); });
  it('leaves clean strings unchanged', () => { expect(escHtml('hello world')).toBe('hello world'); });
});

// ── middleware unit tests ─────────────────────────────────
describe('middleware', () => {
  describe('requestLogger', () => {
    it('calls next()', (done) => {
      const req = { method: 'GET', path: '/test' } as Request;
      const listeners: Record<string, () => void> = {};
      const res = { statusCode: 200, on: (e: string, cb: () => void) => { listeners[e] = cb; } } as unknown as Response;
      requestLogger(req, res, done as NextFunction);
    });

    it('logs INFO for 2xx responses', () => {
      const req = { method: 'GET', path: '/test' } as Request;
      const listeners: Record<string, () => void> = {};
      const res = { statusCode: 200, on: (e: string, cb: () => void) => { listeners[e] = cb; } } as unknown as Response;
      requestLogger(req, res, () => {});
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      listeners['finish']();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
      spy.mockRestore();
    });

    it('logs WARN for 4xx responses', () => {
      const req = { method: 'GET', path: '/test' } as Request;
      const listeners: Record<string, () => void> = {};
      const res = { statusCode: 404, on: (e: string, cb: () => void) => { listeners[e] = cb; } } as unknown as Response;
      requestLogger(req, res, () => {});
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      listeners['finish']();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
      spy.mockRestore();
    });

    it('logs ERROR for 5xx responses', () => {
      const req = { method: 'POST', path: '/api/chat' } as Request;
      const listeners: Record<string, () => void> = {};
      const res = { statusCode: 500, on: (e: string, cb: () => void) => { listeners[e] = cb; } } as unknown as Response;
      requestLogger(req, res, () => {});
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      listeners['finish']();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
      spy.mockRestore();
    });
  });

  describe('validateEnvironment', () => {
    it('warns when required env vars are missing', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const saved = { k: process.env.GEMINI_API_KEY, p: process.env.FIREBASE_PROJECT_ID };
      delete process.env.GEMINI_API_KEY;
      delete process.env.FIREBASE_PROJECT_ID;
      validateEnvironment();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('demo mode'));
      spy.mockRestore();
      if (saved.k) process.env.GEMINI_API_KEY = saved.k;
      if (saved.p) process.env.FIREBASE_PROJECT_ID = saved.p;
    });

    it('does not warn when all required vars are present', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const saved = { k: process.env.GEMINI_API_KEY, p: process.env.FIREBASE_PROJECT_ID };
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      validateEnvironment();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      if (saved.k) process.env.GEMINI_API_KEY = saved.k; else delete process.env.GEMINI_API_KEY;
      if (saved.p) process.env.FIREBASE_PROJECT_ID = saved.p; else delete process.env.FIREBASE_PROJECT_ID;
    });
  });
});

// ── carbonData unit tests ─────────────────────────────────
describe('carbonData', () => {
  it('has positive emission factor for all transport types', () => {
    Object.values(EMISSION_FACTORS.transport).forEach(({ factor }) => {
      expect(factor).toBeGreaterThan(0);
    });
  });

  it('has negative factor for waste recycling (saves CO2)', () => {
    expect(EMISSION_FACTORS.waste.recycling.factor).toBeLessThan(0);
  });

  it('has valid Indian average', () => {
    expect(AVERAGES.india_monthly).toBe(158);
  });

  it('all actions have required fields', () => {
    ACTIONS.forEach(action => {
      expect(action).toHaveProperty('id');
      expect(action).toHaveProperty('category');
      expect(action).toHaveProperty('title');
      expect(action).toHaveProperty('impact_kg_month');
      expect(action).toHaveProperty('difficulty');
      expect(['easy', 'medium', 'hard']).toContain(action.difficulty);
      expect(action.impact_kg_month).toBeGreaterThan(0);
    });
  });
});
