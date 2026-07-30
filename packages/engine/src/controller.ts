import { createHash } from 'node:crypto';
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

export class Controller {
  private checkpointState: CheckpointState = 'INITIAL';
  private taskStates = new Map<string, TaskState>();
  private runningAssignments = new Set<string>();
  private receipts: WorkerReceipt[] = [];
  private revision = 0;
  private readonly ledgerPath: string;
  private ledger: WorkLedger | null = null;
  private retryCountMap = new Map<string, number>();

  constructor(ledgerPath: string) {
    this.ledgerPath = path.resolve(ledgerPath);
    try {
      const fd = fs.openSync(this.ledgerPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let raw: string;
      try {
        const st = fs.fstatSync(fd);
        if (!st.isFile()) throw new Error('Controller: ledger path is not a regular file');
        const size = st.size;
        const buf = Buffer.allocUnsafeSlow(size);
        let off = 0;
        while (off < size) {
          const n = fs.readSync(fd, buf, off, size - off, off);
          if (n === 0) throw new Error('Controller: unexpected EOF on ledger');
          off += n;
        }
        raw = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buf));
      } finally {
        fs.closeSync(fd);
      }
      const parsed = JSON.parse(raw) as WorkLedger;
      this.ledger = parsed;
      for (const assignment of parsed.assignments) {
        this.taskStates.set(assignment.assignmentId, 'PENDING');
      }
      this.receipts = [...parsed.receipts];
      this.revision = parsed.shadowRevision;
    } catch {
      // File doesn't exist or is not a regular file — ledger stays null
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

    const stateDir = path.join(path.dirname(this.ledgerPath), '.controller');
    // lstat-walked mkdir (no recursive:true that follows symlinks)
    {
      const root = path.parse(stateDir).root;
      const parts = stateDir.slice(root.length).split(/[\\/]/).filter(Boolean);
      let cur = root || '.';
      for (const part of parts) {
        cur = path.join(cur, part);
        try {
          const lst = fs.lstatSync(cur);
          if (lst.isSymbolicLink()) throw new Error(`Controller: symlink in stateDir chain: ${cur}`);
          if (!lst.isDirectory()) throw new Error(`Controller: exists but not a directory: ${cur}`);
        } catch (e2: any) {
          if (e2.code !== 'ENOENT') throw e2;
          fs.mkdirSync(cur, { mode: 0o700 });
        }
      }
    }

    const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    const snapshotSha = sha256Bytes(snapshotBytes);
    const revisionStr = String(this.revision).padStart(10, '0');
    const filename = `checkpoint-${revisionStr}-${snapshotSha.slice(0, 16)}.json`;
    const filepath = path.join(stateDir, filename);
    const fd = fs.openSync(filepath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
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
    return revisionStr;
  }

  async resume(fromRevision: string): Promise<void> {
    const stateDir = path.join(path.dirname(this.ledgerPath), '.controller');
    if (!fs.existsSync(stateDir)) {
      throw new Error(`No checkpoint directory found at ${stateDir}`);
    }

    const entries = fs.readdirSync(stateDir).sort().reverse();
    const checkpointFile = entries.find((e) => e.includes(`checkpoint-${fromRevision}`));
    if (!checkpointFile) {
      throw new Error(`No checkpoint found for revision ${fromRevision}`);
    }

    const filepath = path.join(stateDir, checkpointFile);
    const fd = fs.openSync(filepath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let raw: string;
    try {
      const st = fs.fstatSync(fd);
      const size = st.size;
      const buf = Buffer.allocUnsafeSlow(size);
      let off = 0;
      while (off < size) {
        const n = fs.readSync(fd, buf, off, size - off, off);
        if (n === 0) throw new Error('Controller: resume checkpoint EOF');
        off += n;
      }
      raw = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buf));
    } finally {
      fs.closeSync(fd);
    }
    const snapshot = JSON.parse(raw) as ControllerSnapshot;

    this.checkpointState = snapshot.checkpointState;
    this.taskStates = new Map(Object.entries(snapshot.taskStates));
    this.runningAssignments = new Set(snapshot.runningAssignments);
    this.receipts = snapshot.receipts;
    this.revision = snapshot.revision;

    try {
      const ldFd = fs.openSync(this.ledgerPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const st = fs.fstatSync(ldFd);
        const size = st.size;
        const buf = Buffer.allocUnsafeSlow(size);
        let off = 0;
        while (off < size) {
          const n = fs.readSync(ldFd, buf, off, size - off, off);
          if (n === 0) throw new Error('Controller: resume ledger EOF');
          off += n;
        }
        this.ledger = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buf))) as WorkLedger;
      } finally {
        fs.closeSync(ldFd);
      }
    } catch {
      // Ledger missing or unreadable — that's ok
    }
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
