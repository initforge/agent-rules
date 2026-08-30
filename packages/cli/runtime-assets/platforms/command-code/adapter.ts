import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runNativeCmdc(
  binaryPath: string,
  args: readonly string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const isCmdOrBat = process.platform === 'win32' && (binaryPath.endsWith('.cmd') || binaryPath.endsWith('.bat'));
  const isPowerShell = process.platform === 'win32' && binaryPath.endsWith('.ps1');
  const actualCmd = isCmdOrBat ? (process.env.ComSpec || 'cmd.exe') : isPowerShell ? (process.env.POWERSHELL_EXE || 'powershell.exe') : binaryPath;
  const actualArgs = isCmdOrBat
    ? ['/d', '/s', '/c', binaryPath, ...args]
    : isPowerShell
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', binaryPath, ...args]
      : [...args];
  const child = spawn(actualCmd, actualArgs, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch {}
        resolve({ exitCode: -1, stdout, stderr: 'timeout' });
      }
    }, opts.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: code ?? -1, stdout, stderr });
      }
    });
  });
}

/**
 * P3 — Command Code native platform adapter.
 *
 * Command Code (v1.28.4+) is a taste-learning coding agent with native
 * permission rules/modes, session-scoped mods, progressive Skills, built-in
 * isolated agents, hooks and structured headless events.
 *
 * Hard boundary (plan P3): NATIVE PERMISSIONS are the primary hard boundary.
 * Mods (`--mod`) and `PreToolUse`/`beforeToolCall` hooks are supplementary
 * interception. Because mod/hook errors can be skipped/fail-open, a capability
 * fingerprint must prove the native permission layer; mod/hook failure yields
 * terminal BLOCKED. `--yolo` is never used for certification. Taste is never
 * deleted/disabled/overwritten.
 */

// `cmdc` is the native executable. `command-code` is retained only as a
// compatibility fallback because some npm shims named that way can start an
// interactive wrapper and hang a non-interactive version probe.
const COMMAND_CODE_ALIASES = ['cmdc', 'command-code'];
const DEFAULT_SUPERVISED_TIMEOUT_MS = 10_000;

export interface CommandCodeCapabilityFacts {
  binary: string;
  binary_path: string;
  version?: string;
  permission_layer_proven: boolean;
  mods_loaded: string[];
  skills_loaded: string[];
  headless_json_events: boolean;
  native_worktree: boolean;
  plan_mode: boolean;
  mcp_config_path: string;
  mcp_config_present: boolean;
  mcp_config_valid: boolean;
  mcp_server_names: string[];
  fingerprint: string;
}

export interface CommandCodeSupervisedReceipt {
  ok: boolean;
  host: 'command-code';
  hostVersion: string;
  binary: string;
  permission_layer_proven: boolean;
  sessionId: string;
  result: string;
  observedAt: string;
}

export interface CommandCodeAdapter {
  detect(): Promise<{ installed: boolean; version?: string; path?: string; binary: string }>;
  inspectCapabilities(): Promise<CommandCodeCapabilityFacts>;
  runSupervised(params: {
    prompt: string;
    cwd?: string;
    mods?: string[];
    skills?: string[];
    permissionMode?: 'default' | 'plan' | 'auto-accept' | 'dont-ask';
    timeoutMs?: number;
    expectedPermissionFingerprint?: string;
  }): Promise<CommandCodeSupervisedReceipt>;
}

let cachedBinary: { path: string; binary: string; version?: string } | null | undefined;

