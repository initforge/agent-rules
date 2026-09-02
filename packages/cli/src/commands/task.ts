import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  TASK_OWNER_SCHEMA,
  TASK_START_SCHEMA,
  TASK_STATE_SCHEMA,
  validateTaskStartInput,
  validateTaskState,
  compactTaskFrontier,
  type AgentTaskOwner,
  type AgentTaskState,
  type TaskStartInput,
} from '@initforge/agent-rules-kernel/northstar/task-state.js';
import { ExitCode, type CommandResult } from '../types.js';
import { removeTaskSkillProjection, replaceTaskSkillProjection } from '../runtime/task-skill-projection.js';

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

function repositoryRoot(candidate = process.cwd()): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: candidate, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? path.resolve(result.stdout.trim()) : path.resolve(candidate);
}

function taskPaths(root: string) {
  const agent = path.join(root, '.agent');
  return { agent, owner: path.join(agent, 'owner.json'), current: path.join(agent, 'current'), plan: path.join(agent, 'current', 'plan.md'), state: path.join(agent, 'current', 'state.json') };
}

function repoIdentity(root: string): string { return sha256(fs.realpathSync(root).toLowerCase()); }

function ownerFor(root: string): AgentTaskOwner {
  return { schema: TASK_OWNER_SCHEMA, repository_realpath: fs.realpathSync(root), repository_identity: repoIdentity(root), created_by: '@initforge/agent-rules' };
}

