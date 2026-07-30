import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createSupervisor,
  _resolveSupervisorInternals,
  type ChildKind,
  type NativeModeReason,
  type SupervisorPublicView,
  type _InternalOps,
  type ChildAssignmentView,
} from '../src/supervisor.js';
import type { ContextCapsuleKey } from '../src/context-cache.js';

const stubContextKey: ContextCapsuleKey = {
  effectivePlanSha256: 'a'.repeat(64),
  orderedAmendmentSha256: 'b'.repeat(64),
  baselineSha: 'c'.repeat(40),
  assignmentId: 'stub',
  ownedPaths: ['packages/engine'],
  forbiddenPaths: [],
  sourceFileHashes: { 'src/index.ts': 'd'.repeat(64) },
  toolchainManifestSha256: 'e'.repeat(64),
  acceptanceCriteriaSha256: 'f'.repeat(64),
};

// Helper: get dispatchFingerprint after dispatchAssignment (internal — not on public children)
function fp(internal: _InternalOps, id: string): string {
  return internal.getChildren().find((c: { assignmentId: string }) => c.assignmentId === id)!.dispatchFingerprint;
}

// F10 (R10): test factory — wraps createSupervisor + _resolveSupervisorInternals
function makeSupervisor(config?: Record<string, unknown>): { s: SupervisorPublicView; complete: (id: string, r: Record<string, unknown>) => { ok: true } | { ok: false; reason: string }; _internal: _InternalOps } {
  const clean: Record<string, unknown> = { ...config };
  delete clean.completionVerifier;
  const s = createSupervisor({ ...clean, completionVerifier: () => true } as any);
  const internals = _resolveSupervisorInternals(s);
  return { s, complete: internals.complete, _internal: internals._internal };
}

// F10 (R10): convenience for tests that don't need completion
function simpleSupervisor(config?: Record<string, unknown>): SupervisorPublicView {
  return createSupervisor({ ...config, completionVerifier: () => true } as any);
}

// F10 (R10): test helper — creates supervisor without any verifier
function noVerifierSupervisor(config?: Record<string, unknown>): {s: SupervisorPublicView; complete: (id: string, r: Record<string, unknown>) => { ok: true } | { ok: false; reason: string }; _internal: _InternalOps } {
  const clean: Record<string, unknown> = { ...config };
  delete clean.completionVerifier;
  const s = createSupervisor(clean as any);
  const internals = _resolveSupervisorInternals(s);
  return { s, complete: internals.complete, _internal: internals._internal };
}

function mockWindowsDirectoryFsyncEperm(directory: string, statePath: string) {
  const directoryFds = new Set<number>();
  const stateFileOpenFlags: Array<string | number> = [];
  const realOpenSync = fs.openSync;
  const realFsyncSync = fs.fsyncSync;
  let fileFsyncCalls = 0;

  const openSpy = vi.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: string | number, ...rest: unknown[]) => {
    const fd = realOpenSync(file, flags as never, ...(rest as []));
    const resolved = path.resolve(String(file));
    if (resolved === path.resolve(directory)) directoryFds.add(fd);
    if (resolved === path.resolve(`${statePath}.tmp`)) stateFileOpenFlags.push(flags);
    return fd;
  }) as typeof fs.openSync);
  const fsyncSpy = vi.spyOn(fs, 'fsyncSync').mockImplementation(((fd: number) => {
    if (directoryFds.delete(fd)) {
      const error = new Error('Windows directory fsync is unavailable') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    }
    fileFsyncCalls++;
    return realFsyncSync(fd);
  }) as typeof fs.fsyncSync);

  return {
    stateFileOpenFlags,
    get fileFsyncCalls() { return fileFsyncCalls; },
    restore: () => {
      fsyncSpy.mockRestore();
      openSpy.mockRestore();
    },
  };
}

