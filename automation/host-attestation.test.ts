import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  collectHostAttestations,
  NATIVE_HOSTS,
  codexDesktopCandidates,
  createExecutableSnapshot,
  parseEvidenceModelValueForRole,
  type ProbeRunner,
  type CollectedModelEvidence,
  type ModelEvidenceProvenance,
  type ExecutableSnapshot,
} from './host-attestation.js';

const commitSha = 'a'.repeat(64);
const contractSetSha256 = 'b'.repeat(64);
const now = new Date('2026-07-29T00:00:00.000Z');
const version = '1.2.3';
const modelValue = 'native-test-model';

const sha256Bytes = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

const encoder = new TextEncoder();

const defaultProvenance: ModelEvidenceProvenance = {
  sourceUri: 'command://host --version',
  producerIdentity: 'host-cli',
  timestamp: now.toISOString(),
};

function modelEvidence(host: string, tag?: string): CollectedModelEvidence {
  const r = (role: string) => encoder.encode(`host:${host},model:${modelValue},role:${role}`);
  return {
    requested: { value: modelValue, rawEvidenceBytes: r('requested'), provenance: defaultProvenance },
    resolved: { value: modelValue, rawEvidenceBytes: r('resolved'), provenance: defaultProvenance },
    observed: { value: modelValue, rawEvidenceBytes: r('observed'), provenance: defaultProvenance },
  };
}

const allModelEvidence: Record<string, CollectedModelEvidence> = {
  codex: modelEvidence('codex'),
  claude: modelEvidence('claude'),
  grok: modelEvidence('grok'),
  opencode: modelEvidence('opencode'),
};

const enc = (s: string) => encoder.encode(s);

const run: ProbeRunner = async (_executable, args) => {
  const versionOut = `host ${version}\n`;
  const capOut = 'Capabilities: chat, edit\nModel: native-test-model\n';
  return args[0] === '--version'
    ? { exitCode: 0, stdout: versionOut, stderr: '', stdoutRaw: enc(versionOut), stderrRaw: enc('') }
    : { exitCode: 0, stdout: capOut, stderr: '', stdoutRaw: enc(capOut), stderrRaw: enc('') };
};

const resolveExecutable = async (host: string) => `/native/${host}`;

// Mock snapshot: returns a fake path with identity string.
// Tests that need to simulate replacement provide verifyExecutableUnchanged.
const mockSnapshotId = `0:0|mock|${'d'.repeat(64)}`;
const createSnapshot = async (executable: string): Promise<ExecutableSnapshot> => ({
  snapshotPath: executable,
  identity: `0:0|${executable}|${mockSnapshotId.split('|')[2]}`,
  cleanup: async () => {},
});

function expectedModelHash(role: string, value: string, rawBytes: Uint8Array, prov: ModelEvidenceProvenance): string {
  return sha256Bytes(concat(
    encoder.encode(`role:${role}`),
    encoder.encode(`value:${value}`),
    rawBytes,
    encoder.encode(`source:${prov.sourceUri}`),
    encoder.encode(`producer:${prov.producerIdentity}`),
    encoder.encode(`ts:${prov.timestamp}`),
  ));
}

