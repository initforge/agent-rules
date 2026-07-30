import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sha256Bytes, type Sha256 } from './contracts.js';
import type {
  WorkLedger, WorkerReceipt, TaskAssignment, PortablePlan, ReconciliationEntry,
} from './contracts.js';
import type { WorkerAdapter } from './worker-adapter.js';
import type { VerifierAdapter, VerificationEvidence } from './verifier.js';

export { type Sha256, sha256Bytes };

export type TaskState = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'CLOSED_MATCH' | 'CLOSED_FAILED';
export type CheckpointState = 'INITIAL' | 'DISPATCHING' | 'IMPLEMENTING' | 'VERIFYING' | 'REVIEWING' | 'RECONCILING' | 'COMPLETED' | 'FAILED';

export interface ControllerSnapshot {
  checkpointState: CheckpointState;
  taskStates: Record<string, TaskState>;
  runningAssignments: string[];
  receipts: WorkerReceipt[];
  revision: number;
  ledgerPath: string;
}

const MAX_LEDGER_BYTES = 16 * 1024 * 1024;
const MAX_CHECKPOINT_BYTES = 16 * 1024 * 1024;
type Identity = { dev: bigint; ino: bigint };

function identity(st: fs.Stats): Identity {
  return { dev: BigInt(st.dev), ino: BigInt(st.ino) };
}

function sameIdentity(a: Identity, b: Identity): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function directoryIdentity(dir: string): Identity {
  const st = fs.statSync(dir, { bigint: false });
  if (!st.isDirectory()) throw new Error(`Controller: not a directory: ${dir}`);
  return identity(st);
}

function canonicalParent(file: string): string {
  return fs.realpathSync.native(path.dirname(path.resolve(file)));
}

function readRegularFile(file: string, limit: number, label: string): { raw: string; id: Identity } {
  const parent = canonicalParent(file);
  const parentBefore = directoryIdentity(parent);
  const fd = fs.openSync(path.join(parent, path.basename(file)), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) throw new Error(`Controller: ${label} is not a private regular file`);
    if (st.size > limit) throw new Error(`Controller: ${label} exceeds ${limit} bytes`);
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < buf.length) {
      const n = fs.readSync(fd, buf, off, buf.length - off, off);
      if (n === 0) throw new Error(`Controller: unexpected EOF reading ${label}`);
      off += n;
    }
    const after = fs.fstatSync(fd);
    if (!sameIdentity(identity(st), identity(after)) || after.size !== st.size
      || !sameIdentity(parentBefore, directoryIdentity(parent))) {
      throw new Error(`Controller: ${label} identity changed during read`);
    }
    return { raw: new TextDecoder('utf-8', { fatal: true }).decode(buf), id: identity(st) };
  } finally {
    fs.closeSync(fd);
  }
}

function parseLedger(raw: string): WorkLedger {
  const value = JSON.parse(raw) as Partial<WorkLedger>;
  if (!Array.isArray(value.assignments) || !Array.isArray(value.receipts)
    || !Number.isSafeInteger(value.shadowRevision)) throw new Error('Controller: malformed ledger');
  return value as WorkLedger;
}

