import { Router, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import * as reader from '../services/reader.js';
import { safeResolve, checkCanonicalAllowlist } from '../services/safety.js';

const router = Router();

function apiError(res: Response, code: number, err: unknown): void {
  if (err instanceof Error) {
    if (err.message.includes('Path traversal') || err.message.includes('not allowed') || err.message.includes('allowlist')) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }
  }
  res.status(code).json({ ok: false, error: 'An internal error occurred' });
}

router.get('/all', (_req, res) => {
  try {
    const data = reader.readAll();
    res.json({ ok: true, data });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/platforms', (_req, res) => {
  try {
    const platforms = reader.readPlatforms();
    res.json({ ok: true, data: platforms });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/skills', (_req, res) => {
  try {
    const skills = reader.readSkills();
    res.json({ ok: true, data: skills });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/profiles', (_req, res) => {
  try {
    const profiles = reader.readProfiles();
    res.json({ ok: true, data: profiles });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/agents', (_req, res) => {
  try {
    const agents = reader.readAgents();
    res.json({ ok: true, data: agents });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/file', (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ ok: false, error: 'path query parameter required' });
      return;
    }
    safeResolve(filePath);
    const ext = path.extname(filePath);
    let data: unknown;
    if (ext === '.json') {
      data = reader.readRawJson(filePath);
    } else if (ext === '.yaml' || ext === '.yml') {
      data = reader.readRawYaml(filePath);
    } else {
      checkCanonicalAllowlist(filePath);
      data = fs.readFileSync(safeResolve(filePath), 'utf-8');
    }
    res.json({ ok: true, data });
  } catch (err) {
    apiError(res, 500, err);
  }
});

export default router;
