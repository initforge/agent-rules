import crypto from 'node:crypto';
import type { HostId } from './host-adapters.js';
import type {
  FrozenPortableContract,
  ContractRequirement,
  ContractTaskNode,
} from './portable-plan.js';
import {
  createHostProjectionReceipt,
  type HostProjectionReceipt,
} from './receipts.js';

export interface HostProjectionResult {
  readonly host: HostId;
  readonly surface: string;
  readonly payload: string | Record<string, unknown>;
  readonly artifact_review_policy: 'always-proceed' | 'asks-for-review';
  readonly receipt: HostProjectionReceipt;
}

export interface HostParsedPayload {
  readonly objective: string;
  readonly requirements: ContractRequirement[];
  readonly non_goals: string[];
  readonly decisions: string[];
  readonly constraints: string[];
  readonly owned_scope: string[];
  readonly forbidden_scope: string[];
  readonly claims: string[];
}

/**
 * Canonical Hub for cross-host intake and projection.
 * Pipeline: CLASSIFY → PRESERVE → GROUND → RECONCILE → FREEZE → PROJECT → EXECUTE.
 * Authority order: Owner Intent/Decisions > Canonical Contract > Native Artifact > Local Tactics.
 */
export function projectCanonicalToHost(
  contract: FrozenPortableContract,
  targetHost: HostId,
  options: { requestedAction?: 'ANSWER' | 'PLAN' | 'REVIEW' | 'EXECUTE'; interactionMode?: 'AUTO_EXECUTE' | 'OWNER_REVIEW' } = {}
): HostProjectionResult {
  const requestedAction = options.requestedAction ?? 'EXECUTE';
  const interactionMode = options.interactionMode ?? (
    contract.policy.requires_strong_reviewer || contract.unresolved.length > 0 ? 'OWNER_REVIEW' : 'AUTO_EXECUTE'
  );

  const artifactReviewPolicy = (interactionMode === 'OWNER_REVIEW' || requestedAction === 'PLAN' || requestedAction === 'REVIEW')
    ? 'asks-for-review'
    : 'always-proceed';

  const requirementDispositions = contract.requirements.map((req) => ({
    requirement_id: req.id,
    status: 'PRESERVED' as const,
    details: req.statement,
  }));

  const receipt = createHostProjectionReceipt({
    target_host: targetHost,
    source_plan_sha256: contract.semantic_hash,
    requested_action: requestedAction,
    interaction_mode: interactionMode,
    requirement_dispositions: requirementDispositions,
    non_goals_preserved: [...contract.non_goals],
    owner_decisions_preserved: [...contract.decisions],
    acceptance_claims_preserved: contract.requirements.flatMap((r) => r.claims),
    unresolved_material_items: [...contract.unresolved],
  });

  let payload: string | Record<string, unknown>;

  switch (targetHost) {
    case 'antigravity':
      // Antigravity Native Implementation Plan / Task List format
      payload = {
        title: contract.objective,
        contract_id: contract.contract_id,
        semantic_hash: contract.semantic_hash,
        artifactReviewPolicy,
        requirements: contract.requirements.map((r) => ({ id: r.id, statement: r.statement, claims: r.claims })),
        decisions: contract.decisions,
        non_goals: contract.non_goals,
        constraints: contract.constraints,
        tasks: contract.tasks.map((t) => ({
          id: t.task_id,
          goal: t.goal,
          owned: t.owned,
          forbidden: t.forbidden,
          requirements: t.requirement_ids,
          acceptance: t.acceptance,
        })),
        reconciliation_summary: {
          total_requirements: contract.requirements.length,
          all_preserved: true,
          unresolved_count: contract.unresolved.length,
        },
      };
      break;

    case 'claude':
    case 'codex':
    case 'opencode':
    case 'cursor':
    case 'grok':
    case 'deepseek-harness':
    case 'command-code':
    case 'omp':
    default:
      payload = JSON.stringify({
        host: targetHost,
        contract_id: contract.contract_id,
        semantic_hash: contract.semantic_hash,
        objective: contract.objective,
        artifactReviewPolicy,
        requirements: contract.requirements,
        decisions: contract.decisions,
        non_goals: contract.non_goals,
        constraints: contract.constraints,
        tasks: contract.tasks,
        receipt_ref: receipt.receipt_sha256,
      }, null, 2);
      break;
  }

  return {
    host: targetHost,
    surface: targetHost === 'antigravity' ? 'ide_artifact' : 'cli_packet',
    payload,
    artifact_review_policy: artifactReviewPolicy,
    receipt,
  };
}

export function parseHostToCanonical(
  projection: HostProjectionResult,
  baseContract: FrozenPortableContract
): HostParsedPayload {
  let data: Record<string, unknown>;
  if (typeof projection.payload === 'string') {
    try {
      data = JSON.parse(projection.payload);
    } catch {
      data = {};
    }
  } else {
    data = projection.payload;
  }

  const rawReqs = Array.isArray(data.requirements) ? data.requirements : baseContract.requirements;
  const requirements: ContractRequirement[] = rawReqs.map((r: any) => ({
    id: String(r.id),
    statement: String(r.statement),
    mandatory: typeof r.mandatory === 'boolean' ? r.mandatory : true,
    claims: Array.isArray(r.claims) ? r.claims.map(String) : [],
    status: (r.status as any) ?? 'ACTIVE',
  }));

  const non_goals = Array.isArray(data.non_goals) ? data.non_goals.map(String) : [...baseContract.non_goals];
  const decisions = Array.isArray(data.decisions) ? data.decisions.map(String) : [...baseContract.decisions];
  const constraints = Array.isArray(data.constraints) ? data.constraints.map(String) : [...baseContract.constraints];

  const rawTasks = Array.isArray(data.tasks) ? data.tasks : baseContract.tasks;
  const owned_scope = rawTasks.flatMap((t: any) => (Array.isArray(t.owned) ? t.owned.map(String) : []));
  const forbidden_scope = rawTasks.flatMap((t: any) => (Array.isArray(t.forbidden) ? t.forbidden.map(String) : []));

  return {
    objective: String(data.title || data.objective || baseContract.objective),
    requirements,
    non_goals,
    decisions,
    constraints,
    owned_scope: [...new Set(owned_scope)],
    forbidden_scope: [...new Set(forbidden_scope)],
    claims: requirements.flatMap((r) => r.claims),
  };
}
