import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isSha256, sha256Bytes, type Sha256 } from './contracts.js';
import type { ReconciliationEntry, OrphanFinding, ReviewReceipt, WorkLedger, RepairSlice, WorkLedgerStatus } from './contracts.js';

export { type Sha256, isSha256, sha256Bytes } from './contracts.js';

export interface PlanIdentity {
  planId: string;
  originalSha256: string;
  amendmentIds: string[];
  effectivePlanSha256: string;
}

export interface PlanAnchor {
  planSha256: string;
  sectionHeading: string;
  lineStart: number;
  lineEnd: number;
  anchorTextSha256: string;
  requirementId: string;
}

export interface Reconciliation {
  status: 'MATCH' | 'SUPERSEDED' | 'PARTIAL' | 'MISSING' | 'DEVIATED' | 'EXTRA' | 'FAILED';
  reconciledAgainst: { originalSha: string; effectiveSha: string; ledgerRevision: number };
  detail: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const AGENT_PLANS_DIR = '.agent/plans';

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function adoptPlan(sourcePath: string, planId: string, plansDir: string = AGENT_PLANS_DIR): PlanIdentity {
  requireValue(typeof sourcePath === 'string' && sourcePath.length > 0, 'sourcePath must be non-empty');
  requireValue(typeof planId === 'string' && planId.length > 0, 'planId must be non-empty');

  const resolved = path.resolve(sourcePath);
  requireValue(fs.existsSync(resolved), `Source path does not exist: ${sourcePath}`);

  const rawBytes = fs.readFileSync(resolved);
  const originalSha256 = sha256Bytes(rawBytes);

  // `plansDir` is injectable so tests do not write fixtures into the real ledger.
  // They used to, which left directories like `test-plan-adopt-1` sitting among real
  // plans until the .agent validator started rejecting them.
  const targetDir = path.join(plansDir, planId);
  const targetPath = path.join(targetDir, 'original.md');
  ensureDir(targetDir);
  fs.copyFileSync(resolved, targetPath);

  const amendmentDir = path.join(targetDir, 'amendments');
  const amendmentIds: string[] = [];
  if (fs.existsSync(amendmentDir)) {
    const entries = fs.readdirSync(amendmentDir).sort();
    for (const entry of entries) {
      const entryPath = path.join(amendmentDir, entry);
      if (fs.statSync(entryPath).isFile()) {
        amendmentIds.push(entry.replace(/\.(md|json|yaml)$/i, ''));
      }
    }
  }

  const amendmentBytes: Buffer[] = [];
  for (const id of amendmentIds) {
    const amPath = path.join(amendmentDir, `${id}.md`);
    const amJsonPath = path.join(amendmentDir, `${id}.json`);
    const amYamlPath = path.join(amendmentDir, `${id}.yaml`);
    if (fs.existsSync(amPath)) amendmentBytes.push(fs.readFileSync(amPath));
    else if (fs.existsSync(amJsonPath)) amendmentBytes.push(fs.readFileSync(amJsonPath));
    else if (fs.existsSync(amYamlPath)) amendmentBytes.push(fs.readFileSync(amYamlPath));
  }

  const effectiveBytes = Buffer.concat([rawBytes, ...amendmentBytes]);
  const effectivePlanSha256 = sha256Bytes(new Uint8Array(effectiveBytes));

  return { planId, originalSha256, amendmentIds, effectivePlanSha256 };
}

export function finalizePlan(ledgerPath: string): { passed: boolean; reason?: string } {
  requireValue(typeof ledgerPath === 'string' && ledgerPath.length > 0, 'ledgerPath must be non-empty');
  const resolved = path.resolve(ledgerPath);
  requireValue(fs.existsSync(resolved), `Ledger does not exist: ${ledgerPath}`);

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as WorkLedger;

  const lastReconciliation = raw.reconciliations.at(-1);
  if (!lastReconciliation) {
    return { passed: false, reason: 'No reconciliation entries found' };
  }

  const passedStatuses: ReadonlySet<ReconciliationEntry['status']> = new Set(['MATCH', 'SUPERSEDED']);
  if (!passedStatuses.has(lastReconciliation.status)) {
    return { passed: false, reason: `Latest reconciliation status is ${lastReconciliation.status}, expected MATCH or SUPERSEDED` };
  }

  const openFindings = raw.orphanFindings.filter((f) => f.status === 'OPEN');
  if (openFindings.length > 0) {
    return { passed: false, reason: `${openFindings.length} open finding(s) exist: ${openFindings.map((f) => f.findingId).join(', ')}` };
  }

  return { passed: true };
}

export function createRepairSlice(
  ledgerPath: string,
  findingId: string,
  reopenedCriterionIds: string[],
): RepairSlice {
  requireValue(typeof ledgerPath === 'string' && ledgerPath.length > 0, 'ledgerPath must be non-empty');
  requireValue(typeof findingId === 'string' && findingId.length > 0, 'findingId must be non-empty');
  requireValue(Array.isArray(reopenedCriterionIds) && reopenedCriterionIds.length > 0, 'reopenedCriterionIds must be a non-empty array');

  const resolved = path.resolve(ledgerPath);
  requireValue(fs.existsSync(resolved), `Ledger does not exist: ${ledgerPath}`);

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as WorkLedger;

  const repairSliceId = `RS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slice: RepairSlice = {
    repairSliceId,
    status: 'PENDING',
    findingIds: [findingId],
    reopenedCriterionIds,
  };

  (raw as any).repairSlices = [...raw.repairSlices, slice];
  fs.writeFileSync(resolved, JSON.stringify(raw, null, 2), 'utf-8');

  return slice;
}

export function transitionToNeedsRemediation(
  ledgerPath: string,
  findingId: string,
  reopenedCriterionIds: string[],
): string {
  requireValue(typeof ledgerPath === 'string' && ledgerPath.length > 0, 'ledgerPath must be non-empty');
  const resolved = path.resolve(ledgerPath);
  requireValue(fs.existsSync(resolved), `Ledger does not exist: ${ledgerPath}`);

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as WorkLedger;
  const terminal: readonly WorkLedgerStatus[] = ['COMPLETED', 'CANCELLED', 'FAILED', 'needs-remediation'];
  requireValue(!terminal.includes(raw.status), `Cannot transition from ${raw.status} to needs-remediation`);

  (raw as any).status = "needs-remediation";

  const slice = createRepairSlice(ledgerPath, findingId, reopenedCriterionIds);

  for (let i = 0; i < raw.batches.length; i++) {
    const batch = raw.batches[i];
    if (batch.status === 'PENDING' || batch.status === 'RUNNING' || batch.status === 'PARTIAL') {
      (raw as any).batches[i] = { ...batch, status: 'BLOCKED' };
    }
  }

  fs.writeFileSync(resolved, JSON.stringify(raw, null, 2), 'utf-8');
  return slice.repairSliceId;
}

export function reconcilePlan(ledgerPath: string, originalPath: string, diffFingerprint: string): Reconciliation {
  requireValue(typeof ledgerPath === 'string' && ledgerPath.length > 0, 'ledgerPath must be non-empty');
  requireValue(typeof originalPath === 'string' && originalPath.length > 0, 'originalPath must be non-empty');
  requireValue(typeof diffFingerprint === 'string' && diffFingerprint.length > 0, 'diffFingerprint must be non-empty');

  const ledgerResolved = path.resolve(ledgerPath);
  const originalResolved = path.resolve(originalPath);

  requireValue(fs.existsSync(ledgerResolved), `Ledger does not exist: ${ledgerPath}`);
  requireValue(fs.existsSync(originalResolved), `Original does not exist: ${originalPath}`);

  const raw = JSON.parse(fs.readFileSync(ledgerResolved, 'utf-8')) as WorkLedger;
  const originalBytes = fs.readFileSync(originalResolved);
  const originalSha = sha256Bytes(new Uint8Array(originalBytes));

  const effectiveSha = raw.latestReview.originalSha256;
  const ledgerRevision = raw.shadowRevision;

  const amendmentDir = path.join(path.dirname(ledgerResolved), '../plans', raw.plan.planId, 'amendments');
  let amendmentTexts: string[] = [];
  if (fs.existsSync(amendmentDir)) {
    const entries = fs.readdirSync(amendmentDir).sort();
    for (const entry of entries) {
      const entryPath = path.join(amendmentDir, entry);
      if (fs.statSync(entryPath).isFile()) {
        amendmentTexts.push(fs.readFileSync(entryPath, 'utf-8'));
      }
    }
  }

  const expectedEvidenceSha = sha256([...raw.latestReview.evidenceHashes].sort().join(''));
  const integratedDigest = sha256([originalSha, ...amendmentTexts.map((t) => sha256(t)), diffFingerprint, expectedEvidenceSha].join(':'));

  const reconcilers = raw.reconciliations;
  if (reconcilers.length === 0) {
    return {
      status: 'MISSING',
      reconciledAgainst: { originalSha, effectiveSha, ledgerRevision },
      detail: 'No reconciler entries in ledger',
    };
  }

  const passedCount = reconcilers.filter((r) => r.status === 'MATCH' || r.status === 'SUPERSEDED').length;
  const failedCount = reconcilers.filter((r) => r.status !== 'MATCH' && r.status !== 'SUPERSEDED').length;
  const totalCount = reconcilers.length;

  if (passedCount === totalCount) {
    return {
      status: 'MATCH',
      reconciledAgainst: { originalSha, effectiveSha, ledgerRevision },
      detail: `All ${totalCount} requirement(s) reconciled: ${integratedDigest}`,
    };
  }

  if (failedCount > 0 && passedCount === 0) {
    return {
      status: 'DEVIATED',
      reconciledAgainst: { originalSha, effectiveSha, ledgerRevision },
      detail: `All ${totalCount} requirement(s) deviated; ${failedCount} failed`,
    };
  }

  return {
    status: 'PARTIAL',
    reconciledAgainst: { originalSha, effectiveSha, ledgerRevision },
    detail: `${passedCount}/${totalCount} requirement(s) reconciled; ${failedCount} outstanding`,
  };
}

export function detectStaleReviews(
  reviews: Array<{ id: string; boundSourceHashes: string[]; reviewedAt: string }>,
  currentHashes: Record<string, string>,
): Array<{ reviewId: string; staleCauses: string[] }> {
  requireValue(Array.isArray(reviews), 'reviews must be an array');
  requireValue(typeof currentHashes === 'object' && currentHashes !== null && !Array.isArray(currentHashes), 'currentHashes must be a record');

  const result: Array<{ reviewId: string; staleCauses: string[] }> = [];

  for (const review of reviews) {
    const staleCauses: string[] = [];
    for (const boundHash of review.boundSourceHashes) {
      let found = false;
      for (const key of Object.keys(currentHashes)) {
        if (currentHashes[key] === boundHash) {
          found = true;
          break;
        }
      }
      if (!found) {
        staleCauses.push(`Bound hash ${boundHash.slice(0, 12)}... is no longer current`);
      }
    }
    if (staleCauses.length > 0) {
      result.push({ reviewId: review.id, staleCauses });
    }
  }

  return result;
}

export function lockFile(filePath: string): { fd: number; unlock: () => void } {
  requireValue(typeof filePath === 'string' && filePath.length > 0, 'filePath must be non-empty');
  const lockPath = `${path.resolve(filePath)}.lock`;
  const fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  return {
    fd,
    unlock: () => {
      try { fs.closeSync(fd); } catch { /* already closed */ }
      try { fs.unlinkSync(lockPath); } catch { /* already deleted */ }
    },
  };
}

export function lockDirectory(dirPath: string): { fd: number; unlock: () => void } {
  requireValue(typeof dirPath === 'string' && dirPath.length > 0, 'dirPath must be non-empty');
  const lockPath = path.join(path.resolve(dirPath), '.lock');
  const fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  return {
    fd,
    unlock: () => {
      try { fs.closeSync(fd); } catch { /* already closed */ }
      try { fs.unlinkSync(lockPath); } catch { /* already deleted */ }
    },
  };
}

export function detectStaleReceipts(
  currentDiffFingerprint: string,
  currentEvidenceHashes: Record<string, string>,
  receipts: readonly ReviewReceipt[],
): string[] {
  requireValue(typeof currentDiffFingerprint === 'string' && currentDiffFingerprint.length > 0, 'currentDiffFingerprint must be non-empty');
  requireValue(typeof currentEvidenceHashes === 'object' && currentEvidenceHashes !== null, 'currentEvidenceHashes must be an object');
  requireValue(Array.isArray(receipts), 'receipts must be an array');

  const staleIds: string[] = [];

  for (const receipt of receipts) {
    let stale = false;

    if (receipt.diffFingerprint !== currentDiffFingerprint) {
      stale = true;
    } else {
      const currentValues = new Set(Object.values(currentEvidenceHashes));
      let evidenceMatch = true;
      for (const hash of receipt.evidenceHashes) {
        if (!currentValues.has(hash)) {
          evidenceMatch = false;
          break;
        }
      }
      if (!evidenceMatch) {
        stale = true;
      }
    }

    if (stale) {
      staleIds.push(receipt.reviewId);
    }
  }

  return staleIds;
}
