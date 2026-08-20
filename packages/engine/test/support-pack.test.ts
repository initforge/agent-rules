import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  assertImplementationIntentReceipt,
  compileSupportPack,
  createImplementationIntentReceipt,
  regenerateSupportPackSelective,
  type SupportPackInput,
} from '../src/northstar/index.js';

const HASH = 'a'.repeat(64);

function input(): SupportPackInput {
  return {
    schema: 'harness/support-pack-input', version: 1, planId: 'plan-support', revision: 3,
    rawIntent: 'Compile a bounded support pack', objective: 'Give a worker one self-contained recipe',
    decisions: ['Provider-neutral kernel remains canonical'], assumptions: ['The repository is the execution root'], knownUnknowns: [],
    requirements: [{ requirementId: 'REQ-001', statement: 'The recipe is traceable', claimIds: ['C-001'], mandatory: true }],
    claims: [{ claimId: 'C-001', statement: 'The recipe has exact proof', verifierIds: ['V-001'] }],
    tasks: [{
      taskId: 'T-001', goal: 'Compile the recipe', requirementIds: ['REQ-001'], claimIds: ['C-001'], dependencies: [],
      ownedPaths: ['packages/kernel/src/northstar'], forbiddenPaths: ['generated'],
      sourceAnchors: [{ path: 'packages/kernel/src/northstar/compiler.ts', section: 'compileTaskPackets', lineStart: 1, lineEnd: 10, contentSha256: HASH, requirementId: 'REQ-001' }],
      decisions: ['Use deterministic JSON'], context: ['Read the canonical compiler before editing'],
      microsteps: ['Inspect the anchor', 'Implement the bounded change', 'Run the exact proof'],
      invariants: ['Workers never author PASS'], edgeCases: ['Missing anchor blocks compilation'],
      proof: [{ claimId: 'C-001', verifierId: 'V-001', command: { executable: 'npm', args: ['test', '--', 'support-pack'] } }],
      rollback: ['Restore the previous recipe projection'], failurePlaybook: ['Refresh context once, then escalate'], stopIf: ['Unknown business truth'],
      tokenBudget: 4000, decisionSurfaceBudget: 8, modelTier: 'economy', riskTier: 'medium',
    }],
  };
}

function secondTask() {
  return {
    ...input().tasks[0],
    taskId: 'T-002',
    goal: 'Compile the second recipe',
    dependencies: ['T-001'],
    ownedPaths: ['packages/other'],
    sourceAnchors: [{ ...input().tasks[0].sourceAnchors[0], path: 'packages/other/compiler.ts' }],
  };
}

