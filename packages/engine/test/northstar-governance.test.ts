import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { adaptCiRun, adaptGitHubIssue, adaptGitHubPullRequest, adaptWebhook, normalizeTrigger, parseTriggerEnvelope, TriggerQueue } from '../src/northstar/trigger.js';
import { governModel } from '../src/northstar/model-governor.js';
import { validateDelegation } from '../src/northstar/delegation.js';
import { assertHostSurface, HOST_CAPABILITIES, requireHostMode } from '../src/northstar/host-adapters.js';
import { buildVerificationGraph } from '../src/northstar/verification-graph.js';
import { compileSpecRevision, compileTaskPackets, compileWorkSpec, createWorkRequest } from '../src/northstar/compiler.js';
import { assertDomainPackStage, loadDomainPack, readDomainReference, resolveHarnessRoot, summarizeDomainBehavior } from '../src/northstar/domain-packs.js';
import { assertResourceBudget, DEFAULT_RESOURCE_POLICY, governResources, type HostResourceSnapshot } from '../src/northstar/resource-governor.js';
import { capabilityAuthorizationReason, createStandardCapabilityBroker, routeSkills } from '../src/northstar/routing.js';
import { compileContext } from '../src/northstar/context.js';
import { assertExecutionTransition, transitionExecution, truthFromOutcome, type ExecutionLifecycleRecord } from '../src/northstar/execution-lifecycle.js';
import { TaskQueue } from '../src/runner/queue.js';
import type { ExecutionAuthority } from '../src/state/execution-authority.js';
import { decide, deriveChangeFacts, validateSemanticState } from '@initforge/agent-rules-kernel';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

