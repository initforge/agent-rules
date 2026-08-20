import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { readCurrentPointer, commitCurrentPointer, type CurrentPointer } from './current-pointer.js';
import { ActivationLock } from '../secure-fs.js';

export interface WorkerTaskRecipe {
  readonly taskId: string;
  readonly requirementId: string;
  readonly prompt: string;
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly verification: readonly string[];
  /** Strong-planner lineage required by the structured amendment path. */
  readonly anchors?: readonly string[];
  readonly invariants?: readonly string[];
  readonly acceptance?: readonly string[];
  readonly proof?: readonly string[];
  readonly rollback?: readonly string[];
  readonly stopConditions?: readonly string[];
}

export interface StrongPlannerRevisionImpactPlan {
  readonly schema: 'harness/revision-impact-plan';
  readonly version: 1;
  readonly amendmentId: string;
  readonly planId: string;
  readonly rawIntent: string;
  readonly targetRevision: string;
  readonly targetTaskIds: readonly string[];
  readonly invalidatedTaskIds: readonly string[];
  readonly invalidatedCompletedTaskIds: readonly string[];
  readonly unaffectedTaskIds: readonly string[];
  readonly supersededTaskMap: Record<string, string>;
  readonly newTasks: readonly WorkerTaskRecipe[];
  /** Planner-provided dependency closure; the kernel checks it for consistency. */
  readonly dependencyClosure: Record<string, readonly string[]>;
  readonly planner: {
    readonly role: 'strong-planner';
    readonly receiptPath: string;
    readonly receiptSha256: string;
    readonly contractPath: string;
    readonly contractSha256: string;
    readonly decisions: readonly string[];
    readonly unresolved: readonly string[];
  };
}

export interface RevisionImpactPlan {
  readonly amendmentId: string;
  readonly planId: string;
  readonly targetRevision: string;
  readonly unaffectedTaskIds: readonly string[];
  readonly invalidatedTaskIds: readonly string[];
  /** Completed work that is affected and must lose terminal acceptance lineage. */
  readonly invalidatedCompletedTaskIds: readonly string[];
  readonly supersededTaskMap: Record<string, string>; // oldTaskId -> newTaskId
  readonly newTasks: readonly WorkerTaskRecipe[];
  readonly planSha256: string;
  readonly status: 'READY' | 'NEEDS_USER' | 'BLOCKED';
  readonly failureReason?: string;
  /** Explicitly identifies the legacy compatibility compiler versus the real planner path. */
  readonly plannerMode?: 'strong-planner' | 'legacy-compatibility';
  readonly rawIntent?: string;
  readonly plannerProof?: {
    readonly receiptPath: string;
    readonly receiptSha256: string;
    readonly contractPath: string;
    readonly contractSha256: string;
    readonly decisions: readonly string[];
  };
}

export interface AmendmentRequest {
  readonly schema: 'harness/amendment-request';
  readonly version: 3;
  readonly amendmentId: string;
  readonly intent: string;
  readonly createdAt: string;
  readonly state: 'PENDING' | 'PLANNING' | 'ACTIVATED' | 'REJECTED';
  readonly sha256: string;
  readonly activation?: {
    readonly targetRevision: string;
    readonly impactPlanSha256: string;
    readonly activatedAt: string;
  };
}

const SHA256_RE = /^[a-f0-9]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownFields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown field(s): ${unknown.join(', ')}`);
}

function parseStringList(value: unknown, label: string, nonEmpty = false): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string') || (nonEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${nonEmpty ? 'a non-empty' : 'a'} string[]`);
  }
  return [...value] as string[];
}

function parseHash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) throw new Error(`${label} must be a SHA-256 hex string`);
  return value;
}

function parseRecipe(value: unknown, index: number): WorkerTaskRecipe {
  if (!isRecord(value)) throw new Error(`newTasks[${index}] must be an object`);
  assertKnownFields(value, ['taskId', 'requirementId', 'prompt', 'ownedPaths', 'forbiddenPaths', 'verification', 'anchors', 'invariants', 'acceptance', 'proof', 'rollback', 'stopConditions'], `newTasks[${index}]`);
  for (const key of ['taskId', 'requirementId', 'prompt'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`newTasks[${index}].${key} must be non-empty`);
  }
  const recipe: WorkerTaskRecipe = {
    taskId: value.taskId as string,
    requirementId: value.requirementId as string,
    prompt: value.prompt as string,
    ownedPaths: parseStringList(value.ownedPaths, `newTasks[${index}].ownedPaths`),
    forbiddenPaths: parseStringList(value.forbiddenPaths, `newTasks[${index}].forbiddenPaths`),
    verification: parseStringList(value.verification, `newTasks[${index}].verification`, true),
  };
  for (const key of ['anchors', 'invariants', 'acceptance', 'proof', 'rollback', 'stopConditions'] as const) {
    if (value[key] !== undefined) (recipe as any)[key] = parseStringList(value[key], `newTasks[${index}].${key}`, true);
  }
  for (const key of ['anchors', 'invariants', 'acceptance', 'proof', 'rollback', 'stopConditions'] as const) {
    if (!Array.isArray((recipe as any)[key]) || (recipe as any)[key].length === 0) {
      throw new Error(`newTasks[${index}].${key} must be present and non-empty for a strong-planner recipe`);
    }
  }
  return recipe;
}

function parseDependencyClosure(value: unknown): Record<string, readonly string[]> {
  if (!isRecord(value)) throw new Error('dependencyClosure must be an object');
  const result: Record<string, readonly string[]> = {};
  for (const [key, entries] of Object.entries(value)) result[key] = parseStringList(entries, `dependencyClosure.${key}`, true);
  return result;
}

/**
 * Parse the only accepted structured output for a production amendment.
 * Raw prose is intentionally not interpreted here; the strong planner must
 * provide explicit impact, lineage, recipes, decisions and proof pointers.
 */
