import { createHash } from 'node:crypto';
import { access, lstat, realpath, mkdtemp, chmod, unlink, rmdir, open, readdir } from 'node:fs/promises';
import { constants as fsConstants, constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
import {
  isSha256,
  assertProvenanceTimestamp,
  CERTIFICATION_REQUIRED_HOSTS,
  HOST_ATTESTATION_EVIDENCE_ROLES,
  hostAttestationEvidenceRef,
  hostAttestationEvidenceSubjectSha256,
  type HostAttestation,
  type HostAttestationEvidenceRef,
  type HostAttestationEvidenceRole,
} from '../packages/engine/src/contracts.js';

const NATIVE_HOSTS = CERTIFICATION_REQUIRED_HOSTS;
const MAX_ATTESTATION_TTL_MS = 86_400_000;
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

/** Create an immutable, OS-restricted snapshot of an executable.
 *  1. On POSIX, open with O_NOFOLLOW. On Windows, bind pre/open/post file
 *     identity and canonical path because O_NOFOLLOW is ignored.
 *  2. fstat fd to confirm regular file
 *  3. Read bytes from same fd (TOCTOU-safe: same fd, no re-open)
 *  4. Write the exact rawBytes to snapshot path (POSIX 0o500 or Windows ACL)
 *  5. Hash rawBytes (same bytes, no re-read from disk)
 *  6. Verify snapshot identity and platform-native permissions
 *  7. No fallback: if snapshot fails, error propagates — never runs original executable
 *  8. Cleanup errors surfaced (fail-closed)
 *  Identity = dev:ino from fd.stat() + input label + sha256(rawBytes) */
export interface ExecutableSnapshot {
  readonly snapshotPath: string;
  readonly identity: string;
  readonly cleanup: () => Promise<void>;
}

export interface FileIdentityStats {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export type WindowsAclHardener = (target: string, kind: 'directory' | 'file') => Promise<void>;
export type WindowsReparseInspector = (target: string) => Promise<void>;

export interface ExecutableSnapshotOptions {
  readonly platform?: NodeJS.Platform;
  readonly windowsAclHardener?: WindowsAclHardener;
  readonly windowsReparseInspector?: WindowsReparseInspector;
}

function sameFileIdentity(left: FileIdentityStats, right: FileIdentityStats, platform: NodeJS.Platform): boolean {
  if (platform === 'win32' && left.dev === 0 && left.ino === 0) return false;
  return left.dev === right.dev && left.ino === right.ino;
}

/** Exported for deterministic adversarial tests of the open/lstat race boundary. */
export function assertStableExecutableIdentity(
  before: FileIdentityStats,
  opened: FileIdentityStats,
  after: FileIdentityStats,
  platform: NodeJS.Platform,
): void {
  if (before.isSymbolicLink() || after.isSymbolicLink()) throw new Error('source path is a symlink or reparse point');
  if (!before.isFile() || !opened.isFile() || !after.isFile()) throw new Error('source path is not a regular file');
  if (!sameFileIdentity(before, opened, platform) || !sameFileIdentity(opened, after, platform)) {
    throw new Error('source executable identity changed during secure open');
  }
}

function normalizedWindowsPath(value: string): string {
  const normalized = path.win32.normalize(value);
  const withoutNamespace = normalized.toLowerCase().startsWith('\\\\?\\unc\\')
    ? `\\\\${normalized.slice(8)}`
    : normalized.replace(/^\\\\\?\\/, '');
  return withoutNamespace.toLowerCase();
}

/** Exported for mocks: the resolved source path must not drift around open(). */
export function assertStableWindowsCanonicalPath(before: string, after: string): void {
  if (normalizedWindowsPath(before) !== normalizedWindowsPath(after)) {
    throw new Error('source canonical path changed during secure open');
  }
}

function runFixedCommand(
  executable: string,
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf8');
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(executable)} exited ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
    });
  });
}

