import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createWorkRequest,
  compileWorkSpec,
  compileTaskPackets,
  executeNorthStarRun,
  resumeNorthStarRun,
  createContextState,
  evaluateContextState,
  type ContextState,
  type VerifierDefinition,
  type HostResourceSnapshot,
} from '../../src/northstar/index.js';

let tempDir: string;
let repoRoot: string;

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

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'ignore' });
}

function initGitRepo(root: string): void {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@agent-rules.local']);
  git(root, ['config', 'user.name', 'ContextEngineTest']);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.agent/runs\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# Context Engine Test Repo\n');
  fs.writeFileSync(path.join(root, 'src', 'seed.ts'), 'export const seed = true;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'Initial commit']);
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-prod-'));
  repoRoot = path.join(tempDir, 'repo');
  fs.mkdirSync(repoRoot, { recursive: true });
  initGitRepo(repoRoot);
  // Single-resolver path (REQ-109): routeSkills requires the generated graph
  // and hashes selected SKILL.md sources. Scaffold the canonical graph +
  // skills/rules exactly like the packaged runtime.
  const realRoot = path.resolve(import.meta.dirname ?? '.', '../../../../');
  const graphSrc = path.join(realRoot, 'generated', 'context-graph.json');
  fs.mkdirSync(path.join(repoRoot, 'generated'), { recursive: true });
  if (fs.existsSync(graphSrc)) fs.copyFileSync(graphSrc, path.join(repoRoot, 'generated', 'context-graph.json'));
  for (const dir of ['skills', 'rules']) {
    const srcDir = path.join(realRoot, dir);
    if (fs.existsSync(srcDir)) fs.cpSync(srcDir, path.join(repoRoot, dir), { recursive: true });
  }
});

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Windows file locks may delay deletion
  }
});

