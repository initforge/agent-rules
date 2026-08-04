import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { DelegationAssignment, DelegationReceipt } from '../services/orchestrator.js';

export interface WorkerAdapter {
  name: string;
  platform: string;
  submitAssignment(assignment: DelegationAssignment): Promise<DelegationReceipt>;
  cancelTask(taskId: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; version?: string }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve absolute path to a package's bin, walking up from startDir. */
function resolvePackageBin(packageName: string, startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', packageName);
    try {
      const pkgPath = path.join(candidate, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.bin) {
        const binName = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0] as string;
        return path.join(candidate, binName);
      }
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export class LocalWorkerAdapter implements WorkerAdapter {
  readonly name = 'local-worker';
  readonly platform = 'node';

  private activeProcesses = new Map<string, { proc: ReturnType<typeof spawn>; tempDir: string }>();
  private defaultTimeout: number;

  /** Absolute path to node executable (for spawning TS scripts via tsx). */
  private readonly nodePath: string;
  /** Absolute path to tsx (for running .ts scripts in dev). */
  private readonly tsxPath: string | null;

  constructor(timeoutMs = 120_000) {
    this.defaultTimeout = timeoutMs;
    this.nodePath = process.execPath;
    // Try to resolve tsx from the CLI package upward (works in monorepo + workspaces)
    this.tsxPath = resolvePackageBin('tsx', __dirname);
  }

  async healthCheck(): Promise<{ ok: boolean; version?: string }> {
    return { ok: true, version: process.versions.node };
  }

  async submitAssignment(assignment: DelegationAssignment): Promise<DelegationReceipt> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-'));
    const assignmentPath = path.join(tmpDir, 'assignment.json');

    fs.writeFileSync(assignmentPath, JSON.stringify(assignment, null, 2));

    // Built layout: run the .js sibling directly with node.
    // Dev layout: run .ts script via absolute tsx path (no PATH dependency).
    const jsScript = path.resolve(__dirname, 'local-worker-script.js');
    const tsScript = path.resolve(__dirname, 'local-worker-script.ts');
    const useTsx = !fs.existsSync(jsScript) && this.tsxPath;

    let spawnArgs: string[];
    if (useTsx && this.tsxPath) {
      spawnArgs = [this.tsxPath, tsScript, assignmentPath];
    } else if (fs.existsSync(jsScript)) {
      spawnArgs = [jsScript, assignmentPath];
    } else {
      // Fallback: node with --experimental-strip-types (last resort, may be flaky)
      spawnArgs = ['--experimental-strip-types', tsScript, assignmentPath];
    }

    const proc = spawn(this.nodePath, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    this.activeProcesses.set(assignment.taskId, { proc, tempDir: tmpDir });

    return new Promise<DelegationReceipt>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { proc.kill('SIGTERM'); } catch {}
          this.activeProcesses.delete(assignment.taskId);
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
          reject(new Error(`Task ${assignment.taskId} timed out after ${this.defaultTimeout}ms`));
        }
      }, this.defaultTimeout);

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeProcesses.delete(assignment.taskId);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        reject(err);
      });

      proc.on('close', (exitCode: number | null) => {
        clearTimeout(timer);
        this.activeProcesses.delete(assignment.taskId);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

        if (settled) return;
        settled = true;

        if (exitCode !== 0 && !stdout) {
          reject(new Error(stderr || `Worker exited with code ${exitCode}`));
          return;
        }

        try {
          const receipt = JSON.parse(stdout) as DelegationReceipt;
          if (!receipt.taskId) {
            reject(new Error('Receipt missing taskId'));
            return;
          }
          // Adapter-boundary integrity: a receipt must claim the assigned task.
          // Deep proof validation (evidence/exit-codes/diff-hashes/fake-PASS) is
          // enforced by the orchestrator/runner (computeFinalState).
          if (receipt.taskId !== assignment.taskId) {
            reject(new Error(`Receipt taskId mismatch: expected ${assignment.taskId}, got ${receipt.taskId}`));
            return;
          }
          resolve(receipt);
        } catch (err) {
          reject(new Error(`Invalid receipt JSON: ${(err as Error).message}`));
        }
      });
    });
  }

  async cancelTask(taskId: string): Promise<void> {
    const entry = this.activeProcesses.get(taskId);
    if (!entry) return;

    const { proc, tempDir } = entry;
    try {
      proc.kill('SIGTERM');
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    this.activeProcesses.delete(taskId);
  }
}