async function resolveCommandCodeBinary(): Promise<{ path: string; binary: string; version?: string } | null> {
  if (cachedBinary !== undefined) return cachedBinary;
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const seen = new Set<string>();
  for (const dir of pathDirs) {
    for (const alias of COMMAND_CODE_ALIASES) {
      const candidate = path.join(dir, alias);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const resolved = process.platform === 'win32'
        ? (fs.existsSync(`${candidate}.cmd`) ? `${candidate}.cmd` : fs.existsSync(`${candidate}.ps1`) ? `${candidate}.ps1` : candidate)
        : candidate;
      // Windows `cmd.exe` is never a valid Command Code binary.
      if (resolved === path.join(process.env.WINDIR ?? 'C:\\Windows', 'system32', 'cmd.exe')) continue;
      if (!fs.existsSync(resolved)) continue;
      try {
        const { stdout, exitCode } = await runNativeCmdc(resolved, ['--version'], { timeoutMs: 2000 });
        const version = exitCode === 0 ? stdout.trim().split('\n')[0] || undefined : undefined;
        cachedBinary = { path: resolved, binary: alias, ...(version ? { version } : {}) };
        return cachedBinary;
      } catch {
        cachedBinary = { path: resolved, binary: alias };
        return cachedBinary;
      }
    }
  }
  cachedBinary = null;
  return null;
}

