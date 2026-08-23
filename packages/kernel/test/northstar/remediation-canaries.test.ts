import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  routeSkills,
  describeSkillCatalog,
  type TaskPacket,
  createWorkRequest,
  compileWorkSpec,
  compileTaskPackets,
  assertResourceBudget,
  DEFAULT_RESOURCE_POLICY,
  LaneController,
  createContextState,
  evaluateContextState,
  assertValidTruthTransition,
} from '../../src/northstar/index.js';
import {
  categorizeRepair,
  classifyFinding,
} from '../../src/northstar/pair-repair.js';
import {
  renderPlan,
  renderPrompt,
  parsePlan,
  auditPreHandoff,
  compileFrozenContract,
  type FrozenPortableContract,
} from '../../src/northstar/portable-plan.js';
import {
  detectOpenCodeDialect,
  detectOpenCodeRuntimeContract,
  evaluateOpenCodeV2Permissions,
  formatOpenCodeConfig,
  formatOpenCodeV1Config,
  formatOpenCodeV2Config,
} from '../../../../platforms/opencode/adapter.js';
import {
  buildAgentInvocation,
  buildStrongPlannerInvocation,
} from '../../src/runner/headless-executor.js';
import {
  resolveAntigravityMcpPaths,
} from '../../../../platforms/antigravity/adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../');

