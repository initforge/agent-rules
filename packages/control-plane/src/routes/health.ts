import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

router.get('/', (_req, res) => {
  try {
    const gitHead = path.join(ROOT, '.git', 'HEAD');
    let commit = 'unknown';
    if (fs.existsSync(gitHead)) {
      const ref = fs.readFileSync(gitHead, 'utf-8').trim();
      if (ref.startsWith('ref: ')) {
        const refPath = path.join(ROOT, '.git', ref.slice(5));
        if (fs.existsSync(refPath)) {
          commit = fs.readFileSync(refPath, 'utf-8').trim();
        }
      } else {
        commit = ref;
      }
    }

    const manifestHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'rules', 'manifest.yaml'))).digest('hex').slice(0, 12);

    const paths = [
      'rules/manifest.yaml',
      'integrations/registry.json',
      'profiles/manifest.yaml',
      'automation/model-policy.json',
      'automation/trigger-audit.json',
    ];

    const fileStatus: Record<string, { exists: boolean; size: number }> = {};
    for (const p of paths) {
      const full = path.join(ROOT, p);
      if (fs.existsSync(full)) {
        const stat = fs.statSync(full);
        fileStatus[p] = { exists: true, size: stat.size };
      } else {
        fileStatus[p] = { exists: false, size: 0 };
      }
    }

    const dirs = ['rules', 'skills', 'integrations', 'platforms', 'profiles', 'automation'];
    const dirStatus: Record<string, { exists: boolean; entryCount: number }> = {};
    for (const d of dirs) {
      const full = path.join(ROOT, d);
      if (fs.existsSync(full)) {
        dirStatus[d] = { exists: true, entryCount: fs.readdirSync(full).length };
      } else {
        dirStatus[d] = { exists: false, entryCount: 0 };
      }
    }

    res.json({
      ok: true,
      status: 'healthy',
      commit,
      manifestHash,
      fileStatus,
      dirStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
