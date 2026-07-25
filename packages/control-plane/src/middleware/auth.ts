import { Request, Response, NextFunction } from 'express';

const MUTATION_PATHS = ['/api/mutation', '/api/runs/record-run', '/api/runs/import-telemetry'];
const READ_PATHS = ['/api/config/file', '/api/runs', '/api/runs/telemetry', '/api/audit'];

function isMutationPath(reqPath: string): boolean {
  return MUTATION_PATHS.some(p => reqPath.startsWith(p));
}

function isSensitiveReadPath(reqPath: string): boolean {
  return READ_PATHS.some(p => reqPath.startsWith(p));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') {
    next();
    return;
  }

  const API_KEY = process.env.CONTROL_PLANE_API_KEY;

  if (!API_KEY) {
    next();
    return;
  }

  const needsAuth = isMutationPath(req.path) || isSensitiveReadPath(req.path);
  if (!needsAuth) {
    next();
    return;
  }

  const providedKey = req.headers['x-api-key'];
  if (providedKey === API_KEY) {
    next();
    return;
  }

  res.status(401).json({ ok: false, error: 'Unauthorized' });
}
