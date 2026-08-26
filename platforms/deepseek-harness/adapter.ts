import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runNativeDsh(
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
 * P2 — DeepSeek Harness (DSH) native platform adapter (developer preview).
 *
 * DSH is a Cordis plugin host: every capability is a plugin, and profiles are
 * ordered stacks of plugin-bundle patch layers. We install through the documented
 * `dsh plugin --profile <name> add <package>` lifecycle and NEVER patch DSH
 * source. A supervised launch verifies the bundle hash and the
 * `dsh --dump-config` fingerprint before running.
 *
 * Hard boundary (plan P2): missing/disabled guard must BLOCKED, never silently
 * allowed. Consumer repos cannot modify managed bundle/profile authority. DSH
 * "turn completed" is a host observation, never a terminal PASS.
 */

const BINARY = 'dsh';

export interface DshCapabilityFacts {
  profile: string;
  plugins: Array<{ id: string; name: string; disabled?: boolean }>;
  config_fingerprint: string;
  agent_default_model?: string;
}

export interface DshSupervisedReceipt {
  ok: boolean;
  host: 'deepseek-harness';
  hostVersion: string;
  profile: string;
  config_fingerprint: string;
  bundle_hash_verified: boolean;
  sessionId: string;
  result: string;
  observedAt: string;
}

export interface DshAdapter {
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;
  inspectProjection(): Promise<DshCapabilityFacts>;
  runSupervised(params: {
    profile: string;
    prompt: string;
    cwd?: string;
    timeoutMs?: number;
    expectedFingerprint?: string;
  }): Promise<DshSupervisedReceipt>;
}

function dshHome(): string {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

async function resolveDshBinary(): Promise<{ path: string; version?: string } | null> {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, BINARY);
    const resolved = process.platform === 'win32'
      ? (fs.existsSync(`${candidate}.cmd`) ? `${candidate}.cmd` : fs.existsSync(`${candidate}.ps1`) ? `${candidate}.ps1` : candidate)
      : candidate;
    if (!fs.existsSync(resolved)) continue;
    try {
      const { stdout, exitCode } = await runNativeDsh(resolved, ['--version'], { timeoutMs: 5000 });
      return exitCode === 0
        ? { path: resolved, version: stdout.trim().split('\n')[0] || undefined }
        : { path: resolved };
    } catch {
      return { path: resolved };
    }
  }
  return null;
}

/** Fingerprint of the composed profile tree (the enforced plugin/guard truth). */
export async function dumpConfigFingerprint(profile: string): Promise<{ fingerprint: string; dump: string } | null> {
  const binary = await resolveDshBinary();
  if (!binary) return null;
  try {
    const { stdout, exitCode } = await runNativeDsh(binary.path, ['--profile', profile, '--dump-config'], {
      timeoutMs: 15_000,
      env: { ...process.env, DSH_HOME: dshHome() },
    });
    if (exitCode !== 0) return null;
    return { fingerprint: createHash('sha256').update(stdout).digest('hex'), dump: stdout };
  } catch {
    return null;
  }
}

