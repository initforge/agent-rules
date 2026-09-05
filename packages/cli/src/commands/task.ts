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
  advanceFailureState,
  deriveMinimalPlanContract,
  proofSummaryIsFresh,
  type AgentTaskOwner,
  type AgentTaskState,
  type TaskStartInput,
  type SourceIdentity,
  type ProofStrength,
  type FailureCategory,
} from '@initforge/agent-rules-kernel/northstar/task-state.js';
import { validatePlanContract } from '@initforge/agent-rules-kernel/harness/planning/plan-contract.js';
import { ExitCode, type CommandResult } from '../types.js';
import { removeTaskSkillProjection, replaceTaskSkillProjection, type TaskProjectionResult } from '../runtime/task-skill-projection.js';

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

function repositoryRoot(candidate = process.cwd()): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: candidate, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? path.resolve(result.stdout.trim()) : path.resolve(candidate);
}

function taskPaths(root: string) {
  const agent = path.join(root, '.agent');
  return { agent, owner: path.join(agent, 'owner.json'), current: path.join(agent, 'current'), plan: path.join(agent, 'current', 'plan.md'), contract: path.join(agent, 'current', 'plan-contract.json'), state: path.join(agent, 'current', 'state.json') };
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
  if (!fs.existsSync(paths.plan)) {
    throw new Error('active task plan is missing: plan.md has been removed');
  }
  const planHash = sha256(fs.readFileSync(paths.plan, 'utf8'));
  if (planHash !== state.plan_sha256) {
    throw new Error(`active task plan integrity failed: plan.md hash mismatch (expected ${state.plan_sha256.slice(0, 12)}, got ${planHash.slice(0, 12)})`);
  }
  if (state.plan_contract_sha256) {
    if (!fs.existsSync(paths.contract)) {
      throw new Error('active task contract is missing: plan-contract.json has been removed');
    }
    const contractContent = fs.readFileSync(paths.contract, 'utf8').trim();
    const contractHash = sha256(contractContent);
    if (contractHash !== state.plan_contract_sha256) {
      throw new Error(`active task contract integrity failed: plan-contract.json hash mismatch (expected ${state.plan_contract_sha256.slice(0, 12)}, got ${contractHash.slice(0, 12)})`);
    }
  }
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
  const beginMarker = '# BEGIN agent-rules active task state';
  const endMarker = '# END agent-rules active task state';
  const legacyMarker = '# agent-rules active task state';
  const rules = ['/.agent/', '/.agents/'];
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8').replace(/\r\n?/g, '\n') : '';
  const lines = current.split('\n');
  const preserved: string[] = [];
  let inManagedBlock = false;
  let skipLegacyRules = 0;
  for (const line of lines) {
    if (line === beginMarker) {
      inManagedBlock = true;
      continue;
    }
    if (line === endMarker) {
      inManagedBlock = false;
      continue;
    }
    if (line === legacyMarker) {
      skipLegacyRules = 2;
      continue;
    }
    if (skipLegacyRules > 0 && rules.includes(line.trim())) {
      skipLegacyRules--;
      continue;
    }
    skipLegacyRules = 0;
    if (!inManagedBlock) {
      preserved.push(line);
    }
  }
  if (enabled) {
    preserved.push(beginMarker, ...rules, endMarker);
  }
  fs.writeFileSync(exclude, `${preserved.filter(Boolean).join('\n')}${preserved.some(Boolean) ? '\n' : ''}`, 'utf8');
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

  let contractToValidate = input.plan_contract;
  if (!contractToValidate && input.plan_markdown) {
    const match = input.plan_markdown.match(/```(?:json\s+plan-contract|json:plan-contract|json)\s*\n([\s\S]*?)\n```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed === 'object' && parsed !== null && ('outcome' in parsed || 'requirements' in parsed)) {
          contractToValidate = parsed;
        }
      } catch {}
    }
  }
  if (!contractToValidate) {
    contractToValidate = deriveMinimalPlanContract(input.state);
  }
  const contractCheck = validatePlanContract(contractToValidate);
  if (!contractCheck.ok) {
    return { exitCode: ExitCode.ValidationFailed, message: `Invalid plan contract: ${contractCheck.issues.map((i) => i.message).join('; ')}` };
  }
  const contractObj = contractToValidate as {
    outcome?: string;
    acceptance?: Array<{ id: string; claim: string; required_strength?: ProofStrength }>;
    slices?: Array<{ id: string; depends_on?: string[]; change?: string; requirements?: string[]; acceptance?: string[] }>;
  };
  if (contractObj.outcome && input.state.outcome && contractObj.outcome.trim() !== input.state.outcome.trim()) {
    return { exitCode: ExitCode.ValidationFailed, message: `Task start split-brain detected: PlanContract outcome ("${contractObj.outcome}") contradicts state outcome ("${input.state.outcome}")` };
  }
  if (contractObj.acceptance && input.state.acceptance) {
    const contractAccMap = new Map(contractObj.acceptance.map((a) => [a.id, a]));
    const stateAccMap = new Map(input.state.acceptance.map((a) => [a.id, a]));
    for (const [id, cAcc] of contractAccMap) {
      const sAcc = stateAccMap.get(id);
      if (!sAcc) {
        return { exitCode: ExitCode.ValidationFailed, message: `Task start split-brain: acceptance ${id} in PlanContract is missing from task state` };
      }
      if (cAcc.claim && sAcc.claim && cAcc.claim.trim() !== sAcc.claim.trim()) {
        return { exitCode: ExitCode.ValidationFailed, message: `Task start split-brain: acceptance ${id} claim in PlanContract ("${cAcc.claim}") contradicts state ("${sAcc.claim}")` };
      }
    }
    for (const id of stateAccMap.keys()) {
      if (!contractAccMap.has(id)) {
        return { exitCode: ExitCode.ValidationFailed, message: `Task start split-brain: acceptance ${id} in task state is missing from PlanContract` };
      }
    }
  }
  const contractPayload = `${JSON.stringify(contractToValidate, null, 2)}\n`;
  const contractHash = sha256(contractPayload.trim());

  const normalizedPlanMarkdown = input.plan_markdown.endsWith('\n') ? input.plan_markdown : `${input.plan_markdown}\n`;
  const planHash = sha256(normalizedPlanMarkdown);
  const now = new Date().toISOString();
  const taskId = input.state.task_id?.trim() || `TASK-${sha256(`${planHash}\0${now}`).slice(0, 20)}`;
  let priorState: AgentTaskState | null = null;
  if (fs.existsSync(taskPaths(root).agent)) priorState = readState(root);
  const requested = input.state.selected_skill_ids ?? [];
  const projectionHost = host ?? input.state.skill_projection?.host ?? priorState?.skill_projection?.host ?? process.env.AGENT_RULES_HOST;
  if (requested.length > 0 && !projectionHost) return { exitCode: ExitCode.ValidationFailed, message: 'task start with selected skills requires --host or AGENT_RULES_HOST' };
  const projection = replaceTaskSkillProjection(root, projectionHost ?? 'unsupported', requested, priorState?.skill_projection ?? null);

  const observed = sourceObservation(root);
  const sourceIdentity: SourceIdentity = {
    repository: observed.repository,
    branch: observed.branch || undefined,
    head: observed.head || undefined,
    worktree_hash: observed.worktree_hash,
    revalidate_when: input.state.source_identity?.revalidate_when ?? ['source changes'],
  };

  const state = withProjectionOutcome({
    ...input.state,
    schema: TASK_STATE_SCHEMA,
    task_id: taskId,
    revision: 1,
    plan_sha256: planHash,
    plan_contract_sha256: contractHash,
    source_identity: sourceIdentity,
    raw_user_intent: input.raw_user_intent ?? input.state.raw_user_intent,
    selected_skill_ids: projection.selected,
    projected_skill_ids: projection.projected,
    skill_projection: projection.projection,
    updated_at: now,
  }, projectionHost ?? 'unsupported', projection.projection, projection.selected);
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
    fs.writeFileSync(path.join(next, 'current', 'plan.md'), normalizedPlanMarkdown, 'utf8');
    fs.writeFileSync(path.join(next, 'current', 'plan-contract.json'), contractPayload, 'utf8');
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
  const observed = sourceObservation(root);
  const immutableMismatch = next.task_id !== current.task_id || next.plan_sha256 !== current.plan_sha256 || next.outcome !== current.outcome || JSON.stringify(next.locked_constraints) !== JSON.stringify(current.locked_constraints);
  if (immutableMismatch) return { exitCode: ExitCode.ValidationFailed, message: 'Task update cannot change task id, plan hash, outcome, or locked constraints' };
  if (next.revision !== current.revision + 1) return { exitCode: ExitCode.ValidationFailed, message: `Task update revision must be ${current.revision + 1}` };
  const existingAcceptanceMap = new Map(current.acceptance.map((entry) => [entry.id, entry]));
  for (const acc of next.acceptance) {
    const prior = existingAcceptanceMap.get(acc.id);
    if (!prior) return { exitCode: ExitCode.ValidationFailed, message: 'Task update cannot add or lose acceptance ids; start a new plan instead' };
    if (acc.claim !== prior.claim || acc.required_strength !== prior.required_strength) {
      return { exitCode: ExitCode.ValidationFailed, message: `Task update cannot modify claim or required_strength for acceptance ${acc.id}; start a new plan or replan instead` };
    }
  }
  if (next.acceptance.length !== current.acceptance.length) return { exitCode: ExitCode.ValidationFailed, message: 'Task update cannot add or lose acceptance ids; start a new plan instead' };
  const existingSliceIds = new Set(current.slices.map((s) => s.id));
  if (next.slices.some((s) => !existingSliceIds.has(s.id)) || next.slices.length !== current.slices.length) {
    return { exitCode: ExitCode.ValidationFailed, message: 'Task update cannot add or lose slice ids; start a new plan instead' };
  }
  for (const slice of next.slices.filter((s) => s.status === 'PROVED')) {
    for (const proof of slice.proof_summary ?? []) {
      const isFresh = proofSummaryIsFresh(proof, {
        source_binding: current.source_identity.worktree_hash,
        environment_binding: current.source_identity.repository,
      }) || (proof.source_binding === observed.worktree_hash && (proof.status === 'PASS' || proof.status === 'PRE-EXISTING'));
      if (!isFresh && proof.status === 'PASS') {
        return {
          exitCode: ExitCode.ValidationFailed,
          message: `Stale proof for acceptance ${proof.acceptance_id} in slice ${slice.id}: source code or environment has changed since proof was captured`,
        };
      }
    }
  }
  for (const prior of current.slices.filter((slice) => slice.status === 'PROVED')) {
    const changed = next.slices.find((slice) => slice.id === prior.id);
    if (changed && changed.status !== 'PROVED' && !next.assumptions.some((assumption) => assumption.status === 'INVALIDATED' && assumption.evidence.some((evidence) => evidence.includes(prior.id)))) {
      return { exitCode: ExitCode.ValidationFailed, message: `Proved slice ${prior.id} may regress only with explicit invalidation evidence` };
    }
  }

  let failureToRecord = next.last_failure;
  if (failureToRecord) {
    const progress = advanceFailureState(current.last_failure, failureToRecord);
    failureToRecord = progress.failure;
    if (progress.replan_required && next.status !== 'BLOCKED' && next.status !== 'NEEDS_USER') {
      return {
        exitCode: ExitCode.ValidationFailed,
        message: `Stall detected: failure "${progress.failure.fingerprint}" repeated ${progress.failure.repeat_count} times without evidence delta; replan is required`,
      };
    }
  }

  let projectionResult: TaskProjectionResult | null = null;
  const selectionChanged = JSON.stringify(next.selected_skill_ids) !== JSON.stringify(current.selected_skill_ids)
    || (next.selected_skill_ids.length > 0 && current.skill_projection === null)
    || (current.skill_projection !== null && current.projected_skill_ids.length === 0 && (current.skill_projection.reused_skill_ids?.length ?? 0) === 0);
  const verifiedSourceIdentity = (next.source_identity?.worktree_hash === observed.worktree_hash)
    ? {
        ...current.source_identity,
        worktree_hash: observed.worktree_hash,
        head: observed.head || current.source_identity.head,
        branch: observed.branch || current.source_identity.branch,
      }
    : current.source_identity;

  let normalized: AgentTaskState = {
    ...next,
    source_identity: verifiedSourceIdentity,
    plan_contract_sha256: current.plan_contract_sha256,
    raw_user_intent: current.raw_user_intent,
    intent_reconciliation: next.intent_reconciliation,
    last_failure: failureToRecord,
    updated_at: new Date().toISOString(),
  };
  if (selectionChanged) {
    const selectionDecision = next.decisions.find((decision) => /^SKILL-SELECTION-/i.test(decision.id) && decision.reason.trim().length > 0);
    if (!selectionDecision) return { exitCode: ExitCode.ValidationFailed, message: 'selected-skill update requires a SKILL-SELECTION-* decision with scope/source evidence' };
    const projectionHost = host ?? next.skill_projection?.host ?? current.skill_projection?.host ?? process.env.AGENT_RULES_HOST;
    if (!projectionHost && next.selected_skill_ids.length > 0) return { exitCode: ExitCode.ValidationFailed, message: 'selected-skill update requires --host or AGENT_RULES_HOST' };
    projectionResult = replaceTaskSkillProjection(root, projectionHost ?? 'unsupported', next.selected_skill_ids, current.skill_projection);
    normalized = withProjectionOutcome({ ...normalized, selected_skill_ids: projectionResult.selected, projected_skill_ids: projectionResult.projected, skill_projection: projectionResult.projection }, projectionHost ?? 'unsupported', projectionResult.projection, projectionResult.selected);
  }
  const check = validateTaskState(normalized);
  if (normalized.status === 'PASS' && current.raw_user_intent) {
    if (normalized.intent_reconciliation && normalized.intent_reconciliation.aligned === false && !normalized.intent_reconciliation.deviation_explanation?.trim()) {
      return { exitCode: ExitCode.ValidationFailed, message: 'Task completion deviates from raw user intent without an explicit deviation explanation' };
    }
  }
  if (normalized.status === 'PASS') {
    const diffStat = spawnSync('git', ['diff', 'HEAD', '--name-status'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout ?? '';
    const modifiedPreExistingTests = diffStat
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((line) => {
        const [status, ...parts] = line.split(/\s+/);
        const filePath = parts.join(' ');
        const isModifiedOrDeleted = status.startsWith('M') || status.startsWith('D');
        const isTestFile = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[a-z]+$/i.test(filePath);
        return isModifiedOrDeleted && isTestFile;
      })
      .map((line) => line.split(/\s+/).slice(1).join(' '));
    if (modifiedPreExistingTests.length > 0) {
      const hasTestDecision = normalized.decisions.some((d) => /^TEST-(?:MODIFICATION|REFACTOR)-/i.test(d.id) && d.reason.trim().length >= 20);
      if (!hasTestDecision) {
        return {
          exitCode: ExitCode.ValidationFailed,
          message: `Verifier integrity check failed: pre-existing test files were modified or deleted (${modifiedPreExistingTests.join(', ')}). A TEST-MODIFICATION decision explaining test changes is required before marking task PASS. (Adding new test files is always allowed).`,
        };
      }
    }
  }
  if (!check.ok) { projectionResult?.rollback(); return { exitCode: ExitCode.ValidationFailed, message: `Invalid task update: ${check.issues.join('; ')}` }; }
  try { writeAtomic(taskPaths(root).state, `${JSON.stringify(normalized, null, 2)}\n`); projectionResult?.commit(); }
  catch (error) { projectionResult?.rollback(); throw error; }
  return { exitCode: ExitCode.Success, message: `Task updated: ${normalized.task_id} revision ${normalized.revision}`, data: normalized as unknown as Record<string, unknown> };
}

function sourceObservation(root: string) {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const head = headResult.status === 0 ? headResult.stdout.trim() : '';
  const status = (spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout ?? '').replace(/\r\n?/g, '\n');
  const diffArgs = head ? ['diff', 'HEAD'] : ['diff'];
  const diff = (spawnSync('git', diffArgs, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout ?? '').replace(/\r\n?/g, '\n');
  const untrackedFiles = (spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  let untrackedPayloads = '';
  if (untrackedFiles.length > 0) {
    const hashResult = spawnSync('git', ['hash-object', '--stdin-paths'], {
      cwd: root,
      input: untrackedFiles.join('\n') + '\n',
      encoding: 'utf8',
      windowsHide: true,
    });
    if (hashResult.status === 0 && hashResult.stdout) {
      const hashes = hashResult.stdout.trim().split(/\r?\n/);
      untrackedPayloads = untrackedFiles.map((file, idx) => `${file}:${hashes[idx] || 'missing'}`).join('\n');
    } else {
      untrackedPayloads = untrackedFiles.join('\n');
    }
  }
  const worktreePayload = `${head}\n---status---\n${status}\n---diff---\n${diff}\n---untracked---\n${untrackedPayloads}`;
  return { repository: fs.realpathSync(root), branch, head, worktree_hash: sha256(worktreePayload) };
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
      const contract = fs.existsSync(taskPaths(root).contract) ? JSON.parse(fs.readFileSync(taskPaths(root).contract, 'utf8')) : null;
      return { exitCode: ExitCode.Success, message: `Portable checkpoint for ${state.task_id}`, data: { plan, contract, state: { ...state, decisions: state.decisions, assumptions: state.assumptions, slices: state.slices.filter((slice) => slice.status !== 'PENDING' || slice.id === state.current_slice) } } };
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
    if (action === 'advance-slice') {
      const state = readState(root);
      const input = (options.input ?? readStdinJson()) as { slice_id?: string; id?: string; proof?: string; acceptance_id?: string; strength?: ProofStrength };
      const sliceId = input.slice_id || input.id;
      if (!sliceId) return { exitCode: ExitCode.InvalidArgument, message: 'advance-slice requires slice_id or id' };
      const proofText = input.proof?.trim() ?? '';
      if (!proofText || proofText.length < 15 || /^(trust me|trust me bro|passed|it works|ok|done|verified|all good|tests pass)$/i.test(proofText)) {
        return { exitCode: ExitCode.ValidationFailed, message: `advance-slice rejected self-certified PASS for ${sliceId}: model prose ("${proofText}") cannot self-certify PASS without verifiable execution details` };
      }
      const targetSlice = state.slices.find((s) => s.id === sliceId);
      if (!targetSlice) return { exitCode: ExitCode.ValidationFailed, message: `Slice ${sliceId} not found` };
      const observed = sourceObservation(root);
      const updatedSlices = state.slices.map((s) => {
        if (s.id !== sliceId) return s;
        const proofList = [...(s.proof_summary ?? [])];
        const accId = input.acceptance_id ?? s.acceptance_ids?.[0] ?? state.acceptance[0]?.id;
        if (accId) {
          const targetAcc = state.acceptance.find((a) => a.id === accId);
          const derivedStrength = targetAcc?.required_strength ?? 'STATIC';
          proofList.push({
            acceptance_id: accId,
            strength: derivedStrength,
            status: 'PASS',
            evidence: proofText,
            source_binding: observed.worktree_hash,
            verified_at: new Date().toISOString(),
          });
        }
        return { ...s, status: 'PROVED' as const, proof_summary: proofList };
      });
      const nextSlice = updatedSlices.find((s) => s.status === 'READY' || s.status === 'PENDING')?.id ?? null;
      const nextState: AgentTaskState = {
        ...state,
        revision: state.revision + 1,
        slices: updatedSlices,
        current_slice: nextSlice,
        source_identity: {
          ...state.source_identity,
          worktree_hash: observed.worktree_hash,
          head: observed.head || state.source_identity.head,
          branch: observed.branch || state.source_identity.branch,
        },
        updated_at: new Date().toISOString(),
      };
      return updateTask(root, nextState, options.host);
    }
    if (action === 'record-failure') {
      const state = readState(root);
      const input = (options.input ?? readStdinJson()) as { fingerprint: string; category?: FailureCategory; reason: string; evidence_delta?: string[] };
      if (!input.fingerprint || !input.reason) return { exitCode: ExitCode.InvalidArgument, message: 'record-failure requires fingerprint and reason' };
      const observed = sourceObservation(root);
      const samePriorFailure = state.last_failure?.fingerprint === input.fingerprint;
      const explicitDelta = input.evidence_delta && input.evidence_delta.length > 0
        ? input.evidence_delta
        : (samePriorFailure ? [] : [input.reason]);
      const candidate = {
        fingerprint: input.fingerprint,
        category: input.category ?? 'IMPLEMENTATION',
        source_binding: observed.worktree_hash,
        evidence_delta: explicitDelta,
      };
      const progress = advanceFailureState(state.last_failure, candidate);
      const nextState: AgentTaskState = {
        ...state,
        revision: state.revision + 1,
        last_failure: progress.failure,
        updated_at: new Date().toISOString(),
      };
      return updateTask(root, nextState, options.host);
    }
    return { exitCode: ExitCode.InvalidArgument, message: 'Task action must be start|status|update|rehydrate|export|close|advance-slice|record-failure' };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) };
  }
}