function syncDirectory(dir: string): void {
  try {
    const fd = fs.openSync(dir, fs.constants.O_RDONLY);
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch (error) {
    // ponytail: Windows cannot open directories; use native FlushFileBuffers if Node exposes directory handles.
    if (process.platform !== 'win32') throw error;
  }
}

export class Controller {
  private checkpointState: CheckpointState = 'INITIAL';
  private taskStates = new Map<string, TaskState>();
  private runningAssignments = new Set<string>();
  private receipts: WorkerReceipt[] = [];
  private revision = 0;
  private readonly ledgerPath: string;
  private readonly ledgerDir: string;
  private readonly ledgerDirId: Identity;
  private ledger: WorkLedger | null = null;
  private retryCountMap = new Map<string, number>();

  constructor(ledgerPath: string) {
    this.ledgerPath = path.resolve(ledgerPath);
    this.ledgerDir = canonicalParent(this.ledgerPath);
    this.ledgerDirId = directoryIdentity(this.ledgerDir);
    try {
      const parsed = parseLedger(readRegularFile(this.ledgerPath, MAX_LEDGER_BYTES, 'ledger').raw);
      this.ledger = parsed;
      for (const assignment of parsed.assignments) {
        this.taskStates.set(assignment.assignmentId, 'PENDING');
      }
      this.receipts = [...parsed.receipts];
      this.revision = parsed.shadowRevision;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  getLedger(): WorkLedger | null {
    return this.ledger;
  }

  getTaskState(assignmentId: string): TaskState | undefined {
    return this.taskStates.get(assignmentId);
  }

  private getAssignment(assignmentId: string): TaskAssignment | undefined {
    return this.ledger?.assignments.find((a) => a.assignmentId === assignmentId);
  }

  private getAssignmentByTaskId(taskId: string): TaskAssignment | undefined {
    return this.ledger?.assignments.find((a) => a.taskId === taskId);
  }

  private isDependencyReconciled(assignment: TaskAssignment): boolean {
    for (const depId of assignment.dependencies) {
      const depAssignment = this.getAssignmentByTaskId(depId);
      if (!depAssignment) return false;
      const state = this.taskStates.get(depAssignment.assignmentId);
      if (state !== 'CLOSED_MATCH' && state !== 'CLOSED_FAILED') {
        return false;
      }
    }
    return true;
  }

  async dispatchNext(): Promise<string | null> {
    if (!this.ledger) return null;

    this.checkpointState = 'DISPATCHING';

    for (const assignment of this.ledger.assignments) {
      const state = this.taskStates.get(assignment.assignmentId);
      if (state !== 'PENDING') continue;

      if (!this.isDependencyReconciled(assignment)) continue;

      this.taskStates.set(assignment.assignmentId, 'READY');
      this.checkpointState = 'IMPLEMENTING';
      this.revision++;
      return assignment.assignmentId;
    }

    return null;
  }

  startWork(assignmentId: string): void {
    const state = this.taskStates.get(assignmentId);
    if (state !== 'READY') {
      throw new Error(`Cannot start work on ${assignmentId}: state is ${state}`);
    }
    this.taskStates.set(assignmentId, 'IN_PROGRESS');
    this.runningAssignments.add(assignmentId);
    this.revision++;
  }

  async submitReceipt(assignmentId: string, receipt: WorkerReceipt): Promise<void> {
    const state = this.taskStates.get(assignmentId);
    if (state !== 'IN_PROGRESS') {
      throw new Error(`Cannot submit receipt for ${assignmentId}: state is ${state}`);
    }

    const existing = this.receipts.find((r) => r.receiptId === receipt.receiptId);
    if (existing) {
      throw new Error(`Duplicate receipt: ${receipt.receiptId}`);
    }

    this.receipts.push(receipt);
    this.taskStates.set(assignmentId, 'UNDER_REVIEW');

    this.runningAssignments.delete(assignmentId);

    this.checkpointState = 'VERIFYING';
    this.revision++;
  }

  async verifyReceipt(assignmentId: string, passed: boolean): Promise<void> {
    const state = this.taskStates.get(assignmentId);
    if (state !== 'UNDER_REVIEW') {
      throw new Error(`Cannot verify ${assignmentId}: state is ${state}`);
    }

    if (passed) {
      this.checkpointState = 'VERIFYING';
      this.taskStates.set(assignmentId, 'CLOSED_MATCH');
    } else {
      this.checkpointState = 'FAILED';
      this.taskStates.set(assignmentId, 'CLOSED_FAILED');
    }

    this.revision++;
  }

  async checkpoint(): Promise<string> {
    const snapshot: ControllerSnapshot = {
      checkpointState: this.checkpointState,
      taskStates: Object.fromEntries(this.taskStates),
      runningAssignments: [...this.runningAssignments],
      receipts: this.receipts,
      revision: this.revision,
      ledgerPath: this.ledgerPath,
    };

    const ledgerDir = canonicalParent(this.ledgerPath);
    if (ledgerDir !== this.ledgerDir || !sameIdentity(this.ledgerDirId, directoryIdentity(ledgerDir)))
      throw new Error('Controller: ledger directory identity changed');
    const ledgerDirId = this.ledgerDirId;
    const stateDir = path.join(ledgerDir, '.controller');
    try { fs.mkdirSync(stateDir, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stateLstat = fs.lstatSync(stateDir);
    if (!stateLstat.isDirectory() || stateLstat.isSymbolicLink()) throw new Error('Controller: unsafe state directory');
    const stateDirId = identity(stateLstat);

    const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    const snapshotSha = sha256Bytes(snapshotBytes);
    const revisionStr = String(this.revision).padStart(10, '0');
    const filename = `checkpoint-${revisionStr}-${snapshotSha.slice(0, 16)}.json`;
    const filepath = path.join(stateDir, filename);
    if (snapshotBytes.length > MAX_CHECKPOINT_BYTES) throw new Error('Controller: checkpoint exceeds size limit');
    const temp = path.join(stateDir, `.checkpoint-${process.pid}-${randomBytes(16).toString('hex')}.tmp`);
    const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try {
      let off = 0;
      while (off < snapshotBytes.length) {
        const n = fs.writeSync(fd, snapshotBytes, off, snapshotBytes.length - off);
        if (n === 0) throw new Error('Controller: checkpoint write returned 0');
        off += n;
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      const tempStat = fs.lstatSync(temp);
      if (!tempStat.isFile() || tempStat.isSymbolicLink() || tempStat.nlink !== 1
        || !sameIdentity(stateDirId, directoryIdentity(stateDir))
        || !sameIdentity(ledgerDirId, directoryIdentity(ledgerDir))) throw new Error('Controller: storage identity changed');
      fs.linkSync(temp, filepath);
      const published = fs.lstatSync(filepath);
      if (!sameIdentity(identity(tempStat), identity(published)) || published.nlink !== 2) {
        throw new Error('Controller: checkpoint publish identity mismatch');
      }
      fs.unlinkSync(temp);
      syncDirectory(stateDir);
    } catch (error) {
      try { fs.unlinkSync(temp); } catch { /* preserve original failure */ }
      throw error;
    }
    return revisionStr;
  }

  async resume(fromRevision: string): Promise<void> {
    const ledgerDir = canonicalParent(this.ledgerPath);
    if (ledgerDir !== this.ledgerDir || !sameIdentity(this.ledgerDirId, directoryIdentity(ledgerDir)))
      throw new Error('Controller: ledger directory identity changed');
    const ledgerDirId = this.ledgerDirId;
    const stateDir = path.join(ledgerDir, '.controller');
    let stateStat: fs.Stats;
    try { stateStat = fs.lstatSync(stateDir); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`No checkpoint directory found at ${stateDir}`);
      throw error;
    }
    if (!stateStat.isDirectory() || stateStat.isSymbolicLink()) throw new Error('Controller: unsafe state directory');
    const stateDirId = identity(stateStat);

    const entries = fs.readdirSync(stateDir).sort().reverse();
    if (!/^\d{10}$/.test(fromRevision)) throw new Error('Controller: invalid checkpoint revision');
    const checkpointFile = entries.find((e) => new RegExp(`^checkpoint-${fromRevision}-[0-9a-f]{16}\\.json$`).test(e));
    if (!checkpointFile) {
      throw new Error(`No checkpoint found for revision ${fromRevision}`);
    }

    const filepath = path.join(stateDir, checkpointFile);
    const { raw } = readRegularFile(filepath, MAX_CHECKPOINT_BYTES, 'checkpoint');
    if (!sameIdentity(stateDirId, directoryIdentity(stateDir)) || !sameIdentity(ledgerDirId, directoryIdentity(ledgerDir)))
      throw new Error('Controller: storage identity changed');
    const expectedHash = checkpointFile.split('-')[2]!.slice(0, 16);
    if (sha256Bytes(new TextEncoder().encode(raw)).slice(0, 16) !== expectedHash) throw new Error('Controller: checkpoint hash mismatch');
    const snapshot = JSON.parse(raw) as ControllerSnapshot;

    this.checkpointState = snapshot.checkpointState;
    this.taskStates = new Map(Object.entries(snapshot.taskStates));
    this.runningAssignments = new Set(snapshot.runningAssignments);
    this.receipts = snapshot.receipts;
    this.revision = snapshot.revision;

    try { this.ledger = parseLedger(readRegularFile(this.ledgerPath, MAX_LEDGER_BYTES, 'ledger').raw); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; this.ledger = null; }
  }

  async cancel(assignmentId: string): Promise<void> {
    const state = this.taskStates.get(assignmentId);
    if (!state) return;

    if (state === 'IN_PROGRESS') {
      this.runningAssignments.delete(assignmentId);
    }

    this.taskStates.set(assignmentId, 'CLOSED_FAILED');
    this.checkpointState = 'FAILED';
    this.revision++;
  }

  async retry(assignmentId: string): Promise<void> {
    const state = this.taskStates.get(assignmentId);
    if (state !== 'CLOSED_FAILED') {
      throw new Error(`Cannot retry ${assignmentId}: state is ${state}, expected CLOSED_FAILED`);
    }

    const receiptIndex = this.receipts.findIndex((r) => r.assignmentId === assignmentId);
    if (receiptIndex >= 0) {
      this.receipts.splice(receiptIndex, 1);
    }

    this.taskStates.set(assignmentId, 'PENDING');
    this.checkpointState = 'RECONCILING';
    this.revision++;
  }

  async runTask(
    assignmentId: string,
    worker: WorkerAdapter,
    verifier: VerifierAdapter,
  ): Promise<{ success: boolean; state: TaskState; attempt: number }> {
    const maxRetries = 3;
    let attempt = this.retryCountMap.get(assignmentId) ?? 0;

    while (attempt <= maxRetries) {
      const current = this.taskStates.get(assignmentId);
      if (current === 'CLOSED_MATCH') {
        return { success: true, state: 'CLOSED_MATCH', attempt };
      }

      if (current === 'READY') {
        this.startWork(assignmentId);
      } else if (current !== 'IN_PROGRESS') {
        if (current === 'PENDING') {
          const d = await this.dispatchNext();
          if (d !== assignmentId) {
            throw new Error(`dispatchNext returned ${d} instead of ${assignmentId}`);
          }
          this.startWork(assignmentId);
        } else {
          throw new Error(`Cannot run task ${assignmentId}: unexpected state ${current}`);
        }
      }

      const assignment = this.getAssignment(assignmentId);
      if (!assignment) throw new Error(`Unknown assignment: ${assignmentId}`);

      const { jobId } = await worker.submit(assignment);
      const receipt = await worker.collectReceipt(jobId);
      await this.submitReceipt(assignmentId, receipt);

      let probeExitCode = 0;
      const probeCmds: string[] = [];
      for (const cmd of assignment.verificationCommands) {
        const cmdStr = [cmd.executable, ...cmd.args].join(' ');
        probeCmds.push(cmdStr);
        const cwd = cmd.cwd ? path.resolve(cmd.cwd) : undefined;
        try {
          const result = spawnSync(cmd.executable, [...cmd.args], {
            cwd, stdio: 'pipe', timeout: 30000,
          });
          probeExitCode = result.status ?? 1;
          if (probeExitCode !== 0) break;
        } catch {
          probeExitCode = 1;
          break;
        }
      }

      const evidenceUri = receipt.artifactUris.length > 0
        ? receipt.artifactUris[0]
        : (receipt.filesChanged.length > 0 ? `file://${receipt.filesChanged[0]}` : 'file:///tmp/evidence');
      const evidenceHash = receipt.artifactHashes.length > 0
        ? receipt.artifactHashes[0]
        : (receipt.diffSha256 ?? ('a'.repeat(64) as import('./contracts.js').Sha256));

      const evidence: VerificationEvidence = {
        source: 'verifier',
        probeCommand: probeCmds.join(' && '),
        probeExitCode,
        evidenceUris: [evidenceUri],
        evidenceHashes: [evidenceHash],
        rawOutput: JSON.stringify({ filesChanged: receipt.filesChanged, diffSha256: receipt.diffSha256 }),
      };

      const result = await verifier.verify(receipt, evidence);

      if (result.passed) {
        await this.verifyReceipt(assignmentId, true);
        this.retryCountMap.delete(assignmentId);
        return { success: true, state: 'CLOSED_MATCH', attempt };
      }

      await this.verifyReceipt(assignmentId, false);
      attempt++;

      if (attempt <= maxRetries) {
        this.retryCountMap.set(assignmentId, attempt);
        await this.retry(assignmentId);
      } else {
        this.retryCountMap.delete(assignmentId);
        return { success: false, state: 'CLOSED_FAILED', attempt };
      }
    }

    return { success: false, state: 'CLOSED_FAILED', attempt };
  }

  async runFullPlan(
    worker: WorkerAdapter,
    verifier: VerifierAdapter,
  ): Promise<{ completed: number; failed: number }> {
    let completed = 0;
    let failed = 0;

    while (true) {
      const assignmentId = await this.dispatchNext();
      if (!assignmentId) break;

      const result = await this.runTask(assignmentId, worker, verifier);
      if (result.success) completed++;
      else failed++;
    }

    return { completed, failed };
  }
}
