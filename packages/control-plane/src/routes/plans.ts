import { Router, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function findRoot(): string {
  let dir = path.resolve(__dirname, '..', '..', '..');
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}

const router = Router();

router.get('/:planId', (req, res) => {
  try {
    const ROOT = findRoot();
    const planId = req.params.planId;
    const ledgerPath = path.join(ROOT, '.agent', 'ledger', planId + '.json');

    if (!fs.existsSync(ledgerPath)) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    const ledgerRaw = fs.readFileSync(ledgerPath, 'utf-8');
    const ledger = JSON.parse(ledgerRaw);

    const planDir = path.join(ROOT, '.agent', 'plans', planId);
    const originalPath = path.join(planDir, 'original.md');
    let originalSha256: string | null = null;
    if (fs.existsSync(originalPath)) {
      originalSha256 = crypto.createHash('sha256').update(fs.readFileSync(originalPath)).digest('hex');
    }

    res.json({
      planId,
      originalSha256: originalSha256 || ledger.effective_plan_identity?.original_sha256 || null,
      effectiveSha256: ledger.effective_plan_identity?.sha256 || null,
      amendments: (ledger.amendments || []).map((a: Record<string, unknown>) => ({
        id: a.amendment_id || a.id,
        sha256: a.sha256,
      })),
      status: ledger.execution_state || ledger.status || 'unknown',
      reconciliations: (ledger.reconciliations || []).slice(-5),
      attestations: ledger.attestations || [],
      findings: (ledger.findings || ledger.orphanFindings || []).filter((f: Record<string, unknown>) =>
        typeof f.status === 'string' && f.status.includes('OPEN')
      ),
      auditEvents: (ledger.audit_events || []).slice(-10),
      shadowRevision: ledger.shadow_revision || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
