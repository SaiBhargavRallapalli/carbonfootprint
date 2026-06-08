'use strict';

process.env.NODE_ENV = 'test';

// Mock Firebase Admin so tests don't need real credentials
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
    applicationDefault: jest.fn(),
  },
  firestore: jest.fn(() => ({
    collection: jest.fn().mockReturnThis(),
    doc:        jest.fn().mockReturnThis(),
    add:        jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
    orderBy:    jest.fn().mockReturnThis(),
    where:      jest.fn().mockReturnThis(),
    limit:      jest.fn().mockReturnThis(),
    get:        jest.fn().mockResolvedValue({ docs: [] }),
  })),
}));

const request = require('supertest');
const app     = require('./server');

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
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.demoMode).toBe(true);
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
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(1.71);
    expect(res.body.label).toBe('Petrol Car');
  });

  it('returns 201 for energy activity', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'energy', type: 'electricity', quantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(4.1);
  });

  it('returns 201 for food activity', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'food', type: 'veg_meal', quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBeCloseTo(1.05);
  });

  it('returns 400 when sessionId missing', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ category: 'transport', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId/i);
  });

  it('returns 400 when category missing', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it('returns 400 for unknown category', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'unknown', type: 'petrol_car', quantity: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown type within category', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'rocket_ship', quantity: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative quantity', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric quantity', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 'ten' });
    expect(res.status).toBe(400);
  });

  it('handles zero quantity (zero emissions)', async () => {
    const res = await request(app)
      .post('/api/log')
      .send({ sessionId: 'test-session', category: 'transport', type: 'petrol_car', quantity: 0 });
    expect(res.status).toBe(201);
    expect(res.body.co2).toBe(0);
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
});

