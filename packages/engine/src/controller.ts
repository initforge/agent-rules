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
import {
  buildGraphFromNodes, computeReadySet, EMPTY_READY_SET,
  type DependencyEdge, type ExecutionGraph, type ExecutionNode,
  type NodeStatus, type PoolCeilings, type ReadySetResult,
} from './dispatch-ready-set.js';
import { getResourceBroker, poolCeilingsForAction, type BrokerDecision } from './resource-broker.js';

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
const MAX_COLLECTION_ITEMS = 100_000;
const MAX_STRING_BYTES = 64 * 1024;
type Identity = { dev: bigint; ino: bigint };
const taskStates = new Set<TaskState>(['PENDING', 'READY', 'IN_PROGRESS', 'UNDER_REVIEW', 'CLOSED_MATCH', 'CLOSED_FAILED']);
const checkpointStates = new Set<CheckpointState>(['INITIAL', 'DISPATCHING', 'IMPLEMENTING', 'VERIFYING', 'REVIEWING', 'RECONCILING', 'COMPLETED', 'FAILED']);
const ledgerStatuses = new Set(['ADOPTED', 'DISCOVERING', 'PLANNED', 'VALIDATED', 'DISPATCHING', 'EXECUTING', 'VERIFYING', 'REVIEWING', 'needs-remediation', 'needs-replan', 'COMPLETED', 'PARTIAL', 'BLOCKED', 'FAILED', 'CANCELLED']);

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

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Controller: invalid ${field}`);
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > MAX_STRING_BYTES)
    throw new Error(`Controller: invalid ${field}`);
  return value;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION_ITEMS) throw new Error(`Controller: invalid ${field}`);
  return value;
}

function strings(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => string(item, `${field}[${index}]`));
}

function safeRevision(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Controller: invalid ${field}`);
  return value as number;
}

function receipt(value: unknown, field: string): WorkerReceipt {
  const item = record(value, field);
  for (const key of ['receiptId', 'assignmentId', 'workerIdentity', 'host', 'model', 'startedAt', 'completedAt']) string(item[key], `${field}.${key}`);
  for (const key of ['artifactUris', 'artifactHashes', 'filesChanged', 'logUris', 'logHashes', 'testEvidenceUris', 'testEvidenceHashes']) strings(item[key], `${field}.${key}`);
  array(item.commands, `${field}.commands`).forEach((command, index) => {
    const invocation = record(command, `${field}.commands[${index}]`);
    string(invocation.executable, `${field}.commands[${index}].executable`);
    strings(invocation.args, `${field}.commands[${index}].args`);
    if (invocation.cwd !== undefined) string(invocation.cwd, `${field}.commands[${index}].cwd`);
  });
  array(item.exitCodes, `${field}.exitCodes`).forEach((code) => safeRevision(code, `${field}.exitCodes`));
  if (item.diffSha256 !== undefined && !/^[a-f0-9]{64}$/.test(string(item.diffSha256, `${field}.diffSha256`))) throw new Error(`Controller: invalid ${field}.diffSha256`);
  return item as unknown as WorkerReceipt;
}

function assignment(value: unknown, field: string): TaskAssignment {
  const item = record(value, field);
  string(item.assignmentId, `${field}.assignmentId`);
  string(item.taskId, `${field}.taskId`);
  strings(item.dependencies, `${field}.dependencies`);
  array(item.verificationCommands, `${field}.verificationCommands`).forEach((command, index) => {
    const invocation = record(command, `${field}.verificationCommands[${index}]`);
    string(invocation.executable, `${field}.verificationCommands[${index}].executable`);
    strings(invocation.args, `${field}.verificationCommands[${index}].args`);
  });
  return item as unknown as TaskAssignment;
}

