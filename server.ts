import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import path from 'path';

import { requestLogger, validateEnvironment } from './middleware/index';
import configRoutes   from './routes/config';
import trackingRoutes from './routes/tracking';
import insightsRoutes from './routes/insights';
import aiRoutes       from './routes/ai';

validateEnvironment();

const app  = express();
const PORT = process.env.PORT ?? '8080';
const isProd = process.env.NODE_ENV === 'production';

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
  /* c8 ignore next */
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? '*',
  methods: ['GET', 'POST'],
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

/* c8 ignore next */
const staticOpts = isProd ? { maxAge: '1d' } : {};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

app.use('/api', configRoutes);
app.use('/api', trackingRoutes);
app.use('/api', insightsRoutes);
app.use('/api', aiRoutes);

app.use((_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

/* c8 ignore next 4 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  /* istanbul ignore next */
  app.listen(PORT, () => console.log(`EcoSage running on port ${PORT}`));
}

export default app;
