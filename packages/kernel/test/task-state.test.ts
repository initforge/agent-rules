import { describe, expect, it } from 'vitest';
import { TASK_STATE_SCHEMA, advanceFailureState, compactTaskFrontier, proofSummaryIsFresh, validateTaskState, type AgentTaskState } from '../src/northstar/task-state.js';

const state = (): AgentTaskState => ({
  schema: TASK_STATE_SCHEMA,
  task_id: 'TASK-test',
  revision: 1,
  plan_sha256: 'a'.repeat(64),
  source_identity: { repository: '/repo', revalidate_when: ['source changes'] },
  status: 'ACTIVE',
  outcome: 'Complete the task',
  locked_constraints: ['preserve behavior'],
  decisions: [], assumptions: [], blockers: [], do_not_repeat: [],
  selected_skill_ids: [], projected_skill_ids: [], skill_projection: null,
  slices: [{ id: 'S1', depends_on: [], status: 'IN_PROGRESS', requirement_ids: ['R1'], acceptance_ids: ['A1'], expected_delta: 'change seam', preserve: [], proof_summary: [] }],
  acceptance: [{ id: 'A1', claim: 'behavior works', required_strength: 'UNIT', status: 'PENDING' }],
  current_slice: 'S1', next_action: 'edit', stop_condition: 'A1 proved', updated_at: new Date(0).toISOString(),
});

describe('active task state', () => {
  it('accepts a coherent active frontier', () => expect(validateTaskState(state()).ok).toBe(true));
  it('rejects PASS with pending acceptance', () => expect(validateTaskState({ ...state(), status: 'PASS' }).issues).toContain('PASS requires every acceptance to be PROVED or PRE-EXISTING'));
  it('rejects unknown slice and acceptance references', () => {
    const invalid = state();
    const result = validateTaskState({ ...invalid, current_slice: 'missing', slices: [{ ...invalid.slices[0], acceptance_ids: ['missing'] }] });
    expect(result.ok).toBe(false);
  });
  it('invalidates evidence when a freshness binding changes', () => {
    expect(proofSummaryIsFresh({ acceptance_id: 'A1', strength: 'UNIT', status: 'PASS', evidence: 'ok', source_binding: 's1', proof_contract: 'p1' }, { source_binding: 's1', proof_contract: 'p1' })).toBe(true);
    expect(proofSummaryIsFresh({ acceptance_id: 'A1', strength: 'UNIT', status: 'PASS', evidence: 'ok', source_binding: 's1' }, { source_binding: 's2' })).toBe(false);
  });
  it('requires replan after the same failure repeats without evidence delta', () => {
    const first = advanceFailureState(undefined, { fingerprint: 'F', category: 'IMPLEMENTATION', source_binding: 'S', evidence_delta: [] });
    const second = advanceFailureState(first.failure, { fingerprint: 'F', category: 'IMPLEMENTATION', source_binding: 'S', evidence_delta: [] });
    expect(second.replan_required).toBe(true);
    expect(advanceFailureState(second.failure, { fingerprint: 'F', category: 'IMPLEMENTATION', source_binding: 'S', evidence_delta: ['new stack'] }).replan_required).toBe(false);
  });
  it('compacts state to the hot frontier', () => {
    const hot = compactTaskFrontier(state());
    expect(hot).not.toHaveProperty('acceptance');
    expect(hot).toHaveProperty('current_slice', 'S1');
  });
});
