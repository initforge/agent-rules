import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { commitCurrentPointer, readCurrentPointer, type CurrentPointer } from '../src/state/current-pointer.js';
import { supersedeGoal } from '../src/state/goal-supersession.js';

const roots: string[] = [];
const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function setup(root: string, plan: string): CurrentPointer {
  const planRoot = path.join(root, '.agent', 'plans', plan);
  fs.mkdirSync(planRoot, { recursive: true });
  fs.mkdirSync(path.join(root, '.agent', 'ledger'), { recursive: true });
  fs.writeFileSync(path.join(planRoot, 'original.md'), `# ${plan}\n`);
  fs.writeFileSync(path.join(planRoot, 'requirements.yaml'), 'version: 1\nrequirements: []\n');
  fs.writeFileSync(path.join(root, '.agent', 'ledger', `${plan}.json`), JSON.stringify({ plan_id: plan, effective_plan_identity: { sha256: 'a'.repeat(64), canonical_json_utf8: 'x' } }));
  const original = `.agent/plans/${plan}/original.md`;
  const ledger = `.agent/ledger/${plan}.json`;
  const contract = `.agent/plans/${plan}/requirements.yaml`;
  return {
    schema: 'artifact/execution-contract', version: 1, kind: 'current-pointer', generation: 1,
    work_id: plan, plan_id: plan, plan_root: `.agent/plans/${plan}`,
    original: { path: original, sha256: hash(path.join(root, original)) },
    canonical_ledger: { path: ledger, sha256: hash(path.join(root, ledger)), observed_revision: 1, observed_effective_sha256: 'a'.repeat(64), plan_status: 'ACTIVE', execution_state: 'ACTIVE' },
    effective_chain_tip: { amendment_id: 'AM-0001', path: original, sha256: hash(path.join(root, original)) },
    candidate_chain_tip: { amendment_id: 'AM-0001', status: 'OWNER_APPROVED_EFFECTIVE', path: original, sha256: hash(path.join(root, original)) },
    contract: { path: contract, sha256: hash(path.join(root, contract)), schema_path: 'schemas/execution-contract.schema.json', requirement_ids: [], status: 'EFFECTIVE' },
    atomicity: { protocol: 'generation-compare-and-swap', expected_previous_generation: 0, commit_target: '.agent/current.json', activation_state: 'CANONICALLY_ACTIVATED', updated_at: new Date().toISOString() },
  };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('canonical goal supersession', () => {
  it('switches owner identity atomically and records previous authority', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-supersession-')); roots.push(root);
    const first = setup(root, 'goal-a');
    commitCurrentPointer(root, first, 0);
    const second = setup(root, 'goal-b');
    const result = supersedeGoal(root, {
      expected_generation: 1,
      reason: 'owner selected a new goal',
      target: { ...second, generation: undefined as never, atomicity: undefined as never, supersession: undefined as never },
    });
    expect(result.current.generation).toBe(2);
    expect(result.current.supersession?.previous_work_id).toBe('goal-a');
    expect(readCurrentPointer(root)?.work_id).toBe('goal-b');
    expect(fs.existsSync(path.join(root, result.receipt_path))).toBe(true);
  });

  it('rejects a stale UI/session switch without changing current authority', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-supersession-stale-')); roots.push(root);
    const first = setup(root, 'goal-a');
    commitCurrentPointer(root, first, 0);
    expect(() => supersedeGoal(root, { expected_generation: 0, reason: 'stale', target: first })).toThrow(/generation/);
    expect(readCurrentPointer(root)?.work_id).toBe('goal-a');
  });

  it('supports BOOTSTRAP_UNCERTIFIED as a schema-valid active activation state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-supersession-bootstrap-')); roots.push(root);
    const first = setup(root, 'goal-a');
    commitCurrentPointer(root, first, 0);
    const second = setup(root, 'goal-b');
    const result = supersedeGoal(root, {
      expected_generation: 1,
      reason: 'owner bootstrapped an uncertified successor',
      activation_state: 'BOOTSTRAP_UNCERTIFIED',
      target: { ...second, generation: undefined as never, atomicity: undefined as never, supersession: undefined as never },
    });
    expect(result.current.atomicity.activation_state).toBe('BOOTSTRAP_UNCERTIFIED');
    expect(readCurrentPointer(root)?.atomicity.activation_state).toBe('BOOTSTRAP_UNCERTIFIED');
    expect(readCurrentPointer(root)?.generation).toBe(2);
  });
});
