import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { taskCommand } from '../src/commands/task.js';
import { resolveRuntimeAssetsRoot } from '../src/runtime/locator.js';
import { TASK_START_SCHEMA, deriveMinimalPlanContract, type TaskStartInput, type ProofStrength } from '@initforge/agent-rules-kernel/northstar/task-state.js';

function repo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-task-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function input(outcome = 'first', selected: string[] = []): TaskStartInput {
  return {
    schema: TASK_START_SCHEMA,
    plan_markdown: `# ${outcome}`,
    state: {
      source_identity: { repository: '/repo', revalidate_when: ['source changes'] }, status: 'ACTIVE', outcome,
      locked_constraints: ['lock'], decisions: [], assumptions: [], blockers: [], do_not_repeat: [],
      selected_skill_ids: selected, projected_skill_ids: [], skill_projection: null,
      slices: [{ id: 'S1', depends_on: [], status: 'READY', requirement_ids: ['R1'], acceptance_ids: ['A1'], expected_delta: 'delta', preserve: [], proof_summary: [] }],
      acceptance: [{ id: 'A1', claim: 'claim', required_strength: 'STATIC', status: 'PENDING' }], current_slice: 'S1', next_action: 'act', stop_condition: 'done',
    },
  };
}

describe('project-local task state', () => {
  it('starts and replaces the current task without keeping history', () => {
    const root = repo();
    const first = taskCommand('start', { root, input: input('first') });
    expect(first.exitCode).toBe(0);
    const second = taskCommand('start', { root, input: input('second') });
    expect(second.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(root, '.agent', 'current', 'plan.md'), 'utf8')).toContain('second');
    expect(fs.existsSync(path.join(root, '.agent.previous'))).toBe(false);
  });

  it('requires exact task id to close owned state', () => {
    const root = repo();
    const started = taskCommand('start', { root, input: input() });
    const id = String(started.data?.task_id);
    expect(taskCommand('close', { root, taskId: 'wrong' }).exitCode).not.toBe(0);
    expect(taskCommand('close', { root, taskId: id }).exitCode).toBe(0);
    expect(fs.existsSync(path.join(root, '.agent'))).toBe(false);
  });

  it('preserves the previous task when replacement input is invalid', () => {
    const root = repo();
    const first = taskCommand('start', { root, input: input('stable') });
    expect(first.exitCode).toBe(0);
    const invalid = { ...input('broken'), plan_markdown: '' };
    expect(taskCommand('start', { root, input: invalid }).exitCode).not.toBe(0);
    expect(fs.readFileSync(path.join(root, '.agent', 'current', 'plan.md'), 'utf8')).toContain('stable');
  });

  it('refuses to adopt an unowned .agent directory', () => {
    const root = repo();
    fs.mkdirSync(path.join(root, '.agent'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agent', 'foreign.txt'), 'foreign');
    expect(taskCommand('start', { root, input: input() }).message).toContain('not owned');
    expect(fs.readFileSync(path.join(root, '.agent', 'foreign.txt'), 'utf8')).toBe('foreign');
  });

  it('rehydrates unchanged source to CONTINUE', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const result = taskCommand('rehydrate', { root });
    expect(result.exitCode).toBe(0);
    expect(result.data?.action).toBe('CONTINUE');
  });
  it('rehydrates modified dirty file to REPLAN_AFFECTED', () => {
    const root = repo();
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'version 1', 'utf8');
    spawnSync('git', ['add', 'tracked.txt'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], { cwd: root });
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'version 2', 'utf8');
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'version 3', 'utf8');
    const result = taskCommand('rehydrate', { root });
    expect(result.exitCode).toBe(0);
    expect(result.data?.action).toBe('REPLAN_AFFECTED');
  });

  it('validates plan_contract when provided and rejects invalid contract', () => {
    const root = repo();
    const baseInput = input();
    const invalidContract = {
      outcome: 'ship',
      locked_contract: 'locked',
      requirements: [{ id: 'R1', change_kind: 'MODIFY', statement: 'do', acceptance: ['GHOST'] }],
      acceptance: [{ id: 'A1', claim: 'claim', proof: 'proof' }],
      slices: [{ id: 'S1', change: 'c', change_kind: 'MODIFY', requirements: ['R1'], acceptance: ['A1'], source_proof: ['p'], runtime_proof: [] }],
      escalation_boundary: ['stop'],
    };
    const bad = taskCommand('start', { root, input: { ...baseInput, plan_contract: invalidContract } });
    expect(bad.exitCode).not.toBe(0);
    expect(bad.message).toContain('Invalid plan contract');
  });

  it('git exclude excludes both .agent and .agents', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('/.agent/');
    expect(exclude).toContain('/.agents/');
  });

  it('task update detects stall when failure repeats without evidence delta', () => {
    const root = repo();
    const start = taskCommand('start', { root, input: input() });
    expect(start.exitCode).toBe(0);
    const current = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    const failure = {
      fingerprint: 'ERR-1',
      category: 'IMPLEMENTATION' as const,
      source_binding: 'commit-1',
      repeat_count: 1,
      evidence_delta: [],
    };
    const update1 = taskCommand('update', { root, input: { ...current, revision: 2, last_failure: failure } });
    expect(update1.exitCode).toBe(0);
    const stateAfter1 = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    const update2 = taskCommand('update', { root, input: { ...stateAfter1, revision: 3, last_failure: failure } });
    expect(update2.exitCode).not.toBe(0);
    expect(update2.message).toContain('Stall detected');
  });

  it('projects only selected explicit skills to the repository-local host surface', () => {
    const root = repo();
    const result = taskCommand('start', { root, host: 'codex', input: input('browser', ['playwright-cli']) });
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'playwright-cli', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'impeccable', 'SKILL.md'))).toBe(false);
  });

  it('does not create a repository-local surface for implicit-only selection', () => {
    const root = repo();
    const result = taskCommand('start', { root, host: 'codex', input: input('proof', ['verification-router']) });
    expect(result.exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    expect(state.selected_skill_ids).toEqual(['verification-router']);
    expect(state.skill_projection).toBeNull();
    expect(fs.existsSync(path.join(root, '.agents'))).toBe(false);
  });

  it('selecting Prisma skills does not project UI/browser skills', () => {
    const root = repo();
    expect(taskCommand('start', { root, host: 'codex', input: input('db', ['prisma-cli', 'prisma-client-api']) }).exitCode).toBe(0);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'prisma-cli', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'playwright-cli'))).toBe(false);
  });
  it('task update replaces selected explicit skills transactionally', () => {
    const root = repo();
    expect(taskCommand('start', { root, host: 'codex', input: input('first', ['playwright-cli']) }).exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    state.revision += 1;
    state.selected_skill_ids = ['systematic-debugging'];
    state.decisions = [{ id: 'SKILL-SELECTION-1', decision: 'Use systematic debugging', reason: 'Current accepted debugging scope requires root-cause procedure', reopen_if: [] }];
    const updated = taskCommand('update', { root, host: 'codex', input: state });
    expect(updated.exitCode, updated.message).toBe(0);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'playwright-cli'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'systematic-debugging', 'SKILL.md'))).toBe(true);
  });

  it('task update to implicit-only removes the owned projection surface', () => {
    const root = repo();
    expect(taskCommand('start', { root, host: 'codex', input: input('first', ['playwright-cli']) }).exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    state.revision += 1;
    state.selected_skill_ids = ['verification-router'];
    state.decisions = [{ id: 'SKILL-SELECTION-IMPLICIT', decision: 'Return to base proof selection', reason: 'No explicit capability remains in accepted scope', reopen_if: [] }];
    const updated = taskCommand('update', { root, host: 'codex', input: state });
    expect(updated.exitCode, updated.message).toBe(0);
    const next = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    expect(next.skill_projection).toBeNull();
    expect(next.projected_skill_ids).toEqual([]);
    expect(fs.existsSync(path.join(root, '.agents'))).toBe(false);
  });

  it('new plan replaces owned explicit projections and close preserves user skills', () => {
    const root = repo();
    const user = path.join(root, '.agents', 'skills', 'user-owned');
    fs.mkdirSync(user, { recursive: true });
    fs.writeFileSync(path.join(user, 'SKILL.md'), 'user');
    expect(taskCommand('start', { root, host: 'codex', input: input('browser', ['playwright-cli']) }).exitCode).toBe(0);
    expect(taskCommand('start', { root, host: 'codex', input: input('debug', ['systematic-debugging']) }).exitCode).toBe(0);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'playwright-cli'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'systematic-debugging', 'SKILL.md'))).toBe(true);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8')) as { task_id: string };
    expect(taskCommand('close', { root, taskId: state.task_id }).exitCode).toBe(0);
    expect(fs.existsSync(user)).toBe(true);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'systematic-debugging'))).toBe(false);
  });

  it('fails closed on a same-name different-hash collision', () => {
    const root = repo();
    const collision = path.join(root, '.agents', 'skills', 'playwright-cli');
    fs.mkdirSync(collision, { recursive: true });
    fs.writeFileSync(path.join(collision, 'SKILL.md'), 'different');
    const result = taskCommand('start', { root, host: 'codex', input: input('browser', ['playwright-cli']) });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toMatch(/NEEDS_USER/);
  });

  it('reuses an identical unowned task-local skill without taking ownership', () => {
    const root = repo();
    const target = path.join(root, '.agents', 'skills', 'playwright-cli');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(resolveRuntimeAssetsRoot(), 'skills', 'playwright-cli'), target, { recursive: true });
    expect(taskCommand('start', { root, host: 'codex', input: input('browser', ['playwright-cli']) }).exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    expect(state.projected_skill_ids).toEqual([]);
    expect(state.skill_projection.reused_skill_ids).toEqual(['playwright-cli']);
    expect(taskCommand('close', { root, taskId: state.task_id }).exitCode).toBe(0);
    expect(fs.existsSync(path.join(target, 'SKILL.md'))).toBe(true);
  });

  it('restores the previous projection when a new plan state fails validation', () => {
    const root = repo();
    expect(taskCommand('start', { root, host: 'codex', input: input('old', ['playwright-cli']) }).exitCode).toBe(0);
    const broken = input('new', ['systematic-debugging']);
    broken.state.status = 'PASS';
    expect(taskCommand('start', { root, host: 'codex', input: broken }).exitCode).not.toBe(0);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'playwright-cli', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'systematic-debugging'))).toBe(false);
  });

  it('reports unsupported when a host has no repository-local skill surface', () => {
    const root = repo();
    const result = taskCommand('start', { root, host: 'command-code', input: input('browser', ['playwright-cli']) });
    expect(result.exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8')) as { status: string; blockers: Array<{ id: string; reason: string; affected_slices: string[] }>; skill_projection: { status: string } };
    expect(state.status).toBe('PARTIAL');
    expect(state.skill_projection.status).toBe('UNSUPPORTED');
    expect(state.blockers).toContainEqual(expect.objectContaining({ id: 'SKILL-PROJECTION-UNSUPPORTED', affected_slices: ['S1'] }));
    expect(state.blockers.find((entry) => entry.id === 'SKILL-PROJECTION-UNSUPPORTED')?.reason).toMatch(/no repository-local skill surface.*no global fallback/i);
    expect(fs.existsSync(path.join(root, '.agents', 'skills', 'playwright-cli'))).toBe(false);
  });

  it('rejects task update that alters acceptance claim or required strength', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    state.revision += 1;
    state.acceptance[0].claim = 'tampered claim';
    const result = taskCommand('update', { root, input: state });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('cannot modify claim or required_strength');
  });

  it('detects changes to untracked file contents in worktree observation', () => {
    const root = repo();
    fs.writeFileSync(path.join(root, 'untracked-feature.ts'), 'export const a = 1;\n', 'utf8');
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const before = taskCommand('rehydrate', { root });
    expect(before.data?.action).toBe('CONTINUE');
    fs.writeFileSync(path.join(root, 'untracked-feature.ts'), 'export const a = 2; // modified content\n', 'utf8');
    const after = taskCommand('rehydrate', { root });
    expect(after.data?.action).toBe('REPLAN_AFFECTED');
  });

  it('preserves pre-existing user rules in git exclude after task close', () => {
    const root = repo();
    const excludePath = path.join(root, '.git', 'info', 'exclude');
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.writeFileSync(excludePath, '/user-custom-rule/\n/.agent/\n', 'utf8');
    const started = taskCommand('start', { root, input: input() });
    expect(started.exitCode).toBe(0);
    const id = String(started.data?.task_id);
    expect(taskCommand('close', { root, taskId: id }).exitCode).toBe(0);
    const afterClose = fs.readFileSync(excludePath, 'utf8');
    expect(afterClose).toContain('/user-custom-rule/');
    expect(afterClose).toContain('/.agent/');
  });

  it('rejects task update when proved slice has stale proof binding', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    state.revision += 1;
    state.slices[0].status = 'PROVED';
    state.slices[0].proof_summary = [{
      acceptance_id: 'A1',
      strength: 'STATIC',
      status: 'PASS',
      evidence: 'test passed',
      source_binding: 'stale-sha256-does-not-match-current',
    }];
    const result = taskCommand('update', { root, input: state });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('Stale proof for acceptance A1 in slice S1');
  });

  it('advances slice and records failure via worker FSM actions', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const adv = taskCommand('advance-slice', { root, input: { slice_id: 'S1', proof: 'vitest test/feature.test.ts exit code 0' } });
    expect(adv.exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    expect(state.slices[0].status).toBe('PROVED');
    expect(state.slices[0].proof_summary[0].evidence).toContain('vitest test/feature.test.ts');

    const fail = taskCommand('record-failure', { root, input: { fingerprint: 'ERR-1', reason: 'type error' } });
    expect(fail.exitCode).toBe(0);
    const afterFail = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    expect(afterFail.last_failure?.fingerprint).toBe('ERR-1');
  });

  it('executes replan via atomic plan replacement', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input('v1') }).exitCode).toBe(0);
    const replanInput = input('v2-replanned');
    replanInput.state.acceptance[0].claim = 'updated realistic claim';
    const replan = taskCommand('start', { root, input: replanInput });
    expect(replan.exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    expect(state.acceptance[0].claim).toBe('updated realistic claim');
    expect(state.outcome).toBe('v2-replanned');
  });

  it('verifier gate allows adding new tests without blocking PASS', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    fs.writeFileSync(path.join(root, 'new-feature.test.ts'), 'test("ok", () => {});\n', 'utf8');
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    state.revision += 1;
    state.status = 'PASS';
    state.acceptance[0].status = 'PROVED';
    state.slices[0].status = 'PROVED';
    const observed = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    state.slices[0].proof_summary = [{
      acceptance_id: 'A1',
      strength: 'STATIC',
      status: 'PASS',
      evidence: 'pass',
      source_binding: state.source_identity.worktree_hash,
    }];
    const result = taskCommand('update', { root, input: state });
    // Adding new tests should NOT trigger verifier check rejection
    expect(result.exitCode).toBe(0);
  });

  it('advance-slice rejects self-certification without proof evidence or with generic prose', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const noProof = taskCommand('advance-slice', { root, input: { slice_id: 'S1' } });
    expect(noProof.exitCode).not.toBe(0);
    expect(noProof.message).toContain('cannot self-certify PASS');

    const fakeProof = taskCommand('advance-slice', { root, input: { slice_id: 'S1', proof: 'trust me bro' } });
    expect(fakeProof.exitCode).not.toBe(0);
    expect(fakeProof.message).toContain('cannot self-certify PASS');
  });

  it('record-failure triggers stall detection on repeated failure without evidence delta', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    const fail1 = taskCommand('record-failure', { root, input: { fingerprint: 'ERR-STALL', reason: 'compiler failure' } });
    expect(fail1.exitCode).toBe(0);
    const fail2 = taskCommand('record-failure', { root, input: { fingerprint: 'ERR-STALL', reason: 'compiler failure' } });
    expect(fail2.exitCode).not.toBe(0);
    expect(fail2.message).toContain('Stall detected');
  });

  it('readState fails closed when plan.md or plan-contract.json is tampered with', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    fs.writeFileSync(path.join(root, '.agent', 'current', 'plan.md'), '# tampered plan content\n', 'utf8');
    const status = taskCommand('status', { root });
    expect(status.exitCode).not.toBe(0);
    expect(status.message).toContain('plan.md hash mismatch');
  });

  it('detects split-brain when PlanContract outcome contradicts state outcome', () => {
    const root = repo();
    const badInput = input();
    const contract = { ...deriveMinimalPlanContract(badInput.state), outcome: 'DIFFERENT_CONTRACT_OUTCOME' };
    const result = taskCommand('start', { root, input: { ...badInput, plan_contract: contract } });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('Task start split-brain detected');
  });

  it('readState fails closed when plan.md is deleted', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    fs.unlinkSync(path.join(root, '.agent', 'current', 'plan.md'));
    const status = taskCommand('status', { root });
    expect(status.exitCode).not.toBe(0);
    expect(status.message).toContain('active task plan is missing');
  });

  it('rejects task update that drops planned slices', () => {
    const root = repo();
    const multiSliceInput = input();
    multiSliceInput.state.slices = [
      { id: 'S1', depends_on: [], status: 'READY', requirement_ids: ['R1'], acceptance_ids: ['A1'], expected_delta: 'delta 1', preserve: [], proof_summary: [] },
      { id: 'S2', depends_on: ['S1'], status: 'PENDING', requirement_ids: ['R2'], acceptance_ids: ['A1'], expected_delta: 'delta 2', preserve: [], proof_summary: [] },
    ];
    expect(taskCommand('start', { root, input: multiSliceInput }).exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    state.revision += 1;
    // Silently drop S2
    state.slices = [state.slices[0]];
    const update = taskCommand('update', { root, input: state });
    expect(update.exitCode).not.toBe(0);
    expect(update.message).toContain('Task update cannot add or lose slice ids');
  });

  it('advance-slice derives strength from contract acceptance requirement', () => {
    const root = repo();
    expect(taskCommand('start', { root, input: input() }).exitCode).toBe(0);
    // Caller attempts to self-certify USER_VISIBLE_E2E when acceptance requires STATIC
    const adv = taskCommand('advance-slice', { root, input: { slice_id: 'S1', proof: 'ran vitest feature.test.ts', strength: 'USER_VISIBLE_E2E' as ProofStrength } });
    expect(adv.exitCode).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'current', 'state.json'), 'utf8'));
    // Must be derived as STATIC from acceptance, ignoring caller's claim
    expect(state.slices[0].proof_summary[0].strength).toBe('STATIC');
  });

  it('detects split-brain when acceptance claim contradicts contract', () => {
    const root = repo();
    const badInput = input();
    const contract = deriveMinimalPlanContract(badInput.state) as Record<string, unknown>;
    (contract.acceptance as Array<{ id: string; claim: string }>)[0].claim = 'live e2e in real browser';
    badInput.state.acceptance[0].claim = 'typechecks only';
    const result = taskCommand('start', { root, input: { ...badInput, plan_contract: contract } });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('claim in PlanContract ("live e2e in real browser") contradicts state ("typechecks only")');
  });
});
