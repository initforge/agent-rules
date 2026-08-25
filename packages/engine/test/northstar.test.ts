import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  NORTH_STAR_PROTOCOL_VERSION,
  assertTaskPacket,
  assertWorkSpec,
  assertCapabilityManifest,
  validateTraceability,
} from '../src/northstar/protocol.js';
import { compileTaskPackets, compileWorkSpec, createWorkRequest } from '../src/northstar/compiler.js';
import { planProofRoute } from '../src/northstar/proof-router.js';
import { proofRouteRequestForPacket } from '../src/northstar/runtime.js';
import { compileContext } from '../src/northstar/context.js';
import { createStandardCapabilityBroker, routeSkills } from '../src/northstar/routing.js';
import { EvidenceLedger, deriveAcceptance } from '../src/northstar/evidence-ledger.js';
import { executeNorthStarRun } from '../src/northstar/runtime.js';
import type { HostResourceSnapshot } from '../src/northstar/resource-governor.js';

// Runtime tests exercise evidence and authority semantics, not the ambient
// memory state of a shared CI runner. Keep the host policy itself covered by
// northstar-governance.test.ts while supplying an explicit supervisor sample.
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

function executeNorthStarTestRun(input: Parameters<typeof executeNorthStarRun>[0]) {
  return executeNorthStarRun({ ...input, resourceSnapshot: TEST_RESOURCE_SNAPSHOT });
}

/**
 * Single-resolver path (REQ-109): routeSkills requires the generated context
 * graph and asserts selected-skill source integrity by hashing the SKILL.md
 * file at the resolved root. Disposable repos scaffold the canonical generated
 * graph AND the skills/rules trees exactly like the packaged runtime does,
 * instead of a second (hard-coded) resolver. repo-facts is intentionally NOT
 * scaffolded: its provenance hashes the real repo's files, and the decision
 * fabric handles an absent repo-facts with shadow facts.
 */
function scaffoldGenerated(repo: string, realRoot: string): void {
  const generated = path.join(repo, 'generated');
  fs.mkdirSync(generated, { recursive: true });
  const src = path.join(realRoot, 'generated', 'context-graph.json');
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(generated, 'context-graph.json'));
  for (const dir of ['skills', 'rules']) {
    const srcDir = path.join(realRoot, dir);
    if (fs.existsSync(srcDir)) fs.cpSync(srcDir, path.join(repo, dir), { recursive: true });
  }
}

