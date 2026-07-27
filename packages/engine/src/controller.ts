import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sha256Bytes, type Sha256 } from './contracts.js';
import type {
  WorkLedger, WorkerReceipt, TaskAssignment, PortablePlan, ReconciliationEntry,
} from './contracts.js';

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

  constructor(ledgerPath: string) {
    this.ledgerPath = path.resolve(ledgerPath);
    if (fs.existsSync(this.ledgerPath)) {
      const raw = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf-8')) as WorkLedger;
      this.ledger = raw;
      for (const assignment of raw.assignments) {
        this.taskStates.set(assignment.assignmentId, 'PENDING');
      }
      this.receipts = [...raw.receipts];
      this.revision = raw.shadowRevision;
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
    fs.mkdirSync(stateDir, { recursive: true });

    const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    const snapshotSha = sha256Bytes(snapshotBytes);
    const revisionStr = String(this.revision).padStart(10, '0');
    const filename = `checkpoint-${revisionStr}-${snapshotSha.slice(0, 16)}.json`;
    const filepath = path.join(stateDir, filename);
    fs.writeFileSync(filepath, snapshotBytes);
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
    const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as ControllerSnapshot;

    this.checkpointState = raw.checkpointState;
    this.taskStates = new Map(Object.entries(raw.taskStates));
    this.runningAssignments = new Set(raw.runningAssignments);
    this.receipts = raw.receipts;
    this.revision = raw.revision;

    if (fs.existsSync(this.ledgerPath)) {
      this.ledger = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf-8')) as WorkLedger;
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
}
