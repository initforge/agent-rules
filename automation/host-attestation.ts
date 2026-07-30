import { createHash } from 'node:crypto';
import { access, realpath, readFile, stat, mkdtemp, writeFile, chmod, unlink, rmdir, open } from 'node:fs/promises';
import { constants as fsConstants, constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  isSha256,
  assertProvenanceTimestamp,
  CERTIFICATION_REQUIRED_HOSTS,
} from '../packages/engine/src/contracts.js';

const NATIVE_HOSTS = CERTIFICATION_REQUIRED_HOSTS;
type NativeHost = typeof NATIVE_HOSTS[number];

export interface ProbeResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutRaw: Uint8Array;
  readonly stderrRaw: Uint8Array;
}

export type ProbeRunner = (executable: string, args: readonly string[]) => Promise<ProbeResult>;

export interface ModelEvidenceProvenance {
  readonly sourceUri: string;
  readonly producerIdentity: string;
  readonly timestamp: string;
}

export interface ModelEvidenceRecord {
  readonly value: string;
  readonly rawEvidenceBytes: Uint8Array;
  readonly provenance: ModelEvidenceProvenance;
}

export interface CollectedModelEvidence {
  readonly requested: ModelEvidenceRecord;
  readonly resolved: ModelEvidenceRecord;
  readonly observed: ModelEvidenceRecord;
}

/** Create immutable restricted snapshot of executable in temp dir using O_NOFOLLOW fd.
 *  1. Open source by fd with O_NOFOLLOW (reject symlinks)
 *  2. fstat fd to confirm regular file
 *  3. Read bytes from same fd (TOCTOU-safe: same fd, no re-open)
 *  4. Write the exact rawBytes to snapshot path (mode 0o500 restrictive)
 *  5. Hash rawBytes (same bytes, no re-read from disk)
 *  6. Verify snapshot file exists and is regular
 *  7. No fallback: if snapshot fails, error propagates — never runs original executable
 *  8. Cleanup errors surfaced (fail-closed)
 *  Identity = dev:ino from fd.stat() + input label + sha256(rawBytes)
 *  No realpath() after read (TOCTOU-safe — identity from same fd) */
export interface ExecutableSnapshot {
  readonly snapshotPath: string;
  readonly identity: string;
  readonly cleanup: () => Promise<void>;
}

export async function createExecutableSnapshot(executable: string): Promise<ExecutableSnapshot> {
  let fd: any = null;
  let tmpDir: string | null = null;
  let snapshotPath: string | null = null;
  let identity: string | null = null;
  try {
    // Open with O_NOFOLLOW to reject symlinks — only regular files accepted
    fd = await open(executable, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await fd.stat();
    if (!stats.isFile()) {
      throw new Error(`not a regular file: ${executable} (${stats.isDirectory() ? 'directory' : 'special'})`);
    }
    // Read bytes from same fd (TOCTOU-safe: no re-open of path)
    const buf = await fd.readFile();
    const rawBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const sha = sha256Bytes(rawBytes);
    // Identity from same fd: dev:ino (canonical inode binding) + original input label + hash
    // No realpath() call after read — avoids TOCTOU on the path
    identity = `${stats.dev}:${stats.ino}|${executable}|${sha}`;

    // Create temp directory with restrictive mode
    tmpDir = await mkdtemp(path.join(tmpdir(), 'attest-snapshot-'));
    await chmod(tmpDir, 0o700);
    snapshotPath = path.join(tmpDir, path.basename(executable));

    // Write the exact rawBytes to snapshot path (no re-read from source path)
    await writeFile(snapshotPath, rawBytes, { mode: 0o500 });

    // Verify snapshot file is regular (defense-in-depth)
    const snapStat = await stat(snapshotPath);
    if (!snapStat.isFile()) {
      throw new Error('snapshot is not a regular file after write');
    }

    return {
      snapshotPath,
      identity,
      cleanup: async () => {
        let errors: string[] = [];
        if (snapshotPath) { try { await unlink(snapshotPath); } catch (e) { errors.push(`unlink: ${e}`); } }
        if (tmpDir) { try { await rmdir(tmpDir); } catch (e) { errors.push(`rmdir: ${e}`); } }
        if (errors.length > 0) throw new Error(`snapshot cleanup failed: ${errors.join('; ')}`);
      },
    };
  } catch (error) {
    // Surface cleanup errors from partial setup
    let cleanupErrors: string[] = [];
    if (snapshotPath) { try { await unlink(snapshotPath); } catch (e) { cleanupErrors.push(`unlink: ${e}`); } }
    if (tmpDir) { try { await rmdir(tmpDir); } catch (e) { cleanupErrors.push(`rmdir: ${e}`); } }
    const baseMsg = error instanceof Error ? error.message : String(error);
    const suffix = cleanupErrors.length > 0 ? ` (cleanup errors: ${cleanupErrors.join('; ')})` : '';
    throw new Error(`executable snapshot failed: ${baseMsg}${suffix}`);
  } finally {
    if (fd) { try { await fd.close(); } catch {} }
  }
}

export interface CollectorOptions {
  readonly contractSetSha256: string;
  readonly run?: ProbeRunner;
  readonly resolveExecutable?: (host: NativeHost) => Promise<string>;
  readonly createSnapshot?: (executable: string) => Promise<ExecutableSnapshot>;
  readonly now?: Date;
  readonly ttlMs?: number;
  readonly modelEvidence?: Readonly<Record<string, CollectedModelEvidence>>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function concatUint8(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function framedEvidenceHash(stdoutRaw: Uint8Array, stderrRaw: Uint8Array): string {
  const prefix = new TextEncoder().encode('stdout:');
  const sep = new TextEncoder().encode('|stderr:');
  const frame = concatUint8(prefix, stdoutRaw, sep, stderrRaw);
  return sha256Bytes(frame);
}

async function executableExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const runProcess: ProbeRunner = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(new Uint8Array(chunk)); });
  child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(new Uint8Array(chunk)); });
  child.once('error', reject);
  child.once('close', (exitCode) => {
    const stdoutRaw = concatUint8(...stdoutChunks);
    const stderrRaw = concatUint8(...stderrChunks);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    resolve({
      exitCode: exitCode ?? 1,
      stdout: decoder.decode(stdoutRaw),
      stderr: decoder.decode(stderrRaw),
      stdoutRaw,
      stderrRaw,
    });
  });
});