function explicitCompilation() {
  const request = createWorkRequest({ raw_intent: 'Add deterministic status output', source: 'cli' });
  const compiled = compileWorkSpec(request, {
    requirements: [{
      statement: 'Status output is deterministic.',
      claims: [{ statement: 'Repeated status reads return stable structured state.', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-001' }],
    }],
  });
  const packets = compileTaskPackets(compiled, [{
    goal: 'Implement deterministic status output.',
    requirement_ids: ['R-001'],
    claim_ids: ['C-001a'],
    owned: ['src'],
    forbidden: ['src/secrets'],
    verifier_by_claim: { 'C-001a': 'V-001' },
  }]);
  return { ...compiled, packets };
}

describe('North-Star protocol/compiler', () => {
  it('preserves raw intent and refuses to execute an implicit S2 plan', () => {
    const request = createWorkRequest({ raw_intent: 'Refactor the runtime architecture across packages.' });
    const compiled = compileWorkSpec(request);
    expect(compiled.request.raw_intent).toBe('Refactor the runtime architecture across packages.');
    expect(compiled.spec.risk_class).toBe('S2');
    expect(compiled.requires_planner).toBe(true);
    expect(() => compileTaskPackets(compiled, [])).toThrow(/strong-planner/);
  });

  it('refuses to execute an implicit S1 plan until a strong planner compiles it', () => {
    const request = createWorkRequest({ raw_intent: 'Add a bounded checked behavior.' });
    const compiled = compileWorkSpec(request);
    expect(compiled.spec.risk_class).toBe('S1');
    expect(compiled.requires_planner).toBe(true);
    expect(() => compileTaskPackets(compiled, [])).toThrow(/strong-planner/);
  });

  it('emits schema-valid explicit WorkSpec and TaskPackets with complete traceability', () => {
    const { spec, packets } = explicitCompilation();
    expect(() => assertWorkSpec(spec)).not.toThrow();
    expect(() => assertTaskPacket(packets[0])).not.toThrow();
    expect(validateTraceability(spec, packets)).toMatchObject({ valid: true });
  });

  it('rejects an orphan mandatory requirement', () => {
    const { spec } = explicitCompilation();
    const trace = validateTraceability(spec, []);
    expect(trace.valid).toBe(false);
    expect(trace.problems.some((problem) => problem.code === 'ORPHAN_REQUIREMENT')).toBe(true);
  });
});

describe('North-Star routing/context', () => {
  let repo: string;
  const realRoot = path.resolve(import.meta.dirname ?? '.', '../../..');
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-context-'));
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'skills', 'frontend-architect'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'entry.tsx'), 'export const Entry = () => null;\n');
    fs.writeFileSync(path.join(repo, 'skills', 'frontend-architect', 'SKILL.md'), '# Frontend\n');
    // Single-resolver path (REQ-109): routeSkills requires the generated
    // context graph; scaffold the canonical graph + repo-facts into the
    // disposable repo like the packaged runtime does.
    scaffoldGenerated(repo, realRoot);
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it('publishes a provider-neutral CapabilityManifest with Pencil canonical explicit-only MCP', () => {
    const broker = createStandardCapabilityBroker();
    const manifest = broker.manifest();
    expect(() => assertCapabilityManifest(manifest)).not.toThrow();
    const pencil = manifest.providers.filter((provider) => provider.id === 'pencil-mcp');
    expect(pencil).toHaveLength(4);
    // Pencil is a canonical registry MCP entry (kind mcp) that stays
    // explicit-only: never auto-activated, never keyword-triggered. The
    // manual mirror is skipped because the registry already registered it.
    expect(pencil.every((provider) => provider.explicit_only === true && provider.mode === 'mcp')).toBe(true);
    expect(pencil.every((provider) => Boolean((provider.metadata as Record<string, unknown>)?.effect))).toBe(true);
  });

  it('binds effect metadata to builtin capabilities as well as external providers', () => {
    const broker = createStandardCapabilityBroker();
    for (const id of ['builtin-filesystem-read', 'builtin-filesystem-write', 'builtin-rg', 'safe-argv', 'git-cli', 'host-runtime-logs', 'host-runtime-metrics', 'host-runtime-traces']) {
      const provider = broker.provider(id);
      expect(provider?.effect?.effect_level).toBeTruthy();
      expect(provider?.effect?.environment).toBeTruthy();
      expect(provider?.effect?.provider_evidence).toBe('live-receipt');
    }
  });

  it('keeps Pencil explicit-only and never keyword-triggers it', () => {
    const { packets } = explicitCompilation();
    packets[0].goal = 'Design this screen with Pencil and implement the UI';
    packets[0].capabilities = ['design.inspect', 'design.compose', 'design.render', 'design.tokens'];
    const broker = createStandardCapabilityBroker();
    const automatic = broker.route(packets[0]);
    expect(Object.values(automatic.providers).every((provider) => provider === null)).toBe(true);
    const explicit = broker.route(packets[0], ['pencil-mcp']);
    expect(Object.values(explicit.providers).every((provider) => provider === 'pencil-mcp')).toBe(true);
  });

  it('uses the graph-bound skill route inside the capability broker', () => {
    const { packets } = explicitCompilation();
    const packet = packets[0];
    packet.goal = 'Sửa module 5fedu lệch pattern drawer';
    const root = path.resolve(process.cwd(), '../..');
    const broker = createStandardCapabilityBroker(root, { decisionFabricMode: 'shadow' });
    const routed = broker.route(packet, [], { activeProjectScope: '5fedu' });
    const direct = routeSkills(packet, root, { activeProjectScope: '5fedu' });
    expect(routed.skills).toEqual(direct);
    expect(routed.skills.some((skill) => skill.source?.startsWith('profiles/5fedu/skills/'))).toBe(true);
    expect(routed.skills.every((skill) => skill.graph_hash?.match(/^[0-9a-f]{64}$/))).toBe(true);
  });

  it('loads bounded routed context and refuses forbidden references', () => {
    const { spec, manifest, packets } = explicitCompilation();
    packets[0].goal = 'Implement React frontend UI';
    packets[0].context = { entrypoints: ['src/entry.tsx'], references: ['src/secrets/key.txt'] };
    const skills = routeSkills(packets[0], repo);
    const context = compileContext(packets[0], spec, manifest, { repoRoot: repo, skills, tokenBudget: 1000 });
    expect(context.items.some((item) => item.source === 'src/entry.tsx')).toBe(true);
    expect(context.omitted).toContainEqual({ source: 'src/secrets/key.txt', reason: 'forbidden by TaskPacket scope' });
    expect(context.items.filter((item) => item.kind === 'skill').length).toBeLessThanOrEqual(3);
  });


  it('resolves symbols to bounded source locations instead of echoing symbol names', () => {
    const { spec, manifest, packets } = explicitCompilation();
    fs.writeFileSync(path.join(repo, 'src', 'entry.tsx'), 'export function EmployeeToolbar() { return null; }\n');
    packets[0].context = { symbols: ['EmployeeToolbar'] };
    const context = compileContext(packets[0], spec, manifest, { repoRoot: repo, tokenBudget: 1000 });
    const symbol = context.items.find((item) => item.kind === 'symbol');
    expect(symbol?.content).toMatch(/src\/entry\.tsx:1:.*EmployeeToolbar/);
    expect(symbol?.content).not.toBe('EmployeeToolbar');
  });
});

