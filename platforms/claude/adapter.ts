import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * C8 — Claude Code first-class platform adapter (Tier-A host, AM-0019 §10).
 *
 * Base contract is the same shape as the codex/grok/antigravity/cursor
 * siblings. Claude Code is Tier A, so this adapter additionally implements
 * the full AM-0019 lifecycle: build/install/doctor/update/rollback, native
 * dispatch of the real `claude` binary (never a cross-host nested CLI, never a
 * synthetic `claude -p` claim), worktree isolation that fails closed, honest
 * requested/resolved/observed model recording, Stop/checkpoint/resume, and
 * receipt/attestation binding to an exact HEAD.
 *
 * Model truth rule (AM-0019 §3): only values the host actually exposes are
 * recorded. Anything else is HOST_UNOBSERVABLE. Nothing is fabricated.
 */

/** Sentinel for model slots the Claude Code host does not expose. */
export const HOST_UNOBSERVABLE = 'HOST_UNOBSERVABLE';

const BINARY = 'claude';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ponytail: G-01 env scoping. Safe keys passed to native children by default. */
const SAFE_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'TMPDIR', 'TEMP', 'TMP',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_API_KEY', 'CLAUDE_API_KEY_FILE',
  'CLAUDE_MCP_SERVERS', 'CLAUDE_HTTP_PROXY', 'CLAUDE_NO_COLOR',
  // platform-specific
  'LOCALAPPDATA', 'USERPROFILE', 'USERNAME', 'COMSPEC', 'PATHEXT',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
]);

function safeEnv(overrides?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) base[key] = process.env[key];
  }
  if (!overrides) return base;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

/** Sibling PlatformAdapter contract — identical surface to codex/grok/cursor/antigravity. */
export interface PlatformAdapter {
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;
  render(context: unknown): Promise<string>;
  stage(context: unknown): Promise<string>;
  activate(): Promise<{ ok: boolean }>;
  probe(): Promise<{ ok: boolean; detail: string }>;
  update(): Promise<{ ok: boolean }>;
  uninstall(): Promise<{ ok: boolean }>;
  rollback(version: string): Promise<{ ok: boolean }>;
}

export interface ClaudeModelEvidence {
  readonly requested: string;
  readonly resolved: string;
  readonly observed: string;
}

export interface ClaudeNativeReceipt {
  readonly ok: boolean;
  readonly host: 'claude';
  readonly hostVersion: string;
  readonly commitSha: string | null;
  readonly sessionId: string;
  readonly model: ClaudeModelEvidence;
  readonly worktree: { readonly isolated: boolean; readonly name?: string };
  readonly result: string;
  readonly observedAt: string;
}

export interface ClaudeNativeDispatchParams {
  readonly prompt: string;
  readonly model?: string;
  /** Working directory for the native child. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Isolation root (repo/worktree). Escaping it fails closed. */
  readonly allowedRoot?: string;
  /** git worktree name passed as `claude --worktree <name>`. */
  readonly worktree?: string;
  readonly sessionId?: string;
  readonly timeoutMs?: number;
}

export interface ClaudeResumeParams {
  readonly sessionId: string;
  readonly prompt: string;
  readonly model?: string;
  readonly cwd?: string;
  readonly allowedRoot?: string;
  readonly timeoutMs?: number;
}

export interface NativeAttestationRecord {
  readonly host: 'claude';
  readonly hostVersion: string;
  readonly commitSha: string;
  readonly capabilityStatus: 'OBSERVED' | 'WAITING_EXTERNAL';
  readonly capabilityIds: readonly string[];
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly observedModel: string;
  readonly evidenceRef?: string;
  readonly contractSetSha256?: string;
  readonly nativeRunnerIdentity: string;
  readonly issuedAt: string;
}