/**
 * Pre-scan JSON string for duplicate target keys at depth 1 (top-level object).
 * Decodes JSON escape sequences before key comparison (e.g., `\"` inside key → `"`).
 * Fail-closed: rejects before JSON.parse (which silently uses last-wins).
 */
function _hasDuplicateJsonKeys(jsonStr: string, targets: readonly string[]): boolean {
  let depth = 0;
  let inStr = false;
  const seen = new Set<string>();
  let i = 0;
  while (i < jsonStr.length) {
    const ch = jsonStr[i];
    if (inStr) {
      if (ch === '\\') i++; // skip escaped char
      else if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      if (depth === 1) {
        // Collect potential key name, decoding escapes
        const start = i + 1;
        let keyChars: string[] = [];
        let j = start;
        while (j < jsonStr.length) {
          if (jsonStr[j] === '\\') {
            // Decode JSON escape: \n, \t, \", \\, etc.
            const next = j + 1;
            if (next < jsonStr.length) {
              const esc = jsonStr[next];
              if (esc === '"') keyChars.push('"');
              else if (esc === '\\') keyChars.push('\\');
              else if (esc === 'n') keyChars.push('\n');
              else if (esc === 't') keyChars.push('\t');
              else if (esc === 'r') keyChars.push('\r');
              else keyChars.push(esc); // \uXXXX etc not needed for evidence keys
              j = next + 1; // skip both backslash and escape char
              continue;
            }
            break;
          }
          if (jsonStr[j] === '"') break;
          keyChars.push(jsonStr[j]);
          j++;
        }
        const key = keyChars.join('');
        // Check if this string is followed by ':' (meaning it's a key, not a value)
        let k = j + 1;
        while (k < jsonStr.length && jsonStr[k] <= ' ') k++;
        if (k < jsonStr.length && jsonStr[k] === ':' && targets.includes(key)) {
          if (seen.has(key)) return true; // duplicate
          seen.add(key);
        }
        i = j;
      }
      i++;
      continue;
    }
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { depth--; i++; continue; }
    i++;
  }
  return false;
}

/**
 * Parse evidence bytes to extract model value using role-specific structured parsing.
 * Requires expectedRole (non-empty); JSON and key-value paths validate role field matches.
 * Model value must be exact string match from parsed output — no substring, no "name" fallback.
 * Rejects: cross-role, missing role, duplicate role/model, empty expectedRole.
 * Every accepted format MUST have explicit role field — no literal fallback.
 */
