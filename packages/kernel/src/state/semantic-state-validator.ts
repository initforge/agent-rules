import { isCurrentExecution, type ExecutionAuthority } from './execution-authority.js';

export type SemanticViolationCode =
  | 'MISSING_EXECUTION_IDENTITY'
  | 'STALE_ACTIVE_RECORD'
  | 'STALE_EVIDENCE'
  | 'PASS_WITH_UNRESOLVED_CLAIMS'
  | 'PASS_WITH_NONTERMINAL_TASK'
  | 'CONFLICTING_RECORD_STATUS'
  | 'WORKER_AUTHORED_PASS';

export interface SemanticStateViolation {
  code: SemanticViolationCode;
  record_id: string;
  detail: string;
  affects_claim_ids: string[];
}

export interface SemanticIdentity {
  work_id?: string;
  execution_generation?: number;
  spec_revision?: number | null;
}

export interface SemanticTaskRecord extends SemanticIdentity {
  id: string;
  status: string;
  claim_ids?: string[];
  worker_authored_pass?: boolean;
}

export interface SemanticRunRecord extends SemanticIdentity {
  id: string;
  status: string;
  unresolved_claims?: string[];
  task_ids?: string[];
}

export interface SemanticEvidenceRecord extends SemanticIdentity {
  id: string;
  claim_id: string;
  status: 'pass' | 'fail' | 'blocked';
  source_role?: 'worker' | 'verifier' | 'system';
}

export interface SemanticStateSnapshot {
  authority: ExecutionAuthority;
  tasks: SemanticTaskRecord[];
  runs: SemanticRunRecord[];
  evidence: SemanticEvidenceRecord[];
  /** Optional aggregate acceptance projection. It is checked with the same rules as a run. */
  acceptance?: {
    id?: string;
    outcome: string;
    unresolved_claims?: string[];
  };
}

export interface SemanticStateValidation {
  valid: boolean;
  violations: SemanticStateViolation[];
}

const PASS_STATUSES = new Set(['PASS', 'passed', 'pass']);
const EXECUTABLE_STATUSES = new Set(['READY', 'RUNNING', 'ready', 'running', 'active']);

function claimsOf(record: SemanticTaskRecord | SemanticRunRecord): string[] {
  if ('unresolved_claims' in record) return [...record.unresolved_claims ?? []];
  if ('claim_ids' in record) return [...record.claim_ids ?? []];
  return [];
}

function addIdentityViolation(
  violations: SemanticStateViolation[],
  record: SemanticIdentity & { id: string; status: string },
  authority: ExecutionAuthority,
  claims: string[] = [],
): void {
  const executable = EXECUTABLE_STATUSES.has(record.status);
  if (record.work_id === undefined || record.execution_generation === undefined) {
    if (executable || PASS_STATUSES.has(record.status)) {
      violations.push({
        code: 'MISSING_EXECUTION_IDENTITY',
        record_id: record.id,
        detail: `${record.id} is ${record.status} without work_id/execution_generation identity`,
        affects_claim_ids: claims,
      });
    }
    return;
  }
  if (!isCurrentExecution({
    work_id: record.work_id,
    execution_generation: record.execution_generation,
    ...(record.spec_revision !== undefined ? { spec_revision: record.spec_revision } : {}),
  }, authority) && record.status !== 'superseded') {
    violations.push({
      code: PASS_STATUSES.has(record.status) ? 'STALE_EVIDENCE' : 'STALE_ACTIVE_RECORD',
      record_id: record.id,
      detail: `${record.id} is ${record.status} but belongs to a superseded execution identity`,
      affects_claim_ids: claims,
    });
  }
}

function addPassViolation(
  violations: SemanticStateViolation[],
  id: string,
  unresolved: string[] | undefined,
): void {
  if ((unresolved ?? []).length > 0) {
    violations.push({
      code: 'PASS_WITH_UNRESOLVED_CLAIMS',
      record_id: id,
      detail: `${id} claims PASS while unresolved claims remain: ${(unresolved ?? []).join(', ')}`,
      affects_claim_ids: [...new Set(unresolved ?? [])],
    });
  }
}

