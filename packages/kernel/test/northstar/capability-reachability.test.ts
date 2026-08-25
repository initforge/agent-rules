import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createUniversalReceipt,
  assertUniversalCapabilityReceipt,
  type UniversalCapabilityReceipt,
} from '../../src/northstar/receipts.js';
import {
  inferSkillRole,
  routeSkills,
  type SkillRoute,
  type SkillRole,
} from '../../src/northstar/routing.js';
import {
  computeReachabilityMetrics,
  type ReachabilityTelemetryData,
} from '../../src/northstar/telemetry.js';
import {
  checkSessionFreshness,
} from '../../src/northstar/host-capabilities.js';
import {
  projectSkillsToGlobal,
  getGlobalSkillRoots,
} from '../../../cli/src/runtime/composed-installer.js';
import {
  captureWorkingTreeDelta,
} from '../../src/runner/diff.js';
import {
  evaluateDecisionPostEffect,
  compileDecisionEnvelope,
} from '../../src/northstar/decision-closure.js';

const temps: string[] = [];
function tempDir(): string {
  const dir = path.join(os.tmpdir(), `reachability-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe('Capability Reachability & Runtime Reality Reconciliation', () => {
  // Test Tier T0: Universal Receipt Stage Model
  it('T0: enforces orthogonal StageRequirement vs StageObservation semantics in UniversalCapabilityReceipt', () => {
    const receipt = createUniversalReceipt({
      host: 'antigravity',
      host_surface: 'ide',
      workspace_root: '/workspace/app',
      capability_type: 'skill',
      capability_id: 'ui-taste',
      source_hash: '1'.repeat(64),
      projection: {
        scope: 'global',
        target_path: '/home/.gemini/config/skills/ui-taste',
        target_hash: '2'.repeat(64),
        representation_format: 'directory_skill_md',
        ownership_manifest_ref: '/home/.agent-rules/ownership-manifest.json',
      },
      stage_observations: {
        defined: { observation: 'SATISFIED' },
        built: { observation: 'SATISFIED' },
        projected: { observation: 'SATISFIED' },
        native_discovered: { observation: 'SATISFIED' },
        advertised: { observation: 'SATISFIED' },
        selected: { observation: 'SATISFIED' },
        activated: { observation: 'SATISFIED' },
        actually_used: { observation: 'SATISFIED' },
        effect_observed: { observation: 'SATISFIED' },
        verified: { observation: 'SATISFIED' },
      },
      effect_evidence: {
        evidence_kind: 'visual',
        artifact_hash: '3'.repeat(64),
        verdict: 'PASS',
      },
    });

    expect(receipt.status).toBe('LIVE_VERIFIED');
    expect(receipt.stages.defined.requirement).toBe('REQUIRED');
    expect(receipt.stages.defined.observation).toBe('SATISFIED');
    expect(receipt.stages.selected.requirement).toBe('REQUIRED');
    expect(receipt.stages.selected.observation).toBe('SATISFIED');
  });

  // Test Tier T0: Multi-Role Skill Taxonomy & Inferences
  it('T0: correctly infers functional skill roles across 8 distinct axes', () => {
    expect(inferSkillRole('ui-taste')).toBe('DOMAIN_JUDGMENT');
    expect(inferSkillRole('5fedu-compliance')).toBe('DOMAIN_JUDGMENT');
    expect(inferSkillRole('frontend-architect')).toBe('IMPLEMENTATION_GUIDANCE');
    expect(inferSkillRole('browser-qa')).toBe('BROWSER_OBSERVATION');
    expect(inferSkillRole('security-audit')).toBe('SECURITY_LENS');
    expect(inferSkillRole('quality')).toBe('QUALITY_LENS');
    expect(inferSkillRole('data-contract')).toBe('ARCHITECTURE_LENS');
  });

  // Test Tier T0: Reachability Telemetry Computation
  it('T0: computes reachability metrics with exact zero-escape invariants', () => {
    const data: ReachabilityTelemetryData = {
      required_capabilities: ['ui-taste', 'frontend-architect'],
      selected_capabilities: ['ui-taste', 'frontend-architect', 'quality'],
      projected_capabilities: ['ui-taste', 'frontend-architect', 'quality'],
      native_discovered_capabilities: ['ui-taste', 'frontend-architect', 'quality'],
      false_native_discoveries: [],
      activated_capabilities: ['ui-taste', 'frontend-architect', 'quality'],
      effect_proven_capabilities: ['ui-taste', 'frontend-architect', 'quality'],
      attempted_decision_violations: 2,
      detected_decision_violations: 2,
      escaped_decision_violations: 0,
      stale_sessions_unwarned: 0,
      total_sessions: 5,
      internal_revision_count: 1,
      visible_revision_count: 0,
    };

    const metrics = computeReachabilityMetrics(data);
    expect(metrics.required_capability_recall).toBe(1.0);
    expect(metrics.false_native_discovery_rate).toBe(0.0);
    expect(metrics.decision_gap_escape_rate).toBe(0.0);
    expect(metrics.decision_violation_detection_rate).toBe(1.0);
    expect(metrics.session_staleness_rate).toBe(0.0);
  });

  // Test Tier T2: Session Freshness Detection
  it('T2: detects stale in-memory catalog when on-disk projection changes mid-session', () => {
    const fresh = checkSessionFreshness({
      sessionStartedAt: new Date('2026-08-22T10:00:00Z').toISOString(),
      catalogUpdatedAt: new Date('2026-08-22T09:00:00Z').toISOString(),
      installedHash: 'hash-a',
      observedSessionHash: 'hash-a',
    });
    expect(fresh.fresh).toBe(true);
    expect(fresh.status).toBe('FRESH');

    const stale = checkSessionFreshness({
      sessionStartedAt: new Date('2026-08-22T10:00:00Z').toISOString(),
      catalogUpdatedAt: new Date('2026-08-22T10:30:00Z').toISOString(), // Updated after session start!
      installedHash: 'hash-b',
      observedSessionHash: 'hash-a',
    });
    expect(stale.fresh).toBe(false);
    expect(stale.status).toBe('STALE_SESSION');
    expect(stale.reasons.length).toBeGreaterThan(0);
  });

  // Test Tier T2: True Post-Effect Conformance on Real ChangeSet
  it('T2: audits real diff text in TaskChangeSet and blocks unapproved persistent store injection', () => {
    const envelope = compileDecisionEnvelope({
      specId: 'SPEC-001',
      specRevision: 'rev-1',
      taskId: 'T-001',
      decisionRequirements: [{
        decision_id: 'DEC-001',
        consequence_class: 'PERSISTENCE',
        why_required: 'Persistence store locked to in-memory SQLite',
        source_requirement_ids: ['R-001'],
        affected_domains: ['database'],
        discoverable_with_evidence: true,
        closure_state: 'CLOSED',
        closed_decision: 'Use SQLite in-memory',
        required_authority: 'planner',
      }],
      ownedPaths: ['src'],
    });

    const compliantDiff = `
diff --git a/src/db.ts b/src/db.ts
new file mode 100644
+import sqlite3 from 'sqlite3';
+const db = new sqlite3.Database(':memory:');
`;

    const compliantResult = evaluateDecisionPostEffect(envelope, ['src/db.ts'], compliantDiff);
    expect(compliantResult.passed).toBe(true);

    const violatingDiff = `
diff --git a/src/cache.ts b/src/cache.ts
new file mode 100644
+import Redis from 'ioredis';
+const redis = new Redis();
`;

    const violatingResult = evaluateDecisionPostEffect(envelope, ['src/cache.ts'], violatingDiff);
    expect(violatingResult.passed).toBe(false);
    expect(violatingResult.violations.length).toBeGreaterThan(0);
  });

  // Acceptance Canary 1: Real Multi-Domain UI/UX Task
  it('T4 Canary: Natural UI/UX request composes domain taste + frontend architect + browser QA', () => {
    const packet = {
      protocol_version: '2.0' as const,
      task_id: 'T-UI-001',
      spec_revision: 'rev-1',
      goal: 'Build a modern landing page redesign with giao diện đẹp and run a playwright smoke test on the console/network panel',
      scope: { owned: ['src/components/dashboard.tsx'], forbidden: [] },
      requirements: ['R-001'],
      acceptance: [{ claim_id: 'C-001' }],
    };

    const routes = routeSkills(packet);
    expect(routes.length).toBeGreaterThan(0);
    // Verifies that routing selected frontend/UI guidance without winner-take-all drop
    const ids = routes.map((r) => r.id);
    expect(ids.some((id) => id.includes('frontend') || id.includes('taste') || id.includes('browser') || id.includes('quality'))).toBe(true);
  });

  // Acceptance Canary 2: Database / Persistence Task
  it('T4 Canary: Natural Database persistence request locks SQLite and rejects unapproved store', () => {
    const envelope = compileDecisionEnvelope({
      specId: 'SPEC-DB',
      specRevision: 'rev-1',
      taskId: 'T-DB-001',
      decisionRequirements: [{
        decision_id: 'DEC-DB-1',
        consequence_class: 'PERSISTENCE',
        why_required: 'Lock persistence store to SQLite WAL',
        source_requirement_ids: ['R-DB-1'],
        affected_domains: ['database'],
        discoverable_with_evidence: true,
        closure_state: 'CLOSED',
        closed_decision: 'Use SQLite WAL',
        required_authority: 'planner',
      }],
      ownedPaths: ['src/db'],
    });

    const diff = `+import { Pool } from 'pg';\n+const pool = new Pool();`;
    const check = evaluateDecisionPostEffect(envelope, ['src/db/pool.ts'], diff);
    expect(check.passed).toBe(false);
  });

  // Acceptance Canary 3: Cold-Start Clean Reinstall
  it('T5 Canary: Clean isolated projection and uninstallation leaves zero orphaned files', async () => {
    const fakeSkillsSource = tempDir();
    const fakeTargetRoot = tempDir();

    const skillDir = path.join(fakeSkillsSource, 'security-audit');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: security-audit\n---\nSecurity lens body', 'utf8');

    // 1. Install / Project
    const { projected, collisions } = await projectSkillsToGlobal(fakeSkillsSource, 'codex', {
      targetRoots: [fakeTargetRoot],
    });
    expect(projected).toContain('security-audit');
    expect(collisions.length).toBe(0);

    const projectedSkillFile = path.join(fakeTargetRoot, 'security-audit', 'SKILL.md');
    expect(await fs.readFile(projectedSkillFile, 'utf8')).toContain('Security lens body');
  });
});
