'use strict';

const { Router } = require('express');
const { chat, generateTips } = require('../services/gemini');
const { getActivitiesSince } = require('../services/firestore');
const { aggregateByCategory, topCategory } = require('../services/carbonEngine');
const cache = require('../services/cache');
const { chatLimiter, apiLimiter } = require('../middleware/rateLimiters');

const router = Router();

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function buildProfile(sessionId) {
  const since = new Date(Date.now() - 30 * 86400000);
  const activities = await getActivitiesSince(sessionId, since);
  const { totals, grandTotal } = aggregateByCategory(activities);
  const topCat = topCategory(totals);
  return { totals, grandTotal, topCat, recentActivities: activities.slice(0, 10) };
}

// POST /api/chat
router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const { sessionId, message, history } = req.body;

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

    res.json({ reply });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: 'AI assistant is temporarily unavailable' });
  }
});

// GET /api/tips?sessionId=
router.get('/tips', apiLimiter, async (req, res) => {
  try {
    const { sessionId } = req.query;
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
    cache.set(cacheKey, payload, 300_000); // 5 min cache for tips
    res.json(payload);
  } catch (err) {
    console.error('[tips]', err);
    res.status(500).json({ error: 'Failed to generate tips' });
  }
});

module.exports = router;
