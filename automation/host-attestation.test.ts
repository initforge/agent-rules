import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCertificationAttestation,
  HOST_ATTESTATION_EVIDENCE_ROLES,
  hostAttestationEvidenceRef,
  hostAttestationEvidenceSubjectSha256,
} from '../packages/engine/src/contracts.js';
import {
  assertStableExecutableIdentity,
  assertStableWindowsCanonicalPath,
  assertRestrictedWindowsAcl,
  buildWindowsAclReadCommand,
  buildWindowsAclWriteCommand,
  collectHostAttestations,
  NATIVE_HOSTS,
  createExecutableSnapshot,
  hardenWindowsAcl,
  parseEvidenceModelValueForRole,
  parseWindowsAclReceipt,
  resolveNativeExecutable,
  securePathProbe,
  type ProbeRunner,
  type CollectedModelEvidence,
  type ModelEvidenceProvenance,
  type ExecutableSnapshot,
  type FileIdentityStats,
  type WindowsAclReceipt,
} from './host-attestation.js';

const commitSha = 'a'.repeat(64);
const contractSetSha256 = 'b'.repeat(64);
const now = new Date('2026-07-29T00:00:00.000Z');
const version = '1.2.3';
const modelValue = 'native-test-model';
const SNAPSHOT_REPLACEMENT_TIMEOUT_MS = process.platform === 'win32' ? 30_000 : 5_000;

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
  antigravity: modelEvidence('antigravity'),
  cursor: modelEvidence('cursor'),
  'deepseek-harness': modelEvidence('deepseek-harness'),
  'command-code': modelEvidence('command-code'),
  omp: modelEvidence('omp'),
};

const enc = (s: string) => encoder.encode(s);

function identityStats(
  dev: number,
  ino: number,
  options: { readonly file?: boolean; readonly symlink?: boolean } = {},
): FileIdentityStats {
  const file = options.file ?? true;
  const symlink = options.symlink ?? false;
  return {
    dev,
    ino,
    mode: file ? 0o100755 : 0o040755,
    isFile: () => file,
    isDirectory: () => !file && !symlink,
    isSymbolicLink: () => symlink,
  };
}

const hostVersionOutput: Record<string, string> = {
  codex: `codex-cli ${version}\n`,
  claude: `${version} (Claude Code)\n`,
  grok: `grok ${version} (abcdef) [stable]\n`,
  opencode: `${version}\n`,
  antigravity: `${version}\n`,
  cursor: `${version}\n`,
  'deepseek-harness': `${version}\n`,
  'command-code': `${version}\n`,
  omp: `omp/${version}\n`,
};

const hostHelpOutput: Record<string, string> = {
  codex: 'Commands:\n  exec  Run non-interactively\n  review  Review code\nOptions:\n  -m, --model <MODEL>\n',
  // claude 2.1.220 real format: `--print` appears twice (prose + flag). The
  // capability matcher is presence-based (>=1) so this attests claude:print.
  claude: 'Options:\n  --model <MODEL>\n  --agent <AGENT>\n  -p, --print [PROMPT]\n  --print for non-interactive output\n',
  grok: 'Options:\n  --model <MODEL>\n  --agent <NAME>\n  -p, --single <PROMPT>\n',
  // opencode 1.18.10 real format: `opencode run [message..]` (single space
  // before positional args) is accepted by the command matcher.
  opencode: 'Commands:\n  opencode run [message..]  run a prompt\n  opencode mcp  manage MCP\nOptions:\n  -m, --model  model to use\n',
  antigravity: 'Usage of agy:\n  --model  Model\n  --agent  Agent\n  -p, --print  Print\n',
  cursor: 'Usage of cursor:\n  --model  Model\n  --agent  Agent\n  -p, --print  Print\n',
  'deepseek-harness': 'Options:\n  --model <MODEL>\n  --profile <NAME>\n  --dump-config\n',
  'command-code': 'Usage of cmdc:\n  --model  Model\n  --agent  Agent\n  -p, --print  Print\n',
  omp: 'FLAGS\n  --model=<value>\n  --profile=<value>\n  -p, --print  Non-interactive mode\n',
};