export interface ClaudeAdapter extends PlatformAdapter {
  version(): Promise<string>;
  build(): Promise<{ ok: boolean; detail: string }>;
  install(): Promise<{ ok: boolean; detail: string }>;
  doctor(): Promise<{ ok: boolean; detail: string }>;
  nativeDispatch(params: ClaudeNativeDispatchParams): Promise<ClaudeNativeReceipt>;
  resume(params: ClaudeResumeParams): Promise<ClaudeNativeReceipt>;
  stop(sessionId: string): Promise<{ ok: boolean; detail: string }>;
  checkpoints(params?: { cwd?: string; sessionId?: string }): Promise<Array<{ sessionId: string; path: string; checkpointAt: string }>>;
  nativeAttestation(params: {
    headSha: string;
    cwd?: string;
    receipt?: ClaudeNativeReceipt;
    evidenceRef?: string;
    contractSetSha256?: string;
  }): Promise<NativeAttestationRecord>;
}

function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function rulesDir(): string {
  return path.join(claudeHome(), 'rules');
}

async function resolveClaudeBinary(): Promise<{ path: string; version?: string } | null> {
  // Search PATH directly — avoids dependency on `which` which may be absent or
  // produce unexpected results on Windows in certain environments.
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, BINARY);
    try {
      // On Windows, prefer .cmd extension for batch files; POSIX uses the bare name.
      const resolved = process.platform === 'win32'
        ? (fs.existsSync(`${candidate}.cmd`) ? `${candidate}.cmd` : candidate)
        : candidate;
      // Check file exists (X_OK is always granted on Windows, so we only check existence).
      if (!fs.existsSync(resolved)) continue;
      let version: string | undefined;
      try {
        // On Windows, execFileAsync with a .cmd file throws EINVAL because .cmd
        // files need to be executed through cmd.exe /c. Use shell:true workaround.
        const { stdout: versionOut } = await execFileAsync(resolved, ['--version'], {
          timeout: 5000,
          shell: process.platform === 'win32',
        });
        const firstLine = versionOut.trim().split('\n')[0];
        version = firstLine || undefined;
      } catch {
        // version flag unsupported — keep the binary path only
      }
      return { path: resolved, version };
    } catch {
      // not found in this directory
    }
  }
  return null;
}

async function gitHeadSha(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Fail-closed worktree/path isolation guard. Symlinks and absolute jumps cannot escape root. */
export function assertPathInsideRoot(candidate: string, root: string): string {
  const resolved = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  const real: string = (() => {
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  })();
  const realRoot: string = (() => {
    try {
      return fs.realpathSync(resolvedRoot);
    } catch {
      return resolvedRoot;
    }
  })();
  const rel = path.relative(realRoot, real);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`worktree isolation rejection: ${resolved} escapes root ${resolvedRoot}`);
  }
  return resolved;
}

function assertSafeWorktreeName(name: string): void {
  if (name.length === 0 || name.startsWith('-') || /[/\\]/.test(name) || name === '..') {
    throw new Error(`worktree isolation rejection: unsafe worktree name "${name}"`);
  }
}

function assertSafeSessionId(sessionId: string): void {
  if (!UUID_RE.test(sessionId)) {
    throw new Error(`invalid session id: "${sessionId}"`);
  }
}

/** Real `claude --version` value, resolved once per call. */
async function resolveVersion(): Promise<string> {
  const found = await resolveClaudeBinary();
  return found?.version ?? '';
}

/** Parse requested/resolved/observed model evidence from a real stream-json run. */
export function parseModelEvidence(stdout: string, requestedModel?: string): ClaudeModelEvidence {
  const requested = requestedModel ?? HOST_UNOBSERVABLE;
  let resolved = HOST_UNOBSERVABLE;
  let observed = HOST_UNOBSERVABLE;
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.model === 'string' && ev.model) {
      resolved = ev.model;
    } else if (ev.type === 'assistant' && typeof ev.message === 'object' && ev.message !== null) {
      const model = (ev.message as Record<string, unknown>).model;
      // Claude Code emits "<synthetic>" for unserved/failed messages — never record that as observed.
      if (typeof model === 'string' && model && model !== '<synthetic>') observed = model;
    }
  }
  return { requested, resolved, observed };
}

function parseResult(stdout: string): { ok: boolean; result: string } {
  let result = '';
  let isError: boolean | undefined;
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (ev.type === 'result') {
      if (typeof ev.result === 'string') result = ev.result;
      if (typeof ev.is_error === 'boolean') isError = ev.is_error;
    }
  }
  return { ok: isError === true ? false : true, result };
}

