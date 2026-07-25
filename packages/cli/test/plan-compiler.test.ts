import { describe, it, expect } from 'vitest';
import {
  compilePlan,
  validatePlan,
  type CompiledPlan,
  type PlanTask,
} from '../src/services/plan-compiler.js';

function validPlan(overrides?: Partial<CompiledPlan>): CompiledPlan {
  const tasks: PlanTask[] = [
    {
      id: 'T-001',
      description: 'Implement REQ-001',
      requirementIds: ['REQ-001'],
      dependsOn: [],
      ownedPaths: ['src/foo.ts'],
      acceptanceCriteria: ['REQ-001 is implemented and verified'],
      estimatedEffort: 'small',
    },
    {
      id: 'T-002',
      description: 'Implement REQ-002',
      requirementIds: ['REQ-002'],
      dependsOn: ['T-001'],
      ownedPaths: ['src/bar.ts'],
      acceptanceCriteria: ['REQ-002 is implemented and verified'],
      estimatedEffort: 'medium',
    },
  ];
  return {
    schema: 'artifact/plan',
    version: 1,
    repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
    intent_reference: { hash: 'abc123', summary: 'Test plan' },
    tasks,
    completion_policy: { require_all_tasks: true, require_verification: true },
    validation: {
      valid: true,
      errors: [],
      warnings: [],
      requirementCoverage: [
        { id: 'REQ-001', covered: true, taskId: 'T-001' },
        { id: 'REQ-002', covered: true, taskId: 'T-002' },
      ],
    },
    ...overrides,
  };
}

describe('compilePlan', () => {
  it('creates a task per requirement with sequential T-XXX IDs', () => {
    const intent = {
      requestHash: 'req-hash-1',
      requirements: [{ id: 'REQ-A' }, { id: 'REQ-B' }, { id: 'REQ-C' }],
    };
    const plan = compilePlan(intent);

    expect(plan.schema).toBe('artifact/plan');
    expect(plan.version).toBe(1);
    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks[0].id).toBe('T-001');
    expect(plan.tasks[1].id).toBe('T-002');
    expect(plan.tasks[2].id).toBe('T-003');
    expect(plan.tasks[0].requirementIds).toEqual(['REQ-A']);
    expect(plan.tasks[1].requirementIds).toEqual(['REQ-B']);
    expect(plan.tasks[2].requirementIds).toEqual(['REQ-C']);
  });

  it('populates repository_baseline from options', () => {
    const plan = compilePlan(
      { requestHash: 'h', requirements: [{ id: 'R1' }] },
      undefined,
      { branch: 'develop', sha: 'deadbeef'.repeat(5) },
    );
    expect(plan.repository_baseline.branch).toBe('develop');
    expect(plan.repository_baseline.sha).toBe('deadbeef'.repeat(5));
  });

  it('defaults repository_baseline when options omitted', () => {
    const plan = compilePlan({ requestHash: 'h', requirements: [{ id: 'R1' }] });
    expect(plan.repository_baseline.branch).toBe('main');
    expect(plan.repository_baseline.sha).toBe('0'.repeat(40));
  });

  it('sets intent_reference from requestHash', () => {
    const plan = compilePlan({ requestHash: 'my-hash', requirements: [{ id: 'R1' }] });
    expect(plan.intent_reference.hash).toBe('my-hash');
    expect(plan.intent_reference.summary).toContain('1 requirements');
  });

  it('provides acceptance criteria for each task', () => {
    const plan = compilePlan({ requestHash: 'h', requirements: [{ id: 'R1' }] });
    expect(plan.tasks[0].acceptanceCriteria).toEqual(['R1 is implemented and verified']);
  });

  it('defaults estimatedEffort to small', () => {
    const plan = compilePlan({ requestHash: 'h', requirements: [{ id: 'R1' }] });
    expect(plan.tasks[0].estimatedEffort).toBe('small');
  });

  it('returns valid=true for a simple plan', () => {
    const plan = compilePlan({ requestHash: 'h', requirements: [{ id: 'R1' }] });
    expect(plan.validation.valid).toBe(true);
    expect(plan.validation.errors).toEqual([]);
  });

  it('reports full requirement coverage', () => {
    const plan = compilePlan({ requestHash: 'h', requirements: [{ id: 'R1' }, { id: 'R2' }] });
    expect(plan.validation.requirementCoverage).toHaveLength(2);
    expect(plan.validation.requirementCoverage[0]).toEqual({ id: 'R1', covered: true, taskId: 'T-001' });
    expect(plan.validation.requirementCoverage[1]).toEqual({ id: 'R2', covered: true, taskId: 'T-002' });
  });
});

