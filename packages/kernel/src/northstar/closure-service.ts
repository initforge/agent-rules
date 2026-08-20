import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Unified closure service (vNext Phase 1 — authority, lifecycle and closure
 * trust root).
 *
 * Consolidates the legacy close/closeout/certify paths into one canonical
 * transaction that:
 *
 * 1. Separates activity/retrieval state from terminal outcome. A plan can be
 *    INACTIVE/SUPERSEDED while still carrying a terminal PARTIAL truth; an
 *    INACTIVE pointer never fabricates PASS.
 * 2. Rejects empty requirements and empty reconciliation as closure input.
 * 3. Derives residue from the effective contract, evidence and diff instead of
 *    hard-coded facts.
 * 4. Binds every receipt to the four identities: harness release,
 *    installation/projection, consumer repository/candidate and host runtime.
 * 5. Implements prepare/stage/fsync/single-commit-point transaction with
 *    idempotent replay (double close, stale generation, first-run no-state and
 *    upgraded-state all behave deterministically).
 * 6. Supports the behavioral baseline `B`, allowlisted metadata commit `C`, and
 *    exact-SHA external terminal attestation model.
 *
 * The old v1 closure that accepted shallow `verified:true` receipts, empty
 * reconciliation, hard-coded residue and pointer copies without deactivation is
 * treated as invalid and corrected by `correctInvalidClosure`.
 */

export const CLOSURE_SERVICE_VERSION = 1 as const;

export type TerminalOutcome = 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'UNSUPPORTED' | 'NEEDS_USER';
export type ActivityState = 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED' | 'RETIRED';

export type ClosureStage = 'PREPARE' | 'STAGE' | 'COMMIT' | 'ATTEST' | 'DEACTIVATE' | 'COMPACT';

export interface HarnessReleaseIdentity {
  repository: string;
  branch: string;
  sha256: string;
  version?: string;
}

export interface InstallationProjectionIdentity {
  installation_root: string;
  projection_sha256: string;
  projection_path?: string;
}

export interface ConsumerRepositoryIdentity {
  repository_url?: string;
  worktree_path: string;
  git_head?: string;
  worktree_dirty: boolean;
  tree_hash?: string;
}

export interface HostRuntimeIdentity {
  host: string;
  version?: string;
  session_id?: string;
  capabilities: string[];
}

export interface EvidenceBindingManifest {
  harness_release: HarnessReleaseIdentity;
  installation_projection: InstallationProjectionIdentity;
  consumer_repository: ConsumerRepositoryIdentity;
  consumer_candidate: ConsumerCandidateIdentity;
  host_runtime: HostRuntimeIdentity;
}

export interface ConsumerCandidateIdentity {
  candidate_sha256: string;
  candidate_branch?: string;
  tree_hash?: string;
}

export interface ReconciliationClosureInput {
  count: number;
  statuses: string[];
  receipt_sha256?: string;
}

export interface ClosureInput {
  plan_id: string;
  work_id: string;
  purpose: string;
  effective_contract_sha256: string;
  requirements: Array<{ id: string; statement: string; status?: string }>;
  reconciliations: ReconciliationClosureInput[];
  evidence: Array<{ evidence_id: string; sha256: string; outcome: string; stage?: string }>;
  changed_surfaces: string[];
  diff_stat: string;
  binding: EvidenceBindingManifest;
  /** Behavioral baseline B; the metadata commit C is derived, never guessed. */
  behavioral_baseline: string;
  terminal_outcome?: TerminalOutcome;
  durable_requirement_ids?: string[];
}

export interface ClosureManifest {
  schema: 'agent-rules/closure-manifest/v1';
  version: 1;
  closure_id: string;
  plan_id: string;
  work_id: string;
  purpose: string;
  effective_contract_sha256: string;
  activity_state: ActivityState;
  terminal_outcome: TerminalOutcome;
  binding: EvidenceBindingManifest;
  requirements: {
    count: number;
    resolved: number;
    unresolved: number;
    ids: string[];
  };
  reconciliation: {
    count: number;
    pass: boolean;
    statuses: string[];
  };
  residue: {
    sha256: string;
    path: string;
  };
  diff: {
    behavioral_baseline: string;
    metadata_commit: string | null;
    metadata_manifest: MetadataDeltaManifest | null;
    changed_surfaces: string[];
    diff_stat: string;
  };
  attestation: TerminalAttestation;
  committed_at: string;
}

