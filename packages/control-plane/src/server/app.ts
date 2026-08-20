import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import configRouter from '../routes/config.js';
import mutationRouter from '../routes/mutation.js';
import healthRouter from '../routes/health.js';
import runsRouter from '../routes/runs.js';
import auditRouter from '../routes/audit.js';
import plansRouter from '../routes/plans.js';
import c4Router from '../routes/c4.js';
import m11Router from '../routes/m11.js';
import authorityRouter from '../routes/authority.js';
import evidenceRouter from '../routes/evidence.js';
import hostsRouter from '../routes/hosts.js';
import { authMiddleware } from '../middleware/auth.js';

const app = express();

const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = process.env.NODE_ENV === 'test' ? 9999 : 120
const rateCounters = new Map<string, { count: number; resetAt: number }>()

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  let entry = rateCounters.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
    rateCounters.set(key, entry)
  }
  entry.count++
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX - entry.count)))
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ ok: false, error: 'Too Many Requests' })
    return
  }
  next()
}

app.set('x-powered-by', false);
app.set('trust proxy', false); // loopback-only trust; avoid spoofing via X-Forwarded-For

function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: http:; frame-src 'none'; object-src 'none'")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  next()
}

app.use(securityHeaders);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '500kb' }));
app.use(rateLimit);

app.use(authMiddleware);

app.use('/api/config', configRouter);
app.use('/api/mutation', mutationRouter);
app.use('/api/health', healthRouter);
app.use('/api/runs', runsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/plans', plansRouter);
app.use('/api/c4', c4Router);
app.use('/api/m11', m11Router);
app.use('/api/authority', authorityRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/hosts', hostsRouter);

app.use(express.static(path.join(__dirname, '..', '..', 'client')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'client', 'index.html'));
});

export { app };
