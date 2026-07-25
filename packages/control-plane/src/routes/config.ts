import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import * as reader from '../services/reader';

function findRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}
const ROOT = findRoot();

const router = Router();

router.get('/all', (_req, res) => {
  try {
    const data = reader.readAll();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/platforms', (_req, res) => {
  try {
    const platforms = reader.readPlatforms();
    res.json({ ok: true, data: platforms });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/skills', (_req, res) => {
  try {
    const skills = reader.readSkills();
    res.json({ ok: true, data: skills });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/profiles', (_req, res) => {
  try {
    const profiles = reader.readProfiles();
    res.json({ ok: true, data: profiles });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/agents', (_req, res) => {
  try {
    const agents = reader.readAgents();
    res.json({ ok: true, data: agents });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/file', (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ ok: false, error: 'path query parameter required' });
      return;
    }
    const ext = path.extname(filePath);
    let data: unknown;
    if (ext === '.json') {
      data = reader.readRawJson(filePath);
    } else if (ext === '.yaml' || ext === '.yml') {
      data = reader.readRawYaml(filePath);
    } else {
      data = fs.readFileSync(path.resolve(ROOT, filePath), 'utf-8');
    }
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
