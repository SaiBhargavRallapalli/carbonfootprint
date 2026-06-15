import { Router } from 'express';
import { getActivitiesSince } from '../services/firestore';
import { aggregateByCategory, compareToAverages, topCategory } from '../services/carbonEngine';
import { ACTIONS, AVERAGES } from '../data/carbonData';
import * as cache from '../services/cache';
import { apiLimiter } from '../middleware/rateLimiters';
import { escHtml } from '../utils/sanitize';
import { MS_PER_DAY, DEFAULT_DAYS, MAX_HISTORY_DAYS, cacheKey as ck } from '../constants';
import type { Activity } from '../types';

const router = Router();

router.get('/insights', apiLimiter, async (req, res) => {
  try {
    const { sessionId, days } = req.query as { sessionId?: string; days?: string };
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const safeSid = escHtml(sessionId);
    const dayCount = Math.min(parseInt(days ?? String(DEFAULT_DAYS)) || DEFAULT_DAYS, MAX_HISTORY_DAYS);
    const insightsCacheKey = ck.insights(safeSid, dayCount);

    const cached = cache.get(insightsCacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);

    const since = new Date(Date.now() - dayCount * MS_PER_DAY);
    const activities = await getActivitiesSince(safeSid, since);
    const { totals, grandTotal } = aggregateByCategory(activities);
    const top = topCategory(totals);

    const dailyMap: Record<string, number> = {};
    for (const act of activities) {
      const ts = act.timestamp ?? act.createdAt?.toDate?.().getTime() ?? Date.now();
      const date = new Date(ts).toISOString().slice(0, 10);
      dailyMap[date] = (dailyMap[date] ?? 0) + act.co2;
    }
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, co2]) => ({ date, co2: parseFloat(co2.toFixed(2)) }));

    const payload = { periodDays: dayCount, grandTotal, totals, topCategory: top, daily, activityCount: activities.length };
    cache.set(insightsCacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error('[insights]', err);
    return res.status(500).json({ error: 'Failed to compute insights' });
  }
});

router.get('/compare', apiLimiter, async (req, res) => {
  try {
    const { sessionId, days } = req.query as { sessionId?: string; days?: string };
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const safeSid = escHtml(sessionId);
    const dayCount = Math.min(parseInt(days ?? String(DEFAULT_DAYS)) || DEFAULT_DAYS, MAX_HISTORY_DAYS);
    const compareCacheKey = ck.compare(safeSid, dayCount);

    const cached = cache.get(compareCacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);

    const since = new Date(Date.now() - dayCount * MS_PER_DAY);
    const activities: Activity[] = await getActivitiesSince(safeSid, since);
    const { grandTotal } = aggregateByCategory(activities);
    const monthlyEquivalent = parseFloat((grandTotal * (30 / dayCount)).toFixed(2));
    const comparison = compareToAverages(monthlyEquivalent);

    const payload = { periodDays: dayCount, grandTotal, monthlyEquivalent, averages: AVERAGES, comparison };
    cache.set(compareCacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error('[compare]', err);
    return res.status(500).json({ error: 'Failed to compare footprint' });
  }
});

router.get('/actions', apiLimiter, (req, res) => {
  const { category } = req.query as { category?: string };
  let actions = ACTIONS;
  if (category) {
    actions = ACTIONS.filter(a => a.category === category);
  }
  const sorted = [...actions].sort((a, b) => b.impact_kg_month - a.impact_kg_month);
  return res.json({ actions: sorted });
});

export default router;