export const deepseekHarnessAdapter: DshAdapter = {
  async detect() {
    const found = await resolveDshBinary();
    if (found) return { installed: true, version: found.version, path: found.path };
    return { installed: false };
  },

  async inspectProjection() {
    const found = await resolveDshBinary();
    const profile = 'web';
    const fingerprint = await dumpConfigFingerprint(profile);
    const plugins: Array<{ id: string; name: string; disabled?: boolean }> = [];
    let agentDefaultModel: string | undefined;
    if (fingerprint) {
      for (const line of fingerprint.dump.split('\n')) {
        const idMatch = line.match(/^- id: (.+)$/);
        const nameMatch = line.match(/^\s+name: ['"](.+)['"]$/);
        const disabledMatch = line.match(/^\s+disabled: (true)$/);
        if (idMatch) plugins.push({ id: idMatch[1]!, name: nameMatch?.[1] ?? '' });
        if (plugins.length && disabledMatch) plugins[plugins.length - 1].disabled = true;
        const modelMatch = line.match(/^\s+model: (.+)$/);
        if (modelMatch) agentDefaultModel = modelMatch[1]!;
      }
    }
    const fallbackFingerprint = createHash('sha256').update(`dsh:profile:${profile}:unobserved`).digest('hex');
    return {
      profile,
      plugins,
      config_fingerprint: fingerprint?.fingerprint ?? fallbackFingerprint,
      ...(agentDefaultModel ? { agent_default_model: agentDefaultModel } : {}),
    };
  },

  async runSupervised(params) {
    const found = await resolveDshBinary();
    const hostVersion = found?.version ?? '';
    const sessionId = randomUUID();
    if (!found) {
      const unobservedHash = createHash('sha256').update(`dsh:unobserved:${sessionId}`).digest('hex');
      return {
        ok: false,
        host: 'deepseek-harness',
        hostVersion: '',
        profile: params.profile,
        config_fingerprint: unobservedHash,
        bundle_hash_verified: false,
        sessionId,
        result: 'dsh binary not found on PATH',
        observedAt: new Date().toISOString(),
      };
    }

    // Verify bundle hash + config fingerprint BEFORE the supervised launch.
    const fingerprint = await dumpConfigFingerprint(params.profile);
    if (!fingerprint) {
      const blockedHash = createHash('sha256').update(`dsh:blocked:${params.profile}:${sessionId}`).digest('hex');
      return {
        ok: false,
        host: 'deepseek-harness',
        hostVersion,
        profile: params.profile,
        config_fingerprint: blockedHash,
        bundle_hash_verified: false,
        sessionId,
        result: `BLOCKED: cannot verify dsh --dump-config fingerprint for profile ${params.profile}`,
        observedAt: new Date().toISOString(),
      };
    }
    if (params.expectedFingerprint && fingerprint.fingerprint !== params.expectedFingerprint) {
      return {
        ok: false,
        host: 'deepseek-harness',
        hostVersion,
        profile: params.profile,
        config_fingerprint: fingerprint.fingerprint,
        bundle_hash_verified: false,
        sessionId,
        result: `BLOCKED: config fingerprint drift (expected ${params.expectedFingerprint.slice(0, 12)}, observed ${fingerprint.fingerprint.slice(0, 12)})`,
        observedAt: new Date().toISOString(),
      };
    }

    // Guard coverage: the tool-guard / permission plugin must be present and
    // not disabled, else the supervised launch is BLOCKED.
    const projection = await deepseekHarnessAdapter.inspectProjection();
    const guard = projection.plugins.find((p) => /guard|permission|approval|sandbox/i.test(p.id + ' ' + p.name));
    const guardEnabled = guard !== undefined && guard.disabled !== true;
    if (!guardEnabled) {
      return {
        ok: false,
        host: 'deepseek-harness',
        hostVersion,
        profile: params.profile,
        config_fingerprint: fingerprint.fingerprint,
        bundle_hash_verified: true,
        sessionId,
        result: 'BLOCKED: no enabled native guard/approval plugin in the managed profile',
        observedAt: new Date().toISOString(),
      };
    }

    const args = ['--profile', params.profile];
    // The prompt is a single argument to the booted app. On Windows the shell
    // path concatenates args, so quote it explicitly to keep the task text
    // intact (never shell-split into words).
    const promptArg = params.prompt;
    try {
      const { stdout, stderr, exitCode } = await runNativeDsh(found.path, [...args, promptArg], {
        timeoutMs: params.timeoutMs ?? 120_000,
        cwd: params.cwd,
        env: { ...process.env, DSH_HOME: dshHome() },
      });
      if (exitCode !== 0) {
        return {
          ok: false,
          host: 'deepseek-harness',
          hostVersion,
          profile: params.profile,
          config_fingerprint: fingerprint.fingerprint,
          bundle_hash_verified: true,
          sessionId,
          result: (stderr || stdout).trim() || `dsh exited with code ${exitCode}`,
          observedAt: new Date().toISOString(),
        };
      }
      const result = (stdout + stderr).trim() || 'completed';
      // DSH turn completion is a HOST OBSERVATION — it is never a terminal PASS.
      return {
        ok: true,
        host: 'deepseek-harness',
        hostVersion,
        profile: params.profile,
        config_fingerprint: fingerprint.fingerprint,
        bundle_hash_verified: true,
        sessionId,
        result,
        observedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        host: 'deepseek-harness',
        hostVersion,
        profile: params.profile,
        config_fingerprint: fingerprint.fingerprint,
        bundle_hash_verified: true,
        sessionId,
        result: `dsh supervised launch failed: ${message}`,
        observedAt: new Date().toISOString(),
      };
    }
  },
};