export function parseEvidenceModelValueForRole(rawBytes: Uint8Array, expectedRole: string): string | null {
  if (!expectedRole) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
    const trimmed = text.trim();
    if (!trimmed) return null;

    // JSON path: pre-scan for duplicate keys (fail-closed before JSON.parse)
    if (trimmed.startsWith('{')) {
      if (_hasDuplicateJsonKeys(trimmed, ['role', 'model'])) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          if (typeof parsed.role !== 'string' || parsed.role !== expectedRole) return null;
          if (typeof parsed.model === 'string') return parsed.model;
          return null;
        }
      } catch { /* fall through */ }
    }

    // Key-value path: split by commas, require 'role:' and 'model:' exactly once each
    const parts = trimmed.split(',');
    let foundRole = false;
    let modelValue: string | null = null;
    let roleCount = 0;
    let modelCount = 0;
    for (const part of parts) {
      const eqIdx = part.indexOf(':');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (key === 'role') {
        roleCount++;
        if (roleCount > 1) return null; // duplicate role
        foundRole = val === expectedRole;
      }
      if (key === 'model') {
        modelCount++;
        if (modelCount > 1) return null; // duplicate model
        modelValue = val;
      }
    }
    if (modelValue !== null && foundRole) return modelValue;

    return null;
  } catch {
    return null;
  }
}

function evidenceExactModelValueForRole(rawBytes: Uint8Array, declaredValue: string, expectedRole: string): boolean {
  const parsed = parseEvidenceModelValueForRole(rawBytes, expectedRole);
  return parsed !== null && typeof parsed === 'string' && parsed === declaredValue;
}

/** Exported for testing: returns platform-specific Codex Desktop candidate paths. */
export function codexDesktopCandidates(platform: string = process.platform): string[] {
  if (platform === 'linux') return ['/usr/bin/codex-desktop', '/opt/codex-desktop'];
  if (platform === 'darwin') return ['/Applications/Codex.app/Contents/MacOS/Codex'];
  return [];
}

async function resolveExecutable(host: NativeHost): Promise<string> {
  if (host !== 'codex') return host;
  const candidates = codexDesktopCandidates();
  for (const candidate of candidates) {
    if (await executableExists(candidate)) return candidate;
  }
  throw new Error(`codex: Codex Desktop executable not found. Checked: ${candidates.join(', ')}`);
}

function successfulOutput(result: ProbeResult): string {
  const output = `${result.stdout}${result.stderr}`.trim();
  if (!output) throw new Error('probe produced no evidence');
  return output;
}

function versionFrom(output: string): string {
  const match = output.match(/(?:version|v)?\s*(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?)/i);
  if (!match) throw new Error('version probe did not report a parseable version');
  return match[1];
}

function capabilityIdsFrom(output: string): string[] {
  const capabilities = [...output.matchAll(/\bcapabilit(?:y|ies)\s*[:=]\s*([^\n\r]+)/ig)]
    .flatMap((match) => match[1].split(',').map((value) => value.trim()).filter(Boolean));
  if (capabilities.length === 0) throw new Error('capability probe did not report capability IDs');
  return [...new Set(capabilities)].sort();
}

/**
 * Collects fail-closed, local native-host evidence. Each CLI is queried only with
 * read-only `--version` and `--help` probes; no host command is asked to mutate state.
 * Model evidence MUST be supplied explicitly via `options.modelEvidence` — the collector
 * does NOT infer requestedModel/resolvedModel/observedModel from the --help output.
 */
