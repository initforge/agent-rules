import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Runner, parseCommand, tasksFromRequirements, DEFAULT_MAX_REPAIR_DEPTH } from '../src/runner/loop.js';
import { Journal } from '../src/runner/journal.js';

const IDENTITY = { repository: 'agent-rules', plan: 'test-plan', revision: 'r1' };

/**
 * Build a runner over a throwaway git repo.
 *
 * `agentScript` is inline node run in place of an agent CLI. That keeps these tests
 * about the loop's contract — bounded repair, evidence, recovery — rather than about
 * any vendor's behavior, while still exercising real process spawning.
 */
function makeRunner(
  repo: string,
  agentScript: string,
  over: Partial<ConstructorParameters<typeof Runner>[0]> = {}
): Runner {
  return new Runner({
    cwd: repo,
    queueRoot: path.join(repo, '.queue'),
    journalPath: path.join(repo, '.journal.jsonl'),
    identity: IDENTITY,
    agent: 'claude',
    logDir: path.join(repo, '.logs'),
    // Drive the real process lifecycle against node rather than a vendor CLI, so the
    // loop's contract is what is under test.
    invocationOverride: () => ({ executable: process.execPath, args: ['-e', agentScript] }),
    skipAgentDetection: true,
    ...over,
  });
}

describe('parseCommand', () => {
  it('splits a command into argv without a shell', () => {
    expect(parseCommand('npx vitest run foo.test.ts', '/repo')).toEqual({
      executable: 'npx',
      args: ['vitest', 'run', 'foo.test.ts'],
      cwd: '/repo',
    });
  });

  it('rejects an empty command', () => {
    expect(() => parseCommand('   ', '/repo')).toThrow(/empty verification command/);
  });
});

describe('tasksFromRequirements', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqs-test-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('turns active requirements into tasks and skips the rest', () => {
    const file = path.join(dir, 'requirements.yaml');
    fs.writeFileSync(
      file,
      `version: 1
plan_id: p
requirements:
  - id: R-001
    statement: Does a thing.
    status: active
    verification:
      - npx vitest run a.test.ts
  - id: R-002
    statement: Old way.
    status: superseded
    superseded_by: R-001
  - id: R-003
    statement: Blocked thing.
    status: blocked
`
    );

    const tasks = tasksFromRequirements(file, ['src']);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ requirementId: 'R-001', repairDepth: 0, ownedPaths: ['src'] });
    expect(tasks[0].verification).toEqual(['npx vitest run a.test.ts']);
    expect(tasks[0].prompt).toContain('Does a thing.');
  });
});

