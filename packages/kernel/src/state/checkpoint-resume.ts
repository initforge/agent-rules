import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveGitPath } from '../runner/platform.js';
import { ActivationLock } from '../secure-fs.js';
import { sha256Bytes, type Sha256 } from '../contracts.js';

export type CheckpointTrigger = 'manual' | 'task_complete' | 'epoch_change' | 'crash_recovery';

export interface CursorPosition {
  readonly planId: string;
  readonly runId: string;
  readonly epoch: number;
  readonly taskId: string;
  readonly attemptCount: number;
  readonly completedTaskIds: readonly string[];
  readonly failedTaskIds: readonly string[];
  readonly skippedTaskIds: readonly string[];
}

export interface CommittedDecision {
  readonly decisionId: string;
  readonly decision: string;
  readonly rationale: string;
  readonly committedAt: string;
  readonly commitSha256: string;
}

export interface CapsuleState {
  readonly planId: string;
  readonly runId: string;
  readonly epoch: number;
  readonly decisions: readonly CommittedDecision[];
  readonly pendingClaims: readonly string[];
  readonly pendingEvidence: readonly string[];
  readonly activeWorkers: readonly string[];
  readonly mode: string;
}

export interface Checkpoint {
  readonly checkpointId: string;
  readonly checkpointSha256: string;
  readonly trigger: CheckpointTrigger;
  readonly cursor: CursorPosition;
  readonly capsule: CapsuleState;
  readonly createdAt: string;
  readonly previousCheckpointId: string | null;
}

export interface ResumeValidation {
  readonly valid: boolean;
  readonly cursorMatches: boolean;
  readonly capsuleMatches: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ResumeContext {
  readonly checkpoint: Checkpoint;
  readonly validation: ResumeValidation;
  readonly pendingDecisions: readonly string[];
  readonly canResume: boolean;
}

/** Build a committed decision whose integrity hash is guaranteed to match the validator. */
export function createCommittedDecision(
  decisionId: string,
  decision: string,
  rationale: string,
  committedAt: string = new Date().toISOString(),
): CommittedDecision {
  const commitSha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify({
    decisionId,
    decision,
    rationale,
    committedAt,
  })));
  return { decisionId, decision, rationale, committedAt, commitSha256 };
}

function validateCursor(cursor: CursorPosition): string[] {
  const errors: string[] = [];
  if (!cursor.planId) errors.push('cursor.planId is required');
  if (!cursor.runId) errors.push('cursor.runId is required');
  if (cursor.epoch < 0) errors.push('cursor.epoch must be non-negative');
  if (!cursor.taskId) errors.push('cursor.taskId is required');
  if (cursor.attemptCount < 0) errors.push('cursor.attemptCount must be non-negative');
  const allIds = new Set([
    ...cursor.completedTaskIds,
    ...cursor.failedTaskIds,
    ...cursor.skippedTaskIds,
  ]);
  const total = cursor.completedTaskIds.length + cursor.failedTaskIds.length + cursor.skippedTaskIds.length;
  if (allIds.size !== total) errors.push('cursor task sets must be disjoint');
  return errors;
}

function validateCapsule(capsule: CapsuleState): string[] {
  const errors: string[] = [];
  if (!capsule.planId) errors.push('capsule.planId is required');
  if (!capsule.runId) errors.push('capsule.runId is required');
  if (capsule.epoch < 0) errors.push('capsule.epoch must be non-negative');
  const decisionIds = capsule.decisions.map(d => d.decisionId);
  if (new Set(decisionIds).size !== decisionIds.length) {
    errors.push('capsule.decisions must have unique decisionIds');
  }
  for (const decision of capsule.decisions) {
    const expected = sha256Bytes(new TextEncoder().encode(JSON.stringify({
      decisionId: decision.decisionId,
      decision: decision.decision,
      rationale: decision.rationale,
      committedAt: decision.committedAt,
    })));
    if (decision.commitSha256 !== expected) {
      errors.push(`decision ${decision.decisionId} commitSha256 mismatch`);
    }
  }
  return errors;
}

function computeCheckpointSha(checkpoint: Omit<Checkpoint, 'checkpointId' | 'checkpointSha256'>): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    trigger: checkpoint.trigger,
    cursor: checkpoint.cursor,
    capsule: checkpoint.capsule,
    createdAt: checkpoint.createdAt,
    previousCheckpointId: checkpoint.previousCheckpointId,
  })));
}

export function validateCheckpointIntegrity(checkpoint: Checkpoint): ResumeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  errors.push(...validateCursor(checkpoint.cursor));
  errors.push(...validateCapsule(checkpoint.capsule));
  const expectedSha = computeCheckpointSha(checkpoint);
  if (checkpoint.checkpointSha256 !== expectedSha) {
    errors.push('checkpointSha256 does not match computed hash');
  }
  return {
    valid: errors.length === 0,
    cursorMatches: validateCursor(checkpoint.cursor).length === 0,
    capsuleMatches: validateCapsule(checkpoint.capsule).length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  };
}

export function validateCursorCapsulePair(
  cursor: CursorPosition,
  capsule: CapsuleState,
): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  errors.push(...validateCursor(cursor));
  if (cursor.planId !== capsule.planId) errors.push(`cursor.planId "${cursor.planId}" !== capsule.planId "${capsule.planId}"`);
  if (cursor.runId !== capsule.runId) errors.push(`cursor.runId "${cursor.runId}" !== capsule.runId "${capsule.runId}"`);
  if (cursor.epoch !== capsule.epoch) errors.push(`cursor.epoch ${cursor.epoch} !== capsule.epoch ${capsule.epoch}`);
  const completedTaskIds = new Set(cursor.completedTaskIds);
  const decidedTaskIds = new Set(
    capsule.decisions
      .map(d => {
        try {
          const ctx = JSON.parse(d.decision);
          return ctx.taskId ?? null;
        } catch { return null; }
      })
      .filter((id): id is string => id !== null),
  );
  const missingDecisions = [...completedTaskIds].filter(id => !decidedTaskIds.has(id));
  if (missingDecisions.length > 0) errors.push(`completed tasks without committed decisions: ${missingDecisions.join(', ')}`);
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

export function createCheckpoint(
  trigger: CheckpointTrigger,
  cursor: CursorPosition,
  capsule: CapsuleState,
  previousCheckpointId: string | null = null,
): Checkpoint {
  const checkpointId = `ckpt-${Date.now()}-${createHash('sha256').update(JSON.stringify({ cursor, capsule })).digest('hex').slice(0, 8)}`;
  const rawCheckpoint = { trigger, cursor, capsule, createdAt: new Date().toISOString(), previousCheckpointId };
  return { ...rawCheckpoint, checkpointId, checkpointSha256: computeCheckpointSha(rawCheckpoint) };
}

export function buildResumeContext(checkpoint: Checkpoint): ResumeContext {
  const validation = validateCheckpointIntegrity(checkpoint);
  const completedTaskIds = new Set(checkpoint.cursor.completedTaskIds);
  const pendingDecisions = checkpoint.capsule.decisions
    .filter(d => {
      try {
        const ctx = JSON.parse(d.decision);
        return !completedTaskIds.has(ctx.taskId ?? '');
      } catch { return true; }
    })
    .map(d => d.decisionId);
  return { checkpoint, validation, pendingDecisions: Object.freeze(pendingDecisions), canResume: validation.valid };
}