describe('deterministic support-pack compiler', () => {
  it('compiles a self-contained tracked recipe and is byte-stable', () => {
    const first = compileSupportPack(input());
    const second = compileSupportPack(input());
    expect(first).toEqual(second);
    expect(first.manifest.requirementIds).toEqual(['REQ-001']);
    expect(first.recipes[0]).toMatchObject({ taskId: 'T-001', claimIds: ['C-001'], budgets: { token: 4000, decisionSurface: 8 } });
    expect(first.files['tasks/T-001.md']).toContain('## Exact proof');
    expect(first.packSha256).toHaveLength(64);
  });

  it('rejects unresolved truth, missing coverage, and under-specified recipes', () => {
    expect(() => compileSupportPack({ ...input(), unresolved: ['owner decision'] })).toThrow(/unresolved/);
    expect(() => compileSupportPack({ ...input(), tasks: [] })).toThrow(/requirements, claims, and tasks/);
    expect(() => compileSupportPack({ ...input(), tasks: [{ ...input().tasks[0], microsteps: ['one'] }] })).toThrow(/microsteps/);
    expect(() => compileSupportPack({ ...input(), tasks: [{ ...input().tasks[0], sourceAnchors: [] }] })).toThrow(/sourceAnchors/);
  });

  it('rejects scope overlap, dependency cycles, and oversized decision surfaces', () => {
    const base = input().tasks[0];
    expect(() => compileSupportPack({ ...input(), tasks: [base, { ...base, taskId: 'T-002', ownedPaths: base.ownedPaths }] })).toThrow(/overlaps/);
    expect(() => compileSupportPack({ ...input(), tasks: [{ ...base, dependencies: ['T-002'] }, { ...base, taskId: 'T-002', dependencies: ['T-001'], ownedPaths: ['packages/other'] }] })).toThrow(/cycle/);
    expect(() => compileSupportPack({ ...input(), tasks: [{ ...base, decisionSurfaceBudget: 33 }] })).toThrow(/decisionSurfaceBudget/);
  });

  it('validates the pre-mutation implementation-intent receipt and rejects drift', () => {
    const recipe = compileSupportPack(input()).recipes[0];
    const receipt = createImplementationIntentReceipt(recipe, 'Implement only the bounded support-pack compiler change');
    expect(() => assertImplementationIntentReceipt(receipt, recipe)).not.toThrow();
    expect(() => assertImplementationIntentReceipt({ ...receipt, ownedPaths: ['outside'] }, recipe)).toThrow(/scope drift/);
    expect(() => assertImplementationIntentReceipt({ ...receipt, receiptSha256: HASH }, recipe)).toThrow(/hash mismatch/);
  });

  it('matches the portable recipe and receipt schemas without weakening runtime checks', () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const recipe = compileSupportPack(input()).recipes[0];
    const receipt = createImplementationIntentReceipt(recipe, 'Implement only the bounded support-pack compiler change');
    for (const [schemaName, value] of [['worker-task-recipe.schema.json', recipe], ['implementation-intent-receipt.schema.json', receipt]] as const) {
      const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(root, 'schemas', schemaName), 'utf8')));
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      expect(validate({ ...value, unexpected: true })).toBe(false);
    }
  });

  it('selectively regenerates impacted recipes and preserves unimpacted logic', () => {
    const previousInput = { ...input(), tasks: [input().tasks[0], secondTask()] };
    const previous = compileSupportPack(previousInput);
    const amended = compileSupportPack({
      ...previousInput,
      revision: 4,
      tasks: [previousInput.tasks[0], { ...secondTask(), goal: 'Compile the amended second recipe' }],
    });
    const result = regenerateSupportPackSelective(
      { ...previousInput, revision: 4, tasks: [previousInput.tasks[0], { ...secondTask(), goal: 'Compile the amended second recipe' }] },
      previous,
      { impactedTaskIds: ['T-002'] },
    );
    expect(result.pack).toEqual(amended);
    expect(result.preservedTaskIds).toEqual(['T-001']);
    expect(result.regeneratedTaskIds).toEqual(['T-002']);
    expect(result.amendmentSha256).toHaveLength(64);
  });

  it('rejects an undeclared unimpacted change and records supersession explicitly', () => {
    const previousInput = { ...input(), tasks: [input().tasks[0], secondTask()] };
    const previous = compileSupportPack(previousInput);
    expect(() => regenerateSupportPackSelective(
      { ...previousInput, revision: 4, tasks: [{ ...input().tasks[0], goal: 'undeclared change' }, secondTask()] },
      previous,
      { impactedTaskIds: ['T-002'] },
    )).toThrow(/unimpacted task T-001/);

    const superseded = regenerateSupportPackSelective(
      { ...previousInput, revision: 4, tasks: [{ ...secondTask(), taskId: 'T-003', goal: 'Replacement recipe', dependencies: [], ownedPaths: ['packages/replacement'], sourceAnchors: [{ ...secondTask().sourceAnchors[0], path: 'packages/replacement/compiler.ts' }] }] },
      previous,
      { impactedTaskIds: ['T-001', 'T-002', 'T-003'], supersededTaskIds: ['T-001', 'T-002'] },
    );
    expect(superseded.supersededTaskIds).toEqual(['T-001', 'T-002']);
    expect(superseded.regeneratedTaskIds).toEqual(['T-003']);
  });
});