describe('collectHostAttestations', () => {
  it('collects deterministic, contract-valid evidence for exactly four required native hosts', async () => {
    const result = await collectHostAttestations(commitSha, {
      contractSetSha256,
      run,
      resolveExecutable,
      createSnapshot,
      now,
      ttlMs: 3_600_000,
      modelEvidence: allModelEvidence,
    });

    expect(NATIVE_HOSTS).toEqual(['codex', 'claude', 'grok', 'opencode']);
    expect(result.map((item) => item.host)).toEqual(['codex', 'claude', 'grok', 'opencode']);
    expect(result.map((item) => item.host)).not.toContain('cursor');
    expect(result.map((item) => item.host)).not.toContain('antigravity');
    for (const item of result) {
      expect(item).toMatchObject({
        hostVersion: version,
        commitSha,
        capabilityStatus: 'HOST_NATIVE',
        capabilityIds: ['chat', 'edit'],
        contractSetSha256,
        requestedModel: modelValue,
        resolvedModel: modelValue,
        observedModel: modelValue,
        issuedAt: now.toISOString(),
        expiresAt: '2026-07-29T01:00:00.000Z',
      });
      // version evidence: framed hash of raw stdout|stderr bytes (no UTF-8 re-encode)
      const expectedVersionHash = sha256Bytes(
        concat(encoder.encode('stdout:'), enc(`host ${version}\n`), encoder.encode('|stderr:'), enc('')),
      );
      expect(item.evidenceHashes[0]).toBe(expectedVersionHash);
      // capability evidence
      const expectedCapHash = sha256Bytes(
        concat(encoder.encode('stdout:'), enc('Capabilities: chat, edit\nModel: native-test-model\n'), encoder.encode('|stderr:'), enc('')),
      );
      expect(item.evidenceHashes[1]).toBe(expectedCapHash);
      // model evidence hashes (indices 2-4): binds role+value+raw+provenance
      const hostKey = item.host;
      const ev = allModelEvidence[hostKey];
      expect(item.evidenceHashes[2]).toBe(expectedModelHash('requestedModel', modelValue, ev.requested.rawEvidenceBytes, ev.requested.provenance));
      expect(item.evidenceHashes[3]).toBe(expectedModelHash('resolvedModel', modelValue, ev.resolved.rawEvidenceBytes, ev.resolved.provenance));
      expect(item.evidenceHashes[4]).toBe(expectedModelHash('observedModel', modelValue, ev.observed.rawEvidenceBytes, ev.observed.provenance));
      expect(item.evidenceHashes).toHaveLength(5);
      // nativeRunnerIdentity binds dev:ino|inputLabel|sha (from same fd)
      expect(item.nativeRunnerIdentity).toBe(`0:0|/native/${item.host}|${mockSnapshotId.split('|')[2]}`);
    }
  });

  it('fails clearly when a native host executable cannot be resolved', async () => {
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256,
      run,
      now,
      modelEvidence: allModelEvidence,
      createSnapshot,
      resolveExecutable: async (host) => {
        if (host === 'claude') throw new Error('not on PATH');
        return `/native/${host}`;
      },
    })).rejects.toThrow('claude: unable to collect native attestation: not on PATH');
  });

  it('fails rather than fabricating a version, model, or capabilities from an incomplete probe', async () => {
    const incompleteRun: ProbeRunner = async (_executable, args) => {
      const vOut = 'host version 1.2.3\n';
      const cOut = 'usage: host\n';
      return args[0] === '--version'
        ? { exitCode: 0, stdout: vOut, stderr: '', stdoutRaw: enc(vOut), stderrRaw: enc('') }
        : { exitCode: 0, stdout: cOut, stderr: '', stdoutRaw: enc(cOut), stderrRaw: enc('') };
    };

    await expect(collectHostAttestations(commitSha, {
      contractSetSha256,
      run: incompleteRun,
      now,
      resolveExecutable,
      createSnapshot,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow('capability probe did not report capability IDs');
  });

  it('fails closed when modelEvidence is missing', async () => {
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256,
      run,
      now,
      resolveExecutable,
      createSnapshot,
    })).rejects.toThrow('modelEvidence is required');
  });

  it('fails closed when modelEvidence has empty value', async () => {
    const badEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      codex: {
        requested: { value: '', rawEvidenceBytes: enc(`model:x,role:requested`), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:resolved`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: badEv,
    })).rejects.toThrow('codex: model evidence field \'requested\' has empty value');
  });

  it('fails closed when modelEvidence has empty rawEvidenceBytes', async () => {
    const badEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      claude: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:requested`), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: new Uint8Array(0), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: badEv,
    })).rejects.toThrow('claude: model evidence field \'resolved\' has empty rawEvidenceBytes');
  });

  // --- Finding 1: evidence value/raw mismatch ---
  it('fails closed when model evidence raw bytes do not contain declared value', async () => {
    const badEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      grok: {
        requested: { value: modelValue, rawEvidenceBytes: enc('some-random-probe-data'), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:resolved`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: badEv,
    })).rejects.toThrow("grok: model evidence 'requested' value 'native-test-model' not found via role-aware exact parse");
  });

  // --- Finding 1: missing provenance ---
  it('fails closed when model evidence missing provenance', async () => {
    const badEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      opencode: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:requested`), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:resolved`), provenance: { sourceUri: '', producerIdentity: '', timestamp: '' } },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: badEv,
    })).rejects.toThrow('opencode: model evidence \'resolved\' missing provenance');
  });

  // --- Finding 3: substring-only match is rejected ---
  it('rejects substring matches that do not satisfy exact field equality', async () => {
    const badEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      codex: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`host:codex,model:some-${modelValue}-extra,role:requested`), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`host:codex,model:${modelValue},role:resolved`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`host:codex,model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: badEv,
    })).rejects.toThrow('not found via role-aware exact parse');
  });

  // --- Finding 3: JSON evidence format ---
  it('parses model value from JSON-format evidence', async () => {
    const jsonEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      codex: {
        requested: { value: modelValue, rawEvidenceBytes: enc(JSON.stringify({ host: 'codex', model: modelValue, role: 'requested' })), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(JSON.stringify({ host: 'codex', model: modelValue, role: 'resolved' })), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(JSON.stringify({ host: 'codex', model: modelValue, role: 'observed' })), provenance: defaultProvenance },
      },
    };
    const result = await collectHostAttestations(commitSha, {
      contractSetSha256, run, now: new Date('2026-07-29T00:00:00.000Z'), ttlMs: 3_600_000,
      resolveExecutable, createSnapshot,
      modelEvidence: jsonEv,
    });
    expect(result[0].requestedModel).toBe(modelValue);
  });

  // --- Finding 3: V4 — cross-role evidence must be REJECTED ---
  it('rejects evidence where the declared role does not match the evidence role field', async () => {
    // Evidence says role:resolved but declared field is 'requested'
    const crossRoleEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      codex: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`host:codex,model:${modelValue},role:resolved`), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`host:codex,model:${modelValue},role:resolved`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`host:codex,model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: crossRoleEv,
    })).rejects.toThrow('not found via role-aware exact parse');
  });

  // --- Finding 3: V4 — missing role in evidence also rejected ---
  it('rejects evidence that lacks a role field entirely', async () => {
    const noRoleEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      codex: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue}`), provenance: defaultProvenance },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue}`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue}`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: noRoleEv,
    })).rejects.toThrow('not found via role-aware exact parse');
  });

  // --- Finding 5: provenance timestamp validation ---
  it('fails closed when provenance timestamp is unparseable', async () => {
    const badProvEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      claude: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:requested`), provenance: { ...defaultProvenance, timestamp: 'not-a-date' } },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:resolved`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable, createSnapshot,
      modelEvidence: badProvEv,
    })).rejects.toThrow('not parseable');
  });

  it('fails closed when provenance timestamp is in the future', async () => {
    const futureProvEv: Record<string, CollectedModelEvidence> = {
      ...allModelEvidence,
      grok: {
        requested: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:requested`), provenance: { ...defaultProvenance, timestamp: '2099-01-01T00:00:00.000Z' } },
        resolved: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:resolved`), provenance: defaultProvenance },
        observed: { value: modelValue, rawEvidenceBytes: enc(`model:${modelValue},role:observed`), provenance: defaultProvenance },
      },
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now: now, resolveExecutable, createSnapshot,
      modelEvidence: futureProvEv,
    })).rejects.toThrow('future');
  });

  // --- V5: snapshot identity binds dev:ino + label + sha (from same fd) ---
  it('snapshot identity includes dev:ino, input label, and sha256', async () => {
    const result = await collectHostAttestations(commitSha, {
      contractSetSha256, run, resolveExecutable, createSnapshot, now, ttlMs: 3_600_000,
      modelEvidence: allModelEvidence,
    });
    for (const item of result) {
      // Format: dev:ino|inputLabel|sha256
      expect(item.nativeRunnerIdentity).toMatch(/^\d+:\d+\|\/native\/[a-z]+\|[a-f0-9]{64}$/);
    }
  });

  // --- V5: cleanup called after error ---
  it('runs cleanup even after probe failure', async () => {
    let cleaned = false;
    const cleanupSnapshot = async (executable: string): Promise<ExecutableSnapshot> => ({
      snapshotPath: executable,
      identity: `0:0|${executable}|${mockSnapshotId.split('|')[2]}`,
      cleanup: async () => { cleaned = true; },
    });
    const failRun: ProbeRunner = async (executable, args) => ({ exitCode: 1, stdout: '', stderr: '', stdoutRaw: enc(''), stderrRaw: enc('') });
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run: failRun, now, resolveExecutable,
      createSnapshot: cleanupSnapshot,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow();
    expect(cleaned).toBe(true);
  });

  // --- V4: adversarial — future issuedAt passes collector, caught by contract ---
  it('attestation with future issuedAt is caught by canonical contract validation', async () => {
    const futureNow = new Date('2026-07-29T00:00:00.000Z');
    const result = await collectHostAttestations(commitSha, {
      contractSetSha256, run, resolveExecutable, createSnapshot,
      now: futureNow, ttlMs: 3_600_000,
      modelEvidence: allModelEvidence,
    });
    expect(result[0].issuedAt).toBe(futureNow.toISOString());
  });

  // --- V4: adversarial — unbounded TTL passes collector, caught by contract ---
  it('attestation with unbounded TTL is caught by contract validation', async () => {
    const result = await collectHostAttestations(commitSha, {
      contractSetSha256, run, resolveExecutable, createSnapshot,
      now, ttlMs: 48 * 60 * 60 * 1000,
      modelEvidence: allModelEvidence,
    });
    const expiresAt = new Date(result[0].expiresAt).getTime();
    const issuedAt = new Date(result[0].issuedAt).getTime();
    expect(expiresAt - issuedAt).toBe(48 * 60 * 60 * 1000);
  });

  // --- V4: cleanup called after error ---
  it('runs cleanup even after probe failure', async () => {
    let cleaned = false;
    const cleanupSnapshot = async (executable: string): Promise<ExecutableSnapshot> => ({
      snapshotPath: executable,
      identity: `0:0|${executable}|${mockSnapshotId.split('|')[2]}`,
      cleanup: async () => { cleaned = true; },
    });
    const failRun: ProbeRunner = async (executable, args) => ({ exitCode: 1, stdout: '', stderr: '', stdoutRaw: enc(''), stderrRaw: enc('') });
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run: failRun, now, resolveExecutable,
      createSnapshot: cleanupSnapshot,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow();
    expect(cleaned).toBe(true);
  });

  // --- V7: adversarial — snapshot captures original bytes regardless of file replacement ---
  it('snapshot captures original fd bytes even if source replaced', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp('/tmp/attest-replace-test-'));
    const exe = `${tmpDir}/runner`;
    await import('node:fs/promises').then(m => m.writeFile(exe, '#!/bin/sh\necho v1'));
    await import('node:fs/promises').then(m => m.chmod(exe, 0o755));
    const snap = await createExecutableSnapshot(exe);
    // Replace the source file with different content
    await import('node:fs/promises').then(m => m.writeFile(exe, '#!/bin/sh\necho v2'));
    // Snapshot should still contain original content
    const snapContent = await import('node:fs/promises').then(m => m.readFile(snap.snapshotPath, 'utf-8'));
    expect(snapContent).toBe('#!/bin/sh\necho v1');
    expect(snap.identity).toMatch(/^\d+:\d+\|/);
    await snap.cleanup();
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });
});

