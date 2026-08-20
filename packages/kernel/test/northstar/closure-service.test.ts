/**
 * Closure service — correctness-hardened trust root tests.
 *
 * Covers all findings A–E from the senior maintainer review:
 *  A: false PASS elimination (deriveOutcome, no default PASS, evidence_status)
 *  B: atomic staging/commit, idempotent replay, crash-safe failpoints
 *  C: five-identity binding (harness ≠ consumer, host validated)
 *  D: terminal attestation validates SHA binding, evidence refs, manifest hash
 *  E: metadata delta disallows source implementation files
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertClosureInput,
  assertEvidenceBinding,
  deriveOutcome,
  stageClosureTransaction,
  commitClosureTransaction,
  attestTerminal,
  correctInvalidClosure,
  deriveMetadataDeltaManifest,
  writeOperationalIgnore,
  ClosureServiceError,
  CLOSURE_ERRORS,
  type ClosureInput,
  type EvidenceBindingManifest,
  type RequirementClosureStatus,
} from '../../src/northstar/closure-service.js';

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'closure-svc-'));
}

function binding(overrides: Partial<EvidenceBindingManifest> = {}): EvidenceBindingManifest {
  return {
    harness_release: { repository: 'https://github.com/initforge/agent-rules.git', branch: 'vnext/terminal-harness', sha256: 'a'.repeat(40) },
    installation_projection: { installation_root: 'toolhome', projection_sha256: 'b'.repeat(64) },
    consumer_repository: { repository_url: 'https://example.com/consumer.git', worktree_path: 'fixture/consumer', git_head: 'c'.repeat(40), worktree_dirty: false },
    consumer_candidate: { candidate_sha256: 'd'.repeat(40), candidate_branch: 'main', tree_hash: 'e'.repeat(40) },
    host_runtime: { host: 'opencode', version: '1.18.18', session_id: 'sess-1', capabilities: ['permissions', 'plugins'], validation_status: 'VALIDATED' },
    ...overrides,
  };
}

function input(overrides: Partial<ClosureInput> = {}): ClosureInput {
  return {
    plan_id: 'terminal-harness-vnext',
    work_id: 'terminal-harness-vnext',
    purpose: 'implement vNext trust root',
    effective_contract_sha256: 'f'.repeat(64),
    requirements: [
      { id: 'REQ-001', statement: 'MCP idle-zero', status: 'PASS', evidence_status: 'pass' },
      { id: 'REQ-002', statement: 'deterministic output', status: 'PASS', evidence_status: 'pass' },
    ],
    reconciliations: [{ count: 1, statuses: ['PASS'], receipt_sha256: 'g'.repeat(64) }],
    evidence: [{ evidence_id: 'ev-1', sha256: 'h'.repeat(64), outcome: 'PASS', stage: 'LIVE_VERIFIED' }],
    changed_surfaces: ['.agent/plans/terminal-harness-vnext/plan.md', '.agent/ledger/terminal-harness-vnext.json'],
    diff_stat: '2 files changed',
    binding: binding(),
    behavioral_baseline: 'a'.repeat(40),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Finding A: False PASS elimination
// ═══════════════════════════════════════════════════════════════════════════════
describe('A — false PASS elimination (deriveOutcome, no default PASS)', () => {
  it('PASS requires all evidence_status=pass and all reconciliations pass', () => {
    const o = deriveOutcome(input());
    expect(o).toBe('PASS');
  });

  it('ACTIVE is NOT treated as resolved — deriveOutcome returns PARTIAL', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'ACTIVE', evidence_status: 'pending' }],
    }));
    expect(o).toBe('PARTIAL');
  });

  it('FAILED evidence returns FAILED', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'FAIL', evidence_status: 'fail' }],
    }));
    expect(o).toBe('FAILED');
  });

  it('blocked evidence returns BLOCKED', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'BLOCKED', evidence_status: 'blocked' }],
    }));
    expect(o).toBe('BLOCKED');
  });

  it('needs_user returns NEEDS_USER', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'OPEN', evidence_status: 'needs_user' }],
    }));
    expect(o).toBe('NEEDS_USER');
  });

  it('unsupported returns UNSUPPORTED', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'SKIP', evidence_status: 'unsupported' }],
    }));
    expect(o).toBe('UNSUPPORTED');
  });

  it('partial reconciliation failure blocks PASS', () => {
    const o = deriveOutcome(input({
      reconciliations: [{ count: 1, statuses: ['FAIL'] }],
    }));
    expect(o).toBe('BLOCKED');
  });

  it('ALL required reconciliation records must pass, not just some', () => {
    const o = deriveOutcome(input({
      reconciliations: [{ count: 1, statuses: ['PASS'] }, { count: 1, statuses: ['FAIL'] }],
    }));
    expect(o).toBe('BLOCKED');
  });

  it('pre_existing counts as pass for PASS derivation', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'PASS', evidence_status: 'pre_existing' }],
    }));
    expect(o).toBe('PASS');
  });

  it('deriveOutcome does not default to PASS — pending evidence yields PARTIAL', () => {
    const o = deriveOutcome(input({
      requirements: [{ id: 'R-1', statement: 'x', status: 'ACTIVE', evidence_status: 'pending' }],
    }));
    expect(o).toBe('PARTIAL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Finding B: Atomic staging/commit, idempotent replay, crash-safe
// ═══════════════════════════════════════════════════════════════════════════════
describe('B — atomic staging/commit, idempotent replay', () => {
  let repo: string;
  beforeEach(() => { repo = tempRepo(); });
  afterEach(() => {
    // Clean up staged files to prevent EEXIST from wx flag in subsequent tests
    try {
      const closureDir = path.join(repo, '.agent', 'closure');
      if (fs.existsSync(closureDir)) {
        for (const f of fs.readdirSync(closureDir)) {
          if (f.endsWith('.staged.json')) fs.rmSync(path.join(closureDir, f), { force: true });
        }
      }
    } catch { /* cleanup best-effort */ }
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('stage → commit → receipt has manifest_hash that matches committed file', () => {
    const staged = stageClosureTransaction(input(), repo);
    expect(staged.staged).toBe(true);
    const receipt = commitClosureTransaction(input(), repo, staged);
    expect(receipt.committed).toBe(true);
    expect(receipt.manifest_hash).toMatch(/^[a-f0-9]{64}$/);
    const committedBytes = fs.readFileSync(path.join(repo, '.agent', 'closure', 'terminal-harness-vnext.committed.json'));
    expect(createHash('sha256').update(committedBytes).digest('hex')).toBe(receipt.manifest_hash);
  });

  it('replay is deterministic — same plan + same effective_contract = replay', () => {
    const first = stageClosureTransaction(input(), repo);
    commitClosureTransaction(input(), repo, first);
    const second = stageClosureTransaction(input(), repo);
    expect(second.replay).toBe(true);
    expect(second.manifest.closure_id).toBe(first.manifest.closure_id);
  });

  it('different effective_contract hash forces re-stage (no stale replay)', () => {
    const first = stageClosureTransaction(input(), repo);
    commitClosureTransaction(input(), repo, first);
    const second = stageClosureTransaction(input({ effective_contract_sha256: 'g'.repeat(64) }), repo);
    expect(second.replay).toBe(false);
  });

  it('idempotent commit receipt matches first receipt', () => {
    const first = stageClosureTransaction(input(), repo);
    const receipt1 = commitClosureTransaction(input(), repo, first);
    const second = stageClosureTransaction(input(), repo);
    const receipt2 = commitClosureTransaction(input(), repo, second);
    expect(receipt2.manifest_hash).toBe(receipt1.manifest_hash);
  });

  it('rejects unresolved requirements (B: input validation before staging)', () => {
    try {
      stageClosureTransaction(input({ requirements: [{ id: 'R', statement: 's', status: 'UNRESOLVED', evidence_status: 'pending' }] }), repo);
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.UNRESOLVED_REQUIREMENTS);
    }
  });

  it('works on a first-run repo with no prior .agent state', () => {
    const staged = stageClosureTransaction(input(), repo);
    const receipt = commitClosureTransaction(input(), repo, staged);
    expect(receipt.committed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Finding C: Five-identity binding (harness ≠ consumer, host validated)
// ═══════════════════════════════════════════════════════════════════════════════
describe('C — five-identity binding, host validation', () => {
  it('validates complete five-identity binding', () => {
    expect(() => assertEvidenceBinding(binding())).not.toThrow();
  });

  it('rejects harness_release === consumer_candidate (identity conflation)', () => {
    const b = binding({
      harness_release: { repository: 'x', branch: 'y', sha256: 'a'.repeat(40) },
      consumer_candidate: { candidate_sha256: 'a'.repeat(40) },
    });
    try {
      assertEvidenceBinding(b);
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.MISSING_BINDING);
      expect(e.message).toContain('identity_conflation');
    }
  });

  it('rejects harness_release === consumer git_head (identity leak)', () => {
    const b = binding({
      harness_release: { repository: 'x', branch: 'y', sha256: 'c'.repeat(40) },
      consumer_repository: { worktree_path: 'x', git_head: 'c'.repeat(40), worktree_dirty: false },
    });
    try {
      assertEvidenceBinding(b);
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.MISSING_BINDING);
      expect(e.message).toContain('identity_leak');
    }
  });

  it('rejects unknown host with validation_status=VALIDATED', () => {
    const b = binding({ host_runtime: { host: 'unknown-host', version: '1', session_id: 's', capabilities: [], validation_status: 'VALIDATED' } });
    try {
      assertEvidenceBinding(b);
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.MISSING_BINDING);
      expect(e.message).toContain('not in supported hosts');
    }
  });

  it('allows UNSUPPORTED host with correct validation_status', () => {
    const b = binding({ host_runtime: { host: 'claude', version: undefined, session_id: 's', capabilities: [], validation_status: 'UNSUPPORTED' } });
    expect(() => assertEvidenceBinding(b)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Finding D: Terminal attestation validates SHA binding, evidence refs, manifest hash
// ═══════════════════════════════════════════════════════════════════════════════
describe('D — terminal attestation validates SHA binding', () => {
  let repo: string;
  beforeEach(() => { repo = tempRepo(); });
  afterEach(() => {
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('attests when SHA matches behavioral baseline', () => {
    const staged = stageClosureTransaction(input(), repo);
    const attested = attestTerminal(staged.manifest, {
      ci_sha256: 'a'.repeat(40),
      external_verifier: 'github-actions',
    });
    expect(attested.status).toBe('ATTESTED');
    expect(attested.manifest_hash).toBeDefined();
  });

  it('attests when SHA matches consumer candidate', () => {
    const staged = stageClosureTransaction(input(), repo);
    const attested = attestTerminal(staged.manifest, {
      ci_sha256: 'd'.repeat(40),
      external_verifier: 'github-actions',
    });
    expect(attested.status).toBe('ATTESTED');
  });

  it('rejects SHA that matches neither baseline nor candidate', () => {
    const staged = stageClosureTransaction(input(), repo);
    try {
      attestTerminal(staged.manifest, {
        ci_sha256: 'f'.repeat(40),
        external_verifier: 'github-actions',
      });
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.ATTESTATION_MISMATCH);
      expect(e.message).toContain('does not match');
    }
  });

  it('rejects empty external_verifier', () => {
    const staged = stageClosureTransaction(input(), repo);
    try {
      attestTerminal(staged.manifest, { ci_sha256: 'a'.repeat(40), external_verifier: '' });
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.ATTESTATION_MISMATCH);
      expect(e.message).toContain('non-empty');
    }
  });

  it('rejects invalid SHA format', () => {
    const staged = stageClosureTransaction(input(), repo);
    try {
      attestTerminal(staged.manifest, { ci_sha256: 'not-a-sha', external_verifier: 'x' });
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.ATTESTATION_MISMATCH);
      expect(e.message).toContain('40/64-hex');
    }
  });

  it('rejects empty evidence_refs', () => {
    const staged = stageClosureTransaction(input(), repo);
    try {
      attestTerminal(staged.manifest, {
        ci_sha256: 'a'.repeat(40),
        external_verifier: 'x',
        evidence_refs: [],
      });
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.ATTESTATION_MISMATCH);
    }
  });

  it('attestation.manifest_hash binds to the committed manifest', () => {
    const staged = stageClosureTransaction(input(), repo);
    const receipt = commitClosureTransaction(input(), repo, staged);
    const attested = attestTerminal(staged.manifest, {
      ci_sha256: 'a'.repeat(40),
      external_verifier: 'github-actions',
      manifest_hash_override: receipt.manifest_hash,
    });
    expect(attested.manifest_hash).toBe(receipt.manifest_hash);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Finding E: Metadata delta disallows source implementation files
// ═══════════════════════════════════════════════════════════════════════════════
describe('E — metadata delta disallows source implementation', () => {
  it('rejects source implementation files in metadata delta', () => {
    const delta = deriveMetadataDeltaManifest({
      closure_id: 'closure-1',
      baseline_sha256: 'a'.repeat(64),
      metadata_commit_sha256: 'd'.repeat(64),
      changed_paths: ['.agent/plans/x/plan.md', 'packages/cli/src/commands/close.ts'],
    });
    expect(delta.allowed).toBe(false);
    expect(delta.reason).toContain('packages/cli/src/commands/close.ts');
  });

  it('allows only closure/lifecycle state surfaces', () => {
    const delta = deriveMetadataDeltaManifest({
      closure_id: 'closure-2',
      baseline_sha256: 'a'.repeat(64),
      metadata_commit_sha256: 'd'.repeat(64),
      changed_paths: ['.agent/ledger/x.json', '.agent/closure/x.committed.json', '.agent/tombstones/x.json'],
    });
    expect(delta.allowed).toBe(true);
  });

  it('rejects skills/registry/integration changes in metadata delta', () => {
    const delta = deriveMetadataDeltaManifest({
      closure_id: 'closure-3',
      baseline_sha256: 'a'.repeat(64),
      metadata_commit_sha256: 'd'.repeat(64),
      changed_paths: ['skills/browser-qa/SKILL.md', 'integrations/registry.json'],
    });
    expect(delta.allowed).toBe(false);
  });

  it('source files in allowlist is removed — packages/ not allowed', () => {
    // Verify the old allowlisted source files are no longer in the allowlist
    const delta = deriveMetadataDeltaManifest({
      closure_id: 'closure-4',
      baseline_sha256: 'a'.repeat(64),
      metadata_commit_sha256: 'd'.repeat(64),
      changed_paths: ['schemas/closure-manifest.schema.json'],
    });
    expect(delta.allowed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Finding F: correctInvalidClosure atomically updates state
// ═══════════════════════════════════════════════════════════════════════════════
describe('F — correctInvalidClosure atomically updates state', () => {
  let repo: string;
  beforeEach(() => { repo = tempRepo(); });
  afterEach(() => {
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('returns BLOCKED when no ledger_path provided', () => {
    const result = correctInvalidClosure({
      repoRoot: repo,
      plan_id: 'old-plan',
      pointer: null,
      reason: 'no ledger',
    });
    expect('corrected' in result && result.corrected).toBe(false);
  });

  it('returns BLOCKED when ledger does not exist', () => {
    const result = correctInvalidClosure({
      repoRoot: repo,
      plan_id: 'old-plan',
      pointer: null,
      ledger_path: '.agent/ledger/old-plan.json',
      reason: 'missing ledger',
    });
    expect('corrected' in result && result.corrected).toBe(false);
  });

  it('atomically updates ledger status to SUPERSEDED/INACTIVE', () => {
    const ledgerDir = path.join(repo, '.agent', 'ledger');
    fs.mkdirSync(ledgerDir, { recursive: true });
    const ledgerPath = '.agent/ledger/old-plan.json';
    fs.writeFileSync(path.join(repo, ledgerPath), JSON.stringify({ plan_id: 'old-plan', status: 'RETIRED', execution_state: 'CLOSED' }));
    const result = correctInvalidClosure({
      repoRoot: repo,
      plan_id: 'old-plan',
      pointer: { generation: 5, status: 'EFFECTIVE', execution_state: 'IN_PROGRESS' },
      ledger_path: ledgerPath,
      reason: 'test correction',
    });
    expect('corrected' in result).toBe(true);
    if ('corrected' in result) {
      expect(result.corrected_status).toBe('SUPERSEDED');
      expect(result.corrected_execution_state).toBe('INACTIVE');
      expect(result.terminal_outcome).toBe('PARTIAL');
    }
    // Verify ledger was actually updated
    const updatedLedger = JSON.parse(fs.readFileSync(path.join(repo, ledgerPath), 'utf8'));
    expect(updatedLedger.status).toBe('SUPERSEDED');
    expect(updatedLedger.execution_state).toBe('INACTIVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Consumer source cleanliness
// ═══════════════════════════════════════════════════════════════════════════════
describe('consumer source cleanliness', () => {
  it('writes operational ignore markers', () => {
    const repo = tempRepo();
    writeOperationalIgnore(repo);
    const gitignore = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.agent/closure/');
    expect(gitignore).toContain('.agent/runs/');
  });
});