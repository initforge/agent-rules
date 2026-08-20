import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isSha256, sha256Bytes, type Sha256 } from './contracts.js';
import type { TaskAssignment, WorkerReceipt, CommandInvocation } from './contracts.js';

export { type Sha256, isSha256, sha256Bytes };

function resolveOwnedPath(owned: string): string {
  if (path.isAbsolute(owned)) return path.resolve(owned);
  let dir = process.cwd();
  const driveRoot = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md')) || fs.existsSync(path.join(dir, '.git'))) {
      return path.resolve(dir, owned);
    }
    if (dir === driveRoot) return path.resolve(owned);
    dir = path.dirname(dir);
  }
}

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

interface CommandResult {
  exitCode: number;
  stdoutHash: Sha256;
  stderrHash: Sha256;
  durationMs: number;
}

/** Safe argv runner - rejects shell metacharacters, path traversal, and no-op commands */
export class SafeArgvRunner {
  private static readonly SHELL_METACHAR = /[;&|`${}[\]<>\\!#*?"' \t\r\n]/;
  private static readonly ARG_METACHAR = /[;&|`${}<>\\!#*?"']/;
  private static readonly PATH_TRAVERSAL = /\.\.[\\/]/;
  private static readonly READONLY_COMMANDS = new Set(['true', 'false', 'echo', 'exit', 'cd', 'pwd', 'which', 'type', 'whoami', 'test', '[']);

  static isReadOnly(executable: string, args: readonly string[]): boolean {
    const cmd = path.basename(executable).toLowerCase();
    if (this.READONLY_COMMANDS.has(cmd)) return true;
    // Reject if only checking things
    if (cmd === 'test' || cmd === '[') return true;
    // Reject echo-only invocations
    if (cmd === 'echo' && args.length <= 2) return true;
    return false;
  }

  static validateCommand(invocation: CommandInvocation): { valid: boolean; reason?: string } {
    const { executable, args, cwd } = invocation;

    // Check for null byte
    if (executable.includes('\0') || args.some(a => a.includes('\0'))) {
      return { valid: false, reason: 'command contains null byte' };
    }

    // Check executable name for metacharacters
    if (this.SHELL_METACHAR.test(executable)) {
      return { valid: false, reason: `executable contains shell metacharacters: ${executable}` };
    }

    // Check for path traversal in executable
    if (this.PATH_TRAVERSAL.test(executable)) {
      return { valid: false, reason: `executable contains path traversal: ${executable}` };
    }

    // Check args for metacharacters (allow flags like --version, -v, etc)
    for (const arg of args) {
      if (arg.startsWith('-')) continue; // flags are ok
      if (this.ARG_METACHAR.test(arg)) {
        return { valid: false, reason: `arg contains shell metacharacters: ${arg}` };
      }
    }

    // Validate cwd if provided
    if (cwd !== undefined) {
      if (this.PATH_TRAVERSAL.test(cwd)) {
        return { valid: false, reason: `cwd contains path traversal: ${cwd}` };
      }
      if (!path.isAbsolute(cwd)) {
        return { valid: false, reason: `cwd must be absolute: ${cwd}` };
      }
    }

    // Reject read-only/no-op commands
    if (this.isReadOnly(executable, args)) {
      return { valid: false, reason: `command is read-only/no-op: ${executable}` };
    }

    return { valid: true };
  }

  /**
   * Executes a validated command and returns the result.
   * Called by collectReceipt; exposed as static to avoid prototype.call hack.
   * ponytail: verification commands execute on the local host (harness adapter pattern).
   */
  static async execCommand(invocation: CommandInvocation, timeoutMs = 60000): Promise<CommandResult> {
    const startTime = Date.now();
    const { executable, args, cwd } = invocation;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    let proc: ChildProcess;
    try {
      proc = spawn(executable, [...args], {
        cwd: cwd ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      return {
        exitCode: -1,
        stdoutHash: createHash('sha256').update('').digest('hex') as Sha256,
        stderrHash: createHash('sha256').update(String(err)).digest('hex') as Sha256,
        durationMs: Date.now() - startTime,
      };
    }

    proc.stdout?.on('data', (data: Buffer) => stdoutChunks.push(data));
    proc.stderr?.on('data', (data: Buffer) => stderrChunks.push(data));

    const exitCode = await new Promise<number>((resolve) => {
      const timeout = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        resolve(-1);
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code ?? -1);
      });
      proc.on('error', () => {
        clearTimeout(timeout);
        resolve(-1);
      });
    });

    const durationMs = Date.now() - startTime;
    const stdout = Buffer.concat(stdoutChunks);
    const stderr = Buffer.concat(stderrChunks);

    return {
      exitCode,
      stdoutHash: createHash('sha256').update(stdout).digest('hex') as Sha256,
      stderrHash: createHash('sha256').update(stderr).digest('hex') as Sha256,
      durationMs,
    };
  }

