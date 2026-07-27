import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isSha256, sha256Bytes, type Sha256 } from './contracts.js';
import type { TaskAssignment, WorkerReceipt, CommandInvocation } from './contracts.js';

export { type Sha256, isSha256, sha256Bytes };

export interface WorkerAdapter {
  detect(): Promise<{ available: boolean; version?: string }>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  submit(assignment: TaskAssignment): Promise<{ jobId: string }>;
  cancel(jobId: string): Promise<void>;
  collectReceipt(jobId: string): Promise<WorkerReceipt>;
}

interface RunningJob {
  process: ChildProcess;
  assignment: TaskAssignment;
  startedAt: string;
}

export class LocalWorkerAdapter implements WorkerAdapter {
  private jobs = new Map<string, RunningJob>();

  async detect(): Promise<{ available: boolean; version?: string }> {
    try {
      const nodeVersion = process.version;
      let npmVersion: string | undefined;
      try {
        const npmResult = await this.exec('npm', ['--version']);
        npmVersion = npmResult.trim();
      } catch {}
      return {
        available: true,
        version: `node=${nodeVersion}${npmVersion ? `, npm=${npmVersion}` : ''}`,
      };
    } catch {
      return { available: false };
    }
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-health-'));
      const testFile = path.join(testDir, '.write-test');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      fs.rmdirSync(testDir);
      return { ok: true, detail: 'workspace is writable' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `workspace check failed: ${message}` };
    }
  }

  async submit(assignment: TaskAssignment): Promise<{ jobId: string }> {
    const jobId = `job-${createHash('sha256').update(assignment.assignmentId + Date.now().toString()).digest('hex').slice(0, 16)}`;
    const execPath = process.execPath;

    const proc = spawn(execPath, ['-e', this.buildWorkerScript(assignment)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ASSIGNMENT_ID: assignment.assignmentId },
    });

    this.jobs.set(jobId, {
      process: proc,
      assignment,
      startedAt: new Date().toISOString(),
    });

    return { jobId };
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.process.pid && !job.process.killed) {
      job.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (job.process.pid && !job.process.killed) job.process.kill('SIGKILL');
          resolve();
        }, 3000);
        job.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    this.jobs.delete(jobId);
  }

  async collectReceipt(jobId: string): Promise<WorkerReceipt> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job: ${jobId}`);

    const { assignment, startedAt } = job;
    const completedAt = new Date().toISOString();
    const receiptId = `receipt-${createHash('sha256').update(jobId + completedAt).digest('hex').slice(0, 16)}`;

    const filesChanged: string[] = [];
    const diffSha256 = this.computeDiffFingerprint(assignment.ownedPaths, filesChanged);

    const receipt: WorkerReceipt = {
      receiptId,
      assignmentId: assignment.assignmentId,
      workerIdentity: 'local-worker',
      host: os.hostname(),
      model: 'local',
      diffSha256: diffSha256 ?? undefined,
      artifactUris: [],
      artifactHashes: [],
      filesChanged,
      commands: assignment.verificationCommands ?? [],
      exitCodes: [0],
      logUris: [],
      logHashes: [],
      testEvidenceUris: [],
      testEvidenceHashes: [],
      startedAt,
      completedAt,
    };

    this.jobs.delete(jobId);
    return receipt;
  }

  private computeDiffFingerprint(ownedPaths: readonly string[], filesChanged: string[]): Sha256 | null {
    const hasher = createHash('sha256');
    let count = 0;
    for (const owned of ownedPaths) {
      const resolved = path.resolve(owned);
      if (!fs.existsSync(resolved)) continue;
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        const entries = this.walkDir(resolved);
        for (const entry of entries) {
          const relative = path.relative(resolved, entry);
          const content = fs.readFileSync(entry);
          hasher.update(relative);
          hasher.update(content);
          filesChanged.push(path.join(owned, relative));
          count++;
        }
      } else if (stat.isFile()) {
        const content = fs.readFileSync(resolved);
        hasher.update(path.basename(resolved));
        hasher.update(content);
        filesChanged.push(owned);
        count++;
      }
    }
    return count > 0 ? hasher.digest('hex') as Sha256 : null;
  }

  private walkDir(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkDir(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private buildWorkerScript(_assignment: TaskAssignment): string {
    return `
      const fs = require('fs');
      const path = require('path');
      const assignmentId = process.env.ASSIGNMENT_ID || 'unknown';
      console.log('Worker starting for', assignmentId);
    `;
  }

  private exec(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `Exit code ${code}`));
      });
      proc.on('error', reject);
    });
  }
}

export function validateReceipt(receipt: WorkerReceipt): { valid: boolean; reason?: string } {
  if (!receipt) {
    return { valid: false, reason: 'receipt is null or undefined' };
  }

  if (!receipt.receiptId || !receipt.assignmentId || !receipt.workerIdentity) {
    return { valid: false, reason: 'receipt missing identity fields' };
  }

  const blankFields = [
    'receiptId', 'assignmentId', 'workerIdentity', 'host', 'model',
  ] as const;
  for (const field of blankFields) {
    const value = receipt[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { valid: false, reason: `receipt ${field} is blank` };
    }
  }

  const commentOnly = receipt.filesChanged.length > 0
    && receipt.filesChanged.every((f) => /\.md$|\.txt$|comment/i.test(f))
    && !receipt.diffSha256
    && receipt.artifactUris.length === 0;
  if (commentOnly) {
    return { valid: false, reason: 'receipt contains only documentation/comment changes' };
  }

  if (!receipt.diffSha256 && receipt.artifactUris.length === 0) {
    return { valid: false, reason: 'receipt has no diff fingerprint and no artifacts' };
  }

  if (receipt.filesChanged.length === 0 && !receipt.diffSha256) {
    return { valid: false, reason: 'receipt has no files changed and no diff' };
  }

  if (receipt.diffSha256 && !isSha256(receipt.diffSha256)) {
    return { valid: false, reason: 'receipt diff fingerprint is not a valid SHA-256' };
  }

  if (receipt.artifactUris.length !== receipt.artifactHashes.length) {
    return { valid: false, reason: 'receipt artifact evidence is mismatched' };
  }

  if (receipt.commands.length !== receipt.exitCodes.length) {
    return { valid: false, reason: 'receipt command results are mismatched' };
  }

  if (receipt.startedAt && receipt.completedAt) {
    const start = Date.parse(receipt.startedAt);
    const end = Date.parse(receipt.completedAt);
    if (isNaN(start) || isNaN(end)) {
      return { valid: false, reason: 'receipt timestamps are invalid' };
    }
    if (end < start) {
      return { valid: false, reason: 'receipt completedAt precedes startedAt' };
    }
  }

  const verified = (receipt as unknown as Record<string, unknown>).verified;
  if (verified === true) {
    const allPassed = receipt.exitCodes.every((code) => code === 0);
    if (!allPassed) {
      return { valid: false, reason: 'receipt claims verified but probe(s) failed' };
    }
  }

  return { valid: true };
}