export function parseStrongPlannerRevisionImpactPlan(value: unknown): StrongPlannerRevisionImpactPlan {
  if (!isRecord(value)) throw new Error('revision impact plan must be an object');
  assertKnownFields(value, ['schema', 'version', 'amendmentId', 'planId', 'rawIntent', 'targetRevision', 'targetTaskIds', 'invalidatedTaskIds', 'invalidatedCompletedTaskIds', 'unaffectedTaskIds', 'supersededTaskMap', 'newTasks', 'dependencyClosure', 'planner'], 'revision impact plan');
  if (value.schema !== 'harness/revision-impact-plan' || value.version !== 1) throw new Error('revision impact plan schema/version is unsupported');
  for (const key of ['amendmentId', 'planId', 'rawIntent', 'targetRevision'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`revision impact plan ${key} must be non-empty`);
  }
  const taskLists = {
    targetTaskIds: parseStringList(value.targetTaskIds, 'targetTaskIds', true),
    invalidatedTaskIds: parseStringList(value.invalidatedTaskIds, 'invalidatedTaskIds', true),
    invalidatedCompletedTaskIds: parseStringList(value.invalidatedCompletedTaskIds, 'invalidatedCompletedTaskIds'),
    unaffectedTaskIds: parseStringList(value.unaffectedTaskIds, 'unaffectedTaskIds'),
  };
  if (!isRecord(value.supersededTaskMap)) throw new Error('supersededTaskMap must be an object');
  const supersededTaskMap: Record<string, string> = {};
  for (const [oldId, replacement] of Object.entries(value.supersededTaskMap)) {
    if (typeof replacement !== 'string' || !replacement.trim()) throw new Error(`supersededTaskMap.${oldId} must be a non-empty string`);
    supersededTaskMap[oldId] = replacement;
  }
  if (!Array.isArray(value.newTasks) || value.newTasks.length === 0) throw new Error('newTasks must be non-empty');
  if (!isRecord(value.planner)) throw new Error('planner proof is required');
  assertKnownFields(value.planner, ['role', 'receiptPath', 'receiptSha256', 'contractPath', 'contractSha256', 'decisions', 'unresolved'], 'planner');
  if (value.planner.role !== 'strong-planner') throw new Error('planner.role must be strong-planner');
  for (const key of ['receiptPath', 'contractPath'] as const) {
    if (typeof value.planner[key] !== 'string' || !value.planner[key] || path.isAbsolute(value.planner[key]) || value.planner[key].split(/[\\/]/).includes('..')) {
      throw new Error(`planner.${key} must be a relative non-traversing path`);
    }
  }
  const decisions = parseStringList(value.planner.decisions, 'planner.decisions', true);
  const unresolved = parseStringList(value.planner.unresolved, 'planner.unresolved');
  if (unresolved.length > 0) throw new Error(`planner has unresolved items: ${unresolved.join('; ')}`);
  return {
    schema: 'harness/revision-impact-plan',
    version: 1,
    amendmentId: value.amendmentId as string,
    planId: value.planId as string,
    rawIntent: value.rawIntent as string,
    targetRevision: value.targetRevision as string,
    ...taskLists,
    supersededTaskMap,
    newTasks: value.newTasks.map(parseRecipe),
    dependencyClosure: parseDependencyClosure(value.dependencyClosure),
    planner: {
      role: 'strong-planner',
      receiptPath: value.planner.receiptPath as string,
      receiptSha256: parseHash(value.planner.receiptSha256, 'planner.receiptSha256'),
      contractPath: value.planner.contractPath as string,
      contractSha256: parseHash(value.planner.contractSha256, 'planner.contractSha256'),
      decisions,
      unresolved,
    },
  };
}

function processStillRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  // Windows Node does not expose a reliable POSIX-style signal-0 probe.  Use
  // the native process table first so a worker that ignores SIGINT cannot be
  // mistaken for an exited process and granted external-effect authority.
  if (process.platform === 'win32') {
    for (const command of ['pwsh', 'powershell']) {
      try {
        const result = spawnSync(command, [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Id`,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        if (result.status !== 0) continue;
        const ids = result.stdout.trim().split(/\s+/).filter(Boolean);
        return ids.includes(String(pid));
      } catch {
        // Fall through to the conservative Node probe if PowerShell is absent.
      }
    }
  }

  try {
    process.kill(pid, 0);
    // On POSIX a child that handled cooperative cancellation can remain a
    // zombie until its parent reaps it.  kill(pid, 0) still succeeds for that
    // interval, but the worker is no longer executing and has no side effect
    // authority.  Treat only the explicit Linux zombie state as exited; an
    // unknown or unsupported process state remains conservatively alive.
    if (process.platform === 'linux') {
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const closingParen = stat.lastIndexOf(')');
        const state = closingParen >= 0 ? stat.slice(closingParen + 2, closingParen + 3) : '';
        if (state === 'Z') return false;
      } catch {
        // If procfs is unavailable, retain the conservative kill(pid, 0) result.
      }
    } else if (process.platform === 'darwin') {
      // macOS has no procfs. A cooperatively cancelled child can remain a
      // zombie until the event loop reaps it, so inspect the process state
      // directly before treating it as an uncertain live side effect.
      try {
        const ps = spawnSync('ps', ['-o', 'state=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (ps.status === 0 && /^\s*Z/.test(ps.stdout)) return false;
      } catch {
        // If ps is unavailable, retain the conservative kill(pid, 0) result.
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function createAmendmentRequest(
  planId: string,
  intent: string,
  cwd: string,
): AmendmentRequest {
  const hash = createHash('sha256').update(intent).digest('hex');
  const amendmentId = `amend-${hash.slice(0, 8)}`;
  const request: AmendmentRequest = {
    schema: 'harness/amendment-request',
    version: 3,
    amendmentId,
    intent,
    createdAt: new Date().toISOString(),
    state: 'PENDING',
    sha256: hash,
  };

  const planDir = path.join(cwd, '.agent', 'plans', planId);
  const amendDir = path.join(planDir, 'amendments', amendmentId);
  fs.mkdirSync(amendDir, { recursive: true });

  // Persist amendment JSON in amendments index directory
  const indexAmendDir = path.join(planDir, 'amendments');
  fs.mkdirSync(indexAmendDir, { recursive: true });
  const targetPath = path.join(indexAmendDir, `${amendmentId}.json`);

  const readPersisted = (): AmendmentRequest => {
    let existing: unknown;
    try {
      existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot reuse amendment ${amendmentId}: persisted request is invalid (${String(error)})`);
    }
    if (!existing || typeof existing !== 'object') {
      throw new Error(`Cannot reuse amendment ${amendmentId}: persisted request is not an object`);
    }
    const record = existing as Partial<AmendmentRequest>;
    if (
      record.schema !== 'harness/amendment-request' ||
      record.version !== 3 ||
      record.sha256 !== hash ||
      record.intent !== intent ||
      record.amendmentId !== amendmentId
    ) {
      throw new Error(`Cannot reuse amendment ${amendmentId}: content-addressed request drift detected (fail closed)`);
    }
    const rawIntentPath = path.join(amendDir, 'raw-intent.md');
    let rawIntentStat: fs.Stats;
    try {
      rawIntentStat = fs.lstatSync(rawIntentPath);
    } catch {
      throw new Error(`Cannot reuse amendment ${amendmentId}: raw intent receipt drift detected (fail closed)`);
    }
    if (
      rawIntentStat.isSymbolicLink() ||
      !rawIntentStat.isFile() ||
      fs.readFileSync(rawIntentPath, 'utf8') !== `${intent}\n`
    ) {
      throw new Error(`Cannot reuse amendment ${amendmentId}: raw intent receipt drift detected (fail closed)`);
    }
    return record as AmendmentRequest;
  };

  const writeExclusive = (filePath: string, content: string): void => {
    let fd: number | undefined;
    try {
      fd = fs.openSync(filePath, 'wx', 0o600);
      const bytes = Buffer.from(content, 'utf8');
      fs.writeSync(fd, bytes, 0, bytes.length, 0);
      fs.fsyncSync(fd);
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        try { if (fd !== undefined) fs.closeSync(fd); } catch {}
        try { fs.rmSync(filePath, { force: true }); } catch {}
      }
      throw error;
    } finally {
      try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    }
  };

  // Both receipts are created with exclusive creates. Two simultaneous
  // deliveries therefore converge on one immutable content-addressed record.
  const rawIntentPath = path.join(amendDir, 'raw-intent.md');
  if (!fs.existsSync(rawIntentPath)) {
    try {
      writeExclusive(rawIntentPath, `${intent}\n`);
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }

  // An attacker/racing delivery may have created the receipt between the
  // existence check and the exclusive create. Validate it on every path,
  // including the first delivery where the JSON index does not exist yet.
  let rawIntentStat: fs.Stats;
  try {
    rawIntentStat = fs.lstatSync(rawIntentPath);
  } catch {
    throw new Error(`Cannot persist amendment ${amendmentId}: raw intent receipt is missing (fail closed)`);
  }
  if (
    rawIntentStat.isSymbolicLink() ||
    !rawIntentStat.isFile() ||
    fs.readFileSync(rawIntentPath, 'utf8') !== `${intent}\n`
  ) {
    throw new Error(`Cannot persist amendment ${amendmentId}: raw intent receipt drift detected (fail closed)`);
  }

  // Delivery may be retried after an acknowledgement/activation boundary.  The
  // amendment ID is content-addressed, so the existing request is the durable
  // source of truth.  Never reset an activated request back to PENDING and
  // never silently accept a colliding or tampered record.
  if (fs.existsSync(targetPath)) {
    let targetStat: fs.Stats;
    try {
      targetStat = fs.lstatSync(targetPath);
    } catch {
      throw new Error(`Cannot reuse amendment ${amendmentId}: persisted request is unavailable (fail closed)`);
    }
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`Cannot reuse amendment ${amendmentId}: persisted request is not a regular file (fail closed)`);
    }
    return readPersisted();
  }

  // Persist the request only on first delivery. If another process wins the
  // exclusive create between the existence check and this write, validate and
  // reuse its immutable record.
  try {
    writeExclusive(targetPath, JSON.stringify(request, null, 2) + '\n');
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
    return readPersisted();
  }

  return request;
}

