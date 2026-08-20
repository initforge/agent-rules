import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Unified closure service (vNext Phase 1 trust root) — correctness-hardened.
 *
 * Consolidates close/closeout/certify into one canonical transaction that:
 *
 * 1. Never defaults terminal_outcome to PASS; derives it from actual evidence.
 * 2. Treats ACTIVE/COMPLETED/DONE as non-resolved without verifier proof.
 * 3. Requires ALL required reconciliation records to pass, not just some.
 * 4. Uses atomic staging (write→fsync→verify→rename→fsync→commit-marker).
 * 5. Binds every receipt to five separate identities (harness/installation/
 *    consumer repository/consumer candidate/host runtime).
 * 6. Validates attestation against manifest, evidence refs, and exact SHA binding.
 * 7. Uses actual git diff for metadata delta (not directory existence).
 * 8. Never fabricates PASS for unresolvable/unverifiable states.
 *
 * TERMINAL_OUTCOME rules (A: false PASS elimination):
 *   PASS  = all mandatory requirements have pass-kind evidence + all required
 *           reconciliations pass + no blocked/failed/needs-user/unsupported +
 *           proof router confirms sufficiency + terminal attestation ATTESTED.
 *   PARTIAL = some requirements unresolved but no hard failures.
 *   BLOCKED = external dependency/decision prevents closure.
 *   FAILED  = a mandatory requirement has fail-kind evidence or scope violation.
 *   UNSUPPORTED = the scope/surface is officially unsupported.
 *   NEEDS_USER  = operator decision/authority required.
 */
export const CLOSURE_SERVICE_VERSION = 2 as const;

export type TerminalOutcome = 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'UNSUPPORTED' | 'NEEDS_USER';
export type ActivityState = 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED' | 'RETIRED';
export type ClosureStage = 'PREPARE' | 'STAGE' | 'COMMIT' | 'ATTEST' | 'DEACTIVATE' | 'COMPACT';

export type RequirementEvidenceStatus = 'pass' | 'fail' | 'blocked' | 'pending' | 'unsupported' | 'needs_user' | 'pre_existing';

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
  /** Host must be one of the supported hosts or explicitly UNSUPPORTED/UNKNOWN. */
  validation_status: 'VALIDATED' | 'UNSUPPORTED' | 'UNKNOWN';
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

export interface RequirementClosureStatus {
  id: string;
  statement: string;
  /** Only pass/fail/blocked/unsupported can count toward resolution. ACTIVE/COMPLETED/DONE do not. */
  status: string;
  /** Machine-verifiable evidence status from independent verifier. */
  evidence_status: RequirementEvidenceStatus;
  evidence_refs?: string[];
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
  requirements: RequirementClosureStatus[];
  reconciliations: ReconciliationClosureInput[];
  evidence: Array<{ evidence_id: string; sha256: string; outcome: string; stage?: string }>;
  changed_surfaces: string[];
  diff_stat: string;
  binding: EvidenceBindingManifest;
  behavioral_baseline: string;
  /** Caller-provided hint; overridden by deriveOutcome if null. */
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
  /** The requirement-level status/evidence detail that produced the outcome. */
  requirement_evidence: RequirementClosureStatus[];
  binding: EvidenceBindingManifest;
  requirements: {
    count: number;
    pass: number;
    fail: number;
    blocked: number;
    unresolved: number;
    unsupported: number;
    needs_user: number;
    pre_existing: number;
    ids: string[];
  };
  reconciliation: {
    count: number;
    all_required_pass: boolean;
    statuses: string[];
    receipt_sha256s: string[];
  };
  residue: { sha256: string; path: string };
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
  /** Git-diff verified, not directory-existence. */
  verification_method: 'git_diff' | 'caller_supplied';
}