export function computeCursorSha(cursor: CursorPosition): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    planId: cursor.planId,
    runId: cursor.runId,
    epoch: cursor.epoch,
    taskId: cursor.taskId,
    attemptCount: cursor.attemptCount,
    completedTaskIds: cursor.completedTaskIds.slice().sort(),
    failedTaskIds: cursor.failedTaskIds.slice().sort(),
    skippedTaskIds: cursor.skippedTaskIds.slice().sort(),
  })));
}

export function computeCapsuleSha(capsule: CapsuleState): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    planId: capsule.planId,
    runId: capsule.runId,
    epoch: capsule.epoch,
    decisions: capsule.decisions.map(d => d.commitSha256),
    pendingClaims: capsule.pendingClaims.slice().sort(),
    pendingEvidence: capsule.pendingEvidence.slice().sort(),
    activeWorkers: capsule.activeWorkers.slice().sort(),
    mode: capsule.mode,
  })));
}

export interface CheckpointCompatibility {
  readonly compatible: boolean;
  readonly reason?: string;
  readonly cursorProgress: boolean;
  readonly identityMatches: boolean;
}

export function isCheckpointCompatible(previous: Checkpoint, next: Checkpoint): CheckpointCompatibility {
  const identityFields = [
    { field: 'planId', prev: previous.cursor.planId, next: next.cursor.planId },
    { field: 'runId', prev: previous.cursor.runId, next: next.cursor.runId },
    { field: 'epoch', prev: previous.cursor.epoch, next: next.cursor.epoch },
  ];
  for (const { field, prev, next: nextValue } of identityFields) {
    if (prev !== nextValue) {
      return { compatible: false, reason: `identity mismatch: ${field} changed from "${prev}" to "${nextValue}"`, cursorProgress: false, identityMatches: false };
    }
  }
  const previousCompleted = new Set(previous.cursor.completedTaskIds);
  const nextCompleted = new Set(next.cursor.completedTaskIds);
  const hasProgress = [...previousCompleted].every(id => nextCompleted.has(id));
  const hasNewWork = nextCompleted.size >= previousCompleted.size;
  if (!hasProgress || !hasNewWork) {
    return { compatible: false, reason: 'cursor rollback detected: completed tasks decreased', cursorProgress: false, identityMatches: true };
  }
  if (next.previousCheckpointId !== null && next.previousCheckpointId !== previous.checkpointId) {
    return { compatible: false, reason: `checkpoint chain broken: expected previous "${previous.checkpointId}", got "${next.previousCheckpointId}"`, cursorProgress: true, identityMatches: true };
  }
  return { compatible: true, cursorProgress: true, identityMatches: true };
}

export function validateCheckpointForResume(
  checkpoint: Checkpoint,
  expectedPlanId: string,
  expectedRunId: string,
  expectedEpoch: number,
): ResumeValidation {
  const integrity = validateCheckpointIntegrity(checkpoint);
  const errors = [...integrity.errors];
  if (checkpoint.cursor.planId !== expectedPlanId) errors.push(`planId mismatch: checkpoint "${checkpoint.cursor.planId}" !== expected "${expectedPlanId}"`);
  if (checkpoint.cursor.runId !== expectedRunId) errors.push(`runId mismatch: checkpoint "${checkpoint.cursor.runId}" !== expected "${expectedRunId}"`);
  if (checkpoint.cursor.epoch !== expectedEpoch) errors.push(`epoch mismatch: checkpoint ${checkpoint.cursor.epoch} !== expected ${expectedEpoch}`);
  const pairValidation = validateCursorCapsulePair(checkpoint.cursor, checkpoint.capsule);
  errors.push(...pairValidation.errors);
  return {
    valid: errors.length === 0 && integrity.valid,
    cursorMatches: integrity.cursorMatches && checkpoint.cursor.planId === expectedPlanId,
    capsuleMatches: integrity.capsuleMatches && checkpoint.capsule.planId === expectedPlanId,
    errors: Object.freeze([...new Set(errors)]),
    warnings: integrity.warnings,
  };
}

export interface PortableCheckpoint {
  readonly schema: 'harness/portable-checkpoint';
  readonly version: 3;
  readonly checkpointId: string;
  readonly checkpointSha256: string;
  readonly trigger: CheckpointTrigger;
  readonly cursor: CursorPosition;
  readonly capsule: CapsuleState;
  readonly gitHead: string;
  readonly gitDiff: string;
  readonly untrackedFiles: Record<string, string>; // relativePath -> base64 content
  readonly environmentFingerprint: {
    readonly hostname: string;
    readonly os: string;
    readonly nodeVersion: string;
    readonly timestamp: string;
  };
  readonly payloadHashes: Record<string, string>; // relativePath -> sha256 of base64
}

export interface RestoreResult {
  readonly success: boolean;
  readonly error?: string;
  readonly interruptedTaskCount: number;
}

interface RestoreReceipt {
  readonly schema: 'harness/checkpoint-restore-receipt';
  readonly version: 1;
  readonly checkpointId: string;
  readonly checkpointSha256: string;
  readonly planId: string;
  readonly gitHead: string;
  readonly stateSha256: string;
  readonly interruptedTaskCount: number;
  readonly recordedAt: string;
  readonly receiptSha256: string;
}

interface RestoreStateSnapshot {
  readonly root: string;
  readonly kind: 'missing' | 'file' | 'directory';
  readonly content?: Buffer;
  readonly files?: readonly { relativePath: string; content: Buffer }[];
}

type RestoreTransactionPhase =
  | 'PREPARED'
  | 'STAGED'
  | 'BACKUP_COMPLETE'
  | 'PAYLOAD_APPLIED'
  | 'PATCH_APPLIED'
  | 'JOURNAL_APPLIED'
  | 'QUEUE_APPLIED'
  | 'COMMITTED';

interface SerializedRestoreStateSnapshot {
  readonly root: string;
  readonly kind: RestoreStateSnapshot['kind'];
  readonly contentBase64?: string;
  readonly files?: readonly { relativePath: string; contentBase64: string }[];
}