const capabilityIds: Record<string, string[]> = {
  codex: ['codex:exec', 'codex:model', 'codex:review'],
  claude: ['claude:agent', 'claude:model', 'claude:print'],
  grok: ['grok:agent', 'grok:model', 'grok:single-prompt'],
  opencode: ['opencode:mcp', 'opencode:model', 'opencode:run'],
  antigravity: ['antigravity:agent', 'antigravity:model', 'antigravity:print'],
  cursor: ['cursor:agent', 'cursor:model', 'cursor:print'],
  'deepseek-harness': ['deepseek-harness:dump-config', 'deepseek-harness:model', 'deepseek-harness:profile'],
  'command-code': ['command-code:agent', 'command-code:model', 'command-code:print'],
  omp: ['omp:model', 'omp:print', 'omp:profile'],
};

const run: ProbeRunner = async (executable, args) => {
  const host = executable.split('/').at(-1)!;
  const versionOut = hostVersionOutput[host];
  const capOut = hostHelpOutput[host];
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
  it('roundtrips content-bound evidence through canonical certification for all five required hosts', async () => {
    const result = await collectHostAttestations(commitSha, {
      contractSetSha256,
      run,
      resolveExecutable,
      createSnapshot,
      now,
      ttlMs: 3_600_000,
      modelEvidence: allModelEvidence,
    });

    expect(NATIVE_HOSTS).toEqual(['codex', 'claude', 'opencode', 'cursor', 'antigravity', 'grok', 'deepseek-harness', 'command-code', 'omp']);
    expect(result.map((item) => item.host)).toEqual([...NATIVE_HOSTS]);
    expect(result.map((item) => item.host)).toContain('cursor');
    for (const item of result) {
      expect(item).toMatchObject({
        hostVersion: version,
        commitSha,
        capabilityStatus: 'HOST_NATIVE',
        capabilityIds: capabilityIds[item.host],
        contractSetSha256,
        requestedModel: modelValue,
        resolvedModel: modelValue,
        observedModel: modelValue,
        issuedAt: now.toISOString(),
        expiresAt: '2026-07-29T01:00:00.000Z',
      });
      // version evidence: framed hash of raw stdout|stderr bytes (no UTF-8 re-encode)
      const expectedVersionHash = sha256Bytes(
        concat(encoder.encode('stdout:'), enc(hostVersionOutput[item.host]), encoder.encode('|stderr:'), enc('')),
      );
      // capability evidence
      const expectedCapHash = sha256Bytes(
        concat(encoder.encode('stdout:'), enc(hostHelpOutput[item.host]), encoder.encode('|stderr:'), enc('')),
      );
      // model evidence hashes bind role+value+raw+provenance
      const hostKey = item.host;
      const ev = allModelEvidence[hostKey];
      const expectedHashes = {
        version: expectedVersionHash,
        capabilities: expectedCapHash,
        requestedModel: expectedModelHash('requestedModel', modelValue, ev.requested.rawEvidenceBytes, ev.requested.provenance),
        resolvedModel: expectedModelHash('resolvedModel', modelValue, ev.resolved.rawEvidenceBytes, ev.resolved.provenance),
        observedModel: expectedModelHash('observedModel', modelValue, ev.observed.rawEvidenceBytes, ev.observed.provenance),
      };
      expect(item).not.toHaveProperty('evidenceHashes');
      expect(item.evidenceRefs.map((evidence) => evidence.role)).toEqual(HOST_ATTESTATION_EVIDENCE_ROLES);
      for (const evidence of item.evidenceRefs) {
        expect(evidence).toEqual({
          role: evidence.role,
          host: item.host,
          commitSha,
          evidenceSha256: expectedHashes[evidence.role],
          evidenceRef: hostAttestationEvidenceRef(item.host, commitSha, evidence.role, expectedHashes[evidence.role]),
          subjectSha256: hostAttestationEvidenceSubjectSha256(evidence.role, item),
          observedAt: now.toISOString(),
        });
      }
      expect(() => assertCertificationAttestation(item, commitSha, now)).not.toThrow();
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

  it('fails rather than fabricating capability IDs from an incomplete help probe', async () => {
    const incompleteRun: ProbeRunner = async (_executable, args) => {
      const vOut = `codex-cli ${version}\n`;
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
    })).rejects.toThrow('help output drifted or lacks required stable tokens');
  });

  it('fails closed on unrecognized version output instead of extracting a stray number', async () => {
    const driftedVersionRun: ProbeRunner = async (_executable, args) => {
      const output = args[0] === '--version' ? 'release candidate build 1.2.3\n' : hostHelpOutput.codex;
      return { exitCode: 0, stdout: output, stderr: '', stdoutRaw: enc(output), stderrRaw: enc('') };
    };
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run: driftedVersionRun, now, resolveExecutable, createSnapshot,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow('version output does not match the supported CLI format');
  });

  it('fails closed when an injected resolver returns a relative executable path', async () => {
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, now, createSnapshot, modelEvidence: allModelEvidence,
      resolveExecutable: async () => 'not-an-absolute-cli',
    })).rejects.toThrow('resolver returned a non-absolute executable path');
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
      expect(item.nativeRunnerIdentity).toMatch(/^\d+:\d+\|\/native\/[a-z-]+\|[a-f0-9]{64}$/);
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

  it('rejects an unbounded TTL before probing hosts', async () => {
    await expect(collectHostAttestations(commitSha, {
      contractSetSha256, run, resolveExecutable, createSnapshot,
      now, ttlMs: 48 * 60 * 60 * 1000,
      modelEvidence: allModelEvidence,
    })).rejects.toThrow('at most 86400000ms');
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
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp(path.join(os.tmpdir(), 'attest-replace-test-')));
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
  }, SNAPSHOT_REPLACEMENT_TIMEOUT_MS);
});