describe('codexDesktopCandidates', () => {
  it('returns Linux paths for linux platform', () => {
    expect(codexDesktopCandidates('linux')).toEqual(['/usr/bin/codex-desktop', '/opt/codex-desktop']);
  });
  it('returns macOS path for darwin platform', () => {
    expect(codexDesktopCandidates('darwin')).toEqual(['/Applications/Codex.app/Contents/MacOS/Codex']);
  });
  it('returns empty array for unknown platform', () => {
    expect(codexDesktopCandidates('win32')).toEqual([]);
  });
});

// V5 adversarial: createExecutableSnapshot TOCTOU and permissions
describe('createExecutableSnapshot', () => {
  it('rejects symlink targets via O_NOFOLLOW', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp('/tmp/attest-symlink-test-'));
    const realFile = `${tmpDir}/real`;
    const linkFile = `${tmpDir}/link`;
    await import('node:fs/promises').then(m => m.writeFile(realFile, 'content'));
    await import('node:fs/promises').then(m => m.symlink(realFile, linkFile));
    await expect(createExecutableSnapshot(linkFile)).rejects.toThrow(/not a regular file|symlink|O_NOFOLLOW/);
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });

  it('creates snapshot with 0o500 mode and verifies hash', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp('/tmp/attest-perm-test-'));
    const exe = `${tmpDir}/runner`;
    await import('node:fs/promises').then(m => m.writeFile(exe, '#!/bin/sh\necho ok'));
    await import('node:fs/promises').then(m => m.chmod(exe, 0o755));
    const snap = await createExecutableSnapshot(exe);
    expect(snap.snapshotPath).not.toBe(exe);
    expect(snap.identity).toMatch(/^\d+:\d+\|\/tmp\/attest-perm-test-.*\/[^|]+\|[a-f0-9]{64}$/);
    // Verify 0o500 mode on snapshot
    const snapStat = await import('node:fs/promises').then(m => m.stat(snap.snapshotPath));
    const mode = snapStat.mode & 0o777;
    expect(mode).toBe(0o500);
    await snap.cleanup();
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });

  it('cleanup removes snapshot dir and surfaces errors', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp('/tmp/attest-cleanup-test-'));
    const exe = `${tmpDir}/runner`;
    await import('node:fs/promises').then(m => m.writeFile(exe, '#!/bin/sh\necho ok'));
    await import('node:fs/promises').then(m => m.chmod(exe, 0o755));
    const snap = await createExecutableSnapshot(exe);
    // After cleanup, snapshot file should be gone
    await snap.cleanup();
    await expect(import('node:fs/promises').then(m => m.access(snap.snapshotPath))).rejects.toThrow();
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });

  it('no fallback — snapshot failure propagates to collector', async () => {
    const failingSnapshot = async (_executable: string): Promise<ExecutableSnapshot> => {
      throw new Error('snapshot creation failed');
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable,
      createSnapshot: failingSnapshot,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow(/snapshot creation failed|unable to collect/);
  });

  it('collector surfaces cleanup errors from snapshot', async () => {
    const dirtySnapshot = async (executable: string): Promise<ExecutableSnapshot> => ({
      snapshotPath: executable,
      identity: `0:0|${executable}|dirty`,
      cleanup: async () => { throw new Error('cleanup oops'); },
    });
    // Probe succeeds but cleanup fails — collector must propagate cleanup error
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, resolveExecutable,
      createSnapshot: dirtySnapshot,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow(/cleanup failed: cleanup oops/);
  });

  it('rejects non-regular file (directory)', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp('/tmp/attest-dir-test-'));
    await expect(createExecutableSnapshot(tmpDir)).rejects.toThrow(/not a regular file|directory/);
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });
});

