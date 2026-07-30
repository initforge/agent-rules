import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkerReceipt } from './contracts.js';

export interface PlanBundle {
  formatVersion: string;
  planId: string;
  originalSha256: string;
  effectivePlanSha256: string;
  amendments: Array<{ id: string; sha256: string }>;
  receipts: Array<{ assignmentId: string; receipt: unknown }>;
  lineage: Array<{ artifact: string; sha256: string }>;
  exportedAt: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export async function exportPlanBundle(planDir: string): Promise<PlanBundle> {
  const resolved = path.resolve(planDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Plan directory does not exist: ${planDir}`);
  }

  const originalPath = path.join(resolved, 'original.md');
  if (!fs.existsSync(originalPath)) {
    throw new Error(`original.md not found in plan directory: ${planDir}`);
  }

  const originalBytes = fs.readFileSync(originalPath);
  const originalSha256 = sha256Bytes(new Uint8Array(originalBytes));

  const amendmentDir = path.join(resolved, 'amendments');
  const amendments: Array<{ id: string; sha256: string }> = [];

  const planBytes: Buffer[] = [originalBytes];

  if (fs.existsSync(amendmentDir)) {
    const entries = fs.readdirSync(amendmentDir).sort();
    for (const entry of entries) {
      const entryPath = path.join(amendmentDir, entry);
      if (fs.statSync(entryPath).isFile()) {
        const bytes = fs.readFileSync(entryPath);
        const id = entry.replace(/\.(md|json|yaml)$/i, '');
        amendments.push({ id, sha256: sha256Bytes(new Uint8Array(bytes)) });
        planBytes.push(bytes);
      }
    }
  }

  const effectiveBytes = Buffer.concat(planBytes);
  const effectivePlanSha256 = sha256Bytes(new Uint8Array(effectiveBytes));

  const ledgerPath = path.join(resolved, 'ledger.json');
  const receipts: Array<{ assignmentId: string; receipt: unknown }> = [];
  if (fs.existsSync(ledgerPath)) {
    const ledgerRaw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as { receipts?: WorkerReceipt[] };
    if (ledgerRaw.receipts) {
      for (const r of ledgerRaw.receipts) {
        receipts.push({ assignmentId: r.assignmentId, receipt: r });
      }
    }
  }

  const lineage: Array<{ artifact: string; sha256: string }> = [];
  const lineageDir = path.join(resolved, 'lineage');
  if (fs.existsSync(lineageDir)) {
    const entries = fs.readdirSync(lineageDir).sort();
    for (const entry of entries) {
      const entryPath = path.join(lineageDir, entry);
      if (fs.statSync(entryPath).isFile()) {
        const bytes = fs.readFileSync(entryPath);
        lineage.push({ artifact: entry, sha256: sha256Bytes(new Uint8Array(bytes)) });
      }
    }
  }

  return {
    formatVersion: '1.0',
    planId: path.basename(resolved),
    originalSha256,
    effectivePlanSha256,
    amendments,
    receipts,
    lineage,
    exportedAt: new Date().toISOString(),
  };
}

export async function importPlanBundle(
  bundle: PlanBundle,
  planDir: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resolved = path.resolve(planDir);
    ensureDir(resolved);

    if (typeof bundle.formatVersion !== 'string' || bundle.formatVersion.length === 0) {
      return { success: false, error: 'Invalid bundle: formatVersion is required' };
    }
    if (typeof bundle.planId !== 'string' || bundle.planId.length === 0) {
      return { success: false, error: 'Invalid bundle: planId is required' };
    }
    if (!/^[a-f0-9]{64}$/.test(bundle.originalSha256)) {
      return { success: false, error: 'Invalid bundle: originalSha256 must be a valid SHA-256' };
    }
    if (!/^[a-f0-9]{64}$/.test(bundle.effectivePlanSha256)) {
      return { success: false, error: 'Invalid bundle: effectivePlanSha256 must be a valid SHA-256' };
    }
    if (!Array.isArray(bundle.amendments)) {
      return { success: false, error: 'Invalid bundle: amendments must be an array' };
    }
    if (!Array.isArray(bundle.receipts)) {
      return { success: false, error: 'Invalid bundle: receipts must be an array' };
    }
    if (!Array.isArray(bundle.lineage)) {
      return { success: false, error: 'Invalid bundle: lineage must be an array' };
    }

    const amendmentDir = path.join(resolved, 'amendments');
    const lineageDir = path.join(resolved, 'lineage');

    const originalPath = path.join(resolved, 'original.md');
    if (!fs.existsSync(originalPath)) {
      return { success: false, error: `original.md not found in ${planDir}. Verify it exists or create it first.` };
    }

    const originalBytes = fs.readFileSync(originalPath);
    const actualOriginalSha = sha256Bytes(new Uint8Array(originalBytes));
    if (actualOriginalSha !== bundle.originalSha256) {
      return { success: false, error: `original.md SHA-256 mismatch: expected ${bundle.originalSha256}, got ${actualOriginalSha}` };
    }

    for (const amendment of bundle.amendments) {
      const amPath = path.join(amendmentDir, `${amendment.id}.md`);
      if (fs.existsSync(amPath)) {
        const bytes = fs.readFileSync(amPath);
        const actualSha = sha256Bytes(new Uint8Array(bytes));
        if (actualSha !== amendment.sha256) {
          return { success: false, error: `Amendment ${amendment.id} SHA-256 mismatch: expected ${amendment.sha256}, got ${actualSha}` };
        }
      }
    }

    const allPlanBytes: Buffer[] = [originalBytes];
    for (const amendment of bundle.amendments) {
      const amPath = path.join(amendmentDir, `${amendment.id}.md`);
      if (fs.existsSync(amPath)) {
        allPlanBytes.push(fs.readFileSync(amPath));
      }
    }
    const effectiveBytes = Buffer.concat(allPlanBytes);
    const actualEffectiveSha = sha256Bytes(new Uint8Array(effectiveBytes));
    if (actualEffectiveSha !== bundle.effectivePlanSha256) {
      return { success: false, error: `Effective plan SHA-256 mismatch: expected ${bundle.effectivePlanSha256}, got ${actualEffectiveSha}` };
    }

    ensureDir(amendmentDir);
    ensureDir(lineageDir);

    const bundleContent = JSON.stringify(bundle, null, 2);
    fs.writeFileSync(path.join(resolved, 'bundle.json'), bundleContent, 'utf-8');

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
