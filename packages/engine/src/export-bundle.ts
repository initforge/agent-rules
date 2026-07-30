import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SecureFsRoot } from './secure-fs.js';
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

/** Validate planId: safe path segment, no traversal, no slashes. */
function assertSafePlanId(id: string): void {
  if (!id || typeof id !== 'string') throw new Error(`Invalid planId: must be non-empty string`);
  if (/[/\\]/.test(id)) throw new Error(`Invalid planId: must not contain path separators: ${id}`);
  if (/\.\./.test(id)) throw new Error(`Invalid planId: must not contain parent traversal: ${id}`);
  if (/[\x00-\x1f]/.test(id)) throw new Error(`Invalid planId: must not contain control characters: ${id}`);
}

export async function exportPlanBundle(planDir: string): Promise<PlanBundle> {
  const resolved = path.resolve(planDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Plan directory does not exist: ${planDir}`);
  }

  const root = new SecureFsRoot(resolved);

  const originalBytes = await root.readBinary('original.md');
  const originalSha256 = sha256Bytes(originalBytes);

  const planBytes: Buffer[] = [Buffer.from(originalBytes)];
  const amendments: Array<{ id: string; sha256: string }> = [];

  if (await root.exists('amendments')) {
    const entries = await root.readdir('amendments');
    for (const entry of entries.sort()) {
      const st = await root.stat(path.join('amendments', entry));
      if (!st.isFile()) continue;
      const bytes = await root.readBinary(path.join('amendments', entry));
      const id = entry.replace(/\.(md|json|yaml)$/i, '');
      amendments.push({ id, sha256: sha256Bytes(bytes) });
      planBytes.push(Buffer.from(bytes));
    }
  }

  const effectiveBytes = Buffer.concat(planBytes);
  const effectivePlanSha256 = sha256Bytes(new Uint8Array(effectiveBytes));

  const receipts: Array<{ assignmentId: string; receipt: unknown }> = [];
  if (await root.exists('ledger.json')) {
    const ledgerRaw = JSON.parse(await root.readUtf8('ledger.json')) as { receipts?: WorkerReceipt[] };
    if (ledgerRaw.receipts) {
      for (const r of ledgerRaw.receipts) {
        receipts.push({ assignmentId: r.assignmentId, receipt: r });
      }
    }
  }

  const lineage: Array<{ artifact: string; sha256: string }> = [];
  if (await root.exists('lineage')) {
    const entries = await root.readdir('lineage');
    for (const entry of entries.sort()) {
      const st = await root.stat(path.join('lineage', entry));
      if (!st.isFile()) continue;
      const bytes = await root.readBinary(path.join('lineage', entry));
      lineage.push({ artifact: entry, sha256: sha256Bytes(bytes) });
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
    try { assertSafePlanId(bundle.planId); } catch (e: any) {
      return { success: false, error: `Invalid bundle: ${e.message}` };
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

    const root = new SecureFsRoot(resolved);
    const amendmentDir = 'amendments';
    const lineageDir = 'lineage';

    const originalBytes = await root.readBinary('original.md');
    const actualOriginalSha = sha256Bytes(originalBytes);
    if (actualOriginalSha !== bundle.originalSha256) {
      return { success: false, error: `original.md SHA-256 mismatch: expected ${bundle.originalSha256}, got ${actualOriginalSha}` };
    }

    for (const amendment of bundle.amendments) {
      const amPath = path.join(amendmentDir, `${amendment.id}.md`);
      if (await root.exists(amPath)) {
        const bytes = await root.readBinary(amPath);
        const actualSha = sha256Bytes(bytes);
        if (actualSha !== amendment.sha256) {
          return { success: false, error: `Amendment ${amendment.id} SHA-256 mismatch: expected ${amendment.sha256}, got ${actualSha}` };
        }
      }
    }

    const allPlanBytes: Buffer[] = [Buffer.from(originalBytes)];
    for (const amendment of bundle.amendments) {
      const amPath = path.join(amendmentDir, `${amendment.id}.md`);
      if (await root.exists(amPath)) {
        allPlanBytes.push(Buffer.from(await root.readBinary(amPath)));
      }
    }
    const effectiveBytes = Buffer.concat(allPlanBytes);
    const actualEffectiveSha = sha256Bytes(new Uint8Array(effectiveBytes));
    if (actualEffectiveSha !== bundle.effectivePlanSha256) {
      return { success: false, error: `Effective plan SHA-256 mismatch: expected ${bundle.effectivePlanSha256}, got ${actualEffectiveSha}` };
    }

    if (!(await root.exists(amendmentDir))) {
      fs.mkdirSync(path.join(resolved, amendmentDir), { mode: 0o700 });
    }
    if (!(await root.exists(lineageDir))) {
      fs.mkdirSync(path.join(resolved, lineageDir), { mode: 0o700 });
    }

    const bundleContent = JSON.stringify(bundle, null, 2);
    await root.writeAll('bundle.json', new TextEncoder().encode(bundleContent));

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