interface RestoreTransactionManifest {
  readonly schema: 'harness/checkpoint-restore-transaction/v1';
  readonly version: 1;
  readonly transactionId: string;
  readonly checkpointId: string;
  readonly checkpointSha256: string;
  readonly planId: string;
  readonly gitHead: string;
  readonly gitDiff: string;
  readonly trackedDeltaAlreadyApplied: boolean;
  readonly phase: RestoreTransactionPhase;
  readonly stagingRelativePath: string;
  readonly backupRelativePath: string;
  readonly payloadPaths: readonly string[];
  readonly preExistingPayloadPaths: readonly string[];
  readonly snapshots: readonly SerializedRestoreStateSnapshot[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const RESTORE_TRANSACTION_DIR = '.agent/checkpoint-restore-transactions';

function restoreTransactionManifestPath(cwd: string, transactionId: string): string {
  return path.join(cwd, RESTORE_TRANSACTION_DIR, `${transactionId}.json`);
}

function durableWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp-${randomUUID()}`;
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmpPath, filePath);
    if (process.platform !== 'win32') {
      const dirFd = fs.openSync(path.dirname(filePath), 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    }
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    try { if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true }); } catch {}
  }
}

function serializeRestoreSnapshot(snapshot: RestoreStateSnapshot, cwd: string): SerializedRestoreStateSnapshot {
  const root = path.relative(cwd, snapshot.root).replace(/\\/g, '/') || '.';
  if (snapshot.kind === 'file') {
    if (!snapshot.content) throw new Error(`Restore snapshot is missing file content: ${snapshot.root}`);
    return { root, kind: snapshot.kind, contentBase64: snapshot.content.toString('base64') };
  }
  if (snapshot.kind === 'directory') {
    return {
      root,
      kind: snapshot.kind,
      files: (snapshot.files ?? []).map((file) => ({
        relativePath: file.relativePath.replace(/\\/g, '/'),
        contentBase64: file.content.toString('base64'),
      })),
    };
  }
  return { root, kind: snapshot.kind };
}

function deserializeRestoreSnapshot(snapshot: SerializedRestoreStateSnapshot, cwd: string): RestoreStateSnapshot {
  const root = path.resolve(cwd, snapshot.root);
  assertSafePath(root, cwd);
  if (snapshot.kind === 'file') {
    if (typeof snapshot.contentBase64 !== 'string') throw new Error(`Restore transaction snapshot is missing file content: ${snapshot.root}`);
    return { root, kind: snapshot.kind, content: Buffer.from(snapshot.contentBase64, 'base64') };
  }
  if (snapshot.kind === 'directory') {
    return {
      root,
      kind: snapshot.kind,
      files: (snapshot.files ?? []).map((file) => ({
        relativePath: file.relativePath,
        content: Buffer.from(file.contentBase64, 'base64'),
      })),
    };
  }
  return { root, kind: snapshot.kind };
}

function maybeCrashDuringRestoreForTest(phase: RestoreTransactionPhase | 'after-prepared' | 'after-receipt'): void {
  const requested = process.env.AGENT_RULES_TEST_CHECKPOINT_CRASH_PHASE;
  if ((process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') && requested === phase) {
    if (process.platform === 'win32') process.exit(137);
    process.kill(process.pid, 'SIGKILL');
  }
}

function scanForSecrets(content: string): boolean {
  const privateKeyPattern = /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/i;
  const genericApiKeyPattern = /(?:key|api|token|secret|passwd|password)\s*[:=]\s*["'][a-zA-Z0-9_\-\.\~]{16,}["']/i;
  return privateKeyPattern.test(content) || genericApiKeyPattern.test(content);
}

function hasPathTraversal(relPath: string): boolean {
  // Normalize and check for directory traversal segments (.. or absolute paths)
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return true; // Absolute path
  }
  const parts = normalized.split('/');
  return parts.includes('..');
}

function restoreReceiptRelativePath(checkpoint: PortableCheckpoint): string {
  return `.agent/checkpoint-receipts/${checkpoint.checkpointId}.json`;
}

function hashRestoreDirectory(root: string, cwd: string): string {
  const entries: Array<{ path: string; kind: 'file' | 'directory'; sha256?: string }> = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const fullPath = path.join(dir, name);
      const relPath = path.relative(cwd, fullPath).replace(/\\/g, '/');
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) throw new Error(`Restore state contains a symbolic link: ${relPath} (fail closed)`);
      if (stat.isDirectory()) {
        entries.push({ path: relPath, kind: 'directory' });
        walk(fullPath);
      } else if (stat.isFile()) {
        entries.push({ path: relPath, kind: 'file', sha256: createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex') });
      } else {
        throw new Error(`Restore state contains an unsupported filesystem entry: ${relPath} (fail closed)`);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

function hashRestoreState(cwd: string, checkpoint: PortableCheckpoint, git: string): string {
  const diffRes = spawnSync(git, ['diff', 'HEAD'], { cwd, encoding: 'utf8' });
  if (diffRes.status !== 0) throw new Error(`git diff HEAD failed while hashing restored state: ${diffRes.stderr}`);
  const statusRes = spawnSync(git, ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  if (statusRes.status !== 0) throw new Error(`git status failed while hashing restored state: ${statusRes.stderr}`);
  const dirtyState = statusRes.stdout.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const relPath = line.slice(2).trim().replace(/\\/g, '/');
    if (isRestoreInternalPath(relPath, checkpoint)) return undefined;
    const fullPath = path.join(cwd, relPath);
    assertSafePath(fullPath, cwd);
    if (!fs.existsSync(fullPath)) return { line: line.slice(0, 2), path: relPath, exists: false };
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) throw new Error(`Restore state contains a symbolic link: ${relPath} (fail closed)`);
    const sha256 = stat.isFile()
      ? createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')
      : stat.isDirectory()
        ? hashRestoreDirectory(fullPath, cwd)
        : undefined;
    return { line: line.slice(0, 2), path: relPath, exists: true, sha256 };
  }).filter((entry): entry is Exclude<typeof entry, undefined> => entry !== undefined);
  const payloadState = Object.keys(checkpoint.untrackedFiles).sort().map((relPath) => {
    const fullPath = path.join(cwd, relPath);
    assertSafePath(fullPath, cwd);
    if (!fs.existsSync(fullPath)) return { path: relPath, exists: false };
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Restore payload target is not a regular file: ${relPath} (fail closed)`);
    return { path: relPath, exists: true, sha256: createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex') };
  });
  const planDir = path.join(cwd, '.agent', 'plans', checkpoint.cursor.planId);
  const state = {
    gitDiff: diffRes.stdout,
    dirtyState,
    planState: hashRestoreDirectory(planDir, cwd),
    payloadState,
  };
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