describe('resolveNativeExecutable', () => {
  it('discovers the bundled Codex CLI and never selects a GUI launcher candidate', async () => {
    const fs = await import('node:fs/promises');
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-codex-cli-'));
    const cli = path.join(homeDir, '.codex-cli-npm', 'lib', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-linux-x64', 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex');
    const gui = path.join(homeDir, 'gui-launcher', 'codex');
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.writeFile(cli, '#!/bin/sh\nexit 0');
    await fs.chmod(cli, 0o755);
    await fs.mkdir(path.dirname(gui), { recursive: true });
    await fs.writeFile(gui, '#!/bin/sh\nexit 0');
    await fs.chmod(gui, 0o755);

    await expect(resolveNativeExecutable('codex', {
      homeDir,
      platform: 'linux',
      env: { CODEX_CLI_PATH: gui, PATH: path.dirname(gui) },
    })).resolves.toBe(cli);
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  it('resolves each non-GUI host to an absolute regular executable', async () => {
    const fs = await import('node:fs/promises');
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-native-cli-'));
    const paths = {
      claude: path.join(homeDir, '.local', 'share', 'claude', 'versions', '2.1.220'),
      grok: path.join(homeDir, '.grok', 'downloads', 'grok-linux-x86_64'),
      opencode: path.join(homeDir, '.opencode', 'bin', 'opencode'),
      antigravity: path.join(homeDir, '.local', 'bin', 'agy'),
    };
    for (const executable of Object.values(paths)) {
      await fs.mkdir(path.dirname(executable), { recursive: true });
      await fs.writeFile(executable, '#!/bin/sh\nexit 0');
      await fs.chmod(executable, 0o755);
    }
    for (const [host, executable] of Object.entries(paths)) {
      await expect(resolveNativeExecutable(host, { homeDir, platform: 'linux', env: { PATH: '' } })).resolves.toBe(executable);
    }
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  it('fails closed on a symlink or directory rather than returning it as a CLI', async () => {
    const fs = await import('node:fs/promises');
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-unsafe-cli-'));
    const bin = path.join(homeDir, '.opencode', 'bin');
    await fs.mkdir(bin, { recursive: true });
    try {
      await fs.symlink('/bin/true', path.join(bin, 'opencode'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await expect(resolveNativeExecutable('opencode', { homeDir, platform: 'linux', env: { PATH: '' } }))
      .rejects.toThrow('no absolute non-symlink executable');
    await fs.unlink(path.join(bin, 'opencode'));
    await fs.mkdir(path.join(bin, 'opencode'));
    await expect(resolveNativeExecutable('opencode', { homeDir, platform: 'linux', env: { PATH: '' } }))
      .rejects.toThrow('no absolute non-symlink executable');
    await fs.rm(homeDir, { recursive: true, force: true });
  });
});

// V5 adversarial: createExecutableSnapshot TOCTOU and permissions
describe('createExecutableSnapshot', () => {
  it.skipIf(process.platform === 'win32')('rejects POSIX symlink targets via O_NOFOLLOW', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp(path.join(os.tmpdir(), 'attest-symlink-test-')));
    const realFile = `${tmpDir}/real`;
    const linkFile = `${tmpDir}/link`;
    await import('node:fs/promises').then(m => m.writeFile(realFile, 'content'));
    await import('node:fs/promises').then(m => m.symlink(realFile, linkFile));
    await expect(createExecutableSnapshot(linkFile)).rejects.toThrow(/not a regular file|symlink|O_NOFOLLOW/);
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });

  it('rejects a Windows symlink even when O_NOFOLLOW is unavailable', async () => {
    const fs = await import('node:fs/promises');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-win-symlink-test-'));
    const realFile = path.join(tmpDir, 'real');
    const linkFile = path.join(tmpDir, 'link');
    await fs.writeFile(realFile, 'content');
    try {
      await fs.symlink(realFile, linkFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await expect(createExecutableSnapshot(linkFile, {
      platform: 'win32',
      windowsReparseInspector: async () => {},
      windowsAclHardener: async () => {
        throw new Error('ACL hardening must not be reached for a reparse source');
      },
    })).rejects.toThrow(/symlink|reparse/);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts only a stable regular-file identity across lstat and open', () => {
    const stable = identityStats(7, 19);
    expect(() => assertStableExecutableIdentity(stable, stable, stable, 'win32')).not.toThrow();
    expect(() => assertStableExecutableIdentity(
      identityStats(7, 19),
      identityStats(7, 20),
      identityStats(7, 20),
      'win32',
    )).toThrow('identity changed');
    expect(() => assertStableExecutableIdentity(
      identityStats(7, 19),
      identityStats(7, 19),
      identityStats(7, 20),
      'win32',
    )).toThrow('identity changed');
  });

  it('fails closed when Windows cannot provide a usable file identity', () => {
    const unavailable = identityStats(0, 0);
    expect(() => assertStableExecutableIdentity(unavailable, unavailable, unavailable, 'win32'))
      .toThrow('identity changed');
  });

  it('rejects mocked Windows leaf reparse metadata before or after open', () => {
    const regular = identityStats(7, 19);
    const reparse = identityStats(7, 19, { file: false, symlink: true });
    expect(() => assertStableExecutableIdentity(reparse, regular, regular, 'win32')).toThrow(/symlink|reparse/);
    expect(() => assertStableExecutableIdentity(regular, regular, reparse, 'win32')).toThrow(/symlink|reparse/);
  });

  it('rejects Windows canonical path drift around open', () => {
    const input = String.raw`C:\safe\runner.exe`;
    expect(() => assertStableWindowsCanonicalPath(input, input)).not.toThrow();
    expect(() => assertStableWindowsCanonicalPath(
      String.raw`\\?\C:\safe\runner.exe`,
      String.raw`\\?\C:\safe\runner.exe`,
    )).not.toThrow();
    expect(() => assertStableWindowsCanonicalPath(
      input,
      String.raw`C:\replacement\runner.exe`,
    )).toThrow('canonical path changed');
  });

  it('fails closed when Windows component inspection finds an ancestor junction', async () => {
    const fs = await import('node:fs/promises');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-win-junction-test-'));
    const exe = path.join(tmpDir, 'runner');
    let inspections = 0;
    await fs.writeFile(exe, '#!/bin/sh\necho ok');
    await expect(createExecutableSnapshot(exe, {
      platform: 'win32',
      windowsReparseInspector: async () => {
        inspections += 1;
        throw new Error('source path traverses a Windows junction');
      },
      windowsAclHardener: async () => {},
    })).rejects.toThrow(/junction/);
    expect(inspections).toBe(1);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === 'win32')('applies and verifies POSIX 0o500 snapshot mode', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp(path.join(os.tmpdir(), 'attest-perm-test-')));
    const exe = `${tmpDir}/runner`;
    await import('node:fs/promises').then(m => m.writeFile(exe, '#!/bin/sh\necho ok'));
    await import('node:fs/promises').then(m => m.chmod(exe, 0o755));
    const snap = await createExecutableSnapshot(exe);
    expect(snap.snapshotPath).not.toBe(exe);
    expect(snap.identity).toMatch(/^\d+:\d+\|.+[/\\][^|]+\|[a-f0-9]{64}$/);
    // Verify 0o500 mode on snapshot
    const snapStat = await import('node:fs/promises').then(m => m.stat(snap.snapshotPath));
    const mode = snapStat.mode & 0o777;
    expect(mode).toBe(0o500);
    await snap.cleanup();
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });

  it('uses Windows ACL hardening for both the directory and snapshot file', async () => {
    const fs = await import('node:fs/promises');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-win-acl-test-'));
    const exe = path.join(tmpDir, 'runner');
    const hardened: Array<{ readonly target: string; readonly kind: 'directory' | 'file' }> = [];
    await fs.writeFile(exe, '#!/bin/sh\necho ok');
    const snap = await createExecutableSnapshot(exe, {
      platform: 'win32',
      windowsReparseInspector: async () => {},
      windowsAclHardener: async (target, kind) => {
        hardened.push({ target, kind });
      },
    });
    expect(hardened).toEqual([
      { target: path.dirname(snap.snapshotPath), kind: 'directory' },
      { target: snap.snapshotPath, kind: 'file' },
    ]);
    expect((await fs.lstat(snap.snapshotPath)).isSymbolicLink()).toBe(false);
    await snap.cleanup();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('fails closed when Windows ACL hardening cannot be verified', async () => {
    const fs = await import('node:fs/promises');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-win-acl-fail-test-'));
    const exe = path.join(tmpDir, 'runner');
    let rejectedSnapshotPath = '';
    await fs.writeFile(exe, '#!/bin/sh\necho ok');
    await expect(createExecutableSnapshot(exe, {
      platform: 'win32',
      windowsReparseInspector: async () => {},
      windowsAclHardener: async (target, kind) => {
        if (kind === 'file') {
          rejectedSnapshotPath = target;
          throw new Error('Windows ACL verification failed');
        }
      },
    })).rejects.toThrow('Windows ACL verification failed');
    expect(rejectedSnapshotPath).not.toBe('');
    await expect(fs.access(rejectedSnapshotPath)).rejects.toThrow();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts only the exact protected Windows ACL policy', () => {
    const sid = 'S-1-5-21-1-2-3-1001';
    const directory: WindowsAclReceipt = {
      protected: true,
      owner: sid,
      rules: [{
        sid,
        type: 0,
        rights: 2032127,
        inheritance: 3,
        propagation: 0,
        inherited: false,
      }],
    };
    const file: WindowsAclReceipt = {
      protected: true,
      owner: sid,
      rules: [{
        sid,
        type: 0,
        rights: 1179817,
        inheritance: 0,
        propagation: 0,
        inherited: false,
      }],
    };
    expect(() => assertRestrictedWindowsAcl(directory, sid, 'directory')).not.toThrow();
    expect(() => assertRestrictedWindowsAcl(file, sid, 'file')).not.toThrow();
  });

  it('rejects inherited, extra-principal, and writable Windows ACL receipts', () => {
    const sid = 'S-1-5-21-1-2-3-1001';
    const expectedRule = {
      sid,
      type: 0,
      rights: 1179817,
      inheritance: 0,
      propagation: 0,
      inherited: false,
    };
    expect(() => assertRestrictedWindowsAcl({
      protected: false,
      owner: sid,
      rules: [{ ...expectedRule, inherited: true }],
    }, sid, 'file')).toThrow(/not restricted/);
    expect(() => assertRestrictedWindowsAcl({
      protected: true,
      owner: sid,
      rules: [expectedRule, { ...expectedRule, sid: 'S-1-1-0' }],
    }, sid, 'file')).toThrow(/not restricted/);
    expect(() => assertRestrictedWindowsAcl({
      protected: true,
      owner: sid,
      rules: [{ ...expectedRule, rights: 1180063 }],
    }, sid, 'file')).toThrow(/access policy/);
  });

  it('builds a fixed module-independent .NET Windows ACL read command', () => {
    const target = String.raw`C:\safe path\snapshot.exe`;
    const command = buildWindowsAclReadCommand(target, 'file');
    const script = command.args.at(-1)!;

    expect(command.executable).toMatch(
      /^[A-Za-z]:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i,
    );
    expect(command.args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
    expect(command.env).toEqual({
      CODEX_ATTEST_ACL_TARGET: target,
      CODEX_ATTEST_ACL_KIND: 'file',
    });
    expect(script).toContain('[System.IO.File]::GetAccessControl');
    expect(script).toContain('[System.IO.Directory]::GetAccessControl');
    expect(script).not.toMatch(/Get-Acl|Import-Module|ConvertTo-Json|\|/);
  });

  it('builds a fresh module-independent .NET security descriptor with exactly one intended ACE', () => {
    const target = String.raw`C:\safe path\snapshot.exe`;
    const sid = 'S-1-5-21-1-2-3-1001';
    const file = buildWindowsAclWriteCommand(target, 'file', sid);
    const directory = buildWindowsAclWriteCommand(path.win32.dirname(target), 'directory', sid);
    const fileScript = file.args.at(-1)!;
    const directoryScript = directory.args.at(-1)!;

    expect(file.executable).toMatch(
      /^[A-Za-z]:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i,
    );
    expect(file.args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
    expect(file.env).toEqual({
      CODEX_ATTEST_ACL_TARGET: target,
      CODEX_ATTEST_ACL_KIND: 'file',
      CODEX_ATTEST_ACL_SID: sid,
    });
    expect(directory.env.CODEX_ATTEST_ACL_KIND).toBe('directory');
    expect(fileScript).toContain('[System.Security.AccessControl.FileSecurity]::new()');
    expect(fileScript).toContain('[System.Security.AccessControl.DirectorySecurity]::new()');
    expect(fileScript).toContain('$acl.SetAccessRuleProtection($true,$false)');
    expect(fileScript).toContain('$acl.SetOwner($sid)');
    expect(fileScript).toContain('[System.Security.AccessControl.FileSystemRights]::ReadAndExecute');
    expect(directoryScript).toContain('[System.Security.AccessControl.FileSystemRights]::FullControl');
    expect(directoryScript).toContain('[System.Security.AccessControl.InheritanceFlags]::ObjectInherit');
    expect(directoryScript).toContain('[System.Security.AccessControl.InheritanceFlags]::ContainerInherit');
    expect(fileScript.match(/AddAccessRule/g)).toHaveLength(2);
    expect(fileScript).toContain('[System.IO.File]::SetAccessControl');
    expect(fileScript).toContain('[System.IO.Directory]::SetAccessControl');
    expect(fileScript).not.toMatch(/icacls|\/grant|Get-Acl|Set-Acl|Import-Module|New-Object|\|/i);
  });

  it.runIf(process.platform === 'win32')(
    'replaces Windows file and directory DACLs and verifies the exact one-ACE policy',
    async () => {
      const fs = await import('node:fs/promises');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-native-acl-test-'));
      const snapshot = path.join(tmpDir, 'snapshot.exe');
      try {
        await fs.writeFile(snapshot, 'test');
        await hardenWindowsAcl(tmpDir, 'directory');
        await hardenWindowsAcl(snapshot, 'file');
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    },
  );

  it('parses exact module-independent Windows ACL receipts and rejects malformed output', () => {
    const sid = 'S-1-5-21-1-2-3-1001';
    expect(parseWindowsAclReceipt([
      'protected=1',
      `owner=${sid}`,
      `rule=${sid},0,1179817,0,0,0`,
    ].join('\r\n'))).toEqual({
      protected: true,
      owner: sid,
      rules: [{
        sid,
        type: 0,
        rights: 1179817,
        inheritance: 0,
        propagation: 0,
        inherited: false,
      }],
    });
    expect(() => parseWindowsAclReceipt(`owner=${sid}`)).toThrow(/receipt header/);
    expect(() => parseWindowsAclReceipt(`protected=1\nowner=${sid}\nlocalized output`)).toThrow(/rule receipt/);
  });

  it('cleanup removes snapshot dir and surfaces errors', async () => {
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp(path.join(os.tmpdir(), 'attest-cleanup-test-')));
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
    const tmpDir = await import('node:fs/promises').then(m => m.mkdtemp(path.join(os.tmpdir(), 'attest-dir-test-')));
    await expect(createExecutableSnapshot(tmpDir)).rejects.toThrow(/not a regular file|directory/);
    await import('node:fs/promises').then(m => m.rm(tmpDir, { recursive: true, force: true }));
  });
});

// C7: secure path probe for npm bundle discovery validation
describe('securePathProbe', () => {
  it('accepts codex npm bundle path under .codex-cli-npm', () => {
    const result = securePathProbe('/home/user/.codex-cli-npm/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('accepts opencode path under .opencode/bin', () => {
    const result = securePathProbe('/home/user/.opencode/bin/opencode');
    expect(result.safe).toBe(true);
  });

  it('accepts claude path under .local/bin', () => {
    const result = securePathProbe('/home/user/.local/bin/claude');
    expect(result.safe).toBe(true);
  });

  it('accepts grok path under .grok/downloads', () => {
    const result = securePathProbe('/home/user/.grok/downloads/grok-v1.0.0');
    expect(result.safe).toBe(true);
  });

  it('accepts antigravity path under .local/bin', () => {
    const result = securePathProbe('/home/user/.local/bin/agy');
    expect(result.safe).toBe(true);
  });

  it('rejects relative path', () => {
    const result = securePathProbe('./local/bin/codex');
    expect(result.safe).toBe(false);
    expect(result.reason).toBe('non-absolute path');
  });

  it('rejects path with parent traversal', () => {
    const result = securePathProbe('/home/user/../etc/malicious');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('rejects URL-encoded traversal %2e%2e', () => {
    const result = securePathProbe('/home/user/%2e%2e/etc/malicious');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('rejects path not under allowed roots', () => {
    const result = securePathProbe('/tmp/evil/codex');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('not under allowed roots');
  });

  it('rejects /usr/bin path not in allowed roots', () => {
    const result = securePathProbe('/usr/bin/codex');
    expect(result.safe).toBe(false);
  });

  it('accepts path with custom allowed roots', () => {
    const result = securePathProbe('/opt/custom/codex', { allowedRoots: ['opt/custom'] });
    expect(result.safe).toBe(true);
  });

  it('normalizes Windows-style paths and accepts .codex-cli-npm on any platform', () => {
    // Mixed slashes get normalized before segment split
    const result = securePathProbe('C:\\Users\\user\\.codex-cli-npm\\bin\\codex.exe');
    expect(result.safe).toBe(true); // path.normalize + split handles both styles
  });

  it('accepts forward-slash Windows path on any platform', () => {
    const result = securePathProbe('C:/Users/user/.codex-cli-npm/bin/codex.exe');
    expect(result.safe).toBe(true);
  });

  it('verifies codex bundledCodexCandidates discovery result', async () => {
    const fs = await import('node:fs/promises');
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attest-secure-probe-'));
    const cli = path.join(homeDir, '.codex-cli-npm', 'lib', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-linux-x64', 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex');
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.writeFile(cli, '#!/bin/sh\necho codex');
    await fs.chmod(cli, 0o755);

    // Resolve using bundledCodexCandidates path
    const resolved = await resolveNativeExecutable('codex', { homeDir, platform: 'linux', env: { PATH: '' } });
    const probe = securePathProbe(resolved);
    expect(probe.safe).toBe(true);

    await fs.rm(homeDir, { recursive: true, force: true });
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
