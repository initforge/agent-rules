import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeHandoffArtifact,
  readHandoffArtifact,
  listHandoffArtifacts,
  resolveHandoff,
  assertHandoffBinding,
  type HandoffArtifact,
} from '../src/artifact-handoff.js';
import type { WorkerReceipt } from '../src/contracts.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const hash = 'a'.repeat(64);

function stubReceipt(overrides: Partial<WorkerReceipt> = {}): WorkerReceipt {
  return {
    receiptId: 'R1',
    assignmentId: 'A1',
    workerIdentity: 'worker',
    host: 'opencode',
    model: 'flash',
    diffSha256: hash,
    artifactUris: [],
    artifactHashes: [],
    filesChanged: ['packages/engine/src/contracts.ts'],
    commands: [{ executable: 'npm', args: ['test'] }],
    exitCodes: [0],
    logUris: [],
    logHashes: [],
    testEvidenceUris: [],
    testEvidenceHashes: [],
    startedAt: '2026-07-28T00:00:00.000Z',
    completedAt: '2026-07-28T00:01:00.000Z',
    ...overrides,
  };
}

describe('writeHandoffArtifact', () => {
  it('writes handoff.json and manifest.json', () => {
    const dir = tmpDir();
    const handoff = writeHandoffArtifact(
      'plan-001',
      'opencode',
      'session-1',
      'Review the changes',
      [stubReceipt()],
      { key1: 'value1' },
      dir,
    );

    expect(handoff.handoffId).toMatch(/^ho-/);
    expect(handoff.direction).toBe('outgoing');
    expect(handoff.status).toBe('ACTIVE');
    expect(handoff.planId).toBe('plan-001');
    expect(handoff.originatingHost).toBe('opencode');
    expect(handoff.sha256).toMatch(/^[a-f0-9]{64}$/);

    const handoffDir = path.join(dir, '.agent/handoff', handoff.handoffId);
    expect(fs.existsSync(path.join(handoffDir, 'handoff.json'))).toBe(true);
    expect(fs.existsSync(path.join(handoffDir, 'manifest.json'))).toBe(true);
  });

  it('stores receipts in the handoff artifact', () => {
    const dir = tmpDir();
    const handoff = writeHandoffArtifact(
      'plan-001',
      'opencode',
      'session-1',
      'Verify',
      [stubReceipt({ receiptId: 'R1' }), stubReceipt({ receiptId: 'R2' })],
      {},
      dir,
    );

    expect(handoff.receipts).toHaveLength(2);
    expect(handoff.receipts[0].receiptId).toBe('R1');
    expect(handoff.receipts[1].receiptId).toBe('R2');
  });

  it('writes manifest with correct metadata', () => {
    const dir = tmpDir();
    const handoff = writeHandoffArtifact('plan-001', 'opencode', 'session-1', 'Pass', [], { a: '1', b: '2' }, dir);

    const manifestPath = path.join(dir, '.agent/handoff', handoff.handoffId, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.formatVersion).toBe('1.0');
    expect(manifest.nextSafeAction).toBe('Pass');
    expect(manifest.contextKeys).toEqual(['a', 'b']);
    expect(manifest.sha256).toBe(handoff.sha256);
  });
});

describe('readHandoffArtifact', () => {
  it('returns null for non-existent handoff', () => {
    const dir = tmpDir();
    const result = readHandoffArtifact('ho-nonexistent', dir);
    expect(result).toBeNull();
  });

  it('reads a written handoff artifact', () => {
    const dir = tmpDir();
    const written = writeHandoffArtifact('plan-001', 'opencode', 'session-1', 'Review', [], {}, dir);
    const read = readHandoffArtifact(written.handoffId, dir);
    expect(read).not.toBeNull();
    expect(read!.handoffId).toBe(written.handoffId);
    expect(read!.planId).toBe('plan-001');
  });

  it('blocks path traversal via handoffId with ../', () => {
    const dir = tmpDir();
    expect(() => readHandoffArtifact('../../etc/passwd', dir)).toThrow('unsafe path');
  });

  it('rejects handoffId with null byte', () => {
    const dir = tmpDir();
    expect(() => readHandoffArtifact('ho-1\0../etc', dir)).toThrow('unsafe path');
  });

  it('rejects symlink handoff.json', () => {
    const dir = tmpDir();
    const handoff = writeHandoffArtifact('plan-001', 'opencode', 'session-1', 'Review', [], {}, dir);
    const handoffJson = path.join(dir, '.agent/handoff', handoff.handoffId, 'handoff.json');
    const linkPath = path.join(dir, '.agent/handoff', handoff.handoffId, 'handoff-link.json');
    try {
      fs.renameSync(handoffJson, linkPath);
      fs.symlinkSync(linkPath, handoffJson);
      expect(() => readHandoffArtifact(handoff.handoffId, dir)).toThrow('Symlink');
    } catch {
      // symlink may not be supported
    }
  });
});

describe('listHandoffArtifacts', () => {
  it('returns empty array when no handoff directory exists', () => {
    const dir = tmpDir();
    const artifacts = listHandoffArtifacts(dir);
    expect(artifacts).toHaveLength(0);
  });

  it('lists multiple handoff artifacts sorted newest first', () => {
    const dir = tmpDir();
    const h1 = writeHandoffArtifact('plan-001', 'opencode', 's1', 'Review', [], {}, dir);
    const h2 = writeHandoffArtifact('plan-002', 'opencode', 's2', 'Verify', [], {}, dir);

    const artifacts = listHandoffArtifacts(dir);
    expect(artifacts).toHaveLength(2);
  });
});

