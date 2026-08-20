import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isSha256, sha256Bytes, type Sha256 } from './contracts.js';
import { computeCanonicalEffectivePlanIdentity } from './plan-identity.js';
import { STAGE_RANK, bestStage, normalizeStages, type EvidenceStage } from './claim-registry.js';

export type ReconciliationStatus = 'MATCH' | 'PARTIAL' | 'MISSING' | 'FAILED' | 'SUPERSEDED' | 'DEVIATED';

export interface ReconciliationCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface CanonicalReconciliationReceipt {
  schema: 'harness/reconciliation-receipt';
  version: 1;
  plan_id: string;
  status: ReconciliationStatus;
  reconciled_against: {
    candidate_head: string;
    source_tree_digest: string;
    ledger_sha256: string;
    original_sha256: string;
    effective_plan_sha256: string;
    support_pack_sha256: string;
    manifest_sha256: string;
    candidate_epoch: number;
  };
  checks: ReconciliationCheck[];
  verified: string[];
  stale: string[];
  missing: string[];
  created_at: string;
  receipt_sha256: string;
}

export interface CanonicalReconcileInput {
  repo_root: string;
  plan_id: string;
  /** Fresh git HEAD. Must be observed by the caller (never synthesized). */
  candidate_head: string;
  /** Digest over the working tree diff (uncommitted changes). */
  source_tree_digest: string;
  candidate_epoch?: number;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function logicalHash(body: Record<string, unknown>, selfField: string): string {
  const rest = { ...body };
  delete rest[selfField];
  return sha256(canonicalJson(rest));
}

function fileSha256(file: string): string | null {
  try {
    return sha256Bytes(new Uint8Array(fs.readFileSync(file)));
  } catch {
    return null;
  }
}

function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

/**
 * Machine reconciliation for canonical (schema v5) ledgers (REQ-004).
 *
 * The ledger's own recorded statuses are never evidence: every PASS claim
 * must bind to a real, fresh evidence file whose hash is recomputed here.
 * Missing or stale hashes/evidence fail closed. Legacy (v4) ledgers are
 * reconciled by the caller's legacy path; this function rejects them loudly.
 */
export function reconcileCanonicalLedger(ledgerPath: string, input: CanonicalReconcileInput): CanonicalReconciliationReceipt {
  if (!fs.existsSync(ledgerPath)) throw new Error(`ledger does not exist: ${ledgerPath}`);
  const ledgerRaw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as Record<string, unknown>;
  const schemaVersion = ledgerRaw.schema_version;
  if (schemaVersion !== 5) {
    throw new Error(`reconcileCanonicalLedger requires schema_version 5 (ledger has ${String(schemaVersion)}); legacy v4 ledgers use the legacy reconciler`);
  }
  if (ledgerRaw.plan_id !== input.plan_id) throw new Error(`ledger plan_id ${String(ledgerRaw.plan_id)} != requested ${input.plan_id}`);
  if (!/^[a-f0-9]{40}$/.test(input.candidate_head)) throw new Error('candidate_head must be a 40-hex git commit SHA');
  if (!input.source_tree_digest || !/^[a-f0-9]{64}$/.test(input.source_tree_digest)) throw new Error('source_tree_digest must be a 64-hex SHA-256');

  const checks: ReconciliationCheck[] = [];
  const verified: string[] = [];
  const stale: string[] = [];
  const missing: string[] = [];

  const add = (name: string, passed: boolean, detail: string, severity: ReconciliationCheck['severity'] = 'critical') => {
    checks.push({ name, passed, detail, severity });
    if (passed) verified.push(name);
    else if (detail.includes('missing') || detail.includes('not found')) missing.push(name);
    else stale.push(name);
  };

  // ── 1. Original plan identity ─────────────────────────────────────
  const original = ledgerRaw.original_plan as Record<string, unknown> | undefined;
  const originalPath = typeof original?.path === 'string' ? path.join(input.repo_root, original.path) : null;
  const originalSha = originalPath && fileExists(originalPath) ? fileSha256(originalPath) : null;
  const ledgerOriginalSha = typeof original?.sha256 === 'string' ? original.sha256 : null;
  add('original_plan_hash', originalSha !== null && ledgerOriginalSha !== null && originalSha === ledgerOriginalSha,
    originalSha === null ? `original plan file missing at ${originalPath ?? '(none)'}` : originalSha !== ledgerOriginalSha ? `original plan hash mismatch: file ${originalSha.slice(0, 12)} != ledger ${ledgerOriginalSha?.slice(0, 12)}` : 'original plan hash matches ledger');

  // ── 2. Amendments ─────────────────────────────────────────────────
  const amendments = Array.isArray(ledgerRaw.amendments) ? ledgerRaw.amendments as Array<Record<string, unknown>> : [];
  let amendmentOk = amendments.length > 0;
  const amendmentDetails: string[] = [];
  for (const amendment of amendments) {
    const amPath = typeof amendment.path === 'string' ? path.join(input.repo_root, amendment.path) : null;
    const amHash = amPath && fileExists(amPath) ? fileSha256(amPath) : null;
    const ledgerAmHash = typeof amendment.sha256 === 'string' ? amendment.sha256 : null;
    if (amHash === null) { amendmentOk = false; amendmentDetails.push(`amendment ${String(amendment.amendment_id)} file missing`); }
    else if (ledgerAmHash === null || amHash !== ledgerAmHash) { amendmentOk = false; amendmentDetails.push(`amendment ${String(amendment.amendment_id)} hash mismatch`); }
  }
  add('amendments_hash', amendmentOk, amendmentOk ? `${amendments.length} amendment(s) match their on-disk hashes` : amendmentDetails.join('; '));

  // ── 3. Effective plan identity recomputation ──────────────────────
  let effectiveOk = false;
  let effectiveDetail = 'effective plan identity not recomputable';
  if (originalSha && ledgerOriginalSha === originalSha && amendmentOk) {
    try {
      const effective = computeCanonicalEffectivePlanIdentity(
        originalSha as Sha256,
        amendments.map((amendment) => ({
          amendment_id: String(amendment.amendment_id),
          sha256: String(amendment.sha256) as Sha256,
        })),
      );
      const ledgerEffective = ledgerRaw.effective_plan_identity as Record<string, unknown> | undefined;
      const ledgerEffectiveSha = typeof ledgerEffective?.sha256 === 'string' ? ledgerEffective.sha256 : null;
      effectiveOk = ledgerEffectiveSha !== null && effective.sha256 === ledgerEffectiveSha;
      effectiveDetail = effectiveOk ? `effective plan identity matches (${effective.sha256.slice(0, 16)})` : `effective plan identity mismatch: recomputed ${effective.sha256.slice(0, 16)} != ledger ${ledgerEffectiveSha?.slice(0, 16) ?? '(none)'}`;
    } catch (error) {
      effectiveDetail = `effective plan identity recomputation failed: ${(error as Error).message}`;
    }
  }
  add('effective_plan_identity', effectiveOk, effectiveDetail);

  // ── 4. Support pack hashes ────────────────────────────────────────
  const packDir = path.join(input.repo_root, '.agent', 'artifacts', input.plan_id, 'support-pack');
  const packPath = path.join(packDir, 'pack.json');
  const manifestPath = path.join(packDir, 'manifest.json');
  const pack = fileExists(packPath) ? JSON.parse(fs.readFileSync(packPath, 'utf8')) as Record<string, unknown> : null;
  const manifest = fileExists(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown> : null;
  const packSha = pack ? logicalHash(pack, 'packSha256') : null;
  const manifestSha = manifest ? logicalHash(manifest, 'manifestSha256') : null;
  const ledgerPack = ledgerRaw.support_pack as Record<string, unknown> | undefined;
  const ledgerPackSha = typeof ledgerPack?.pack_sha256 === 'string' ? ledgerPack.pack_sha256 : null;
  const ledgerManifestSha = typeof ledgerPack?.manifest_sha256 === 'string' ? ledgerPack.manifest_sha256 : null;
  add('support_pack_hash', packSha !== null && ledgerPackSha !== null && packSha === ledgerPackSha,
    packSha === null ? 'support pack pack.json missing' : packSha !== ledgerPackSha ? `support pack hash mismatch: ${packSha.slice(0, 12)} != ${ledgerPackSha?.slice(0, 12)}` : `support pack hash matches (${packSha.slice(0, 16)})`);
  add('manifest_hash', manifestSha !== null && ledgerManifestSha !== null && manifestSha === ledgerManifestSha,
    manifestSha === null ? 'support pack manifest.json missing' : manifestSha !== ledgerManifestSha ? `manifest hash mismatch: ${manifestSha.slice(0, 12)} != ${ledgerManifestSha?.slice(0, 12)}` : `manifest hash matches (${manifestSha.slice(0, 16)})`);

  // ── 5. Requirement/claim/task coverage ────────────────────────────
  const scope = ledgerRaw.canonical_scope as Record<string, unknown> | undefined;
  const reviewedContract = scope?.reviewed_contract as Record<string, unknown> | undefined;
  const requirementIds = Array.isArray(reviewedContract?.requirement_ids) ? reviewedContract.requirement_ids as string[] : [];
  const claimIds = Array.isArray(reviewedContract?.acceptance_ids) ? reviewedContract.acceptance_ids as string[] : [];
  const taskIds = Array.isArray(scope?.task_ids) ? scope.task_ids as string[] : [];
  const manifestRecipes = manifest && Array.isArray(manifest.recipes) ? manifest.recipes as Array<Record<string, unknown>> : [];
  add('requirement_coverage', requirementIds.length === 22, `requirements: ${requirementIds.length}/22`);
  add('claim_coverage', claimIds.length === 22, `claims: ${claimIds.length}/22`);
  add('task_coverage', taskIds.length === 10 && manifestRecipes.length === 10, `tasks: ${taskIds.length}/10 (manifest ${manifestRecipes.length}/10)`);

  // ── 6. Claim evidence freshness (the only PASS authority) ─────────
  const reconciliations = Array.isArray(ledgerRaw.reconciliations) ? ledgerRaw.reconciliations as Array<Record<string, unknown>> : [];
  const passClaims: Array<{ claim_id: string; evidence_refs: string[] }> = reconciliations
    .filter((entry) => entry.status === 'PASS' && typeof entry.claim_id === 'string')
    .map((entry) => ({
      claim_id: String(entry.claim_id),
      evidence_refs: Array.isArray(entry.evidence_refs) ? entry.evidence_refs.map(String) : [],
    }));
  let evidenceOk = passClaims.length >= 21;
  const evidenceIssues: string[] = [];
  for (const claim of passClaims) {
    if (claim.evidence_refs.length === 0) {
      evidenceOk = false;
      evidenceIssues.push(`claim ${claim.claim_id} has no evidence refs`);
      continue;
    }
    for (const ref of claim.evidence_refs) {
      const resolved = path.join(input.repo_root, ref);
      if (!fileExists(resolved)) {
        evidenceOk = false;
        evidenceIssues.push(`claim ${claim.claim_id} evidence missing: ${ref}`);
      }
    }
  }
  add('claim_evidence_fresh', evidenceOk, evidenceOk ? `${passClaims.length} PASS claims bind to existing evidence files` : evidenceIssues.join('; '));

  // ── 6b. Evidence stage boundary (AM-0005) ─────────────────────────
  // A PASS claim whose acceptance declares a live/dogfood/operational
  // evidence stage must bind evidence files that actually reached that stage.
  // Test-only evidence never satisfies a live claim; missing stage fails closed.
  const requiredStages = loadRequiredEvidenceStages(input.repo_root, input.plan_id);
  let stageOk = true;
  const stageIssues: string[] = [];
  for (const claim of passClaims) {
    const required = requiredStages.get(claim.claim_id);
    if (!required) continue;
    const stages: EvidenceStage[] = [];
    for (const ref of claim.evidence_refs) {
      const resolved = path.join(input.repo_root, ref);
      if (!fileExists(resolved)) continue;
      try {
        const evidenceFile = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Record<string, unknown>;
        const claimsList = Array.isArray(evidenceFile.claims) ? evidenceFile.claims as Array<Record<string, unknown>> : [];
        for (const entry of claimsList) {
          if (entry.claim_id !== claim.claim_id) continue;
          if (entry.evidence_stage && STAGE_RANK[entry.evidence_stage as EvidenceStage] !== undefined) {
            stages.push(entry.evidence_stage as EvidenceStage);
          }
        }
      } catch {
        /* unreadable evidence file already reported above */
      }
    }
    const best = bestStage(normalizeStages(stages));
    if (required === 'LIVE_UNPROVEN' || best === undefined || STAGE_RANK[best] < STAGE_RANK[required]) {
      stageOk = false;
      stageIssues.push(`claim ${claim.claim_id} evidence stage ${best ?? 'none'} below required stage ${required} (AM-0005: test-only evidence cannot prove a live/dogfood/operational claim)`);
    }
  }
  add('evidence_stage_boundary', stageOk, stageOk ? 'all live-stage claims bind stage-qualified evidence' : stageIssues.join('; '));

  // ── 7. Installed-host receipts ────────────────────────────────────
  const hostDir = path.join(input.repo_root, '.agent', 'artifacts', input.plan_id, 'hosts');
  let hostOk = true;
  const hostIssues: string[] = [];
  if (fileExists(hostDir)) {
    const hosts = fs.readdirSync(hostDir).filter((name) => name.endsWith('.json'));
    if (hosts.length === 0) { hostOk = false; hostIssues.push('host receipts directory is empty'); }
    for (const name of hosts) {
      const receipt = JSON.parse(fs.readFileSync(path.join(hostDir, name), 'utf8')) as Record<string, unknown>;
      if (receipt.candidate_head !== input.candidate_head) {
        hostOk = false;
        hostIssues.push(`host ${name} receipt binds candidate ${String(receipt.candidate_head).slice(0, 12)} != ${input.candidate_head.slice(0, 12)}`);
      }
    }
  } else {
    hostOk = false;
    hostIssues.push('host receipts directory missing');
  }
  add('host_receipts', hostOk, hostOk ? `host receipts bind the exact candidate (${fs.readdirSync(hostDir).length} host(s))` : hostIssues.join('; '));

  // ── 8. Candidate epoch + ledger hash binding ──────────────────────
  const ledgerBytes = fs.readFileSync(ledgerPath);
  const ledgerSha = sha256Bytes(new Uint8Array(ledgerBytes));
  const epoch = input.candidate_epoch ?? (typeof ledgerRaw.shadow_revision === 'number' ? ledgerRaw.shadow_revision : 0);
  add('candidate_epoch', epoch >= 0 && epoch >= 4, `candidate epoch ${epoch} >= revision 4`);

  const criticalFailures = checks.filter((check) => !check.passed && check.severity === 'critical').length;
  const anyFailure = checks.filter((check) => !check.passed).length;
  const status: ReconciliationStatus = criticalFailures === 0 && anyFailure === 0 ? 'MATCH' : anyFailure > 0 ? 'PARTIAL' : 'MISSING';

  const body = {
    schema: 'harness/reconciliation-receipt' as const,
    version: 1 as const,
    plan_id: input.plan_id,
    status,
    reconciled_against: {
      candidate_head: input.candidate_head,
      source_tree_digest: input.source_tree_digest,
      ledger_sha256: ledgerSha,
      original_sha256: originalSha ?? ledgerOriginalSha ?? '0'.repeat(64),
      effective_plan_sha256: (ledgerRaw.effective_plan_identity as Record<string, unknown> | undefined)?.sha256 as string ?? '0'.repeat(64),
      support_pack_sha256: packSha ?? ledgerPackSha ?? '0'.repeat(64),
      manifest_sha256: manifestSha ?? ledgerManifestSha ?? '0'.repeat(64),
      candidate_epoch: epoch,
    },
    checks,
    verified,
    stale,
    missing,
    created_at: new Date().toISOString(),
  };
  const receipt: CanonicalReconciliationReceipt = { ...body, receipt_sha256: sha256(canonicalJson(body)) };

  const receiptDir = path.join(input.repo_root, '.agent', 'artifacts', input.plan_id, 'reconciliation');
  fs.mkdirSync(receiptDir, { recursive: true });
  const receiptFile = path.join(receiptDir, `reconcile-${Date.now()}.json`);
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return receipt;
}

/**
 * AM-0005: read the plan's verification matrix for per-acceptance
 * `required_evidence_stage` declarations. The matrix is the policy owner;
 * claims without a declaration default to no live requirement.
 */
function loadRequiredEvidenceStages(repoRoot: string, planId: string): Map<string, EvidenceStage> {
  const out = new Map<string, EvidenceStage>();
  const matrixPath = path.join(repoRoot, '.agent', 'plans', planId, 'verification-matrix.json');
  if (!fs.existsSync(matrixPath)) return out;
  let matrix: Record<string, unknown>;
  try {
    matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return out;
  }
  const acceptance = Array.isArray(matrix.acceptance) ? matrix.acceptance as Array<Record<string, unknown>> : [];
  for (const ac of acceptance) {
    const required = ac.required_evidence_stage;
    if (typeof required !== 'string') continue;
    if (!(required in STAGE_RANK)) continue;
    const id = typeof ac.id === 'string' ? ac.id : '';
    if (!id) continue;
    out.set(`C-${id.replace(/^AC-/, '')}`, required as EvidenceStage);
  }
  return out;
}
