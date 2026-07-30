import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

const MUTATION_PATHS = ['/api/mutation', '/api/runs/record-run', '/api/runs/import-telemetry'];
const SENSITIVE_PATHS = ['/api/config/file', '/api/runs', '/api/runs/telemetry', '/api/audit'];

function matchesPath(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path.startsWith(p));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') {
    next();
    return;
  }

  const API_KEY = process.env.CONTROL_PLANE_API_KEY;
  const remoteIp = req.socket.remoteAddress || '';
  const fromLoopback = isLoopback(remoteIp);

  if (API_KEY) {
    const providedKey = req.headers['x-api-key'] as string | undefined;
    if (!providedKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized: x-api-key header required' });
      return;
    }
    try {
      const keyBuf = Buffer.from(API_KEY);
      const providedBuf = Buffer.from(providedKey);
      if (keyBuf.length !== providedBuf.length || !crypto.timingSafeEqual(keyBuf, providedBuf)) {
        res.status(401).json({ ok: false, error: 'Unauthorized' });
        return;
      }
    } catch {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    next();
    return;
  }

  if (!fromLoopback) {
    res.status(401).json({ ok: false, error: 'Unauthorized: loopback connection required when no API key configured' });
    return;
  }

  next();
}