function writeCurrentPointer(root: string, workId: string, generation: number): void {
  fs.mkdirSync(path.join(root, '.agent'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agent', 'current.json'), `${JSON.stringify({
    schema: 'artifact/execution-contract',
    version: 1,
    kind: 'current-pointer',
    generation,
    work_id: workId,
    plan_id: 'plan-current',
    canonical_ledger: { observed_revision: 1 },
    atomicity: { protocol: 'generation-compare-and-swap', commit_target: '.agent/current.json' },
  })}\n`);
}

describe('North-Star governance', () => {
  it('rejects malformed trigger envelopes fail-closed', () => {
    expect(() => parseTriggerEnvelope({ source: 'ci', intent: 'x', shell: 'npm test' })).toThrow(/unknown field/i);
    expect(() => parseTriggerEnvelope({ source: 'mystery', intent: 'x' })).toThrow(/invalid trigger source/i);
    expect(() => parseTriggerEnvelope({ source: 'webhook', intent: '' })).toThrow(/non-empty/i);
  });

  it('normalizes triggers without changing raw intent', () => {
    const intent = 'Fix CI without weakening tests\nKeep this exact text.';
    const request = normalizeTrigger({ source: 'ci', source_id: 'build-42', intent, constraints: ['no test deletion'] });
    expect(request.raw_intent).toBe(intent);
    expect(request.source).toBe('ci');
    expect(request.work_id).toMatch(/^W-[0-9a-f]{12}$/);
  });

  it('keeps claim locks out of queue listings and recovers an abandoned RUNNING request', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-trigger-queue-'));
    try {
      const queue = new TriggerQueue(root);
      queue.enqueue({ source: 'webhook', source_id: 'evt-1', intent: 'Run queued work' });
      const claim = queue.claimNext();
      expect(claim).not.toBeNull();
      expect(queue.list()).toHaveLength(1);
      expect(queue.list()[0].record.status).toBe('RUNNING');
      const claimBody = JSON.parse(fs.readFileSync(claim!.claim_path, 'utf8')) as Record<string, unknown>;
      claimBody.pid = 99999999;
      fs.writeFileSync(claim!.claim_path, JSON.stringify(claimBody));
      expect(queue.recoverStaleClaims()).toBe(1);
      expect(queue.list()[0].record.status).toBe('READY');
      expect(queue.claimNext()?.record.attempts).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('supersedes an abandoned request when the owner generation has advanced', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-trigger-stale-'));
    try {
      const request = { source: 'webhook' as const, source_id: 'evt-stale', intent: 'Run stale work' };
      const normalized = normalizeTrigger(request);
      writeCurrentPointer(root, normalized.work_id, 1);
      const queue = new TriggerQueue(root);
      queue.enqueue(request);
      const claim = queue.claimNext();
      expect(claim?.record.execution_generation).toBe(1);

      writeCurrentPointer(root, normalized.work_id, 2);
      fs.writeFileSync(claim!.claim_path, JSON.stringify({ token: claim!.token, pid: 99999999 }));

      expect(queue.recoverStaleClaims()).toBe(1);
      expect(queue.list()[0].record.status).toBe('SUPERSEDED');
      expect(queue.claimNext()).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a late completion after the owner generation changes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-trigger-late-'));
    try {
      const request = { source: 'webhook' as const, source_id: 'evt-late', intent: 'Complete late work' };
      const normalized = normalizeTrigger(request);
      writeCurrentPointer(root, normalized.work_id, 1);
      const queue = new TriggerQueue(root);
      queue.enqueue(request);
      const claim = queue.claimNext();
      expect(claim).not.toBeNull();

      writeCurrentPointer(root, normalized.work_id, 2);
      const result = queue.complete(claim!, { status: 'PASS', run_id: 'late-run' });
      expect(result.status).toBe('SUPERSEDED');
      expect(result.reason).toMatch(/STALE_RESULT/);
      expect(result.result).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('retires ready and active task records whose execution identity is no longer current', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-task-stale-'));
    try {
      const authority: ExecutionAuthority = {
        source: 'current-pointer',
        work_id: 'W-current',
        plan_id: 'plan-current',
        execution_generation: 2,
        spec_revision: 1,
      };
      const queue = new TaskQueue(root);
      queue.add({
        id: 'old-ready', prompt: 'old ready', verification: ['true'], ownedPaths: ['src'], repairDepth: 0,
        workId: 'W-old', executionGeneration: 1, specRevision: 1,
      });
      expect(queue.claim(authority)).toBeNull();
      expect(queue.counts().superseded).toBe(1);

      queue.add({
        id: 'old-active', prompt: 'old active', verification: ['true'], ownedPaths: ['src'], repairDepth: 0,
        workId: 'W-old', executionGeneration: 1, specRevision: 1,
      });
      const active = queue.claim();
      expect(active?.id).toBe('old-active');
      expect(queue.recoverAbandoned(false, authority)).toHaveLength(1);
      expect(queue.counts().superseded).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects contradictory semantic state instead of trusting a green aggregate', () => {
    const result = validateSemanticState({
      authority: { source: 'unbound', work_id: null, plan_id: null, execution_generation: 0, spec_revision: null },
      tasks: [{ id: 'T-001', status: 'PASS', work_id: 'W-1', execution_generation: 0, claim_ids: ['C-001'], worker_authored_pass: true }],
      runs: [{ id: 'RUN-1', status: 'passed', work_id: 'W-1', execution_generation: 0, unresolved_claims: ['C-001'], task_ids: ['T-001'] }],
      evidence: [{ id: 'E-001', claim_id: 'C-001', status: 'pass', work_id: 'W-1', execution_generation: 0, source_role: 'worker' }],
      acceptance: { outcome: 'PASS', unresolved_claims: ['C-001'] },
    });
    expect(result.valid).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toEqual(expect.arrayContaining([
      'WORKER_AUTHORED_PASS', 'PASS_WITH_UNRESOLVED_CLAIMS', 'PASS_WITH_NONTERMINAL_TASK',
    ]));
  });

  it('derives phase, policy, capabilities, verifiers, and reviewers from typed facts', () => {
    const request = createWorkRequest({ raw_intent: 'Verify the component flow' });
    const compiled = compileWorkSpec(request, { risk_class: 'S2', requirements: [{ statement: 'Flow is correct', claims: [{ statement: 'browser flow passes', class: 'runtime', verifier_id: 'V-browser' }, { statement: 'semantics are sound', class: 'semantic', verifier_id: 'V-semantic' }] }] });
    const [packet] = compileTaskPackets(compiled, [{ phase: 'verify', goal: 'Verify component flow', requirement_ids: ['R-001'], claim_ids: ['C-001a', 'C-001b'], owned: ['packages/web'], capabilities: [] }]);
    const decision = decide({
      packet,
      spec: compiled.spec,
      manifest: compiled.manifest,
      repoFacts: {
        schema: 'harness/repo-facts/v1', version: 1, workspace_root: repoRoot,
        facts: [
          { fact_id: 'framework', value: ['react'], detector_id: 'package-manifest', confidence: 1, status: 'observed', sources: [{ path: 'package.json', sha256: 'a'.repeat(64) }] },
          { fact_id: 'test.runner', value: ['playwright'], detector_id: 'package-manifest', confidence: 1, status: 'observed', sources: [{ path: 'package.json', sha256: 'a'.repeat(64) }] },
        ],
      },
    });
    expect(decision.phase).toBe('verify');
    expect(decision.skills).toEqual([]);
    expect(decision.capabilities).toContain('browser.verify');
    expect(decision.verifiers).toEqual(['V-browser', 'V-semantic']);
    expect(decision.reviewers).toContain('independent-semantic-review');
    expect(decision.policies).toContain('execution.current-generation-only');
  });

  it('requires migration-specific proof from typed schema impact and observes post-change paths', () => {
    const request = createWorkRequest({ raw_intent: 'Migrate the account schema', risk_hint: 'S2' });
    const compiled = compileWorkSpec(request, {
      risk_class: 'S2',
      impact: {
        owning_modules: ['packages/db'], dependency_breadth: 'single module', public_api: [],
        schema_data: ['accounts'], security_boundaries: [], reference_dependencies: [], relevant_tests: [], active_decisions: [],
      },
      requirements: [{ statement: 'The migration is proven safely', claims: [{ statement: 'migration proof exists', class: 'integration', verifier_id: 'V-migration' }] }],
    });
    const [packet] = compileTaskPackets(compiled, [{ phase: 'verify', goal: 'Verify the account migration', requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['packages/db'], verifier_by_claim: { 'C-001a': 'V-migration' } }]);
    const decision = decide({ packet, spec: compiled.spec, manifest: compiled.manifest, mode: 'active' });
    expect(decision.capabilities).toEqual(expect.arrayContaining(['database.disposable', 'database.migration.verify']));
    expect(decision.policies).toEqual(expect.arrayContaining(['database.migration-proof.required', 'database.disposable.required']));
    expect(decision.task_facts.impact.schema).toBe(true);
    expect(decision.task_facts.change_observation).toBe('planned');
    const observed = deriveChangeFacts(compiled.spec, packet, ['packages/db/migration.sql']);
    expect(observed.observation).toBe('observed');
    expect(observed.observed_paths).toEqual(['packages/db/migration.sql']);
  });

  it('fails closed for unapproved effectful providers while preserving local task-scope writes', () => {
    const broker = createStandardCapabilityBroker(repoRoot);
    const localWrite = broker.provider('safe-argv', 'shell.exec');
    expect(localWrite).not.toBeNull();
    expect(capabilityAuthorizationReason(localWrite!)).toMatch(/approval required/);
    expect(broker.resolve('shell.exec')).toBeNull();
    expect(broker.resolve('shell.exec', [], { taskScopeApproved: true })?.id).toBe('safe-argv');
    broker.register({
      id: 'production-migration', capability: 'database.migration.verify', priority: 1,
      effect: { effect_level: 'write', environment: 'network', approval: 'owner', reversible: false, network: true, credentials: 'required', timeout_ms: 120000, provider_evidence: 'live-receipt' },
    });
    expect(broker.resolve('database.migration.verify')).toBeNull();
    expect(broker.resolve('database.migration.verify', [], { ownerApproved: true })?.id).toBe('production-migration');
  });

  it('records old/new routing differences in shadow mode without changing the legacy route', () => {
    const request = createWorkRequest({ raw_intent: 'Verify visual parity in the browser' });
    const compiled = compileWorkSpec(request, { requirements: [{ statement: 'Parity is verified', claims: [{ statement: 'parity passes', class: 'runtime', verifier_id: 'V' }] }] });
    const [packet] = compileTaskPackets(compiled, [{ goal: 'Verify visual parity in the browser', requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], verifier_by_claim: { 'C-001a': 'V' } }]);
    const routed = createStandardCapabilityBroker(repoRoot).route(packet, [], { repoRoot });
    expect(routed.decision_fabric?.mode).toBe('shadow');
    expect(routed.skills[0]?.id).toBe('parity-verification');
    expect(routed.decision_fabric?.legacy?.skills).toContain('parity-verification');
    expect(routed.decision_fabric?.differences).toEqual(expect.arrayContaining(['skills:parity-verification']));
  });

  it('can dogfood the typed route in active mode while preserving provider health/fallback metadata', () => {
    const request = createWorkRequest({ raw_intent: 'Verify visual parity in the browser' });
    const compiled = compileWorkSpec(request, { requirements: [{ statement: 'Parity is verified', claims: [{ statement: 'parity passes', class: 'runtime', verifier_id: 'V' }] }] });
    const [packet] = compileTaskPackets(compiled, [{ goal: 'Verify visual parity in the browser', requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], verifier_by_claim: { 'C-001a': 'V' } }]);
    const broker = createStandardCapabilityBroker(repoRoot, { decisionFabricMode: 'active' });
    const routed = broker.route(packet, [], { repoRoot });
    expect(routed.decision_fabric?.mode).toBe('active');
    expect(routed.skills).toEqual([]);
    const semantic = broker.provider('codebase-memory-mcp', 'code.semantic');
    expect(semantic?.health?.command).toBeTruthy();
    expect(semantic?.fallback).toContain('rg');
  });

  it('keeps workers cheap by default and escalates only on observed boundary/failure', () => {
    expect(governModel({ role: 'worker', risk: 'S1' }).logical_class).toBe('economy');
    expect(governModel({ role: 'worker', risk: 'S2' }).logical_class).toBe('standard');
    expect(governModel({ role: 'worker', risk: 'S1', repeatedFailures: 2 }).logical_class).toBe('expert');
    expect(governModel({ role: 'planner', risk: 'S1' }).logical_class).toBe('expert');
    expect(governModel({ role: 'reviewer', risk: 'S1' }).logical_class).toBe('expert');
    expect(governModel({ role: 'planner', risk: 'S2' }).logical_class).toBe('expert');
  });

  it('never lets a lower user override defeat the safety floor', () => {
    expect(governModel({ role: 'reviewer', risk: 'S3', userOverride: 'economy' }).logical_class).toBe('expert');
  });

  it('enforces max-two, non-recursive delegation', () => {
    expect(() => validateDelegation([
      { id: 'research', reason: 'parallel-independent-research', parent_depth: 0, independent_scope: ['docs'] },
      { id: 'review', reason: 'independent-review', parent_depth: 0, independent_scope: ['src'] },
    ])).not.toThrow();
    expect(() => validateDelegation([
      { id: 'recursive', reason: 'specialized-capability', parent_depth: 1, independent_scope: ['src'] },
    ])).toThrow(/recursive/);
  });

  it('declares host surfaces honestly and includes MiMoCode headless support', () => {
    expect(() => assertHostSurface(repoRoot)).not.toThrow();
    expect(HOST_CAPABILITIES.mimocode.headless).toBe(true);
    expect(() => requireHostMode('cursor', 'headless')).toThrow(/does not have a certified headless/);
  });

  it('orders cheap verification before deep semantic/browser gates', () => {
    const request = createWorkRequest({ raw_intent: 'Implement bounded UI change' });
    const compiled = compileWorkSpec(request, {
      requirements: [{
        statement: 'UI behavior is correct',
        claims: [
          { statement: 'unit behavior passes', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-unit' },
          { statement: 'runtime browser behavior matches', class: 'runtime', required_kinds: ['browser'], verifier_id: 'V-browser' },
        ],
      }],
    });
    const packets = compileTaskPackets(compiled, [{
      goal: 'Implement UI behavior', requirement_ids: ['R-001'], owned: ['src'], claim_ids: ['C-001a', 'C-001b'],
    }]);
    const graph = buildVerificationGraph(packets, compiled.manifest);
    expect(graph.map((node) => node.cost)).toEqual(['cheap', 'deep']);
    expect(graph[0].depends_on).toEqual([]);
    expect(graph[1].depends_on).toEqual([graph[0].claim_id]);
  });

  it('routes skills from the canonical graph and requires explicit project scope for 5fedu', () => {
    const request = createWorkRequest({ raw_intent: 'Verify visual parity in the browser' });
    const compiled = compileWorkSpec(request, { requirements: [{ statement: 'Parity is verified', claims: [{ statement: 'visual parity passes', class: 'runtime', verifier_id: 'V' }] }] });
    const [packet] = compileTaskPackets(compiled, [{ goal: 'Verify visual parity in the browser', requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], verifier_by_claim: { 'C-001a': 'V' } }]);
    const routes = routeSkills(packet, repoRoot);
    expect(routes[0]?.id).toBe('parity-verification');
    expect(routes[0]?.source).toBe('skills/parity-verification/SKILL.md');
    expect(routes[0]?.graph_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(routes.map((route) => route.id)).toContain('browser-qa');
    expect(routes.map((route) => route.id)).toContain('qa-skills');

    packet.goal = '5fedu ERP module drawer listview parity';
    packet.skills = ['5fedu-module-parity'];
    expect(routeSkills(packet, repoRoot).some((route) => route.id === '5fedu-module-parity')).toBe(false);
    expect(routeSkills(packet, repoRoot, { activeProjectScope: '5fedu' })[0]?.id).toBe('5fedu-module-parity');
  });

  it('loads routed harness skills centrally without installing them into the target project', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-skill-workspace-'));
    try {
      const request = createWorkRequest({ raw_intent: 'Verify 5fedu module parity' });
      const compiled = compileWorkSpec(request, { requirements: [{ statement: 'Parity is verified', claims: [{ statement: 'parity passes', class: 'runtime', verifier_id: 'V' }] }] });
      const [packet] = compileTaskPackets(compiled, [{ goal: 'Verify 5fedu drawer parity', requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], skills: ['5fedu-module-parity'], verifier_by_claim: { 'C-001a': 'V' } }]);
      const skills = routeSkills(packet, repoRoot, { activeProjectScope: '5fedu' });
      const context = compileContext(packet, compiled.spec, compiled.manifest, { repoRoot: workspace, skillRoot: repoRoot, skills, tokenBudget: 8_000 });
      expect(context.items.some((item) => item.kind === 'skill' && item.source.includes('5fedu-module-parity/SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(workspace, 'profiles'))).toBe(false);
      expect(fs.existsSync(path.join(workspace, 'skills'))).toBe(false);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('resolves domain packs from the central harness without installing the template into a target project', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-workspace-'));
    try {
      expect(fs.existsSync(path.join(workspace, 'profiles', '5fedu'))).toBe(false);
      const harnessRoot = resolveHarnessRoot(workspace, repoRoot);
      expect(harnessRoot).toBe(repoRoot);
      const pack = loadDomainPack(harnessRoot, '5fedu');
      expect(pack.sourceVerified).toBe(true);
      expect(pack.sourceRoot).toMatch(/profiles[\\/]5fedu[\\/]reference-source[\\/]template$/);
      expect(fs.existsSync(path.join(workspace, 'profiles'))).toBe(false);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('brokers exact manifest-bound 5fedu source without traversal or project copies', () => {
    const pack = loadDomainPack(repoRoot, '5fedu');
    const source = readDomainReference(pack, 'features/he-thong/nhan-vien/nhan-vien.module.tsx');
    expect(source.content).toContain('createFeatureModule');
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => readDomainReference(pack, '../package.json')).toThrow(/manifest-bound/);
  });

  it('binds every 5fedu owner behavior to manifest-verified source pointers', () => {
    const pack = loadDomainPack(repoRoot, '5fedu');
    expect(pack.sourceEvidence?.reference_tree_sha256).toBe(pack.sourceManifest?.tree_sha256);
    expect(Object.keys(pack.sourceEvidence?.requirements ?? {})).toHaveLength(18);
    expect(pack.sourceEvidence?.requirements['employee.row.actions']).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'features/he-thong/nhan-vien/components/employee-table-row-actions.tsx', line: 93 }),
      expect.objectContaining({ path: 'features/he-thong/nhan-vien/hooks/use-employee-page-handlers.tsx' }),
    ]));
    const summary = summarizeDomainBehavior(pack);
    expect(summary).toContain('employee.row.actions');
    expect(summary).toContain('employee-table-row-actions.tsx:93#');
    expect(summary).toContain('department.axis');
    expect(summary).toContain('permissions.module-coverage');
  });

  it('loads 5fedu only by explicit project profile and verifies the bundled reference source', () => {
    const pack = loadDomainPack(repoRoot, '5fedu');
    expect(pack.descriptor.activation).toBe('explicit-project-profile');
    expect(pack.descriptor.core_dependency).toBe(false);
    expect(pack.sourceVerified).toBe(true);
    expect(pack.sourceVerification.kind).toBe('bundled-snapshot');
    expect(pack.sourceManifest?.file_count).toBe(446);
    expect(pack.sourceRoot).toMatch(/profiles[\\/]5fedu[\\/]reference-source[\\/]template$/);
    expect(() => assertDomainPackStage(pack, 'planning')).not.toThrow();
    expect(() => assertDomainPackStage(pack, 'implementation')).not.toThrow();
    expect(() => loadDomainPack(repoRoot, 'employee')).toThrow(/not installed/);
  });


  it('makes spec revision impact reproducible without changing spec identity', () => {
    const request = createWorkRequest({ raw_intent: 'Add endpoint with backward compatibility' });
    const first = compileWorkSpec(request, { requirements: [{ id: 'R-001', statement: 'Endpoint exists', claims: [{ claim_id: 'C-001a', statement: 'endpoint responds', class: 'runtime', verifier_id: 'V-api' }] }] });
    const revised = compileSpecRevision(first, { requirements: [
      { id: 'R-001', statement: 'Endpoint exists and keeps the response shape', claims: [{ claim_id: 'C-001a', statement: 'endpoint responds with compatible shape', class: 'runtime', verifier_id: 'V-api' }] },
      { id: 'R-002', statement: 'Old clients remain compatible', claims: [{ claim_id: 'C-002a', statement: 'legacy client contract passes', class: 'mechanical', verifier_id: 'V-legacy' }] },
    ] });
    expect(revised.compiled.spec.spec_id).toBe(first.spec.spec_id);
    expect(revised.compiled.spec.revision).toBe(2);
    expect(revised.impact.changed_requirements).toEqual(['R-001']);
    expect(revised.impact.added_requirements).toEqual(['R-002']);
    expect(revised.impact.changed_claims).toEqual(['C-001a']);
    expect(revised.impact.added_claims).toEqual(['C-002a']);
  });


  it('bounds active surface and repair budget', () => {
    const request = createWorkRequest({ raw_intent: 'Implement bounded change' });
    const compiled = compileWorkSpec(request, { requirements: [{ statement: 'Change works', claims: [{ statement: 'test passes', class: 'mechanical', verifier_id: 'V' }] }] });
    const packets = compileTaskPackets(compiled, [{ goal: 'Change it', requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], capabilities: ['filesystem.read'], verifier_by_claim: { 'C-001a': 'V' } }]);
    expect(() => assertResourceBudget({ packets, maxRepairDepth: 2 })).not.toThrow();
    expect(() => assertResourceBudget({ packets, maxRepairDepth: 3 })).toThrow(/repair budget/);
    packets[0].capabilities = ['a','b','c','d','e','f','g','h','i'];
    expect(() => assertResourceBudget({ packets })).toThrow(/too many capabilities/);
  });

});

describe('North-Star resource and execution governance', () => {
  const snapshot = (overrides: Partial<HostResourceSnapshot> = {}): HostResourceSnapshot => ({
    observed_at: new Date().toISOString(), cpu_count: 8, load_1m: 2, load_per_core: 0.25,
    total_memory_mb: 16_384, free_memory_mb: 8_192, free_memory_ratio: 0.5, platform: 'linux', ...overrides,
  });

  it('throttles concurrency under soft pressure and blocks only at the hard memory floor', () => {
    const normal = governResources(snapshot());
    expect(normal.pressure).toBe('normal');
    expect(normal.recommended_agent_concurrency).toBe(DEFAULT_RESOURCE_POLICY.max_agent_concurrency);

    const elevated = governResources(snapshot({ free_memory_mb: 2_000, free_memory_ratio: 0.1 }));
    expect(elevated.pressure).toBe('elevated');
    expect(elevated.allow_new_work).toBe(true);
    expect(elevated.recommended_agent_concurrency).toBe(1);
    expect(elevated.parallel_verifiers).toBe(1);

    const criticalMemory = governResources(snapshot({ free_memory_mb: 512, free_memory_ratio: 0.03 }));
    expect(criticalMemory.pressure).toBe('critical');
    expect(criticalMemory.allow_new_work).toBe(false);
    expect(criticalMemory.browser_instances).toBe(0);
  });

  it('keeps execution lifecycle separate from task truth and rejects impossible transitions', () => {
    let lifecycle: ExecutionLifecycleRecord = { run_id: 'RUN-1', execution_state: 'UNCLAIMED', task_truth: 'READY', updated_at: new Date().toISOString(), attempt: 0 };
    lifecycle = transitionExecution(lifecycle, 'CLAIMED');
    lifecycle = transitionExecution(lifecycle, 'PREPARING');
    lifecycle = transitionExecution(lifecycle, 'RUNNING');
    lifecycle = transitionExecution(lifecycle, 'SUCCEEDED', { task_truth: truthFromOutcome('PARTIAL') });
    expect(lifecycle.execution_state).toBe('SUCCEEDED');
    expect(lifecycle.task_truth).toBe('PARTIAL');
    expect(() => assertExecutionTransition('SUCCEEDED', 'RUNNING')).toThrow(/invalid execution lifecycle transition/);
    expect(() => assertExecutionTransition('TIMED_OUT', 'RETRY_QUEUED')).not.toThrow();
  });

  it('normalizes external edge payloads before they reach the trigger kernel', () => {
    expect(adaptGitHubIssue({ repository: 'acme/repo', number: 12, title: 'Fix auth', body: 'Keep compatibility' })).toMatchObject({ source: 'issue', source_id: 'acme/repo#12' });
    expect(adaptGitHubPullRequest({ repository: 'acme/repo', number: 7, title: 'PR title', head_sha: 'abc', base_ref: 'main' })).toMatchObject({ source: 'pr', source_id: 'acme/repo#pr-7' });
    expect(adaptCiRun({ provider: 'github', run_id: '99', summary: 'CI failed', commit_sha: 'abc' })).toMatchObject({ source: 'ci', source_id: 'github:99' });
    expect(adaptWebhook({ event_id: 'evt-1', intent: 'Run maintenance', constraints: ['no schema changes'] })).toMatchObject({ source: 'webhook', source_id: 'evt-1' });
  });
});
