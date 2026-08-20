/**
 * Phase 1 — unified closure service: trust root for authority, lifecycle and
 * closure. Covers the vNext frozen contract requirements:
 *  - reject empty requirements/reconciliation/evidence (never false PASS);
 *  - evidence binding to four identities (harness, installation, consumer, host);
 *  - behavioral baseline B + allowlisted metadata commit C + exact-SHA attestation;
 *  - prepare/stage/commit single-point transaction with idempotent replay;
 *  - correction of the invalid v1 closure (superseded/INACTIVE, terminal PARTIAL);
 *  - operational state stays out of the tracked consumer source.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertClosureInput,
  assertEvidenceBinding,
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
} from '../../src/northstar/closure-service.js';

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'closure-svc-'));
}

function binding(overrides: Partial<EvidenceBindingManifest> = {}): EvidenceBindingManifest {
  return {
    harness_release: { repository: 'https://github.com/initforge/agent-rules.git', branch: 'vnext/terminal-harness', sha256: 'a'.repeat(64) },
    installation_projection: { installation_root: 'toolhome', projection_sha256: 'b'.repeat(64) },
    consumer_repository: { repository_url: 'https://example.com/consumer.git', worktree_path: 'fixture/consumer', git_head: 'c'.repeat(40), worktree_dirty: false },
    consumer_candidate: { candidate_sha256: 'd'.repeat(64), candidate_branch: 'main', tree_hash: 'e'.repeat(64) },
    host_runtime: { host: 'opencode', version: '1.18.18', session_id: 'sess-1', capabilities: ['permissions', 'plugins'] },
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
      { id: 'REQ-001', statement: 'MCP idle-zero', status: 'PASS' },
      { id: 'REQ-002', statement: 'deterministic output', status: 'PASS' },
    ],
    reconciliations: [{ count: 1, statuses: ['PASS'], receipt_sha256: 'g'.repeat(64) }],
    evidence: [{ evidence_id: 'ev-1', sha256: 'h'.repeat(64), outcome: 'PASS', stage: 'LIVE_VERIFIED' }],
    changed_surfaces: ['.agent/plans/terminal-harness-vnext/plan.md', '.agent/ledger/terminal-harness-vnext.json'],
    diff_stat: '2 files changed',
    binding: binding(),
    behavioral_baseline: 'a'.repeat(64),
    ...overrides,
  };
}

describe('closure-service — mandatory input gates (never false PASS)', () => {
  it('accepts a fully bound input', () => {
    expect(() => assertClosureInput(input())).not.toThrow();
  });

  it('rejects empty requirements', () => {
    expect(() => assertClosureInput(input({ requirements: [] })))
      .toThrowError(ClosureServiceError);
    try { assertClosureInput(input({ requirements: [] })); } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.EMPTY_REQUIREMENTS);
    }
  });

  it('rejects empty reconciliation', () => {
    try { assertClosureInput(input({ reconciliations: [] })); } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.EMPTY_RECONCILIATION);
    }
  });

  it('rejects empty evidence', () => {
    try { assertClosureInput(input({ evidence: [] })); } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.NO_EVIDENCE);
    }
  });

  it('rejects unresolved/pending requirements', () => {
    try {
      assertClosureInput(input({ requirements: [{ id: 'REQ-003', statement: 'pending work', status: 'PENDING' }] }));
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.UNRESOLVED_REQUIREMENTS);
    }
  });

  it('rejects missing behavioral baseline', () => {
    try { assertClosureInput(input({ behavioral_baseline: 'short' })); } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.NO_BEHAVIORAL_BASELINE);
    }
  });

  it('rejects incomplete evidence binding', () => {
    try {
      assertClosureInput(input({
        binding: binding({ harness_release: { repository: 'x', branch: 'y', sha256: 'not-a-sha' } }),
      }));
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.MISSING_BINDING);
    }
  });
});

describe('closure-service — identity binding', () => {
  it('asserts all four identities are non-empty', () => {
    expect(() => assertEvidenceBinding(binding())).not.toThrow();
  });

  it('binds consumer candidate and host runtime distinctly from harness release', () => {
    const b = binding();
    expect(b.harness_release.sha256).not.toBe(b.consumer_candidate.candidate_sha256);
    expect(b.host_runtime.host).toBe('opencode');
  });
});

describe('closure-service — baseline B / metadata commit C / attestation', () => {
  it('derives a metadata delta manifest from changed paths', () => {
    const delta = deriveMetadataDeltaManifest({
      closure_id: 'closure-1',
      baseline_sha256: 'a'.repeat(64),
      metadata_commit_sha256: 'd'.repeat(64),
      changed_paths: ['.agent/plans/terminal-harness-vnext/plan.md', 'src/runtime.ts'],
    });
    expect(delta.allowed).toBe(false);
    expect(delta.reason).toContain('src/runtime.ts');
  });

  it('allows only metadata/closure surfaces in commit C', () => {
    const delta = deriveMetadataDeltaManifest({
      closure_id: 'closure-2',
      baseline_sha256: 'a'.repeat(64),
      metadata_commit_sha256: 'd'.repeat(64),
      changed_paths: ['.agent/ledger/terminal-harness-vnext.json', '.agent/archive/x/residue.json'],
    });
    expect(delta.allowed).toBe(true);
  });

  it('attestation requires exact-SHA CI evidence', () => {
    const repo = tempRepo();
    const staged = stageClosureTransaction(input(), repo);
    const attested = attestTerminal(staged.manifest, { ci_sha256: '1'.repeat(64), external_verifier: 'github-actions' });
    expect(attested.status).toBe('ATTESTED');
    expect(attested.ci_sha256).toBe('1'.repeat(64));
    try {
      attestTerminal(staged.manifest, { ci_sha256: 'too-short', external_verifier: 'x' });
    } catch (e: any) {
      expect(e.code).toBe(CLOSURE_ERRORS.NO_BEHAVIORAL_BASELINE);
    }
  });
});

describe('closure-service — transaction and idempotent replay', () => {
  let repo: string;
  beforeEach(() => { repo = tempRepo(); });
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }); });

  it('stages then commits a closure manifest + residue', () => {
    const staged = stageClosureTransaction(input(), repo);
    expect(staged.staged).toBe(true);
    expect(staged.replay).toBe(false);
    const receipt = commitClosureTransaction(input(), repo, staged);
    expect(receipt.committed).toBe(true);
    expect(fs.existsSync(path.join(repo, '.agent', 'closure', 'terminal-harness-vnext.committed.json'))).toBe(true);
    expect(fs.existsSync(path.join(repo, '.agent', 'closure', 'terminal-harness-vnext.residue.json'))).toBe(true);
  });

  it('replays deterministically on double close', () => {
    const first = stageClosureTransaction(input(), repo);
    commitClosureTransaction(input(), repo, first);
    const second = stageClosureTransaction(input(), repo);
    expect(second.replay).toBe(true);
    const receipt = commitClosureTransaction(input(), repo, second);
    expect(receipt.replay).toBe(true);
    expect(receipt.closure_id).toBe(first.manifest.closure_id);
  });

  it('rejects staging on a repo where requirements never resolved', () => {
    try {
      stageClosureTransaction(input({ requirements: [{ id: 'R', statement: 's', status: 'UNRESOLVED' }] }), repo);
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

describe('closure-service — invalid v1 closure correction', () => {
  let repo: string;
  beforeEach(() => { repo = tempRepo(); });
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }); });

  it('corrects an invalid closure to SUPERSEDED/INACTIVE with terminal PARTIAL', () => {
    const correction = correctInvalidClosure({
      repoRoot: repo,
      plan_id: 'northstar-on-demand-portable-harness',
      pointer: { generation: 31, status: 'EFFECTIVE', execution_state: 'IN_PROGRESS' },
      ledger: { status: 'RETIRED', execution_state: 'CLOSED' },
      reason: 'pointer remained hot while ledger claimed RETIRED/CLOSED with shallow evidence',
    });
    expect(correction.corrected).toBe(true);
    expect(correction.corrected_status).toBe('SUPERSEDED');
    expect(correction.corrected_execution_state).toBe('INACTIVE');
    expect(correction.terminal_outcome).toBe('PARTIAL');
    expect(correction.correction_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(path.join(repo, '.agent', 'closure', 'northstar-on-demand-portable-harness.correction.json'))).toBe(true);
  });

  it('never fabricates PASS during correction', () => {
    const correction = correctInvalidClosure({
      repoRoot: repo,
      plan_id: 'plan-x',
      pointer: null,
      ledger: { status: 'RETIRED', execution_state: 'CLOSED' },
      reason: 'test',
    });
    expect(correction.terminal_outcome).toBe('PARTIAL');
  });
});

describe('closure-service — consumer source cleanliness', () => {
  it('writes operational ignore markers without touching tracked source semantics', () => {
    const repo = tempRepo();
    writeOperationalIgnore(repo);
    const gitignore = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.agent/closure/');
    expect(gitignore).toContain('.agent/runs/');
  });
});