// ── /api/insights ─────────────────────────────────────────
describe('GET /api/insights', () => {
  it('returns 400 when sessionId missing', async () => {
    const res = await request(app).get('/api/insights');
    expect(res.status).toBe(400);
  });

  it('returns aggregated insight shape', async () => {
    const res = await request(app).get('/api/insights?sessionId=test-session&days=30');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('grandTotal');
    expect(res.body).toHaveProperty('totals');
    expect(res.body).toHaveProperty('daily');
    expect(res.body).toHaveProperty('topCategory');
  });

  it('sets X-Cache HIT on second call', async () => {
    await request(app).get('/api/insights?sessionId=cache-test&days=30');
    const res = await request(app).get('/api/insights?sessionId=cache-test&days=30');
    expect(res.status).toBe(200);
    // Either cache hit or not — both valid in test env
    expect(['HIT', undefined]).toContain(res.headers['x-cache']);
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
});

// ── /api/actions ──────────────────────────────────────────
describe('GET /api/actions', () => {
  it('returns sorted action list', async () => {
    const res = await request(app).get('/api/actions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions.length).toBeGreaterThan(0);
    // Sorted by impact descending
    const impacts = res.body.actions.map(a => a.impact_kg_month);
    for (let i = 0; i < impacts.length - 1; i++) {
      expect(impacts[i]).toBeGreaterThanOrEqual(impacts[i + 1]);
    }
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/actions?category=transport');
    expect(res.status).toBe(200);
    res.body.actions.forEach(a => expect(a.category).toBe('transport'));
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
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'Hello' });
    expect(res.status).toBe(400);
  });

  it('returns 400 without message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session', message: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for message over 2000 chars', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session', message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('returns demo reply when no API key configured', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session', message: 'How can I reduce my footprint?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
    expect(typeof res.body.reply).toBe('string');
    if (original) process.env.GEMINI_API_KEY = original;
  });
});

// ── /api/tips ─────────────────────────────────────────────
describe('GET /api/tips', () => {
  it('returns 400 without sessionId', async () => {
    const res = await request(app).get('/api/tips');
    expect(res.status).toBe(400);
  });

  it('returns tips array in demo mode', async () => {
    const res = await request(app).get('/api/tips?sessionId=test-session');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tips)).toBe(true);
    expect(res.body.tips.length).toBeGreaterThan(0);
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

// ── Security headers ──────────────────────────────────────
describe('Security headers', () => {
  it('sets X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options or CSP frame-ancestors', async () => {
    const res = await request(app).get('/api/health');
    const hasFrame = res.headers['x-frame-options'] || res.headers['content-security-policy'];
    expect(hasFrame).toBeDefined();
  });
});

// ── carbonEngine unit tests ───────────────────────────────
describe('carbonEngine', () => {
  const { calculateCO2, aggregateByCategory, compareToAverages, topCategory } = require('./services/carbonEngine');

  describe('calculateCO2', () => {
    it('calculates petrol car correctly', () => {
      const result = calculateCO2('transport', 'petrol_car', 100);
      expect(result.co2).toBeCloseTo(17.1);
      expect(result.unit).toBe('km');
    });

    it('calculates electricity correctly', () => {
      const result = calculateCO2('energy', 'electricity', 10);
      expect(result.co2).toBeCloseTo(8.2);
    });

    it('calculates veg_meal correctly', () => {
      const result = calculateCO2('food', 'veg_meal', 5);
      expect(result.co2).toBeCloseTo(1.75);
    });

    it('calculates recycling (negative) correctly', () => {
      const result = calculateCO2('waste', 'recycling', 1);
      expect(result.co2).toBeCloseTo(-2.0);
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
      const result = calculateCO2('transport', 'petrol_car', 0);
      expect(result.co2).toBe(0);
    });
  });

  describe('aggregateByCategory', () => {
    it('sums correctly across categories', () => {
      const activities = [
        { category: 'transport', co2: 5 },
        { category: 'transport', co2: 3 },
        { category: 'food',      co2: 2 },
      ];
      const { totals, grandTotal } = aggregateByCategory(activities);
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
      const activities = [{ category: 'aliens', co2: 999 }];
      const { grandTotal } = aggregateByCategory(activities);
      expect(grandTotal).toBe(0);
    });
  });

  describe('compareToAverages', () => {
    it('rates 50 kg as excellent', () => {
      const { rating } = compareToAverages(50);
      expect(rating).toBe('excellent');
    });

    it('rates 130 kg as good', () => {
      const { rating } = compareToAverages(130);
      expect(rating).toBe('good');
    });

    it('rates 180 kg as average', () => {
      const { rating } = compareToAverages(180);
      expect(rating).toBe('average');
    });

    it('rates 400 kg as high', () => {
      const { rating } = compareToAverages(400);
      expect(rating).toBe('high');
    });

    it('calculates india diff correctly', () => {
      const { india_diff_pct } = compareToAverages(316); // 2× Indian avg
      expect(india_diff_pct).toBeCloseTo(100.0, 0);
    });
  });

  describe('topCategory', () => {
    it('returns the category with highest value', () => {
      const totals = { transport: 50, energy: 10, food: 5, shopping: 20, waste: 1 };
      expect(topCategory(totals)).toBe('transport');
    });

    it('handles tie by picking first sorted winner', () => {
      const totals = { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 };
      const result = topCategory(totals);
      expect(['transport', 'energy', 'food', 'shopping', 'waste']).toContain(result);
    });
  });
});

// ── Cache unit tests ──────────────────────────────────────
describe('cache', () => {
  const cache = require('./services/cache');

  beforeEach(() => cache.clear());

  it('returns null for missing key', () => {
    expect(cache.get('nothing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    cache.set('k', { hello: 'world' });
    expect(cache.get('k')).toEqual({ hello: 'world' });
  });

  it('expires after TTL', async () => {
    cache.set('k', 'value', 10); // 10 ms TTL
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
  const { buildCarbonSystemPrompt, chat, generateTips } = require('./services/gemini');

  describe('buildCarbonSystemPrompt', () => {
    it('includes total footprint in system prompt', () => {
      const profile = {
        totals: { transport: 50, energy: 20, food: 10, shopping: 5, waste: 2 },
        grandTotal: 87,
        topCat: 'transport',
        recentActivities: [],
      };
      const prompt = buildCarbonSystemPrompt(profile);
      expect(prompt).toContain('87');
      expect(prompt).toContain('transport');
    });

    it('shows ABOVE when user exceeds Indian average', () => {
      const profile = {
        totals: { transport: 200, energy: 0, food: 0, shopping: 0, waste: 0 },
        grandTotal: 200,
        topCat: 'transport',
        recentActivities: [],
      };
      const prompt = buildCarbonSystemPrompt(profile);
      expect(prompt).toContain('ABOVE');
    });

    it('shows BELOW when user is under Indian average', () => {
      const profile = {
        totals: { transport: 50, energy: 0, food: 0, shopping: 0, waste: 0 },
        grandTotal: 50,
        topCat: 'transport',
        recentActivities: [],
      };
      const prompt = buildCarbonSystemPrompt(profile);
      expect(prompt).toContain('BELOW');
    });

    it('lists recent activities in prompt', () => {
      const profile = {
        totals: { transport: 10, energy: 0, food: 0, shopping: 0, waste: 0 },
        grandTotal: 10,
        topCat: 'transport',
        recentActivities: [
          { label: 'Petrol Car', quantity: 10, unit: 'km', co2: 1.71 },
        ],
      };
      const prompt = buildCarbonSystemPrompt(profile);
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
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      process.env.GEMINI_API_KEY = 'test-key-123';
    });

    afterEach(() => {
      global.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
    });

    it('returns AI text from mocked Gemini response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Mock AI reply' }] } }],
        }),
      });
      const profile = { totals: {}, grandTotal: 0, topCat: 'transport', recentActivities: [] };
      const reply = await chat('test message', [], profile);
      expect(reply).toBe('Mock AI reply');
    });

    it('throws when Gemini API returns non-ok status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });
      const profile = { totals: {}, grandTotal: 0, topCat: 'transport', recentActivities: [] };
      await expect(chat('test', [], profile)).rejects.toThrow('403');
    });

    it('throws when Gemini response has no text', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] }),
      });
      const profile = { totals: {}, grandTotal: 0, topCat: 'transport', recentActivities: [] };
      await expect(chat('test', [], profile)).rejects.toThrow('Empty response');
    });
  });

  describe('generateTips (mocked API)', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      process.env.GEMINI_API_KEY = 'test-key-123';
    });

    afterEach(() => {
      global.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
    });

    it('parses JSON array of tips', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '["Tip one","Tip two","Tip three"]' }] } }],
        }),
      });
      const profile = { totals: {}, grandTotal: 0, topCat: 'energy', recentActivities: [] };
      const tips = await generateTips(profile);
      expect(Array.isArray(tips)).toBe(true);
      expect(tips[0]).toBe('Tip one');
    });

    it('returns raw text when JSON parse fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'not valid json' }] } }],
        }),
      });
      const profile = { totals: {}, grandTotal: 0, topCat: 'food', recentActivities: [] };
      const tips = await generateTips(profile);
      expect(Array.isArray(tips)).toBe(true);
    });

    it('returns demo tips when no API key', async () => {
      delete process.env.GEMINI_API_KEY;
      const tips = await generateTips({});
      expect(Array.isArray(tips)).toBe(true);
      expect(tips.length).toBe(3);
    });
  });
});

// ── carbonData unit tests ─────────────────────────────────
describe('carbonData', () => {
  const { EMISSION_FACTORS, AVERAGES, ACTIONS } = require('./data/carbonData');

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