describe('EvidenceLedger / trusted completion', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-ledger-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not derive PASS without independent mandatory-claim evidence', () => {
    const { spec, manifest, packets } = explicitCompilation();
    const result = deriveAcceptance({ spec, manifest, packets, evidence: [] });
    expect(result.outcome).not.toBe('PASS');
    expect(result.unresolved_claims).toEqual(['C-001a']);
  });

  it('derives PASS from a hash-chained verifier record', () => {
    const { spec, manifest, packets } = explicitCompilation();
    const ledger = new EvidenceLedger(path.join(dir, 'evidence.jsonl'));
    ledger.append({
      protocol_version: NORTH_STAR_PROTOCOL_VERSION,
      evidence_id: 'E-001', claim_id: 'C-001a', task_id: 'T-001', kind: 'test', status: 'pass',
      command: { executable: 'node', args: ['test.js'] }, observed_at: new Date().toISOString(),
    }, 'verifier');
    expect(ledger.verify()).toMatchObject({ ok: true, records: 1 });
    expect(deriveAcceptance({ spec, manifest, packets, evidence: ledger.read() }).outcome).toBe('PASS');
  });

  it('fails closed when the evidence chain is tampered', () => {
    const file = path.join(dir, 'evidence.jsonl');
    const ledger = new EvidenceLedger(file);
    ledger.append({ protocol_version: NORTH_STAR_PROTOCOL_VERSION, evidence_id: 'E-001', claim_id: 'C-001a', task_id: 'T-001', kind: 'test', status: 'pass' }, 'verifier');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"status":"pass"', '"status":"fail"'));
    expect(ledger.verify().ok).toBe(false);
  });

  it('excludes stale and foreign evidence when a runtime binding is required', () => {
    const { spec, manifest, packets } = explicitCompilation();
    const now = Date.now();
    const ledger = new EvidenceLedger(path.join(dir, 'bound-evidence.jsonl'));
    const base = {
      protocol_version: NORTH_STAR_PROTOCOL_VERSION,
      claim_id: 'C-001a', task_id: 'T-001', kind: 'test' as const, status: 'pass' as const,
      command: { executable: 'node', args: ['test.js'] }, verifier_id: 'V-001',
    };
    ledger.append({ ...base, evidence_id: 'E-stale', observed_at: new Date(now - 48 * 60 * 60 * 1000).toISOString(), spec_id: spec.spec_id, spec_revision: spec.revision, candidate_epoch: 0, platform: process.platform }, 'verifier');
    ledger.append({ ...base, evidence_id: 'E-foreign', observed_at: new Date(now).toISOString(), spec_id: spec.spec_id, spec_revision: spec.revision + 1, candidate_epoch: 0, platform: process.platform }, 'verifier');
    const blocked = deriveAcceptance({ spec, manifest, packets, evidence: ledger.read(), binding: { spec_id: spec.spec_id, spec_revision: spec.revision, candidate_epoch: 0, platform: process.platform, now_ms: now } });
    expect(blocked.outcome).not.toBe('PASS');
    expect(blocked.unresolved_claims).toContain('C-001a');

    const fresh = new EvidenceLedger(path.join(dir, 'fresh-bound-evidence.jsonl'));
    fresh.append({ ...base, evidence_id: 'E-fresh', observed_at: new Date(now).toISOString(), spec_id: spec.spec_id, spec_revision: spec.revision, candidate_epoch: 0, platform: process.platform }, 'verifier');
    expect(deriveAcceptance({ spec, manifest, packets, evidence: fresh.read(), binding: { spec_id: spec.spec_id, spec_revision: spec.revision, candidate_epoch: 0, platform: process.platform, now_ms: now } }).outcome).toBe('PASS');
  });
});