export interface CollectedHostAttestation {
  readonly host: NativeHost;
  readonly hostVersion: string;
  readonly commitSha: string;
  readonly capabilityStatus: 'HOST_NATIVE';
  readonly capabilityIds: readonly string[];
  readonly contractSetSha256: string;
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly observedModel: string;
  readonly evidenceHashes: readonly string[];
  readonly nativeRunnerIdentity: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export async function collectHostAttestations(
  commitSha: string,
  options: CollectorOptions,
): Promise<CollectedHostAttestation[]> {
  if (!commitSha.trim()) throw new Error('commit SHA is required');
  if (!isSha256(options.contractSetSha256)) throw new Error('contractSetSha256 must be a SHA-256');
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? 60 * 60 * 1000));
  if (!(expiresAt.getTime() > now.getTime())) throw new Error('attestation TTL must be positive');
  const run = options.run ?? runProcess;

  // Validate modelEvidence: required, must cover all hosts, every field non-empty, provenance present
  const me = options.modelEvidence;
  if (!me) throw new Error('modelEvidence is required; callers must provide explicit model observations');
  for (const host of NATIVE_HOSTS) {
    const ev = me[host];
    if (!ev) throw new Error(`${host}: missing model evidence`);
    for (const field of ['requested', 'resolved', 'observed'] as const) {
      const record = ev[field];
      if (!record || !record.value || record.value.trim().length === 0) {
        throw new Error(`${host}: model evidence field '${field}' has empty value`);
      }
      if (!record.rawEvidenceBytes || record.rawEvidenceBytes.length === 0) {
        throw new Error(`${host}: model evidence field '${field}' has empty rawEvidenceBytes`);
      }
      // V4: role-aware exact parser — evidence must contain both model:value and role:field
      if (!evidenceExactModelValueForRole(record.rawEvidenceBytes, record.value, field)) {
        throw new Error(`${host}: model evidence '${field}' value '${record.value}' not found via role-aware exact parse`);
      }
      // Finding 1: provenance required
      if (!record.provenance?.sourceUri || !record.provenance?.producerIdentity || !record.provenance?.timestamp) {
        throw new Error(`${host}: model evidence '${field}' missing provenance (sourceUri, producerIdentity, timestamp)`);
      }
      // Finding 5: provenance timestamp via canonical contract
      try {
        assertProvenanceTimestamp(
          record.provenance.timestamp,
          now.toISOString(),
          expiresAt.toISOString(),
          now,
        );
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${host}: model evidence '${field}' ${reason}`);
      }
    }
  }

  const snapshotProvider = options.createSnapshot ?? createExecutableSnapshot;

  const allCleanupErrors: Error[] = [];

  return Promise.all(NATIVE_HOSTS.map(async (host) => {
    let snapshot: ExecutableSnapshot | null = null;
    try {
      const executable = await (options.resolveExecutable ?? resolveExecutable)(host);

      // V5: create immutable snapshot via O_NOFOLLOW fd, probe snapshot only, never original
      snapshot = await snapshotProvider(executable);
      const { snapshotPath, identity: nativeRunnerIdentity } = snapshot;

      // --version probe from snapshot (immutable — never runs original executable)
      const versionResult = await run(snapshotPath, ['--version']);
      if (versionResult.exitCode !== 0) {
        throw new Error(`version probe failed with exit code ${versionResult.exitCode}`);
      }
      const versionOutput = successfulOutput(versionResult);
      const versionHash = framedEvidenceHash(versionResult.stdoutRaw, versionResult.stderrRaw);

      // --help probe from snapshot
      const capabilityResult = await run(snapshotPath, ['--help']);
      if (capabilityResult.exitCode !== 0) {
        throw new Error(`capability probe failed with exit code ${capabilityResult.exitCode}`);
      }
      const capabilityOutput = successfulOutput(capabilityResult);
      const capabilityHash = framedEvidenceHash(capabilityResult.stdoutRaw, capabilityResult.stderrRaw);

      // Model evidence: role-aware exact parser
      const hostModelEv = me[host];
      const encoder = new TextEncoder();
      const modelHashes: string[] = [];
      for (const [role, record] of [['requestedModel', hostModelEv.requested], ['resolvedModel', hostModelEv.resolved], ['observedModel', hostModelEv.observed]] as const) {
        const p = record.provenance;
        modelHashes.push(sha256Bytes(concatUint8(
          encoder.encode(`role:${role}`),
          encoder.encode(`value:${record.value}`),
          record.rawEvidenceBytes,
          encoder.encode(`source:${p.sourceUri}`),
          encoder.encode(`producer:${p.producerIdentity}`),
          encoder.encode(`ts:${p.timestamp}`),
        )));
      }

      const attestation: CollectedHostAttestation = {
        host,
        hostVersion: versionFrom(versionOutput),
        commitSha,
        capabilityStatus: 'HOST_NATIVE',
        capabilityIds: capabilityIdsFrom(capabilityOutput),
        contractSetSha256: options.contractSetSha256,
        requestedModel: hostModelEv.requested.value,
        resolvedModel: hostModelEv.resolved.value,
        observedModel: hostModelEv.observed.value,
        evidenceHashes: [versionHash, capabilityHash, ...modelHashes],
        nativeRunnerIdentity,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      return attestation;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${host}: unable to collect native attestation: ${detail}`);
    } finally {
      if (snapshot) {
        try { await snapshot.cleanup(); } catch (e) {
          allCleanupErrors.push(e instanceof Error ? e : new Error(String(e)));
        }
      }
    }
  })).then((results) => {
    if (allCleanupErrors.length > 0) {
      throw new Error(`attestation cleanup failed: ${allCleanupErrors.map(e => e.message).join('; ')}`);
    }
    return results;
  });
}

export { NATIVE_HOSTS };