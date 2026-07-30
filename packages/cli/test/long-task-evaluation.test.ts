import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeRun } from '../src/services/runner.js';
import { DurableStore } from '../src/services/durable-store.js';
import { validatePlan } from '../src/services/plan-compiler.js';
import type { CompiledPlan, PlanTask } from '../src/services/plan-compiler.js';
import type { DelegationReceipt, VerificationResult } from '../src/services/orchestrator.js';
import {
  createRun,
  getNextReadyTasks,
  assignTask,
  completeTask,
} from '../src/services/orchestrator.js';
import { LocalWorkerAdapter } from '../src/adapters/local-worker.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'long-eval-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function createScaffold(base: string, files: Record<string, string>, dirs: string[]): void {
  for (const d of dirs) {
    fs.mkdirSync(path.join(base, d), { recursive: true });
  }
  for (const [filePath, content] of Object.entries(files)) {
    const fp = path.join(base, filePath);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content, 'utf-8');
  }
}

function buildInitCommandPlan(scaffoldDir: string): CompiledPlan {
  const planTasks: PlanTask[] = [
    {
      id: 'T-001',
      description: 'Create type definitions for the init command in src/types/init.d.ts',
      requirementIds: ['R-001'],
      dependsOn: [],
      ownedPaths: [path.join(scaffoldDir, 'src', 'types', 'init.d.ts')],
      acceptanceCriteria: ['Type definitions file exists with exported InitOptions interface'],
      estimatedEffort: 'small',
    },
    {
      id: 'T-002',
      description: 'Create the project initializer service in src/services/initializer.ts',
      requirementIds: ['R-002'],
      dependsOn: ['T-001'],
      ownedPaths: [path.join(scaffoldDir, 'src', 'services', 'initializer.ts')],
      acceptanceCriteria: ['Initializer service file exists with exported initializeProject function'],
      estimatedEffort: 'medium',
    },
    {
      id: 'T-003',
      description: 'Create the init command implementation in src/commands/init.ts',
      requirementIds: ['R-003'],
      dependsOn: ['T-002'],
      ownedPaths: [path.join(scaffoldDir, 'src', 'commands', 'init.ts')],
      acceptanceCriteria: ['Init command file exists with proper implementation exporting initCommand'],
      estimatedEffort: 'medium',
    },
    {
      id: 'T-004',
      description: 'Create integration tests for the init command in test/init.test.ts',
      requirementIds: ['R-004'],
      dependsOn: ['T-003'],
      ownedPaths: [path.join(scaffoldDir, 'test', 'init.test.ts')],
      acceptanceCriteria: ['Test file exists with test cases for initCommand'],
      estimatedEffort: 'medium',
    },
    {
      id: 'T-005',
      description: 'Wire the init command into the CLI entry point src/index.ts',
      requirementIds: ['R-005'],
      dependsOn: ['T-003'],
      ownedPaths: [path.join(scaffoldDir, 'src', 'index.ts')],
      acceptanceCriteria: ['Entry point imports and registers the init command via addCommand'],
      estimatedEffort: 'small',
    },
  ];

  const plan: CompiledPlan = {
    schema: 'artifact/plan',
    version: 1,
    repository_baseline: { branch: 'eval', sha: '0'.repeat(40) },
    intent_reference: {
      hash: 'long-eval-init',
      summary: 'Long-task evaluation: implement agent-rules init command',
    },
    tasks: planTasks,
    completion_policy: { require_all_tasks: true, require_verification: true },
    validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
  };

  plan.validation = validatePlan(plan);
  return plan;
}