export function compileRevisionImpactPlan(
  planId: string,
  amendment: AmendmentRequest,
  currentTaskIds: string[],
  activeTasks: string[],
  completedTasks: string[],
  currentRevision: string,
  taskDependencies?: Record<string, string[]>,
  cwd: string = '.',
): RevisionImpactPlan {
  const revNum = parseInt(currentRevision.replace(/[^0-9]/g, '') || '1', 10);
  const targetRevision = `ledger-v${revNum + 1}`;

  const intentLower = amendment.intent.toLowerCase().trim();
  if (intentLower.length < 5) {
    return {
      amendmentId: amendment.amendmentId,
      planId,
      targetRevision,
      unaffectedTaskIds: currentTaskIds,
      invalidatedTaskIds: [],
      invalidatedCompletedTaskIds: [],
      supersededTaskMap: {},
      newTasks: [],
      planSha256: '',
      status: 'NEEDS_USER',
      failureReason: 'Intent is too short or empty (fail closed)',
    };
  }

  // 1. Load canonical plan spec (original.md/contract.yaml) if available
  // The immutable original remains the lineage anchor, but once a reviewed
  // contract exists it is the executable task graph.  Falling back to the
  // original keeps legacy/test plans compatible without silently ignoring the
  // active reviewed projection.
  const reviewedContractFile = path.join(cwd, '.agent', 'plans', planId, 'contract.yaml');
  const planFile = fs.existsSync(reviewedContractFile)
    ? reviewedContractFile
    : path.join(cwd, '.agent', 'plans', planId, 'original.md');
  let planYaml: any = null;
  if (fs.existsSync(planFile)) {
    try {
      const originalContent = fs.readFileSync(planFile, 'utf8');
      planYaml = YAML.parse(originalContent);
    } catch (err: any) {
      return {
        amendmentId: amendment.amendmentId,
        planId,
        targetRevision,
        unaffectedTaskIds: currentTaskIds,
        invalidatedTaskIds: [],
        invalidatedCompletedTaskIds: [],
        supersededTaskMap: {},
        newTasks: [],
        planSha256: '',
        status: 'BLOCKED',
        failureReason: `Failed to parse canonical plan YAML: ${err.message} (fail closed)`,
      };
    }
  }

  // 2. Identify target task/requirement to amend (Language independent extraction)
  let targetTaskId = '';
  let targetRequirementId = '';

  const reqMatch = amendment.intent.match(/REQ-[0-9]{3}/i);
  const taskMatch = amendment.intent.match(/T-[0-9]{3}/i);
  const genericTaskMatch = amendment.intent.match(/task-[a-zA-Z0-9_-]+/i);

  if (reqMatch) {
    targetRequirementId = reqMatch[0].toUpperCase();
    if (planYaml && Array.isArray(planYaml.tasks)) {
      const matchedTask = planYaml.tasks.find((t: any) => 
        Array.isArray(t.requirements) && t.requirements.includes(targetRequirementId)
      );
      if (matchedTask) {
        targetTaskId = matchedTask.id;
      }
    }
    if (!targetTaskId && genericTaskMatch) {
      targetTaskId = genericTaskMatch[0];
    } else if (!targetTaskId && taskMatch) {
      targetTaskId = taskMatch[0].toUpperCase();
    }
  } else {
    if (genericTaskMatch) {
      targetTaskId = genericTaskMatch[0];
    } else if (taskMatch) {
      targetTaskId = taskMatch[0].toUpperCase();
    }
  }

  // If no target ID could be resolved, return NEEDS_USER
  if (!targetTaskId) {
    return {
      amendmentId: amendment.amendmentId,
      planId,
      targetRevision,
      unaffectedTaskIds: currentTaskIds,
      invalidatedTaskIds: [],
      invalidatedCompletedTaskIds: [],
      supersededTaskMap: {},
      newTasks: [],
      planSha256: '',
      status: 'NEEDS_USER',
      failureReason: 'Amended intent could not resolve any target requirement (REQ-xxx) or task (T-xxx / task-xxx) reference (fail closed)',
    };
  }

  // 3. Build task dependency graph from plan
  const graph: Record<string, string[]> = {};
  if (planYaml && Array.isArray(planYaml.tasks)) {
    for (const t of planYaml.tasks) {
      if (t.id) {
        graph[t.id] = Array.isArray(t.depends_on) ? t.depends_on : [];
      }
    }
  }

  // 4. Compute cascading invalidation closure
  const invalidatedTaskIds: string[] = [targetTaskId];
  const queue = [targetTaskId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all tasks depending on current
    for (const [taskId, deps] of Object.entries(graph)) {
      if (deps.includes(current) && !invalidatedTaskIds.includes(taskId)) {
        invalidatedTaskIds.push(taskId);
        queue.push(taskId);
      }
    }
  }

  // 5. Generate replaced tasks recipes
  const completedTaskSet = new Set(completedTasks);
  const invalidatedCompletedTaskIds = invalidatedTaskIds.filter((id) => completedTaskSet.has(id));
  const newTasks: WorkerTaskRecipe[] = [];
  const supersededTaskMap: Record<string, string> = {};

  for (const oldId of invalidatedTaskIds) {
    const replacementId = `task-new-${createHash('sha256').update(amendment.amendmentId + oldId).digest('hex').slice(0, 8)}`;
    supersededTaskMap[oldId] = replacementId;

    const oldTaskMetadata = planYaml?.tasks?.find((t: any) => t.id === oldId);
    const reqId = (oldId === targetTaskId && targetRequirementId) ? targetRequirementId : (oldTaskMetadata?.requirements?.[0] || 'REQ-019-AMENDED');
    const owned = oldTaskMetadata?.ownedPaths || [];

    newTasks.push({
      taskId: replacementId,
      requirementId: reqId,
      prompt: `Amended Task for ${oldId}: ${amendment.intent} (Supersedes ${oldId})`,
      ownedPaths: Array.isArray(owned) ? owned : [],
      forbiddenPaths: [],
      verification: ['npm run verify:all'],
    });
  }

  const unaffectedTaskIds = currentTaskIds.filter(id => !invalidatedTaskIds.includes(id));
  const planRaw = {
    amendmentId: amendment.amendmentId,
    planId,
    targetRevision,
    unaffectedTaskIds,
    invalidatedTaskIds,
    invalidatedCompletedTaskIds,
    supersededTaskMap,
    newTasks,
  };

  const planSha256 = impactPlanDigest({
    ...planRaw,
    planSha256: '',
    status: 'READY',
    plannerMode: 'legacy-compatibility',
  });

  return {
    ...planRaw,
    planSha256,
    status: 'READY',
    plannerMode: 'legacy-compatibility',
  };
}