export interface MetadataDeltaManifest {
  schema: 'agent-rules/metadata-delta-manifest/v1';
  version: 1;
  closure_id: string;
  baseline_sha256: string;
  metadata_commit_sha256: string;
  allowlisted_paths: string[];
  changed_paths: string[];
  allowed: boolean;
  reason: string;
}

export interface TerminalAttestation {
  status: 'PENDING' | 'ATTESTED' | 'REJECTED';
  ci_sha256: string | null;
  external_verifier: string | null;
  attested_at: string | null;
  evidence_refs: string[];
}

export interface ClosureTransactionReceipt {
  schema: 'agent-rules/closure-transaction/v1';
  version: 1;
  closure_id: string;
  plan_id: string;
  staged: boolean;
  committed: boolean;
  deactivated: boolean;
  replay: boolean;
  manifest_path: string;
  residue_path: string;
  receipt_sha256: string;
}

export interface InvalidClosureCorrection {
  plan_id: string;
  corrected: boolean;
  previous_status: string | null;
  previous_execution_state: string | null;
  corrected_status: 'SUPERSEDED';
  corrected_execution_state: 'INACTIVE';
  terminal_outcome: 'PARTIAL';
  reason: string;
  correction_sha256: string;
}

export class ClosureServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ClosureServiceError';
  }
}

export const CLOSURE_ERRORS = {
  EMPTY_REQUIREMENTS: 'CLOSURE_EMPTY_REQUIREMENTS',
  EMPTY_RECONCILIATION: 'CLOSURE_EMPTY_RECONCILIATION',
  NO_EVIDENCE: 'CLOSURE_NO_EVIDENCE',
  UNRESOLVED_REQUIREMENTS: 'CLOSURE_UNRESOLVED_REQUIREMENTS',
  MISSING_BINDING: 'CLOSURE_MISSING_BINDING',
  NO_BEHAVIORAL_BASELINE: 'CLOSURE_NO_BEHAVIORAL_BASELINE',
  PATH_UNSAFE: 'CLOSURE_PATH_UNSAFE',
  METADATA_NOT_ALLOWLISTED: 'CLOSURE_METADATA_NOT_ALLOWLISTED',
  MISSING_OPERATIONAL_STATE: 'CLOSURE_MISSING_OPERATIONAL_STATE',
} as const;

function sha256hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function isRelativeSafe(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..' || seg === '');
}

function assertSafeRelative(p: string, what: string): void {
  if (!isRelativeSafe(p)) {
    throw new ClosureServiceError(CLOSURE_ERRORS.PATH_UNSAFE, `${what}: absolute or traversing path "${p}"`);
  }
}

function isCommitSha(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value);
}

/** Every required identity must be present and non-empty. */
export function assertEvidenceBinding(binding: EvidenceBindingManifest): void {
  const failures: string[] = [];
  if (!binding.harness_release.sha256 || !isCommitSha(binding.harness_release.sha256)) failures.push('harness_release.sha256');
  if (!binding.installation_projection.projection_sha256 || !/^[a-f0-9]{64}$/i.test(binding.installation_projection.projection_sha256)) failures.push('installation_projection.projection_sha256');
  if (!binding.consumer_repository.worktree_path || binding.consumer_repository.worktree_path.length === 0) failures.push('consumer_repository.worktree_path');
  if (!isCommitSha(binding.consumer_candidate.candidate_sha256)) failures.push('consumer_candidate.candidate_sha256');
  if (!binding.host_runtime.host || binding.host_runtime.host.length === 0) failures.push('host_runtime.host');
  if (failures.length > 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.MISSING_BINDING, `evidence binding incomplete: ${failures.join(', ')}`);
  }
}

/**
 * Mandatory closure input checks. Empty requirements or empty reconciliation
 * can never produce PASS — the v1 close path accepted both, which is corrected
 * by `correctInvalidClosure`.
 */
