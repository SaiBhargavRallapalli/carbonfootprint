import { Router } from 'express';
import { chat, generateTips } from '../services/gemini';
import { getRepository } from '../repository';
import { aggregateByCategory, topCategory } from '../services/carbonEngine';
import * as cache from '../services/cache';
import { chatLimiter, apiLimiter } from '../middleware/rateLimiters';
import { escHtml } from '../utils/sanitize';
import {
  MS_PER_DAY, DEFAULT_DAYS, MAX_MESSAGE_LEN, MAX_HISTORY_TURNS, TIPS_CACHE_TTL_MS,
  MAX_RECENT_ACTIVITIES, cacheKey as ck,
} from '../constants';
import type { CarbonProfile, GeminiContent } from '../types';

const router = Router();

function isGeminiContent(h: unknown): h is GeminiContent {
  if (typeof h !== 'object' || h === null) return false;
  const item = h as Record<string, unknown>;
  if (item.role !== 'user' && item.role !== 'model') return false;
  if (!Array.isArray(item.parts)) return false;
  return item.parts.every(
    p => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).text === 'string',
  );
}

async function buildProfile(sessionId: string): Promise<CarbonProfile> {
  const since = new Date(Date.now() - DEFAULT_DAYS * MS_PER_DAY);
  const activities = await getRepository().getActivitiesSince(sessionId, since);
  const { totals, grandTotal } = aggregateByCategory(activities);
  const topCat = topCategory(totals);
  return { totals, grandTotal, topCat, recentActivities: activities.slice(0, MAX_RECENT_ACTIVITIES) };
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
    if (message.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: `message too long (max ${MAX_MESSAGE_LEN} chars)` });
    }

    const safeMessage = escHtml(message.trim());
    const safeHistory: GeminiContent[] = Array.isArray(history)
      ? history.slice(-MAX_HISTORY_TURNS).filter(isGeminiContent)
      : [];
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
    const tipsCacheKey = ck.tips(safeSid);
    const cached = cache.get(tipsCacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);

    const profile = await buildProfile(safeSid);
    const tips = await generateTips(profile);

    const payload = { tips };
    cache.set(tipsCacheKey, payload, TIPS_CACHE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    console.error('[tips]', err);
    return res.status(500).json({ error: 'Failed to generate tips' });
  }
});

export default router;
