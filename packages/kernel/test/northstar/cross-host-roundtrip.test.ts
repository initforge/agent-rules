import { describe, it, expect } from 'vitest';
import {
  projectCanonicalToHost,
  parseHostToCanonical,
} from '../../src/northstar/cross-host-hub.js';
import type { HostId } from '../../src/northstar/host-adapters.js';
import type { FrozenPortableContract } from '../../src/northstar/portable-plan.js';

const HOSTS: HostId[] = [
  'claude',
  'codex',
  'opencode',
  'cursor',
  'antigravity',
  'grok',
  'deepseek-harness',
  'command-code',
  'omp',
];

function createSampleContract(): FrozenPortableContract {
  return {
    schema: 'harness/portable-plan-vnext',
    version: 1,
    contract_id: 'PC-test-sample-1234',
    revision: 1,
    work_id: 'W-test-1234',
    spec_id: 'WS-test-1234',
    spec_revision: 1,
    frozen_intent: {
      work_id: 'W-test-1234',
      raw_intent_sha256: 'a'.repeat(64),
      intent_events_sha256: 'b'.repeat(64),
      effective_items_sha256: 'c'.repeat(64),
    },
    objective: 'Implement cross-host usability and core slimming',
    requirements: [
      {
        id: 'R-01',
        statement: 'Preserve user intent and non-goals',
        mandatory: true,
        claims: ['C-01', 'C-02'],
        status: 'ACTIVE',
      },
      {
        id: 'R-02',
        statement: 'Workers never author PASS',
        mandatory: true,
        claims: ['C-03'],
        status: 'ACTIVE',
      },
    ],
    constraints: ['Forbidden scope fails closed', 'Bounded repair'],
    non_goals: ['Do not rewrite git history', 'Do not invent truth'],
    decisions: ['Execution defaults to AUTO_EXECUTE', 'Review B max 1 cycle'],
    assumptions: ['Host binaries are installed on target machines'],
    unresolved: [],
    references: [],
    tasks: [
      {
        task_id: 'T-01',
        goal: 'Implement canonical cross-host hub',
        requirement_ids: ['R-01'],
        dependencies: [],
        owned: ['packages/kernel/src/northstar/cross-host-hub.ts'],
        forbidden: ['generated/**'],
        acceptance: [{ claim_id: 'C-01', verifier_id: 'node-test' }],
        proof_categories: ['A', 'B'],
        effects: ['read', 'filesystem_mutation'],
        budgets: { max_steps: 10 },
        phase: 'IMPLEMENT',
      },
    ],
    traceability: {
      valid: true,
      requirement_to_tasks: { 'R-01': ['T-01'] },
      claim_to_tasks: { 'C-01': ['T-01'] },
    },
    policy: {},
    disposition: 'LOCAL_EXECUTE',
    compiled_dod: {
      required: ['CODE', 'BEHAVIOR', 'TERMINAL'],
      reason: 'Standard local execution with behavior and terminal proof',
    },
    semantic_hash: 'd'.repeat(64),
  };
}

describe('Cross-Host Intake & Projection Hub', () => {
  it('projects Antigravity native format with always-proceed for AUTO_EXECUTE', () => {
    const contract = createSampleContract();
    const result = projectCanonicalToHost(contract, 'antigravity', {
      requestedAction: 'EXECUTE',
      interactionMode: 'AUTO_EXECUTE',
    });

    expect(result.host).toBe('antigravity');
    expect(result.artifact_review_policy).toBe('always-proceed');
    expect(result.receipt.target_host).toBe('antigravity');
    expect(result.receipt.requested_action).toBe('EXECUTE');
    expect(result.receipt.interaction_mode).toBe('AUTO_EXECUTE');
    expect(result.receipt.requirement_dispositions).toHaveLength(2);
    expect(result.receipt.non_goals_preserved).toEqual(contract.non_goals);
    expect(result.receipt.owner_decisions_preserved).toEqual(contract.decisions);
  });

  it('projects Antigravity with asks-for-review when OWNER_REVIEW or PLAN is requested', () => {
    const contract = createSampleContract();
    const result = projectCanonicalToHost(contract, 'antigravity', {
      requestedAction: 'PLAN',
      interactionMode: 'OWNER_REVIEW',
    });

    expect(result.artifact_review_policy).toBe('asks-for-review');
    expect(result.receipt.requested_action).toBe('PLAN');
    expect(result.receipt.interaction_mode).toBe('OWNER_REVIEW');
  });

  // 72 Pairwise Roundtrip Tests: all 9 hosts -> canonical -> all 9 hosts.
  it('executes 72-directional roundtrip across all 9 hosts preserving all requirements', () => {
    const contract = createSampleContract();
    let testedPairs = 0;

    for (const hostA of HOSTS) {
      for (const hostB of HOSTS) {
        if (hostA === hostB) continue;

        // Step 1: Canonical -> HostA
        const projA = projectCanonicalToHost(contract, hostA);
        expect(projA.receipt.receipt_sha256).toBeDefined();

        // Step 2: HostA -> Canonical'
        const parsedA = parseHostToCanonical(projA, contract);
        expect(parsedA.requirements.map((r) => r.id)).toEqual(contract.requirements.map((r) => r.id));
        expect(parsedA.non_goals).toEqual(contract.non_goals);
        expect(parsedA.decisions).toEqual(contract.decisions);

        // Step 3: Canonical' -> HostB
        const projB = projectCanonicalToHost(contract, hostB);
        expect(projB.receipt.receipt_sha256).toBeDefined();

        // Step 4: HostB -> Canonical''
        const parsedB = parseHostToCanonical(projB, contract);
        expect(parsedB.requirements.map((r) => r.id)).toEqual(contract.requirements.map((r) => r.id));
        expect(parsedB.non_goals).toEqual(contract.non_goals);
        expect(parsedB.decisions).toEqual(contract.decisions);
        expect(parsedB.claims).toEqual(contract.requirements.flatMap((r) => r.claims));

        testedPairs++;
      }
    }

    expect(testedPairs).toBe(72);
  });
});