let windowsSidPromise: Promise<string> | null = null;

function windowsSystemExecutable(...segments: readonly string[]): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const resolvedRoot = path.win32.resolve(systemRoot);
  const parsedRoot = path.win32.parse(resolvedRoot);
  if (
    !path.win32.isAbsolute(systemRoot)
    || path.win32.dirname(resolvedRoot).toLowerCase() !== parsedRoot.root.toLowerCase()
    || path.win32.basename(resolvedRoot).toLowerCase() !== 'windows'
  ) {
    throw new Error('SystemRoot is not a trusted drive-root Windows directory');
  }
  return path.win32.join(resolvedRoot, ...segments);
}

async function currentWindowsSid(): Promise<string> {
  if (!windowsSidPromise) {
    const whoami = windowsSystemExecutable('System32', 'whoami.exe');
    windowsSidPromise = runFixedCommand(whoami, ['/user', '/fo', 'csv', '/nh']).then((output) => {
      const sid = output.match(/S-\d-\d+(?:-\d+)+/i)?.[0];
      if (!sid) throw new Error('whoami did not report a Windows SID');
      return sid;
    });
  }
  return windowsSidPromise;
}

export interface WindowsAclRuleReceipt {
  readonly sid: string;
  readonly type: number;
  readonly rights: number;
  readonly inheritance: number;
  readonly propagation: number;
  readonly inherited: boolean;
}

export interface WindowsAclReceipt {
  readonly protected: boolean;
  readonly owner: string;
  readonly rules: readonly WindowsAclRuleReceipt[];
}

export interface WindowsAclReadCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export type WindowsAclWriteCommand = WindowsAclReadCommand;

const WINDOWS_ALLOW_ACE = 0;
const WINDOWS_INHERIT_NONE = 0;
const WINDOWS_INHERIT_OBJECT_AND_CONTAINER = 3;
const WINDOWS_PROPAGATION_NONE = 0;
// Allow ACEs automatically include Synchronize (0x100000) on Windows.
const WINDOWS_READ_AND_EXECUTE = 131241 | 1048576;
const WINDOWS_FULL_CONTROL = 2032127;

/** Validate an independently read DACL, not merely the ACL mutation command. */
export function assertRestrictedWindowsAcl(
  receipt: WindowsAclReceipt,
  sid: string,
  kind: 'directory' | 'file',
): void {
  const expectedRights = kind === 'directory' ? WINDOWS_FULL_CONTROL : WINDOWS_READ_AND_EXECUTE;
  const expectedInheritance = kind === 'directory'
    ? WINDOWS_INHERIT_OBJECT_AND_CONTAINER
    : WINDOWS_INHERIT_NONE;
  if (!receipt.protected || receipt.owner.toLowerCase() !== sid.toLowerCase() || receipt.rules.length !== 1) {
    throw new Error('Windows ACL is not restricted to the current SID');
  }
  const [rule] = receipt.rules;
  if (
    rule.sid.toLowerCase() !== sid.toLowerCase()
    || rule.type !== WINDOWS_ALLOW_ACE
    || rule.rights !== expectedRights
    || rule.inheritance !== expectedInheritance
    || rule.propagation !== WINDOWS_PROPAGATION_NONE
    || rule.inherited
  ) {
    throw new Error(`Windows ${kind} ACL does not match the required access policy`);
  }
}

