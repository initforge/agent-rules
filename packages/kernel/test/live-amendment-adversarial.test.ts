import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ActivationLock } from '../src/secure-fs.js';
import {
  createAmendmentRequest,
  compileRevisionImpactPlan,
  compileRevisionImpactPlanFromStrongPlanner,
  activateRevisionImpact,
} from '../src/state/live-amendment.js';

describe('adversarial live-amendment checks', () => {
  const testDir = path.join(os.tmpdir(), `amend-adv-test-${Date.now()}`).replace(/\\/g, '/');
  const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');

  const mockPlanYaml = `
schema: agent-rules/implementation-plan
version: 3
plan_id: plan-001
tasks:
  - { id: T-001, depends_on: [], requirements: [REQ-001] }
  - { id: T-002, depends_on: [T-001], requirements: [REQ-002] }
  - { id: T-003, depends_on: [T-001], requirements: [REQ-018, REQ-019] }
requirements:
  - { id: REQ-001, status: active, verification: [echo] }
  - { id: REQ-002, status: active, verification: [echo] }
  - { id: REQ-018, status: active, verification: [echo] }
  - { id: REQ-019, status: active, verification: [echo] }
`;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const readyDir = path.join(planDir, 'queue', 'ready');
    fs.mkdirSync(readyDir, { recursive: true });
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'queue', 'failed'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'amendments'), { recursive: true });
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), '');

    // Write mock task files into queue/ready
    for (const tid of ['T-001', 'T-002', 'T-003']) {
      const mockTask = {
        id: tid,
        requirementId: tid === 'T-001' ? 'REQ-001' : (tid === 'T-002' ? 'REQ-002' : 'REQ-018'),
        prompt: `Run ${tid}`,
        verification: ['echo'],
        ownedPaths: [],
        forbiddenPaths: [],
        repairDepth: 0,
        status: 'ready',
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(path.join(readyDir, `${tid}.json`), JSON.stringify(mockTask, null, 2) + '\n');
    }

    // Write original.md plan
    fs.writeFileSync(path.join(planDir, 'original.md'), mockPlanYaml);

    // Mock schema file referenced in current.json
    fs.mkdirSync(path.join(testDir, 'schemas'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'schemas', 'execution-contract.schema.json'), '{}');

    // Create mock ledger
    const mockLedger = {
      schema_version: 4,
      plan_id: 'plan-001',
      status: 'ADOPTED',
      execution_state: 'IN_PROGRESS',
      effective_plan_identity: {
        sha256: '61d2b87ba2d6b15d3111beaa011295b1664b0e1b98cb1b93e3a854343738b462',
        canonical_json_utf8: '{}',
        bytes: 2
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      reconciliations: []
    };
    const ledgerDir = path.join(testDir, '.agent', 'ledger');
    fs.mkdirSync(ledgerDir, { recursive: true });
    fs.writeFileSync(path.join(ledgerDir, 'plan-001.json'), JSON.stringify(mockLedger, null, 2) + '\n');

    // Create current.json pointer
    const mockPointer = {
      schema: 'artifact/execution-contract',
      version: 1,
      kind: 'current-pointer',
      generation: 1,
      work_id: 'plan-001',
      plan_id: 'plan-001',
      plan_root: '.agent/plans/plan-001',
      original: {
        path: '.agent/plans/plan-001/original.md',
        sha256: createHash('sha256').update(mockPlanYaml).digest('hex')
      },
      canonical_ledger: {
        path: '.agent/ledger/plan-001.json',
        sha256: createHash('sha256').update(JSON.stringify(mockLedger, null, 2) + '\n').digest('hex'),
        observed_revision: 1,
        observed_effective_sha256: '61d2b87ba2d6b15d3111beaa011295b1664b0e1b98cb1b93e3a854343738b462',
        plan_status: 'ADOPTED',
        execution_state: 'IN_PROGRESS'
      },
      effective_chain_tip: {
        amendment_id: 'AM-0000',
        path: '.agent/plans/plan-001/original.md',
        sha256: createHash('sha256').update(mockPlanYaml).digest('hex')
      },
      candidate_chain_tip: {
        amendment_id: 'AM-0000',
        status: 'OWNER_APPROVED_PENDING_CANONICAL_ACTIVATION',
        path: '.agent/plans/plan-001/original.md',
        sha256: createHash('sha256').update(mockPlanYaml).digest('hex')
      },
      contract: {
        path: 'schemas/execution-contract.schema.json',
        sha256: createHash('sha256').update('{}').digest('hex'),
        schema_path: 'schemas/execution-contract.schema.json',
        requirement_ids: [
          'REQ-018',
          'REQ-019'
        ],
        status: 'PENDING_CANONICAL_ACTIVATION'
      },
      atomicity: {
        protocol: 'generation-compare-and-swap',
        commit_target: '.agent/current.json',
        expected_previous_generation: 0,
        activation_state: 'CANONICALLY_ACTIVATED',
        updated_at: new Date().toISOString()
      }
    };
    fs.writeFileSync(path.join(testDir, '.agent', 'current.json'), JSON.stringify(mockPointer, null, 2) + '\n');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('handles Vietnamese amendment intent correctly and yields proper tasks via planner', () => {
    // Intent targets REQ-019 in Vietnamese, should map to task T-003
    const request = createAmendmentRequest('plan-001', 'thêm yêu cầu kiểm chứng cổng mạng và cấu hình bảo mật cho REQ-019', testDir);
    expect(request.state).toBe('PENDING');

    const impact = compileRevisionImpactPlan(
      'plan-001',
      request,
      ['T-001', 'T-002', 'T-003'],
      ['T-003'],
      [],
      'ledger-v1',
      undefined,
      testDir
    );

    expect(impact.status, impact.failureReason).toBe('READY');
    expect(impact.invalidatedTaskIds).toContain('T-003');
    expect(impact.newTasks.length).toBe(1);
    expect(impact.newTasks[0].requirementId).toBe('REQ-019');
  });

  it('accepts only a hash-bound structured strong-planner impact plan on the production boundary', () => {
    const intent = 'Bổ sung kiểm thử browser visible và giữ nguyên công việc không bị ảnh hưởng';
    const request = createAmendmentRequest('plan-001', intent, testDir);
    const plannerDir = path.join(testDir, '.agent', 'planner');
    fs.mkdirSync(plannerDir, { recursive: true });
    const receiptPath = path.join(plannerDir, 'amend.receipt.json');
    const contractPath = path.join(plannerDir, 'amend.contract.json');
    const receipt = { status: 'PASS', work_id: request.amendmentId, role: 'planner' };
    const contract = { raw_intent: intent, status: 'PASS', decisions: ['T-003 is the only affected task'] };
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
    fs.writeFileSync(contractPath, `${JSON.stringify(contract)}\n`);
    const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const replacement = {
      taskId: 'replacement-t003',
      requirementId: 'REQ-019',
      prompt: 'Execute the amended REQ-019 recipe with visible browser proof',
      ownedPaths: ['packages/engine'],
      forbiddenPaths: ['generated'],
      verification: ['npm run verify:all'],
      anchors: ['REQ-019', 'T-003'],
      invariants: ['workers never author PASS', 'unaffected tasks continue'],
      acceptance: ['fresh claim-matched evidence exists'],
      proof: ['verify:all', 'independent review'],
      rollback: ['restore superseded task lineage'],
      stopConditions: ['missing planner receipt', 'uncertain side effect'],
    };
    const rawPlan = {
      schema: 'harness/revision-impact-plan',
      version: 1,
      amendmentId: request.amendmentId,
      planId: 'plan-001',
      rawIntent: intent,
      targetRevision: 'ledger-v2',
      targetTaskIds: ['T-003'],
      invalidatedTaskIds: ['T-003'],
      invalidatedCompletedTaskIds: [],
      unaffectedTaskIds: ['T-001', 'T-002'],
      supersededTaskMap: { 'T-003': 'replacement-t003' },
      newTasks: [replacement],
      dependencyClosure: { 'T-003': ['T-003'] },
      planner: {
        role: 'strong-planner',
        receiptPath: '.agent/planner/amend.receipt.json',
        receiptSha256: sha(receiptPath),
        contractPath: '.agent/planner/amend.contract.json',
        contractSha256: sha(contractPath),
        decisions: ['T-003 is the only affected task'],
        unresolved: [],
      },
    };
    const impact = compileRevisionImpactPlanFromStrongPlanner(
      'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', rawPlan, testDir,
    );
    expect(impact.status, impact.failureReason).toBe('READY');
    expect(impact.plannerMode).toBe('strong-planner');
    expect(impact.plannerProof?.receiptSha256).toBe(sha(receiptPath));
    const unresolved = {
      ...rawPlan,
      planner: { ...rawPlan.planner, unresolved: ['owner decision is missing'] },
    };
    const rejected = compileRevisionImpactPlanFromStrongPlanner(
      'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', unresolved, testDir,
    );
    expect(rejected.status).toBe('BLOCKED');
    expect(rejected.failureReason).toContain('unresolved');
    expect(activateRevisionImpact(testDir, impact).success).toBe(true);
  });

  it('rejects ambiguous or empty intent with NEEDS_USER status', () => {
    const request = createAmendmentRequest('plan-001', 'abcd', testDir); // too short
    const impact = compileRevisionImpactPlan(
      'plan-001',
      request,
      [],
      [],
      [],
      'ledger-v1',
      undefined,
      testDir
    );

    expect(impact.status).toBe('NEEDS_USER');
    expect(impact.failureReason).toContain('Intent is too short');

    // Trying to activate a NEEDS_USER impact plan must fail closed
    const res = activateRevisionImpact(testDir, impact);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Cannot activate impact plan because status is "NEEDS_USER"');
  });

  it('rejects concurrent/out-of-order activations (CAS mismatch)', () => {
    const request = createAmendmentRequest('plan-001', 'Modify T-002 environmental configuration', testDir);
    
    const impact = compileRevisionImpactPlan(
      'plan-001',
      request,
      ['T-001', 'T-002', 'T-003'],
      [],
      [],
      'ledger-v1',
      undefined,
      testDir
    );

    // Simulate concurrent modification where the pointer generation was already advanced
    const currentPath = path.join(testDir, '.agent', 'current.json');
    const pointer = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    const advancedPointer = {
      ...pointer,
      generation: 2,
      canonical_ledger: {
        ...pointer.canonical_ledger,
        observed_revision: 2,
      }
    };
    fs.writeFileSync(currentPath, JSON.stringify(advancedPointer, null, 2) + '\n');

    // Activation must fail closed due to CAS mismatch
    const res = activateRevisionImpact(testDir, impact);
    expect(res.success).toBe(false);
    expect(res.error).toContain('CAS Mismatch');
  });

  it('invalidates complete dependency closure recursively', () => {
    const request = createAmendmentRequest('plan-001', 'Modify REQ-001 baseline', testDir);

    const impact = compileRevisionImpactPlan(
      'plan-001',
      request,
      ['T-001', 'T-002', 'T-003'],
      ['T-001'],
      [],
      'ledger-v1',
      undefined,
      testDir
    );

    // T-001 has dependents T-002 and T-003 in mockPlanYaml
    expect(impact.invalidatedTaskIds).toContain('T-001');
    expect(impact.invalidatedTaskIds).toContain('T-002');
    expect(impact.invalidatedTaskIds).toContain('T-003');
    expect(impact.newTasks.length).toBe(3); // replacement tasks created for all 3
  });

  it('is idempotent on duplicate activations', () => {
    const request = createAmendmentRequest('plan-001', 'Modify T-003 configuration', testDir);

    const impact = compileRevisionImpactPlan(
      'plan-001',
      request,
      ['T-001', 'T-002', 'T-003'],
      [],
      [],
      'ledger-v1',
      undefined,
      testDir
    );

    // First activation
    const res1 = activateRevisionImpact(testDir, impact);
    expect(res1.success).toBe(true);
    expect(res1.invalidatedCount).toBe(1);
    expect(res1.addedCount).toBe(1);

    // Second activation (duplicate amendment request)
    const res2 = activateRevisionImpact(testDir, impact);
    expect(res2.success).toBe(true);
    expect(res2.addedCount).toBe(0); // Should not add tasks again
  });

  it('rejects a serialized impact plan whose content changed after planning', () => {
    const request = createAmendmentRequest('plan-001', 'Modify T-003 with an audited replacement', testDir);
    const impact = compileRevisionImpactPlan(
      'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', undefined, testDir,
    );
    const tampered = {
      ...impact,
      newTasks: impact.newTasks.map((task) => ({ ...task, prompt: `${task.prompt} tampered` })),
    };

    const result = activateRevisionImpact(testDir, tampered);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Impact plan content hash');
    expect(fs.existsSync(path.join(planDir, 'queue', 'ready', 'T-003.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(planDir, 'amendments', `${request.amendmentId}.json`), 'utf8')).state).toBe('PENDING');
  });

  it('is idempotent on duplicate delivery and never resets an activated request', () => {
    const intent = 'Modify REQ-019 acceptance with a bounded live drill';
    const first = createAmendmentRequest('plan-001', intent, testDir);
    const requestPath = path.join(planDir, 'amendments', `${first.amendmentId}.json`);
    const activated = {
      ...first,
      state: 'ACTIVATED' as const,
      activation: {
        targetRevision: 'ledger-v2',
        impactPlanSha256: 'impact-sha',
        activatedAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(requestPath, JSON.stringify(activated, null, 2) + '\n');

    const retry = createAmendmentRequest('plan-001', intent, testDir);
    expect(retry).toEqual(activated);
    expect(JSON.parse(fs.readFileSync(requestPath, 'utf8')).state).toBe('ACTIVATED');

    fs.writeFileSync(requestPath, JSON.stringify({ ...activated, intent: 'tampered' }, null, 2) + '\n');
    expect(() => createAmendmentRequest('plan-001', intent, testDir)).toThrow(/content-addressed request drift/);
  });

  it('drills ready, running, completed, unaffected, cancellation, and duplicate paths together', async () => {
    const readyDir = path.join(planDir, 'queue', 'ready');
    const activeDir = path.join(planDir, 'queue', 'active');
    const doneDir = path.join(planDir, 'queue', 'done');
    fs.mkdirSync(doneDir, { recursive: true });
    fs.rmSync(path.join(readyDir, 'T-002.json'), { force: true });
    fs.rmSync(path.join(readyDir, 'T-003.json'), { force: true });

    const child = spawn(process.execPath, ['-e', 'process.on("SIGINT", () => process.exit(0)); setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.writeFileSync(path.join(activeDir, 'T-002.json'), JSON.stringify({
      id: 'T-002', requirementId: 'REQ-002', prompt: 'running', verification: ['echo'],
      ownedPaths: [], forbiddenPaths: [], repairDepth: 0, status: 'active', pid: child.pid,
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(doneDir, 'T-003.json'), JSON.stringify({
      id: 'T-003', requirementId: 'REQ-018', prompt: 'completed', verification: ['echo'],
      ownedPaths: [], forbiddenPaths: [], repairDepth: 0, status: 'done',
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(readyDir, 'T-004.json'), JSON.stringify({
      id: 'T-004', requirementId: 'REQ-024', prompt: 'unaffected', verification: ['echo'],
      ownedPaths: [], forbiddenPaths: [], repairDepth: 0, status: 'ready',
    }, null, 2) + '\n');

    const intent = 'Modify T-001 baseline acceptance while preserving independent work';
    const request = createAmendmentRequest('plan-001', intent, testDir);
    const plannerDir = path.join(testDir, '.agent', 'planner');
    fs.mkdirSync(plannerDir, { recursive: true });
    const plannerReceiptPath = path.join(plannerDir, 'live-drill.receipt.json');
    const plannerContractPath = path.join(plannerDir, 'live-drill.contract.json');
    fs.writeFileSync(plannerReceiptPath, JSON.stringify({ status: 'PASS', work_id: request.amendmentId, role: 'strong-planner' }) + '\n');
    fs.writeFileSync(plannerContractPath, JSON.stringify({ status: 'PASS', raw_intent: intent, decisions: ['T-001..T-003 are impacted; T-004 is unaffected'] }) + '\n');
    const hashFile = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const impacted = ['T-001', 'T-002', 'T-003'];
    const recipeFor = (taskId: string) => ({
      taskId: `replacement-${taskId.toLowerCase()}`,
      requirementId: 'REQ-019',
      prompt: `Execute the structured amended recipe for ${taskId}`,
      ownedPaths: ['packages/kernel'],
      forbiddenPaths: ['generated'],
      verification: ['echo'],
      anchors: [taskId, 'REQ-019'],
      invariants: ['workers never author PASS', 'T-004 remains unaffected'],
      acceptance: ['fresh claim-matched evidence is required'],
      proof: ['echo', 'independent review'],
      rollback: ['restore superseded lineage'],
      stopConditions: ['missing planner receipt', 'uncertain external side effect'],
    });
    const rawImpactPlan = {
      schema: 'harness/revision-impact-plan',
      version: 1,
      amendmentId: request.amendmentId,
      planId: 'plan-001',
      rawIntent: intent,
      targetRevision: 'ledger-v2',
      targetTaskIds: impacted,
      invalidatedTaskIds: impacted,
      invalidatedCompletedTaskIds: ['T-003'],
      unaffectedTaskIds: ['T-004'],
      supersededTaskMap: Object.fromEntries(impacted.map(taskId => [taskId, `replacement-${taskId.toLowerCase()}`])),
      newTasks: impacted.map(recipeFor),
      dependencyClosure: Object.fromEntries(impacted.map(taskId => [taskId, [taskId]])),
      planner: {
        role: 'strong-planner',
        receiptPath: '.agent/planner/live-drill.receipt.json',
        receiptSha256: hashFile(plannerReceiptPath),
        contractPath: '.agent/planner/live-drill.contract.json',
        contractSha256: hashFile(plannerContractPath),
        decisions: ['T-001..T-003 are impacted; T-004 is unaffected'],
        unresolved: [],
      },
    };
    const impact = compileRevisionImpactPlanFromStrongPlanner(
      'plan-001', request, ['T-001', 'T-004'], ['T-002'], ['T-003'], 'ledger-v1', rawImpactPlan, testDir,
    );
    expect(impact.status, impact.failureReason).toBe('READY');
    expect(impact.plannerMode).toBe('strong-planner');
    expect(impact.invalidatedTaskIds).toEqual(['T-001', 'T-002', 'T-003']);
    expect(impact.invalidatedCompletedTaskIds).toEqual(['T-003']);

    const result = activateRevisionImpact(testDir, impact);
    if (child.exitCode === null) child.kill('SIGKILL');
    expect(result.success, result.error).toBe(true);
    expect(result.supersededCompletedTaskIds).toEqual(['T-003']);
    expect(result.drainedTaskIds).toEqual(['T-001', 'T-002', 'T-003']);
    expect(fs.existsSync(path.join(readyDir, 'T-004.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(planDir, 'queue', 'superseded', 'T-002.json'), 'utf8')).status).toBe('superseded');
    expect(JSON.parse(fs.readFileSync(path.join(planDir, 'queue', 'superseded', 'T-003.json'), 'utf8')).status).toBe('superseded');

    const retry = createAmendmentRequest('plan-001', intent, testDir);
    expect(retry.state).toBe('ACTIVATED');
    expect(activateRevisionImpact(testDir, impact).addedCount).toBe(0);
  }, 10000);

  it('fails closed and rolls back when an interrupted worker keeps external-effect authority', async () => {
    const activeDir = path.join(planDir, 'queue', 'active');
    const marker = path.join(testDir, 'external-effect-started.log');
    const child = spawn(process.execPath, ['-e', [
      "import fs from 'node:fs';",
      `fs.writeFileSync(${JSON.stringify(marker)}, 'started\\n');`,
      'process.on("SIGINT", () => {});',
      'setInterval(() => {}, 1000);',
    ].join('\n')], { stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 1000;
      const poll = () => {
        if (fs.existsSync(marker)) return resolve();
        if (Date.now() >= deadline) return reject(new Error('external-effect fixture did not start'));
        setTimeout(poll, 10);
      };
      poll();
    });

    const activeTask = {
      id: 'T-002', requirementId: 'REQ-002', prompt: 'worker with uncertain external effect', verification: ['echo'],
      ownedPaths: [], forbiddenPaths: [], repairDepth: 0, status: 'active', pid: child.pid,
    };
    const activePath = path.join(activeDir, 'T-002.json');
    fs.writeFileSync(activePath, JSON.stringify(activeTask, null, 2) + '\n');
    const pointerPath = path.join(testDir, '.agent', 'current.json');
    const ledgerPath = path.join(testDir, '.agent', 'ledger', 'plan-001.json');
    const journalPath = path.join(planDir, 'journal.jsonl');
    const before = {
      active: fs.readFileSync(activePath),
      pointer: fs.readFileSync(pointerPath),
      ledger: fs.readFileSync(ledgerPath),
      journal: fs.readFileSync(journalPath),
    };

    try {
      const request = createAmendmentRequest('plan-001', 'Modify T-002 while external side effect is uncertain', testDir);
      const impact = compileRevisionImpactPlan(
        'plan-001', request, ['T-001', 'T-002', 'T-003'], ['T-002'], [], 'ledger-v1', undefined, testDir,
      );
      expect(impact.status, impact.failureReason).toBe('READY');

      const runtime = process.platform === 'win32'
        ? { sendCooperativeCancellation: (_pid: number) => {}, processStillRunning: (_pid: number) => true }
        : undefined;
      const result = activateRevisionImpact(testDir, impact, runtime);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Uncertain external side effect');
      expect(fs.readFileSync(activePath)).toEqual(before.active);
      expect(fs.readFileSync(pointerPath)).toEqual(before.pointer);
      expect(fs.readFileSync(ledgerPath)).toEqual(before.ledger);
      expect(fs.readFileSync(journalPath)).toEqual(before.journal);
      expect(JSON.parse(fs.readFileSync(path.join(planDir, 'amendments', `${request.amendmentId}.json`), 'utf8')).state).toBe('PENDING');
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      await new Promise<void>((resolve) => child.once('close', () => resolve()));
    }
  }, 10000);

  it('fails closed when another activation holds the exclusive lock', () => {
    const request = createAmendmentRequest('plan-001', 'Modify T-001 while another activation is active', testDir);
    const impact = compileRevisionImpactPlan(
      'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', undefined, testDir,
    );
    const readyPath = path.join(planDir, 'queue', 'ready', 'T-001.json');
    const pointerPath = path.join(testDir, '.agent', 'current.json');
    const readyBefore = fs.readFileSync(readyPath);
    const pointerBefore = fs.readFileSync(pointerPath);
    const lock = new ActivationLock(path.join(testDir, '.agent', 'locks'));
    const token = lock.acquire('live-amendment-activation').token;
    try {
      const result = activateRevisionImpact(testDir, impact);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Concurrent amendment activation');
      expect(fs.readFileSync(readyPath)).toEqual(readyBefore);
      expect(fs.readFileSync(pointerPath)).toEqual(pointerBefore);
    } finally {
      lock.release(token);
    }
  });

  it('keeps concurrent independent activations single-commit and lineage-safe', async () => {
    const request = createAmendmentRequest('plan-001', 'Modify T-003 through a concurrent operator delivery', testDir);
    const impact = compileRevisionImpactPlan(
      'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', undefined, testDir,
    );
    expect(impact.status, impact.failureReason).toBe('READY');

    const impactPath = path.join(testDir, 'impact-plan.json');
    fs.writeFileSync(impactPath, `${JSON.stringify(impact)}\n`);
    const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/state/live-amendment.js');
    const childScript = [
      "import fs from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      "const [modulePath, impactPath, cwd] = process.argv.slice(1);",
      "const { activateRevisionImpact } = await import(pathToFileURL(modulePath).href);",
      "const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));",
      "const result = activateRevisionImpact(cwd, impact);",
      "process.stdout.write(JSON.stringify(result));",
    ].join('\n');
    const run = () => new Promise<{ code: number | null; result: Record<string, unknown> | null; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', childScript, modulePath, impactPath, testDir], {
        cwd: testDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('close', (code) => {
        let result: Record<string, unknown> | null = null;
        try { result = JSON.parse(stdout) as Record<string, unknown>; } catch { /* surfaced by the assertion */ }
        resolve({ code, result, stderr });
      });
    });

    const [first, second] = await Promise.all([run(), run()]);
    const outcomes = [first, second];
    expect(outcomes.every((item) => item.result !== null), JSON.stringify(outcomes)).toBe(true);
    expect(outcomes.every((item) => item.code === 0), JSON.stringify(outcomes)).toBe(true);
    expect(outcomes.every((item) => item.result?.success === true || String(item.result?.error ?? '').includes('Concurrent amendment activation'))).toBe(true);

    const pointer = JSON.parse(fs.readFileSync(path.join(testDir, '.agent', 'current.json'), 'utf8')) as { generation: number };
    expect(pointer.generation).toBe(2);
    const readyFiles = fs.readdirSync(path.join(planDir, 'queue', 'ready'));
    const expectedNewReadyFiles = impact.newTasks.map((task) => `${task.taskId}.json`).sort();
    expect(readyFiles.filter((name) => expectedNewReadyFiles.includes(name)).sort()).toEqual(expectedNewReadyFiles);
    expect(readyFiles).toEqual(expect.arrayContaining(['T-001.json', 'T-002.json']));
    const supersededFiles = fs.readdirSync(path.join(planDir, 'queue', 'superseded'));
    expect(supersededFiles.sort()).toEqual(impact.invalidatedTaskIds.map((taskId) => `${taskId}.json`).sort());
    const requestOnDisk = JSON.parse(fs.readFileSync(path.join(planDir, 'amendments', `${request.amendmentId}.json`), 'utf8')) as { state: string };
    expect(requestOnDisk.state).toBe('ACTIVATED');
  }, 10000);

  it.each(['after-prepared', 'after-queue', 'after-ledger', 'after-pointer', 'after-request', 'after-journal'] as const)(
    'recovers after process death at %s and preserves exactly-once activation',
    async (phase) => {
      const request = createAmendmentRequest('plan-001', `Modify T-003 with crash recovery at ${phase}`, testDir);
      const impact = compileRevisionImpactPlan(
        'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', undefined, testDir,
      );
      expect(impact.status, impact.failureReason).toBe('READY');
      const impactPath = path.join(testDir, `impact-${phase}.json`);
      fs.writeFileSync(impactPath, `${JSON.stringify(impact)}\n`);
      const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/state/live-amendment.js');
      const childScript = [
        "import fs from 'node:fs';",
        "import { pathToFileURL } from 'node:url';",
        "const [modulePath, impactPath, cwd] = process.argv.slice(1);",
        "const { activateRevisionImpact } = await import(pathToFileURL(modulePath).href);",
        "const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));",
        "activateRevisionImpact(cwd, impact);",
      ].join('\n');
      const child = spawn(process.execPath, ['--input-type=module', '-e', childScript, modulePath, impactPath, testDir], {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test', AGENT_RULES_TEST_CRASH_PHASE: phase },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.on('close', (code, signal) => resolve({ code, signal }));
      });
      if (process.platform === 'win32') {
        expect(outcome.code, `${phase}: ${stderr}`).toBe(137);
        expect(outcome.signal, `${phase}: ${stderr}`).toBeNull();
      } else {
        expect(outcome.code, `${phase}: ${stderr}`).toBeNull();
        expect(outcome.signal, `${phase}: ${stderr}`).toBe('SIGKILL');
      }

      // The child died before releasing its lock. Age the dead-owner receipt so
      // the normal stale-lock policy can admit the recovery writer immediately.
      const lockPath = path.join(testDir, '.agent', 'locks', 'live-amendment-activation.lock');
      expect(fs.existsSync(lockPath)).toBe(true);
      fs.writeFileSync(lockPath, `${child.pid}\n0\n`);

      const recovered = activateRevisionImpact(testDir, impact);
      expect(recovered.success, `${phase}: ${recovered.error}`).toBe(true);
      expect(recovered.activatedRevision).toBe('ledger-v2');

      const pointer = JSON.parse(fs.readFileSync(path.join(testDir, '.agent', 'current.json'), 'utf8')) as { generation: number };
      expect(pointer.generation).toBe(2);
      const readyFiles = fs.readdirSync(path.join(planDir, 'queue', 'ready'));
      expect(readyFiles).toEqual(expect.arrayContaining(['T-001.json', 'T-002.json', `${impact.newTasks[0].taskId}.json`].sort()));
      expect(fs.existsSync(path.join(planDir, 'queue', 'superseded', 'T-003.json'))).toBe(true);
      const requestOnDisk = JSON.parse(fs.readFileSync(path.join(planDir, 'amendments', `${request.amendmentId}.json`), 'utf8')) as { state: string };
      expect(requestOnDisk.state).toBe('ACTIVATED');
      const journal = fs.readFileSync(path.join(planDir, 'journal.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(journal.filter((event) => event.type === 'REVISION_ACTIVATED' && event.amendmentId === request.amendmentId)).toHaveLength(1);
      const transactionRoot = path.join(testDir, '.agent', 'amendment-transactions');
      expect(fs.existsSync(transactionRoot) ? fs.readdirSync(transactionRoot) : []).toHaveLength(0);
      expect(fs.readdirSync(path.join(testDir, '.agent')).filter((name) => name.startsWith('backup-queue-'))).toHaveLength(0);
    },
  );

  it('rolls back every durable surface after a partial queue mutation fails', () => {
    const readyDir = path.join(planDir, 'queue', 'ready');
    const malformedTask = '{ malformed task\n';
    fs.writeFileSync(path.join(readyDir, 'T-002.json'), malformedTask);
    const request = createAmendmentRequest('plan-001', 'Modify T-001 after partial failure', testDir);
    const impact = compileRevisionImpactPlan(
      'plan-001', request, ['T-001', 'T-002', 'T-003'], [], [], 'ledger-v1', undefined, testDir,
    );
    const pointerPath = path.join(testDir, '.agent', 'current.json');
    const ledgerPath = path.join(testDir, '.agent', 'ledger', 'plan-001.json');
    const journalPath = path.join(planDir, 'journal.jsonl');
    const pointerBefore = fs.readFileSync(pointerPath);
    const ledgerBefore = fs.readFileSync(ledgerPath);
    const journalBefore = fs.readFileSync(journalPath);

    const result = activateRevisionImpact(testDir, impact);

    expect(result.success).toBe(false);
    expect(result.error).toContain('rolled back');
    expect(fs.readFileSync(path.join(readyDir, 'T-001.json'))).toBeTruthy();
    expect(fs.readFileSync(path.join(readyDir, 'T-002.json'), 'utf8')).toBe(malformedTask);
    expect(fs.readFileSync(pointerPath)).toEqual(pointerBefore);
    expect(fs.readFileSync(ledgerPath)).toEqual(ledgerBefore);
    expect(fs.readFileSync(journalPath)).toEqual(journalBefore);
    expect(JSON.parse(fs.readFileSync(path.join(planDir, 'amendments', `${request.amendmentId}.json`), 'utf8')).state).toBe('PENDING');
  });
});