describe('validatePlan', () => {
  it('returns valid=true for an acyclic plan with distinct paths', () => {
    const plan = validPlan();
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects a direct self-cycle', () => {
    const tasks: PlanTask[] = [
      {
        id: 'T-001',
        description: 'self',
        requirementIds: ['R1'],
        dependsOn: ['T-001'],
        ownedPaths: [],
        acceptanceCriteria: ['c1'],
        estimatedEffort: 'small',
      },
    ];
    const plan = validPlan({ tasks });
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/cycle.*T-001/i)]),
    );
  });

  it('detects an indirect cycle (A->B->A)', () => {
    const tasks: PlanTask[] = [
      {
        id: 'T-001',
        description: 'a',
        requirementIds: ['R1'],
        dependsOn: ['T-002'],
        ownedPaths: [],
        acceptanceCriteria: ['c1'],
        estimatedEffort: 'small',
      },
      {
        id: 'T-002',
        description: 'b',
        requirementIds: ['R2'],
        dependsOn: ['T-001'],
        ownedPaths: [],
        acceptanceCriteria: ['c2'],
        estimatedEffort: 'small',
      },
    ];
    const plan = validPlan({ tasks });
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('detects overlapping owned paths', () => {
    const tasks: PlanTask[] = [
      {
        id: 'T-001',
        description: 'a',
        requirementIds: ['R1'],
        dependsOn: [],
        ownedPaths: ['src/shared.ts'],
        acceptanceCriteria: ['c1'],
        estimatedEffort: 'small',
      },
      {
        id: 'T-002',
        description: 'b',
        requirementIds: ['R2'],
        dependsOn: [],
        ownedPaths: ['src/shared.ts'],
        acceptanceCriteria: ['c2'],
        estimatedEffort: 'small',
      },
    ];
    const plan = validPlan({ tasks });
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/overlapping.*src\/shared\.ts/i)]),
    );
  });

  it('rejects an empty task list', () => {
    const plan = validPlan({ tasks: [] });
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/at least one task/i)]),
    );
  });

  it('warns when a requirement is covered by multiple tasks', () => {
    const tasks: PlanTask[] = [
      {
        id: 'T-001',
        description: 'a',
        requirementIds: ['REQ-001'],
        dependsOn: [],
        ownedPaths: ['src/a.ts'],
        acceptanceCriteria: ['c1'],
        estimatedEffort: 'small',
      },
      {
        id: 'T-002',
        description: 'b',
        requirementIds: ['REQ-001'],
        dependsOn: [],
        ownedPaths: ['src/b.ts'],
        acceptanceCriteria: ['c2'],
        estimatedEffort: 'small',
      },
    ];
    const plan = validPlan({ tasks });
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/REQ-001.*multiple tasks/i)]),
    );
  });

  it('computes requirementCoverage from plan tasks', () => {
    const tasks: PlanTask[] = [
      {
        id: 'T-001',
        description: 'a',
        requirementIds: ['R1', 'R2'],
        dependsOn: [],
        ownedPaths: [],
        acceptanceCriteria: ['c1'],
        estimatedEffort: 'small',
      },
    ];
    const plan = validPlan({ tasks });
    const result = validatePlan(plan);
    expect(result.requirementCoverage).toHaveLength(2);
    expect(result.requirementCoverage[0]).toEqual({ id: 'R1', covered: true, taskId: 'T-001' });
    expect(result.requirementCoverage[1]).toEqual({ id: 'R2', covered: true, taskId: 'T-001' });
  });
});
