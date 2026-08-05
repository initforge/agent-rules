import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  Runner,
  tasksFromRequirements,
  DEFAULT_MAX_REPAIR_DEPTH,
  type AgentKind,
  type RunSummary,
} from '@initforge/agent-rules-engine/runner/loop';

// Local shape for the engine modules we dynamic-import at run time. The CLI
// has no compile-time dependency on the engine package; this avoids the
// NodeNext path-mapping dance for an opt-in subcommand.
interface VerifyTaskEvidence { kind: string; path: string; sha256: string; }
interface VerifyTaskStepResult { step: { kind: string }; exitCode: number; durationMs: number; evidence: VerifyTaskEvidence[]; }
interface VerifyTaskOutcome { passed: boolean; stepResults: VerifyTaskStepResult[]; evidence: VerifyTaskEvidence[]; totalDurationMs: number; }
interface VerifierModule {
  VerificationEngine: new (config: { cwd: string; evidenceDir?: string }) => { evaluate(p: unknown): Promise<VerifyTaskOutcome>; };
}
interface ProfileModule {
  liftVerification: (input: readonly string[]) => { steps: unknown[]; evidence: string[] };
}
import { TaskQueue } from '@initforge/agent-rules-engine/runner/queue';
import { Journal } from '@initforge/agent-rules-engine/runner/journal';

/**
 * `agent-rules run` — the durable runner.
 *
 * Drives tasks unattended: one short-lived headless agent process per task, all state
 * on disk, no model context in the coordinating process. Safe to leave overnight and
 * safe to kill at any point.
 *
 * Subcommands:
 *   run start [--agent claude|codex|opencode] [--max-repair-depth N] [--max-tasks N]
 *   run add "<prompt>" --verify "<cmd>" [--verify "<cmd>"] [--own <path>]
 *   run seed                     enqueue every active requirement from the plan ledger
 *   run status                   queue counts and terminal tasks
 *   run journal [--verify]       journal summary, optionally checking the hash chain
 */

const AGENTS: AgentKind[] = ['claude', 'codex', 'opencode'];

interface ParsedArgs {
  action: string;
  positional: string[];
  flags: Map<string, string[]>;
  bools: Set<string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const [action = 'status', ...rest] = args;
  const flags = new Map<string, string[]>();
  const bools = new Set<string>();
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      bools.add(name);
      continue;
    }
    if (!flags.has(name)) flags.set(name, []);
    flags.get(name)!.push(next);
    i += 1;
  }
  return { action, positional, flags, bools };
}

function currentPlan(basePath: string): { planId: string; planRoot: string; requirements: string } {
  const pointerPath = path.join(basePath, '.agent', 'state', 'current.json');
  if (!fs.existsSync(pointerPath)) {
    throw new Error('no active plan: .agent/state/current.json is missing (see .agent/README.md)');
  }
  const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as {
    plan_id: string;
    plan_root: string;
    requirements: string;
  };
  return {
    planId: pointer.plan_id,
    planRoot: path.join(basePath, pointer.plan_root),
    requirements: path.join(basePath, pointer.requirements),
  };
}

function headRevision(basePath: string): string {
  const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: basePath, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : 'unknown';
}

/**
 * Journal identity, which must be stable for the lifetime of a plan.
 *
 * It deliberately does NOT include the git HEAD: the commit changes as the runner does
 * its work, so keying identity on it makes the journal unopenable after the very first
 * commit. The revision that matters here is the ledger's schema version; the git SHA
 * is per-run data and is recorded in RUN_START instead.
 */
function journalIdentity(basePath: string, planId: string, requirementsPath: string) {
  let revision = '1';
  try {
    const match = /^version:\s*(\S+)/m.exec(fs.readFileSync(requirementsPath, 'utf8'));
    if (match) revision = match[1];
  } catch {
    /* absent ledger: fall back to the default */
  }
  return { repository: basePath, plan: planId, revision: `ledger-v${revision}` };
}

function paths(basePath: string, planId: string) {
  const planDir = path.join(basePath, '.agent', 'plans', planId);
  return {
    queueRoot: path.join(planDir, 'queue'),
    journalPath: path.join(planDir, 'journal.jsonl'),
    logDir: path.join(basePath, '.agent', 'artifacts', 'runner-logs'),
  };
}

