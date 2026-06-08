'use strict';

const { Router } = require('express');
const { calculateCO2 } = require('../services/carbonEngine');
const { logActivity, getHistory } = require('../services/firestore');
const cache = require('../services/cache');
const { apiLimiter } = require('../middleware/rateLimiters');

const router = Router();

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// POST /api/log — record an activity
router.post('/log', apiLimiter, async (req, res) => {
  try {
    const { sessionId, category, type, quantity, timestamp } = req.body;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
      return res.status(400).json({ error: 'sessionId is required (string, max 128 chars)' });
    }
    if (!category || !type) {
      return res.status(400).json({ error: 'category and type are required' });
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative number' });
    }

    const { co2, unit, label } = calculateCO2(category, type, qty);
    const safeLabel = escHtml(label);

    const activity = {
      category: escHtml(category),
      type:     escHtml(type),
      quantity: qty,
      co2,
      unit,
      label:    safeLabel,
      timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
    };

    const result = await logActivity(escHtml(sessionId), activity);

    // Bust cached insights for this session
    cache.del(`insights:${sessionId}`);
    cache.del(`compare:${sessionId}`);

    res.status(201).json({ id: result.id, co2, label: safeLabel, unit });
  } catch (err) {
    if (err.message.startsWith('Unknown')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[log]', err);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// GET /api/history?sessionId=&limit=
router.get('/history', apiLimiter, async (req, res) => {
  try {
    const { sessionId, limit } = req.query;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query param required' });
    }
    const limitCount = Math.min(parseInt(limit) || 50, 100);
    const activities = await getHistory(escHtml(sessionId), limitCount);
    res.json({ activities });
  } catch (err) {
    console.error('[history]', err);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

module.exports = router;