describe('Runner', () => {
  let repo: string;
  const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repo, 'seed.ts'), 'export const seed = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'initial');
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it('refuses to run when the agent CLI is absent', async () => {
    const runner = new Runner({
      cwd: repo,
      queueRoot: path.join(repo, '.queue'),
      journalPath: path.join(repo, '.journal.jsonl'),
      identity: IDENTITY,
      agent: 'definitely-not-a-real-cli' as never,
    });
    runner.tasks.add({ prompt: 'x', verification: ['true'], ownedPaths: [], repairDepth: 0 });

    await expect(runner.run()).rejects.toThrow(/not available on PATH/);
  });

  it('returns immediately on an empty queue', async () => {
    const runner = makeRunner(repo, 'process.exit(0)');
    const summary = await runner.run();
    expect(summary).toMatchObject({ tasksProcessed: 0, done: 0, failed: 0, needsUser: 0 });
  });

  // R-002 + R-006: a task passes only when the agent produced a real diff AND every
  // verification command exited 0.
  it('marks a task done when the agent changes a file and verification passes', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'out.ts')}', 'export const x = 1;\\n')`);
    runner.tasks.add({
      prompt: 'write out.ts',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    const summary = await runner.run();

    expect(summary).toMatchObject({ tasksProcessed: 1, done: 1, failed: 0, needsUser: 0 });
    expect(summary.reports[0].diffSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(summary.reports[0].filesChanged).toContain('out.ts');
    expect(runner.tasks.counts()).toMatchObject({ done: 1, ready: 0, active: 0 });
  });

  // The failure the old receipt path was built to catch, kept catchable here.
  it('fails a task whose verification passes but which changed nothing', async () => {
    const runner = makeRunner(repo, 'process.exit(0)');
    runner.tasks.add({
      prompt: 'do nothing',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: DEFAULT_MAX_REPAIR_DEPTH,
    });

    const summary = await runner.run();

    expect(summary.failed).toBe(1);
    expect(summary.reports[0].reason).toMatch(/no diff was produced/);
  });

  it('fails a task that changed only documentation', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'NOTES.md')}', '# notes\\n')`);
    runner.tasks.add({
      prompt: 'write docs',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: DEFAULT_MAX_REPAIR_DEPTH,
    });

    const summary = await runner.run();

    expect(summary.failed).toBe(1);
    expect(summary.reports[0].reason).toMatch(/only documentation changed/);
  });

  // R-004 — the core fix. Without this bound, every failure minted a child task that
  // itself required review, producing chains that could never terminate.
  it('stops at the repair-depth limit and asks a human instead of minting a child', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 2;\\n')`, {
      maxRepairDepth: 2,
    });
    runner.tasks.add({
      prompt: 'fix it',
      verification: [`${process.execPath} -e process.exit(1)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    const summary = await runner.run();

    // depth 0 -> repair 1 -> repair 2, then stop. Exactly 3 attempts, no more.
    expect(summary.tasksProcessed).toBe(3);
    expect(summary.needsUser).toBe(1);
    expect(runner.tasks.counts()).toMatchObject({ 'needs-user': 1, ready: 0, active: 0 });

    const terminal = runner.tasks.list('needs-user')[0];
    expect(terminal.repairDepth).toBe(2);
    expect(terminal.reason).toMatch(/repair depth 2 reached limit 2/);
  });

  it('honours maxRepairDepth 0 by never generating a repair', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 3;\\n')`, {
      maxRepairDepth: 0,
    });
    runner.tasks.add({
      prompt: 'fix it',
      verification: [`${process.execPath} -e process.exit(1)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    const summary = await runner.run();

    expect(summary.tasksProcessed).toBe(1);
    expect(summary.needsUser).toBe(1);
  });

  it('carries the requirement id through a repair chain', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 4;\\n')`, {
      maxRepairDepth: 1,
    });
    runner.tasks.add({
      prompt: 'fix it',
      verification: [`${process.execPath} -e process.exit(1)`],
      ownedPaths: [],
      repairDepth: 0,
      requirementId: 'R-042',
    });

    await runner.run();

    expect(runner.tasks.list('needs-user')[0]).toMatchObject({ requirementId: 'R-042', repairDepth: 1 });
  });

  it('tells the repair attempt which commands failed, and not to weaken them', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 5;\\n')`, {
      maxRepairDepth: 1,
    });
    runner.tasks.add({
      prompt: 'original instruction',
      verification: [`${process.execPath} -e process.exit(1)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    await runner.run();
    const repaired = runner.tasks.list('needs-user')[0];

    expect(repaired.prompt).toContain('original instruction');
    expect(repaired.prompt).toContain('Do not weaken or skip the verification commands');
    expect(repaired.prompt).toContain('repair attempt 1 of 1');
  });

  it('rejects a verification command containing shell metacharacters', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 6;\\n')`, {
      maxRepairDepth: 0,
    });
    runner.tasks.add({
      prompt: 'x',
      verification: ['rm -rf / ; echo pwned'],
      ownedPaths: [],
      repairDepth: 0,
    });

    const summary = await runner.run();

    expect(summary.reports[0].verificationExitCodes).toEqual([-1]);
    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);
    expect(journal.ofType('COMMAND_REJECTED')).toHaveLength(1);
  });

  it('reports 127 for a verification command that does not exist', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 7;\\n')`, {
      maxRepairDepth: 0,
    });
    runner.tasks.add({
      prompt: 'x',
      verification: ['definitely-not-a-real-binary --flag'],
      ownedPaths: [],
      repairDepth: 0,
    });

    const summary = await runner.run();
    expect(summary.reports[0].verificationExitCodes).toEqual([127]);
  });

  // R-003/R-012: the journal is the durable record. The runner keeps nothing in memory.
  it('writes a verifiable journal covering the whole run', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'out.ts')}', 'export const x = 1;\\n')`);
    runner.tasks.add({
      prompt: 'write out.ts',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    await runner.run();

    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);
    expect(journal.verify().ok).toBe(true);

    const types = journal.read().map((r) => r.type);
    expect(types).toEqual([
      'RUN_START',
      'TASK_START',
      'AGENT_EXIT',
      'VERIFICATION',
      'TASK_END',
      'CHECKPOINT',
      'RUN_END',
    ]);

    // Evidence is a pointer plus a hash, never the transcript itself.
    const agentExit = journal.ofType('AGENT_EXIT')[0];
    expect(agentExit.data?.stdoutSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(agentExit.data?.stdoutPath).toBeDefined();
    expect(agentExit.data).not.toHaveProperty('stdout');
  });

  // Telemetry is aggregate measurement; the journal is tamper-evident history. Both
  // existed before and neither was ever written to — .agent/trace.jsonl held 3 records
  // for the project's entire history.
  it('writes telemetry events alongside the journal', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'out.ts')}', 'export const x = 1;\\n')`);
    runner.tasks.add({
      prompt: 'x',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    await runner.run();

    const telemetryPath = path.join(repo, 'telemetry.jsonl');
    expect(fs.existsSync(telemetryPath)).toBe(true);
    const kinds = fs
      .readFileSync(telemetryPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .map((e) => e.event?.kind ?? e.kind);
    expect(kinds).toContain('run_start');
    expect(kinds).toContain('task_start');
    expect(kinds).toContain('verification');
    expect(kinds).toContain('run_end');
  });

  it('can be disabled with telemetry: false', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'out.ts')}', 'export const x = 1;\\n')`, {
      telemetry: false,
    });
    runner.tasks.add({
      prompt: 'x',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    await runner.run();
    expect(fs.existsSync(path.join(repo, 'telemetry.jsonl'))).toBe(false);
  });

  it('checkpoints after each settled task and exposes a resume context', async () => {
    const runner = makeRunner(repo, `require('fs').appendFileSync('${path.join(repo, 'log.ts')}', '// step\\n')`);
    for (let i = 0; i < 2; i += 1) {
      runner.tasks.add({
        prompt: `step ${i}`,
        verification: [`${process.execPath} -e process.exit(0)`],
        ownedPaths: [],
        repairDepth: 0,
      });
    }

    await runner.run();
    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);

    // One per settled task, chained so a restart knows the order.
    expect(journal.ofType('CHECKPOINT')).toHaveLength(2);
    expect(journal.ofType('CHECKPOINT_FAILED')).toHaveLength(0);

    const resume = runner.resumeContext();
    expect(resume).not.toBeNull();
    expect(journal.verify().ok).toBe(true);
  });

  it('records the repair chain in the journal', async () => {
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'a.ts')}', 'export const a = 8;\\n')`, {
      maxRepairDepth: 1,
    });
    runner.tasks.add({
      prompt: 'fix it',
      verification: [`${process.execPath} -e process.exit(1)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    await runner.run();
    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);

    expect(journal.ofType('REPAIR_ENQUEUED')).toHaveLength(1);
    expect(journal.ofType('REPAIR_EXHAUSTED')).toHaveLength(1);
    expect(journal.ofType('REPAIR_EXHAUSTED')[0].data).toMatchObject({ maxRepairDepth: 1 });
  });

  // R-003: the property that makes overnight runs safe — a killed runner loses nothing.
  it('recovers a task abandoned by a previous runner', async () => {
    const first = makeRunner(repo, 'process.exit(0)');
    first.tasks.add({
      prompt: 'interrupted work',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });
    // Simulate a kill between claim and settle.
    first.tasks.claim();
    expect(first.tasks.counts()).toMatchObject({ active: 1 });

    const second = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'out.ts')}', 'export const x = 1;\\n')`);
    const summary = await second.run();

    expect(summary.recovered).toBe(1);
    expect(summary.done).toBe(1);

    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);
    expect(journal.ofType('RUN_RECOVERED')).toHaveLength(1);
  });

  it('processes many tasks in one run without accumulating state', async () => {
    const runner = makeRunner(repo, `require('fs').appendFileSync('${path.join(repo, 'log.ts')}', '// step\\n')`);
    for (let i = 0; i < 12; i += 1) {
      runner.tasks.add({
        prompt: `step ${i}`,
        verification: [`${process.execPath} -e process.exit(0)`],
        ownedPaths: [],
        repairDepth: 0,
      });
    }

    const summary = await runner.run();

    expect(summary.tasksProcessed).toBe(12);
    expect(summary.done).toBe(12);
    expect(runner.tasks.counts()).toMatchObject({ ready: 0, active: 0, done: 12 });
  });

  it('stops after maxTasks and leaves the rest queued', async () => {
    const runner = makeRunner(
      repo,
      `require('fs').appendFileSync('${path.join(repo, 'log.ts')}', '// step\\n')`,
      { maxTasks: 2 }
    );
    for (let i = 0; i < 5; i += 1) {
      runner.tasks.add({
        prompt: `step ${i}`,
        verification: [`${process.execPath} -e process.exit(0)`],
        ownedPaths: [],
        repairDepth: 0,
      });
    }

    const summary = await runner.run();

    expect(summary.tasksProcessed).toBe(2);
    expect(runner.tasks.counts().ready).toBe(3);
  });

  it('records run context in RUN_START rather than in the journal identity', async () => {
    // Regression: keying identity on the git HEAD made the journal unopenable after
    // the runner's first commit. Per-run facts belong in RUN_START data.
    const runner = makeRunner(repo, `require('fs').writeFileSync('${path.join(repo, 'out.ts')}', 'export const x = 1;\\n')`, {
      runContext: { gitHead: 'abc123' },
    });
    runner.tasks.add({
      prompt: 'x',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });

    await runner.run();
    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);

    expect(journal.ofType('RUN_START')[0].data).toMatchObject({ gitHead: 'abc123' });
    expect(journal.read()[0].identity).toEqual(IDENTITY);
  });

  it('appends across separate runs even after the repo is committed', async () => {
    const script = `require('fs').appendFileSync('${path.join(repo, 'log.ts')}', '// step\\n')`;
    const first = makeRunner(repo, script);
    first.tasks.add({
      prompt: 'step 1',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });
    await first.run();

    git('add', '-A');
    git('commit', '-q', '-m', 'work from run 1');

    const second = makeRunner(repo, script);
    second.tasks.add({
      prompt: 'step 2',
      verification: [`${process.execPath} -e process.exit(0)`],
      ownedPaths: [],
      repairDepth: 0,
    });
    const summary = await second.run();

    expect(summary.done).toBe(1);
    const journal = new Journal(path.join(repo, '.journal.jsonl'), IDENTITY);
    expect(journal.verify().ok).toBe(true);
    expect(journal.ofType('RUN_START')).toHaveLength(2);
  });

  it('requestStop() ends the run after the current task', async () => {
    const runner = makeRunner(repo, `require('fs').appendFileSync('${path.join(repo, 'log.ts')}', '// step\\n')`);
    for (let i = 0; i < 3; i += 1) {
      runner.tasks.add({
        prompt: `step ${i}`,
        verification: [`${process.execPath} -e process.exit(0)`],
        ownedPaths: [],
        repairDepth: 0,
      });
    }

    runner.requestStop();
    const summary = await runner.run();

    expect(summary.tasksProcessed).toBe(0);
    expect(runner.tasks.counts().ready).toBe(3);
  });
});