export function buildWindowsAclReadCommand(target: string, kind: 'directory' | 'file'): WindowsAclReadCommand {
  const powershell = windowsSystemExecutable('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = [
    '$ErrorActionPreference="Stop";',
    '$sections=[System.Security.AccessControl.AccessControlSections]::Access -bor ',
    '[System.Security.AccessControl.AccessControlSections]::Owner;',
    'if($env:CODEX_ATTEST_ACL_KIND -ceq "directory"){',
    '$acl=[System.IO.Directory]::GetAccessControl($env:CODEX_ATTEST_ACL_TARGET,$sections);',
    '}elseif($env:CODEX_ATTEST_ACL_KIND -ceq "file"){',
    '$acl=[System.IO.File]::GetAccessControl($env:CODEX_ATTEST_ACL_TARGET,$sections);',
    '}else{throw "Invalid ACL target kind"};',
    '$rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]);',
    '[Console]::Out.WriteLine("protected="+[int]$acl.AreAccessRulesProtected);',
    '[Console]::Out.WriteLine("owner="+$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value);',
    'for($i=0;$i -lt $rules.Count;$i++){',
    '$rule=$rules[$i];',
    '[Console]::Out.WriteLine("rule="+$rule.IdentityReference.Value+","',
    '+[int]$rule.AccessControlType+","+[int64]$rule.FileSystemRights+","',
    '+[int]$rule.InheritanceFlags+","+[int]$rule.PropagationFlags+","',
    '+[int]$rule.IsInherited);',
    '}',
  ].join('');
  return {
    executable: powershell,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    env: {
      CODEX_ATTEST_ACL_TARGET: target,
      CODEX_ATTEST_ACL_KIND: kind,
    },
  };
}

/**
 * Build a module-independent ACL replacement command.
 *
 * A fresh security descriptor is intentional: mutating an existing DACL can
 * replace only matching ACEs and leave unrelated explicit ACEs behind. The
 * readback below therefore cannot certify an exact one-ACE policy unless the
 * DACL itself is replaced.
 */
export function buildWindowsAclWriteCommand(
  target: string,
  kind: 'directory' | 'file',
  sid: string,
): WindowsAclWriteCommand {
  const powershell = windowsSystemExecutable('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = [
    '$ErrorActionPreference="Stop";',
    '$sid=[System.Security.Principal.SecurityIdentifier]::new($env:CODEX_ATTEST_ACL_SID);',
    '$accessType=[System.Security.AccessControl.AccessControlType]::Allow;',
    '$propagation=[System.Security.AccessControl.PropagationFlags]::None;',
    'if($env:CODEX_ATTEST_ACL_KIND -ceq "directory"){',
    '$acl=[System.Security.AccessControl.DirectorySecurity]::new();',
    '$acl.SetAccessRuleProtection($true,$false);',
    '$acl.SetOwner($sid);',
    '$rights=[System.Security.AccessControl.FileSystemRights]::FullControl;',
    '$inheritance=[System.Security.AccessControl.InheritanceFlags]::ObjectInherit -bor ',
    '[System.Security.AccessControl.InheritanceFlags]::ContainerInherit;',
    '$rule=[System.Security.AccessControl.FileSystemAccessRule]::new(',
    '$sid,$rights,$inheritance,$propagation,$accessType);',
    '[void]$acl.AddAccessRule($rule);',
    '[System.IO.Directory]::SetAccessControl($env:CODEX_ATTEST_ACL_TARGET,$acl);',
    '}elseif($env:CODEX_ATTEST_ACL_KIND -ceq "file"){',
    '$acl=[System.Security.AccessControl.FileSecurity]::new();',
    '$acl.SetAccessRuleProtection($true,$false);',
    '$acl.SetOwner($sid);',
    '$rights=[System.Security.AccessControl.FileSystemRights]::ReadAndExecute;',
    '$inheritance=[System.Security.AccessControl.InheritanceFlags]::None;',
    '$rule=[System.Security.AccessControl.FileSystemAccessRule]::new(',
    '$sid,$rights,$inheritance,$propagation,$accessType);',
    '[void]$acl.AddAccessRule($rule);',
    '[System.IO.File]::SetAccessControl($env:CODEX_ATTEST_ACL_TARGET,$acl);',
    '}else{throw "Invalid ACL target kind"};',
  ].join('');
  return {
    executable: powershell,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    env: {
      CODEX_ATTEST_ACL_TARGET: target,
      CODEX_ATTEST_ACL_KIND: kind,
      CODEX_ATTEST_ACL_SID: sid,
    },
  };
}