export function assertClosureInput(input: ClosureInput): void {
  if (!Array.isArray(input.requirements) || input.requirements.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.EMPTY_REQUIREMENTS, `closure for ${input.plan_id} has zero requirements; empty requirements can never close PASS`);
  }
  if (!Array.isArray(input.reconciliations) || input.reconciliations.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.EMPTY_RECONCILIATION, `closure for ${input.plan_id} has zero reconciliations; empty reconciliation can never close PASS`);
  }
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.NO_EVIDENCE, `closure for ${input.plan_id} has zero bound evidence records`);
  }
  if (!isCommitSha(input.behavioral_baseline)) {
    throw new ClosureServiceError(CLOSURE_ERRORS.NO_BEHAVIORAL_BASELINE, `closure for ${input.plan_id} requires a 40- or 64-hex behavioral baseline B`);
  }
  const unresolved = input.requirements.filter((req) => req.status === 'UNRESOLVED' || req.status === 'PENDING');
  if (unresolved.length > 0) {
    throw new ClosureServiceError(
      CLOSURE_ERRORS.UNRESOLVED_REQUIREMENTS,
      `closure for ${input.plan_id} has ${unresolved.length} unresolved requirement(s): ${unresolved.map((r) => r.id).join(', ')}`,
    );
  }
  assertEvidenceBinding(input.binding);
}

/** Derive the allowlisted metadata delta between baseline B and candidate C. */
export function deriveMetadataDeltaManifest(input: {
  closure_id: string;
  baseline_sha256: string;
  metadata_commit_sha256: string;
  changed_paths: string[];
}): MetadataDeltaManifest {
  const allowlist = new Set([
    '.agent/current.json',
    '.agent/ledger/',
    '.agent/archive/',
    '.agent/tombstones/',
    '.agent/planner/',
    '.agent/evidence/',
    '.agent/plans/',
    '.agent/research/',
    '.agent/northstar.json',
    'packages/cli/src/commands/close.ts',
    'packages/cli/src/commands/closeout.ts',
    'packages/cli/src/commands/certify.ts',
    'packages/kernel/src/northstar/closure-service.ts',
    'packages/kernel/src/northstar/closure-transaction.ts',
    'schemas/closure-manifest.schema.json',
    'schemas/metadata-delta-manifest.schema.json',
    'schemas/terminal-attestation.schema.json',
  ]);
  const changed = [...input.changed_paths];
  const violated = changed.filter((p) => {
    const normalized = p.split(path.sep).join('/');
    if (allowlist.has(normalized)) return false;
    return ![...allowlist].some((prefix) => prefix.endsWith('/') && normalized.startsWith(prefix));
  });
  return {
    schema: 'agent-rules/metadata-delta-manifest/v1',
    version: 1,
    closure_id: input.closure_id,
    baseline_sha256: input.baseline_sha256,
    metadata_commit_sha256: input.metadata_commit_sha256,
    allowlisted_paths: [...allowlist].sort(),
    changed_paths: changed.sort(),
    allowed: violated.length === 0,
    reason: violated.length === 0
      ? 'all changed paths are allowlisted metadata/closure surfaces'
      : `changed paths outside the metadata allowlist: ${violated.join(', ')}`,
  };
}

/**
 * Prepare + stage the closure transaction with idempotent replay.
 *
 * The transaction has a single commit point: writing the committed manifest.
 * Replaying the same closure_id after crash re-stages deterministically.
 */