function structuredPlanFailure(
  planId: string,
  amendment: AmendmentRequest,
  targetRevision: string,
  reason: string,
): RevisionImpactPlan {
  return {
    amendmentId: amendment.amendmentId,
    planId,
    targetRevision,
    unaffectedTaskIds: [],
    invalidatedTaskIds: [],
    invalidatedCompletedTaskIds: [],
    supersededTaskMap: {},
    newTasks: [],
    planSha256: '',
    status: 'BLOCKED',
    failureReason: reason,
    plannerMode: 'strong-planner',
    rawIntent: amendment.intent,
  };
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function relativeBoundPath(cwd: string, relativePath: string, label: string): string {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) throw new Error(`${label} escapes workspace`);
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes workspace`);
  return resolved;
}

function verifyPlannerBinding(cwd: string, draft: StrongPlannerRevisionImpactPlan): void {
  const receiptPath = relativeBoundPath(cwd, draft.planner.receiptPath, 'planner receipt');
  const contractPath = relativeBoundPath(cwd, draft.planner.contractPath, 'planner contract');
  if (!fs.existsSync(receiptPath) || !fs.statSync(receiptPath).isFile()) throw new Error(`planner receipt is missing: ${draft.planner.receiptPath}`);
  if (!fs.existsSync(contractPath) || !fs.statSync(contractPath).isFile()) throw new Error(`planner contract is missing: ${draft.planner.contractPath}`);
  const receiptBytes = fs.readFileSync(receiptPath);
  const contractBytes = fs.readFileSync(contractPath);
  if (createHash('sha256').update(receiptBytes).digest('hex') !== draft.planner.receiptSha256) throw new Error('planner receipt hash mismatch');
  if (createHash('sha256').update(contractBytes).digest('hex') !== draft.planner.contractSha256) throw new Error('planner contract hash mismatch');
  let receipt: unknown;
  let contract: unknown;
  try { receipt = JSON.parse(receiptBytes.toString('utf8')); } catch { throw new Error('planner receipt is not valid JSON'); }
  try { contract = JSON.parse(contractBytes.toString('utf8')); } catch { throw new Error('planner contract is not valid JSON'); }
  if (!isRecord(receipt) || receipt.status !== 'PASS') throw new Error('planner receipt is not a PASS receipt');
  if (!isRecord(contract) || contract.raw_intent !== draft.rawIntent) throw new Error('planner contract raw_intent does not match amendment intent');
}

/**
 * Compile a strong-planner impact artifact. This is the production amendment
 * boundary: no keyword extraction, prose heuristics, or implicit empty plan is
 * allowed. The kernel validates the planner's explicit closure and binds the
 * referenced receipt/contract before activation can mutate durable state.
 */
export function compileRevisionImpactPlanFromStrongPlanner(
  planId: string,
  amendment: AmendmentRequest,
  currentTaskIds: string[],
  activeTasks: string[],
  completedTasks: string[],
  currentRevision: string,
  rawPlannerPlan: unknown,
  cwd: string = '.',
): RevisionImpactPlan {
  const revNum = parseInt(currentRevision.replace(/[^0-9]/g, '') || '1', 10);
  const expectedRevision = `ledger-v${revNum + 1}`;
  let draft: StrongPlannerRevisionImpactPlan;
  try {
    draft = parseStrongPlannerRevisionImpactPlan(rawPlannerPlan);
    if (draft.planId !== planId) throw new Error('planner planId does not match active plan');
    if (draft.amendmentId !== amendment.amendmentId) throw new Error('planner amendmentId does not match durable request');
    if (draft.rawIntent !== amendment.intent) throw new Error('planner rawIntent does not exactly match durable amendment intent');
    if (draft.targetRevision !== expectedRevision) throw new Error(`planner targetRevision must be ${expectedRevision}`);
    verifyPlannerBinding(cwd, draft);

    const allCurrent = [...new Set([...currentTaskIds, ...activeTasks, ...completedTasks])];
    if (allCurrent.length !== currentTaskIds.length + new Set([...activeTasks, ...completedTasks]).size) {
      throw new Error('current/active/completed task inventory overlaps or is inconsistent');
    }
    const invalidated = [...new Set(draft.invalidatedTaskIds)];
    if (invalidated.length !== draft.invalidatedTaskIds.length) throw new Error('invalidatedTaskIds must be unique');
    if (draft.targetTaskIds.some((id) => !invalidated.includes(id))) throw new Error('every target task must be invalidated');
    if (invalidated.some((id) => !allCurrent.includes(id))) throw new Error('planner invalidates a task outside the durable current inventory');
    const expectedUnaffected = allCurrent.filter((id) => !invalidated.includes(id));
    if (!exactSet(draft.unaffectedTaskIds, expectedUnaffected)) throw new Error('unaffectedTaskIds is not the exact complement of invalidatedTaskIds');
    const expectedCompleted = completedTasks.filter((id) => invalidated.includes(id));
    if (!exactSet(draft.invalidatedCompletedTaskIds, expectedCompleted)) throw new Error('invalidatedCompletedTaskIds does not match completed task inventory');

    const closure = new Set<string>();
    for (const target of draft.targetTaskIds) {
      const entries = draft.dependencyClosure[target];
      if (!entries || entries.length === 0 || !entries.includes(target)) throw new Error(`dependencyClosure.${target} must include its target`);
      for (const id of entries) closure.add(id);
    }
    if (!exactSet([...closure], invalidated)) throw new Error('planner dependency closure does not exactly match invalidatedTaskIds');

    const mapKeys = Object.keys(draft.supersededTaskMap);
    if (!exactSet(mapKeys, invalidated)) throw new Error('supersededTaskMap must cover exactly every invalidated task');
    const replacementIds = Object.values(draft.supersededTaskMap);
    if (new Set(replacementIds).size !== replacementIds.length) throw new Error('supersededTaskMap replacement ids must be unique');
    if (draft.newTasks.length !== invalidated.length) throw new Error('strong planner must produce one replacement recipe per invalidated task');
    const recipes = new Map(draft.newTasks.map((recipe) => [recipe.taskId, recipe]));
    if (recipes.size !== draft.newTasks.length || !replacementIds.every((id) => recipes.has(id))) throw new Error('newTasks do not match supersededTaskMap');
    if (draft.newTasks.some((recipe) => recipe.verification.length === 0)) throw new Error('every replacement recipe needs executable verification');

    const plannerProof = {
      receiptPath: draft.planner.receiptPath,
      receiptSha256: draft.planner.receiptSha256,
      contractPath: draft.planner.contractPath,
      contractSha256: draft.planner.contractSha256,
      decisions: [...draft.planner.decisions],
    };
    const body: Omit<RevisionImpactPlan, 'planSha256'> = {
      amendmentId: draft.amendmentId,
      planId: draft.planId,
      targetRevision: draft.targetRevision,
      unaffectedTaskIds: [...draft.unaffectedTaskIds],
      invalidatedTaskIds: [...draft.invalidatedTaskIds],
      invalidatedCompletedTaskIds: [...draft.invalidatedCompletedTaskIds],
      supersededTaskMap: { ...draft.supersededTaskMap },
      newTasks: draft.newTasks.map((recipe) => ({ ...recipe })),
      status: 'READY',
      plannerMode: 'strong-planner',
      rawIntent: draft.rawIntent,
      plannerProof,
    };
    return { ...body, planSha256: impactPlanDigest(body as RevisionImpactPlan) };
  } catch (error) {
    return structuredPlanFailure(planId, amendment, expectedRevision, error instanceof Error ? error.message : String(error));
  }
}

export interface ActivationResult {
  readonly success: boolean;
  readonly planId: string;
  readonly activatedRevision: string;
  readonly invalidatedCount: number;
  readonly addedCount: number;
  readonly drainedTaskIds: readonly string[];
  readonly supersededCompletedTaskIds: readonly string[];
  readonly error?: string;
}

type ActivationTransactionPhase = 'PREPARED' | 'POINTER_COMMITTED' | 'COMMITTED';

interface ActivationTransactionManifest {
  readonly schema: 'harness/live-amendment-transaction/v1';
  readonly version: 1;
  readonly transactionId: string;
  readonly planId: string;
  readonly amendmentId: string;
  readonly targetRevision: string;
  readonly expectedPreviousGeneration: number;
  readonly expectedPreviousRevision: number;
  readonly targetGeneration: number;
  readonly targetLedgerSha256: string | null;
  readonly impactPlanSha256: string;
  readonly invalidatedTaskIds: readonly string[];
  readonly replacementTaskIds: readonly string[];
  readonly journalSize: number;
  readonly journalExisted: boolean;
  readonly requestExisted: boolean;
  readonly requestActivation: {
    readonly targetRevision: string;
    readonly impactPlanSha256: string;
    readonly activatedAt: string;
  };
  readonly journalEvent: Record<string, string | number> | null;
  readonly phase: ActivationTransactionPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const ACTIVATION_TRANSACTION_ROOT = path.join('.agent', 'amendment-transactions');

function activationTransactionDir(cwd: string, transactionId: string): string {
  if (!/^[a-f0-9-]{16,64}$/i.test(transactionId)) throw new Error('invalid activation transaction id');
  return path.join(cwd, ACTIVATION_TRANSACTION_ROOT, transactionId);
}

function activationTransactionManifestPath(cwd: string, transactionId: string): string {
  return path.join(activationTransactionDir(cwd, transactionId), 'manifest.json');
}

function activationQueueBackupPath(cwd: string, transactionId: string): string {
  return path.join(cwd, '.agent', `backup-queue-${transactionId}`);
}

function activationBackupPath(cwd: string, transactionId: string, name: 'pointer' | 'ledger' | 'request'): string {
  return path.join(activationTransactionDir(cwd, transactionId), `${name}.backup`);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeDurableText(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tempPath = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}-${randomUUID()}`);
  const fd = fs.openSync(tempPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const bytes = Buffer.from(content, 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (written === 0) throw new Error(`durable write made no progress: ${filePath}`);
      offset += written;
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  try {
    const dirFd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch {
    // Directory fsync is not available on every supported host; the file was
    // still atomically replaced after its contents were fsynced.
  }
}

function writeDurableJson(filePath: string, value: unknown): void {
  writeDurableText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyDurableFile(sourcePath: string, destinationPath: string): void {
  const dir = path.dirname(destinationPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.copyFileSync(sourcePath, destinationPath);
  // Windows does not permit fsync on a read-only file handle.  Open the
  // private transaction backup read/write so the same durability check works
  // on every supported host without weakening the immutable source read.
  const fd = fs.openSync(destinationPath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function cleanupActivationTransaction(cwd: string, transactionId: string): void {
  fs.rmSync(activationQueueBackupPath(cwd, transactionId), { recursive: true, force: true });
  fs.rmSync(activationTransactionDir(cwd, transactionId), { recursive: true, force: true });
}

function updateActivationTransaction(
  cwd: string,
  manifest: ActivationTransactionManifest,
  patch: Partial<ActivationTransactionManifest>,
): ActivationTransactionManifest {
  const next = { ...manifest, ...patch, updatedAt: new Date().toISOString() } as ActivationTransactionManifest;
  writeDurableJson(activationTransactionManifestPath(cwd, manifest.transactionId), next);
  return next;
}

function prepareActivationTransaction(
  cwd: string,
  transactionId: string,
  plan: RevisionImpactPlan,
  pointer: CurrentPointer,
  pointerPath: string,
  ledgerPath: string,
  requestPath: string,
  journalSize: number,
  journalExisted: boolean,
): ActivationTransactionManifest {
  const transactionDir = activationTransactionDir(cwd, transactionId);
  fs.mkdirSync(transactionDir, { recursive: true, mode: 0o700 });
  copyDurableFile(pointerPath, activationBackupPath(cwd, transactionId, 'pointer'));
  copyDurableFile(ledgerPath, activationBackupPath(cwd, transactionId, 'ledger'));
  const requestExisted = fs.existsSync(requestPath);
  if (requestExisted) copyDurableFile(requestPath, activationBackupPath(cwd, transactionId, 'request'));
  const now = new Date().toISOString();
  const manifest: ActivationTransactionManifest = {
    schema: 'harness/live-amendment-transaction/v1',
    version: 1,
    transactionId,
    planId: plan.planId,
    amendmentId: plan.amendmentId,
    targetRevision: plan.targetRevision,
    expectedPreviousGeneration: pointer.generation,
    expectedPreviousRevision: pointer.canonical_ledger.observed_revision,
    targetGeneration: pointer.generation + 1,
    targetLedgerSha256: null,
    impactPlanSha256: plan.planSha256,
    invalidatedTaskIds: [...plan.invalidatedTaskIds],
    replacementTaskIds: plan.newTasks.map((task) => task.taskId),
    journalSize,
    journalExisted,
    requestExisted,
    requestActivation: {
      targetRevision: plan.targetRevision,
      impactPlanSha256: plan.planSha256,
      activatedAt: now,
    },
    journalEvent: null,
    phase: 'PREPARED',
    createdAt: now,
    updatedAt: now,
  };
  writeDurableJson(activationTransactionManifestPath(cwd, transactionId), manifest);
  return manifest;
}

function readActivationTransactionManifest(filePath: string): ActivationTransactionManifest {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<ActivationTransactionManifest>;
  if (
    parsed.schema !== 'harness/live-amendment-transaction/v1' ||
    parsed.version !== 1 ||
    typeof parsed.transactionId !== 'string' ||
    typeof parsed.planId !== 'string' ||
    typeof parsed.amendmentId !== 'string' ||
    typeof parsed.targetRevision !== 'string' ||
    !Number.isSafeInteger(parsed.expectedPreviousGeneration) ||
    !Number.isSafeInteger(parsed.expectedPreviousRevision) ||
    !Number.isSafeInteger(parsed.targetGeneration) ||
    typeof parsed.impactPlanSha256 !== 'string' ||
    !Array.isArray(parsed.invalidatedTaskIds) ||
    !Array.isArray(parsed.replacementTaskIds) ||
    !Number.isSafeInteger(parsed.journalSize) ||
    typeof parsed.journalExisted !== 'boolean' ||
    typeof parsed.requestExisted !== 'boolean' ||
    !parsed.requestActivation ||
    typeof parsed.requestActivation.activatedAt !== 'string' ||
    !['PREPARED', 'POINTER_COMMITTED', 'COMMITTED'].includes(parsed.phase ?? '')
  ) throw new Error(`invalid activation transaction manifest: ${filePath}`);
  if (!/^[a-f0-9]{64}$/i.test(parsed.impactPlanSha256)) throw new Error(`invalid activation transaction plan hash: ${filePath}`);
  const expectedPreviousGeneration = parsed.expectedPreviousGeneration as number;
  const targetGeneration = parsed.targetGeneration as number;
  if (targetGeneration !== expectedPreviousGeneration + 1) throw new Error(`invalid activation transaction generation: ${filePath}`);
  if (parsed.targetLedgerSha256 !== null && !/^[a-f0-9]{64}$/i.test(parsed.targetLedgerSha256 ?? '')) throw new Error(`invalid activation transaction ledger hash: ${filePath}`);
  return parsed as ActivationTransactionManifest;
}

function restoreActivationTransaction(cwd: string, manifest: ActivationTransactionManifest): void {
  const planDir = path.join(cwd, '.agent', 'plans', manifest.planId);
  const queueDir = path.join(planDir, 'queue');
  const queueBackup = activationQueueBackupPath(cwd, manifest.transactionId);
  if (!fs.existsSync(queueBackup)) throw new Error(`activation transaction queue backup is missing: ${manifest.transactionId}`);
  fs.rmSync(queueDir, { recursive: true, force: true });
  fs.renameSync(queueBackup, queueDir);

  const pointerPath = path.join(cwd, '.agent', 'current.json');
  const ledgerPath = path.resolve(cwd, readCurrentPointer(cwd)?.canonical_ledger.path ?? path.join('.agent', 'ledger', `${manifest.planId}.json`));
  copyDurableFile(activationBackupPath(cwd, manifest.transactionId, 'pointer'), pointerPath);
  copyDurableFile(activationBackupPath(cwd, manifest.transactionId, 'ledger'), ledgerPath);
  const requestPath = path.join(planDir, 'amendments', `${manifest.amendmentId}.json`);
  if (manifest.requestExisted) copyDurableFile(activationBackupPath(cwd, manifest.transactionId, 'request'), requestPath);
  else fs.rmSync(requestPath, { force: true });
  const journalPath = path.join(planDir, 'journal.jsonl');
  if (manifest.journalExisted) {
    if (!fs.existsSync(journalPath)) fs.writeFileSync(journalPath, '');
    fs.truncateSync(journalPath, manifest.journalSize);
  } else {
    fs.rmSync(journalPath, { force: true });
  }
  cleanupActivationTransaction(cwd, manifest.transactionId);
}

function journalContainsActivationEvent(journalPath: string, manifest: ActivationTransactionManifest): boolean {
  if (!fs.existsSync(journalPath) || !manifest.journalEvent) return false;
  return fs.readFileSync(journalPath, 'utf8').split('\n').some((line) => {
    if (!line.trim()) return false;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      return event.type === 'REVISION_ACTIVATED' &&
        event.planId === manifest.planId &&
        event.amendmentId === manifest.amendmentId &&
        event.targetRevision === manifest.targetRevision &&
        event.impactPlanSha256 === manifest.impactPlanSha256;
    } catch { return false; }
  });
}

function appendDurableLine(filePath: string, line: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const bytes = Buffer.from(line, 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (written === 0) throw new Error(`durable append made no progress: ${filePath}`);
      offset += written;
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

function finalizeRecoveredActivation(cwd: string, manifest: ActivationTransactionManifest): void {
  const pointer = readCurrentPointer(cwd);
  if (!pointer || pointer.generation !== manifest.targetGeneration || pointer.canonical_ledger.observed_revision !== Number(manifest.targetRevision.replace(/[^0-9]/g, '')) || pointer.canonical_ledger.sha256 !== manifest.targetLedgerSha256) {
    throw new Error(`activation transaction target pointer does not match durable manifest: ${manifest.transactionId}`);
  }
  const planDir = path.join(cwd, '.agent', 'plans', manifest.planId);
  const requestPath = path.join(planDir, 'amendments', `${manifest.amendmentId}.json`);
  if (!fs.existsSync(requestPath)) {
    if (!manifest.requestExisted) throw new Error(`activation request missing and no backup exists: ${manifest.transactionId}`);
    copyDurableFile(activationBackupPath(cwd, manifest.transactionId, 'request'), requestPath);
  }
  let request: AmendmentRequest;
  try { request = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as AmendmentRequest; } catch {
    copyDurableFile(activationBackupPath(cwd, manifest.transactionId, 'request'), requestPath);
    request = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as AmendmentRequest;
  }
  if (request.state === 'ACTIVATED') {
    if (request.activation?.targetRevision !== manifest.targetRevision || request.activation.impactPlanSha256 !== manifest.impactPlanSha256) {
      throw new Error(`activation request receipt conflicts with recovery manifest: ${manifest.transactionId}`);
    }
  } else {
    const updated = {
      ...request,
      state: 'ACTIVATED' as const,
      activation: manifest.requestActivation,
    };
    writeDurableJson(requestPath, updated);
  }
  const journalPath = path.join(planDir, 'journal.jsonl');
  if (manifest.journalEvent && !journalContainsActivationEvent(journalPath, manifest)) {
    appendDurableLine(journalPath, `${JSON.stringify(manifest.journalEvent)}\n`);
  }
  updateActivationTransaction(cwd, manifest, { phase: 'COMMITTED' });
  cleanupActivationTransaction(cwd, manifest.transactionId);
}

/** Recover every durable activation transaction before admitting a new writer. */
export function recoverPendingActivationTransactions(cwd: string): void {
  const root = path.join(cwd, ACTIVATION_TRANSACTION_ROOT);
  if (!fs.existsSync(root)) return;
  const entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const transactionId = entry.name;
    const manifestPath = activationTransactionManifestPath(cwd, transactionId);
    if (!fs.existsSync(manifestPath)) throw new Error(`activation transaction manifest is missing: ${transactionId}`);
    const manifest = readActivationTransactionManifest(manifestPath);
    const pointer = readCurrentPointer(cwd);
    const currentRevision = pointer?.canonical_ledger.observed_revision;
    if (pointer && pointer.generation === manifest.targetGeneration && currentRevision === Number(manifest.targetRevision.replace(/[^0-9]/g, '')) && manifest.targetLedgerSha256 && pointer.canonical_ledger.sha256 === manifest.targetLedgerSha256) {
      finalizeRecoveredActivation(cwd, manifest);
    } else if (pointer && pointer.generation === manifest.expectedPreviousGeneration && currentRevision === manifest.expectedPreviousRevision) {
      restoreActivationTransaction(cwd, manifest);
    } else {
      throw new Error(`activation transaction is in an unresolvable state: ${transactionId}`);
    }
  }
}

function maybeCrashForTest(phase: string): void {
  if ((process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') && process.env.AGENT_RULES_TEST_CRASH_PHASE === phase) {
    // Windows does not expose POSIX signal termination to the parent in the
    // same way.  Exit with a distinctive non-zero code there while retaining
    // SIGKILL semantics on POSIX; both paths model abrupt process death before
    // the recovery writer is allowed to continue.
    if (process.platform === 'win32') process.exit(137);
    process.kill(process.pid, 'SIGKILL');
  }
}

function impactPlanDigest(impactPlan: RevisionImpactPlan): string {
  return createHash('sha256').update(JSON.stringify({
    amendmentId: impactPlan.amendmentId,
    planId: impactPlan.planId,
    targetRevision: impactPlan.targetRevision,
    plannerMode: impactPlan.plannerMode,
    rawIntent: impactPlan.rawIntent,
    plannerProof: impactPlan.plannerProof,
    unaffectedTaskIds: impactPlan.unaffectedTaskIds,
    invalidatedTaskIds: impactPlan.invalidatedTaskIds,
    invalidatedCompletedTaskIds: impactPlan.invalidatedCompletedTaskIds,
    supersededTaskMap: impactPlan.supersededTaskMap,
    newTasks: impactPlan.newTasks,
  })).digest('hex');
}

export function activateRevisionImpact(
  cwd: string,
  impactPlan: RevisionImpactPlan,
  runtime: {
    processStillRunning?: (pid: number) => boolean;
    sendCooperativeCancellation?: (pid: number) => void;
  } = {},
): ActivationResult {
  // The seam is test-only. Production callers cannot replace cancellation or
  // liveness checks and thereby weaken the fail-closed activation boundary.
  const testRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' ? runtime : {};
  if (impactPlan.status !== 'READY') {
    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: '',
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: `Cannot activate impact plan because status is "${impactPlan.status}": ${impactPlan.failureReason}`,
    };
  }

  // The activation boundary accepts a serialized plan from another process;
  // recompute its content address before touching durable state. Without this
  // check a caller could mutate the task map after strong planning and still
  // activate a mixed-revision queue.
  if (!/^[a-f0-9]{64}$/.test(impactPlan.planSha256) || impactPlan.planSha256 !== impactPlanDigest(impactPlan)) {
    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: '',
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: 'Impact plan content hash does not match its compiled contents (fail closed)',
    };
  }

  const planDir = path.join(cwd, '.agent', 'plans', impactPlan.planId);
  const requestPath = path.join(planDir, 'amendments', `${impactPlan.amendmentId}.json`);
  const activationLock = new ActivationLock(path.join(cwd, '.agent', 'locks'));
  let lockToken: string | undefined;
  try {
    lockToken = activationLock.acquire('live-amendment-activation').token;
  } catch (error: any) {
    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: '',
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: `Concurrent amendment activation is already in progress (fail closed): ${error?.message || String(error)}`,
    };
  }

  try {

    // A dead process may have left a prepared or pointer-committed transaction
    // behind. Recover it while the exclusive activation lock is held, before
    // reading the request or admitting another revision writer.
    try {
      recoverPendingActivationTransactions(cwd);
    } catch (error: any) {
      return {
        success: false,
        planId: impactPlan.planId,
        activatedRevision: '',
        invalidatedCount: 0,
        addedCount: 0,
        drainedTaskIds: [],
        supersededCompletedTaskIds: [],
        error: `Pending activation recovery failed closed: ${error?.message || String(error)}`,
      };
    }

    if (!fs.existsSync(requestPath)) {
      return {
        success: false,
        planId: impactPlan.planId,
        activatedRevision: '',
        invalidatedCount: 0,
        addedCount: 0,
        drainedTaskIds: [],
        supersededCompletedTaskIds: [],
        error: 'Durable amendment request is missing; activation requires raw intent lineage (fail closed)',
      };
    }

    // Idempotency is bound to the exact impact plan. A generic ACTIVATED flag
    // is insufficient because it could hide a mixed-revision replay.
    if (fs.existsSync(requestPath)) {
      try {
        const request = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as AmendmentRequest;
        if (impactPlan.rawIntent !== undefined && request.intent !== impactPlan.rawIntent) {
          return {
            success: false,
            planId: impactPlan.planId,
            activatedRevision: '',
            invalidatedCount: 0,
            addedCount: 0,
            drainedTaskIds: [],
            supersededCompletedTaskIds: [],
            error: 'Impact plan raw intent does not match the durable amendment request (fail closed)',
          };
        }
        if (request.state === 'ACTIVATED') {
          if (
            request.activation?.targetRevision !== impactPlan.targetRevision ||
            request.activation.impactPlanSha256 !== impactPlan.planSha256
          ) {
            return {
              success: false,
              planId: impactPlan.planId,
              activatedRevision: '',
              invalidatedCount: 0,
              addedCount: 0,
              drainedTaskIds: [],
              supersededCompletedTaskIds: [],
              error: 'Activated amendment receipt does not match the requested impact plan (fail closed)',
            };
          }
          return {
            success: true,
            planId: impactPlan.planId,
            activatedRevision: impactPlan.targetRevision,
            invalidatedCount: 0,
            addedCount: 0,
            drainedTaskIds: [],
            supersededCompletedTaskIds: [],
          };
        }
      } catch { /* malformed request is handled by the transactional path */ }
    }

  // 1. Read pointer and assert CAS revision
  const currentPointerPath = path.join(cwd, '.agent', 'current.json');
  const pointer = readCurrentPointer(cwd);
  if (!pointer) {
    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: '',
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: `Atomic activation failed: no active current pointer (fail closed)`,
    };
  }

  const currentPointerRevision = pointer.canonical_ledger.observed_revision === 1 ? 'ledger-v1' : `ledger-v${pointer.canonical_ledger.observed_revision}`;
  const revNum = parseInt(impactPlan.targetRevision.replace(/[^0-9]/g, '') || '2', 10);
  const expectedPrevious = `ledger-v${revNum - 1}`;

  if (currentPointerRevision !== expectedPrevious) {
    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: currentPointerRevision,
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: `CAS Mismatch: Current revision is "${currentPointerRevision}", but expected "${expectedPrevious}". Conflicting concurrent update detected (fail closed)`,
    };
  }

  // 2. Transaction backup of current queues
  const queueDir = path.join(planDir, 'queue');
  const transactionId = randomUUID();
  const queueBackupDir = path.join(cwd, '.agent', `backup-queue-${transactionId}`);
  const ledgerPath = path.resolve(cwd, pointer.canonical_ledger.path);
  const pointerBackup = fs.readFileSync(currentPointerPath);
  const ledgerBackup = fs.readFileSync(ledgerPath);
  const requestBackup = fs.existsSync(requestPath) ? fs.readFileSync(requestPath) : undefined;
  const journalPath = path.join(planDir, 'journal.jsonl');
  const journalExisted = fs.existsSync(journalPath);
  const journalSize = journalExisted ? fs.statSync(journalPath).size : 0;
  let transactionManifest: ActivationTransactionManifest | undefined;

  try {
    fs.mkdirSync(queueBackupDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(queueDir)) {
      const copyRecursiveSync = (src: string, dest: string) => {
        fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(src)) {
          const s = path.join(src, file);
          const d = path.join(dest, file);
          if (fs.statSync(s).isDirectory()) {
            copyRecursiveSync(s, d);
          } else {
            fs.copyFileSync(s, d);
          }
        }
      };
      copyRecursiveSync(queueDir, queueBackupDir);
    }
    transactionManifest = prepareActivationTransaction(
      cwd,
      transactionId,
      impactPlan,
      pointer,
      currentPointerPath,
      ledgerPath,
      requestPath,
      journalSize,
      journalExisted,
    );
    maybeCrashForTest('after-prepared');
  } catch (err: any) {
    cleanupActivationTransaction(cwd, transactionId);
    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: currentPointerRevision,
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: `Failed to create queue transaction backup: ${err.message} (fail closed)`,
    };
  }

  const queueActiveDir = path.join(queueDir, 'active');
  const queueReadyDir = path.join(queueDir, 'ready');
  const queueDoneDir = path.join(queueDir, 'done');
  const queueSupersededDir = path.join(queueDir, 'superseded');

  fs.mkdirSync(queueActiveDir, { recursive: true });
  fs.mkdirSync(queueReadyDir, { recursive: true });
  fs.mkdirSync(queueDoneDir, { recursive: true });
  fs.mkdirSync(queueSupersededDir, { recursive: true });

  const drainedTaskIds: string[] = [];
  const supersededCompletedTaskIds: string[] = [];
  let invalidatedCount = 0;

  try {
    // 3. Process safe draining and invalidation
    for (const oldTaskId of impactPlan.invalidatedTaskIds) {
      const activePath = path.join(queueActiveDir, `${oldTaskId}.json`);
      const readyPath = path.join(queueReadyDir, `${oldTaskId}.json`);
      const donePath = path.join(queueDoneDir, `${oldTaskId}.json`);
      const sourcePath = fs.existsSync(activePath)
        ? activePath
        : fs.existsSync(readyPath)
          ? readyPath
          : fs.existsSync(donePath)
            ? donePath
            : null;

      if (sourcePath) {
        const task = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        const previousQueueState = sourcePath === activePath ? 'active' : sourcePath === readyPath ? 'ready' : 'done';
        
        // Cooperative cancellation / lease revocation / checkpoint / safe-boundary with bounded timeout
        if (previousQueueState === 'active' && typeof task.pid === 'number') {
          // 1. Revoke the lease / mark task as revoked
          task.status = 'revoked';
          task.reason = 'LEASE_REVOKED';
          fs.writeFileSync(activePath, JSON.stringify(task, null, 2) + '\n');

          // 2. Send the cooperative cancellation signal. The optional runtime
          // seam lets adversarial tests model host process semantics without
          // making Windows console-signal behavior part of the durable state
          // transition itself.
          try {
            if (testRuntime.sendCooperativeCancellation) testRuntime.sendCooperativeCancellation(task.pid);
            else process.kill(task.pid, 'SIGINT');
          } catch {}

          // 3. Bounded timeout wait (e.g. 2000ms)
          const timeout = 2000;
          const pollInterval = 100;
          const deadline = Date.now() + timeout;
          let killed = false;
          
          while (Date.now() < deadline) {
            if (!(testRuntime.processStillRunning ?? processStillRunning)(task.pid)) {
              killed = true;
              break;
            }
            // Sleep sync equivalent
            const end = Date.now() + pollInterval;
            while (Date.now() < end) { /* wait */ }
          }

          // 4. Fail closed on uncertain external side effect if process still alive
          if (!killed) {
            throw new Error(`Cooperative cancellation timed out for PID ${task.pid} on task ${oldTaskId}. Uncertain external side effect detected (fail closed)`);
          }
        }

        if (previousQueueState !== 'active') task.claimedAt = undefined;
        task.reason = `SUPERSEDED_BY_${impactPlan.supersededTaskMap[oldTaskId] || 'AMENDMENT'}`;
        task.status = 'superseded';
        task.supersededByTaskId = impactPlan.supersededTaskMap[oldTaskId];
        task.supersededByAmendmentId = impactPlan.amendmentId;
        task.supersededAt = new Date().toISOString();
        task.supersededFromRevision = impactPlan.targetRevision;

        fs.writeFileSync(path.join(queueSupersededDir, `${oldTaskId}.json`), JSON.stringify(task, null, 2) + '\n');
        fs.rmSync(sourcePath, { force: true });

        drainedTaskIds.push(oldTaskId);
        if (previousQueueState === 'done') supersededCompletedTaskIds.push(oldTaskId);
        invalidatedCount++;
      } else if (impactPlan.invalidatedCompletedTaskIds.includes(oldTaskId)) {
        throw new Error(`Completed impacted task ${oldTaskId} has no durable done receipt (fail closed)`);
      }
    }

    // 4. Insert replacement tasks
    let addedCount = 0;
    for (const recipe of impactPlan.newTasks) {
      const taskPath = path.join(queueReadyDir, `${recipe.taskId}.json`);
      const queuedTask = {
        id: recipe.taskId,
        requirementId: recipe.requirementId,
        prompt: recipe.prompt,
        verification: [...recipe.verification],
        ownedPaths: [...recipe.ownedPaths],
        forbiddenPaths: [...recipe.forbiddenPaths],
        repairDepth: 0,
        createdAt: new Date().toISOString(),
        status: 'ready',
      };
      fs.writeFileSync(taskPath, JSON.stringify(queuedTask, null, 2) + '\n', { mode: 0o600 });
      addedCount++;
    }

    maybeCrashForTest('after-queue');

    // 5. Update Pointer using Atomic generation-CAS commitCurrentPointer
    const ledgerContent = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    ledgerContent.updated_at = new Date().toISOString();
    const ledgerBytes = Buffer.from(JSON.stringify(ledgerContent, null, 2) + '\n', 'utf8');
    const ledgerSha = createHash('sha256').update(ledgerBytes).digest('hex');
    const event = {
      timestamp: new Date().toISOString(),
      type: 'REVISION_ACTIVATED',
      planId: impactPlan.planId,
      amendmentId: impactPlan.amendmentId,
      targetRevision: impactPlan.targetRevision,
      impactPlanSha256: impactPlan.planSha256,
      invalidatedCount,
      addedCount,
      drainedCount: drainedTaskIds.length,
    };
    transactionManifest = updateActivationTransaction(cwd, transactionManifest!, {
      targetLedgerSha256: ledgerSha,
      journalEvent: event,
      requestActivation: {
        targetRevision: impactPlan.targetRevision,
        impactPlanSha256: impactPlan.planSha256,
        activatedAt: transactionManifest!.requestActivation.activatedAt,
      },
    });
    
    // Write new ledger revision status
    fs.writeFileSync(ledgerPath, ledgerBytes, { mode: 0o600 });
    maybeCrashForTest('after-ledger');

    const nextPointer: CurrentPointer = {
      ...pointer,
      generation: pointer.generation + 1,
      canonical_ledger: {
        ...pointer.canonical_ledger,
        sha256: ledgerSha,
        observed_revision: revNum,
      },
      atomicity: {
        ...pointer.atomicity,
        expected_previous_generation: pointer.generation,
        updated_at: new Date().toISOString(),
      }
    };

    commitCurrentPointer(cwd, nextPointer, pointer.generation);
    maybeCrashForTest('after-pointer');
    transactionManifest = updateActivationTransaction(cwd, transactionManifest!, { phase: 'POINTER_COMMITTED' });

    // Update AmendmentRequest file state
    if (fs.existsSync(requestPath)) {
      const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
      const updated = {
        ...request,
        state: 'ACTIVATED',
        activation: transactionManifest.requestActivation,
      };
      writeDurableJson(requestPath, updated);
    }
    maybeCrashForTest('after-request');

    // Append event to journal log
    appendDurableLine(journalPath, `${JSON.stringify(event)}\n`);
    maybeCrashForTest('after-journal');

    // Clean transaction backup on success
    transactionManifest = updateActivationTransaction(cwd, transactionManifest!, { phase: 'COMMITTED' });
    cleanupActivationTransaction(cwd, transactionId);

    return {
      success: true,
      planId: impactPlan.planId,
      activatedRevision: impactPlan.targetRevision,
      invalidatedCount,
      addedCount,
      drainedTaskIds,
      supersededCompletedTaskIds,
    };
  } catch (err: any) {
    // --- ROLLBACK OF QUEUES ON FAILURE ---
    try {
      if (fs.existsSync(queueBackupDir)) {
        fs.rmSync(queueDir, { recursive: true, force: true });
        fs.renameSync(queueBackupDir, queueDir);
      }
      fs.writeFileSync(ledgerPath, ledgerBackup, { mode: 0o600 });
      fs.writeFileSync(currentPointerPath, pointerBackup, { mode: 0o600 });
      if (requestBackup) fs.writeFileSync(requestPath, requestBackup, { mode: 0o600 });
      else fs.rmSync(requestPath, { force: true });
      if (fs.existsSync(journalPath)) fs.truncateSync(journalPath, journalSize);
    } catch (rollbackErr) {
      console.error('CRITICAL: Failed to rollback queue directory after activation error', rollbackErr);
    }
    cleanupActivationTransaction(cwd, transactionId);

    return {
      success: false,
      planId: impactPlan.planId,
      activatedRevision: currentPointerRevision,
      invalidatedCount: 0,
      addedCount: 0,
      drainedTaskIds: [],
      supersededCompletedTaskIds: [],
      error: `Activation transaction aborted and rolled back. Details: ${err.message}`,
    };
  }
  } finally {
    if (lockToken) {
      try {
        activationLock.release(lockToken);
      } catch (releaseError) {
        console.error('CRITICAL: Failed to release live-amendment activation lock', releaseError);
      }
    }
  }
}
