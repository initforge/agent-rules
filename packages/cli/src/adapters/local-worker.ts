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

export class LocalWorkerAdapter implements WorkerAdapter {
  readonly name = 'local-worker';
  readonly platform = 'node';

  private activeProcesses = new Map<string, { proc: ReturnType<typeof spawn>; tempDir: string }>();
  private defaultTimeout: number;

  constructor(timeoutMs = 120_000) {
    this.defaultTimeout = timeoutMs;
  }

  async healthCheck(): Promise<{ ok: boolean; version?: string }> {
    return { ok: true, version: process.versions.node };
  }

  async submitAssignment(assignment: DelegationAssignment): Promise<DelegationReceipt> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-'));
    const assignmentPath = path.join(tmpDir, 'assignment.json');

    fs.writeFileSync(assignmentPath, JSON.stringify(assignment, null, 2));

    const scriptPath = path.resolve(__dirname, 'local-worker-script.ts');

    const proc = spawn(process.execPath, ['--experimental-strip-types', scriptPath, assignmentPath], {
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