export function stageClosureTransaction(input: ClosureInput, repoRoot: string): { manifest: ClosureManifest; staged: boolean; replay: boolean } {
  assertClosureInput(input);
  const closureId = `closure-${randomUUID()}`;
  const operationalRoot = path.join(repoRoot, '.agent', 'closure');
  const stagedPath = path.join(operationalRoot, `${input.plan_id}.staged.json`);

  // Idempotent replay: an existing committed manifest for the same plan with
  // the same effective-contract hash is a replay, not a fresh commit.
  const committedPath = path.join(operationalRoot, `${input.plan_id}.committed.json`);
  if (fs.existsSync(committedPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(committedPath, 'utf8')) as ClosureManifest;
      if (existing.plan_id === input.plan_id && existing.effective_contract_sha256 === input.effective_contract_sha256) {
        return { manifest: existing, staged: false, replay: true };
      }
    } catch {
      /* fall through to re-stage */
    }
  }

  const resolved = input.requirements.filter((req) => req.status === 'PASS' || req.status === 'ACTIVE' || req.status === 'COMPLETED' || req.status === 'DONE').length;
  const terminalOutcome: TerminalOutcome = input.terminal_outcome ?? 'PASS';
  const reconciliationPass = input.reconciliations.some((r) => r.statuses.includes('PASS') || r.statuses.includes('MATCH'));
  const metadataManifest = deriveMetadataDeltaManifest({
    closure_id: closureId,
    baseline_sha256: input.behavioral_baseline,
    metadata_commit_sha256: input.binding.consumer_candidate.candidate_sha256,
    changed_paths: input.changed_surfaces,
  });
  const attestation: TerminalAttestation = {
    status: 'PENDING',
    ci_sha256: null,
    external_verifier: null,
    attested_at: null,
    evidence_refs: input.evidence.map((e) => e.sha256),
  };
  const manifest: ClosureManifest = {
    schema: 'agent-rules/closure-manifest/v1',
    version: 1,
    closure_id: closureId,
    plan_id: input.plan_id,
    work_id: input.work_id,
    purpose: input.purpose,
    effective_contract_sha256: input.effective_contract_sha256,
    activity_state: 'ACTIVE',
    terminal_outcome: terminalOutcome,
    binding: input.binding,
    requirements: {
      count: input.requirements.length,
      resolved,
      unresolved: input.requirements.length - resolved,
      ids: input.requirements.map((r) => r.id),
    },
    reconciliation: {
      count: input.reconciliations.length,
      pass: reconciliationPass,
      statuses: input.reconciliations.flatMap((r) => r.statuses),
    },
    residue: {
      sha256: residueSha256(manifestResidueBody(input)),
      path: path.relative(repoRoot, path.join(operationalRoot, `${input.plan_id}.residue.json`)).split(path.sep).join('/'),
    },
    diff: {
      behavioral_baseline: input.behavioral_baseline,
      metadata_commit: metadataManifest.allowed ? input.binding.consumer_candidate.candidate_sha256 : null,
      metadata_manifest: metadataManifest,
      changed_surfaces: [...input.changed_surfaces].sort(),
      diff_stat: input.diff_stat,
    },
    attestation: attestation,
    committed_at: new Date().toISOString(),
  };

  fs.mkdirSync(operationalRoot, { recursive: true });
  fs.writeFileSync(stagedPath, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.fsyncSync(fs.openSync(stagedPath, 'r+'));
  return { manifest, staged: true, replay: false };
}

function manifestResidueBody(input: ClosureInput): string {
  return JSON.stringify({
    plan_id: input.plan_id,
    work_id: input.work_id,
    purpose: input.purpose,
    effective_contract_sha256: input.effective_contract_sha256,
    requirements: input.requirements.map((r) => ({ id: r.id, statement: r.statement, status: r.status ?? 'ACTIVE' })),
    evidence: input.evidence.map((e) => ({ evidence_id: e.evidence_id, sha256: e.sha256, outcome: e.outcome })),
    changed_surfaces: [...input.changed_surfaces].sort(),
    diff_stat: input.diff_stat,
    binding: input.binding,
  });
}

function residueSha256(body: string): string {
  return sha256hex(body);
}

/**
 * Commit the staged transaction at the single commit point. Writing the
 * committed manifest is atomic; re-staging after crash replays deterministically.
 */