function readRestoreReceipt(cwd: string, checkpoint: PortableCheckpoint): RestoreReceipt | undefined {
  const receiptPath = path.join(cwd, restoreReceiptRelativePath(checkpoint));
  if (!fs.existsSync(receiptPath)) return undefined;
  const stat = fs.lstatSync(receiptPath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Checkpoint restore receipt is not a regular file (fail closed): ${receiptPath}`);
  const parsed = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Partial<RestoreReceipt>;
  const raw = {
    schema: parsed.schema,
    version: parsed.version,
    checkpointId: parsed.checkpointId,
    checkpointSha256: parsed.checkpointSha256,
    planId: parsed.planId,
    gitHead: parsed.gitHead,
    stateSha256: parsed.stateSha256,
    interruptedTaskCount: parsed.interruptedTaskCount,
    recordedAt: parsed.recordedAt,
  };
  const expectedReceiptSha = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  if (
    parsed.schema !== 'harness/checkpoint-restore-receipt' ||
    parsed.version !== 1 ||
    parsed.checkpointId !== checkpoint.checkpointId ||
    parsed.checkpointSha256 !== checkpoint.checkpointSha256 ||
    parsed.planId !== checkpoint.cursor.planId ||
    parsed.gitHead !== checkpoint.gitHead ||
    !Number.isInteger(parsed.interruptedTaskCount) ||
    parsed.receiptSha256 !== expectedReceiptSha
  ) {
    throw new Error(`Checkpoint restore receipt is invalid or bound to different input (fail closed): ${receiptPath}`);
  }
  return parsed as RestoreReceipt;
}

function writeRestoreReceipt(cwd: string, checkpoint: PortableCheckpoint, git: string, interruptedTaskCount: number): void {
  const relativePath = restoreReceiptRelativePath(checkpoint);
  const receiptPath = path.join(cwd, relativePath);
  assertSafePath(receiptPath, cwd);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  const raw = {
    schema: 'harness/checkpoint-restore-receipt' as const,
    version: 1 as const,
    checkpointId: checkpoint.checkpointId,
    checkpointSha256: checkpoint.checkpointSha256,
    planId: checkpoint.cursor.planId,
    gitHead: checkpoint.gitHead,
    stateSha256: hashRestoreState(cwd, checkpoint, git),
    interruptedTaskCount,
    recordedAt: new Date().toISOString(),
  };
  const receipt: RestoreReceipt = {
    ...raw,
    receiptSha256: createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
  };
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  let fd: number | undefined;
  try {
    fd = fs.openSync(receiptPath, 'wx', 0o600);
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    fs.fsyncSync(fd);
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
  }
}

function snapshotRestoreState(root: string, cwd: string): RestoreStateSnapshot {
  assertSafePath(root, cwd);
  if (!fs.existsSync(root)) return { root, kind: 'missing' };
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) throw new Error(`Restore state contains a symbolic link: ${path.relative(cwd, root)} (fail closed)`);
  if (stat.isFile()) return { root, kind: 'file', content: fs.readFileSync(root) };
  if (!stat.isDirectory()) throw new Error(`Restore state contains an unsupported filesystem entry: ${path.relative(cwd, root)} (fail closed)`);

  const files: Array<{ relativePath: string; content: Buffer }> = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const fullPath = path.join(directory, name);
      const relativePath = path.join(relativeDirectory, name);
      const childStat = fs.lstatSync(fullPath);
      if (childStat.isSymbolicLink()) throw new Error(`Restore state contains a symbolic link: ${path.relative(cwd, fullPath)} (fail closed)`);
      if (childStat.isDirectory()) walk(fullPath, relativePath);
      else if (childStat.isFile()) files.push({ relativePath, content: fs.readFileSync(fullPath) });
      else throw new Error(`Restore state contains an unsupported filesystem entry: ${path.relative(cwd, fullPath)} (fail closed)`);
    }
  };
  walk(root, '');
  return { root, kind: 'directory', files };
}

function restoreStateSnapshot(snapshot: RestoreStateSnapshot, cwd: string): void {
  assertSafePath(snapshot.root, cwd);
  let rootExists = fs.existsSync(snapshot.root);
  if (!rootExists) {
    try { rootExists = fs.lstatSync(snapshot.root).isSymbolicLink(); } catch { rootExists = false; }
  }
  if (rootExists) {
    fs.rmSync(snapshot.root, { recursive: true, force: true });
  }
  if (snapshot.kind === 'missing') return;
  if (snapshot.kind === 'file') {
    fs.mkdirSync(path.dirname(snapshot.root), { recursive: true });
    if (!snapshot.content) throw new Error(`Restore snapshot is missing file content: ${snapshot.root}`);
    fs.writeFileSync(snapshot.root, snapshot.content);
    return;
  }
  fs.mkdirSync(snapshot.root, { recursive: true });
  for (const file of snapshot.files ?? []) {
    const target = path.join(snapshot.root, file.relativePath);
    assertSafePath(target, cwd);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
}

function isRestoreInternalPath(relPath: string, checkpoint: PortableCheckpoint): boolean {
  return relPath === '.agent/locks/checkpoint-restore.lock'
    || relPath === restoreReceiptRelativePath(checkpoint)
    || relPath.startsWith(`${RESTORE_TRANSACTION_DIR}/`)
    || /^\.agent\/(?:staging|backup)-restore-[^/]+(?:\/|$)/.test(relPath);
}

function parseRestoreTransactionManifest(value: unknown, filePath: string): RestoreTransactionManifest {
  if (!value || typeof value !== 'object') throw new Error(`Checkpoint restore transaction manifest is not an object: ${filePath}`);
  const raw = value as Partial<RestoreTransactionManifest>;
  const phases: readonly RestoreTransactionPhase[] = [
    'PREPARED', 'STAGED', 'BACKUP_COMPLETE', 'PAYLOAD_APPLIED', 'PATCH_APPLIED',
    'JOURNAL_APPLIED', 'QUEUE_APPLIED', 'COMMITTED',
  ];
  if (
    raw.schema !== 'harness/checkpoint-restore-transaction/v1'
    || raw.version !== 1
    || typeof raw.transactionId !== 'string'
    || typeof raw.checkpointId !== 'string'
    || typeof raw.checkpointSha256 !== 'string'
    || typeof raw.planId !== 'string'
    || typeof raw.gitHead !== 'string'
    || typeof raw.gitDiff !== 'string'
    || typeof raw.trackedDeltaAlreadyApplied !== 'boolean'
    || !phases.includes(raw.phase as RestoreTransactionPhase)
    || typeof raw.stagingRelativePath !== 'string'
    || typeof raw.backupRelativePath !== 'string'
    || !Array.isArray(raw.payloadPaths)
    || !raw.payloadPaths.every((entry) => typeof entry === 'string')
    || !Array.isArray(raw.preExistingPayloadPaths)
    || !raw.preExistingPayloadPaths.every((entry) => typeof entry === 'string')
    || !Array.isArray(raw.snapshots)
    || !raw.snapshots.every((entry) => entry && typeof entry === 'object')
    || typeof raw.createdAt !== 'string'
    || typeof raw.updatedAt !== 'string'
  ) {
    throw new Error(`Checkpoint restore transaction manifest is invalid (fail closed): ${filePath}`);
  }
  if (raw.transactionId !== path.basename(filePath, '.json')) {
    throw new Error(`Checkpoint restore transaction manifest identity mismatch (fail closed): ${filePath}`);
  }
  const expectedStaging = `.agent/staging-restore-${raw.transactionId}`;
  const expectedBackup = `.agent/backup-restore-${raw.transactionId}`;
  if (raw.stagingRelativePath !== expectedStaging || raw.backupRelativePath !== expectedBackup) {
    throw new Error(`Checkpoint restore transaction paths are not canonical (fail closed): ${filePath}`);
  }
  const payloadPaths = raw.payloadPaths as readonly string[];
  const preExistingPayloadPaths = raw.preExistingPayloadPaths as readonly string[];
  if (
    new Set(payloadPaths).size !== payloadPaths.length
    || new Set(preExistingPayloadPaths).size !== preExistingPayloadPaths.length
    || preExistingPayloadPaths.some((entry) => !payloadPaths.includes(entry))
    || payloadPaths.some((entry) => hasPathTraversal(entry) || path.isAbsolute(entry))
  ) {
    throw new Error(`Checkpoint restore transaction payload paths are invalid (fail closed): ${filePath}`);
  }
  return raw as RestoreTransactionManifest;
}

function readRestoreTransactionManifests(cwd: string): Array<{ filePath: string; manifest: RestoreTransactionManifest }> {
  const transactionDir = path.join(cwd, RESTORE_TRANSACTION_DIR);
  if (!fs.existsSync(transactionDir)) return [];
  const stat = fs.lstatSync(transactionDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Checkpoint restore transaction directory is invalid (fail closed): ${transactionDir}`);
  return fs.readdirSync(transactionDir).sort().map((name) => {
    if (!name.endsWith('.json')) throw new Error(`Unexpected checkpoint restore transaction artifact (fail closed): ${name}`);
    const filePath = path.join(transactionDir, name);
    const fileStat = fs.lstatSync(filePath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error(`Checkpoint restore transaction manifest is not a regular file (fail closed): ${filePath}`);
    return { filePath, manifest: parseRestoreTransactionManifest(JSON.parse(fs.readFileSync(filePath, 'utf8')), filePath) };
  });
}

function removeRestoreTransactionArtifacts(cwd: string, manifest: RestoreTransactionManifest): void {
  const stagingPath = path.resolve(cwd, manifest.stagingRelativePath);
  const backupPath = path.resolve(cwd, manifest.backupRelativePath);
  assertSafePath(stagingPath, cwd);
  assertSafePath(backupPath, cwd);
  fs.rmSync(stagingPath, { recursive: true, force: true });
  fs.rmSync(backupPath, { recursive: true, force: true });
  fs.rmSync(restoreTransactionManifestPath(cwd, manifest.transactionId), { force: true });
  removeEmptyRestoreTransactionDirectory(cwd);
}

function removeEmptyRestoreTransactionDirectory(cwd: string): void {
  const transactionDir = path.join(cwd, RESTORE_TRANSACTION_DIR);
  if (fs.existsSync(transactionDir) && fs.readdirSync(transactionDir).length === 0) {
    fs.rmdirSync(transactionDir);
  }
}

function restorePayloadFromTransaction(cwd: string, manifest: RestoreTransactionManifest): void {
  const backupPath = path.resolve(cwd, manifest.backupRelativePath);
  const preExisting = new Set(manifest.preExistingPayloadPaths);
  for (const relPath of manifest.payloadPaths) {
    const target = path.resolve(cwd, relPath);
    assertSafePath(target, cwd);
    const backup = path.resolve(backupPath, relPath);
    assertSafePath(backup, cwd);
    if (preExisting.has(relPath)) {
      if (fs.existsSync(backup)) {
        if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(backup, target);
      } else if (!fs.existsSync(target)) {
        throw new Error(`Checkpoint restore cannot prove pre-existing payload survived (fail closed): ${relPath}`);
      }
    } else if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function rollbackRestoreTransaction(cwd: string, manifest: RestoreTransactionManifest): void {
  const git = resolveGitPath();
  if (!git) throw new Error('git is required to recover checkpoint restore transaction');
  const currentDiffRes = spawnSync(git, ['diff', 'HEAD'], { cwd, encoding: 'utf8' });
  if (currentDiffRes.status !== 0) throw new Error(`git diff HEAD failed during checkpoint restore recovery: ${currentDiffRes.stderr}`);
  const currentDiff = currentDiffRes.stdout;
  const expectedPreMutationDiff = manifest.trackedDeltaAlreadyApplied ? manifest.gitDiff : '';
  if (currentDiff === manifest.gitDiff && !manifest.trackedDeltaAlreadyApplied) {
    const reverseRes = spawnSync(git, ['apply', '--reverse'], { cwd, input: manifest.gitDiff });
    if (reverseRes.status !== 0) throw new Error(`Failed to reverse checkpoint restore patch during recovery: ${reverseRes.stderr || 'git apply --reverse failed'}`);
  } else if (currentDiff !== expectedPreMutationDiff) {
    throw new Error('Checkpoint restore recovery found an unknown tracked workspace state (fail closed)');
  }
  restorePayloadFromTransaction(cwd, manifest);
  for (const snapshot of [...manifest.snapshots].reverse()) {
    restoreStateSnapshot(deserializeRestoreSnapshot(snapshot, cwd), cwd);
  }
  removeRestoreTransactionArtifacts(cwd, manifest);
}

function recoverPendingRestoreTransactions(cwd: string, checkpoint: PortableCheckpoint): void {
  for (const { manifest } of readRestoreTransactionManifests(cwd)) {
    if (
      manifest.checkpointId !== checkpoint.checkpointId
      || manifest.checkpointSha256 !== checkpoint.checkpointSha256
      || manifest.planId !== checkpoint.cursor.planId
      || manifest.gitHead !== checkpoint.gitHead
      || manifest.gitDiff !== checkpoint.gitDiff
    ) {
      throw new Error('A pending checkpoint restore transaction is bound to a different checkpoint (fail closed)');
    }
    const receipt = readRestoreReceipt(cwd, checkpoint);
    if (receipt) {
      const git = resolveGitPath();
      if (!git) throw new Error('git is required to finalize checkpoint restore transaction');
      const stateSha = hashRestoreState(cwd, checkpoint, git);
      if (stateSha !== receipt.stateSha256) {
        throw new Error('Checkpoint restore transaction has a receipt but the committed state is not reproducible (fail closed)');
      }
      removeRestoreTransactionArtifacts(cwd, manifest);
      continue;
    }
    if (manifest.phase === 'COMMITTED') {
      throw new Error('Checkpoint restore transaction is marked committed without a receipt (fail closed)');
    }
    rollbackRestoreTransaction(cwd, manifest);
  }
}

export function assertSafePath(targetPath: string, workspaceRoot: string): void {
  const absPath = path.resolve(targetPath);
  const absRoot = path.resolve(workspaceRoot);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(absRoot);
  } catch {
    realRoot = absRoot;
  }
  const isWithin = (candidate: string, root: string): boolean => {
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };

  // Compare lexical paths with path.relative so a sibling such as /repo-2
  // cannot pass a /repo prefix check. The root is separately canonicalized
  // because macOS commonly exposes /var through the /private/var alias.
  if (!isWithin(absPath, absRoot)) {
    throw new Error(`Path escape detected: "${targetPath}" is outside workspace root "${workspaceRoot}" (fail closed)`);
  }

  // Split path into parent components and validate each
  let current = absPath;
  while (current && isWithin(current, absRoot) && current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      const stats = fs.lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Symbolic link component detected in path: "${current}" (fail closed)`);
      }
      
      // Reparse point / junction escape validation
      // Realpath calculation resolves symlinks/junctions; if resolved path goes outside workspace, block it.
      const real = fs.realpathSync.native(current);
      if (!isWithin(real, realRoot)) {
        throw new Error(`Junction/Reparse point escape detected: "${current}" resolves to "${real}" outside workspace (fail closed)`);
      }
    }
    current = path.dirname(current);
  }
}

export function createPortableCheckpoint(
  trigger: CheckpointTrigger,
  cursor: CursorPosition,
  capsule: CapsuleState,
  cwd: string,
  ownedPaths: string[],
): PortableCheckpoint {
  const git = resolveGitPath();
  if (!git) throw new Error('git is required to create a portable checkpoint');

  // 1. Get git HEAD
  const headRes = spawnSync(git, ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (headRes.status !== 0) throw new Error(`git rev-parse HEAD failed: ${headRes.stderr}`);
  const gitHead = headRes.stdout.trim();

  // 2. Get git diff HEAD
  const diffRes = spawnSync(git, ['diff', 'HEAD'], { cwd, encoding: 'utf8' });
  if (diffRes.status !== 0) throw new Error(`git diff HEAD failed: ${diffRes.stderr}`);
  const gitDiff = diffRes.stdout;

  // 3. Scan untracked files
  const untrackedRes = spawnSync(git, ['ls-files', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' });
  if (untrackedRes.status !== 0) throw new Error(`git ls-files failed: ${untrackedRes.stderr}`);
  const untrackedList = untrackedRes.stdout.split('\n').map(x => x.trim()).filter(Boolean);
  const trackedRes = spawnSync(git, ['ls-files'], { cwd, encoding: 'utf8' });
  if (trackedRes.status !== 0) throw new Error(`git ls-files (tracked) failed: ${trackedRes.stderr}`);
  const trackedFiles = new Set(trackedRes.stdout.split('\n').map(x => x.trim()).filter(Boolean).map(x => x.replace(/\\/g, '/')));

  const untrackedFiles: Record<string, string> = {};
  const payloadHashes: Record<string, string> = {};
  let secretsFound = false;

  if (scanForSecrets(gitDiff)) {
    secretsFound = true;
  }

  // Filter and read owned untracked files
  const normOwnedPaths = ownedPaths.map(p => p.replace(/\\/g, '/'));
  for (const relPath of untrackedList) {
    const normPath = relPath.replace(/\\/g, '/');
    
    // Path traversal check
    if (hasPathTraversal(normPath)) {
      throw new Error(`Directory traversal detected in untracked file path: "${relPath}" (fail closed)`);
    }

    const isOwned = normOwnedPaths.length > 0 && normOwnedPaths.some(op => normPath.startsWith(op));
    if (isOwned) {
      const fullPath = path.join(cwd, relPath);
      assertSafePath(fullPath, cwd);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath);
        const base64 = content.toString('base64');
        if (scanForSecrets(content.toString('utf8'))) {
          secretsFound = true;
        }
        untrackedFiles[normPath] = base64;
        payloadHashes[normPath] = createHash('sha256').update(base64).digest('hex');
      }
    }
  }

  // Pack the .agent directory files (excluding logs and large caches)
  const agentDir = path.join(cwd, '.agent');
  if (fs.existsSync(agentDir)) {
    const listFilesRecursive = (dir: string): string[] => {
      const results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat && stat.isDirectory()) {
          results.push(...listFilesRecursive(full));
        } else {
          results.push(full);
        }
      }
      return results;
    };

    const agentFiles = listFilesRecursive(agentDir);
    for (const fullPath of agentFiles) {
      const relPath = path.relative(cwd, fullPath).replace(/\\/g, '/');
      if (relPath.includes('/logs/') || relPath.includes('/artifacts/')) continue;
      // Tracked files are restored by the content-addressed git diff. Packing them
      // again as payload files makes restore copy the already-patched file before
      // `git apply`, so the same diff fails as "patch does not apply". Only pack
      // .agent state that is genuinely untracked; clean tracked state already exists
      // in the destination checkout and dirty tracked state is represented by gitDiff.
      if (trackedFiles.has(relPath)) continue;
      
      assertSafePath(fullPath, cwd);
      if (hasPathTraversal(relPath)) {
        throw new Error(`Directory traversal detected in .agent file path: "${relPath}" (fail closed)`);
      }

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath);
        const base64 = content.toString('base64');
        if (scanForSecrets(content.toString('utf8'))) {
          secretsFound = true;
        }
        untrackedFiles[relPath] = base64;
        payloadHashes[relPath] = createHash('sha256').update(base64).digest('hex');
      }
    }
  }

  if (secretsFound) {
    throw new Error('Secret leakage detected: checkpoint contains sensitive credentials (fail closed)');
  }

  const checkpointId = `ckpt-${Date.now()}-${createHash('sha256').update(JSON.stringify({ cursor, capsule, gitHead })).digest('hex').slice(0, 8)}`;

  const fingerprint = {
    hostname: os.hostname(),
    os: os.platform(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };

  const rawCheckpoint = {
    schema: 'harness/portable-checkpoint' as const,
    version: 3 as const,
    checkpointId,
    trigger,
    cursor,
    capsule,
    gitHead,
    gitDiff,
    untrackedFiles,
    environmentFingerprint: fingerprint,
    payloadHashes,
  };

  const checkpointSha256 = createHash('sha256').update(JSON.stringify(rawCheckpoint)).digest('hex');

  return {
    ...rawCheckpoint,
    checkpointSha256,
  };
}

export function verifyAndRestoreCheckpoint(
  checkpoint: PortableCheckpoint,
  cwd: string,
): RestoreResult {
  const restoreLock = new ActivationLock(path.join(cwd, '.agent', 'locks'));
  let lockToken: string | undefined;
  try {
    lockToken = restoreLock.acquire('checkpoint-restore').token;
  } catch (error: any) {
    return {
      success: false,
      error: `Concurrent checkpoint restore is already in progress (fail closed): ${error?.message || String(error)}`,
      interruptedTaskCount: 0,
    };
  }
  try {
    return verifyAndRestoreCheckpointUnlocked(checkpoint, cwd);
  } finally {
    if (lockToken) {
      try {
        restoreLock.release(lockToken);
      } catch (releaseError) {
        console.error('CRITICAL: Failed to release checkpoint restore lock', releaseError);
      }
    }
  }
}

function verifyAndRestoreCheckpointUnlocked(
  checkpoint: PortableCheckpoint,
  cwd: string,
): RestoreResult {
  const git = resolveGitPath();
  if (!git) throw new Error('git is required to verify and restore checkpoint');

  // A process may die after durable restore mutation begins but before the
  // acknowledgement receipt is committed. Recover that transaction before
  // validating or mutating the caller's workspace again.
  try {
    recoverPendingRestoreTransactions(cwd, checkpoint);
  } catch (recoveryError: any) {
    return {
      success: false,
      error: `Pending checkpoint restore recovery failed: ${recoveryError?.message || String(recoveryError)} (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  // 1. Strict Schema & Version Validation
  if (checkpoint.schema !== 'harness/portable-checkpoint' || checkpoint.version !== 3) {
    return {
      success: false,
      error: `Invalid checkpoint schema or version: got schema="${checkpoint.schema}", version=${checkpoint.version} (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  // 2. Strict checkpointSha256 Integrity Verification
  const rawCheckpointToVerify = {
    schema: checkpoint.schema,
    version: checkpoint.version,
    checkpointId: checkpoint.checkpointId,
    trigger: checkpoint.trigger,
    cursor: checkpoint.cursor,
    capsule: checkpoint.capsule,
    gitHead: checkpoint.gitHead,
    gitDiff: checkpoint.gitDiff,
    untrackedFiles: checkpoint.untrackedFiles,
    environmentFingerprint: checkpoint.environmentFingerprint,
    payloadHashes: checkpoint.payloadHashes,
  };
  const computedCheckpointSha = createHash('sha256').update(JSON.stringify(rawCheckpointToVerify)).digest('hex');
  if (computedCheckpointSha !== checkpoint.checkpointSha256) {
    return {
      success: false,
      error: `Checkpoint manifest hash mismatch: got "${checkpoint.checkpointSha256}", expected "${computedCheckpointSha}" (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  // A checkpoint is portable across machines only when the execution
  // toolchain remains compatible.  Hostname changes are expected and are
  // handled by invalidating host-bound evidence below, but changing the OS or
  // Node runtime can change shell, path, signal, serialization, or verifier
  // behaviour.  Do not let a recomputed-but-stale bundle silently resume.
  const fingerprint = checkpoint.environmentFingerprint;
  if (!fingerprint || typeof fingerprint !== 'object') {
    return {
      success: false,
      error: 'Checkpoint environment fingerprint is missing (fail closed)',
      interruptedTaskCount: 0,
    };
  }
  if (fingerprint.os !== os.platform() || fingerprint.nodeVersion !== process.version) {
    return {
      success: false,
      error: `Changed toolchain: checkpoint uses os="${fingerprint.os}", node="${fingerprint.nodeVersion}" but resume uses os="${os.platform()}", node="${process.version}" (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  // 3. Wrong base validation (git HEAD check)
  const headRes = spawnSync(git, ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (headRes.status !== 0) throw new Error(`git rev-parse HEAD failed: ${headRes.stderr}`);
  const currentHead = headRes.stdout.trim();
  if (currentHead !== checkpoint.gitHead) {
    return {
      success: false,
      error: `Wrong base commit: checkpoint gitHead is "${checkpoint.gitHead}", but current HEAD is "${currentHead}" (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  // 4. Secrets, Path Traversal & Tamper check on all payloads
  let secretsFound = scanForSecrets(checkpoint.gitDiff);
  const normalizedPaths = new Set<string>();

  for (const [relPath, base64] of Object.entries(checkpoint.untrackedFiles)) {
    const normPath = relPath.replace(/\\/g, '/');

    // Case-collision and duplicate detection
    const lowerPath = normPath.toLowerCase();
    if (normalizedPaths.has(lowerPath)) {
      return {
        success: false,
        error: `Case-collision or duplicate file path detected in checkpoint: "${relPath}" (fail closed)`,
        interruptedTaskCount: 0,
      };
    }
    normalizedPaths.add(lowerPath);

    // Path traversal / absolute path / escape check
    if (hasPathTraversal(normPath)) {
      return {
        success: false,
        error: `Directory traversal or absolute path escape detected in checkpoint path: "${relPath}" (fail closed)`,
        interruptedTaskCount: 0,
      };
    }

    try {
      assertSafePath(path.join(cwd, relPath), cwd);
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
        interruptedTaskCount: 0,
      };
    }

    // Tamper & Partial bundle validation
    const expectedHash = checkpoint.payloadHashes[relPath];
    if (!expectedHash) {
      return {
        success: false,
        error: `Partial bundle: file hash missing in payloadHashes for "${relPath}" (fail closed)`,
        interruptedTaskCount: 0,
      };
    }
    const computedHash = createHash('sha256').update(base64).digest('hex');
    if (computedHash !== expectedHash) {
      return {
        success: false,
        error: `Tamper detected: file hash mismatch for "${relPath}" (fail closed)`,
        interruptedTaskCount: 0,
      };
    }
    const content = Buffer.from(base64, 'base64').toString('utf8');
    if (scanForSecrets(content)) {
      secretsFound = true;
    }
  }

  // Reject hashes for files that are not in the payload.  Ignoring an extra
  // hash would make a malformed/partial bundle appear valid to callers that
  // inspect the manifest independently.
  for (const relPath of Object.keys(checkpoint.payloadHashes)) {
    if (checkpoint.untrackedFiles[relPath] === undefined) {
      return {
        success: false,
        error: `Payload hash has no corresponding file for "${relPath}" (fail closed)`,
        interruptedTaskCount: 0,
      };
    }
  }

  if (secretsFound) {
    return {
      success: false,
      error: `Secret inclusion detected: checkpoint contains sensitive credentials (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  const receiptRelativePath = restoreReceiptRelativePath(checkpoint);
  const restoreLockRelativePath = '.agent/locks/checkpoint-restore.lock';
  let currentTrackedDiff: string | undefined;
  const currentDiffRes = spawnSync(git, ['diff', 'HEAD'], { cwd, encoding: 'utf8' });
  if (currentDiffRes.status !== 0) throw new Error(`git diff HEAD failed: ${currentDiffRes.stderr}`);
  currentTrackedDiff = currentDiffRes.stdout;

  // A completed restore may be retried after an acknowledgement boundary. The
  // receipt is valid only when the observable post-restore state is unchanged;
  // a forged/stale receipt therefore cannot turn a different workspace green.
  try {
    const receipt = readRestoreReceipt(cwd, checkpoint);
    if (receipt) {
      const stateSha = hashRestoreState(cwd, checkpoint, git);
      if (stateSha !== receipt.stateSha256) {
        return {
          success: false,
          error: `Checkpoint restore receipt exists but the post-restore workspace state changed (fail closed): expected ${receipt.stateSha256}, observed ${stateSha}`,
          interruptedTaskCount: 0,
        };
      }
      return { success: true, interruptedTaskCount: 0 };
    }
  } catch (receiptError: any) {
    return {
      success: false,
      error: `Checkpoint restore receipt validation failed: ${receiptError?.message || String(receiptError)}`,
      interruptedTaskCount: 0,
    };
  }

  // 5. Ambiguous dirty files validation
  const statusRes = spawnSync(git, ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  if (statusRes.status !== 0) throw new Error(`git status failed: ${statusRes.stderr}`);
  const dirtyLines = statusRes.stdout.split('\n').map(x => x.trim()).filter(Boolean);
  if (dirtyLines.length > 0) {
    for (const line of dirtyLines) {
      const relPath = line.slice(2).trim().replace(/\\/g, '/');

      // If the file is uncommitted and not registered in gitDiff/untrackedFiles, reject
      const isTrackedDiff = checkpoint.gitDiff.includes(relPath);
      const isUntrackedInCkpt = checkpoint.untrackedFiles[relPath] !== undefined;
      const isRestoreReceipt = relPath === receiptRelativePath;
      const isRestoreLock = relPath === restoreLockRelativePath;
      if (!isTrackedDiff && !isUntrackedInCkpt && !isRestoreReceipt && !isRestoreLock) {
        return {
          success: false,
          error: `Ambiguous dirty files: target workspace has uncommitted changes in "${relPath}" which are not registered in the checkpoint (fail closed)`,
          interruptedTaskCount: 0,
        };
      }
    }
  }

  const trackedDeltaAlreadyApplied = currentTrackedDiff === checkpoint.gitDiff;
  if (
    currentTrackedDiff &&
    currentTrackedDiff.length > 0 &&
    !trackedDeltaAlreadyApplied
  ) {
    return {
      success: false,
      error: 'Target workspace has a tracked delta that differs from the checkpoint delta (fail closed)',
      interruptedTaskCount: 0,
    };
  }

  // 6. Transaction Stage: Write files to staging directory first
  const transactionId = randomUUID();
  const stagingDir = path.join(cwd, '.agent', `staging-restore-${transactionId}`);
  const backupDir = path.join(cwd, '.agent', `backup-restore-${transactionId}`);
  const payloadPaths = Object.keys(checkpoint.untrackedFiles).sort();
  const filesToBackup = payloadPaths.filter((relPath) => fs.existsSync(path.join(cwd, relPath)));
  const createdRestorePaths: string[] = [];
  let trackedPatchApplied = false;
  const agentDir = path.join(cwd, '.agent');
  const journalPath = path.join(agentDir, 'plans', checkpoint.cursor.planId, 'journal.jsonl');
  const queueActiveDir = path.join(agentDir, 'plans', checkpoint.cursor.planId, 'queue', 'active');
  const queueInterruptedDir = path.join(agentDir, 'plans', checkpoint.cursor.planId, 'queue', 'interrupted');
  const postRestoreSnapshots: RestoreStateSnapshot[] = [];

  try {
    for (const root of [journalPath, queueActiveDir, queueInterruptedDir, path.join(cwd, receiptRelativePath)]) {
      postRestoreSnapshots.push(snapshotRestoreState(root, cwd));
    }
  } catch (snapshotError: any) {
    return {
      success: false,
      error: `Restore state could not be snapshotted before mutation (fail closed): ${snapshotError?.message || String(snapshotError)}`,
      interruptedTaskCount: 0,
    };
  }

  const transactionManifestPath = restoreTransactionManifestPath(cwd, transactionId);
  let transactionManifest: RestoreTransactionManifest = {
    schema: 'harness/checkpoint-restore-transaction/v1',
    version: 1,
    transactionId,
    checkpointId: checkpoint.checkpointId,
    checkpointSha256: checkpoint.checkpointSha256,
    planId: checkpoint.cursor.planId,
    gitHead: checkpoint.gitHead,
    gitDiff: checkpoint.gitDiff,
    trackedDeltaAlreadyApplied,
    phase: 'PREPARED',
    stagingRelativePath: path.relative(cwd, stagingDir).replace(/\\/g, '/'),
    backupRelativePath: path.relative(cwd, backupDir).replace(/\\/g, '/'),
    payloadPaths,
    preExistingPayloadPaths: filesToBackup,
    snapshots: postRestoreSnapshots.map((snapshot) => serializeRestoreSnapshot(snapshot, cwd)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    durableWriteJson(transactionManifestPath, transactionManifest);
    maybeCrashDuringRestoreForTest('after-prepared');
  } catch (manifestError: any) {
    return {
      success: false,
      error: `Restore transaction manifest could not be committed (fail closed): ${manifestError?.message || String(manifestError)}`,
      interruptedTaskCount: 0,
    };
  }

  const advanceTransaction = (phase: RestoreTransactionPhase): void => {
    transactionManifest = {
      ...transactionManifest,
      phase,
      updatedAt: new Date().toISOString(),
    };
    durableWriteJson(transactionManifestPath, transactionManifest);
    maybeCrashDuringRestoreForTest(phase === 'COMMITTED' ? 'after-receipt' : phase);
  };

  const rollbackPayloadMutation = (): void => {
    if (trackedPatchApplied) {
      const reverseRes = spawnSync(git, ['apply', '--reverse'], { cwd, input: checkpoint.gitDiff });
      if (reverseRes.status !== 0) {
        throw new Error(`Failed to reverse applied git diff during rollback: ${reverseRes.stderr || 'git apply --reverse failed'}`);
      }
      trackedPatchApplied = false;
    }
    for (const createdPath of [...createdRestorePaths].sort((left, right) => right.length - left.length)) {
      if (fs.existsSync(createdPath)) fs.rmSync(createdPath, { recursive: true, force: true });
    }
    for (const relPath of filesToBackup) {
      const source = path.join(backupDir, relPath);
      const dest = path.join(cwd, relPath);
      if (fs.existsSync(source)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        fs.renameSync(source, dest);
      }
    }
  };

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    // Write all untracked files to staging
    for (const [relPath, base64] of Object.entries(checkpoint.untrackedFiles)) {
      const realPath = path.join(cwd, relPath);
      assertSafePath(realPath, cwd);
      
      const stagePath = path.join(stagingDir, relPath);
      fs.mkdirSync(path.dirname(stagePath), { recursive: true });
      fs.writeFileSync(stagePath, Buffer.from(base64, 'base64'));
      
    }
    advanceTransaction('STAGED');

    // Try applying git diff as dry-run check. A prior interrupted restore may
    // have committed this exact working-tree delta; do not replay it.
    if (checkpoint.gitDiff.trim() && !trackedDeltaAlreadyApplied) {
      const dryApplyRes = spawnSync(git, ['apply', '--check'], { cwd, input: checkpoint.gitDiff });
      if (dryApplyRes.status !== 0) {
        throw new Error(`Failed to apply git diff dry-run check: ${dryApplyRes.stderr || 'git apply --check failed'} (fail closed)`);
      }
    }

    // --- TRANSACTION ATOMIC SWAP ---
    // Create backup directory
    fs.mkdirSync(backupDir, { recursive: true });
    
    // Backup existing files to be replaced
    for (const relPath of filesToBackup) {
      const source = path.join(cwd, relPath);
      const dest = path.join(backupDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(source, dest);
    }
    advanceTransaction('BACKUP_COMPLETE');

    // Copy files from staging to target
    const copyRecursiveSync = (src: string, dest: string) => {
      const exists = fs.existsSync(src);
      const stats = exists && fs.statSync(src);
      const isDirectory = exists && stats && stats.isDirectory();
      assertSafePath(dest, cwd);
      if (isDirectory) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
          createdRestorePaths.push(dest);
        }
        fs.readdirSync(src).forEach((childItemName) => {
          copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
      } else {
        if (!fs.existsSync(dest)) createdRestorePaths.push(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    };

    copyRecursiveSync(stagingDir, cwd);
    advanceTransaction('PAYLOAD_APPLIED');

    // Apply git diff actual patch
    if (checkpoint.gitDiff.trim() && !trackedDeltaAlreadyApplied) {
      const applyRes = spawnSync(git, ['apply'], { cwd, input: checkpoint.gitDiff });
      if (applyRes.status !== 0) {
        throw new Error(`Failed to apply git diff actual patch: ${applyRes.stderr || 'git apply failed'}`);
      }
      trackedPatchApplied = true;
    }
    advanceTransaction('PATCH_APPLIED');

    // Clean staging
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch (transactionErr) {
    // --- TRANSACTION ROLLBACK ---
    try {
      rollbackPayloadMutation();
    } catch (rollbackErr) {
      console.error('CRITICAL: Rollback failed during checkpoint restore!', rollbackErr);
    }

    // Clean temp dirs
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.rmSync(transactionManifestPath, { force: true });
    removeEmptyRestoreTransactionDirectory(cwd);

    return {
      success: false,
      error: `Restore transaction aborted and rolled back. Details: ${transactionErr instanceof Error ? transactionErr.message : String(transactionErr)} (fail closed)`,
      interruptedTaskCount: 0,
    };
  }

  let interruptedTaskCount = 0;
  try {
    // 7. Invalidate machine-bound evidence
    if (fs.existsSync(journalPath)) {
      const lines = fs.readFileSync(journalPath, 'utf8').split('\n').filter(Boolean);
      const updatedLines: string[] = [];
      const currentHostname = os.hostname();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.host && event.host !== currentHostname) {
            event.host = 'invalidated-cross-machine-host';
            event.evidence = [];
          }
          updatedLines.push(JSON.stringify(event));
        } catch {
          updatedLines.push(line);
        }
      }
      fs.writeFileSync(journalPath, updatedLines.join('\n') + '\n');
    }
    advanceTransaction('JOURNAL_APPLIED');

    // 8. Convert orphaned RUNNING / active tasks to INTERRUPTED
    fs.mkdirSync(queueInterruptedDir, { recursive: true });

    if (fs.existsSync(queueActiveDir)) {
      const activeFiles = fs.readdirSync(queueActiveDir).filter(f => f.endsWith('.json'));
      for (const file of activeFiles) {
        const activePath = path.join(queueActiveDir, file);
        try {
          const task = JSON.parse(fs.readFileSync(activePath, 'utf8'));
          task.claimedAt = undefined;
          task.reason = 'INTERRUPTED';
          const targetPath = path.join(queueInterruptedDir, file);
          fs.writeFileSync(targetPath, JSON.stringify(task, null, 2) + '\n');
          fs.rmSync(activePath, { force: true });
          interruptedTaskCount++;
        } catch { /* ignore malformed individual task; preserve fail-closed transaction boundary */ }
      }
    }
    advanceTransaction('QUEUE_APPLIED');
  } catch (postStateError: any) {
    try {
      rollbackPayloadMutation();
      for (const snapshot of [...postRestoreSnapshots].reverse()) restoreStateSnapshot(snapshot, cwd);
    } catch (rollbackError) {
      console.error('CRITICAL: Post-state rollback failed during checkpoint restore!', rollbackError);
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.rmSync(transactionManifestPath, { force: true });
    removeEmptyRestoreTransactionDirectory(cwd);
    return {
      success: false,
      error: `Restore post-state transaction aborted and rolled back (fail closed): ${postStateError?.message || String(postStateError)}`,
      interruptedTaskCount: 0,
    };
  }

  try {
    writeRestoreReceipt(cwd, checkpoint, git, interruptedTaskCount);
    advanceTransaction('COMMITTED');
  } catch (postRestoreError: any) {
    try {
      rollbackPayloadMutation();
      for (const snapshot of [...postRestoreSnapshots].reverse()) restoreStateSnapshot(snapshot, cwd);
    } catch (rollbackError) {
      console.error('CRITICAL: Post-restore rollback failed during checkpoint restore!', rollbackError);
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.rmSync(transactionManifestPath, { force: true });
    removeEmptyRestoreTransactionDirectory(cwd);
    return {
      success: false,
      error: `Restore post-state transaction aborted and rolled back (fail closed): ${postRestoreError?.message || String(postRestoreError)}`,
      interruptedTaskCount: 0,
    };
  }

  // Clean backup dir only after the post-restore receipt has committed.
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.rmSync(transactionManifestPath, { force: true });
  removeEmptyRestoreTransactionDirectory(cwd);

  return {
    success: true,
    interruptedTaskCount,
  };
}
