import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createAmendmentRequest,
  compileRevisionImpactPlan,
  activateRevisionImpact,
} from '../src/live-amendment.js';
import { TaskQueue } from '../src/runner/queue.js';

describe('live-amendment integration tests', () => {
  const testDir = path.join(os.tmpdir(), `amend-test-${Date.now()}`).replace(/\\/g, '/');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    // Initialize mock .agent folder structures
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'queue', 'failed'), { recursive: true });
    
    // Write original.md plan mock content
    fs.writeFileSync(path.join(planDir, 'original.md'), 'schema: agent-rules/implementation-plan\nversion: 3\nplan_id: plan-001\ntasks:\n  - { id: T-003, requirements: [REQ-002] }\n');

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

    // Mock schema file
    fs.mkdirSync(path.join(testDir, 'schemas'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'schemas', 'execution-contract.schema.json'), '{}');

    // Write mock current pointer passing validation
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
        sha256: require('crypto').createHash('sha256').update('schema: agent-rules/implementation-plan\nversion: 3\nplan_id: plan-001\ntasks:\n  - { id: T-003, requirements: [REQ-002] }\n').digest('hex')
      },
      canonical_ledger: {
        path: '.agent/ledger/plan-001.json',
        sha256: require('crypto').createHash('sha256').update(JSON.stringify(mockLedger, null, 2) + '\n').digest('hex'),
        observed_revision: 1,
        observed_effective_sha256: '61d2b87ba2d6b15d3111beaa011295b1664b0e1b98cb1b93e3a854343738b462',
        plan_status: 'ADOPTED',
        execution_state: 'IN_PROGRESS'
      },
      effective_chain_tip: {
        amendment_id: 'AM-0000',
        path: '.agent/plans/plan-001/original.md',
        sha256: require('crypto').createHash('sha256').update('schema: agent-rules/implementation-plan\nversion: 3\nplan_id: plan-001\ntasks:\n  - { id: T-003, requirements: [REQ-002] }\n').digest('hex')
      },
      candidate_chain_tip: {
        amendment_id: 'AM-0000',
        status: 'OWNER_APPROVED_PENDING_CANONICAL_ACTIVATION',
        path: '.agent/plans/plan-001/original.md',
        sha256: require('crypto').createHash('sha256').update('schema: agent-rules/implementation-plan\nversion: 3\nplan_id: plan-001\ntasks:\n  - { id: T-003, requirements: [REQ-002] }\n').digest('hex')
      },
      contract: {
        path: 'schemas/execution-contract.schema.json',
        sha256: require('crypto').createHash('sha256').update('{}').digest('hex'),
        schema_path: 'schemas/execution-contract.schema.json',
        requirement_ids: [
          'M11-R18',
          'M11-R19'
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
    
    // Write mock journal
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), '');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates amendment request and activates revision impact safely', () => {
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');

    // Add active task T-003 and ready task T-007
    const mockActiveTask = {
      id: 'task-active-003',
      requirementId: 'REQ-002',
      prompt: 'Build canonical state',
      verification: ['npm run verify:all'],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    fs.writeFileSync(path.join(planDir, 'queue', 'active', 'task-active-003.json'), JSON.stringify(mockActiveTask, null, 2) + '\n');

    const mockReadyTask = {
      id: 'task-ready-007',
      requirementId: 'REQ-012',
      prompt: 'Cut over CLI',
      verification: ['npm run verify:all'],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
      status: 'ready',
    };
    fs.writeFileSync(path.join(planDir, 'queue', 'ready', 'task-ready-007.json'), JSON.stringify(mockReadyTask, null, 2) + '\n');

    // 1. Create AmendmentRequest
    const request = createAmendmentRequest('plan-001', 'Replace task-active-003 with secure checkpoint protocol', testDir);
    expect(request.amendmentId).toMatch(/^amend-[a-f0-9]{8}$/);
    expect(request.state).toBe('PENDING');

    // 2. Compile RevisionImpactPlan
    const impactPlan = compileRevisionImpactPlan(
      'plan-001',
      request,
      ['task-ready-007'],
      ['task-active-003'],
      [],
      'ledger-v1'
    );

    expect(impactPlan.targetRevision).toBe('ledger-v2');
    expect(impactPlan.invalidatedTaskIds).toContain('task-active-003');
    expect(impactPlan.newTasks.length).toBe(1);

    const replacementTaskId = impactPlan.supersededTaskMap['task-active-003'];
    expect(replacementTaskId).toBeTruthy();

    // 3. Activate impact plan
    const result = activateRevisionImpact(testDir, impactPlan);
    expect(result.success).toBe(true);
    expect(result.activatedRevision).toBe('ledger-v2');
    expect(result.invalidatedCount).toBe(1);
    expect(result.drainedTaskIds).toContain('task-active-003');

    // Verify task-active-003 was moved to the distinct superseded state.
    expect(fs.existsSync(path.join(planDir, 'queue', 'active', 'task-active-003.json'))).toBe(false);
    const supersededFile = path.join(planDir, 'queue', 'superseded', 'task-active-003.json');
    expect(fs.existsSync(supersededFile)).toBe(true);
    const supersededTask = JSON.parse(fs.readFileSync(supersededFile, 'utf8'));
    expect(supersededTask.reason).toContain('SUPERSEDED_BY');
    expect(supersededTask.status).toBe('superseded');

    // Verify replacement task is ready
    const newReadyFile = path.join(planDir, 'queue', 'ready', `${replacementTaskId}.json`);
    expect(fs.existsSync(newReadyFile)).toBe(true);
    const replacementTask = JSON.parse(fs.readFileSync(newReadyFile, 'utf8'));
    expect(replacementTask.requirementId).toBe('REQ-019-AMENDED');

    // Verify unaffected tasks continue (task-ready-007 is unaffected and should still be ready or untouched)
    // Note: since our emulator simplifies compileImpactPlan, it keeps task-ready-007 untouched
    expect(fs.existsSync(path.join(planDir, 'queue', 'ready', 'task-ready-007.json'))).toBe(true);

    // Verify amendment request updated state to ACTIVATED
    const requestFile = path.join(planDir, 'amendments', `${request.amendmentId}.json`);
    const updatedRequest = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(updatedRequest.state).toBe('ACTIVATED');

    // Verify current pointer revision advanced
    const pointer = JSON.parse(fs.readFileSync(path.join(testDir, '.agent', 'current.json'), 'utf8'));
    expect(pointer.canonical_ledger.observed_revision).toBe(2);

    // Verify journal logged REVISION_ACTIVATED event
    const journalContent = fs.readFileSync(path.join(planDir, 'journal.jsonl'), 'utf8');
    expect(journalContent).toContain('REVISION_ACTIVATED');
  });

  it('invalidates completed impacted work without relabeling it as a failure', () => {
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    const doneDir = path.join(planDir, 'queue', 'done');
    fs.mkdirSync(doneDir, { recursive: true });
    fs.writeFileSync(path.join(doneDir, 'T-003.json'), JSON.stringify({
      id: 'T-003',
      requirementId: 'REQ-002',
      prompt: 'Completed before amendment',
      verification: ['npm run verify:all'],
      ownedPaths: [],
      repairDepth: 0,
      status: 'done',
      createdAt: new Date().toISOString(),
    }, null, 2) + '\n');

    const request = createAmendmentRequest('plan-001', 'Modify T-003 acceptance after completed work', testDir);
    const impactPlan = compileRevisionImpactPlan(
      'plan-001', request, ['T-003'], [], ['T-003'], 'ledger-v1', undefined, testDir,
    );

    expect(impactPlan.invalidatedCompletedTaskIds).toEqual(['T-003']);
    const result = activateRevisionImpact(testDir, impactPlan);
    expect(result.success).toBe(true);
    expect(result.supersededCompletedTaskIds).toEqual(['T-003']);
    expect(fs.existsSync(path.join(doneDir, 'T-003.json'))).toBe(false);

    const superseded = JSON.parse(fs.readFileSync(
      path.join(planDir, 'queue', 'superseded', 'T-003.json'), 'utf8',
    ));
    expect(superseded.status).toBe('superseded');
    expect(superseded.supersededByAmendmentId).toBe(request.amendmentId);
    expect(superseded.supersededByTaskId).toBe(impactPlan.supersededTaskMap['T-003']);
  });

  it('compiles impact against the reviewed contract when one is active', () => {
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.writeFileSync(path.join(planDir, 'contract.yaml'), [
      'schema: agent-rules/implementation-plan',
      'version: 3',
      'plan_id: plan-001',
      'tasks:',
      '  - { id: T-002, requirements: [REQ-019] }',
      '  - { id: T-003, depends_on: [T-002], requirements: [REQ-002] }',
      '',
    ].join('\n'));

    const request = createAmendmentRequest('plan-001', 'Modify REQ-019 live amendment contract', testDir);
    const impactPlan = compileRevisionImpactPlan(
      'plan-001', request, ['task-ready'], [], [], 'ledger-v1', undefined, testDir,
    );

    expect(impactPlan.status).toBe('READY');
    expect(impactPlan.invalidatedTaskIds).toEqual(['T-002', 'T-003']);
    expect(impactPlan.newTasks[0]?.requirementId).toBe('REQ-019');
  });
});