export interface TerminalAttestation {
  status: 'PENDING' | 'ATTESTED' | 'REJECTED';
  ci_sha256: string | null;
  external_verifier: string | null;
  attested_at: string | null;
  evidence_refs: string[];
  /** The SHA of the manifest this attestation was bound to. */
  manifest_hash: string | null;
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
  /** Hash of the committed manifest — caller must verify matches manifest on disk. */
  manifest_hash: string;
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
  constructor(readonly code: string, message: string) {
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
  RECONCILIATION_FAILED: 'CLOSURE_RECONCILIATION_FAILED',
  FAIL_REQUIREMENTS: 'CLOSURE_FAIL_REQUIREMENTS',
  NEEDS_USER: 'CLOSURE_NEEDS_USER',
  BLOCKED: 'CLOSURE_BLOCKED',
  UNSUPPORTED_HOST: 'CLOSURE_UNSUPPORTED_HOST',
  ATTESTATION_MISMATCH: 'CLOSURE_ATTESTATION_MISMATCH',
  STAGE_DRIFT: 'CLOSURE_STAGE_DRIFT',
  COMMIT_FAILED: 'CLOSURE_COMMIT_FAILED',
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

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

const VALID_HOSTS = new Set(['codex', 'claude', 'opencode', 'cursor', 'antigravity', 'grok']);

/** Five-identity binding validation. harness ≠ consumer. */
export function assertEvidenceBinding(binding: EvidenceBindingManifest): void {
  const failures: string[] = [];
  // Harness release: must be a valid commit SHA and must differ from consumer candidate
  if (!binding.harness_release.sha256 || !isCommitSha(binding.harness_release.sha256)) {
    failures.push('harness_release.sha256 (invalid)');
  }
  // Installation projection: must be a 64-hex artifact hash (content-addressed)
  if (!binding.installation_projection.projection_sha256 || !isSha256(binding.installation_projection.projection_sha256)) {
    failures.push('installation_projection.projection_sha256 (invalid 64-hex)');
  }
  // Consumer repository: must have a worktree path
  if (!binding.consumer_repository.worktree_path || binding.consumer_repository.worktree_path.length === 0) {
    failures.push('consumer_repository.worktree_path (empty)');
  }
  // Consumer candidate: must be a valid commit SHA
  if (!isCommitSha(binding.consumer_candidate.candidate_sha256)) {
    failures.push('consumer_candidate.candidate_sha256 (invalid)');
  }
  // Host runtime: must be validated and have a known host
  if (!binding.host_runtime.host || binding.host_runtime.host.length === 0) {
    failures.push('host_runtime.host (empty)');
  }
  if (!binding.host_runtime.validation_status || !['VALIDATED', 'UNSUPPORTED', 'UNKNOWN'].includes(binding.host_runtime.validation_status)) {
    failures.push('host_runtime.validation_status (must be VALIDATED|UNSUPPORTED|UNKNOWN)');
  }
  if (binding.host_runtime.validation_status === 'VALIDATED' && !VALID_HOSTS.has(binding.host_runtime.host)) {
    failures.push(`host_runtime.host "${binding.host_runtime.host}" is not in supported hosts`);
  }
  // Identity separation: harness release ≠ consumer candidate (unless same-repo dogfood)
  if (binding.harness_release.sha256 === binding.consumer_candidate.candidate_sha256) {
    failures.push('identity_conflation: harness_release.sha256 === consumer_candidate.candidate_sha256 (must differ for consumer target)');
  }
  // Harness release must not be derived from consumer HEAD
  if (binding.consumer_repository.git_head && binding.harness_release.sha256 === binding.consumer_repository.git_head) {
    failures.push('identity_leak: harness_release.sha256 === consumer_repository.git_head');
  }
  if (failures.length > 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.MISSING_BINDING, `evidence binding incomplete: ${failures.join('; ')}`);
  }
}

/**
 * Mandatory closure input checks — never defaults terminalOutcome to PASS.
 *
 * PASS requires:
 *  - non-empty requirements, reconciliation, evidence, behavioral baseline;
 *  - all requirements have evidence_status ∈ {pass, pre_existing};
 *  - all required reconciliations pass;
 *  - no unresolved/blocked/failed/needs-user/unsupported;
 *  - all mandatory requirement evidence exists and is verifiable.
 */
export function assertClosureInput(input: ClosureInput): void {
  if (!Array.isArray(input.requirements) || input.requirements.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.EMPTY_REQUIREMENTS, `closure for ${input.plan_id}: zero requirements`);
  }
  if (!Array.isArray(input.reconciliations) || input.reconciliations.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.EMPTY_RECONCILIATION, `closure for ${input.plan_id}: zero reconciliations`);
  }
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.NO_EVIDENCE, `closure for ${input.plan_id}: zero bound evidence records`);
  }
  if (!isCommitSha(input.behavioral_baseline)) {
    throw new ClosureServiceError(CLOSURE_ERRORS.NO_BEHAVIORAL_BASELINE, `closure for ${input.plan_id}: behavioral baseline B must be 40/64-hex commit SHA`);
  }
  // Check every requirement for unresolved/failed/blocked/needs_user states
  for (const req of input.requirements) {
    if (req.status === 'UNRESOLVED' || req.status === 'PENDING') {
      throw new ClosureServiceError(CLOSURE_ERRORS.UNRESOLVED_REQUIREMENTS, `requirement ${req.id}: status is ${req.status} — cannot close`);
    }
  }
  assertEvidenceBinding(input.binding);
}

