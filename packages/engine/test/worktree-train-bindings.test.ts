/**
 * worktree-train-bindings.test.ts — Cross-subsystem provenance binding tests (AM-0019 §5 + §12)
 *
 * Tests:
 * - Path normalization (cross-platform)
 * - Assignment-lease binding
 * - Dispatch node binding
 * - Provenance chain
 * - Session attestation
 * - Validation helpers
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  normalizeBindingPath,
  normalizeBindingPaths,
  pathsOverlap,
  bindAssignmentToLease,
  bindDispatchNodeToLease,
  chainProvenance,
  attestSessionToIntegration,
  releaseReceiptFingerprint,
  integrationReceiptFingerprint,
  verifyReleaseIntegrationBinding,
  verifyForbiddenPathCompliance,
  nativeWorktreePath,
  portableWorktreePath,
  validateAssignmentLeaseBinding,
  validateProvenanceChain,
  type AssignmentLeaseBinding,
  type DispatchNodeLeaseBinding,
  type ProvenanceChain,
  type SessionAttestation,
} from '../src/worktree-train-bindings.js';
import type { WorktreeLease, ReleaseReceipt, IntegrationReceipt } from '../src/worktree-train.js';
import type { ExecutionNode } from '../src/dispatch-ready-set.js';

// ── Test fixtures ───────────────────────────────────────────────────────────────

function makeLease(overrides: Partial<WorktreeLease> = {}): WorktreeLease {
  return {
    schema: 'artifact/worktree-lease',
    taskId: 'T1',
    baseEpoch: 'a'.repeat(40),
    ownedPaths: ['src/module', 'schemas/test.json'],
    semanticResources: ['api:worktree-train', 'lockfile:package-lock.json'],
    branch: 'feature/T1',
    worktreePath: '/repo/.worktrees/worktrees/T1',
    dependencyRank: 0,
    dependencyRankSource: 'default',
    createdAt: '2026-08-02T00:00:00Z',
    state: 'ACTIVE',
    ...overrides,
  };
}

function makeReleaseReceipt(overrides: Partial<ReleaseReceipt> = {}): ReleaseReceipt {
  return {
    schema: 'artifact/worktree-release',
    taskId: 'T1',
    branch: 'feature/T1',
    baseEpoch: 'a'.repeat(40),
    finalCommit: 'b'.repeat(40),
    diffFingerprint: 'c'.repeat(64),
    exitCodes: [0],
    clean: true,
    releasedAt: '2026-08-02T00:01:00Z',
    ...overrides,
  };
}

function makeIntegrationReceipt(overrides: Partial<IntegrationReceipt> = {}): IntegrationReceipt {
  return {
    schema: 'artifact/integration-receipt',
    trainBranch: 'integration/m8-convergence',
    baseEpoch: 'a'.repeat(40),
    mergeOrder: ['T1'],
    acceptedCommits: { T1: 'b'.repeat(40) },
    refused: [],
    integrationHead: 'd'.repeat(40),
    diffFingerprint: 'e'.repeat(64),
    validation: { ran: false, failed: [] },
    integratedAt: '2026-08-02T00:02:00Z',
    ...overrides,
  };
}

function makeExecutionNode(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return {
    id: 'T1',
    ownedPaths: ['src/module', 'schemas/test.json'],
    ...overrides,
  };
}

function makeAssignment(overrides: { ownedPaths?: readonly string[]; forbiddenPaths?: readonly string[]; assignmentId?: string } = {}): {
  assignmentId: string;
  taskId: string;
  parentSessionId: string;
  childSessionId: string | null;
  depth: number;
  kind: 'writer';
  agentProfile: string;
  provider: string;
  model: string;
  effort: string;
  ownedPaths: readonly string[];
  forbiddenPaths: readonly string[];
  contextCapsuleKey: { effectivePlanSha256: string; orderedAmendmentSha256: string; baselineSha: string; assignmentId: string; ownedPaths: string[]; forbiddenPaths: string[]; sourceFileHashes: Record<string, string>; toolchainManifestSha256: string; acceptanceCriteriaSha256: string; };
  dispatchFingerprint: string;
  status: 'PENDING' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  createdAt: string;
  updatedAt: string;
} {
  return {
    assignmentId: overrides.assignmentId ?? 'assign-T1',
    taskId: 'T1',
    parentSessionId: 'session-1',
    childSessionId: null,
    depth: 1,
    kind: 'writer',
    agentProfile: 'writer-s',
    provider: 'openai',
    model: 'gpt-4',
    effort: 'high',
    ownedPaths: overrides.ownedPaths ?? ['src/module'],
    forbiddenPaths: overrides.forbiddenPaths ?? [],
    contextCapsuleKey: {
      effectivePlanSha256: 'a'.repeat(64),
      orderedAmendmentSha256: 'b'.repeat(64),
      baselineSha: 'c'.repeat(40),
      assignmentId: 'assign-T1',
      ownedPaths: [],
      forbiddenPaths: [],
      sourceFileHashes: {},
      toolchainManifestSha256: 'd'.repeat(64),
      acceptanceCriteriaSha256: 'e'.repeat(64),
    },
    dispatchFingerprint: 'fp-123',
    status: 'PENDING',
    createdAt: '2026-08-02T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
  };
}

// ── Path normalization tests ───────────────────────────────────────────────────

describe('path normalization', () => {
  it('normalizes Windows backslashes to forward slashes', () => {
    expect(normalizeBindingPath('src\\module\\file')).toBe('src/module/file');
    expect(normalizeBindingPath('lib\\nested\\item')).toBe('lib/nested/item');
  });

  it('normalizes POSIX forward slashes (no change)', () => {
    expect(normalizeBindingPath('src/module/file')).toBe('src/module/file');
  });

  it('trims leading and trailing slashes', () => {
    expect(normalizeBindingPath('/src/module/')).toBe('src/module');
    expect(normalizeBindingPath('///src///module///')).toBe('src/module');
  });

  it('converts to lowercase', () => {
    expect(normalizeBindingPath('Src/Module/File')).toBe('src/module/file');
    expect(normalizeBindingPath('LIB/NESTED/ITEM')).toBe('lib/nested/item');
  });

  it('handles empty and whitespace paths', () => {
    expect(normalizeBindingPath('')).toBe('');
    expect(normalizeBindingPath('   ')).toBe('');
    expect(normalizeBindingPath('  src/module  ')).toBe('src/module');
  });

  it('normalizeBindingPaths deduplicates and sorts', () => {
    const result = normalizeBindingPaths(['src/a', 'src/b', 'src/a', 'lib/c']);
    expect(result).toEqual(['lib/c', 'src/a', 'src/b']);
  });

  it('handles mixed Windows/POSIX paths', () => {
    const result = normalizeBindingPaths(['src\\module', 'lib/nested/item', 'config\\settings.json']);
    expect(result).toEqual(['config/settings.json', 'lib/nested/item', 'src/module']);
  });
});

describe('path overlap detection', () => {
  it('detects exact match', () => {
    expect(pathsOverlap('src/module', 'src/module')).toBe(true);
  });

  it('detects parent-child overlap', () => {
    expect(pathsOverlap('src', 'src/module')).toBe(true);
    expect(pathsOverlap('src/module', 'src')).toBe(true);
  });

  it('detects deep nesting overlap', () => {
    expect(pathsOverlap('src', 'src/module/file')).toBe(true);
    expect(pathsOverlap('src/module', 'src/module/file')).toBe(true);
  });

  it('detects sibling non-overlap', () => {
    expect(pathsOverlap('src/a', 'src/b')).toBe(false);
    expect(pathsOverlap('lib/a', 'src/a')).toBe(false);
  });

  it('handles case-insensitive matching', () => {
    expect(pathsOverlap('Src/Module', 'src/module')).toBe(true);
  });
});

// ── Assignment-lease binding tests ─────────────────────────────────────────────

describe('assignment-lease binding', () => {
  it('creates binding with compatible paths', () => {
    const lease = makeLease({ ownedPaths: ['src/module', 'schemas/test.json'] });
    const assignment = makeAssignment({ ownedPaths: ['src/module', 'src/extra'] });

    const binding = bindAssignmentToLease(assignment, lease, 'session-1');

    expect(binding.schema).toBe('binding/assignment-lease');
    expect(binding.assignmentId).toBe('assign-T1');
    expect(binding.taskId).toBe('T1');
    expect(binding.sessionId).toBe('session-1');
    expect(binding.leaseId).toBe('T1');
    expect(binding.ownedPaths).toContain('src/module');
    expect(binding.ownedPaths).toContain('schemas/test.json');
    expect(binding.semanticResources).toContain('api:worktree-train');
    expect(binding.boundAt).toBeTruthy();
  });

  it('normalizes paths in binding', () => {
    const lease = makeLease({ ownedPaths: ['src\\module', 'lib/nested/item'] });
    const assignment = makeAssignment({ ownedPaths: ['src\\module', 'lib/nested/item'] });

    const binding = bindAssignmentToLease(assignment, lease, 'session-1');

    expect(binding.ownedPaths).toContain('src/module');
    expect(binding.ownedPaths).toContain('lib/nested/item');
  });

  it('deduplicates and sorts owned paths', () => {
    const lease = makeLease({ ownedPaths: ['src/a', 'src/a', 'lib/b'] });
    const assignment = makeAssignment({ ownedPaths: ['src/a', 'lib/b'] });

    const binding = bindAssignmentToLease(assignment, lease, 'session-1');

    expect(binding.ownedPaths).toEqual(['lib/b', 'src/a']);
    expect(binding.ownedPaths.length).toBe(2); // deduplicated
  });
});

// ── Dispatch node binding tests ─────────────────────────────────────────────────

describe('dispatch node-lease binding', () => {
  it('creates binding from execution node', () => {
    const lease = makeLease({ ownedPaths: ['src/module', 'schemas/test.json'] });
    const node = makeExecutionNode({ id: 'EXEC-T1', ownedPaths: ['src/module'] });

    const binding = bindDispatchNodeToLease(node, lease);

    expect(binding.schema).toBe('binding/dispatch-lease');
    expect(binding.taskId).toBe('T1');
    expect(binding.executionNodeId).toBe('EXEC-T1');
    expect(binding.ownedPaths).toContain('src/module');
    expect(binding.boundAt).toBeTruthy();
  });

  it('normalizes node paths', () => {
    const lease = makeLease({ ownedPaths: ['src/module'] });
    const node = makeExecutionNode({ id: 'EXEC-T1', ownedPaths: ['src\\module'] });

    const binding = bindDispatchNodeToLease(node, lease);

    expect(binding.ownedPaths).toEqual(['src/module']);
  });
});

// ── Provenance chain tests ─────────────────────────────────────────────────────

describe('provenance chain', () => {
  it('chains release to integration', () => {
    const release = makeReleaseReceipt({ taskId: 'T1', finalCommit: 'b'.repeat(40) });
    const integration = makeIntegrationReceipt({
      acceptedCommits: { T1: 'b'.repeat(40) },
      integrationHead: 'd'.repeat(40),
    });

    const chain = chainProvenance(release, integration);

    expect(chain.schema).toBe('provenance/chain');
    expect(chain.releaseReceiptId).toBe('T1');
    expect(chain.baseEpoch).toBe(release.baseEpoch);
    expect(chain.finalCommit).toBe(release.finalCommit);
    expect(chain.integrationHead).toBe(integration.integrationHead);
    expect(chain.diffFingerprint).toBe(release.diffFingerprint);
    expect(chain.boundAt).toBeTruthy();
  });

  it('rejects orphaned release receipt', () => {
    const release = makeReleaseReceipt({ taskId: 'T1' });
    const integration = makeIntegrationReceipt({ acceptedCommits: {} });

    expect(() => chainProvenance(release, integration)).toThrow();
  });
});

// ── Session attestation tests ───────────────────────────────────────────────────

describe('session attestation', () => {
  it('attests session to integration', () => {
    const integration = makeIntegrationReceipt({ mergeOrder: ['T1', 'T2'] });
    const attestation = attestSessionToIntegration('session-1', 'sup-1', integration);

    expect(attestation.schema).toBe('attestation/session-integration');
    expect(attestation.sessionId).toBe('session-1');
    expect(attestation.supervisorId).toBe('sup-1');
    expect(attestation.acceptedTaskIds).toEqual(['T1', 'T2']);
    expect(attestation.boundCommit).toBe(integration.integrationHead);
    expect(attestation.diffFingerprint).toBe(integration.diffFingerprint);
    expect(attestation.attestedAt).toBeTruthy();
  });
});

// ── Fingerprint tests ──────────────────────────────────────────────────────────

describe('receipt fingerprints', () => {
  it('generates consistent release fingerprint', () => {
    const release = makeReleaseReceipt();
    const fp1 = releaseReceiptFingerprint(release);
    const fp2 = releaseReceiptFingerprint(release);

    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates consistent integration fingerprint', () => {
    const integration = makeIntegrationReceipt();
    const fp1 = integrationReceiptFingerprint(integration);
    const fp2 = integrationReceiptFingerprint(integration);

    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different receipts produce different fingerprints', () => {
    const release1 = makeReleaseReceipt({ taskId: 'T1' });
    const release2 = makeReleaseReceipt({ taskId: 'T2' });

    expect(releaseReceiptFingerprint(release1)).not.toBe(releaseReceiptFingerprint(release2));
  });
});

// ── Release-integration binding verification ────────────────────────────────────

describe('release-integration binding verification', () => {
  it('verifies valid binding', () => {
    const release = makeReleaseReceipt({ taskId: 'T1', finalCommit: 'b'.repeat(40) });
    const integration = makeIntegrationReceipt({ acceptedCommits: { T1: 'b'.repeat(40) } });

    expect(verifyReleaseIntegrationBinding(release, integration)).toBe(true);
  });

  it('rejects missing task', () => {
    const release = makeReleaseReceipt({ taskId: 'T1' });
    const integration = makeIntegrationReceipt({ acceptedCommits: {} });

    expect(verifyReleaseIntegrationBinding(release, integration)).toBe(false);
  });

  it('rejects commit mismatch', () => {
    const release = makeReleaseReceipt({ taskId: 'T1', finalCommit: 'b'.repeat(40) });
    const integration = makeIntegrationReceipt({ acceptedCommits: { T1: 'c'.repeat(40) } });

    expect(verifyReleaseIntegrationBinding(release, integration)).toBe(false);
  });
});

// ── Forbidden path compliance ───────────────────────────────────────────────────

describe('forbidden path compliance', () => {
  it('passes when no overlap', () => {
    const lease = makeLease({ ownedPaths: ['src/module'] });
    const assignment = makeAssignment({ forbiddenPaths: ['lib/other'] });

    expect(verifyForbiddenPathCompliance(assignment, lease)).toBe(true);
  });

  it('fails when forbidden overlaps owned', () => {
    const lease = makeLease({ ownedPaths: ['src/module'] });
    const assignment = makeAssignment({ forbiddenPaths: ['src'] });

    expect(verifyForbiddenPathCompliance(assignment, lease)).toBe(false);
  });

  it('normalizes paths before comparison', () => {
    const lease = makeLease({ ownedPaths: ['src\\module'] });
    const assignment = makeAssignment({ forbiddenPaths: ['src'] });

    expect(verifyForbiddenPathCompliance(assignment, lease)).toBe(false);
  });
});

// ── Platform-aware path helpers ─────────────────────────────────────────────────

describe('platform-aware worktree paths', () => {
  const lease = makeLease({ worktreePath: '/repo/.worktrees/worktrees/T1' });

  it('nativeWorktreePath returns forward slashes on POSIX', () => {
    const result = nativeWorktreePath(lease, 'linux');
    expect(result).toBe('/repo/.worktrees/worktrees/T1');
  });

  it('nativeWorktreePath returns backslashes on Windows', () => {
    const result = nativeWorktreePath(lease, 'win32');
    expect(result).toBe('\\repo\\.worktrees\\worktrees\\T1');
  });

  it('portableWorktreePath always returns forward slashes', () => {
    const winLease = { ...lease, worktreePath: 'C:\\repo\\.worktrees\\worktrees\\T1' };
    const result = portableWorktreePath(winLease as WorktreeLease);
    expect(result).toBe('c:/repo/.worktrees/worktrees/T1');
  });
});

// ── Validation helpers ─────────────────────────────────────────────────────────

describe('binding validation', () => {
  it('validates valid assignment-lease binding', () => {
    const binding: AssignmentLeaseBinding = {
      schema: 'binding/assignment-lease',
      assignmentId: 'assign-1',
      taskId: 'T1',
      sessionId: 'session-1',
      leaseId: 'T1',
      ownedPaths: ['src/module'],
      semanticResources: [],
      boundAt: '2026-08-02T00:00:00Z',
    };

    const result = validateAssignmentLeaseBinding(binding);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid assignment-lease binding', () => {
    const binding = {
      schema: 'binding/assignment-lease',
      assignmentId: '',
      taskId: '',
      sessionId: '',
      leaseId: '',
      ownedPaths: [],
      semanticResources: [],
      boundAt: '',
    } as unknown as AssignmentLeaseBinding;

    const result = validateAssignmentLeaseBinding(binding);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects non-normalized paths', () => {
    const binding: AssignmentLeaseBinding = {
      schema: 'binding/assignment-lease',
      assignmentId: 'assign-1',
      taskId: 'T1',
      sessionId: 'session-1',
      leaseId: 'T1',
      ownedPaths: ['/src/module/', 'lib\\nested'],
      semanticResources: [],
      boundAt: '2026-08-02T00:00:00Z',
    };

    const result = validateAssignmentLeaseBinding(binding);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not normalized'))).toBe(true);
  });

  it('validates valid provenance chain', () => {
    const chain: ProvenanceChain = {
      schema: 'provenance/chain',
      releaseReceiptId: 'T1',
      integrationReceiptId: 'int-1234abcd',
      baseEpoch: 'a'.repeat(40),
      finalCommit: 'b'.repeat(40),
      integrationHead: 'c'.repeat(40),
      diffFingerprint: 'd'.repeat(64),
      boundAt: '2026-08-02T00:00:00Z',
    };

    const result = validateProvenanceChain(chain);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid provenance chain', () => {
    const chain = {
      schema: 'provenance/chain',
      releaseReceiptId: '',
      integrationReceiptId: '',
      baseEpoch: '',
      finalCommit: '',
      integrationHead: '',
      diffFingerprint: 'invalid',
      boundAt: '',
    } as unknown as ProvenanceChain;

    const result = validateProvenanceChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