export async function runnerCmd(args: string[], basePath = process.cwd()): Promise<unknown> {
  const { action, positional, flags, bools } = parseArgs(args);
  const plan = currentPlan(basePath);
  const layout = paths(basePath, plan.planId);

  switch (action) {
    case 'add': {
      const prompt = positional[0];
      if (!prompt) throw new Error('usage: run add "<prompt>" --verify "<command>" [--own <path>]');
      const verification = flags.get('verify') ?? [];
      if (verification.length === 0) {
        // A task with no command could never be closed — that is precisely how prose
        // acceptance criteria produced reviews that never terminated.
        throw new Error('at least one --verify <command> is required; a task with no command can never close');
      }
      const queue = new TaskQueue(layout.queueRoot);
      const task = queue.add({
        prompt,
        verification,
        ownedPaths: flags.get('own') ?? [],
        repairDepth: 0,
        requirementId: flags.get('requirement')?.[0],
      });
      return { added: task.id, verification: task.verification, ownedPaths: task.ownedPaths };
    }

    case 'seed': {
      const owned = flags.get('own') ?? [];
      const tasks = tasksFromRequirements(plan.requirements, owned);
      const queue = new TaskQueue(layout.queueRoot);
      const added = tasks.map((t) => queue.add(t).id);
      return { plan: plan.planId, seeded: added.length, taskIds: added };
    }

    case 'start': {
      const agent = (flags.get('agent')?.[0] ?? 'claude') as AgentKind;
      if (!AGENTS.includes(agent)) {
        throw new Error(`unknown --agent "${agent}"; expected one of ${AGENTS.join(', ')}`);
      }
      const maxRepairDepth = Number(flags.get('max-repair-depth')?.[0] ?? DEFAULT_MAX_REPAIR_DEPTH);
      if (!Number.isInteger(maxRepairDepth) || maxRepairDepth < 0) {
        throw new Error('--max-repair-depth must be a non-negative integer');
      }
      const maxTasksRaw = flags.get('max-tasks')?.[0];
      const timeoutRaw = flags.get('task-timeout-ms')?.[0];

      const runner = new Runner({
        cwd: basePath,
        queueRoot: layout.queueRoot,
        journalPath: layout.journalPath,
        logDir: layout.logDir,
        identity: journalIdentity(basePath, plan.planId, plan.requirements),
        agent,
        // The git SHA is per-run data, not identity: it changes as the runner commits.
        runContext: { gitHead: headRevision(basePath) },
        maxRepairDepth,
        maxTasks: maxTasksRaw === undefined ? undefined : Number(maxTasksRaw),
        taskTimeoutMs: timeoutRaw === undefined ? undefined : Number(timeoutRaw),
        permissionMode: flags.get('permission-mode')?.[0],
      });

      // Ctrl-C finishes the task in flight rather than orphaning it, so the journal
      // stays a complete record of what ran.
      const stop = () => runner.requestStop();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);

      const summary: RunSummary = await runner.run();
      return {
        plan: plan.planId,
        agent,
        maxRepairDepth,
        ...summary,
        // Reports can be long; the journal holds the durable detail.
        reports: summary.reports.map((r) => ({
          taskId: r.taskId,
          outcome: r.outcome,
          reason: r.reason,
          filesChanged: r.filesChanged.length,
        })),
      };
    }

    case 'status': {
      const queue = new TaskQueue(layout.queueRoot);
      return {
        plan: plan.planId,
        counts: queue.counts(),
        needsUser: queue.list('needs-user').map((t) => ({
          id: t.id,
          requirementId: t.requirementId,
          repairDepth: t.repairDepth,
          reason: t.reason,
        })),
        failed: queue.list('failed').map((t) => ({ id: t.id, reason: t.reason })),
      };
    }

    case 'journal': {
      if (!fs.existsSync(layout.journalPath)) {
        return { plan: plan.planId, records: 0, note: 'no journal yet — the runner has not run' };
      }
      const journal = new Journal(layout.journalPath, journalIdentity(basePath, plan.planId, plan.requirements));
      if (bools.has('verify')) return { plan: plan.planId, ...journal.verify() };

      const records = journal.read();
      const byType = new Map<string, number>();
      for (const r of records) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
      return {
        plan: plan.planId,
        records: records.length,
        chainVerified: true,
        byType: Object.fromEntries([...byType].sort()),
        last: records.at(-1)?.type,
      };
    }

    case 'verify-task': {
      // Re-runs a single task's verification profile from the queue.
      // Useful for re-driving a Playwright / browser-script / mcp-tool-call
      // step on the most recent state of the repo, without re-spawning
      // the agent. Pure shell verification re-runs as well.
      const taskId = positional[0];
      if (!taskId) throw new Error('usage: runner verify-task <task-id>');
      const queue = new TaskQueue(layout.queueRoot);
      const allTasks = [
        ...queue.list('ready'),
        ...queue.list('done'),
        ...queue.list('failed'),
        ...queue.list('needs-user'),
      ];
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) {
        return {
          plan: plan.planId,
          taskId,
          status: 'NOT_FOUND',
          hint: 'available tasks: ' + allTasks.map((t) => t.id).join(', '),
        };
      }
      // Dynamic imports keep the CLI's TypeScript build from needing the
      // engine package in its node_modules — NodeNext path-mapping for the
      // private workspace is fragile, and the verify-task subcommand is
      // an explicit opt-in path. The shape is duck-typed via the local
      // interfaces above so the CLI does not need a compile-time reference.
      // NodeNext path mapping for the private workspace engine package is
      // fragile; the runtime module is resolved by Node at execution time
      // (see `node_modules/@initforge/agent-rules-engine/`).
      const verifierMod = await (eval('import("@initforge/agent-rules-engine/runner/verifier.js")')) as unknown as VerifierModule;
      const profileMod = await (eval('import("@initforge/agent-rules-engine/runner/profile.js")')) as unknown as ProfileModule;
      const profile = profileMod.liftVerification(task.verification);
      const engine = new verifierMod.VerificationEngine({
        cwd: basePath,
        evidenceDir: path.join(layout.logDir, 'verify-task', task.id),
      });
      const outcome = await engine.evaluate(profile);
      return {
        plan: plan.planId,
        taskId,
        status: outcome.passed ? 'PASS' : 'FAIL',
        stepResults: outcome.stepResults.map((r) => ({
          kind: r.step.kind,
          exitCode: r.exitCode,
          durationMs: r.durationMs,
        })),
        evidence: outcome.evidence.map((e) => ({
          kind: e.kind,
          path: e.path,
          sha256: e.sha256,
        })),
        totalDurationMs: outcome.totalDurationMs,
      };
    }

    default:
      throw new Error(`unknown run action "${action}"; expected add, seed, start, status, journal, or verify-task`);
  }
}