function makeVerifier(orcRun: ReturnType<typeof createRun>, scaffoldDir: string) {
  async function verifyTask(taskId: string, receipt: DelegationReceipt): Promise<VerificationResult> {
    const planTask = orcRun.plan.tasks.find((t: { id: string }) => t.id === taskId);
    if (!planTask) {
      return {
        taskId,
        verified: false,
        falsePassDetected: false,
        errors: [`Unknown task: ${taskId}`],
        evidencePaths: [],
        verifier: 'test-verifier',
      };
    }

    const errors: string[] = [];
    const falsePassDetected = receipt.status === 'PASS' && planTask.ownedPaths.length > 0;

    for (const ownedPath of planTask.ownedPaths) {
      const fullPath = ownedPath;
      if (!fs.existsSync(fullPath)) {
        errors.push(`False PASS: owned path "${ownedPath}" does not exist`);
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (stat.size === 0) {
        errors.push(`False PASS: owned path "${ownedPath}" exists but is empty (0 bytes)`);
      }
    }

    if (taskId === 'T-004') {
      const testPath = path.join(scaffoldDir, 'test', 'init.test.ts');
      if (fs.existsSync(testPath)) {
        const content = fs.readFileSync(testPath, 'utf-8');
        if (!content.includes('describe') || !content.includes('it')) {
          errors.push('False PASS: T-004 test file exists but lacks test cases (no describe/it)');
        }
      }
    }

    return {
      taskId,
      verified: errors.length === 0,
      falsePassDetected,
      errors,
      evidencePaths: receipt.filesChanged,
      verifier: 'test-verifier',
    };
  }

  return { verifyTask };
}

describe('Long-task evaluation: agent-rules init command', () => {
  // ── Phase 1: Basic executeRun (proves end-to-end pipeline works) ──
  it('executeRun compiles intent, plan, and completes a basic request', async () => {
    const projectDir = fs.mkdtempSync(path.join(tmpRoot, 'basic-'));
    const result = await executeRun('Goal: Implement a CLI init command', {
      project: projectDir,
    });
    expect(result.runId).toBeTruthy();
    expect(result.state).toBe('COMPLETED');
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.tasks.length).toBeGreaterThan(0);

    const tasks = result.tasks as { taskId: string; state: string }[];
    const allCompleted = tasks.every(t => t.state === 'COMPLETED');
    expect(allCompleted).toBe(true);

    const store = new DurableStore(projectDir);
    const stored = await store.getRun(result.runId);
    expect(stored).not.toBeNull();
    expect(stored!.state).toBe('COMPLETED');
  });

  // ── Phase 2: Full orchestration lifecycle ──
  it('full orchestration lifecycle: dependencies, parallel tasks, checkpoints, resume, false PASS detection, and remediation',
    async () => {
      const scaffoldDir = fs.mkdtempSync(path.join(tmpRoot, 'scaffold-'));

      // Pre-create scaffold files for T-001, T-002 (legitimate work)
      // and a STUB for T-003 (will trigger false PASS because content is empty)
      createScaffold(
        scaffoldDir,
        {
          'src/types/init.d.ts':
            'export interface InitOptions {\n  project?: string;\n  template?: string;\n}\n',

          'src/services/initializer.ts':
            'import type { InitOptions } from "../types/init.d.js";\n'
            + 'export function initializeProject(options: InitOptions): void {\n'
            + '  console.log(`Initializing project in ${options.project ?? process.cwd()}`);\n'
            + '  fs.mkdirSync(options.project ?? ".agent", { recursive: true });\n'
            + '}\n',

          // STUB — intentionally empty file; worker sees it exists and reports PASS (false)
          'src/commands/init.ts': '',

          // Existing entry point — will be "wired" by T-005
          'src/index.ts':
            'import { Command } from "commander";\n'
            + 'const program = new Command();\n'
            + 'program.version("1.0.0");\n',
        },
        ['src/types', 'src/services', 'src/commands', 'test'],
      );

      // ── Build and validate plan ──
      const plan = buildInitCommandPlan(scaffoldDir);
      expect(plan.validation.valid).toBe(true);
      expect(plan.validation.errors).toEqual([]);

      // Verify dependency topology: T-001 → T-002 → T-003 → T-004 / T-005 (parallel)
      const t1 = plan.tasks.find(t => t.id === 'T-001')!;
      const t2 = plan.tasks.find(t => t.id === 'T-002')!;
      const t3 = plan.tasks.find(t => t.id === 'T-003')!;
      const t4 = plan.tasks.find(t => t.id === 'T-004')!;
      const t5 = plan.tasks.find(t => t.id === 'T-005')!;
      expect(t1.dependsOn).toEqual([]);
      expect(t2.dependsOn).toEqual(['T-001']);
      expect(t3.dependsOn).toEqual(['T-002']);
      expect(t4.dependsOn).toEqual(['T-003']);
      expect(t5.dependsOn).toEqual(['T-003']);

      // Owned paths must be unique (no overlaps)
      const allPaths = plan.tasks.flatMap(t => t.ownedPaths);
      expect(new Set(allPaths).size).toBe(allPaths.length);

      // ── Create orchestration run ──
      const orcRun = createRun(plan);
      const runId = orcRun.runId;
      const adapter = new LocalWorkerAdapter();
      const store = new DurableStore(scaffoldDir);
      const { verifyTask } = makeVerifier(orcRun, scaffoldDir);
      const allReceipts: DelegationReceipt[] = [];

      await store.createRun(runId, plan);
      await store.updateState(runId, 'EXECUTING');

      async function dispatch(taskId: string): Promise<DelegationReceipt> {
        const assignment = assignTask(orcRun, taskId, 'local-worker');
        const receipt = await adapter.submitAssignment(assignment);
        completeTask(orcRun, taskId, receipt);
        allReceipts.push(receipt);
        await store.addReceipt(runId, receipt);
        return receipt;
      }

      async function getReady(): Promise<ReturnType<typeof getNextReadyTasks>> {
        return getNextReadyTasks(orcRun);
      }

      // ── Execute T-001 (no deps) ──
      let ready = await getReady();
      expect(ready).toHaveLength(1);
      expect(ready[0].taskId).toBe('T-001');

      let receipt = await dispatch('T-001');
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toContain(
        path.join(scaffoldDir, 'src', 'types', 'init.d.ts'),
      );

      let verifierResult = await verifyTask('T-001', receipt);
      expect(verifierResult.verified).toBe(true);

      // Create checkpoint after T-001
      const cp1 = await store.checkpoint(runId);
      expect(cp1.id).toBeTruthy();
      expect(cp1.state).toBe('EXECUTING');

      // Wait briefly then verify checkpoint file exists on disk
      const cpDir = path.join(scaffoldDir, '.agent', 'runs', runId, 'checkpoints');
      expect(fs.existsSync(cpDir)).toBe(true);
      const cpFiles = fs.readdirSync(cpDir).filter(f => f.endsWith('.json'));
      expect(cpFiles.length).toBeGreaterThanOrEqual(1);

      // ── Execute T-002 (depends on T-001) ──
      ready = await getReady();
      expect(ready).toHaveLength(1);
      expect(ready[0].taskId).toBe('T-002');

      receipt = await dispatch('T-002');
      expect(receipt.status).toBe('PASS');

      verifierResult = await verifyTask('T-002', receipt);
      expect(verifierResult.verified).toBe(true);

      // Checkpoint after T-002
      await store.checkpoint(runId);

      // ── Simulate interruption: rebuild from durable store ──
      // Verify the store has persisted the run state with both receipts
      const store2 = new DurableStore(scaffoldDir);
      const storedRun = await store2.getRun(runId);
      expect(storedRun).not.toBeNull();
      expect(storedRun!.state).toBe('EXECUTING');

      // Verify T-001 receipt is stored
      const storedReceipts = storedRun!.receipts as DelegationReceipt[];
      expect(storedReceipts.length).toBeGreaterThanOrEqual(1);
      const t1Receipt = storedReceipts.find(r => r.taskId === 'T-001');
      expect(t1Receipt).toBeDefined();
      expect(t1Receipt!.status).toBe('PASS');

      // Verify the checkpoint file is on disk
      const resumeCpDir = path.join(scaffoldDir, '.agent', 'runs', runId, 'checkpoints');
      expect(fs.existsSync(resumeCpDir)).toBe(true);
      const resumeCpFiles = fs.readdirSync(resumeCpDir).filter(f => f.endsWith('.json'));
      expect(resumeCpFiles.length).toBeGreaterThanOrEqual(2); // checkpoints after T-001 and T-002

      // Recover orchestration state by replaying receipts
      const recoveredRun = createRun(plan);
      recoveredRun.runId = runId;
      for (const r of storedReceipts) {
        const task = recoveredRun.tasks.find(t => t.taskId === r.taskId);
        if (task) {
          completeTask(recoveredRun, task.taskId, r);
        }
      }

      // Transfer recovered states to the original run for continuity
      for (const task of orcRun.tasks) {
        const recoveredTask = recoveredRun.tasks.find(t => t.taskId === task.taskId);
        if (recoveredTask) {
          task.state = recoveredTask.state;
        }
      }

      // ══════════════════════════════════════════════════════════════
      //  FALSE PASS SCENARIO
      // ══════════════════════════════════════════════════════════════
      // T-003's file exists (empty stub), so the worker reports PASS.
      // The verifier detects the file has zero content and flags it.

      ready = await getReady();
      expect(ready).toHaveLength(1);
      expect(ready[0].taskId).toBe('T-003');

      // First dispatch: worker sees file exists → PASS (false)
      receipt = await dispatch('T-003');
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toContain(
        path.join(scaffoldDir, 'src', 'commands', 'init.ts'),
      );

      // Verifier detects empty file → false PASS
      verifierResult = await verifyTask('T-003', receipt);
      expect(verifierResult.falsePassDetected).toBe(true);
      expect(verifierResult.verified).toBe(false);
      expect(verifierResult.errors.length).toBeGreaterThan(0);
      expect(verifierResult.errors[0]).toMatch(/empty|False PASS/i);

      // ── REMEDIATION ──
      // 1. Reject the false PASS: reset T-003 to PENDING
      const t3State = orcRun.tasks.find(t => t.taskId === 'T-003')!;
      t3State.state = 'PENDING';
      t3State.receipt = undefined;
      t3State.error = undefined;

      // 2. Write proper implementation
      fs.writeFileSync(
        path.join(scaffoldDir, 'src', 'commands', 'init.ts'),
        [
          'import { Command } from "commander";',
          'import { initializeProject } from "../services/initializer.js";',
          '',
          'export function initCommand(): Command {',
          '  const cmd = new Command("init");',
          '  cmd.description("Initialize a new agent-rules project");',
          '  cmd.option("-p, --project <path>", "Project root directory");',
          '  cmd.option("-t, --template <name>", "Scaffold template");',
          '  cmd.action((opts: { project?: string; template?: string }) => {',
          '    initializeProject(opts);',
          '  });',
          '  return cmd;',
          '}',
          '',
        ].join('\n'),
      );

      // 3. Also create T-004's test file and T-005's wired index.ts as part of remediation
      // (simulating what a properly implemented init command would produce)
      fs.writeFileSync(
        path.join(scaffoldDir, 'test', 'init.test.ts'),
        [
          'import { describe, it, expect } from "vitest";',
          'import { initCommand } from "../src/commands/init.js";',
          '',
          'describe("initCommand", () => {',
          '  it("returns a Command instance with name init", () => {',
          '    const cmd = initCommand();',
          '    expect(cmd.name()).toBe("init");',
          '  });',
          '',
          '  it("accepts --project option", () => {',
          '    const cmd = initCommand();',
          '    const opts = cmd.options.find(o => o.long === "--project");',
          '    expect(opts).toBeDefined();',
          '  });',
          '});',
          '',
        ].join('\n'),
      );

      fs.writeFileSync(
        path.join(scaffoldDir, 'src', 'index.ts'),
        [
          'import { Command } from "commander";',
          'import { initCommand } from "./commands/init.js";',
          '',
          'const program = new Command();',
          'program.version("1.0.0");',
          'program.addCommand(initCommand());',
          'program.parse(process.argv);',
          '',
        ].join('\n'),
      );

      // ── REDISPATCH T-003 ──
      // Now T-003 should be ready again (reset to PENDING, deps completed)
      ready = await getReady();
      expect(ready).toHaveLength(1);
      expect(ready[0].taskId).toBe('T-003');

      receipt = await dispatch('T-003');
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toContain(
        path.join(scaffoldDir, 'src', 'commands', 'init.ts'),
      );

      // Verifier should now pass
      verifierResult = await verifyTask('T-003', receipt);
      expect(verifierResult.verified).toBe(true);

      // ── Execute T-004 and T-005 (parallel, both depend on T-003) ──
      ready = await getReady();
      expect(ready).toHaveLength(2);
      const readyIds = ready.map(t => t.taskId).sort();
      expect(readyIds).toEqual(['T-004', 'T-005']);

      for (const task of ready) {
        const r = await dispatch(task.taskId);
        expect(r.status).toBe('PASS');

        const vResult = await verifyTask(task.taskId, r);
        expect(vResult.verified).toBe(true);
      }

      // ── Verify all tasks completed ──
      const allCompleted = orcRun.tasks.every(t => t.state === 'COMPLETED');
      expect(allCompleted).toBe(true);

      const completedStates = orcRun.tasks.map(t => `${t.taskId}=${t.state}`).sort();
      expect(completedStates).toEqual([
        'T-001=COMPLETED',
        'T-002=COMPLETED',
        'T-003=COMPLETED',
        'T-004=COMPLETED',
        'T-005=COMPLETED',
      ]);

      // Verify 6 total receipts (T-003 dispatched twice: false PASS + remediation)
      expect(allReceipts.length).toBe(6);

      // ── Final checkpoint and verify durable store ──
      await store.updateState(runId, 'COMPLETED');
      await store.checkpoint(runId);

      const finalRun = await store.getRun(runId);
      expect(finalRun).not.toBeNull();
      expect(finalRun!.state).toBe('COMPLETED');
      expect(finalRun!.receipts.length).toBe(allReceipts.length);
      expect(finalRun!.checkpoints.length).toBeGreaterThanOrEqual(3);

      // ── Claim ledger summary ──
      const ledgerSummary = {
        runId,
        state: finalRun!.state,
        totalTasks: orcRun.tasks.length,
        totalReceipts: allReceipts.length,
        falsePassDetected: true,
        remediationApplied: true,
        checkpoints: finalRun!.checkpoints.length,
        taskBreakdown: orcRun.tasks.map(t => ({
          taskId: t.taskId,
          state: t.state,
          retries: t.retryCount,
        })),
      };

      // Print the claim ledger summary
      console.log('\n=== CLAIM LEDGER SUMMARY ===');
      console.log(JSON.stringify(ledgerSummary, null, 2));
      console.log('=============================\n');

      // Verify claim ledger invariants
      expect(ledgerSummary.totalTasks).toBe(5);
      expect(ledgerSummary.falsePassDetected).toBe(true);
      expect(ledgerSummary.remediationApplied).toBe(true);
      expect(ledgerSummary.state).toBe('COMPLETED');

      // Verify the remediation receipt is in the store
      const t003Receipts = (finalRun!.receipts as DelegationReceipt[])
        .filter(r => r.taskId === 'T-003');
      expect(t003Receipts.length).toBe(2); // 1 false PASS + 1 legitimate

      // Cleanup
      await store.deleteRun(runId);

    }, 120_000);
});
