import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { taskCommand } from '../src/commands/task.js';
import { resolveRuntimeAssetsRoot } from '../src/runtime/locator.js';
import { TASK_START_SCHEMA, type TaskStartInput } from '@initforge/agent-rules-kernel/northstar/task-state.js';

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
});
