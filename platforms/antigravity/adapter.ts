import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import {
  LeaseGuard,
  type DiffBoundaryResult,
  type LeaseState,
  type MutationVerdict,
} from './lease-guard.js';

const execFileAsync = promisify(execFile);

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

const BINARIES = ['gemini', 'agy'];
const ANTIGRAVITY_HOME = process.env.ANTIGRAVITY_HOME || path.join(os.homedir(), '.gemini', 'config');
const RULES_DIR = path.join(ANTIGRAVITY_HOME, 'rules');

/** M11-C10-C10: the adapter's constrained-surface extensions (AM-0019 §10/§12). */
export interface AntigravityAdapter extends PlatformAdapter {
  readonly leaseGuard: LeaseGuard;
  /** Fail-closed single mutation-path check against the owned-path lease. */
  checkMutation(candidate: string): MutationVerdict;
  /** Diff-boundary validator: reject any diff touching out-of-lease paths. */
  validateDiff(paths: readonly string[]): DiffBoundaryResult;
  /** Lease state: 'ACTIVE' or 'ADVISORY_READ_ONLY' after a guard rejection. */
  leaseState(): LeaseState;
}

function defaultProjectRoot(): string {
  return process.env.ANTIGRAVITY_PROJECT_ROOT ?? process.cwd();
}

/** Default lease scope: project root + worktree root are owned; `.agent` is canonical. */
export function createAntigravityLeaseGuard(): LeaseGuard {
  const projectRoot = defaultProjectRoot();
  return new LeaseGuard({
    ownedRoots: [
      projectRoot,
      process.env.ANTIGRAVITY_WORKTREE_ROOT ?? path.join(projectRoot, '.worktrees'),
    ],
    canonicalAgentPath: path.join(projectRoot, '.agent'),
  });
}

async function whichAntigravity(): Promise<{ path: string; version?: string } | null> {
  const isWin = process.platform === 'win32';
  for (const binary of BINARIES) {
    try {
      const probe = isWin ? 'where' : 'which';
      const { stdout } = await execFileAsync(probe, [binary]);
      const binaryPath = stdout.trim().split(/\r?\n/)[0]?.trim();
      if (!binaryPath) continue;
      let version: string | undefined;
      try {
        const { stdout: versionOut } = await execFileAsync(binaryPath, ['--version']);
        version = versionOut.trim();
      } catch { /* ignore */ }
      return { path: binaryPath, version };
    } catch {
      continue;
    }
  }
  // Windows: agy-node.cmd via Antigravity's Roaming bin
  if (isWin) {
    const agyNode = path.join(os.homedir(), 'AppData', 'Roaming', 'antigravity', 'bin', 'agy-node.cmd');
    if (fs.existsSync(agyNode)) {
      return { path: agyNode, version: '2.8.1' };
    }
  }
  return null;
}

export const antigravityAdapter: AntigravityAdapter = {
  leaseGuard: createAntigravityLeaseGuard(),

  checkMutation(candidate: string): MutationVerdict {
    return this.leaseGuard.checkMutation(candidate);
  },

  validateDiff(paths: readonly string[]): DiffBoundaryResult {
    return this.leaseGuard.validateDiff(paths);
  },

  leaseState(): LeaseState {
    return this.leaseGuard.mode;
  },

  async detect() {
    const found = await whichAntigravity();
    if (found) {
      return { installed: true, version: found.version, path: found.path };
    }
    const homeExists = fs.existsSync(ANTIGRAVITY_HOME);
    if (homeExists) {
      return { installed: true, version: 'desktop', path: ANTIGRAVITY_HOME };
    }
    return { installed: false };
  },

  async render(context: unknown) {
    if (!fs.existsSync(RULES_DIR)) {
      fs.mkdirSync(RULES_DIR, { recursive: true });
    }
    const ruleFile = path.join(RULES_DIR, 'agent-rules-context.md');
    const content = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    fs.writeFileSync(ruleFile, content, 'utf-8');
    return ruleFile;
  },

  async stage(context: unknown) {
    const stagingDir = path.join(ANTIGRAVITY_HOME, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const stagingDir = path.join(ANTIGRAVITY_HOME, 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const dest = path.join(ANTIGRAVITY_HOME, 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    const isWin = process.platform === 'win32';
    for (const binary of BINARIES) {
      try {
        const { stdout } = await execFileAsync(binary, ['--version']);
        return { ok: true, detail: `${binary} ${stdout.trim()}` };
      } catch {
        // On Windows, also try where.exe to confirm binary exists before probing
        if (isWin) {
          try {
            const { stdout: whereOut } = await execFileAsync('where', [binary]);
            const binPath = whereOut.trim().split(/\r?\n/)[0]?.trim();
            if (binPath) {
              const { stdout } = await execFileAsync(binPath, ['--version']);
              return { ok: true, detail: `${binary} ${stdout.trim()}` };
            }
          } catch { /* continue to next binary */ }
        }
        continue;
      }
    }
    // Windows fallback: agy-node.cmd
    if (isWin) {
      const agyNode = path.join(os.homedir(), 'AppData', 'Roaming', 'antigravity', 'bin', 'agy-node.cmd');
      if (fs.existsSync(agyNode)) {
        try {
          const { stdout } = await execFileAsync(agyNode, ['--version']);
          return { ok: true, detail: `agy-node ${stdout.trim()}` };
        } catch { /* fall through */ }
        return { ok: true, detail: 'agy-node available (desktop 2.8.1)' };
      }
    }
    return { ok: false, detail: `Neither gemini nor agy found on PATH` };
  },

  async update() {
    return { ok: false };
  },

  async uninstall() {
    return { ok: false };
  },

  async rollback(_version: string) {
    return { ok: false };
  },
};
