import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
}

export function validateEnvironment(): void {
  const optionalWithFallback = ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID'];
  const missing = optionalWithFallback.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn(`[ENV] Running in demo mode — missing: ${missing.join(', ')}`);
  }
}
