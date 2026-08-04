/**
 * execution-adapter.ts — CLI integration for AM-0021 runtime wiring.
 *
 * Wires local-worker and subprocess execution through execution-facade
 * to ensure event integrity, broker artifact, capsule/checkpoint/wake, and idempotency.
 *
 * ponytail: skip — parallel worker coordination, cross-host resume.
 * Add when AM-0021 cluster 4 ships.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createExecutionFacade, type ExecutionCommand, type ExecutionFacadeOptions, type ExecutionReceipt } from '@initforge/agent-rules-engine/execution-facade';
import type { DelegationReceipt } from '../services/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExecutionAdapterOptions extends ExecutionFacadeOptions {
  readonly timeoutMs?: number;
  readonly workDir?: string;
}

/**
 * LocalWorkerWithFacade — local-worker adapter wired to execution-facade.
 * Emits events, checkpoints, and maintains idempotency for each task.
 */
export class LocalWorkerWithFacade {
  private readonly facade: ReturnType<typeof createExecutionFacade>;
  private readonly timeoutMs: number;
  private readonly workDir: string;
  private readonly activeProcesses = new Map<string, { proc: ReturnType<typeof spawn>; tempDir: string }>();

  constructor(options: ExecutionAdapterOptions) {
    this.facade = createExecutionFacade(options);
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.workDir = options.workDir ?? process.cwd();
  }

  /** submitTask — execute task through facade with event integrity and checkpointing. */
  async submitTask(assignment: {
    taskId: string;
    reqIds: string[];
    objective: string;
    ownedPaths: string[];
    verificationCommands: string[];
    model: string;
    effort: string;
  }): Promise<DelegationReceipt & { executionReceipt: ExecutionReceipt }> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-worker-'));
    const assignmentPath = path.join(tmpDir, 'assignment.json');

    fs.writeFileSync(assignmentPath, JSON.stringify(assignment, null, 2));

    // Resolve script path (dev vs built)
    const jsScript = path.resolve(__dirname, 'local-worker-script.js');
    const scriptPath = fs.existsSync(jsScript)
      ? jsScript
      : path.resolve(__dirname, 'local-worker-script.ts');

    const spawnArgs = scriptPath.endsWith('.js')
      ? [scriptPath, assignmentPath]
      : ['--experimental-strip-types', scriptPath, assignmentPath];

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(process.execPath, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.workDir,
    });

    this.activeProcesses.set(assignment.taskId, { proc, tempDir: tmpDir });

    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { proc.kill('SIGTERM'); } catch {}
          this.activeProcesses.delete(assignment.taskId);
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
          reject(new Error(`Task ${assignment.taskId} timed out after ${this.timeoutMs}ms`));
        }
      }, this.timeoutMs);

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

        const durationMs = Date.now() - startTime;

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

          // Wire through execution-facade for event integrity and checkpointing
          const cmd: ExecutionCommand = {
            command: 'node',
            args: spawnArgs,
            cwd: this.workDir,
          };

          // Submit through facade (idempotent if duplicate)
          const executionReceipt = this.facade.submitCommand(
            cmd,
            stdout,
            stderr,
            exitCode ?? 0,
            durationMs,
          );

          resolve({ ...receipt, executionReceipt });
        } catch (err) {
          reject(new Error(`Invalid receipt JSON: ${(err as Error).message}`));
        }
      });
    });
  }

  /** validateResume — validate checkpoint and produce wake decision. */
  validateResume(checkpointPath: string): ReturnType<ReturnType<typeof createExecutionFacade>['validateResume']> | null {
    try {
      const checkpointData = fs.readFileSync(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(checkpointData);
      return this.facade.validateResume(checkpoint);
    } catch {
      return null;
    }
  }

  /** getFacade — access underlying facade for advanced operations. */
  getFacade(): import('@initforge/agent-rules-engine/execution-facade').ExecutionFacade {
    return this.facade;
  }

  /** cancelTask — cancel active task. */
  async cancelTask(taskId: string): Promise<void> {
    const entry = this.activeProcesses.get(taskId);
    if (!entry) return;

    const { proc, tempDir } = entry;
    try { proc.kill('SIGTERM'); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    this.activeProcesses.delete(taskId);
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createExecutionAdapter(options: ExecutionAdapterOptions): LocalWorkerWithFacade {
  return new LocalWorkerWithFacade(options);
}
