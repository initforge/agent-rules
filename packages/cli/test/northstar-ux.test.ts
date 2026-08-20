import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { initNorthStar, NORTHSTAR_EVIDENCE_KINDS, northStarDrain, northStarIngest, northStarReference, northStarReferenceSearch, northStarRun, northStarStatus } from '../src/commands/northstar-ux.js';
import type { HostResourceSnapshot } from '@initforge/agent-rules-engine/northstar/index';

const roots: string[] = [];
const TEST_RESOURCE_SNAPSHOT: HostResourceSnapshot = Object.freeze({
  observed_at: '2026-01-01T00:00:00.000Z',
  cpu_count: 4,
  load_1m: 0,
  load_per_core: 0,
  total_memory_mb: 16_384,
  free_memory_mb: 8_192,
  free_memory_ratio: 0.5,
  platform: process.platform,
});
function tempRepo(): string {
  const tmpBase = path.join(process.cwd(), ".agent", "tmp");
  fs.mkdirSync(tmpBase, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmpBase, 'agent-rules-northstar-cli-'));
  roots.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['commit', '-q', '-m', 'initial'], { cwd: root });
  return root;
}
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('North-Star CLI UX', () => {
  it('reads a verified central 5fedu reference without installing it into the project', () => {
    const root = tempRepo();
    const result = northStarReference(root, '5fedu', 'features/he-thong/nhan-vien/nhan-vien.module.tsx');
    expect(result.path).toBe('features/he-thong/nhan-vien/nhan-vien.module.tsx');
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.content).toContain('createFeatureModule');
    expect(fs.existsSync(path.join(root, 'profiles', '5fedu'))).toBe(false);
  });

  it('searches the central 5fedu source as path:line:hash pointers without copying it', () => {
    const root = tempRepo();
    const matches = northStarReferenceSearch(root, '5fedu', 'RowActionsOverflowMenu', 10);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].path).toMatch(/\.(?:ts|tsx)$/);
    expect(matches[0].line).toBeGreaterThan(0);
    expect(matches[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(root, 'profiles', '5fedu'))).toBe(false);
  });

  it('normalizes external trigger envelopes into persisted WorkRequest without executing', () => {
    const root = tempRepo();
    const result = northStarIngest(root, { source: 'issue', source_id: '123', intent: 'Fix the failing export', constraints: ['preserve API'] });
    expect(result.request.source).toBe('issue');
    expect(result.request.raw_intent).toBe('Fix the failing export');
    expect(result.request.work_id).toMatch(/^W-[0-9a-f]{12}$/);
    expect(path.dirname(result.path)).toBe(path.join(root, '.agent', 'requests'));
    expect(fs.existsSync(result.path)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(saved.status).toBe('READY');
  });

  it('hashes untrusted external source IDs so trigger filenames cannot escape the queue', () => {
    const root = tempRepo();
    const queued = northStarIngest(root, { source: 'webhook', source_id: '../../../../escape', intent: 'Inspect a queued change' });
    expect(queued.request.work_id).toMatch(/^W-[0-9a-f]{12}$/);
    expect(path.resolve(queued.path).startsWith(path.resolve(root, '.agent', 'requests') + path.sep)).toBe(true);
    expect(fs.existsSync(path.join(root, '..', 'escape.json'))).toBe(false);
  });

  it('drains a persisted trigger unattended, preserves its work_id, and records proof-of-work pointers', async () => {
    const root = tempRepo();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'seed.ts'), 'export const seed = 1;\n');
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['commit', '-q', '-m', 'seed'], { cwd: root });
    const intent = 'Add queued deterministic behavior';
    const queued = northStarIngest(root, { source: 'issue', source_id: 'Q-77', intent });
    const contract = {
      protocol_version: '2.0', raw_intent: intent, risk_class: 'S1', known: ['src exists'], assumed: [], unresolved: [], requires_user: [],
      impact: { owning_modules: ['src'], dependency_breadth: 'single module', public_api: [], schema_data: [], security_boundaries: [], reference_dependencies: [], relevant_tests: [], active_decisions: [] },
      requirements: [{ id: 'R-001', statement: intent, mandatory: true, claims: [{ claim_id: 'C-001a', statement: 'Behavior exists', class: 'mechanical', required_kinds: ['test'] }] }],
      tasks: [{ goal: intent, requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], forbidden: [], verifiers_by_claim: { 'C-001a': ['V-001'] } }],
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['--version'] } }], decisions: [], claim_policies: [],
    };
    const drained = await northStarDrain(root, {
      max: 1, planner: 'codex', agent: 'claude', skipAgentDetection: true, resourceSnapshot: TEST_RESOURCE_SNAPSHOT,
      plannerInvocationOverride: () => ({ executable: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(contract))})`] }),
      workerInvocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(root, 'src', 'queued.ts'))}, 'export const queued = true;\\n')`] }),
    });
    expect(drained.processed).toBe(1);
    expect(drained.results[0]).toMatchObject({ work_id: queued.request.work_id, status: 'PASS' });
    const record = JSON.parse(fs.readFileSync(queued.path, 'utf8')) as { status: string; attempts: number; run_id: string; proof_of_work: string; result: string; request: { work_id: string } };
    expect(record.request.work_id).toBe(queued.request.work_id);
    expect(record.status).toBe('PASS');
    expect(record.attempts).toBe(1);
    expect(fs.existsSync(path.join(root, record.proof_of_work))).toBe(true);
    expect(fs.existsSync(path.join(root, record.result))).toBe(true);
    expect(record.run_id).toMatch(/^RUN-/);
  });

  it('reconciles an already completed run instead of executing the worker twice after a drainer crash window', async () => {
    const root = tempRepo();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'seed.ts'), 'export const seed = 1;\n');
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['commit', '-q', '-m', 'seed'], { cwd: root });
    const intent = 'Add crash-safe queued behavior';
    const queued = northStarIngest(root, { source: 'ci', source_id: 'job-77', intent });
    const contract = {
      protocol_version: '2.0', raw_intent: intent, risk_class: 'S1', known: ['src exists'], assumed: [], unresolved: [], requires_user: [],
      impact: { owning_modules: ['src'], dependency_breadth: 'single module', public_api: [], schema_data: [], security_boundaries: [], reference_dependencies: [], relevant_tests: [], active_decisions: [] },
      requirements: [{ id: 'R-001', statement: intent, mandatory: true, claims: [{ claim_id: 'C-001a', statement: 'Behavior exists', class: 'mechanical', required_kinds: ['test'] }] }],
      tasks: [{ goal: intent, requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], forbidden: [], verifiers_by_claim: { 'C-001a': ['V-001'] } }],
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['--version'] } }], decisions: [], claim_policies: [],
    };
    const plannerInvocationOverride = () => ({ executable: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(contract))})`] });
    const first = await northStarRun({
      repoRoot: root, intent, request: queued.request, planner: 'codex', agent: 'claude', skipAgentDetection: true, resourceSnapshot: TEST_RESOURCE_SNAPSHOT,
      plannerInvocationOverride,
      workerInvocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(root, 'src', 'once.ts'))}, ${JSON.stringify('export const once = 1;\n')})`] }),
    }) as { trusted_outcome: string; run_id: string };
    expect(first.trusted_outcome).toBe('PASS');
    let duplicateWorkerCalls = 0;
    const drained = await northStarDrain(root, {
      max: 1, planner: 'codex', agent: 'claude', skipAgentDetection: true, resourceSnapshot: TEST_RESOURCE_SNAPSHOT, plannerInvocationOverride,
      workerInvocationOverride: () => { duplicateWorkerCalls += 1; return { executable: process.execPath, args: ['-e', 'process.exit(99)'] }; },
    });
    expect(duplicateWorkerCalls).toBe(0);
    expect(drained.results[0]).toMatchObject({ work_id: queued.request.work_id, status: 'PASS', run_id: first.run_id });
    const record = JSON.parse(fs.readFileSync(queued.path, 'utf8')) as { status: string; attempts: number; run_id: string };
    expect(record.status).toBe('PASS');
    expect(record.run_id).toBe(first.run_id);
    expect(record.attempts).toBe(1);
  });

  it('normalizes and persists legacy config defaults instead of returning a partial cast', () => {
    const root = tempRepo();
    const file = path.join(root, '.agent', 'northstar.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ protocol_version: '2.0', default_agent: 'codex' }));
    const init = initNorthStar(root);
    expect(init.created).toBe(false);
    expect(init.config).toEqual({ protocol_version: '2.0', default_agent: 'codex', default_planner: 'claude', explicit_capability_providers: [], domain_pack: null });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(init.config);
  });

  it('initializes a schema-versioned config and reports idle before any run', () => {
    const root = tempRepo();
    const init = initNorthStar(root, 'codex');
    expect(init.created).toBe(true);
    expect(init.config.default_agent).toBe('codex');
    expect(init.config.default_planner).toBe('claude');
    expect(northStarStatus(root)).toEqual({ status: 'idle', runs: 0 });
  });

  it('fails closed for S2/S3 intent instead of dispatching a worker without a strong planner', async () => {
    const root = tempRepo();
    const result = await northStarRun({ repoRoot: root, intent: 'migrate authentication across multiple services and change architecture', owned: ['src'] }) as { outcome: string; reason: string; work_id: string };
    expect(result.outcome).toBe('BLOCKED');
    expect(result.reason).toContain('planner');
    expect(result.work_id).toMatch(/^W-/);
  });

  it('REQ-013: ambiguous intent is classified and never handed to a weak worker without a planner contract', async () => {
    const root = tempRepo();
    const result = await northStarRun({ repoRoot: root, intent: 'decide between two architectures', owned: ['src'] }) as { outcome: string; reason: string; work_id: string; intake_decision?: { determinacy: string } };
    expect(result.outcome).toBe('BLOCKED');
    // The intent is semantically ambiguous: it must not be compiled
    // deterministically by a weak worker; it stops at the planner boundary.
    expect(result.reason).toMatch(/planner|PLANNER/);
    expect(result.work_id).toMatch(/^W-/);
  });

  it('auto-escalates incomplete direct input to the strong planner and blocks if no planner host is available', async () => {
    const root = tempRepo();
    const result = await northStarRun({ repoRoot: root, intent: 'fix typo', owned: ['README.md'], planner: 'claude' }) as { outcome: string; reason: string };
    expect(result.outcome).toBe('BLOCKED');
    expect(result.reason).toContain('planner');
  });

  it('auto-plans incomplete work in a fresh snapshot and only then dispatches the bounded worker', async () => {
    const root = tempRepo();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'seed.ts'), 'export const seed = 1;\n');
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['commit', '-q', '-m', 'seed'], { cwd: root });
    const intent = 'Add a narrow checked behavior';
    const contract = {
      protocol_version: '2.0', raw_intent: intent, risk_class: 'S1', known: ['src exists'], assumed: [], unresolved: [], requires_user: [],
      impact: { owning_modules: ['src'], dependency_breadth: 'single module', public_api: [], schema_data: [], security_boundaries: [], reference_dependencies: [], relevant_tests: [], active_decisions: [] },
      requirements: [{ id: 'R-001', statement: intent, mandatory: true, claims: [{ claim_id: 'C-001a', statement: 'Behavior exists', class: 'mechanical', required_kinds: ['test'] }] }],
      tasks: [{ goal: intent, requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], forbidden: [], verifiers_by_claim: { 'C-001a': ['V-001'] } }],
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['--version'] } }], decisions: [], claim_policies: [],
    };
    const result = await northStarRun({
      repoRoot: root, intent, owned: [], planner: 'codex', agent: 'claude', skipAgentDetection: true, resourceSnapshot: TEST_RESOURCE_SNAPSHOT,
      plannerInvocationOverride: () => ({ executable: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(contract))})`] }),
      workerInvocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(root, 'src', 'out.ts'))}, ${JSON.stringify('export const out = 1;\n')})`] }),
    }) as { trusted_outcome: string; runner: { reports: unknown[] } };
    expect(result.trusted_outcome).toBe('PASS');
    expect(result.runner.reports).toHaveLength(1);
    expect(fs.readdirSync(path.join(root, '.agent', 'planner')).some((name) => name.endsWith('.receipt.json'))).toBe(true);
  });

  it('exposes a closed evidence-kind vocabulary', () => {
    expect(NORTHSTAR_EVIDENCE_KINDS).toContain('browser');
    expect(NORTHSTAR_EVIDENCE_KINDS).not.toContain('whatever');
  });
});