function parseLedger(raw: string): WorkLedger {
  const value = record(JSON.parse(raw), 'ledger');
  if (!ledgerStatuses.has(string(value.status, 'ledger.status'))) throw new Error('Controller: invalid ledger.status');
  record(value.plan, 'ledger.plan');
  for (const key of ['planAnchors', 'batches', 'amendments', 'verificationClaims', 'attestations', 'reconciliations', 'repairSlices', 'sourceAcquisitionReceipts', 'orphanFindings'])
    array(value[key], `ledger.${key}`).forEach((item, index) => record(item, `ledger.${key}[${index}]`));
  const assignments = array(value.assignments, 'ledger.assignments').map((item, index) => assignment(item, `ledger.assignments[${index}]`));
  const receipts = array(value.receipts, 'ledger.receipts').map((item, index) => receipt(item, `ledger.receipts[${index}]`));
  safeRevision(value.shadowRevision, 'ledger.shadowRevision');
  record(value.shadowHashes, 'ledger.shadowHashes');
  record(value.latestReview, 'ledger.latestReview');
  if (new Set(assignments.map((item) => item.assignmentId)).size !== assignments.length) throw new Error('Controller: duplicate assignmentId');
  if (new Set(receipts.map((item) => item.receiptId)).size !== receipts.length) throw new Error('Controller: duplicate receiptId');
  return value as unknown as WorkLedger;
}