  async run(invocation: CommandInvocation, timeoutMs = 60000): Promise<CommandResult> {
    const validation = SafeArgvRunner.validateCommand(invocation);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.reason}`);
    }
    return SafeArgvRunner.execCommand(invocation, timeoutMs);
  }
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

    // Await spawned worker process exit — ensures assignment binding is respected.
    await new Promise<void>((resolve) => {
      job.process.on('exit', () => resolve());
      job.process.on('error', () => resolve()); // treat error as exit
      // Timeout guard: if process hangs, unblock after 30s
      setTimeout(resolve, 30000);
    });

    const filesChanged: string[] = [];
    const diffSha256 = this.computeDiffFingerprint(assignment.ownedPaths, filesChanged);

    // Execute verification commands and capture real exit codes.
    // ponytail: commands run on local host (harness adapter = no isolated worker).
    const commands = assignment.verificationCommands ?? [];
    const exitCodes: number[] = [];
    const logHashes: Sha256[] = [];
    const logUris: string[] = [];

    for (const cmd of commands) {
      const validation = SafeArgvRunner.validateCommand(cmd);
      if (!validation.valid) {
        exitCodes.push(-1);
        const errHash = createHash('sha256').update(validation.reason ?? 'validation failed').digest('hex') as Sha256;
        logHashes.push(errHash);
        logUris.push(`validation-error://${cmd.executable}`);
        continue;
      }

      const result = await SafeArgvRunner.execCommand(cmd);
      exitCodes.push(result.exitCode);
      const failed = result.exitCode === -1;
      logHashes.push(failed ? result.stderrHash : result.stdoutHash);
      logUris.push(failed
        ? `error://${cmd.executable}/${result.stderrHash}`
        : `stdout://${cmd.executable}/${result.stdoutHash}`);
    }

    // Assignment binding: receipt must include the exact assignmentId and taskId.
    if (!assignment.assignmentId || assignment.assignmentId.trim().length === 0) {
      throw new Error('Assignment binding failed: assignmentId is blank');
    }

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
      commands,
      exitCodes,
      logUris,
      logHashes,
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
      const resolved = resolveOwnedPath(owned);
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

  if (receipt.diffSha256 && !isSha256(receipt.diffSha256)) {
    return { valid: false, reason: 'receipt diff fingerprint is not a valid SHA-256' };
  }

  if (receipt.artifactUris.length !== receipt.artifactHashes.length || !receipt.artifactHashes.every(isSha256)) {
    return { valid: false, reason: 'receipt artifact evidence is mismatched' };
  }

  if (receipt.commands.length !== receipt.exitCodes.length) {
    return { valid: false, reason: 'receipt command results are mismatched' };
  }

  if (!receipt.logHashes.every(isSha256)) {
    return { valid: false, reason: 'receipt log hash is not a valid SHA-256' };
  }

  if (receipt.logUris.length !== receipt.logHashes.length) {
    return { valid: false, reason: 'receipt logs are mismatched' };
  }

  if (!receipt.testEvidenceHashes.every(isSha256)) {
    return { valid: false, reason: 'receipt test evidence hash is not a valid SHA-256' };
  }

  if (receipt.testEvidenceUris.length !== receipt.testEvidenceHashes.length) {
    return { valid: false, reason: 'receipt test evidence is mismatched' };
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

export class FixtureRepoWorker implements WorkerAdapter {
  private jobs = new Map<string, { assignment: TaskAssignment; fixturePath: string }>();

  constructor(
    private readonly fixturePath: string,
    private readonly misimplement = false,
  ) {}

  async detect(): Promise<{ available: boolean; version?: string }> {
    const exists = fs.existsSync(this.fixturePath);
    return { available: exists, version: exists ? 'fixture-v1' : undefined };
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: fs.existsSync(this.fixturePath), detail: `fixture at ${this.fixturePath}` };
  }

  async submit(assignment: TaskAssignment): Promise<{ jobId: string }> {
    const jobId = `fixture-job-${createHash('sha256').update(assignment.assignmentId + Date.now().toString()).digest('hex').slice(0, 16)}`;
    const indexPath = path.join(this.fixturePath, 'src', 'index.js');

    if (fs.existsSync(indexPath)) {
      const body = this.misimplement ? 'a - b' : 'a + b';
      fs.writeFileSync(indexPath, `export function add(a, b) {
  return ${body};
}
`);
    }

    this.jobs.set(jobId, { assignment, fixturePath: this.fixturePath });
    return { jobId };
  }

  async cancel(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }

  async collectReceipt(jobId: string): Promise<WorkerReceipt> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job: ${jobId}`);

    const { assignment, fixturePath } = job;
    const startedAt = new Date().toISOString();
    const completedAt = new Date().toISOString();
    const receiptId = `fixture-receipt-${createHash('sha256').update(jobId + completedAt).digest('hex').slice(0, 16)}`;

    const filesChanged: string[] = [];
    const diffSha256 = this.computeDiffFingerprint([fixturePath], filesChanged);

    // Execute verification commands and capture real exit codes.
    // ponytail: commands run on local host (fixture adapter = controlled environment).
    const commands = assignment.verificationCommands ?? [];
    const exitCodes: number[] = [];
    const logHashes: Sha256[] = [];
    const logUris: string[] = [];

    for (const cmd of commands) {
      const validation = SafeArgvRunner.validateCommand(cmd);
      if (!validation.valid) {
        exitCodes.push(-1);
        const errHash = createHash('sha256').update(validation.reason ?? 'validation failed').digest('hex') as Sha256;
        logHashes.push(errHash);
        logUris.push(`validation-error://${cmd.executable}`);
        continue;
      }

      const result = await SafeArgvRunner.execCommand(cmd);
      exitCodes.push(result.exitCode);
      const failed = result.exitCode === -1;
      logHashes.push(failed ? result.stderrHash : result.stdoutHash);
      logUris.push(failed
        ? `error://${cmd.executable}/${result.stderrHash}`
        : `stdout://${cmd.executable}/${result.stdoutHash}`);
    }

    // Assignment binding check
    if (!assignment.assignmentId || assignment.assignmentId.trim().length === 0) {
      throw new Error('Assignment binding failed: assignmentId is blank');
    }

    const receipt: WorkerReceipt = {
      receiptId,
      assignmentId: assignment.assignmentId,
      workerIdentity: 'fixture-repo-worker',
      host: os.hostname(),
      model: 'fixture',
      diffSha256: diffSha256 ?? undefined,
      artifactUris: [],
      artifactHashes: [],
      filesChanged,
      commands,
      exitCodes,
      logUris,
      logHashes,
      testEvidenceUris: [],
      testEvidenceHashes: [],
      startedAt,
      completedAt,
    };

    this.jobs.delete(jobId);
    return receipt;
  }

  private computeDiffFingerprint(ownedPaths: string[], filesChanged: string[]): import('./contracts.js').Sha256 | null {
    const hasher = createHash('sha256');
    let count = 0;
    for (const owned of ownedPaths) {
      const resolved = resolveOwnedPath(owned);
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
    return count > 0 ? hasher.digest('hex') as import('./contracts.js').Sha256 : null;
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
}