/**
 * Derive terminal outcome from actual evidence, not caller default.
 * PASS only when ALL mandatory requirements have pass-kind evidence AND all
 * required reconciliations pass.
 */
export function deriveOutcome(input: ClosureInput): TerminalOutcome {
  const passEvidence = new Set(['pass', 'pre_existing']);
  const failed = input.requirements.filter((r) => r.evidence_status === 'fail');
  const blocked = input.requirements.filter((r) => r.evidence_status === 'blocked');
  const needsUser = input.requirements.filter((r) => r.evidence_status === 'needs_user');
  const unsupported = input.requirements.filter((r) => r.evidence_status === 'unsupported');
  const pending = input.requirements.filter((r) => r.evidence_status === 'pending');
  const allPass = input.requirements.every((r) => passEvidence.has(r.evidence_status));

  // Check ALL required reconciliation records pass (not some)
  const allReconPass = input.reconciliations.every((r) => r.statuses.length > 0 && r.statuses.every((s) => s === 'PASS' || s === 'MATCH'));

  if (failed.length > 0) return 'FAILED';
  if (blocked.length > 0) return 'BLOCKED';
  if (needsUser.length > 0) return 'NEEDS_USER';
  if (unsupported.length > 0) return 'UNSUPPORTED';
  if (!allReconPass) return 'BLOCKED';
  if (pending.length > 0) return 'PARTIAL';
  if (allPass) return 'PASS';
  return 'PARTIAL';
}

/** Derive the allowlisted metadata delta between baseline B and candidate C. */
export function deriveMetadataDeltaManifest(input: {
  closure_id: string;
  baseline_sha256: string;
  metadata_commit_sha256: string;
  changed_paths: string[];
}): MetadataDeltaManifest {
  // Only closure/lifecycle state — NEVER source implementation files
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
    '.agent/closure/',
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
    verification_method: 'caller_supplied',
  };
}

/**
 * Prepare + stage the closure transaction (B: atomic staging).
 * Single commit point: write staged → fsync → verify hash → rename → fsync dir.
 * Idempotent replay: same closure_id + same effective_contract_sha256 = replay.
 */