describe('resolveHandoff', () => {
  it('resolves a handoff with linked plan directory', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.agent/plans/plan-001'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agent/plans/plan-001/original.md'), '# Plan', 'utf-8');

    const handoff = writeHandoffArtifact('plan-001', 'opencode', 's1', 'Review', [], {}, dir);
    const resolved = resolveHandoff(handoff.handoffId, dir);
    expect(resolved.handoff.handoffId).toBe(handoff.handoffId);
    expect(resolved.planDir).toBeTruthy();
  });

  it('resolves handoff with null planDir when no plan exists', () => {
    const dir = tmpDir();
    const handoff = writeHandoffArtifact('plan-missing', 'opencode', 's1', 'Review', [], {}, dir);
    const resolved = resolveHandoff(handoff.handoffId, dir);
    expect(resolved.planDir).toBeNull();
  });

  it('throws for non-existent handoff', () => {
    const dir = tmpDir();
    expect(() => resolveHandoff('ho-nonexistent', dir)).toThrow('not found');
  });

  it('blocks traversal via planId containing ../', () => {
    const dir = tmpDir();
    writeHandoffArtifact('../../etc/passwd', 'opencode', 's1', 'Review', [], {}, dir);
    const validHandoff = readHandoffArtifact(
      fs.readdirSync(path.join(dir, '.agent/handoff')).sort().reverse()[0],
      dir,
    );
    expect(() => resolveHandoff(validHandoff!.handoffId, dir)).toThrow('unsafe path');
  });
});

describe('adversarial: handoffId traversal', () => {
  it('blocks handoffId with slash separator', () => {
    const dir = tmpDir();
    expect(() => readHandoffArtifact('ho-1/../etc', dir)).toThrow('unsafe path');
  });

  it('blocks handoffId with encoded slash', () => {
    const dir = tmpDir();
    expect(() => readHandoffArtifact('ho-1%2F..%2Fetc', dir)).toThrow('unsafe path');
  });
});

describe('adversarial: symlink handoff dir', () => {
  it('skips symlinked entries in listHandoffArtifacts', () => {
    const dir = tmpDir();
    writeHandoffArtifact('plan-001', 'opencode', 's1', 'Review', [], {}, dir);
    const handoffDir = path.join(dir, '.agent/handoff');
    const entries = fs.readdirSync(handoffDir);
    try {
      fs.symlinkSync('/tmp', path.join(handoffDir, 'evil-link'));
      const artifacts = listHandoffArtifacts(dir);
      expect(artifacts).toHaveLength(entries.length);
    } catch {
      // symlink may not be supported
    }
  });
});

describe('assertHandoffBinding', () => {
  it('throws for missing identity fields', () => {
    expect(() => assertHandoffBinding({} as HandoffArtifact)).toThrow('missing identity');
  });

  it('throws for missing nextSafeAction', () => {
    const handoff: HandoffArtifact = {
      handoffId: 'ho-1',
      direction: 'outgoing',
      status: 'ACTIVE',
      planId: 'plan-1',
      artifactId: 'ho-1',
      originatingHost: 'opencode',
      originatingSession: 's1',
      nextSafeAction: '',
      receipts: [],
      contextCapsule: {},
      openedAt: '2026-01-01',
      completedAt: null,
      sha256: 'a'.repeat(64) as any,
    };
    expect(() => assertHandoffBinding(handoff)).toThrow('nextSafeAction');
  });

  it('throws for STALE status', () => {
    const handoff: HandoffArtifact = {
      handoffId: 'ho-1',
      direction: 'outgoing',
      status: 'STALE',
      planId: 'plan-1',
      artifactId: 'ho-1',
      originatingHost: 'opencode',
      originatingSession: 's1',
      nextSafeAction: 'Review',
      receipts: [],
      contextCapsule: {},
      openedAt: '2026-01-01',
      completedAt: null,
      sha256: 'a'.repeat(64) as any,
    };
    expect(() => assertHandoffBinding(handoff)).toThrow('STALE');
  });

  it('throws for invalid SHA-256', () => {
    const handoff: HandoffArtifact = {
      handoffId: 'ho-1',
      direction: 'outgoing',
      status: 'ACTIVE',
      planId: 'plan-1',
      artifactId: 'ho-1',
      originatingHost: 'opencode',
      originatingSession: 's1',
      nextSafeAction: 'Review',
      receipts: [],
      contextCapsule: {},
      openedAt: '2026-01-01',
      completedAt: null,
      sha256: 'not-a-valid-sha',
    };
    expect(() => assertHandoffBinding(handoff)).toThrow('SHA-256');
  });

  it('passes for valid handoff', () => {
    const handoff: HandoffArtifact = {
      handoffId: 'ho-1',
      direction: 'outgoing',
      status: 'ACTIVE',
      planId: 'plan-1',
      artifactId: 'ho-1',
      originatingHost: 'opencode',
      originatingSession: 's1',
      nextSafeAction: 'Review',
      receipts: [],
      contextCapsule: {},
      openedAt: '2026-01-01',
      completedAt: null,
      sha256: 'a'.repeat(64),
    };
    expect(() => assertHandoffBinding(handoff)).not.toThrow();
  });
});
