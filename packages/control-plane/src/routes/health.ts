import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

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

    const memUsage = process.memoryUsage();
    const cpus = os.cpus();

    let ledgerStatus = 'NOT_FOUND';
    const ledgerDir = path.join(ROOT, '.agent', 'ledger');
    if (fs.existsSync(ledgerDir)) {
      const files = fs.readdirSync(ledgerDir).filter(f => f.endsWith('.json'));
      if (files.length > 0) {
        const latestLedger = path.join(ledgerDir, files.sort().reverse()[0]);
        try {
          const ledger = JSON.parse(fs.readFileSync(latestLedger, 'utf-8'));
          ledgerStatus = ledger.execution_state || ledger.status || 'IN_PROGRESS';
        } catch { ledgerStatus = 'PARSE_ERROR'; }
      }
    }

    let attestationStaleness: Record<string, unknown> = {};
    const ledgerFiles = fs.existsSync(ledgerDir) ? fs.readdirSync(ledgerDir).filter(f => f.endsWith('.json')) : [];
    if (ledgerFiles.length > 0) {
      try {
        const ledger = JSON.parse(fs.readFileSync(path.join(ledgerDir, ledgerFiles[0]), 'utf-8'));
        const attestations = ledger.attestations || [];
        const unbound = attestations.filter((a: Record<string, unknown>) => a.status !== 'BOUND');
        if (unbound.length > 0) {
          attestationStaleness = { stale: true, unboundCount: unbound.length, unboundProfiles: unbound.map((a: Record<string, unknown>) => a.profile) };
        } else {
          attestationStaleness = { stale: false, unboundCount: 0 };
        }
      } catch { attestationStaleness = { stale: true, unboundCount: -1, error: 'parse_failed' }; }
    }

    res.json({
      ok: true,
      status: 'healthy',
      commit,
      manifestHash,
      ledgerStatus,
      ledgerFiles: ledgerFiles.length,
      attestationStaleness,
      fileStatus,
      dirStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
        cpus: cpus.length,
        cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        },
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        loadAvg: os.loadavg().map(v => Math.round(v * 100) / 100),
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
