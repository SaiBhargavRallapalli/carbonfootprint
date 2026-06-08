'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const compression = require('compression');
const path       = require('path');

const { requestLogger, validateEnvironment } = require('./middleware/index');
const configRoutes   = require('./routes/config');
const trackingRoutes = require('./routes/tracking');
const insightsRoutes = require('./routes/insights');
const aiRoutes       = require('./routes/ai');

validateEnvironment();

const app  = express();
const PORT = process.env.PORT || 8080;
const isProd = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", 'https://cdn.jsdelivr.net', 'https://www.gstatic.com'],
      styleSrc:    ["'self'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      connectSrc:  ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Static files
const staticOpts = isProd ? { maxAge: '1d' } : {};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

// API routes
app.use('/api', configRoutes);
app.use('/api', trackingRoutes);
app.use('/api', insightsRoutes);
app.use('/api', aiRoutes);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`EcoSage running on port ${PORT}`));
}

module.exports = app;
