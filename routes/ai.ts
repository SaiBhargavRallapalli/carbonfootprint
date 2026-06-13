import { Router } from 'express';
import { chat, generateTips } from '../services/gemini';
import { getActivitiesSince } from '../services/firestore';
import { aggregateByCategory, topCategory } from '../services/carbonEngine';
import * as cache from '../services/cache';
import { chatLimiter, apiLimiter } from '../middleware/rateLimiters';
import { escHtml } from '../utils/sanitize';
import type { CarbonProfile } from '../types';

const router = Router();

async function buildProfile(sessionId: string): Promise<CarbonProfile> {
  const since = new Date(Date.now() - 30 * 86400000);
  const activities = await getActivitiesSince(sessionId, since);
  const { totals, grandTotal } = aggregateByCategory(activities);
  const topCat = topCategory(totals);
  return { totals, grandTotal, topCat, recentActivities: activities.slice(0, 10) };
}

router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const { sessionId, message, history } = req.body as {
      sessionId?: unknown;
      message?: unknown;
      history?: unknown;
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'message too long (max 2000 chars)' });
    }

    const safeMessage = escHtml(message.trim());
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const profile = await buildProfile(escHtml(sessionId));
    const reply = await chat(safeMessage, safeHistory, profile);

    return res.json({ reply });
  } catch (err) {
    console.error('[chat]', err);
    return res.status(500).json({ error: 'AI assistant is temporarily unavailable' });
  }
});

router.get('/tips', apiLimiter, async (req, res) => {
  try {
    const { sessionId } = req.query as { sessionId?: string };
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const safeSid = escHtml(sessionId);
    const cacheKey = `tips:${safeSid}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);

    const profile = await buildProfile(safeSid);
    const tips = await generateTips(profile);

    const payload = { tips };
    cache.set(cacheKey, payload, 300_000);
    return res.json(payload);
  } catch (err) {
    console.error('[tips]', err);
    return res.status(500).json({ error: 'Failed to generate tips' });
  }
});

export default router;