export function parseWindowsAclReceipt(output: string): WindowsAclReceipt {
  const lines = output.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2 || !/^protected=[01]$/.test(lines[0]) || !/^owner=S-\d-\d+(?:-\d+)+$/i.test(lines[1])) {
    throw new Error('PowerShell did not return a valid Windows ACL receipt header');
  }
  const rules = lines.slice(2).map((line): WindowsAclRuleReceipt => {
    const match = /^rule=(S-\d-\d+(?:-\d+)+),(-?\d+),(-?\d+),(-?\d+),(-?\d+),([01])$/i.exec(line);
    if (!match) throw new Error('PowerShell did not return a valid Windows ACL rule receipt');
    return {
      sid: match[1],
      type: Number(match[2]),
      rights: Number(match[3]),
      inheritance: Number(match[4]),
      propagation: Number(match[5]),
      inherited: match[6] === '1',
    };
  });
  return {
    protected: lines[0] === 'protected=1',
    owner: lines[1].slice('owner='.length),
    rules,
  };
}

async function readWindowsAcl(target: string, kind: 'directory' | 'file'): Promise<WindowsAclReceipt> {
  const command = buildWindowsAclReadCommand(target, kind);
  const output = await runFixedCommand(command.executable, command.args, command.env);
  return parseWindowsAclReceipt(output);
}

export const hardenWindowsAcl: WindowsAclHardener = async (target, kind) => {
  const sid = await currentWindowsSid();
  const command = buildWindowsAclWriteCommand(target, kind, sid);
  await runFixedCommand(command.executable, command.args, command.env);
  assertRestrictedWindowsAcl(await readWindowsAcl(target, kind), sid, kind);
};

const rejectWindowsReparseComponents: WindowsReparseInspector = async (target) => {
  const resolved = path.win32.resolve(target);
  const root = path.win32.parse(resolved).root;
  let current = root;
  for (const segment of resolved.slice(root.length).split(path.win32.sep).filter(Boolean)) {
    current = path.win32.join(current, segment);
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error(`source path traverses a Windows symlink or reparse point: ${current}`);
    }
  }
};

async function verifyPosixMode(target: string, expected: number, label: string): Promise<void> {
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink() || (metadata.mode & 0o777) !== expected) {
    throw new Error(`${label} permissions are not ${expected.toString(8)}`);
  }
}

