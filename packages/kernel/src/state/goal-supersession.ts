import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  commitCurrentPointer,
  readCurrentPointer,
  PointerCasError,
  POINTER_CAS_ERRORS,
  type ArtifactRef,
  type CanonicalLedger,
  type CandidateChainTip,
  type ChainTip,
  type ContractRef,
  type CurrentPointer,
} from './current-pointer.js';

export interface GoalSupersessionTarget {
  work_id: string;
  plan_id: string;
  plan_root: string;
  original: ArtifactRef;
  canonical_ledger: CanonicalLedger;
  effective_chain_tip: ChainTip;
  candidate_chain_tip: CandidateChainTip;
  contract: ContractRef;
}

export interface GoalSupersessionRequest {
  expected_generation: number;
  target: GoalSupersessionTarget;
  reason: string;
}

export interface GoalSupersessionResult {
  transaction_id: string;
  previous: CurrentPointer;
  current: CurrentPointer;
  receipt_path: string;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

/**
 * Canonical goal switch. It changes owner identity only through the same
 * generation-CAS pointer used by the runner; stale UI/session requests cannot
 * silently become current work.
 */
export function supersedeGoal(repoRoot: string, request: GoalSupersessionRequest): GoalSupersessionResult {
  const previous = readCurrentPointer(repoRoot);
  if (!previous) throw new Error('cannot supersede an unbound goal');
  if (!Number.isSafeInteger(request.expected_generation) || request.expected_generation !== previous.generation) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.STALE_EXPECTED,
      `goal switch expected generation ${request.expected_generation} but current pointer is generation ${previous.generation}`,
    );
  }
  const target = request.target;
  nonEmpty(target.work_id, 'target.work_id');
  nonEmpty(target.plan_id, 'target.plan_id');
  nonEmpty(target.plan_root, 'target.plan_root');
  const changedAt = new Date().toISOString();
  const transactionId = randomUUID();
  const reason = nonEmpty(request.reason, 'reason').slice(0, 2000);
  const current: CurrentPointer = {
    ...target,
    schema: previous.schema,
    version: previous.version,
    kind: previous.kind,
    generation: previous.generation + 1,
    supersession: {
      transaction_id: transactionId,
      previous_work_id: previous.work_id,
      previous_plan_id: previous.plan_id,
      reason,
      changed_at: changedAt,
    },
    atomicity: {
      protocol: 'generation-compare-and-swap',
      expected_previous_generation: previous.generation,
      commit_target: '.agent/current.json',
      activation_state: 'CANONICALLY_ACTIVATED',
      updated_at: changedAt,
    },
  };
  commitCurrentPointer(repoRoot, current, previous.generation);
  const receiptPath = path.join('.agent', 'tombstones', `supersession-${transactionId}.json`);
  const receipt = {
    schema: 'artifact/goal-supersession-receipt',
    version: 1,
    transaction_id: transactionId,
    previous: { work_id: previous.work_id, plan_id: previous.plan_id, generation: previous.generation },
    current: { work_id: current.work_id, plan_id: current.plan_id, generation: current.generation },
    reason,
    created_at: changedAt,
  };
  const bytes = JSON.stringify({ ...receipt, sha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') }, null, 2) + '\n';
  fs.mkdirSync(path.join(repoRoot, '.agent', 'tombstones'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, receiptPath), bytes, 'utf8');
  return { transaction_id: transactionId, previous, current, receipt_path: receiptPath };
}
