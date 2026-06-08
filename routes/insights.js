'use strict';

const { Router } = require('express');
const { getActivitiesSince } = require('../services/firestore');
const { aggregateByCategory, compareToAverages, topCategory } = require('../services/carbonEngine');
const { ACTIONS, AVERAGES } = require('../data/carbonData');
const cache = require('../services/cache');
const { apiLimiter } = require('../middleware/rateLimiters');

const router = Router();

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// GET /api/insights?sessionId=&days=30
router.get('/insights', apiLimiter, async (req, res) => {
  try {
    const { sessionId, days } = req.query;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const safeSid = escHtml(sessionId);
    const dayCount = Math.min(parseInt(days) || 30, 365);
    const cacheKey = `insights:${safeSid}:${dayCount}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);

    const since = new Date(Date.now() - dayCount * 86400000);
    const activities = await getActivitiesSince(safeSid, since);
    const { totals, grandTotal } = aggregateByCategory(activities);
    const top = topCategory(totals);

    // Build daily breakdown for trend chart (group by date)
    const dailyMap = {};
    for (const act of activities) {
      const date = new Date(act.timestamp || act.createdAt?.toDate?.() || Date.now())
        .toISOString().slice(0, 10);
      dailyMap[date] = (dailyMap[date] || 0) + act.co2;
    }
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, co2]) => ({ date, co2: parseFloat(co2.toFixed(2)) }));

    const payload = {
      periodDays: dayCount,
      grandTotal,
      totals,
      topCategory: top,
      daily,
      activityCount: activities.length,
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[insights]', err);
    res.status(500).json({ error: 'Failed to compute insights' });
  }
});

// GET /api/compare?sessionId=&days=30
router.get('/compare', apiLimiter, async (req, res) => {
  try {
    const { sessionId, days } = req.query;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const safeSid = escHtml(sessionId);
    const dayCount = Math.min(parseInt(days) || 30, 365);
    const cacheKey = `compare:${safeSid}:${dayCount}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);

    const since = new Date(Date.now() - dayCount * 86400000);
    const activities = await getActivitiesSince(safeSid, since);
    const { grandTotal } = aggregateByCategory(activities);

    // Normalise to monthly for fair comparison
    const monthlyEquivalent = parseFloat((grandTotal * (30 / dayCount)).toFixed(2));
    const comparison = compareToAverages(monthlyEquivalent);

    const payload = {
      periodDays: dayCount,
      grandTotal,
      monthlyEquivalent,
      averages: AVERAGES,
      comparison,
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[compare]', err);
    res.status(500).json({ error: 'Failed to compare footprint' });
  }
});

// GET /api/actions?category=
router.get('/actions', apiLimiter, (req, res) => {
  const { category } = req.query;
  let actions = ACTIONS;
  if (category) {
    actions = ACTIONS.filter(a => a.category === category);
  }
  // Sort by impact descending
  actions = [...actions].sort((a, b) => b.impact_kg_month - a.impact_kg_month);
  res.json({ actions });
});

module.exports = router;