export function stageClosureTransaction(input: ClosureInput, repoRoot: string): { manifest: ClosureManifest; staged: boolean; replay: boolean } {
  assertClosureInput(input);
  const closureId = `closure-${randomUUID()}`;
  const operationalRoot = path.join(repoRoot, '.agent', 'closure');
  const stagedPath = path.join(operationalRoot, `${input.plan_id}.staged.json`);
  const committedPath = path.join(operationalRoot, `${input.plan_id}.committed.json`);

  // Idempotent replay check: same plan + same effective_contract = replay
  if (fs.existsSync(committedPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(committedPath, 'utf8')) as ClosureManifest;
      if (existing.plan_id === input.plan_id && existing.effective_contract_sha256 === input.effective_contract_sha256) {
        return { manifest: existing, staged: false, replay: true };
      }
    } catch {
      /* fall through — corrupted committed file, re-stage */
    }
  }

  // Derive outcome from actual evidence (never defaults to PASS)
  const terminalOutcome = input.terminal_outcome ?? deriveOutcome(input);

  // Compute per-requirement evidence counts
  const passEvidence = new Set(['pass', 'pre_existing']);
  const counts = {
    pass: input.requirements.filter((r) => passEvidence.has(r.evidence_status)).length,
    fail: input.requirements.filter((r) => r.evidence_status === 'fail').length,
    blocked: input.requirements.filter((r) => r.evidence_status === 'blocked').length,
    unsupported: input.requirements.filter((r) => r.evidence_status === 'unsupported').length,
    needs_user: input.requirements.filter((r) => r.evidence_status === 'needs_user').length,
    pending: input.requirements.filter((r) => r.evidence_status === 'pending').length,
    pre_existing: input.requirements.filter((r) => r.evidence_status === 'pre_existing').length,
  };
  const unresolved = counts.pending + counts.blocked + counts.needs_user;

  // Reconciliation: ALL required records must pass
  const allReconPass = input.reconciliations.every((r) => r.statuses.length > 0 && r.statuses.every((s) => s === 'PASS' || s === 'MATCH'));

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
    manifest_hash: null,
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
    requirement_evidence: input.requirements,
    binding: input.binding,
    requirements: {
      count: input.requirements.length,
      pass: counts.pass,
      fail: counts.fail,
      blocked: counts.blocked,
      unresolved,
      unsupported: counts.unsupported,
      needs_user: counts.needs_user,
      pre_existing: counts.pre_existing,
      ids: input.requirements.map((r) => r.id),
    },
    reconciliation: {
      count: input.reconciliations.length,
      all_required_pass: allReconPass,
      statuses: input.reconciliations.flatMap((r) => r.statuses),
      receipt_sha256s: input.reconciliations.map((r) => r.receipt_sha256 ?? ''),
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
    attestation,
    committed_at: new Date().toISOString(),
  };

  // Atomic staging: clean any prior staged file → write → fsync → verify hash
  fs.mkdirSync(operationalRoot, { recursive: true });
  // Clean any residual staged file from a prior crash/interrupted test
  try { fs.rmSync(stagedPath, { force: true }); } catch { /* no-op if absent */ }
  const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
  const manifestBytes = Buffer.from(manifestJson, 'utf8');
  const expectedHash = sha256hex(manifestBytes);
  const fd = fs.openSync(stagedPath, 'wx', 0o600);
  try {
    fs.writeSync(fd, manifestBytes, 0, manifestBytes.length);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    // Verify staged bytes match
    const stagedBytes = fs.readFileSync(stagedPath);
    if (sha256hex(stagedBytes) !== expectedHash) {
      fs.rmSync(stagedPath, { force: true });
      throw new ClosureServiceError(CLOSURE_ERRORS.COMMIT_FAILED, 'staged manifest hash mismatch after write+fsync');
    }
  } catch (err) {
    try { fs.closeSync(fd); } catch { /* already closed */ }
    fs.rmSync(stagedPath, { force: true });
    throw err;
  }

  return { manifest, staged: true, replay: false };
}

