import { Router } from 'express';
import { calculateCO2 } from '../services/carbonEngine';
import { logActivity, getHistory } from '../services/firestore';
import * as cache from '../services/cache';
import { apiLimiter } from '../middleware/rateLimiters';
import { escHtml } from '../utils/sanitize';
import {
  MAX_SESSION_ID_LEN, MAX_TIMESTAMP_FUTURE_MS, MS_PER_DAY, MAX_HISTORY_DAYS,
  DEFAULT_LIMIT, MAX_LIMIT, cacheKey as ck,
} from '../constants';

const router = Router();

router.post('/log', apiLimiter, async (req, res) => {
  try {
    const { sessionId, category, type, quantity, timestamp } = req.body as {
      sessionId?: unknown;
      category?: unknown;
      type?: unknown;
      quantity?: unknown;
      timestamp?: unknown;
    };

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > MAX_SESSION_ID_LEN) {
      return res.status(400).json({ error: 'sessionId is required (string, max 128 chars)' });
    }
    if (!category || !type) {
      return res.status(400).json({ error: 'category and type are required' });
    }
    const qty = parseFloat(String(quantity));
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative number' });
    }

    const { co2, unit, label } = calculateCO2(String(category), String(type), qty);
    const safeLabel = escHtml(label);

    let ts = Date.now();
    if (timestamp !== undefined) {
      const parsed = typeof timestamp === 'number' ? timestamp : new Date(String(timestamp)).getTime();
      const now = Date.now();
      if (!isFinite(parsed) || parsed > now + MAX_TIMESTAMP_FUTURE_MS || parsed < now - MAX_HISTORY_DAYS * MS_PER_DAY) {
        return res.status(400).json({ error: 'timestamp must be within the past year and not in the future' });
      }
      ts = parsed;
    }

    const activity = {
      category: escHtml(category) as import('../types').Category,
      type:     escHtml(type),
      quantity: qty,
      co2,
      unit,
      label:    safeLabel,
      timestamp: ts,
    };

    const safeSid = escHtml(sessionId);
    const result = await logActivity(safeSid, activity);

    cache.delByPrefix(ck.insightsPrefix(safeSid));
    cache.delByPrefix(ck.comparePrefix(safeSid));

    return res.status(201).json({ id: result.id, co2, label: safeLabel, unit });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unknown')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[log]', err);
    return res.status(500).json({ error: 'Failed to log activity' });
  }
});

router.get('/history', apiLimiter, async (req, res) => {
  try {
    const { sessionId, limit } = req.query as { sessionId?: string; limit?: string };
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const limitCount = Math.min(parseInt(limit ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT, MAX_LIMIT);
    const activities = await getHistory(escHtml(sessionId), limitCount);
    return res.json({ activities });
  } catch (err) {
    console.error('[history]', err);
    return res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

export default router;