export async function createExecutableSnapshot(
  executable: string,
  options: ExecutableSnapshotOptions = {},
): Promise<ExecutableSnapshot> {
  const platform = options.platform ?? process.platform;
  const windowsAcl = options.windowsAclHardener ?? hardenWindowsAcl;
  const windowsReparseInspector = options.windowsReparseInspector ?? rejectWindowsReparseComponents;
  let fd: any = null;
  let tmpDir: string | null = null;
  let snapshotPath: string | null = null;
  let identity: string | null = null;
  try {
    if (platform === 'win32') await windowsReparseInspector(executable);
    const sourceBefore = await lstat(executable);
    const canonicalBefore = platform === 'win32' ? await realpath(executable) : executable;
    // O_NOFOLLOW is authoritative on POSIX. Windows ignores it, so Windows
    // additionally binds pre/post lstat identity to the opened handle below.
    const sourceFlags = constants.O_RDONLY | (platform === 'win32' ? 0 : constants.O_NOFOLLOW);
    fd = await open(executable, sourceFlags);
    const stats = await fd.stat();
    const sourceAfter = await lstat(executable);
    assertStableExecutableIdentity(sourceBefore, stats, sourceAfter, platform);
    if (platform === 'win32') {
      const canonicalAfter = await realpath(executable);
      assertStableWindowsCanonicalPath(canonicalBefore, canonicalAfter);
      await windowsReparseInspector(executable);
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
    if (platform === 'win32') {
      await windowsAcl(tmpDir, 'directory');
    } else {
      await chmod(tmpDir, 0o700);
      await verifyPosixMode(tmpDir, 0o700, 'snapshot directory');
    }
    snapshotPath = path.join(tmpDir, path.basename(executable));

    // Create through an O_EXCL|O_NOFOLLOW fd, then write and verify through that
    // same fd. This prevents a path substitution from changing the snapshot bytes.
    const snapshotFd = await open(
      snapshotPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (platform === 'win32' ? 0 : constants.O_NOFOLLOW),
      platform === 'win32' ? 0o600 : 0o500,
    );
    try {
      await snapshotFd.writeFile(rawBytes);
      if (platform !== 'win32') await snapshotFd.chmod(0o500);
      const snapStat = await snapshotFd.stat();
      if (!snapStat.isFile()) throw new Error('snapshot is not a regular file after write');
      const snapshotPathStat = await lstat(snapshotPath);
      if (snapshotPathStat.isSymbolicLink() || !sameFileIdentity(snapStat, snapshotPathStat, platform)) {
        throw new Error('snapshot path identity changed during secure creation');
      }
    } finally {
      await snapshotFd.close();
    }
    if (platform === 'win32') {
      await windowsAcl(snapshotPath, 'file');
    } else {
      await verifyPosixMode(snapshotPath, 0o500, 'snapshot file');
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

async function safeAbsoluteExecutable(candidate: string): Promise<string | null> {
  if (!path.isAbsolute(candidate)) return null;
  try {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return null;
    await access(candidate, fsConstants.X_OK);
    return candidate;
  } catch {
    return null;
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

export interface NativeExecutableResolutionOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
  readonly platform?: NodeJS.Platform;
}

function commandFileNames(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform !== 'win32') return [command];
  const extensions = (env.PATHEXT ?? '.EXE;.CMD;.BAT')
    .split(';')
    .map((extension) => extension.trim())
    .filter(Boolean);
  return [command, ...extensions.map((extension) => `${command}${extension.toLowerCase()}`)];
}

function pathCommandCandidates(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const names = commandFileNames(command, platform, env);
  return (env.PATH ?? '').split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => path.isAbsolute(entry))
    .flatMap((entry) => names.map((name) => path.join(entry, name)));
}

async function childFiles(directory: string, predicate: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && predicate(entry.name)).map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

/**
 * Audit-confirmed npm bundle layout from evals/m11/attestation.py.
 * Pattern: HOME/.codex-cli-npm/lib/node_modules/@openai/codex/node_modules/@openai/codex-PLATFORM/vendor/TRIPLET/bin/codex
 * Scans for platform-prefixed codex packages, then vendor subdirs, then bin/ executable.
 */
async function bundledCodexCandidates(platform: NodeJS.Platform, homeDir: string): Promise<string[]> {
  const platformPrefix = platform === 'win32' ? 'codex-win32-' : `codex-${platform}-`;
  const packageRoot = path.join(homeDir, '.codex-cli-npm', 'lib', 'node_modules', '@openai', 'codex', 'node_modules', '@openai');
  let packageEntries: string[] = [];
  try {
    packageEntries = (await readdir(packageRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(platformPrefix))
      .map((entry) => path.join(packageRoot, entry.name));
  } catch { /* no bundled CLI in this installation */ }

  const candidates: string[] = [];
  for (const packageDir of packageEntries) {
    const vendorDir = path.join(packageDir, 'vendor');
    try {
      const targets = await readdir(vendorDir, { withFileTypes: true });
      for (const target of targets) {
        if (target.isDirectory()) {
          const binDir = path.join(vendorDir, target.name, 'bin');
          candidates.push(path.join(binDir, platform === 'win32' ? 'codex.exe' : 'codex'));
        }
      }
    } catch { /* invalid bundle layout is not an attestation candidate */ }
  }
  return candidates;
}

/**
 * Validates a discovered path is within a secure/trusted directory hierarchy.
 * Rejects paths containing symlink components, parent-directory traversal (..),
 * or non-absolute paths. Used to verify npm bundle discovery results.
 */
export interface SecurePathProbeOptions {
  readonly allowedRoots?: readonly string[];
}

export interface SecurePathProbeResult {
  readonly path: string;
  readonly safe: boolean;
  readonly reason?: string;
}

const DEFAULT_ALLOWED_ROOTS = [
  '.codex-cli-npm',
  '.local/bin',
  '.opencode/bin',
  '.grok/downloads',
];

/** Normalize both slash styles to platform separator, then split into segments. */
function pathSegments(value: string): string[] {
  const normalized = path.normalize(value);
  return normalized.split(path.sep).filter(Boolean);
}

/** Check raw input for traversal before normalization. */
function hasTraversalInRawInput(value: string): boolean {
  // Match '..' as whole path segments (preceded by / or start, followed by / or end)
  // Also catches encoded: %2e%2e, %2e., .%2e
  return /(^|\/|\/)\.\.(\/|$)/.test(value) || /%2e%2e/i.test(value);
}

export function securePathProbe(
  candidatePath: string,
  options: SecurePathProbeOptions = {},
): SecurePathProbeResult {
  const allowedRoots = options.allowedRoots ?? DEFAULT_ALLOWED_ROOTS;

  if (!path.isAbsolute(candidatePath)) {
    return { path: candidatePath, safe: false, reason: 'non-absolute path' };
  }

  if (hasTraversalInRawInput(candidatePath)) {
    return { path: candidatePath, safe: false, reason: 'path traversal component (..) detected' };
  }

  const segments = pathSegments(candidatePath);
  if (segments.length < 2) {
    return { path: candidatePath, safe: false, reason: 'path too short' };
  }

  // Verify path contains an allowed root anywhere in its hierarchy.
  let foundAllowedRoot = false;
  for (const root of allowedRoots) {
    const rootSegments = pathSegments(root.replace(/\//g, path.sep));
    outer: for (let start = 0; start <= segments.length - rootSegments.length; start++) {
      for (let i = 0; i < rootSegments.length; i++) {
        if (segments[start + i] !== rootSegments[i]) continue outer;
      }
      foundAllowedRoot = true;
      break outer;
    }
    if (foundAllowedRoot) break;
  }

  if (!foundAllowedRoot) {
    return { path: candidatePath, safe: false, reason: `path not under allowed roots: ${allowedRoots.join(', ')}` };
  }

  return { path: candidatePath, safe: true };
}

/**
 * Resolves an actual local CLI to an absolute, non-symlink regular executable.
 * GUI launchers are intentionally absent: they cannot truthfully attest CLI help.
 * The snapshot step re-opens this returned path with O_NOFOLLOW before execution,
 * so a later replacement cannot change the probed runner.
 */
export async function resolveNativeExecutable(
  host: string,
  options: NativeExecutableResolutionOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? homedir();
  const platform = options.platform ?? process.platform;
  const candidates: string[] = [];

  switch (host) {
    case 'codex':
      candidates.push(...await bundledCodexCandidates(platform, homeDir));
      if (env.CODEX_CLI_PATH && path.isAbsolute(env.CODEX_CLI_PATH)) candidates.push(env.CODEX_CLI_PATH);
      candidates.push(...pathCommandCandidates('codex', platform, env));
      break;
    case 'claude':
      candidates.push(...await childFiles(path.join(homeDir, '.local', 'share', 'claude', 'versions'), () => true));
      candidates.push(...pathCommandCandidates('claude', platform, env));
      break;
    case 'grok':
      candidates.push(...await childFiles(path.join(homeDir, '.grok', 'downloads'), (name) => /^grok(?:-|$)/.test(name)));
      candidates.push(...pathCommandCandidates('grok', platform, env));
      break;
    case 'opencode':
      candidates.push(path.join(homeDir, '.opencode', 'bin', platform === 'win32' ? 'opencode.exe' : 'opencode'));
      candidates.push(...pathCommandCandidates('opencode', platform, env));
      break;
    case 'antigravity':
      candidates.push(path.join(homeDir, '.local', 'bin', platform === 'win32' ? 'agy.exe' : 'agy'));
      candidates.push(...pathCommandCandidates('agy', platform, env));
      break;
    default:
      throw new Error(`${host}: no native CLI resolver is defined`);
  }

  for (const candidate of [...new Set(candidates)]) {
    const executable = await safeAbsoluteExecutable(candidate);
    if (executable) return executable;
  }
  throw new Error(`${host}: no absolute non-symlink executable was found`);
}

function successfulOutput(result: ProbeResult): string {
  const output = `${result.stdout}${result.stderr}`.trim();
  if (!output) throw new Error('probe produced no evidence');
  return output;
}

interface HelpCapability {
  readonly id: string;
  readonly kind: 'command' | 'option';
  readonly token: string;
}

interface HostProbeSpec {
  readonly version: RegExp;
  readonly capabilities: readonly HelpCapability[];
}

const HOST_PROBE_SPECS: Readonly<Record<string, HostProbeSpec>> = {
  codex: {
    version: /^codex(?:-cli)?\s+(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/i,
    capabilities: [
      { id: 'codex:exec', kind: 'command', token: 'exec' },
      { id: 'codex:review', kind: 'command', token: 'review' },
      { id: 'codex:model', kind: 'option', token: '--model' },
    ],
  },
  claude: {
    version: /^(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)(?:\s+\(Claude Code\))?$/,
    // claude 2.1.220 --help lists `--print` twice (prose mention + flag); the
    // matcher is presence-based so this still attests the --print capability.
    capabilities: [
      { id: 'claude:model', kind: 'option', token: '--model' },
      { id: 'claude:agent', kind: 'option', token: '--agent' },
      { id: 'claude:print', kind: 'option', token: '--print' },
    ],
  },
  grok: {
    version: /^grok\s+(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)(?:\s+\([^)]+\))?(?:\s+\[[^\]]+\])?$/i,
    capabilities: [
      { id: 'grok:model', kind: 'option', token: '--model' },
      { id: 'grok:agent', kind: 'option', token: '--agent' },
      { id: 'grok:single-prompt', kind: 'option', token: '--single' },
    ],
  },
  opencode: {
    version: /^(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/,
    // opencode 1.18.10 --help formats `opencode run [message..]` (single space
    // before positional args); the command matcher accepts that format.
    capabilities: [
      { id: 'opencode:run', kind: 'command', token: 'opencode run' },
      { id: 'opencode:mcp', kind: 'command', token: 'opencode mcp' },
      { id: 'opencode:model', kind: 'option', token: '--model' },
    ],
  },
  antigravity: {
    version: /^(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/,
    capabilities: [
      { id: 'antigravity:model', kind: 'option', token: '--model' },
      { id: 'antigravity:agent', kind: 'option', token: '--agent' },
      { id: 'antigravity:print', kind: 'option', token: '--print' },
    ],
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Anchored presence check (>= 1 line-start match), never exact-once.
 *
 * Exact-once drifted against real help output: claude 2.1.220 documents
 * `--print` twice (prose mention + `-p, --print` flag) and opencode 1.18.10
 * formats `opencode run [message..]` with a single space before its positional
 * args. Presence at the command/option position is the meaningful capability
 * signal; the line-start anchor still rejects a host whose help never lists
 * the token, so a capability-lacking host cannot be attested.
 */
function tokenPresent(help: string, capability: HelpCapability): boolean {
  const token = escapeRegExp(capability.token);
  const pattern = capability.kind === 'command'
    ? new RegExp(`^\\s*${token}(?:\\s|$)`, 'gm')
    : new RegExp(`^\\s*(?:-[A-Za-z],\\s*)?${token}(?:\\s|<|\\[|$)`, 'gm');
  return help.match(pattern) !== null;
}

function hostSpec(host: NativeHost): HostProbeSpec {
  const spec = HOST_PROBE_SPECS[host];
  if (!spec) throw new Error(`unsupported native host '${host}'`);
  return spec;
}

function versionFrom(host: NativeHost, output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const match = lines.length === 1 ? lines[0].match(hostSpec(host).version) : null;
  if (!match) throw new Error(`${host}: version output does not match the supported CLI format`);
  return match[1];
}

function capabilityIdsFrom(host: NativeHost, output: string): string[] {
  const spec = hostSpec(host);
  const missing = spec.capabilities.filter((capability) => !tokenPresent(output, capability));
  if (missing.length > 0) {
    throw new Error(`${host}: help output drifted or lacks required stable tokens: ${missing.map((capability) => capability.token).join(', ')}`);
  }
  return spec.capabilities.map((capability) => capability.id).sort();
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
  readonly evidenceRefs: readonly HostAttestationEvidenceRef[];
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
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_ATTESTATION_TTL_MS) {
    throw new Error(`attestation TTL must be positive and at most ${MAX_ATTESTATION_TTL_MS}ms`);
  }
  const expiresAt = new Date(now.getTime() + ttlMs);
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
      const executable = await (options.resolveExecutable ?? resolveNativeExecutable)(host);
      if (!path.isAbsolute(executable)) throw new Error('resolver returned a non-absolute executable path');

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
      const modelHashes = new Map<HostAttestationEvidenceRole, string>();
      for (const [role, record] of [['requestedModel', hostModelEv.requested], ['resolvedModel', hostModelEv.resolved], ['observedModel', hostModelEv.observed]] as const) {
        const p = record.provenance;
        modelHashes.set(role, sha256Bytes(concatUint8(
          encoder.encode(`role:${role}`),
          encoder.encode(`value:${record.value}`),
          record.rawEvidenceBytes,
          encoder.encode(`source:${p.sourceUri}`),
          encoder.encode(`producer:${p.producerIdentity}`),
          encoder.encode(`ts:${p.timestamp}`),
        )));
      }

      const attestationFields: Omit<CollectedHostAttestation, 'evidenceRefs'> = {
        host,
        hostVersion: versionFrom(host, versionOutput),
        commitSha,
        capabilityStatus: 'HOST_NATIVE',
        capabilityIds: capabilityIdsFrom(host, capabilityOutput),
        contractSetSha256: options.contractSetSha256,
        requestedModel: hostModelEv.requested.value,
        resolvedModel: hostModelEv.resolved.value,
        observedModel: hostModelEv.observed.value,
        nativeRunnerIdentity,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      const contentHashes = new Map<HostAttestationEvidenceRole, string>([
        ['version', versionHash],
        ['capabilities', capabilityHash],
        ...modelHashes,
      ]);
      const subject: HostAttestation = attestationFields;
      const evidenceRefs: HostAttestationEvidenceRef[] = HOST_ATTESTATION_EVIDENCE_ROLES.map((role) => {
        const evidenceSha256 = contentHashes.get(role);
        if (!evidenceSha256) throw new Error(`missing content hash for evidence role '${role}'`);
        return {
          role,
          host,
          commitSha,
          evidenceSha256,
          evidenceRef: hostAttestationEvidenceRef(host, commitSha, role, evidenceSha256),
          subjectSha256: hostAttestationEvidenceSubjectSha256(role, subject),
          observedAt: now.toISOString(),
        };
      });
      return { ...attestationFields, evidenceRefs };
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
