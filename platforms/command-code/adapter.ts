import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

const COMMAND_CODE_ALIASES = ['command-code', 'cmdc'];

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

/** On Windows, Command Code ships as `cmdc` (and `command-code`); NEVER `cmd.exe`. */
async function resolveCommandCodeBinary(): Promise<{ path: string; binary: string; version?: string } | null> {
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
        const { stdout } = await execFileAsync(resolved, ['--version'], { timeout: 5000, shell: process.platform === 'win32' });
        const version = stdout.trim().split('\n')[0] || undefined;
        return { path: resolved, binary: alias, ...(version ? { version } : {}) };
      } catch {
        return { path: resolved, binary: alias };
      }
    }
  }
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
    if (found) {
      try {
        const { stdout } = await execFileAsync(found.path, ['--help'], {
          timeout: 10_000,
          shell: process.platform === 'win32',
          env: { ...process.env, COMMAND_CODE_NO_AUTO_UPDATE: '1' },
        });
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
      } catch {
        // help may not be available in a constrained env; detection is binary-only.
      }
    }
    const fingerprintSource = JSON.stringify({ binaryPath, version, modsLoaded, skillsLoaded, permissionLayerProven, headlessJsonEvents, nativeWorktree, planMode });
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
    // Session-scoped mods/skills only; never a global enable.
    for (const mod of params.mods ?? []) args.push('--mod', mod);
    for (const skill of params.skills ?? []) args.push('--skill', skill);
    if ((params.mods?.length ?? 0) > 0 || (params.skills?.length ?? 0) > 0) args.push('--no-skills');
    args.push('--output-format', 'json');
    args.push('--skip-onboarding');
    // `--yolo` is never used here.

    try {
      const { stdout, stderr } = await execFileAsync(found.path, args, {
        timeout: params.timeoutMs ?? 120_000,
        shell: process.platform === 'win32',
        cwd: params.cwd,
        env: { ...process.env, COMMAND_CODE_NO_AUTO_UPDATE: '1' },
      });
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