function readOwner(root: string): AgentTaskOwner {
  const paths = taskPaths(root);
  if (!fs.existsSync(paths.owner)) throw new Error('existing .agent is not owned by Agent Rules');
  const stat = fs.lstatSync(paths.agent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('.agent is not a safe owned directory');
  const owner = JSON.parse(fs.readFileSync(paths.owner, 'utf8')) as AgentTaskOwner;
  if (owner.schema !== TASK_OWNER_SCHEMA || owner.created_by !== '@initforge/agent-rules' || owner.repository_identity !== repoIdentity(root) || path.resolve(owner.repository_realpath) !== fs.realpathSync(root)) {
    throw new Error('existing .agent ownership does not match this repository');
  }
  return owner;
}

function readState(root: string): AgentTaskState {
  const paths = taskPaths(root);
  readOwner(root);
  if (!fs.existsSync(paths.state)) throw new Error('active task state is missing');
  const state = JSON.parse(fs.readFileSync(paths.state, 'utf8')) as AgentTaskState;
  const validation = validateTaskState(state);
  if (!validation.ok) throw new Error(`active task state is invalid: ${validation.issues.join('; ')}`);
  return state;
}

function readStdinJson(): unknown {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('JSON stdin is required');
  return JSON.parse(raw);
}

function ensureGitExclude(root: string, enabled: boolean): void {
  const gitDirResult = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (gitDirResult.status !== 0) return;
  const gitDir = path.resolve(root, gitDirResult.stdout.trim());
  const exclude = path.join(gitDir, 'info', 'exclude');
  const marker = '# agent-rules active task state';
  const rule = '/.agent/';
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8').replace(/\r\n?/g, '\n') : '';
  const lines = current.split('\n').filter((line) => line !== marker && line !== rule);
  if (enabled) lines.push(marker, rule);
  fs.writeFileSync(exclude, `${lines.filter(Boolean).join('\n')}${lines.some(Boolean) ? '\n' : ''}`, 'utf8');
}

function writeAtomic(file: string, value: string): void {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const backup = `${file}.backup-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, value, 'utf8');
  try {
    if (fs.existsSync(file)) fs.renameSync(file, backup);
    fs.renameSync(temp, file);
    fs.rmSync(backup, { force: true });
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
      if (!fs.existsSync(file) && fs.existsSync(backup)) fs.renameSync(backup, file);
    } catch {}
    throw error;
  }
}

const SKILL_PROJECTION_BLOCKER = 'SKILL-PROJECTION-UNSUPPORTED';

function withProjectionOutcome(state: AgentTaskState, host: string, projection: AgentTaskState['skill_projection'], selected: readonly string[]): AgentTaskState {
  const blockers = state.blockers.filter((blocker) => blocker.id !== SKILL_PROJECTION_BLOCKER);
  if (projection?.status !== 'UNSUPPORTED') return { ...state, blockers };
  const affected = state.current_slice ? [state.current_slice] : [];
  return {
    ...state,
    status: state.status === 'NEEDS_USER' ? 'NEEDS_USER' : 'PARTIAL',
    blockers: [...blockers, {
      id: SKILL_PROJECTION_BLOCKER,
      reason: `Host ${host} has no repository-local skill surface; selected explicit skills (${selected.join(', ')}) were not projected and no global fallback was used.`,
      affected_slices: affected,
    }],
  };
}

function startTask(root: string, input: TaskStartInput, host?: string): CommandResult {
  const inputCheck = validateTaskStartInput(input);
  if (!inputCheck.ok) return { exitCode: ExitCode.ValidationFailed, message: `Invalid task start input: ${inputCheck.issues.join('; ')}` };
  const planHash = sha256(input.plan_markdown);
  const now = new Date().toISOString();
  const taskId = input.state.task_id?.trim() || `TASK-${sha256(`${planHash}\0${now}`).slice(0, 20)}`;
  let priorState: AgentTaskState | null = null;
  if (fs.existsSync(taskPaths(root).agent)) priorState = readState(root);
  const requested = input.state.selected_skill_ids ?? [];
  const projectionHost = host ?? input.state.skill_projection?.host ?? priorState?.skill_projection?.host ?? process.env.AGENT_RULES_HOST;
  if (requested.length > 0 && !projectionHost) return { exitCode: ExitCode.ValidationFailed, message: 'task start with selected skills requires --host or AGENT_RULES_HOST' };
  const projection = replaceTaskSkillProjection(root, projectionHost ?? 'unsupported', requested, priorState?.skill_projection ?? null);
  const state = withProjectionOutcome({ ...input.state, schema: TASK_STATE_SCHEMA, task_id: taskId, revision: 1, plan_sha256: planHash, selected_skill_ids: projection.selected, projected_skill_ids: projection.projected, skill_projection: projection.projection, updated_at: now }, projectionHost ?? 'unsupported', projection.projection, projection.selected);
  const stateCheck = validateTaskState(state);
  if (!stateCheck.ok) { projection.rollback(); return { exitCode: ExitCode.ValidationFailed, message: `Invalid task state: ${stateCheck.issues.join('; ')}` }; }

  const paths = taskPaths(root);
  const hadPrevious = fs.existsSync(paths.agent);
  if (hadPrevious) readOwner(root);
  const next = path.join(root, `.agent.next-${process.pid}-${Date.now()}`);
  const previous = path.join(root, `.agent.previous-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(path.join(next, 'current'), { recursive: true });
    fs.writeFileSync(path.join(next, 'owner.json'), `${JSON.stringify(ownerFor(root), null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(next, 'current', 'plan.md'), input.plan_markdown.endsWith('\n') ? input.plan_markdown : `${input.plan_markdown}\n`, 'utf8');
    fs.writeFileSync(path.join(next, 'current', 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    if (fs.existsSync(paths.agent)) fs.renameSync(paths.agent, previous);
    fs.renameSync(next, paths.agent);
    fs.rmSync(previous, { recursive: true, force: true });
    ensureGitExclude(root, true);
    projection.commit();
    return { exitCode: ExitCode.Success, message: `Active task started: ${taskId}`, data: { task_id: taskId, revision: 1, plan_sha256: planHash } };
  } catch (error) {
    try {
      if (fs.existsSync(paths.agent) && fs.existsSync(previous)) fs.rmSync(paths.agent, { recursive: true, force: true });
      if (!fs.existsSync(paths.agent) && fs.existsSync(previous)) fs.renameSync(previous, paths.agent);
      if (!hadPrevious && fs.existsSync(paths.agent)) fs.rmSync(paths.agent, { recursive: true, force: true });
      fs.rmSync(next, { recursive: true, force: true });
      try { ensureGitExclude(root, hadPrevious); } catch {}
    } catch {}
    try { projection.rollback(); } catch {}
    return { exitCode: ExitCode.GeneralError, message: `Task start failed; previous state preserved: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function updateTask(root: string, next: AgentTaskState, host?: string): CommandResult {
  const current = readState(root);
  const immutableMismatch = next.task_id !== current.task_id || next.plan_sha256 !== current.plan_sha256 || next.outcome !== current.outcome || JSON.stringify(next.locked_constraints) !== JSON.stringify(current.locked_constraints);
  if (immutableMismatch) return { exitCode: ExitCode.ValidationFailed, message: 'Task update cannot change task id, plan hash, outcome, or locked constraints' };
  if (next.revision !== current.revision + 1) return { exitCode: ExitCode.ValidationFailed, message: `Task update revision must be ${current.revision + 1}` };
  const existingAcceptance = new Set(current.acceptance.map((entry) => entry.id));
  if (next.acceptance.some((entry) => !existingAcceptance.has(entry.id)) || next.acceptance.length !== current.acceptance.length) return { exitCode: ExitCode.ValidationFailed, message: 'Task update cannot add or lose acceptance ids; start a new plan instead' };
  for (const prior of current.slices.filter((slice) => slice.status === 'PROVED')) {
    const changed = next.slices.find((slice) => slice.id === prior.id);
    if (changed && changed.status !== 'PROVED' && !next.assumptions.some((assumption) => assumption.status === 'INVALIDATED' && assumption.evidence.some((evidence) => evidence.includes(prior.id)))) {
      return { exitCode: ExitCode.ValidationFailed, message: `Proved slice ${prior.id} may regress only with explicit invalidation evidence` };
    }
  }
  let projectionResult: ReturnType<typeof replaceTaskSkillProjection> | null = null;
  const selectionChanged = JSON.stringify(next.selected_skill_ids) !== JSON.stringify(current.selected_skill_ids)
    || (next.selected_skill_ids.length > 0 && current.skill_projection === null)
    || (current.skill_projection !== null && current.projected_skill_ids.length === 0 && (current.skill_projection.reused_skill_ids?.length ?? 0) === 0);
  let normalized: AgentTaskState = { ...next, schema: TASK_STATE_SCHEMA, updated_at: new Date().toISOString() };
  if (selectionChanged) {
    const selectionDecision = next.decisions.find((decision) => /^SKILL-SELECTION-/i.test(decision.id) && decision.reason.trim().length > 0);
    if (!selectionDecision) return { exitCode: ExitCode.ValidationFailed, message: 'selected-skill update requires a SKILL-SELECTION-* decision with scope/source evidence' };
    const projectionHost = host ?? next.skill_projection?.host ?? current.skill_projection?.host ?? process.env.AGENT_RULES_HOST;
    if (!projectionHost && next.selected_skill_ids.length > 0) return { exitCode: ExitCode.ValidationFailed, message: 'selected-skill update requires --host or AGENT_RULES_HOST' };
    projectionResult = replaceTaskSkillProjection(root, projectionHost ?? 'unsupported', next.selected_skill_ids, current.skill_projection);
    normalized = withProjectionOutcome({ ...normalized, selected_skill_ids: projectionResult.selected, projected_skill_ids: projectionResult.projected, skill_projection: projectionResult.projection }, projectionHost ?? 'unsupported', projectionResult.projection, projectionResult.selected);
  }
  const check = validateTaskState(normalized);
  if (!check.ok) { projectionResult?.rollback(); return { exitCode: ExitCode.ValidationFailed, message: `Invalid task update: ${check.issues.join('; ')}` }; }
  try { writeAtomic(taskPaths(root).state, `${JSON.stringify(normalized, null, 2)}\n`); projectionResult?.commit(); }
  catch (error) { projectionResult?.rollback(); throw error; }
  return { exitCode: ExitCode.Success, message: `Task updated: ${normalized.task_id} revision ${normalized.revision}`, data: normalized as unknown as Record<string, unknown> };
}

function sourceObservation(root: string) {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim();
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim();
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.replace(/\r\n?/g, '\n');
  return { repository: fs.realpathSync(root), branch, head, worktree_hash: sha256(status) };
}

export function taskCommand(action: string, options: { stdin?: boolean; taskId?: string; root?: string; input?: unknown; host?: string } = {}): CommandResult {
  const root = repositoryRoot(options.root);
  try {
    if (action === 'start') return startTask(root, (options.input ?? readStdinJson()) as TaskStartInput, options.host);
    if (action === 'update') return updateTask(root, (options.input ?? readStdinJson()) as AgentTaskState, options.host);
    if (action === 'status') {
      const state = readState(root);
      return { exitCode: ExitCode.Success, message: `Task ${state.task_id}: ${state.status}`, data: compactTaskFrontier(state) };
    }
    if (action === 'rehydrate') {
      const state = readState(root);
      const observed = sourceObservation(root);
      const expected = state.source_identity;
      const drift = Boolean((expected.branch && expected.branch !== observed.branch) || (expected.head && expected.head !== observed.head) || (expected.worktree_hash && expected.worktree_hash !== observed.worktree_hash));
      return { exitCode: ExitCode.Success, message: drift ? 'Task source drift requires affected-slice revalidation' : 'Task can continue from the recorded frontier', data: { action: drift ? 'REPLAN_AFFECTED' : 'CONTINUE', observed, expected, current_slice: state.current_slice, next_action: state.next_action } };
    }
    if (action === 'export') {
      const state = readState(root);
      const plan = fs.readFileSync(taskPaths(root).plan, 'utf8');
      return { exitCode: ExitCode.Success, message: `Portable checkpoint for ${state.task_id}`, data: { plan, state: { ...state, decisions: state.decisions, assumptions: state.assumptions, slices: state.slices.filter((slice) => slice.status !== 'PENDING' || slice.id === state.current_slice) } } };
    }
    if (action === 'close') {
      const state = readState(root);
      if (!options.taskId || options.taskId !== state.task_id) return { exitCode: ExitCode.ValidationFailed, message: 'task close requires the exact current --task-id' };
      readOwner(root);
      removeTaskSkillProjection(state.skill_projection);
      fs.rmSync(taskPaths(root).agent, { recursive: true, force: true });
      ensureGitExclude(root, false);
      return { exitCode: ExitCode.Success, message: `Task closed and active .agent state removed: ${state.task_id}` };
    }
    return { exitCode: ExitCode.InvalidArgument, message: 'Task action must be start|status|update|rehydrate|export|close' };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) };
  }
}