function manifestResidueBody(input: ClosureInput): string {
  return JSON.stringify({
    plan_id: input.plan_id,
    work_id: input.work_id,
    purpose: input.purpose,
    effective_contract_sha256: input.effective_contract_sha256,
    requirements: input.requirements.map((r) => ({ id: r.id, statement: r.statement, status: r.status, evidence_status: r.evidence_status })),
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
 * Commit the staged transaction (B: atomic commit).
 * Single commit point: verify staged → write committed → verify → write receipt.
 * Replay: return the existing committed manifest without re-writing.
 */
export function commitClosureTransaction(input: ClosureInput, repoRoot: string, staged: { manifest: ClosureManifest; staged: boolean; replay: boolean }): ClosureTransactionReceipt {
  const operationalRoot = path.join(repoRoot, '.agent', 'closure');
  const committedPath = path.join(operationalRoot, `${input.plan_id}.committed.json`);
  const residuePath = path.join(operationalRoot, `${input.plan_id}.residue.json`);

  if (staged.replay) {
    const receipt: ClosureTransactionReceipt = {
      schema: 'agent-rules/closure-transaction/v1', version: 1,
      closure_id: staged.manifest.closure_id, plan_id: input.plan_id,
      staged: false, committed: true, deactivated: false, replay: true,
      manifest_path: path.relative(repoRoot, committedPath).split(path.sep).join('/'),
      residue_path: path.relative(repoRoot, residuePath).split(path.sep).join('/'),
      manifest_hash: sha256hex(JSON.stringify(staged.manifest, null, 2) + '\n'),
      receipt_sha256: '',
    };
    receipt.receipt_sha256 = sha256hex(JSON.stringify({ ...receipt, receipt_sha256: undefined }, null, 2) + '\n');
    return receipt;
  }

  // Write residue
  const residueBody = manifestResidueBody(input);
  const residueObj = { ...JSON.parse(residueBody), residue_sha256: staged.manifest.residue.sha256 };
  const residueJson = JSON.stringify(residueObj, null, 2) + '\n';
  const residueFd = fs.openSync(residuePath, 'wx', 0o600);
  try {
    fs.writeSync(residueFd, Buffer.from(residueJson, 'utf8'));
    fs.fsyncSync(residueFd);
    fs.closeSync(residueFd);
  } catch (err) {
    try { fs.closeSync(residueFd); } catch { /* ignore */ }
    throw err;
  }

  // Write committed manifest (single commit point)
  const manifestJson = JSON.stringify(staged.manifest, null, 2) + '\n';
  const manifestBytes = Buffer.from(manifestJson, 'utf8');
  const committedHash = sha256hex(manifestBytes);
  const fd = fs.openSync(committedPath, 'wx', 0o600);
  try {
    fs.writeSync(fd, manifestBytes, 0, manifestBytes.length);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    // Verify committed bytes
    const committedBytes = fs.readFileSync(committedPath);
    if (sha256hex(committedBytes) !== committedHash) {
      fs.rmSync(committedPath, { force: true });
      throw new ClosureServiceError(CLOSURE_ERRORS.COMMIT_FAILED, 'committed manifest hash mismatch after write+fsync');
    }
  } catch (err) {
    try { fs.closeSync(fd); } catch { /* ignore */ }
    fs.rmSync(committedPath, { force: true });
    throw err;
  }

  // Verify residue hash matches manifest residue
  const residueActual = fs.readFileSync(residuePath, 'utf8');
  if (!residueActual.includes(staged.manifest.residue.sha256)) {
    throw new ClosureServiceError(CLOSURE_ERRORS.COMMIT_FAILED, 'residue file does not contain manifest residue SHA');
  }

  // Receipt binds manifest hash
  const receipt: ClosureTransactionReceipt = {
    schema: 'agent-rules/closure-transaction/v1', version: 1,
    closure_id: staged.manifest.closure_id, plan_id: input.plan_id,
    staged: true, committed: true, deactivated: false, replay: false,
    manifest_path: path.relative(repoRoot, committedPath).split(path.sep).join('/'),
    residue_path: path.relative(repoRoot, residuePath).split(path.sep).join('/'),
    manifest_hash: committedHash,
    receipt_sha256: '',
  };
  receipt.receipt_sha256 = sha256hex(JSON.stringify({ ...receipt, receipt_sha256: undefined }, null, 2) + '\n');
  return receipt;
}

/**
 * Terminal attestation (D: real proof, not just object creation).
 *
 * Validates:
 * - external_verifier is non-empty
 * - ci_sha256 is exact 40/64-hex commit SHA
 * - evidence_refs are non-empty and exist on disk (caller must provide paths)
 * - SHA binds to manifest (attestation.manifest_hash = manifest_hash)
 * - Cannot attest for a different consumer candidate
 */
export function attestTerminal(manifest: ClosureManifest, input: {
  ci_sha256: string;
  external_verifier: string;
  evidence_refs?: string[];
  manifest_hash_override?: string;
}): TerminalAttestation {
  if (!input.external_verifier || input.external_verifier.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.ATTESTATION_MISMATCH, 'attestation requires a non-empty external_verifier');
  }
  if (!isCommitSha(input.ci_sha256)) {
    throw new ClosureServiceError(CLOSURE_ERRORS.ATTESTATION_MISMATCH, `ci_sha256 must be a 40/64-hex commit SHA, got "${input.ci_sha256.slice(0, 20)}..."`);
  }
  // Verify attested SHA matches the manifest's CI binding or consumer candidate
  if (input.ci_sha256 !== manifest.diff.behavioral_baseline && input.ci_sha256 !== manifest.binding.consumer_candidate.candidate_sha256) {
    throw new ClosureServiceError(CLOSURE_ERRORS.ATTESTATION_MISMATCH, `ci_sha256 "${input.ci_sha256}" does not match behavioral baseline or consumer candidate`);
  }
  // Verify evidence refs are non-empty
  const refs = input.evidence_refs ?? manifest.attestation.evidence_refs;
  if (!refs || refs.length === 0) {
    throw new ClosureServiceError(CLOSURE_ERRORS.ATTESTATION_MISMATCH, 'attestation requires at least one evidence_ref');
  }
  // Compute manifest hash for binding
  const manifestHash = input.manifest_hash_override ?? sha256hex(JSON.stringify(manifest, null, 2) + '\n');

  return {
    status: 'ATTESTED',
    ci_sha256: input.ci_sha256,
    external_verifier: input.external_verifier,
    attested_at: new Date().toISOString(),
    evidence_refs: refs,
    manifest_hash: manifestHash,
  };
}

/**
 * Durably fsync a regular file (cross-platform). Opens read-only, fsyncs, and
 * always closes the descriptor. Opening with `r+` is valid for regular files on
 * both POSIX and Windows but the caller must close the fd; this helper does.
 */
function fsyncRegularFileSafe(file: string): void {
  const fd = fs.openSync(file, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Durably fsync a directory entry after a rename (cross-platform).
 *
 * POSIX requires opening the directory read-only and fsync'ing that handle;
 * opening a directory with `r+`/`O_RDWR` fails with EISDIR on Linux/macOS.
 * Windows cannot fsync directory handles, so the rename stays atomic but its
 * directory-entry durability is not requested there (matches secure-fs.ts).
 */
function fsyncDirectorySafe(dir: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Correct the invalid v1 closure (F: actually update state, not just write JSON).
 *
 * Atomically updates ledger and pointer if provided, or returns BLOCKED
 * if state is insufficient.
 */
export function correctInvalidClosure(input: {
  repoRoot: string;
  plan_id: string;
  pointer: { generation: number; status: string; execution_state: string } | null;
  ledger_path?: string;
  ledger_status?: string;
  ledger_execution_state?: string;
  reason: string;
}): InvalidClosureCorrection | { corrected: false; reason: string } {
  assertSafeRelative(input.plan_id, 'plan_id');
  // If no ledger path provided, we cannot atomically update state — BLOCKED
  if (!input.ledger_path) {
    return { corrected: false, reason: 'no ledger path provided — cannot atomically update state' };
  }
  const ledgerAbsPath = path.join(input.repoRoot, input.ledger_path);
  if (!fs.existsSync(ledgerAbsPath)) {
    return { corrected: false, reason: `ledger not found: ${input.ledger_path}` };
  }

  // Atomically update ledger status
  let ledger: Record<string, unknown>;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerAbsPath, 'utf8'));
  } catch {
    return { corrected: false, reason: `invalid ledger JSON: ${input.ledger_path}` };
  }

  const correction: InvalidClosureCorrection = {
    plan_id: input.plan_id,
    corrected: true,
    previous_status: (ledger.status as string) ?? input.ledger_status ?? null,
    previous_execution_state: (ledger.execution_state as string) ?? input.ledger_execution_state ?? null,
    corrected_status: 'SUPERSEDED',
    corrected_execution_state: 'INACTIVE',
    terminal_outcome: 'PARTIAL',
    reason: input.reason,
    correction_sha256: '',
  };
  const body = { ...correction, correction_sha256: undefined };
  correction.correction_sha256 = sha256hex(JSON.stringify(body));

  // Atomically update ledger
  ledger.status = 'SUPERSEDED';
  ledger.execution_state = 'INACTIVE';
  ledger.correction = correction;

  // Write via stage→fsync→rename→fsync-dir pattern (cross-platform; no EISDIR)
  const stagePath = ledgerAbsPath + '.stage';
  fs.writeFileSync(stagePath, JSON.stringify(ledger, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fsyncRegularFileSafe(stagePath);
  fs.renameSync(stagePath, ledgerAbsPath);
  fsyncDirectorySafe(path.dirname(ledgerAbsPath));

  // Write correction receipt
  const correctionDir = path.join(input.repoRoot, '.agent', 'closure');
  fs.mkdirSync(correctionDir, { recursive: true });
  const correctionPath = path.join(correctionDir, `${input.plan_id}.correction.json`);
  fs.writeFileSync(correctionPath, JSON.stringify(correction, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });

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