/**
 * Validate the cross-artifact state machine before a result can be reported.
 * This is intentionally pure: callers can run it against an on-disk snapshot,
 * a resumed run, or an adversarial fixture without mutating durable state.
 */
export function validateSemanticState(snapshot: SemanticStateSnapshot): SemanticStateValidation {
  const violations: SemanticStateViolation[] = [];
  const records = [...snapshot.tasks, ...snapshot.runs];
  const byId = new Map<string, string>();

  for (const record of records) {
    const previous = byId.get(record.id);
    if (previous !== undefined && previous !== record.status) {
      violations.push({
        code: 'CONFLICTING_RECORD_STATUS',
        record_id: record.id,
        detail: `${record.id} appears with both ${previous} and ${record.status} status`,
        affects_claim_ids: claimsOf(record),
      });
    }
    byId.set(record.id, record.status);
    addIdentityViolation(violations, record, snapshot.authority, 'claim_ids' in record ? [...record.claim_ids ?? []] : []);
    if ('worker_authored_pass' in record && record.worker_authored_pass === true && PASS_STATUSES.has(record.status)) {
      violations.push({
        code: 'WORKER_AUTHORED_PASS',
        record_id: record.id,
        detail: `${record.id} reports PASS from a worker authority; PASS must be derived from verifier evidence`,
        affects_claim_ids: [...record.claim_ids ?? []],
      });
    }
    if (PASS_STATUSES.has(record.status) && 'unresolved_claims' in record) {
      addPassViolation(violations, record.id, record.unresolved_claims);
    }
  }

  for (const evidence of snapshot.evidence) {
    if (evidence.source_role === 'worker' && evidence.status === 'pass') {
      violations.push({
        code: 'WORKER_AUTHORED_PASS',
        record_id: evidence.id,
        detail: `${evidence.id} is a worker-authored PASS evidence record`,
        affects_claim_ids: [evidence.claim_id],
      });
    }
    if (evidence.work_id === undefined || evidence.execution_generation === undefined) {
      violations.push({
        code: 'MISSING_EXECUTION_IDENTITY',
        record_id: evidence.id,
        detail: `${evidence.id} lacks execution identity and cannot bind claim ${evidence.claim_id}`,
        affects_claim_ids: [evidence.claim_id],
      });
    } else if (!isCurrentExecution({
      work_id: evidence.work_id,
      execution_generation: evidence.execution_generation,
      ...(evidence.spec_revision !== undefined ? { spec_revision: evidence.spec_revision } : {}),
    }, snapshot.authority) && evidence.status === 'pass') {
      violations.push({
        code: 'STALE_EVIDENCE',
        record_id: evidence.id,
        detail: `${evidence.id} is PASS evidence from a superseded execution identity`,
        affects_claim_ids: [evidence.claim_id],
      });
    }
  }

  for (const run of snapshot.runs) {
    if (PASS_STATUSES.has(run.status) && run.task_ids) {
      const taskStatus = new Map(snapshot.tasks.map((task) => [task.id, task.status]));
      const unfinished = run.task_ids.filter((taskId) => taskStatus.get(taskId) !== 'done');
      if (unfinished.length > 0) {
        violations.push({
          code: 'PASS_WITH_NONTERMINAL_TASK',
          record_id: run.id,
          detail: `${run.id} claims PASS while task(s) are not DONE: ${unfinished.join(', ')}`,
          affects_claim_ids: [],
        });
      }
    }
  }
  if (snapshot.acceptance && PASS_STATUSES.has(snapshot.acceptance.outcome)) {
    addPassViolation(violations, snapshot.acceptance.id ?? 'acceptance', snapshot.acceptance.unresolved_claims);
  }

  return { valid: violations.length === 0, violations };
}

export function assertSemanticState(snapshot: SemanticStateSnapshot): void {
  const result = validateSemanticState(snapshot);
  if (!result.valid) {
    throw new Error(`semantic state contradiction: ${result.violations.map((violation) => `${violation.code}:${violation.record_id}`).join(', ')}`);
  }
}