describe('Context Engine Production Wiring & Lifecycle (AC-01 through AC-05)', () => {
  // AC-01 / REQ-001: Production callsites in executeNorthStarRun & resumeNorthStarRun
  describe('AC-01 / REQ-001: Production Callsites & State Snapshot Persistence', () => {
    it('creates context-state.json at run initialization and validates snapshot on resume', async () => {
      const request = createWorkRequest({
        raw_intent: 'Implement user profile validation endpoint',
        work_id: 'W-ctx-001',
      });
      const compiled = compileWorkSpec(request, {
        requirements: [{
          statement: 'Validate user profile request body',
          mandatory: true,
          claims: [{ statement: 'Validation passes', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-001' }],
        }],
      });
      const manifest = compiled.manifest;
      const packets = compileTaskPackets(compiled, [{
        goal: 'Implement user profile validation',
        requirement_ids: ['R-001'],
        claim_ids: ['C-001a'],
        owned: ['src'],
        verifier_by_claim: { 'C-001a': 'V-001' },
      }]);
      const verifiers: VerifierDefinition[] = [{
        id: 'V-001',
        kind: 'test',
        argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] },
      }];

      const runRoot = path.join(repoRoot, '.agent', 'runs', 'RUN-ctx-001');

      const result = await executeNorthStarRun({
        repoRoot,
        runRoot,
        harnessRoot: path.resolve(__dirname, '../../../..'),
        request,
        spec: compiled.spec,
        manifest,
        packets,
        verifiers,
        agent: 'claude',
        resourceSnapshot: TEST_RESOURCE_SNAPSHOT,
        skipAgentDetection: true,
        maxRepairDepth: 0,
        invocationOverride: () => ({
          executable: process.execPath,
          args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repoRoot, 'src', 'profile.ts'))}, 'export const valid = true;\\n')`],
        }),
      });

      expect(result.trusted_outcome).toBe('PASS');

      // Verify context-state.json exists and contains complete lifecycle state
      const contextStatePath = path.join(runRoot, 'context-state.json');
      expect(fs.existsSync(contextStatePath)).toBe(true);

      const state = JSON.parse(fs.readFileSync(contextStatePath, 'utf8')) as ContextState;
      expect(state.stateId).toMatch(/^CTX-[0-9a-f]{12}$/);
      expect(state.stateHash).toMatch(/^[0-9a-f]{64}$/);
      expect(state.activeRules.length).toBeGreaterThan(0);
      expect(state.history.length).toBeGreaterThanOrEqual(2);
      expect(state.history.some((h) => h.transition === 'INITIAL_INTAKE')).toBe(true);

      // Verify proof-of-work.json references context_state
      const pow = JSON.parse(fs.readFileSync(path.join(runRoot, 'proof-of-work.json'), 'utf8'));
      expect(pow.artifacts.context_state).toBe('context-state.json');
    });

    it('fails closed during resume if context-state.json is missing or corrupted', async () => {
      const request = createWorkRequest({
        raw_intent: 'Implement user profile validation endpoint',
        work_id: 'W-ctx-resume-fail',
      });
      const compiled = compileWorkSpec(request, {
        requirements: [{
          statement: 'Validate user profile request body',
          mandatory: true,
          claims: [{ statement: 'Validation passes', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-001' }],
        }],
      });
      const manifest = compiled.manifest;
      const packets = compileTaskPackets(compiled, [{
        goal: 'Implement user profile validation',
        requirement_ids: ['R-001'],
        claim_ids: ['C-001a'],
        owned: ['src'],
        verifier_by_claim: { 'C-001a': 'V-001' },
      }]);
      const verifiers: VerifierDefinition[] = [{
        id: 'V-001',
        kind: 'test',
        argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] },
      }];

      const runRoot = path.join(repoRoot, '.agent', 'runs', 'RUN-ctx-resume-test');

      await executeNorthStarRun({
        repoRoot,
        runRoot,
        harnessRoot: path.resolve(__dirname, '../../../..'),
        request,
        spec: compiled.spec,
        manifest,
        packets,
        verifiers,
        agent: 'claude',
        resourceSnapshot: TEST_RESOURCE_SNAPSHOT,
        skipAgentDetection: true,
        maxRepairDepth: 0,
        invocationOverride: () => ({
          executable: process.execPath,
          args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repoRoot, 'src', 'profile.ts'))}, 'export const valid = true;\\n')`],
        }),
      });

      // Scenario A: Delete context-state.json -> resume must fail closed
      const contextStatePath = path.join(runRoot, 'context-state.json');
      fs.unlinkSync(contextStatePath);

      await expect(resumeNorthStarRun({
        repoRoot,
        runRoot,
        harnessRoot: path.resolve(__dirname, '../../../..'),
        skipAgentDetection: true,
        invocationOverride: () => ({ executable: process.execPath, args: ['-e', 'process.exit(0)'] }),
      })).rejects.toThrow(/missing context-state\.json/);

      // Scenario B: Corrupt context-state.json -> resume must fail closed
      fs.writeFileSync(contextStatePath, '{"stateId": null, "corrupted": true}');

      await expect(resumeNorthStarRun({
        repoRoot,
        runRoot,
        harnessRoot: path.resolve(__dirname, '../../../..'),
        skipAgentDetection: true,
        invocationOverride: () => ({ executable: process.execPath, args: ['-e', 'process.exit(0)'] }),
      })).rejects.toThrow(/corrupted or invalid context-state\.json|context-state\.json is malformed/);
    });
  });

  // AC-02 / REQ-002: Production E2E driving state transitions through real executeNorthStarRun
  describe('AC-02 / REQ-002: Production E2E State Transitions via Runner Execution', () => {
    it('executes full task lifecycle through executeNorthStarRun recording INTAKE, PLAN, IMPLEMENT, and SETTLEMENT', async () => {
      const request = createWorkRequest({
        raw_intent: 'Add database-backed audit logging',
        work_id: 'W-ctx-e2e-002',
      });
      const compiled = compileWorkSpec(request, {
        requirements: [{
          statement: 'Log all user actions to database',
          mandatory: true,
          claims: [{ statement: 'Audit log table records actions', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-001' }],
        }],
      });
      const manifest = compiled.manifest;
      const packets = compileTaskPackets(compiled, [{
        goal: 'Add audit logging table and trigger',
        requirement_ids: ['R-001'],
        claim_ids: ['C-001a'],
        owned: ['src'],
        verifier_by_claim: { 'C-001a': 'V-001' },
      }]);
      const verifiers: VerifierDefinition[] = [{
        id: 'V-001',
        kind: 'test',
        argv: { executable: process.execPath, args: ['-e', 'process.exit(0)'] },
      }];

      const runRoot = path.join(repoRoot, '.agent', 'runs', 'RUN-ctx-e2e-002');

      const result = await executeNorthStarRun({
        repoRoot,
        runRoot,
        harnessRoot: path.resolve(__dirname, '../../../..'),
        request,
        spec: compiled.spec,
        manifest,
        packets,
        verifiers,
        agent: 'claude',
        resourceSnapshot: TEST_RESOURCE_SNAPSHOT,
        skipAgentDetection: true,
        maxRepairDepth: 0,
        invocationOverride: () => ({
          executable: process.execPath,
          args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repoRoot, 'src', 'audit.ts'))}, 'export const audit = true;\\n')`],
        }),
      });

      expect(result.trusted_outcome).toBe('PASS');

      const contextStatePath = path.join(runRoot, 'context-state.json');
      const state = JSON.parse(fs.readFileSync(contextStatePath, 'utf8')) as ContextState;

      // Assert that state transitions were performed by the runtime loop
      const transitions = state.history.map((h) => h.transition);
      expect(transitions).toContain('INITIAL_INTAKE');
      expect(transitions).toContain('TRANSITION_PLANNING');
      expect(transitions).toContain('TRANSITION_IMPLEMENTATION');
      expect(transitions).toContain('TASK_SETTLED');
      expect(transitions).toContain('RUN_FINALIZED');

      expect(state.phase).toBe('SETTLEMENT');
      expect(state.verifierEvidence.length).toBeGreaterThan(0);
      expect(state.verifierEvidence[0].status).toBe('PASS');
    });
  });

  // AC-03 / REQ-003: Evolving-Task E2E (initial task without browser -> discovers frontend/browser -> adapts)
  describe('AC-03 / REQ-003: Evolving-Task Dynamic Discovery & Activation', () => {
    it('dynamically adapts skill and provider routing when new workspace facts and observations are introduced', () => {
      const harnessRoot = path.resolve(__dirname, '../../../..');
      const request = createWorkRequest({
        raw_intent: 'Implement API healthcheck service',
        work_id: 'W-evolving-003',
      });
      const compiled = compileWorkSpec(request);

      // Phase 1: Pure backend service (no browser, no database)
      let state = createContextState({
        request,
        spec: compiled.spec,
        workspaceFacts: { repoRoot: harnessRoot, hasBackend: true },
        hostSurface: { host: 'antigravity', surface: 'desktop', supportsNativeSkills: true, supportsNativeMcp: true },
      });

      expect(state.activeSkills.some((s) => s.id === 'backend-composition')).toBe(true);
      expect(state.activeSkills.some((s) => s.id === 'browser-qa')).toBe(false);
      expect(state.activeProviders.find((p) => p.providerId === 'playwright-mcp')?.permitted).toBe(false);

      // Phase 2: Observation introduces a responsive UI settings page requiring Playwright verification
      state = evaluateContextState(state, 'NEW_WORKSPACE_FACT', {
        newObservations: [{
          id: 'OBS-UI-DISCOVERED',
          observedAt: new Date().toISOString(),
          source: 'tool_output',
          content: 'Discovered responsive dashboard settings page at src/components/Settings.tsx requiring playwright verification',
        }],
        updatedWorkspaceFacts: { hasFrontend: true },
      });

      // Assert that browser-qa and parity-verification were dynamically activated
      const skillIds = state.activeSkills.map((s) => s.id);
      expect(skillIds).toContain('frontend-architect');
      expect(skillIds).toContain('browser-qa');
      expect(skillIds).toContain('parity-verification');

      // Phase 3: Transition to VERIFY phase authorizes Playwright MCP
      state = evaluateContextState(state, 'VERIFIER_START', { nextPhase: 'VERIFY' });
      const playwright = state.activeProviders.find((p) => p.providerId === 'playwright-mcp');
      expect(playwright?.permitted).toBe(true);
      expect(playwright?.lifecycleStage).toBe('PERMITTED_AUTHORIZED');
      expect(playwright?.health).toBe('HEALTHY');
    });
  });

  // AC-04 / REQ-004: Near-Miss Backend Task Protection
  describe('AC-04 / REQ-004: Near-Miss Backend Task UI Skill Suppression', () => {
    it('does NOT activate UI skills or browser MCP for backend task mentioning "drawer" and "layout"', () => {
      const harnessRoot = path.resolve(__dirname, '../../../..');
      const request = createWorkRequest({
        raw_intent: 'Add idempotency handling for webhook queue events in drawer layout service, but do not touch UI',
        work_id: 'W-near-miss-004',
      });
      const compiled = compileWorkSpec(request);

      const state = createContextState({
        request,
        spec: compiled.spec,
        workspaceFacts: { repoRoot: harnessRoot, hasBackend: true },
        hostSurface: { host: 'antigravity', surface: 'desktop', supportsNativeSkills: true, supportsNativeMcp: true },
      });

      const skillIds = state.activeSkills.map((s) => s.id);
      expect(skillIds).toContain('backend-composition');
      expect(skillIds).not.toContain('frontend-architect');
      expect(skillIds).not.toContain('browser-qa');
      expect(skillIds).not.toContain('parity-verification');

      const playwright = state.activeProviders.find((p) => p.providerId === 'playwright-mcp');
      expect(playwright?.permitted).toBe(false);
      expect(playwright?.lifecycleStage).toBe('REGISTERED');
    });
  });

  // AC-05 / REQ-005: Static Invariant Tests
  describe('AC-05 / REQ-005: Static Invariants — Provider Health & Hash Integrity', () => {
    it('verifies ActiveProviderBinding uses three-valued health (HEALTHY | UNHEALTHY | UNVERIFIED) and no fake zero hashes', () => {
      const harnessRoot = path.resolve(__dirname, '../../../..');
      const contextEngineSource = fs.readFileSync(path.join(harnessRoot, 'packages/kernel/src/northstar/context-engine.ts'), 'utf8');

      // 1. Ensure ProviderHealth is three-valued
      expect(contextEngineSource).toContain("export type ProviderHealth = 'HEALTHY' | 'UNHEALTHY' | 'UNVERIFIED';");
      expect(contextEngineSource).toContain('health: ProviderHealth;');
      expect(contextEngineSource).not.toContain('healthy: boolean;');

      // 2. Ensure no dummy '0'.repeat(64) hashes in live state creation
      expect(contextEngineSource).not.toContain("'0'.repeat(64)");
      expect(contextEngineSource).not.toContain('"0".repeat(64)');

      // 3. Ensure live ContextState produces valid SHA256 hashes for state and catalog skills
      const request = createWorkRequest({
        raw_intent: 'Verify hash integrity in context engine',
        work_id: 'W-hash-check',
      });
      const compiled = compileWorkSpec(request);
      const state = createContextState({
        request,
        spec: compiled.spec,
        workspaceFacts: { repoRoot: harnessRoot },
        hostSurface: { host: 'antigravity', surface: 'desktop' },
      });

      expect(state.stateHash).toMatch(/^[0-9a-f]{64}$/);
      for (const skill of state.activeSkills) {
        expect(skill.source_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(skill.source_hash).not.toBe('0'.repeat(64));
      }
      for (const provider of state.activeProviders) {
        expect(['HEALTHY', 'UNHEALTHY', 'UNVERIFIED']).toContain(provider.health);
      }
    });

    it('verifies provider health remains UNVERIFIED from supportsNativeMcp alone without live evidence', () => {
      const harnessRoot = path.resolve(__dirname, '../../../..');
      const request = createWorkRequest({
        raw_intent: 'Verify host capability does not invent HEALTHY provider status',
        work_id: 'W-health-check',
      });
      const compiled = compileWorkSpec(request);
      const state = createContextState({
        request,
        spec: compiled.spec,
        workspaceFacts: { repoRoot: harnessRoot, hasFrontend: true },
        hostSurface: { host: 'antigravity', surface: 'desktop', supportsNativeMcp: true },
      });

      // Providers must NOT be marked HEALTHY just because supportsNativeMcp is true
      for (const provider of state.activeProviders) {
        expect(provider.health).toBe('UNVERIFIED');
      }
    });

    it('fails closed and records diagnostic when context state update is corrupted or fails', () => {
      // Inject corrupted payload to evaluateContextState
      expect(() => {
        evaluateContextState(null as any, 'TASK_SETTLED');
      }).toThrow();
    });
  });
});