describe('North-Star runtime on production Runner', () => {
  let repo: string;
  const realRoot = path.resolve(import.meta.dirname ?? '.', '../../..');
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-runtime-'));
    spawnSync('git', ['init', '-q'], { cwd: repo });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'seed.ts'), 'export const seed = 1;\n');
    spawnSync('git', ['add', '-A'], { cwd: repo });
    spawnSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repo });
    scaffoldGenerated(repo, realRoot);
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it('grounds an explicitly activated 5fedu task in the central verified source without copying the template', async () => {
    const compiled = explicitCompilation();
    let capturedPrompt = '';
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      harnessRoot: path.resolve(process.cwd()),
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets: compiled.packets,
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }],
      agent: 'claude',
      domainPack: { id: '5fedu', stage: 'implementation' },
      invocationOverride: (prompt) => {
        capturedPrompt = prompt;
        return { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'out.ts'))}, ${JSON.stringify('export const out = 1;\n')})`] };
      },
      skipAgentDetection: true,
      maxRepairDepth: 0,
    });
    expect(result.acceptance.outcome).toBe('PASS');
    // REQ-012/REQ-013: activation stays explicit and the prompt carries a
    // minimal broker pointer — never a broad per-task domain/template summary.
    expect(capturedPrompt).toContain('Domain pack: 5fedu (explicitly activated');
    expect(capturedPrompt).toContain('agent-rules reference 5fedu');
    expect(capturedPrompt).toContain('agent-rules reference-search 5fedu');
    expect(capturedPrompt).toContain('Do not copy/vendor the reference template');
    // The broad summary and "template checked" disclosure are gone; the
    // employee behavior pointers appear only in a consumed-reference footer.
    expect(capturedPrompt).not.toContain('Source verified: true');
    expect(capturedPrompt).not.toContain('employee.row.actions');
    expect(capturedPrompt).not.toContain('employee-table-row-actions.tsx');
    expect(capturedPrompt).not.toContain('Source-grounded owner constraints');
    expect(fs.existsSync(path.join(repo, 'profiles', '5fedu'))).toBe(false);
    expect(fs.existsSync(path.join(repo, 'context', '5fedu'))).toBe(false);
  });

  it('executes a real fresh process, verifies it, persists evidence and derives PASS', async () => {
    const compiled = explicitCompilation();
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets: compiled.packets,
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'out.ts'))}, 'export const out = 1;\\n')`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
    });
    expect(result.acceptance.outcome).toBe('PASS');
    expect(result.state.status).toBe('passed');
    expect(Object.values(result.state.tasks)).toEqual(['done']);
    expect(fs.existsSync(path.join(result.run_root, 'checkpoint.json'))).toBe(true);
    expect(new EvidenceLedger(result.evidence_file).verify().ok).toBe(true);
    const modelDecision = JSON.parse(fs.readFileSync(path.join(result.run_root, 'model-decisions.json'), 'utf8')) as { worker: { logical_class: string }; host: string; attestation_required: boolean };
    expect(modelDecision.worker.logical_class).toBe('economy');
    expect(modelDecision.host).toBe('claude');
    expect(modelDecision.attestation_required).toBe(true);
    const rawArtifacts = JSON.parse(fs.readFileSync(path.join(result.run_root, 'raw-artifacts.json'), 'utf8')) as {
      tasks: Array<{ worker: { stdout_path: string; stderr_path: string; stdout_sha256: string; stderr_sha256: string } }>;
    };
    expect(rawArtifacts.tasks).toHaveLength(1);
    const workerArtifact = rawArtifacts.tasks[0].worker;
    const stdout = fs.readFileSync(path.join(repo, workerArtifact.stdout_path));
    const stderr = fs.readFileSync(path.join(repo, workerArtifact.stderr_path));
    expect(workerArtifact.stdout_sha256).toBe(createHash('sha256').update(stdout).digest('hex'));
    expect(workerArtifact.stderr_sha256).toBe(createHash('sha256').update(stderr).digest('hex'));
    const journal = fs.readFileSync(path.join(result.run_root, 'journal.jsonl'), 'utf8');
    expect(journal).toContain('stdoutPath');
    expect(journal).toContain('stderrPath');
    const proof = JSON.parse(fs.readFileSync(result.proof_of_work_file, 'utf8')) as { outcome: string; requirements: Array<{ requirement_id: string; status: string }>; changed_files: string[]; artifacts: { checkpoint: string | null } };
    expect(proof.outcome).toBe('PASS');
    expect(proof.requirements).toContainEqual(expect.objectContaining({ requirement_id: 'R-001', status: 'PASS' }));
    expect(proof.changed_files).toContain('src/out.ts');
    expect(proof.artifacts.checkpoint).toBe('checkpoint.json');
    const trustedResult = fs.readFileSync(result.result_file, 'utf8');
    expect(trustedResult).toContain('Outcome: PASS');
    expect(trustedResult).toContain('R-001 PASS');
    expect(trustedResult).toContain(`Run: ${result.run_id}`);
  });

  it('executes a bounded claim-grounded convergence delta and stops at its pass budget', async () => {
    const request = createWorkRequest({ raw_intent: 'Implement a bounded convergence fixture' });
    const compiled = compileWorkSpec(request, { requirements: [{
      statement: 'The fixture is implemented and browser-proof eligible.',
      claims: [{ claim_id: 'C-convergence', statement: 'implementation exists', class: 'runtime', required_kinds: ['browser'], verifier_id: 'V-test' }],
    }] });
    const packets = compileTaskPackets(compiled, [{
      goal: 'Implement convergence fixture', requirement_ids: ['R-001'], claim_ids: ['C-convergence'], owned: ['src'],
      verifier_by_claim: { 'C-convergence': 'V-test' },
    }]);
    let invocation = 0;
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets,
      verifiers: [{ id: 'V-test', kind: 'test', argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', `convergence-${invocation++}.ts`))}, 'export const convergence = true;\\n')`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
      maxConvergencePasses: 4,
    });
    expect(result.convergence.converged).toBe(false);
    expect(result.runner.reports.length).toBeLessThanOrEqual(3);
    expect(result.runner.reports.every((report) => report.outcome === 'done')).toBe(true);
    expect(Object.keys(result.state.tasks)).toEqual(['T-001', 'T-DELTA-1-1-001']);
    expect(fs.readFileSync(path.join(result.run_root, 'runtime-config.json'), 'utf8')).toContain('max_convergence_passes');
    expect(fs.readFileSync(path.join(result.run_root, 'journal.jsonl'), 'utf8')).toContain('CONVERGENCE_DELTA_COMPILED');
    expect(fs.readFileSync(path.join(result.run_root, 'journal.jsonl'), 'utf8')).toContain('CONVERGENCE_OSCILLATION_DETECTED');
    expect(result.convergence.oscillation_detected).toBe(true);
  });

  it('executes the verification graph cheap-first and fail-fast before deep gates', async () => {
    const request = createWorkRequest({ raw_intent: 'Implement and verify a UI change' });
    const compiled = compileWorkSpec(request, { requirements: [{
      statement: 'UI change is safe',
      claims: [
        { claim_id: 'C-cheap', statement: 'mechanical guard passes', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-cheap' },
        { claim_id: 'C-deep', statement: 'browser behavior passes', class: 'runtime', required_kinds: ['browser'], verifier_id: 'V-deep' },
      ],
    }] });
    const packets = compileTaskPackets(compiled, [{
      goal: 'Implement UI change', requirement_ids: ['R-001'], claim_ids: ['C-cheap', 'C-deep'], owned: ['src'],
      verifier_by_claim: { 'C-cheap': 'V-cheap', 'C-deep': 'V-deep' },
    }]);
    const deepMarker = path.join(repo, 'deep-verifier-ran');
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets,
      // Deliberately provide deep first. The runtime must follow graph cost, not input order.
      verifiers: [
        { id: 'V-deep', kind: 'browser', argv: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(deepMarker)}, 'ran')`] } },
        { id: 'V-cheap', kind: 'test', argv: { executable: process.execPath, args: ['-e', 'process.exit(1)'] } },
      ],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'out.ts'))}, ${JSON.stringify('export const out = 1;\n')})`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
    });
    expect(result.acceptance.outcome).toBe('FAILED');
    expect(Object.values(result.state.tasks)).toEqual(['failed']);
    expect(fs.existsSync(deepMarker)).toBe(false);
    expect(result.runner.reports[0].verificationExitCodes).toEqual([1]);
    expect(JSON.parse(fs.readFileSync(path.join(result.run_root, 'verification-graph.json'), 'utf8')).map((node: { verifier_id: string }) => node.verifier_id)).toEqual(['V-cheap', 'V-deep']);
  });

  it('fails closed on a forbidden-scope edit before expensive verification', async () => {
    const compiled = explicitCompilation();
    fs.mkdirSync(path.join(repo, 'src', 'secrets'), { recursive: true });
    const marker = path.join(repo, 'verifier-ran');
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets: compiled.packets,
      verifiers: [{ id: 'V-001', kind: 'test', command: `node -e require('fs').writeFileSync('${marker}','yes')` }],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'secrets', 'key.txt'))}, 'nope')`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
    });
    expect(result.acceptance.outcome).toBe('FAILED');
    expect(fs.existsSync(marker)).toBe(false);
    expect(result.runner.reports[0].scopeViolations).toContain('src/secrets/key.txt');
  });

  it('fails closed when a worker introduces an explicit verification bypass', async () => {
    const compiled = explicitCompilation();
    fs.mkdirSync(path.join(repo, 'test'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'test', 'guard.test.ts'), "it('runs', () => {});\n");
    spawnSync('git', ['add', '-A'], { cwd: repo });
    spawnSync('git', ['commit', '-q', '-m', 'add guard test'], { cwd: repo });
    compiled.packets[0].scope = { owned: ['test'], forbidden: [] };
    const marker = path.join(repo, 'verifier-ran');
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets: compiled.packets,
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'yes')`] } }],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').appendFileSync(${JSON.stringify(path.join(repo, 'test', 'guard.test.ts'))}, "it.skip('hidden', () => {});\\n")`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
    });
    expect(result.trusted_outcome).toBe('FAILED');
    expect(result.runner.reports[0].policyViolations?.join(' ')).toMatch(/disabled test/);
    expect(fs.existsSync(marker)).toBe(false);
  });


  it('F04/REQ-004: a supplied proof router runs only selected verifiers on the production path', async () => {
    const request = createWorkRequest({ raw_intent: 'Implement proof-routed behavior' });
    const compiled = compileWorkSpec(request, { requirements: [{
      statement: 'A claim is routed through the adaptive proof router.',
      claims: [
        { claim_id: 'C-a', statement: 'mechanical behavior passes', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-a' },
        { claim_id: 'C-b', statement: 'second behavior passes', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-b' },
      ],
    }] });
    const packets = compileTaskPackets(compiled, [{
      goal: 'Implement both claims', requirement_ids: ['R-001'], claim_ids: ['C-a', 'C-b'], owned: ['src'],
      verifier_by_claim: { 'C-a': 'V-a', 'C-b': 'V-b' },
    }]);
    const vAMarker = path.join(repo, 'v-a-ran');
    const vBMarker = path.join(repo, 'v-b-ran');
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets,
      verifiers: [
        { id: 'V-a', kind: 'test', argv: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(vAMarker)}, 'ran')`] } },
        { id: 'V-b', kind: 'test', argv: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(vBMarker)}, 'ran')`] } },
      ],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'out.ts'))}, ${JSON.stringify('export const out = 1;\n')})`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
      proofRouter: (r) => planProofRoute(r),
    });
    expect(result.acceptance.outcome).toBe('PASS');
    expect(fs.existsSync(vAMarker)).toBe(true);
    expect(fs.existsSync(vBMarker)).toBe(true);
    // The route plan + selected/omitted record is persisted at the run edge.
    const routeFile = path.join(result.run_root, 'proof-route', packets[0].task_id + '.json');
    expect(fs.existsSync(routeFile)).toBe(true);
    const route = JSON.parse(fs.readFileSync(routeFile, 'utf8')) as { profile: string; selected: string[] };
    expect(route.profile).toBeTruthy();
    expect(route.selected).toContain('C-a:V-a');
    expect(route.selected).toContain('C-b:V-b');
  });

  it('F07/REQ-007: a supplied enforcement decision blocks effect execution before activation', async () => {
    const compiled = explicitCompilation();
    const marker = path.join(repo, 'enforcement-ran');
    const result = await executeNorthStarTestRun({
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets: compiled.packets,
      verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'yes')`] } }],
      agent: 'claude',
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'out.ts'))}, ${JSON.stringify('export const out = 1;\n')})`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
      enforcement: () => ({ layer: 'blocked', can_control_mutation: false, reason: 'test host cannot control mutation' }),
    }).catch((e: Error) => e);
    expect(result).toBeInstanceOf(Error);
    expect(String(result)).toMatch(/blocked by enforcement/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('requires the independent semantic seam when explicitly requested and lets it only downgrade deterministic truth', async () => {
    const compiled = explicitCompilation();    const common = {
      repoRoot: repo,
      request: compiled.request,
      spec: compiled.spec,
      manifest: compiled.manifest,
      packets: compiled.packets,
      verifiers: [{ id: 'V-001', kind: 'test' as const, argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }],
      agent: 'claude' as const,
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'src', 'out.ts'))}, ${JSON.stringify('export const out = 1;\n')})`] }),
      skipAgentDetection: true,
      maxRepairDepth: 0,
      requireSemanticAudit: true,
    };
    const blocked = await executeNorthStarTestRun(common);
    expect(blocked.acceptance.outcome).toBe('PASS');
    expect(blocked.trusted_outcome).toBe('PARTIAL');
    expect(blocked.audit.findings.join(' ')).toMatch(/semantic/i);

    fs.rmSync(path.join(repo, '.agent'), { recursive: true, force: true });
    fs.rmSync(path.join(repo, 'src', 'out.ts'), { force: true });
    const reviewed = await executeNorthStarTestRun({
      ...common,
      semanticAuditor: { id:'independent-test-auditor', audit: () => ({ auditor_id:'independent-test-auditor', verdict:'PASS' as const, findings:[] }) },
    });
    expect(reviewed.acceptance.outcome).toBe('PASS');
    expect(reviewed.trusted_outcome).toBe('PASS');
    expect(fs.existsSync(path.join(reviewed.run_root, 'semantic-review.json'))).toBe(true);
  });

});