describe('Supervisor', () => {
  let supervisor: SupervisorPublicView;

  beforeEach(() => {
    supervisor = simpleSupervisor();
  });

  describe('constructor', () => {
    it('creates with default config', () => {
      expect(supervisor.sessionId).toBeTruthy();
      expect(supervisor.children).toHaveLength(0);
    });

    it('creates with custom config', () => {
      const s = simpleSupervisor({ maxWriters: 5, maxReviewers: 3, backpressureRssMb: 4096 });
      expect(s.availableWriterSlots).toBe(5);
      expect(s.availableReviewerSlots).toBe(3);
    });

    it('sessionId is a uuid', () => {
      expect(supervisor.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('defaults provider/model/effort config', () => {
      const r = supervisor.assignChild({
        assignmentId: 'cfg1', kind: 'writer', ownedPaths: [], forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.assignment.provider).toBe('openai');
        expect(r.assignment.model).toBe('gpt-4');
        expect(r.assignment.effort).toBe('high');
      }
    });

    it('accepts custom provider/model/effort config', () => {
      const {s} = makeSupervisor({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-3',
        defaultEffort: 'medium',
      });
      const r = s.assignChild({
        assignmentId: 'cfg2', kind: 'writer', ownedPaths: [], forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.assignment.provider).toBe('anthropic');
        expect(r.assignment.model).toBe('claude-3');
        expect(r.assignment.effort).toBe('medium');
      }
    });
    });

    it('creates with statePath and persists state', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-test-'));
      const statePath = path.join(tmpDir, 'state.json');
      const s = simpleSupervisor({ statePath });
      const sessionId = s.sessionId;
      const result = s.assignChild({ assignmentId: 'a1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(statePath)).toBe(true);

      const s2 = simpleSupervisor({ statePath });
      expect(s2.sessionId).toBe(sessionId);
      expect(s2.children).toHaveLength(1);
      expect(s2.children[0].assignmentId).toBe('a1');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

  describe('revision', () => {
    it('starts at 0', () => {
      expect(supervisor.revision).toBe(0);
    });

    it('increments on assignChild', () => {
      supervisor.assignChild({ assignmentId: 'a1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(supervisor.revision).toBe(1);
    });

    it('increments on dispatchAssignment', () => {
      supervisor.assignChild({ assignmentId: 'a1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      supervisor.bindChildSession('a1', 'sid');
      supervisor.dispatchAssignment('a1');
      expect(supervisor.revision).toBe(3);
    });
  });

  describe('assignChild', () => {
    it('assigns a writer successfully', () => {
      const result = supervisor.assignChild({
        assignmentId: 'w1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.assignment.kind).toBe('writer');
        expect(result.assignment.depth).toBe(1);
        expect(result.assignment.status).toBe('PENDING');
        expect(result.assignment.parentSessionId).toBe(supervisor.sessionId);
        expect(result.assignment.provider).toBe('openai');
        expect(result.assignment.model).toBe('gpt-4');
        expect(result.assignment.effort).toBe('high');
      }
    });

    it('assigns with custom provider/model/effort', () => {
      const result = supervisor.assignChild({
        assignmentId: 'c1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        provider: 'custom-provider',
        model: 'custom-model',
        effort: 'custom-effort',
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.assignment.provider).toBe('custom-provider');
        expect(result.assignment.model).toBe('custom-model');
        expect(result.assignment.effort).toBe('custom-effort');
      }
    });

    it('assigns a reviewer successfully', () => {
      const result = supervisor.assignChild({
        assignmentId: 'r1',
        kind: 'reviewer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
    });

    it('rejects writer when writer slots exhausted', () => {
      const s = simpleSupervisor({ maxWriters: 1 });
      s.assignChild({ assignmentId: 'w1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      const result = s.assignChild({
        assignmentId: 'w2',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('writer');
      }
    });

    it('rejects reviewer when reviewer slots exhausted', () => {
      const s = simpleSupervisor({ maxReviewers: 1 });
      s.assignChild({ assignmentId: 'r1', kind: 'reviewer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      const result = s.assignChild({
        assignmentId: 'r2',
        kind: 'reviewer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('reviewer');
      }
    });

    it('allows verifier without slot limit', () => {
      for (let i = 0; i < 10; i++) {
        const result = supervisor.assignChild({
          assignmentId: `v${i}`,
          kind: 'verifier',
          ownedPaths: [],
          forbiddenPaths: [],
          contextKey: stubContextKey,
});
        expect(result.ok).toBe(true);
      }
    });

    it('assigns children with depth 1', () => {
      const result = supervisor.assignChild({
        assignmentId: 'd1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.assignment.depth).toBe(1);
      }
    });

    it('returns existing assignment when same assignmentId with same params', () => {
      const result1 = supervisor.assignChild({
        assignmentId: 'idem1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: ['node_modules/'],
        contextKey: stubContextKey,
});
      expect(result1.ok).toBe(true);

      const result2 = supervisor.assignChild({
        assignmentId: 'idem1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: ['node_modules/'],
        contextKey: stubContextKey,
});
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.assignment.assignmentId).toBe('idem1');
      }
    });

    it('rejects same assignmentId with different ownedPaths', () => {
      supervisor.assignChild({
        assignmentId: 'conflict1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      const result = supervisor.assignChild({
        assignmentId: 'conflict1',
        kind: 'writer',
        ownedPaths: ['lib/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Conflict');
      }
    });

    it('rejects same assignmentId with different kind', () => {
      supervisor.assignChild({
        assignmentId: 'kind1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      const result = supervisor.assignChild({
        assignmentId: 'kind1',
        kind: 'reviewer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Conflict');
      }
    });

    it('rejects same assignmentId with different forbiddenPaths', () => {
      supervisor.assignChild({
        assignmentId: 'forbid1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: ['node_modules/'],
        contextKey: stubContextKey,
});
      const result = supervisor.assignChild({
        assignmentId: 'forbid1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: ['dist/'],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Conflict');
      }
    });

    it('allows different assignmentId with same ownedPaths', () => {
      const result1 = supervisor.assignChild({
        assignmentId: 'overlap1',
        kind: 'verifier',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result1.ok).toBe(true);
      const result2 = supervisor.assignChild({
        assignmentId: 'overlap2',
        kind: 'verifier',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result2.ok).toBe(true);
    });

    it('rejects assignment under resource pressure', () => {
      const s = simpleSupervisor({ backpressureRssMb: 0, backpressureCpuPct: 0 });
      const result = s.assignChild({
        assignmentId: 'bp1',
        kind: 'verifier',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Resource pressure');
      }
    });

    it('rejects writer path overlap with existing running writer', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      const first = s.assignChild({
        assignmentId: 'w1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(first.ok).toBe(true);
      if (first.ok) {
        first.assignment.status = 'RUNNING';
      }
      const second = s.assignChild({
        assignmentId: 'w2',
        kind: 'writer',
        ownedPaths: ['src/components/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toContain('Writer path overlap with');
        expect(second.reason).toContain('w1');
      }
    });

    it('rejects writer path overlap vice versa', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      const first = s.assignChild({
        assignmentId: 'w1',
        kind: 'writer',
        ownedPaths: ['src/components/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(first.ok).toBe(true);
      if (first.ok) {
        first.assignment.status = 'DISPATCHED';
      }
      const second = s.assignChild({
        assignmentId: 'w2',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toContain('Writer path overlap with');
      }
    });

    it('allows non-overlapping writer paths', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      const first = s.assignChild({
        assignmentId: 'w1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(first.ok).toBe(true);
      if (first.ok) {
        first.assignment.status = 'RUNNING';
      }
      const second = s.assignChild({
        assignmentId: 'w2',
        kind: 'writer',
        ownedPaths: ['lib/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(second.ok).toBe(true);
    });

    it('normalizes Windows separators before nested overlap checks', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      expect(s.assignChild({ assignmentId: 'win1', kind: 'writer', ownedPaths: ['packages\\engine'], forbiddenPaths: [], contextKey: stubContextKey }).ok).toBe(true);
      const nested = s.assignChild({ assignmentId: 'win2', kind: 'writer', ownedPaths: ['packages/engine/src'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(nested.ok).toBe(false);
      expect(s.children[0].ownedPaths).toEqual(['packages/engine']);
    });

    it('does not confuse sibling prefixes or repository path case', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      expect(s.assignChild({ assignmentId: 'prefix1', kind: 'writer', ownedPaths: ['packages/engine'], forbiddenPaths: [], contextKey: stubContextKey }).ok).toBe(true);
      expect(s.assignChild({ assignmentId: 'prefix2', kind: 'writer', ownedPaths: ['packages/engine-tools'], forbiddenPaths: [], contextKey: stubContextKey }).ok).toBe(true);
      expect(s.assignChild({ assignmentId: 'case', kind: 'writer', ownedPaths: ['Packages/Engine'], forbiddenPaths: [], contextKey: stubContextKey }).ok).toBe(true);
    });

    it.each(['../outside', 'packages/../outside', '/absolute', 'C:\\absolute', 'C:relative', 'C:', '\\\\server\\share'])('rejects unsafe repository path %s', (unsafePath) => {
      const result = supervisor.assignChild({ assignmentId: `unsafe-${unsafePath}`, kind: 'writer', ownedPaths: [unsafePath], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('repository-relative');
    });

    it('rejects mixed-separator traversal', () => {
      const result = supervisor.assignChild({ assignmentId: 'mixed-traversal', kind: 'writer', ownedPaths: ['packages\\engine/..\\outside'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(false);
    });

    it('does not check path overlap for non-writer kinds', () => {
      const s = simpleSupervisor({ maxReviewers: 3 });
      const first = s.assignChild({
        assignmentId: 'r1',
        kind: 'reviewer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(first.ok).toBe(true);
      if (first.ok) {
        first.assignment.status = 'RUNNING';
      }
      const second = s.assignChild({
        assignmentId: 'r2',
        kind: 'reviewer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(second.ok).toBe(true);
    });
  });

  describe('slot availability', () => {
    it('availableWriterSlots decreases after assignment', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      expect(s.availableWriterSlots).toBe(3);
      s.assignChild({ assignmentId: 'w1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(s.availableWriterSlots).toBe(2);
      s.assignChild({ assignmentId: 'w2', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(s.availableWriterSlots).toBe(1);
    });

    it('completed assignments free writer slots', () => {
      const {s, complete} = makeSupervisor({ maxWriters: 1 });
      const result = s.assignChild({
        assignmentId: 'w1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      expect(s.availableWriterSlots).toBe(0);
      if (result.ok) {
        const aid = result.assignment.assignmentId;
                s.bindChildSession(aid, 'sid');
        s.dispatchAssignment(aid);
        s.ackAssignment(aid);
        complete(aid, { eventCursor: 'ev-c1', childSessionId: 'sid' });
      }
      expect(s.availableWriterSlots).toBe(1);
    });

    it('failed assignments free reviewer slots', () => {
      const s = simpleSupervisor({ maxReviewers: 1 });
      const result = s.assignChild({
        assignmentId: 'r1',
        kind: 'reviewer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      expect(s.availableReviewerSlots).toBe(0);
      if (result.ok) {
        s.failAssignment(result.assignment.assignmentId, 'error');
      }
      expect(s.availableReviewerSlots).toBe(1);
    });
  });

  describe('resolveNativeMode', () => {
    const allowedReasons: NativeModeReason[] = [
      'initial_architecture_boundary',
      'final_certification_boundary',
    ];

    for (const reason of allowedReasons) {
      it(`allows ${reason}`, () => {
        expect(supervisor.resolveNativeMode(reason)).toEqual({ allowed: true });
      });
    }

    it('rejects unknown reason', () => {
      const result = supervisor.resolveNativeMode('some_other_reason' as NativeModeReason);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain('Native mode disallowed');
      }
    });
  });

  describe('checkResources', () => {
    it('returns rssMb, cpuPct, underPressure', () => {
      const result = supervisor.checkResources();
      expect(result).toHaveProperty('rssMb');
      expect(result).toHaveProperty('cpuPct');
      expect(result).toHaveProperty('underPressure');
      expect(typeof result.rssMb).toBe('number');
      expect(typeof result.cpuPct).toBe('number');
      expect(typeof result.underPressure).toBe('boolean');
    });

    it('returns realistic (non-random) resource values', () => {
      const result = supervisor.checkResources();
      expect(result.rssMb).toBeGreaterThan(0);
      expect(result.cpuPct).toBeGreaterThanOrEqual(0);
      expect(result.cpuPct).toBeLessThanOrEqual(100);
    });
  });

  describe('dispatchAssignment', () => {
    it('changes status to DISPATCHED and sets leaseExpiresAt', () => {
      const result = supervisor.assignChild({
        assignmentId: 'd1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      if (result.ok) {
        supervisor.bindChildSession('d1', 'sid');
        const dispatchResult = supervisor.dispatchAssignment('d1');
        expect(dispatchResult.ok).toBe(true);
        const child = supervisor.children.find((c) => c.assignmentId === 'd1');
        expect(child?.status).toBe('DISPATCHED');
        expect(child?.leaseExpiresAt).toBeTruthy();
      }
    });

    it('rejects dispatch for unknown assignment', () => {
      const result = supervisor.dispatchAssignment('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Not found');
      }
    });

    it('rejects dispatch for non-PENDING assignment', () => {
      supervisor.assignChild({ assignmentId: 'd1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      supervisor.bindChildSession('d1', 'sid');
      supervisor.dispatchAssignment('d1');
      const result = supervisor.dispatchAssignment('d1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Cannot dispatch');
      }
    });

    it('rejects dispatch when childSessionId is null', () => {
      const result = supervisor.assignChild({ assignmentId: 'null-child', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      const dispatchResult = supervisor.dispatchAssignment('null-child');
      expect(dispatchResult.ok).toBe(false);
      if (!dispatchResult.ok) {
        expect(dispatchResult.reason).toContain('Session not bound');
      }
    });
  });

  describe('ackAssignment', () => {
    it('changes status to RUNNING from DISPATCHED', () => {
      supervisor.assignChild({ assignmentId: 'a1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      supervisor.bindChildSession('a1', 'sid');
      supervisor.dispatchAssignment('a1');
      const result = supervisor.ackAssignment('a1');
      expect(result.ok).toBe(true);
      const child = supervisor.children.find((c) => c.assignmentId === 'a1');
      expect(child?.status).toBe('RUNNING');
    });

    it('rejects ack for PENDING assignment', () => {
      supervisor.assignChild({ assignmentId: 'a1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      const result = supervisor.ackAssignment('a1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Cannot ack');
      }
    });

    it('rejects ack for unknown assignment', () => {
      const result = supervisor.ackAssignment('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Not found');
      }
    });
  });

  describe('heartbeatAssignment', () => {
    it('updates updatedAt and refreshes lease', () => {
      supervisor.assignChild({ assignmentId: 'h1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      supervisor.bindChildSession('h1', 'sid');
      supervisor.dispatchAssignment('h1');
      supervisor.ackAssignment('h1');
      const childBefore = supervisor.children.find((c) => c.assignmentId === 'h1');
      // Snapshot values before heartbeat mutates the shared reference
      const updatedAtMs = new Date(childBefore!.updatedAt).getTime();
      const leaseMs = new Date(childBefore!.leaseExpiresAt!).getTime();

      // Small delay to ensure timestamp changes
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin */ }

      const result = supervisor.heartbeatAssignment('h1');
      expect(result.ok).toBe(true);

      const childAfter = supervisor.children.find((c) => c.assignmentId === 'h1');
      expect(new Date(childAfter!.updatedAt).getTime()).toBeGreaterThan(updatedAtMs);
      expect(new Date(childAfter!.leaseExpiresAt!).getTime()).toBeGreaterThan(leaseMs);
    });

    it('rejects heartbeat for unknown assignment', () => {
      const result = supervisor.heartbeatAssignment('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Not found');
      }
    });
  });

  describe('completeAssignment', () => {
    it('marks assignment as COMPLETED', () => {
      const {s, complete} = makeSupervisor();
      const result = s.assignChild({
        assignmentId: 'c1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
if (result.ok) {
        const receipt = { diffSha256: 'abc', eventCursor: 'ev-c2', childSessionId: 'sid' };
                s.bindChildSession(result.assignment.assignmentId, 'sid');
        s.dispatchAssignment(result.assignment.assignmentId);
        s.ackAssignment(result.assignment.assignmentId);
        complete(result.assignment.assignmentId, { ...receipt });
        const child = s.children.find(
          (c) => c.assignmentId === result.assignment.assignmentId,
        );
        expect(child?.status).toBe('COMPLETED');
        expect(child?.receipt).toMatchObject({ diffSha256: 'abc', eventCursor: 'ev-c2', childSessionId: 'sid' });
        expect(child?.receipt?.completionToken).toBeFalsy();
      }
    });

    it('rejects completion without verifier', () => {
      const {s, complete} = noVerifierSupervisor({});
      s.assignChild({ assignmentId: 'nv1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('nv1', 'sid');
      s.dispatchAssignment('nv1');
      s.ackAssignment('nv1');
      const result = complete('nv1', { eventCursor: 'ev-nv', childSessionId: 'sid' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('no verifier');
    });

    it('rejects completion after lease expired', () => {
      vi.useFakeTimers();
      const {s, complete} = makeSupervisor({ assignmentTimeoutMs: 10000 });
      const result = s.assignChild({ assignmentId: 'lease1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      if (result.ok) {
        s.bindChildSession('lease1', 'sid');
        s.dispatchAssignment('lease1');
        s.ackAssignment('lease1');
        vi.advanceTimersByTime(15000);
        const completeResult = complete('lease1', {});
        expect(completeResult.ok).toBe(false);
        if (!completeResult.ok) {
          expect(completeResult.reason).toContain('Stale lease');
        }
      }
      vi.useRealTimers();
    });

    it('completes successfully before lease expiry', () => {
      const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-lease-'));
      const {s, complete} = makeSupervisor({ statePath: path.join(freshDir, 'state.json'), assignmentTimeoutMs: 60000 });
      const result = s.assignChild({ assignmentId: 'fresh1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      if (result.ok) {
        s.bindChildSession('fresh1', 'sid');
        s.dispatchAssignment('fresh1');
        s.ackAssignment('fresh1');
        const completeResult = complete('fresh1', { eventCursor: 'ev-f1', childSessionId: 'sid' });
        expect(completeResult.ok).toBe(true);
      }
      fs.rmSync(freshDir, { recursive: true, force: true });
    });

    it('rejects completion for unknown assignment', () => {
      const {complete} = makeSupervisor();
      const result = complete('nonexistent', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Not found');
      }
    });

    // F6 (R6): verifier-based — can't complete twice
    it('rejects second completion of same assignment', () => {
      const {s, complete} = makeSupervisor({ assignmentTimeoutMs: 60000 });
      const result = s.assignChild({ assignmentId: 'onet1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      if (result.ok) {
        s.bindChildSession('onet1', 'sid');
        s.dispatchAssignment('onet1');
        s.ackAssignment('onet1');
        const r1 = complete('onet1', { eventCursor: 'ev-o1', childSessionId: 'sid' });
        expect(r1.ok).toBe(true);
        // Second attempt — already COMPLETED
        const r2 = complete('onet1', { eventCursor: 'ev-o2', childSessionId: 'sid' });
        expect(r2.ok).toBe(false);
        expect(r2.ok === false && r2.reason).toContain('Cannot complete');
      }
    });
  });

  describe('bindChildSession', () => {
    it('sets the correct session ID', () => {
      const result = supervisor.assignChild({ assignmentId: 'bind1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      const bindResult = supervisor.bindChildSession('bind1', 'session-abc-123');
      expect(bindResult.ok).toBe(true);
      const child = supervisor.children.find((c) => c.assignmentId === 'bind1');
      expect(child?.childSessionId).toBe('session-abc-123');
    });

    it('rejects bind for unknown assignment', () => {
      const result = supervisor.bindChildSession('nonexistent', 'sid');
      expect(result.ok).toBe(false);
    });

    it('rejects bind for non-PENDING assignment', () => {
      supervisor.assignChild({ assignmentId: 'bind2', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      supervisor.bindChildSession('bind2', 'sid1');
      supervisor.dispatchAssignment('bind2');
      const result = supervisor.bindChildSession('bind2', 'sid2');
      expect(result.ok).toBe(false);
    });
  });

  describe('failAssignment', () => {
    it('marks assignment as FAILED', () => {
      const result = supervisor.assignChild({
        assignmentId: 'f1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(result.ok).toBe(true);
      if (result.ok) {
        supervisor.failAssignment(result.assignment.assignmentId, 'something went wrong');
        const child = supervisor.children.find(
          (c) => c.assignmentId === result.assignment.assignmentId,
        );
        expect(child?.status).toBe('FAILED');
        expect(child?.receipt).toEqual({ error: 'something went wrong' });
      }
    });

    it('fails from DISPATCHED status', () => {
      const result = supervisor.assignChild({ assignmentId: 'fd1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      if (result.ok) {
        supervisor.bindChildSession('fd1', 'session-id');
        supervisor.dispatchAssignment('fd1');
        const failResult = supervisor.failAssignment('fd1', 'dispatch error');
        expect(failResult.ok).toBe(true);
        const child = supervisor.children.find((c) => c.assignmentId === 'fd1');
        expect(child?.status).toBe('FAILED');
      }
    });

    it('fails from RUNNING status', () => {
      const result = supervisor.assignChild({ assignmentId: 'fr1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(true);
      if (result.ok) {
        supervisor.bindChildSession('fr1', 'session-id');
        supervisor.dispatchAssignment('fr1');
        supervisor.ackAssignment('fr1');
        const failResult = supervisor.failAssignment('fr1', 'runtime error');
        expect(failResult.ok).toBe(true);
        const child = supervisor.children.find((c) => c.assignmentId === 'fr1');
        expect(child?.status).toBe('FAILED');
      }
    });
  });

  describe('children', () => {
    it('returns a snapshot of all children', () => {
      supervisor.assignChild({
        assignmentId: 'a1',
        kind: 'writer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      supervisor.assignChild({
        assignmentId: 'a2',
        kind: 'reviewer',
        ownedPaths: [],
        forbiddenPaths: [],
        contextKey: stubContextKey,
});
      expect(supervisor.children).toHaveLength(2);
    });
  });

  describe('getAuditEvents', () => {
    it('returns empty array initially', () => {
      expect(supervisor.getAuditEvents()).toHaveLength(0);
    });

    it('returns audit events after operations', () => {
      const {s, complete} = makeSupervisor();
      s.assignChild({ assignmentId: 'audit1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('audit1', 'sid');
      s.dispatchAssignment('audit1');
      s.ackAssignment('audit1');
            s.heartbeatAssignment('audit1');
      complete('audit1', { eventCursor: 'ev-a1', childSessionId: 'sid' });

      const events = s.getAuditEvents();
      expect(events.length).toBe(6);
      expect(events[0].type).toBe('ASSIGNED');
      expect(events[1].type).toBe('ASSIGNED');
      expect(events[1].detail).toContain('bound:');
      expect(events[2].type).toBe('DISPATCHED');
      expect(events[3].type).toBe('ACKED');
      expect(events[4].type).toBe('HEARTBEAT');
      expect(events[5].type).toBe('COMPLETED');
      events.forEach((e) => {
        expect(e.assignmentId).toBe('audit1');
        expect(e.revision).toBeGreaterThan(0);
        expect(e.timestamp).toBeTruthy();
      });
    });
  });

  describe('persistence', () => {
    let tmpDir: string;
    let statePath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-persistence-'));
      statePath = path.join(tmpDir, 'state.json');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('saves and restores state across restarts', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'p1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(s1.children).toHaveLength(1);

      const s2 = simpleSupervisor({ statePath });
      expect(s2.children).toHaveLength(1);
      expect(s2.children[0].assignmentId).toBe('p1');
    });

    it('stable supervisor ID survives restart', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      const id1 = s1.sessionId;
      s1.assignChild({ assignmentId: 'sid1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });

      const s2 = simpleSupervisor({ statePath });
      expect(s2.sessionId).toBe(id1);
    });

    it('children persist across restart', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'c1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      s1.assignChild({ assignmentId: 'c2', kind: 'reviewer', ownedPaths: ['docs/'], forbiddenPaths: [], contextKey: stubContextKey });

      const s2 = simpleSupervisor({ statePath });
      expect(s2.children).toHaveLength(2);
      expect(s2.children.map((c) => c.assignmentId).sort()).toEqual(['c1', 'c2']);
    });

    it('audit events persist across restart', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'ae1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
            s1.bindChildSession('ae1', 'sid');
      s1.dispatchAssignment('ae1');
      s1.ackAssignment('ae1');
      complete('ae1', { eventCursor: 'ev-ae1', childSessionId: 'sid' });

      const s2 = simpleSupervisor({ statePath });
      const events = s2.getAuditEvents();
      expect(events).toHaveLength(5);
      expect(events[0].type).toBe('ASSIGNED');
      expect(events[1].type).toBe('ASSIGNED');
      expect(events[2].type).toBe('DISPATCHED');
      expect(events[3].type).toBe('ACKED');
      expect(events[4].type).toBe('COMPLETED');
    });

    it('revision persists across restart with remediation', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'r1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s1.bindChildSession('r1', 'sid');
      s1.dispatchAssignment('r1');
      s1.ackAssignment('r1');
      const revAfter = s1.revision;

      // F6 (R6): stale RUNNING is remediated → FAILED, revision +1
      const s2 = simpleSupervisor({ statePath });
      expect(s2.revision).toBe(revAfter + 1);
      const child = s2.children.find(c => c.assignmentId === 'r1');
      expect(child?.status).toBe('FAILED');
    });

    it('persists and restores when Windows rejects directory fsync', () => {
      const fault = mockWindowsDirectoryFsyncEperm(tmpDir, statePath);
      try {
        const s1 = simpleSupervisor({ statePath });
        const assigned = s1.assignChild({ assignmentId: 'windows-fsync', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });

        expect(assigned.ok).toBe(true);
        expect(fs.existsSync(statePath)).toBe(true);
        expect(fault.stateFileOpenFlags).toContain('r+');
        expect(fault.fileFsyncCalls).toBeGreaterThan(0);

        const s2 = simpleSupervisor({ statePath });
        expect(s2.children.map((child) => child.assignmentId)).toContain('windows-fsync');
      } finally {
        fault.restore();
      }
    });

    it('canonicalizes persisted Windows owned and forbidden paths on load', () => {
      const s1 = simpleSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'persisted-windows', kind: 'writer', ownedPaths: ['packages/engine'], forbiddenPaths: ['fixtures/windows'], contextKey: stubContextKey });
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      state.children[0].ownedPaths = ['packages\\engine'];
      state.children[0].forbiddenPaths = ['fixtures\\windows'];
      fs.writeFileSync(statePath, JSON.stringify(state));

      const s2 = simpleSupervisor({ statePath });
      expect(s2.children[0].ownedPaths).toEqual(['packages/engine']);
      expect(s2.children[0].forbiddenPaths).toEqual(['fixtures/windows']);
    });

    it.each(['C:relative', 'C:'])('fails closed on persisted drive-relative path %s', (unsafePath) => {
      const s1 = simpleSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'persisted-drive', kind: 'writer', ownedPaths: ['packages/engine'], forbiddenPaths: [], contextKey: stubContextKey });
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      state.children[0].ownedPaths = [unsafePath];
      fs.writeFileSync(statePath, JSON.stringify(state));

      const s2 = simpleSupervisor({ statePath });
      expect(s2.children).toHaveLength(0);
      expect(s2.revision).toBe(0);
    });
  });

  describe('atomic recovery', () => {
    let tmpDir: string;
    let statePath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-atomic-'));
      statePath = path.join(tmpDir, 'state.json');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('fails closed on corrupt state file', () => {
      fs.writeFileSync(statePath, 'not valid json', 'utf-8');
      const s = simpleSupervisor({ statePath });
      expect(s.children).toHaveLength(0);
      expect(s.revision).toBe(0);
    });

    it('recovers from .tmp file (simulate atomic write crash recovery)', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'atom1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      const originalId = s1.sessionId;

      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      stateContent.children.push({
        assignmentId: 'orphan',
        parentSessionId: originalId,
        childSessionId: 'orphan-sid',
        depth: 1,
        kind: 'writer',
        agentProfile: 'writer-s',
        provider: 'openai',
        model: 'gpt-4',
        effort: 'high',
        ownedPaths: [],
        forbiddenPaths: [],
        contextCapsuleKey: {
          effectivePlanSha256: '',
          orderedAmendmentSha256: '',
          baselineSha: '',
          assignmentId: '',
          ownedPaths: [],
          forbiddenPaths: [],
          sourceFileHashes: {},
          toolchainManifestSha256: '',
          acceptanceCriteriaSha256: '',
        },
        dispatchFingerprint: 'orphan-fp',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      stateContent.auditEvents.push({
        revision: 99,
        timestamp: new Date().toISOString(),
        type: 'ASSIGNED',
        assignmentId: 'orphan',
      });
      stateContent.revision = 99;
      fs.writeFileSync(statePath + '.tmp', JSON.stringify(stateContent), 'utf-8');
      fs.renameSync(statePath + '.tmp', statePath);

      const s2 = simpleSupervisor({ statePath });
      expect(s2.sessionId).toBe(originalId);
      expect(s2.children).toHaveLength(2);
      expect(s2.children.find((c) => c.assignmentId === 'orphan')).toBeTruthy();
    });
  });

  // F4: HIGH — ownership overlap must count PENDING reservation
  describe('F4 PENDING writer path overlap', () => {
    it('rejects writer path overlap with PENDING writer', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      const first = s.assignChild({
        assignmentId: 'pw1',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(first.ok).toBe(true);
      // pw1 stays PENDING — but still owns its paths
      const second = s.assignChild({
        assignmentId: 'pw2',
        kind: 'writer',
        ownedPaths: ['src/components/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toContain('Writer path overlap');
      }
    });

    it('allows non-overlapping PENDING writers', () => {
      const s = simpleSupervisor({ maxWriters: 3 });
      const first = s.assignChild({
        assignmentId: 'pw3',
        kind: 'writer',
        ownedPaths: ['src/a/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(first.ok).toBe(true);
      const second = s.assignChild({
        assignmentId: 'pw4',
        kind: 'writer',
        ownedPaths: ['src/b/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(second.ok).toBe(true);
    });
  });

  // F5: HIGH — completion receipt must include binding evidence
  describe('F5 receipt validation', () => {
    it('rejects completion without eventCursor', () => {
      const {s, complete} = makeSupervisor();
      s.assignChild({ assignmentId: 'rec1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('rec1', 'sid');
      s.dispatchAssignment('rec1');
      s.ackAssignment('rec1');
      const result = complete('rec1', { childSessionId: 'sid' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('eventCursor');
    });

    it('rejects completion without childSessionId', () => {
      const {s, complete} = makeSupervisor();
      s.assignChild({ assignmentId: 'rec2', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('rec2', 'sid');
      s.dispatchAssignment('rec2');
      s.ackAssignment('rec2');
      const result = complete('rec2', { eventCursor: 'ev1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('childSessionId');
    });

    it('rejects completion with mismatched childSessionId', () => {
      const {s, complete} = makeSupervisor();
      s.assignChild({ assignmentId: 'rec3', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('rec3', 'sid1');
      s.dispatchAssignment('rec3');
      s.ackAssignment('rec3');
      const result = complete('rec3', { eventCursor: 'ev1', childSessionId: 'wrong-sid' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('childSessionId mismatch');
    });
  });

  // F9: MEDIUM — resume semantic validation
  describe('F9 resume validation', () => {
    let tmpDir: string;
    let statePath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-resume-'));
      statePath = path.join(tmpDir, 'state.json');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('rejects duplicate assignmentId on resume', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'dup1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // Manually inject duplicate ID into state file
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.children.push({ ...state.children[0], assignmentId: 'dup1' });
      fs.writeFileSync(statePath, JSON.stringify(state));
      // F8 (R8): graceful degradation — creates fresh state instead of throwing
      const s2 = simpleSupervisor({ statePath });
      expect(s2.sessionId).not.toBe(s1.sessionId);
    });

    it('rejects invalid status value on resume', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'inv1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.children[0].status = 'INVALID_STATUS';
      fs.writeFileSync(statePath, JSON.stringify(state));
      // F8 (R8): graceful degradation — creates fresh state instead of throwing
      const s2 = simpleSupervisor({ statePath });
      expect(s2.sessionId).not.toBe(s1.sessionId);
    });

    // F6 (R6): stale lease → remediated to FAILED, not a throw
    it('remediates stale lease on resume for RUNNING assignment', () => {
      const {s: s1, complete} = makeSupervisor({ statePath, assignmentTimeoutMs: 10000 });
      s1.assignChild({ assignmentId: 'stale1', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      s1.bindChildSession('stale1', 'sid');
      s1.dispatchAssignment('stale1');
      s1.ackAssignment('stale1');
      // Manually set lease to expired
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.children[0].leaseExpiresAt = new Date(Date.now() - 60000).toISOString();
      fs.writeFileSync(statePath, JSON.stringify(state));
      const s2 = simpleSupervisor({ statePath });
      const child = s2.children.find(c => c.assignmentId === 'stale1');
      expect(child?.status).toBe('FAILED');
      expect(child?.receipt?.error).toContain('remediated');
    });
  });

  // F10: MEDIUM — tmp recovery picks newer revision
  describe('F10 tmp recovery with revision priority', () => {
    let tmpDir: string;
    let statePath: string;
    let tmpPath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-f10-'));
      statePath = path.join(tmpDir, 'state.json');
      tmpPath = statePath + '.tmp';
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('picks state.json over .tmp when same revision', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'f10a', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // Copy state to .tmp with same content
      const content = fs.readFileSync(statePath, 'utf-8');
      fs.writeFileSync(tmpPath, content);
      const s2 = simpleSupervisor({ statePath });
      expect(s2.children).toHaveLength(1);
      expect(s2.children[0].assignmentId).toBe('f10a');
    });

    it('picks .tmp when it has higher revision than state.json', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'f10b', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // Create .tmp with higher revision
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.revision = 99;
      state.children.push({
        assignmentId: 'f10c',
        parentSessionId: s1.sessionId,
        childSessionId: null,
        depth: 1,
        kind: 'writer',
        agentProfile: 'writer-s',
        provider: 'openai',
        model: 'gpt-4',
        effort: 'high',
        ownedPaths: ['lib/'],
        forbiddenPaths: [],
        contextCapsuleKey: { ...stubContextKey, ownedPaths: ['lib/'], assignmentId: 'f10c' },
        dispatchFingerprint: 'f10-fp',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      state.auditEvents.push({
        revision: 2,
        timestamp: new Date().toISOString(),
        type: 'ASSIGNED',
        assignmentId: 'f10c',
      });
      fs.writeFileSync(tmpPath, JSON.stringify(state));
      const s2 = simpleSupervisor({ statePath });
      expect(s2.children).toHaveLength(2);
      expect(s2.revision).toBe(99);
    });
  });

  // F7 (R2): MEDIUM — recovery semantic-validate each candidate; corrupt newer tmp falls back to canonical
  describe('F7 (R2) recovery semantic validation', () => {
    let tmpDir: string;
    let statePath: string;
    let tmpPath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-f7r2-'));
      statePath = path.join(tmpDir, 'state.json');
      tmpPath = statePath + '.tmp';
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('picks valid canonical over corrupt .tmp with higher revision', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'f7a', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // .tmp has higher revision but corrupt content (invalid JSON)
      fs.writeFileSync(tmpPath, 'not valid json');
      const s2 = simpleSupervisor({ statePath });
      // Should recover from valid state.json, not crash on .tmp
      expect(s2.sessionId).toBe(s1.sessionId);
      expect(s2.children).toHaveLength(1);
      expect(s2.children[0].assignmentId).toBe('f7a');
    });

    it('picks valid canonical over .tmp with semantic errors', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'f7b', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // .tmp has higher revision but duplicate assignmentId (semantic error)
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.revision = 99;
      state.children.push({ ...state.children[0], assignmentId: 'f7b' }); // duplicate ID
      state.auditEvents.push({
        revision: 2, timestamp: new Date().toISOString(), type: 'ASSIGNED', assignmentId: 'f7b',
      });
      fs.writeFileSync(tmpPath, JSON.stringify(state));
      const s2 = simpleSupervisor({ statePath });
      // Should fall back to valid state.json, not throw
      expect(s2.revision).toBe(1);
      expect(s2.children).toHaveLength(1);
    });

    // F6 (R3): picks highest revision among valid candidates
    it('picks highest revision among valid candidates', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'f6a', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // Create .tmp with higher revision (valid)
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.revision = 50;
      state.children.push({
        assignmentId: 'f6b', parentSessionId: s1.sessionId, childSessionId: null,
        depth: 1, kind: 'writer', agentProfile: 'writer-s',
        provider: 'openai', model: 'gpt-4', effort: 'high',
        ownedPaths: ['lib/'], forbiddenPaths: [],
        contextCapsuleKey: { ...stubContextKey, ownedPaths: ['lib/'], assignmentId: 'f6b' },
        dispatchFingerprint: 'f6-fp', status: 'PENDING',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      state.auditEvents.push({
        revision: 2, timestamp: new Date().toISOString(), type: 'ASSIGNED', assignmentId: 'f6b',
      });
      fs.writeFileSync(tmpPath, JSON.stringify(state));
      const s2 = simpleSupervisor({ statePath });
      // Should pick revision 50 from .tmp (higher than canonical's revision)
      expect(s2.revision).toBe(50);
      expect(s2.children).toHaveLength(2);
    });

    // F6 (R3): canonical wins tie at same revision
    it('canonical wins tie when same revision', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'f6c', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey });
      // Create .tmp with same revision but different child
      const canonicalRaw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(canonicalRaw);
      state.children[0].assignmentId = 'f6c-tmp'; // different ID
      state.auditEvents[0].assignmentId = 'f6c-tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(state));
      const s2 = simpleSupervisor({ statePath });
      // Should pick canonical (state.json) over tmp
      expect(s2.children).toHaveLength(1);
      expect(s2.children[0].assignmentId).toBe('f6c');
    });
  });

  describe('receipt persistence', () => {
    let tmpDir: string;
    let statePath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-receipt-'));
      statePath = path.join(tmpDir, 'state.json');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('persists receipt across restart', () => {
      const {s: s1, complete} = makeSupervisor({ statePath });
      s1.assignChild({ assignmentId: 'receipt1', kind: 'writer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s1.bindChildSession('receipt1', 'sid');
      s1.dispatchAssignment('receipt1');
      s1.ackAssignment('receipt1');
      complete('receipt1', { diffSha256: 'abc123', summary: 'done', eventCursor: 'ev-r1', childSessionId: 'sid' });

      const s2 = simpleSupervisor({ statePath });
      const child = s2.children.find((c) => c.assignmentId === 'receipt1');
      expect(child?.status).toBe('COMPLETED');
      expect(child?.receipt).toMatchObject({ diffSha256: 'abc123', summary: 'done', eventCursor: 'ev-r1', childSessionId: 'sid' });
      // F5 (R5): completionToken is NOT persisted — only in runtime receipt
      expect(child?.receipt?.completionToken).toBeFalsy();
    });
  });
});