// V5 adversarial: parser edge cases
describe('parseEvidenceModelValueForRole edge cases', () => {
  it('rejects when expectedRole is empty', async () => {
    const enc2 = new TextEncoder();
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(enc2.encode('model:x,role:requested'), '')
    );
    expect(result).toBeNull();
  });

  it('rejects JSON with wrong role', async () => {
    const enc2 = new TextEncoder();
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(
        enc2.encode(JSON.stringify({ model: 'gpt-4', role: 'resolved' })),
        'requested'
      )
    );
    expect(result).toBeNull();
  });

  it('rejects JSON with non-string model', async () => {
    const enc2 = new TextEncoder();
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(
        enc2.encode(JSON.stringify({ model: 42, role: 'requested' })),
        'requested'
      )
    );
    expect(result).toBeNull();
  });

  it('rejects single-line literal without role field', async () => {
    const enc2 = new TextEncoder();
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(enc2.encode('gpt-4'), 'requested')
    );
    expect(result).toBeNull();
  });

  it('rejects duplicate role field in key-value', async () => {
    const enc2 = new TextEncoder();
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(
        enc2.encode('model:x,role:requested,role:requested'),
        'requested'
      )
    );
    expect(result).toBeNull();
  });

  it('rejects duplicate model field in key-value', async () => {
    const enc2 = new TextEncoder();
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(
        enc2.encode('model:x,model:y,role:requested'),
        'requested'
      )
    );
    expect(result).toBeNull();
  });

  // V8: escaped string containing "role" — not a false positive
  it('exact: escaped string containing role does not trigger false duplicate', async () => {
    // JSON: {"not\\"role":"x","role":"requested","model":"gpt-4"}
    // This tests that escaped quotes inside key names don't confuse the scanner
    const enc2 = new TextEncoder();
    const jsonStr = '{"not\\\\\\"role":"x","role":"requested","model":"gpt-4"}';
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(enc2.encode(jsonStr), 'requested')
    );
    expect(result).toBe('gpt-4');
  });

  // V8: nested model key — not a false duplicate of top-level model
  it('exact: nested model key does not trigger false duplicate', async () => {
    const enc2 = new TextEncoder();
    const jsonStr = JSON.stringify({ data: { model: 'nested' }, model: 'gpt-4', role: 'requested' });
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(enc2.encode(jsonStr), 'requested')
    );
    expect(result).toBe('gpt-4');
  });

  // V9: escaped quote in key decoded before duplicate comparison
  it('exact: escaped quote in key name does not false-match role', async () => {
    // Raw JSON: {"role\\"x":"v1","role":"requested","model":"gpt-4"}
    // Key 'role\\"x' decodes to role"x (with escaped quote) — should not match 'role'
    const enc2 = new TextEncoder();
    const jsonStr = '{"role\\\\\\"x":"v1","role":"requested","model":"gpt-4"}';
    const result = await import('./host-attestation.js').then(m =>
      m.parseEvidenceModelValueForRole(enc2.encode(jsonStr), 'requested')
    );
    expect(result).toBe('gpt-4');
  });
});

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}