describe('North-Star capability economy and semantic retrieval', () => {
  it('routes browser verification to Playwright CLI and keeps exploratory MCP separate', () => {
    const { packets } = explicitCompilation();
    const packet = packets[0];
    (packet as { capabilities?: string[] }).capabilities = undefined;
    packet.goal = 'Implement React frontend UI and verify it in the browser';
    packet.scope.owned = ['src/page.tsx'];
    const broker = createStandardCapabilityBroker(path.resolve(process.cwd()), { decisionFabricMode: 'shadow' });
    const normal = broker.route(packet);
    expect(normal.capabilities).toContain('browser.verify');
    expect(normal.providers['browser.verify']).toBe('playwright-cli');
    expect(normal.capabilities).not.toContain('browser.explore');

    packet.goal = 'Exploratory interactive browser click-through of the React UI';
    const exploratory = broker.route(packet);
    expect(exploratory.providers['browser.verify']).toBe('playwright-cli');
    expect(exploratory.providers['browser.explore']).toBe('playwright-mcp');
  });

  it('routes observability capabilities without exposing unrelated browser or design providers', () => {
    const { packets } = explicitCompilation();
    const packet = packets[0];
    (packet as { capabilities?: string[] }).capabilities = undefined;
    packet.goal = 'Diagnose production latency from logs, metrics, and OpenTelemetry traces';
    const broker = createStandardCapabilityBroker(path.resolve(process.cwd()), { decisionFabricMode: 'shadow' });
    const routed = broker.route(packet);
    expect(routed.providers['runtime.logs']).toBe('host-runtime-logs');
    expect(routed.providers['runtime.metrics']).toBe('host-runtime-metrics');
    expect(routed.providers['runtime.traces']).toBe('host-runtime-traces');
    expect(routed.capabilities).not.toContain('browser.explore');
    expect(Object.values(routed.providers)).not.toContain('pencil-mcp');
  });

  it('keeps Serena explicit-only and lets an explicit semantic provider override the default', () => {
    const { packets } = explicitCompilation();
    const packet = packets[0];
    (packet as { capabilities?: string[] }).capabilities = undefined;
    packet.goal = 'Trace callers and references for a cross-file refactor';
    const broker = createStandardCapabilityBroker(path.resolve(process.cwd()), { decisionFabricMode: 'shadow' });
    const automatic = broker.route(packet);
    expect(automatic.providers['code.semantic']).toBe('codebase-memory-mcp');
    expect(automatic.suppressed).toContainEqual({ id: 'serena', reason: 'explicit-only provider was not requested' });
    const explicit = broker.route(packet, ['serena']);
    expect(explicit.providers['code.semantic']).toBe('serena');
  });

  it('uses semantic symbol evidence first and falls back to bounded lexical retrieval', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-semantic-'));
    try {
      fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'src', 'service.ts'), 'export function EmployeeService() { return 1; }\n');
      const { spec, manifest, packets } = explicitCompilation();
      packets[0].scope.owned = ['src'];
      packets[0].context = { symbols: ['EmployeeService'] };
      const semantic = compileContext(packets[0], spec, manifest, {
        repoRoot: repo,
        semanticResolver: {
          id: 'test-lsp',
          resolveSymbol: () => [{ path: 'src/service.ts', line: 1, symbol: 'EmployeeService', snippet: 'semantic hit' }],
        },
      });
      expect(semantic.retrieval).toEqual({ semantic_queries: 1, semantic_hits: 1, lexical_queries: 0 });
      expect(semantic.localization).toMatchObject({ retrieval_mode: 'hybrid', bounded: true, requested_roots: ['src'], localized_symbols: ['EmployeeService'], unresolved_symbols: [] });
      expect(semantic.items.find((item) => item.kind === 'symbol')?.content).toContain('src/service.ts:1: EmployeeService — semantic hit');

      const fallback = compileContext(packets[0], spec, manifest, {
        repoRoot: repo,
        semanticResolver: { id: 'empty-index', resolveSymbol: () => [] },
      });
      expect(fallback.retrieval).toEqual({ semantic_queries: 1, semantic_hits: 0, lexical_queries: 1 });
      expect(fallback.items.find((item) => item.kind === 'symbol')?.content).toContain('src/service.ts:1');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