function runNative(
  binaryPath: string,
  args: readonly string[],
  opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string | undefined> },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // On Windows, spawn .cmd files through cmd.exe /c with a single command string
  // to ensure all arguments are passed correctly to the batch.
  const child = process.platform === 'win32'
    ? spawn(`"${binaryPath}" ${[...args].map(a => `"${a}"`).join(' ')}`, [], {
        cwd: opts.cwd,
        env: safeEnv(opts.env),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      })
    : spawn(binaryPath, [...args], {
        cwd: opts.cwd,
        env: safeEnv(opts.env),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, opts.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

/** Active native children keyed by sessionId, for Stop. */
const activeChildren = new Map<string, ChildProcess>();

export const claudeAdapter: ClaudeAdapter = {
  async detect() {
    // Try to locate the binary first — the binary path is the authoritative
    // indicator of a real installation. Home directory existence alone is
    // insufficient (desktop-mode config dir may exist without binary).
    const found = await resolveClaudeBinary();
    if (found) return { installed: true, version: found.version, path: found.path };
    const homeExists = fs.existsSync(claudeHome());
    if (homeExists) return { installed: true, version: 'desktop', path: claudeHome() };
    return { installed: false };
  },

  async version() {
    return resolveVersion();
  },

  async build() {
    // Tier-A lifecycle: assemble the managed runtime bundle (rules dir + overlay hook target).
    try {
      fs.mkdirSync(rulesDir(), { recursive: true });
      const overlaySrc = path.join(
        new URL('.', import.meta.url).pathname,
        'claude-overlay.md',
      );
      if (fs.existsSync(overlaySrc)) {
        fs.copyFileSync(overlaySrc, path.join(rulesDir(), 'claude-overlay.md'));
      }
      return { ok: true, detail: `managed runtime ready at ${claudeHome()}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async render(context: unknown) {
    fs.mkdirSync(rulesDir(), { recursive: true });
    const ruleFile = path.join(rulesDir(), 'agent-rules-context.md');
    const content = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    fs.writeFileSync(ruleFile, content, 'utf-8');
    return ruleFile;
  },

  async stage(context: unknown) {
    const stagingDir = path.join(claudeHome(), 'staging');
    fs.mkdirSync(stagingDir, { recursive: true });
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const capsuleFile = path.join(claudeHome(), 'staging', 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const dest = path.join(claudeHome(), 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    try {
      // Use shell:true on Windows for .cmd files (execFileAsync with .cmd throws EINVAL).
      const { stdout } = await execFileAsync(BINARY, ['--version'], {
        timeout: 5000,
        shell: process.platform === 'win32',
      });
      return { ok: true, detail: `claude ${stdout.trim()}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `claude unreachable: ${message}` };
    }
  },

  async install() {
    try {
      const { stdout, stderr } = await execFileAsync(BINARY, ['install'], {
        timeout: 120_000,
        shell: process.platform === 'win32',
      });
      const detail = (stdout + stderr).trim() || 'claude install completed';
      return { ok: true, detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `claude install failed: ${message}` };
    }
  },

  async update() {
    try {
      const { stdout, stderr } = await execFileAsync(BINARY, ['update'], {
        timeout: 120_000,
        shell: process.platform === 'win32',
      });
      const detail = (stdout + stderr).trim() || 'claude update completed';
      return { ok: true, detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `claude update failed: ${message}` };
    }
  },

  async rollback(version: string) {
    if (!/^[\w.\-]+$/.test(version)) return { ok: false, detail: `unsafe version token: "${version}"` };
    try {
      const { stdout, stderr } = await execFileAsync(BINARY, ['install', version], {
        timeout: 120_000,
        shell: process.platform === 'win32',
      });
      const detail = (stdout + stderr).trim() || `claude rolled back to ${version}`;
      return { ok: true, detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `claude rollback to ${version} failed: ${message}` };
    }
  },

  async uninstall() {
    // Claude Code native build ships no uninstall command; binary removal is an OS-level action.
    return {
      ok: false,
      detail: 'claude provides no native uninstall command; remove the binary at OS level',
    };
  },

  async doctor() {
    try {
      const { stdout, stderr } = await execFileAsync(BINARY, ['doctor'], {
        timeout: 60_000,
        shell: process.platform === 'win32',
      });
      const detail = (stdout + stderr).trim();
      // Honest claim: healthy only when the host explicitly reports no installation issues.
      const healthy = /No installation issues found\./.test(detail);
      return { ok: healthy, detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `claude doctor failed: ${message}` };
    }
  },

  async nativeDispatch(params: ClaudeNativeDispatchParams) {
    const found = await resolveClaudeBinary();
    const hostVersion = found?.version ?? '';
    const sessionId = params.sessionId ?? randomUUID();
    if (params.sessionId) assertSafeSessionId(params.sessionId);
    const cwd = params.cwd ?? process.cwd();
    // G-03: fail-closed path guard, defaults to cwd (repo root) when not provided
    assertPathInsideRoot(cwd, params.allowedRoot ?? cwd);
    let worktreeName: string | undefined;
    if (params.worktree) {
      assertSafeWorktreeName(params.worktree);
      worktreeName = params.worktree;
    }

    if (!found) {
      return {
        ok: false,
        host: 'claude',
        hostVersion: '',
        commitSha: await gitHeadSha(cwd),
        sessionId,
        model: { requested: params.model ?? HOST_UNOBSERVABLE, resolved: HOST_UNOBSERVABLE, observed: HOST_UNOBSERVABLE },
        worktree: { isolated: worktreeName !== undefined, name: worktreeName },
        result: 'claude binary not found on PATH',
        observedAt: new Date().toISOString(),
      };
    }

    const args: string[] = ['-p', '--output-format', 'stream-json', '--verbose', '--session-id', sessionId];
    if (params.model) args.push('--model', params.model);
    if (worktreeName) args.push('--worktree', worktreeName);
    args.push(params.prompt);

    // On Windows, spawn .cmd files through cmd.exe /c with a single command string
    // to ensure all arguments (including the prompt) are passed correctly to the batch.
    // Arguments are double-quoted to handle special characters and paths with spaces.
    const child = process.platform === 'win32'
      ? spawn(`"${found.path}" ${args.map(a => `"${a}"`).join(' ')}`, [], {
          cwd,
          env: safeEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
        })
      : spawn(found.path, args, {
          cwd,
          env: safeEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });
    activeChildren.set(sessionId, child);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), params.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk;
    });
    try {
      const exitCode: number = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code ?? -1));
      });
      const evidence = parseModelEvidence(stdout, params.model);
      const resultInfo = parseResult(stdout);
      const commitSha = await gitHeadSha(cwd);
      const result =
        exitCode === 0 && resultInfo.ok
          ? resultInfo.result || stdout.trim() || 'completed'
          : resultInfo.result || stderr.trim() || `claude exited ${exitCode}`;
      return {
        ok: exitCode === 0 && resultInfo.ok,
        host: 'claude',
        hostVersion,
        commitSha,
        sessionId,
        model: evidence,
        worktree: { isolated: worktreeName !== undefined, name: worktreeName },
        result,
        observedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer);
      activeChildren.delete(sessionId);
    }
  },

  async resume(params: ClaudeResumeParams) {
    const found = await resolveClaudeBinary();
    const hostVersion = found?.version ?? '';
    assertSafeSessionId(params.sessionId);
    const cwd = params.cwd ?? process.cwd();
    // G-03: fail-closed path guard, defaults to cwd (repo root) when not provided
    assertPathInsideRoot(cwd, params.allowedRoot ?? cwd);

    if (!found) {
      return {
        ok: false,
        host: 'claude',
        hostVersion: '',
        commitSha: await gitHeadSha(cwd),
        sessionId: params.sessionId,
        model: { requested: params.model ?? HOST_UNOBSERVABLE, resolved: HOST_UNOBSERVABLE, observed: HOST_UNOBSERVABLE },
        worktree: { isolated: false },
        result: 'claude binary not found on PATH',
        observedAt: new Date().toISOString(),
      };
    }

    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--resume', params.sessionId];
    if (params.model) args.push('--model', params.model);
    args.push(params.prompt);

    let stdout = '';
    let stderr = '';
    try {
      const result = await runNative(found.path, args, { cwd, timeoutMs: params.timeoutMs ?? 120_000 });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err) {
      // G-04: explicit failure on spawn/ENOENT, not unhandled rejection
      return {
        ok: false,
        host: 'claude',
        hostVersion,
        commitSha: await gitHeadSha(cwd),
        sessionId: params.sessionId,
        model: { requested: params.model ?? HOST_UNOBSERVABLE, resolved: HOST_UNOBSERVABLE, observed: HOST_UNOBSERVABLE },
        worktree: { isolated: false },
        result: `claude spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        observedAt: new Date().toISOString(),
      };
    }

    const evidence = parseModelEvidence(stdout, params.model);
    const resultInfo = parseResult(stdout);
    return {
      ok: resultInfo.ok,
      host: 'claude',
      hostVersion,
      commitSha: await gitHeadSha(cwd),
      sessionId: params.sessionId,
      model: evidence,
      worktree: { isolated: false },
      result: resultInfo.result || stdout.trim() || 'resumed',
      observedAt: new Date().toISOString(),
    };
  },

  async stop(sessionId: string) {
    const child = activeChildren.get(sessionId);
    if (!child) return { ok: false, detail: `no active claude child for session ${sessionId}` };
    child.kill('SIGTERM');
    const killed = await new Promise<boolean>((resolve) => {
      const deadline = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(true);
      }, 2000);
      child.once('exit', () => {
        clearTimeout(deadline);
        resolve(true);
      });
      child.once('error', () => {
        clearTimeout(deadline);
        resolve(true);
      });
    });
    activeChildren.delete(sessionId);
    return killed ? { ok: true, detail: `claude child ${sessionId} stopped` } : { ok: false, detail: `failed to stop ${sessionId}` };
  },

  async checkpoints(params?: { cwd?: string; sessionId?: string }) {
    const projectsDir = path.join(claudeHome(), 'projects');
    if (!fs.existsSync(projectsDir)) return [];
    const results: Array<{ sessionId: string; path: string; checkpointAt: string }> = [];
    for (const slug of fs.readdirSync(projectsDir)) {
      const slugDir = path.join(projectsDir, slug);
      if (!fs.statSync(slugDir).isDirectory()) continue;
      for (const file of fs.readdirSync(slugDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const sessionId = file.slice(0, -'.jsonl'.length);
        if (params?.sessionId && sessionId !== params.sessionId) continue;
        const full = path.join(slugDir, file);
        const stat = fs.statSync(full);
        results.push({ sessionId, path: full, checkpointAt: stat.mtime.toISOString() });
      }
    }
    results.sort((a, b) => b.checkpointAt.localeCompare(a.checkpointAt));
    return results;
  },

  async nativeAttestation(params) {
    const cwd = params.cwd ?? process.cwd();
    const actualHead = await gitHeadSha(cwd);
    // Fail closed: an attestation may only bind the exact HEAD it claims.
    if (!actualHead) throw new Error(`no git HEAD at ${cwd}; cannot bind attestation`);
    if (actualHead !== params.headSha) {
      throw new Error(`attestation HEAD mismatch: expected ${params.headSha}, observed ${actualHead}`);
    }
    const found = await resolveClaudeBinary();
    const receipt = params.receipt;
    const requestedModel = receipt?.model.requested ?? HOST_UNOBSERVABLE;
    const resolvedModel = receipt?.model.resolved ?? HOST_UNOBSERVABLE;
    const observedModel = receipt?.model.observed ?? HOST_UNOBSERVABLE;
    const capabilityStatus = receipt?.ok === true ? 'OBSERVED' : 'WAITING_EXTERNAL';
    return {
      host: 'claude',
      hostVersion: found?.version ?? receipt?.hostVersion ?? '',
      commitSha: actualHead,
      capabilityStatus,
      capabilityIds: [
        'detect', 'version', 'build', 'install', 'update', 'rollback', 'uninstall', 'doctor',
        'native_dispatch', 'worktree_isolation', 'model_evidence', 'stop', 'checkpoint', 'resume',
        'receipt', 'attestation',
      ],
      requestedModel,
      resolvedModel,
      observedModel,
      evidenceRef: params.evidenceRef,
      contractSetSha256: params.contractSetSha256,
      nativeRunnerIdentity: found?.path ?? 'unknown',
      issuedAt: new Date().toISOString(),
    };
  },
};