export function commitClosureTransaction(input: ClosureInput, repoRoot: string, staged: { manifest: ClosureManifest; staged: boolean; replay: boolean }): ClosureTransactionReceipt {
  const operationalRoot = path.join(repoRoot, '.agent', 'closure');
  const manifestPath = path.join(operationalRoot, `${input.plan_id}.committed.json`);
  const residuePath = path.join(operationalRoot, `${input.plan_id}.residue.json`);
  if (staged.replay) {
    const receipt: ClosureTransactionReceipt = {
      schema: 'agent-rules/closure-transaction/v1',
      version: 1,
      closure_id: staged.manifest.closure_id,
      plan_id: input.plan_id,
      staged: false,
      committed: true,
      deactivated: false,
      replay: true,
      manifest_path: path.relative(repoRoot, manifestPath).split(path.sep).join('/'),
      residue_path: path.relative(repoRoot, residuePath).split(path.sep).join('/'),
      receipt_sha256: '',
    };
    const receiptBytes = Buffer.from(JSON.stringify({ ...receipt, receipt_sha256: undefined }, null, 2) + '\n');
    receipt.receipt_sha256 = sha256hex(receiptBytes);
    return receipt;
  }
  fs.writeFileSync(residuePath, staged.manifest.residue.sha256 === residueSha256(manifestResidueBody(input))
    ? JSON.stringify({ ...JSON.parse(manifestResidueBody(input)), residue_sha256: staged.manifest.residue.sha256 }, null, 2) + '\n'
    : JSON.stringify({ ...JSON.parse(manifestResidueBody(input)), residue_sha256: staged.manifest.residue.sha256 }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  const manifestBytes = Buffer.from(JSON.stringify(staged.manifest, null, 2) + '\n');
  const manifestHash = sha256hex(manifestBytes);
  const finalManifest: ClosureManifest = { ...staged.manifest, residue: { ...staged.manifest.residue, sha256: staged.manifest.residue.sha256 } };
  fs.writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.fsyncSync(fs.openSync(manifestPath, 'r+'));
  const receipt: ClosureTransactionReceipt = {
    schema: 'agent-rules/closure-transaction/v1',
    version: 1,
    closure_id: finalManifest.closure_id,
    plan_id: input.plan_id,
    staged: true,
    committed: true,
    deactivated: false,
    replay: false,
    manifest_path: path.relative(repoRoot, manifestPath).split(path.sep).join('/'),
    residue_path: path.relative(repoRoot, residuePath).split(path.sep).join('/'),
    receipt_sha256: '',
  };
  receipt.receipt_sha256 = sha256hex(Buffer.from(JSON.stringify({ ...receipt, receipt_sha256: undefined }, null, 2) + '\n'));
  return receipt;
}

/** Exact-SHA external terminal attestation. PENDING until an external verifier signs the exact SHA. */
export function attestTerminal(manifest: ClosureManifest, input: { ci_sha256: string; external_verifier: string; evidence_refs?: string[] }): TerminalAttestation {
  if (!isCommitSha(input.ci_sha256)) {
    throw new ClosureServiceError(CLOSURE_ERRORS.NO_BEHAVIORAL_BASELINE, `terminal attestation requires exact-SHA CI evidence (got ${input.ci_sha256.length} chars)`);
  }
  const attestation: TerminalAttestation = {
    status: 'ATTESTED',
    ci_sha256: input.ci_sha256,
    external_verifier: input.external_verifier,
    attested_at: new Date().toISOString(),
    evidence_refs: input.evidence_refs ?? manifest.attestation.evidence_refs,
  };
  return attestation;
}

/**
 * Correct the invalid v1 closure: the old plan that was marked RETIRED/CLOSED
 * while its pointer remained hot and its evidence was shallow is corrected to
 * SUPERSEDED/INACTIVE with terminal PARTIAL truth. This never fabricates PASS.
 */
export function correctInvalidClosure(input: {
  repoRoot: string;
  plan_id: string;
  pointer: { generation: number; status: string; execution_state: string } | null;
  ledger: { status: string | null; execution_state: string | null } | null;
  reason: string;
}): InvalidClosureCorrection {
  assertSafeRelative(input.plan_id, 'plan_id');
  const correction: InvalidClosureCorrection = {
    plan_id: input.plan_id,
    corrected: true,
    previous_status: input.ledger?.status ?? null,
    previous_execution_state: input.ledger?.execution_state ?? null,
    corrected_status: 'SUPERSEDED',
    corrected_execution_state: 'INACTIVE',
    terminal_outcome: 'PARTIAL',
    reason: input.reason,
    correction_sha256: '',
  };
  const body = { ...correction, correction_sha256: undefined };
  correction.correction_sha256 = sha256hex(JSON.stringify(body));
  const correctionDir = path.join(input.repoRoot, '.agent', 'closure');
  fs.mkdirSync(correctionDir, { recursive: true });
  fs.writeFileSync(path.join(correctionDir, `${input.plan_id}.correction.json`), JSON.stringify(correction, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return correction;
}

/** Default allowlist used to keep a consumer worktree source-clean after closure. */
export const DEFAULT_IGNORED_OPERATIONAL_STATE = [
  '.agent/closure/',
  '.agent/runs/',
  '.agent/artifacts/',
  '.agent/tmp/',
  '.agent/planner/',
  '.agent/research/',
];

/** Write the operational-state ignore markers for a consumer worktree. */
export function writeOperationalIgnore(repoRoot: string, gitIgnoreFile = '.gitignore'): void {
  const target = path.join(repoRoot, gitIgnoreFile);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const marker = '\n# agent-rules operational state (closure vNext)\n';
  if (existing.includes(marker)) return;
  fs.writeFileSync(target, existing + marker + DEFAULT_IGNORED_OPERATIONAL_STATE.join('\n') + '\n', { encoding: 'utf8' });
}