export const commandCodeAdapter: CommandCodeAdapter = {
  async detect() {
    const found = await resolveCommandCodeBinary();
    if (found) return { installed: true, version: found.version, path: found.path, binary: found.binary };
    return { installed: false, binary: 'command-code' };
  },

  async inspectCapabilities() {
    const found = await resolveCommandCodeBinary();
    const binaryPath = found?.path ?? '';
    const version = found?.version;
    const modsLoaded: string[] = [];
    const skillsLoaded: string[] = [];
    let permissionLayerProven = false;
    let headlessJsonEvents = false;
    let nativeWorktree = false;
    let planMode = false;
    const commandCodeHome = process.env.COMMAND_CODE_HOME || path.join(os.homedir(), '.commandcode');
    const mcpConfigPath = path.join(commandCodeHome, 'mcp.json');
    let mcpConfigPresent = fs.existsSync(mcpConfigPath);
    let mcpConfigValid = false;
    let mcpServerNames: string[] = [];
    if (mcpConfigPresent) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8')) as { mcpServers?: Record<string, unknown> };
        if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
          mcpConfigValid = true;
          mcpServerNames = Object.keys(parsed.mcpServers).sort();
        }
      } catch {
        mcpConfigValid = false;
      }
    }
    if (found) {
      try {
        const { stdout, exitCode } = await runNativeCmdc(found.path, ['--help'], {
          timeoutMs: 10_000,
          env: { ...process.env, COMMAND_CODE_NO_AUTO_UPDATE: '1' },
        });
        if (exitCode === 0) {
          // Parse the CLI help surface: native permission modes, worktrees,
          // session-scoped mods, skills and structured headless JSON output.
          const lower = stdout.toLowerCase();
          permissionLayerProven = /--permission-mode|--auto-accept|--dont-ask|permission-mode/.test(lower);
          nativeWorktree = /--worktree|worktree/.test(lower);
          headlessJsonEvents = /--output-format|--print|headless/.test(lower);
          planMode = /--plan|plan mode/.test(lower);
          if (/--mod/.test(lower)) {
            const modMatch = stdout.match(/--mod\s+<[^>]+>/i);
            if (modMatch) modsLoaded.push('session-scoped --mod supported');
          }
          if (/--skill/.test(lower)) skillsLoaded.push('progressive --skill supported');
        }
      } catch {
        // help may not be available in a constrained env; detection is binary-only.
      }
    }
    const fingerprintSource = JSON.stringify({ binaryPath, version, modsLoaded, skillsLoaded, permissionLayerProven, headlessJsonEvents, nativeWorktree, planMode, mcpConfigPath, mcpConfigPresent, mcpConfigValid, mcpServerNames });
    return {
      binary: found?.binary ?? 'command-code',
      binary_path: binaryPath,
      ...(version ? { version } : {}),
      permission_layer_proven: permissionLayerProven,
      mods_loaded: modsLoaded,
      skills_loaded: skillsLoaded,
      headless_json_events: headlessJsonEvents,
      native_worktree: nativeWorktree,
      plan_mode: planMode,
      mcp_config_path: mcpConfigPath,
      mcp_config_present: mcpConfigPresent,
      mcp_config_valid: mcpConfigValid,
      mcp_server_names: mcpServerNames,
      fingerprint: createHash('sha256').update(fingerprintSource).digest('hex'),
    };
  },

  async runSupervised(params) {
    const found = await resolveCommandCodeBinary();
    const hostVersion = found?.version ?? '';
    const binary = found?.binary ?? 'command-code';
    const sessionId = randomUUID();
    if (!found) {
      return {
        ok: false,
        host: 'command-code',
        hostVersion: '',
        binary,
        permission_layer_proven: false,
        sessionId,
        result: 'command-code binary not found on PATH',
        observedAt: new Date().toISOString(),
      };
    }

    // The native permission layer must be proven before a supervised session.
    const facts = await commandCodeAdapter.inspectCapabilities();
    if (!facts.permission_layer_proven) {
      return {
        ok: false,
        host: 'command-code',
        hostVersion,
        binary,
        permission_layer_proven: false,
        sessionId,
        result: 'BLOCKED: cannot prove the native permission layer for this Command Code binary',
        observedAt: new Date().toISOString(),
      };
    }
    if (params.expectedPermissionFingerprint && facts.fingerprint !== params.expectedPermissionFingerprint) {
      return {
        ok: false,
        host: 'command-code',
        hostVersion,
        binary,
        permission_layer_proven: true,
        sessionId,
        result: `BLOCKED: permission capability fingerprint drift (expected ${params.expectedPermissionFingerprint.slice(0, 12)})`,
        observedAt: new Date().toISOString(),
      };
    }

    const args = ['--print', params.prompt];
    if (params.permissionMode && params.permissionMode !== 'default') args.push('--permission-mode', params.permissionMode);
    // Session-scoped mods/skills only; never a global enable. The managed
    // mod is attached automatically when native installation has materialized
    // it, while caller-provided mods remain additive.
    const managedMod = path.join(process.env.COMMAND_CODE_HOME || path.join(os.homedir(), '.commandcode'), 'mods', 'agent-rules.ts');
    const mods = [
      ...(fs.existsSync(managedMod) ? [managedMod] : []),
      ...(params.mods ?? []),
    ].filter((mod, index, all) => all.indexOf(mod) === index);
    for (const mod of mods) args.push('--mod', mod);
    for (const skill of params.skills ?? []) args.push('--skill', skill);
    if ((params.skills?.length ?? 0) > 0) args.push('--no-skills');
    args.push('--output-format', 'json');
    args.push('--skip-onboarding');
    // `--yolo` is never used here.

    try {
      const { stdout, stderr, exitCode } = await runNativeCmdc(found.path, args, {
        // A native smoke path must not wait indefinitely on an interactive
        // login, provider, or network response. Real callers can opt into a
        // longer bounded session explicitly.
        timeoutMs: params.timeoutMs ?? DEFAULT_SUPERVISED_TIMEOUT_MS,
        cwd: params.cwd,
        env: { ...process.env, COMMAND_CODE_NO_AUTO_UPDATE: '1' },
      });
      if (exitCode !== 0) {
        const timedOut = stderr === 'timeout';
        return {
          ok: false,
          host: 'command-code',
          hostVersion,
          binary,
          permission_layer_proven: true,
          sessionId,
          result: timedOut
            ? 'BLOCKED: Command Code supervised session timed out before an authenticated model result'
            : (stderr || stdout).trim() || `command-code exited with code ${exitCode}`,
          observedAt: new Date().toISOString(),
        };
      }
      const result = (stdout + stderr).trim() || 'completed';
      return {
        ok: true,
        host: 'command-code',
        hostVersion,
        binary,
        permission_layer_proven: true,
        sessionId,
        result,
        observedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        host: 'command-code',
        hostVersion,
        binary,
        permission_layer_proven: true,
        sessionId,
        result: `command-code supervised session failed: ${message}`,
        observedAt: new Date().toISOString(),
      };
    }
  },
};