function parseSnapshot(raw: string, ledgerPath: string): ControllerSnapshot {
  const value = record(JSON.parse(raw), 'checkpoint');
  if (!checkpointStates.has(value.checkpointState as CheckpointState)) throw new Error('Controller: invalid checkpointState');
  const revision = safeRevision(value.revision, 'checkpoint.revision');
  if (string(value.ledgerPath, 'checkpoint.ledgerPath') !== ledgerPath) throw new Error('Controller: checkpoint ledgerPath mismatch');
  const states = record(value.taskStates, 'checkpoint.taskStates');
  if (Object.keys(states).length > MAX_COLLECTION_ITEMS) throw new Error('Controller: invalid checkpoint.taskStates');
  for (const [id, state] of Object.entries(states)) {
    string(id, 'checkpoint.taskStates key');
    if (!taskStates.has(state as TaskState)) throw new Error('Controller: invalid task state');
  }
  const running = strings(value.runningAssignments, 'checkpoint.runningAssignments');
  const receipts = array(value.receipts, 'checkpoint.receipts').map((item, index) => receipt(item, `checkpoint.receipts[${index}]`));
  if (new Set(running).size !== running.length || running.some((id) => states[id] !== 'IN_PROGRESS')) throw new Error('Controller: invalid runningAssignments');
  return { checkpointState: value.checkpointState as CheckpointState, taskStates: states as Record<string, TaskState>, runningAssignments: running, receipts, revision, ledgerPath };
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
  private executionGraph: ExecutionGraph | null = null;
  private browserBurst = false;
  private poolCeilings: PoolCeilings | undefined;
  private brokerDecide: (() => BrokerDecision | Promise<BrokerDecision>) | null = null;

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

  /** Configure the typed execution graph (AM-0019 §4). Nodes may key on taskId or assignmentId. */
  setExecutionGraph(graph: ExecutionGraph): void {
    this.executionGraph = graph;
  }

  setBrowserBurst(enabled: boolean): void {
    this.browserBurst = enabled;
  }

  setPoolCeilings(ceilings: PoolCeilings): void {
    this.poolCeilings = ceilings;
  }

  /**
   * Wire the C4 resource broker (AM-0019 §6): the provider is consulted before
   * every dispatchReadySet and its action is mapped onto the C2 pool ceilings.
   * A PAUSE decision degrades dispatch honestly (fewer total slots, no heavy
   * build/browser burst). Pass the decision or a promise; a rejected decision
   * surfaces so dispatch cannot silently ignore a hot machine.
   */
  setResourceBroker(decide: () => BrokerDecision | Promise<BrokerDecision>): void {
    this.brokerDecide = decide;
  }

  /**
   * Production wiring: consult the per-machine broker singleton before dispatch.
   * Any session that activates a Controller on this host shares one arbiter.
   */
  wireResourceBroker(): void {
    const broker = getResourceBroker();
    this.setResourceBroker(() => broker.decide());
  }

  /**
   * C2 max-useful dispatch (AM-0019 §4): compute the maximum conflict-free
   * ready antichain across the whole graph and mark every member READY.
   * Cross-stage SOFT/VERIFY_AFTER edges never hold successors back; only
   * unsatisfied HARD/GLOBAL_GATE edges do.
   */
  async dispatchReadySet(): Promise<ReadySetResult> {
    if (!this.ledger) return { ...EMPTY_READY_SET };

    this.checkpointState = 'DISPATCHING';

    if (this.brokerDecide) {
      const decision = await this.brokerDecide();
      this.poolCeilings = poolCeilingsForAction(decision.action);
    }

    const typedById = new Map<string, ExecutionNode>();
    for (const node of this.executionGraph?.nodes ?? []) typedById.set(node.id, node);

    const assignmentIds = new Set(this.ledger.assignments.map((a) => a.assignmentId));
    const nodes: ExecutionNode[] = [];
    for (const assignment of this.ledger.assignments) {
      const typed = typedById.get(assignment.assignmentId);
      const deps: DependencyEdge[] = [];
      if (typed?.deps) {
        for (const dep of typed.deps) {
          const depAssignment = this.getAssignmentByTaskId(dep.to) ?? this.getAssignment(dep.to);
          if (depAssignment && assignmentIds.has(depAssignment.assignmentId)) {
            deps.push({ to: depAssignment.assignmentId, type: dep.type });
          }
        }
      }
      if (deps.length === 0) {
        for (const taskId of assignment.dependencies) {
          const depAssignment = this.getAssignmentByTaskId(taskId);
          if (depAssignment && assignmentIds.has(depAssignment.assignmentId)) {
            deps.push({ to: depAssignment.assignmentId, type: 'HARD' });
          }
        }
      }
      nodes.push({
        id: assignment.assignmentId,
        kind: typed?.kind,
        rank: typed?.rank,
        onCriticalPath: typed?.onCriticalPath,
        deps,
        ownedPaths: assignment.ownedPaths,
        leaseDomains: typed?.leaseDomains,
        apiSurfaceKeys: typed?.apiSurfaceKeys,
        migrationKeys: typed?.migrationKeys,
        lockfileKeys: typed?.lockfileKeys,
        generatedKeys: typed?.generatedKeys,
        portKeys: typed?.portKeys,
        sharedDataKeys: typed?.sharedDataKeys,
        browserPages: typed?.browserPages,
      });
    }

    const status: Record<string, NodeStatus> = {};
    const running: string[] = [];
    for (const assignment of this.ledger.assignments) {
      const st = this.taskStates.get(assignment.assignmentId);
      if (st === 'CLOSED_MATCH' || st === 'CLOSED_FAILED') {
        status[assignment.assignmentId] = 'CLOSED';
      } else if (st === 'IN_PROGRESS' || st === 'UNDER_REVIEW' || st === 'READY') {
        status[assignment.assignmentId] = 'RUNNING';
        running.push(assignment.assignmentId);
      } else {
        status[assignment.assignmentId] = 'PENDING';
      }
    }

    const result = computeReadySet({
      graph: buildGraphFromNodes(nodes),
      state: { status },
      running,
      browserBurst: this.browserBurst,
      ceilings: this.poolCeilings,
    });

    for (const id of result.ready) {
      if (this.taskStates.get(id) === 'PENDING') {
        this.taskStates.set(id, 'READY');
        this.checkpointState = 'IMPLEMENTING';
        this.revision++;
      }
    }
    return result;
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
    if (receipt.assignmentId !== assignmentId) {
      throw new Error(`Receipt assignment mismatch: ${receipt.assignmentId} !== ${assignmentId}`);
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
    const snapshot = parseSnapshot(raw, this.ledgerPath);
    if (String(snapshot.revision).padStart(10, '0') !== fromRevision) {
      throw new Error('Controller: checkpoint revision mismatch');
    }
    let ledger: WorkLedger | null;
    try { ledger = parseLedger(readRegularFile(this.ledgerPath, MAX_LEDGER_BYTES, 'ledger').raw); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ledger = null; }
    if (ledger) {
      const assignmentIds = new Set(ledger.assignments.map((item) => item.assignmentId));
      if (Object.keys(snapshot.taskStates).some((id) => !assignmentIds.has(id))
        || snapshot.runningAssignments.some((id) => !assignmentIds.has(id))
        || snapshot.receipts.some((item) => !assignmentIds.has(item.assignmentId))) throw new Error('Controller: checkpoint references unknown assignment');
    }

    this.checkpointState = snapshot.checkpointState;
    this.taskStates = new Map(Object.entries(snapshot.taskStates));
    this.runningAssignments = new Set(snapshot.runningAssignments);
    this.receipts = snapshot.receipts;
    this.revision = snapshot.revision;
    this.ledger = ledger;
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
      const result = await this.dispatchReadySet();
      if (result.ready.length === 0) break;

      for (const assignmentId of result.ready) {
        const taskResult = await this.runTask(assignmentId, worker, verifier);
        if (taskResult.success) completed++;
        else failed++;
      }
    }

    return { completed, failed };
  }
}