describe('Remediation Behavioral Canaries', () => {
  describe('Workstream B: Semantic Task Understanding & Minimum Sufficient Coverage', () => {
    it('activates frontend-architect on semantic architectural intent even when weak excludes match', () => {
      const packet: TaskPacket = {
        schema: 'harness/task-packet',
        version: 1,
        task_id: 'T-ui-ia',
        spec_id: 'S-001',
        spec_revision: 1,
        goal: 'Redesign drawer information architecture and responsive layout hierarchy for desktop and mobile',
        requirements: ['R-001'],
        acceptance: [{ claim_id: 'C-001a' }],
        scope: { owned: ['src/components/drawer'], forbidden: [] },
      };

      const routes = routeSkills(packet, repoRoot);
      const skillIds = routes.map((r) => r.id);
      expect(skillIds).toContain('frontend-architect');
    });

    it('does not activate specialized skills on near-miss prompts that do not need them', () => {
      const packet: TaskPacket = {
        schema: 'harness/task-packet',
        version: 1,
        task_id: 'T-trivial-text',
        spec_id: 'S-002',
        spec_revision: 1,
        goal: 'Update footer copyright year from 2025 to 2026',
        requirements: ['R-001'],
        acceptance: [{ claim_id: 'C-001a' }],
        scope: { owned: ['src/components/Footer.tsx'], forbidden: [] },
      };

      const routes = routeSkills(packet, repoRoot);
      const skillIds = routes.map((r) => r.id);
      expect(skillIds).not.toContain('frontend-architect');
      expect(skillIds).not.toContain('parity-verification');
      expect(skillIds).not.toContain('browser-qa');
    });

    it('supports multi-requirement tasks with >3 orthogonal skills without arbitrary truncation', () => {
      const packet: TaskPacket = {
        schema: 'harness/task-packet',
        version: 1,
        task_id: 'T-multi-skill',
        spec_id: 'S-003',
        spec_revision: 1,
        goal: 'Cross-cutting overhaul: redesign UI layout, verify browser visual parity, audit auth security, and execute clean code refactor',
        skills: ['frontend-architect', 'parity-verification', 'browser-qa', 'quality'],
        requirements: ['R-001'],
        acceptance: [{ claim_id: 'C-001a' }],
        scope: { owned: ['src'], forbidden: [] },
      };

      const routes = routeSkills(packet, repoRoot);
      expect(routes.length).toBeGreaterThanOrEqual(4);
      const skillIds = routes.map((r) => r.id);
      expect(skillIds).toContain('frontend-architect');
      expect(skillIds).toContain('parity-verification');
      expect(skillIds).toContain('browser-qa');
      expect(skillIds).toContain('quality');
    });

    it('provides Tier-1 progressive skill catalog metadata for discovery', () => {
      const catalog = describeSkillCatalog(repoRoot);
      expect(catalog.length).toBeGreaterThan(0);
      for (const item of catalog) {
        expect(item.id).toBeDefined();
        expect(item.role).toBeDefined();
        expect(item.tier).toBe(1);
        expect(item.source).toContain('SKILL.md');
      }
    });
  });

  describe('Workstream A: OpenCode V1 vs V2 Dialect & Runtime Contract Binding', () => {
    it('binds OpenCode V1 runtime contract (opencode, permission map, mcp)', () => {
      const contract = detectOpenCodeRuntimeContract('{"permission": "allow", "tools": {"bash": "allow"}}');
      expect(contract.dialect).toBe('v1');
      expect(contract.executable).toBe('opencode');
      expect(contract.permissionVocabulary).toBe('tool-map');
      expect(contract.mcpKey).toBe('mcp');
      expect(contract.supportedFlags).toContain('--auto');
    });

    it('binds OpenCode V2 runtime contract (opencode2, permissions[] ordered rules, mcp.servers)', () => {
      const contract = detectOpenCodeRuntimeContract('{"permissions": [{"action": "shell", "effect": "allow"}]}');
      expect(contract.dialect).toBe('v2');
      expect(contract.executable).toBe('opencode2');
      expect(contract.permissionVocabulary).toBe('ordered-rules');
      expect(contract.mcpKey).toBe('mcp.servers');
      expect(contract.supportedFlags).toContain('--agent');
    });

    it('evaluates OpenCode V2 permissions using last-matching-rule behavior', () => {
      const rules = [
        { pattern: '*', action: 'ask' as const },
        { pattern: 'src/**', action: 'allow' as const },
        { pattern: 'src/secret.ts', action: 'deny' as const },
      ];

      expect(evaluateOpenCodeV2Permissions(rules, 'src/components/button.ts')).toBe('allow');
      expect(evaluateOpenCodeV2Permissions(rules, 'src/secret.ts')).toBe('deny');
      expect(evaluateOpenCodeV2Permissions(rules, 'package.json')).toBe('ask');
    });

    it('formats distinct valid V1 and V2 configuration objects', () => {
      const v1Config = formatOpenCodeV1Config({
        permissionMap: { '*': 'ask', bash: 'allow', edit: { 'src/**': 'allow' } },
        mcp: { playwright: { command: 'npx' } },
      });
      expect(v1Config.permission).toBeDefined();
      expect(v1Config.mcp).toBeDefined();
      expect(v1Config.$schema).toContain('config.json');

      const v2Config = formatOpenCodeV2Config({
        permissions: [{ pattern: 'src/**', action: 'allow' }],
        mcpServers: { playwright: { command: 'npx' } },
      });
      expect(v2Config.permissions).toBeDefined();
      expect((v2Config.mcp as Record<string, unknown>).servers).toBeDefined();
      expect(v2Config.$schema).toContain('config.v2.json');
    });
  });

  describe('Workstream C & D: Platform Headless Invocations & Probed MCP Paths', () => {
    it('builds normalized worker invocations with required write/autonomy flags', () => {
      const claude = buildAgentInvocation('claude', 'fix bug', { logDir: 'logs' });
      expect(claude.executable).toBe('claude');
      expect(claude.args).toContain('--permission-mode');
      expect(claude.args).toContain('acceptEdits');

      const codex = buildAgentInvocation('codex', 'fix bug', { logDir: 'logs' });
      expect(codex.executable).toBe('codex');
      expect(codex.args).toContain('--sandbox');
      expect(codex.args).toContain('workspace-write');
      expect(codex.args).toContain('--ask-for-approval');
      expect(codex.args).toContain('never');

      const opencode = buildAgentInvocation('opencode', 'fix bug', { logDir: 'logs' });
      expect(opencode.executable).toBe('opencode');
      expect(opencode.args).toContain('--auto');

      const antigravity = buildAgentInvocation('antigravity', 'fix bug', { logDir: 'logs' });
      expect(antigravity.executable).toBe('agy');
      expect(antigravity.args).toContain('-p');

      const cursor = buildAgentInvocation('cursor', 'fix bug', { logDir: 'logs' });
      expect(cursor.executable).toBe('cursor-agent');
      expect(cursor.args).toContain('-p');
      expect(cursor.args).toContain('--force');

      const deepseek = buildAgentInvocation('deepseek-harness', 'fix bug', { logDir: 'logs' });
      expect(deepseek.executable).toBe('dsh');
      expect(deepseek.args).toContain('--profile');
      expect(deepseek.args).toContain('headless');

      const grok = buildAgentInvocation('grok', 'fix bug', { logDir: 'logs' });
      expect(grok.executable).toBe('grok');
      expect(grok.args).toContain('-p');
    });

    it('resolves Antigravity MCP paths dynamically with provenance', () => {
      const resolution = resolveAntigravityMcpPaths(repoRoot);
      expect(resolution.candidateLocations.length).toBeGreaterThanOrEqual(3);
      expect(resolution.provenance.searched.length).toBeGreaterThanOrEqual(3);
      expect(resolution.surface).toBeDefined();
    });
  });

  describe('Workstream H: Resource Governor Correctness', () => {
    it('preserves multi-skill task packets without throwing on valid multi-skill coverage', () => {
      const packets: TaskPacket[] = [{
        schema: 'harness/task-packet',
        version: 1,
        task_id: 'T-governor-1',
        spec_id: 'S-gov',
        spec_revision: 1,
        goal: 'Multi-skill architecture task',
        skills: ['frontend-architect', 'database-stack', 'browser-qa', 'security-review', 'quality'],
        capabilities: ['fs.write', 'cmd.exec'],
        requirements: ['R-001'],
        acceptance: [{ claim_id: 'C-001a' }],
        scope: { owned: ['src'], forbidden: [] },
      }];

      expect(() => assertResourceBudget({ packets })).not.toThrow();
    });

    it('sheds expensive lanes under memory pressure while keeping standard lanes', () => {
      const controller = new LaneController();

      expect(controller.acquire('browser')).toBe(true);
      expect(controller.acquire('writer')).toBe(true);
      controller.applyMemoryPressure(0.5);
      expect(controller.acquire('browser')).toBe(false);
      expect(controller.acquire('heavy_process')).toBe(false);
      expect(controller.acquire('verifier')).toBe(true);
    });
  });

  describe('Workstream G: Repair Taxonomy (Local Defect vs Plan Amendment vs Structural Replan)', () => {
    it('classifies localized implementation bugs as LOCAL_DEFECT', () => {
      const result = categorizeRepair('Fix broken CSS selector in header component');
      expect(result.category).toBe('LOCAL_DEFECT');
      expect(result.flow).toBe('bounded_patch');
      expect(result.max_attempts).toBe(2);
    });

    it('classifies assumption failure or intent adjustment as PLAN_AMENDMENT', () => {
      const result = categorizeRepair('Assumption was false: database schema uses UUIDs not integers; amend plan', { assumptionFailed: true });
      expect(result.category).toBe('PLAN_AMENDMENT');
      expect(result.flow).toBe('amend_contract');
    });

    it('classifies fundamental premise failure or security boundary change as STRUCTURAL_REPLAN', () => {
      const result = categorizeRepair('Core premise is false: external API removed OAuth endpoint, complete redesign required', { securityBoundaryChanged: true });
      expect(result.category).toBe('STRUCTURAL_REPLAN');
      expect(result.flow).toBe('structural_replan');
      expect(result.max_attempts).toBe(1);
    });
  });

  describe('Workstream F: Lossless Manual Cross-Host Handoff', () => {
    it('compiles, renders, and audits a complete portable plan contract losslessly', () => {
      const request = createWorkRequest({
        raw_intent: 'Cross-host handoff test task',
        work_id: 'W-handoff',
        explicit_constraints: ['Do not change user table schema'],
        explicit_non_goals: ['OAuth integration'],
      });
      const compiled = compileWorkSpec(request, {
        requirements: [{
          id: 'R-001',
          statement: 'Auth endpoint generates valid JWT',
          mandatory: true,
          claims: [{ claim_id: 'C-001a', statement: 'JWT verification passes', class: 'mechanical', verifier_id: 'V-jwt' }],
        }],
        decisions: ['Use JWT tokens with 1h expiry'],
        known: ['Existing auth module at src/auth'],
        assumed: ['Postgres is running locally'],
      });
      const packets = compileTaskPackets(compiled, [{
        goal: 'Implement JWT generation',
        requirement_ids: ['R-001'],
        claim_ids: ['C-001a'],
        owned: ['src/auth'],
        verifier_by_claim: { 'C-001a': 'V-jwt' },
      }]);
      const contract = compileFrozenContract({
        request,
        spec: compiled.spec,
        packets,
      });

      const markdownPlan = renderPlan(contract);
      expect(markdownPlan).toContain('# Frozen Execution Contract');
      expect(markdownPlan).toContain('Identity: work_id=W-handoff');
      expect(markdownPlan).toContain('Decisions: Use JWT tokens with 1h expiry');
      expect(markdownPlan).toContain('Constraints: Do not change user table schema');
      expect(markdownPlan).toContain('Non-goals: OAuth integration');
      expect(markdownPlan).toContain('Assumptions: Postgres is running locally');

      const markdownPrompt = renderPrompt(contract);
      expect(markdownPrompt).toContain('# Task execution from frozen contract');
      expect(markdownPrompt).toContain('T-001');

      const audit = auditPreHandoff({
        contract,
        spec: compiled.spec,
        candidate: packets,
        authorized_assumptions: ['Postgres is running locally'],
        provided_references: [],
      });
      expect(audit.verdict).toBe('PASS');
      expect(audit.gates.intent_completeness).toBe('PASS');
      expect(audit.gates.plan_spec_completeness).toBe('PASS');
      expect(audit.gates.implementation_completeness).toBe('PASS');
    });
  });

  describe('Workstream J: Certification Transition Gates & Negative Freshness Predicates', () => {
    it('rejects static config claiming NATIVE_DISCOVERED without native discovery evidence', () => {
      expect(() => assertValidTruthTransition('PROJECTED', 'NATIVE_DISCOVERED', { nativeDiscoveryEvidence: false })).toThrow(/native host discovery evidence/);
    });

    it('rejects discovery claiming ACTIVATED without runtime activation evidence', () => {
      expect(() => assertValidTruthTransition('NATIVE_DISCOVERED', 'ACTIVATED', { activationEvidence: false })).toThrow(/runtime activation evidence/);
    });

    it('rejects activation claiming USED or EFFECT_PROVEN without diffs', () => {
      expect(() => assertValidTruthTransition('ACTIVATED', 'EFFECT_PROVEN', { effectEvidence: false })).toThrow(/verified effect evidence/);
    });

    it('rejects unit PASS claiming LIVE_CERTIFIED without live environment verification', () => {
      expect(() => assertValidTruthTransition('EFFECT_PROVEN', 'LIVE_CERTIFIED', { liveEnvironmentVerified: false, effectEvidence: true })).toThrow(/live environment execution evidence/);
    });

    it('fails closed on stale git HEAD or session mismatch', () => {
      expect(() => assertValidTruthTransition('IMPLEMENTED', 'ACTIVATED', { isFresh: false })).toThrow(/Stale session or git HEAD mismatch/);
    });
  });

  describe('Workstream K: Canonical Context Engine & Evolving-Task Canary', () => {
    it('dynamically activates rules, skills, and MCP on state transitions and evolving runtime observations', () => {
      const request = createWorkRequest({
        raw_intent: 'Build a responsive user settings dashboard',
        work_id: 'W-evolving-01',
      });
      const compiled = compileWorkSpec(request);

      // Step 1: Initial Intake state
      let state = createContextState({
        request,
        spec: compiled.spec,
        workspaceFacts: { repoRoot, detectedStack: ['react', 'vite'], hasFrontend: true },
        hostSurface: { host: 'antigravity', surface: 'desktop', supportsNativeSkills: true, supportsNativeMcp: true },
      });

      expect(state.phase).toBe('INTAKE');
      expect(state.activeSkills.some((s) => s.id === 'frontend-architect')).toBe(true);
      expect(state.activeProviders.find((p) => p.providerId === 'playwright-mcp')?.permitted).toBe(false);

      // Step 2: Transition into Planning
      state = evaluateContextState(state, 'TRANSITION_PLANNING', { nextPhase: 'PLAN' });
      expect(state.phase).toBe('PLAN');

      // Step 3: New observation discovered in repo: database migration requirement
      state = evaluateContextState(state, 'NEW_WORKSPACE_FACT', {
        newObservations: [{
          id: 'OBS-001',
          observedAt: new Date().toISOString(),
          source: 'file_change',
          content: 'Found prisma/schema.prisma with user settings table requiring migration script',
        }],
        updatedWorkspaceFacts: { hasDatabase: true },
      });

      // Assert that database-stack, schema-migration, and database safety rules dynamically became active!
      const activeSkillIds = state.activeSkills.map((s) => s.id);
      expect(activeSkillIds).toContain('database-stack');
      expect(activeSkillIds).toContain('schema-migration');
      expect(state.activeRules.some((r) => r.id === 'RULE-07-DATABASE-MIGRATION-SAFETY')).toBe(true);

      // Step 4: Transition into Implementation
      state = evaluateContextState(state, 'TRANSITION_IMPLEMENTATION', { nextPhase: 'IMPLEMENT' });
      expect(state.phase).toBe('IMPLEMENT');
      expect(state.activeRules.some((r) => r.id === 'RULE-02-FORBIDDEN-SCOPE-FAIL-CLOSED')).toBe(true);

      // Step 5: Transition into Verification
      state = evaluateContextState(state, 'VERIFIER_START', { nextPhase: 'VERIFY' });
      expect(state.phase).toBe('VERIFY');
      // Playwright MCP is now permitted and authorized for browser verification
      const playwright = state.activeProviders.find((p) => p.providerId === 'playwright-mcp');
      expect(playwright?.permitted).toBe(true);
      expect(playwright?.lifecycleStage).toBe('PERMITTED_AUTHORIZED');

      // Step 6: Verifier records PASS and finishes
      state = evaluateContextState(state, 'VERIFIER_START', {
        newVerifierEvidence: [{
          verifierId: 'V-001',
          claimId: 'C-001a',
          status: 'PASS',
          outputSha256: 'a'.repeat(64),
          observedAt: new Date().toISOString(),
        }],
      });
      expect(state.verifierEvidence).toHaveLength(1);
      expect(state.verifierEvidence[0].status).toBe('PASS');
      expect(state.history.length).toBeGreaterThanOrEqual(6);
    });
  });
});
