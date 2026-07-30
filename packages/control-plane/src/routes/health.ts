import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const router = Router();
const ROOT = findRoot();
const START_TIME = Date.now();

router.get('/', (_req, res) => {
  try {
    const manifestExists = fs.existsSync(path.join(ROOT, 'rules', 'manifest.yaml'))
    if (!manifestExists) {
      res.json({
        ok: false,
        status: 'unhealthy',
        error: 'rules/manifest.yaml missing',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
      })
      return
    }

    res.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      status: 'error',
      error: String(err),
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
    });
  }
});

export default router;
