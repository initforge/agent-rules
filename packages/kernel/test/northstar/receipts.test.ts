import { describe, expect, it } from 'vitest';
import {
  SURFACE_STAGE_PROFILES,
  assertUniversalCapabilityReceipt,
  createUniversalReceipt,
  type CapabilitySurfaceKind,
  type UniversalCapabilityReceipt,
} from '../../src/northstar/receipts.js';

describe('UniversalCapabilityReceipt & Lifecycle Invariants', () => {
  it('defines valid surface stage profiles for all 15 capability kinds', () => {
    const kinds: CapabilitySurfaceKind[] = [
      'skill',
      'instruction_rule',
      'mcp',
      'hook_plugin',
      'subagent',
      'planner',
      'reference_input',
      'permission',
      'sandbox',
      'session',
      'compaction',
      'model_observability',
      'verifier',
      'plan_compiler',
      'decision_enforcement',
    ];

    for (const kind of kinds) {
      const profile = SURFACE_STAGE_PROFILES[kind];
      expect(profile).toBeDefined();
      expect(profile.defined).toBe('REQUIRED');
      expect(profile.verified).toBe('REQUIRED');
    }

    // Skills require projection, discovery, advertisement, selection, activation, use, effect
    expect(SURFACE_STAGE_PROFILES.skill.projected).toBe('REQUIRED');
    expect(SURFACE_STAGE_PROFILES.skill.advertised).toBe('REQUIRED');

    // Sandboxes and permissions are enforced outside model advertisement
    expect(SURFACE_STAGE_PROFILES.sandbox.advertised).toBe('NOT_APPLICABLE');
    expect(SURFACE_STAGE_PROFILES.permission.selected).toBe('NOT_APPLICABLE');

    // Model observability requires observed effect and attestation, not prompt selection
    expect(SURFACE_STAGE_PROFILES.model_observability.selected).toBe('NOT_APPLICABLE');
    expect(SURFACE_STAGE_PROFILES.model_observability.effect_observed).toBe('REQUIRED');
  });

  it('creates a valid LIVE_VERIFIED receipt when all REQUIRED stages are SATISFIED', () => {
    const receipt = createUniversalReceipt({
      host: 'codex',
      host_surface: 'cli',
      workspace_root: '/repo/test',
      capability_type: 'skill',
      capability_id: 'frontend-architect',
      source_hash: 'a'.repeat(64),
      projection: {
        scope: 'global',
        target_path: '/home/user/.agents/skills/frontend-architect',
        target_hash: 'b'.repeat(64),
        representation_format: 'directory_skill_md',
        ownership_manifest_ref: '/home/user/.agent-rules/ownership-manifest.json',
      },
      native_binding: {
        effective_root: '/home/user/.agents/skills',
        effective_precedence_rank: 1,
        winning_definition_hash: 'b'.repeat(64),
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
        evidence_kind: 'test',
        artifact_hash: 'c'.repeat(64),
        verdict: 'PASS',
      },
    });

    expect(receipt.status).toBe('LIVE_VERIFIED');
    expect(receipt.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stages.projected.requirement).toBe('REQUIRED');
    expect(receipt.stages.projected.observation).toBe('SATISFIED');
  });

  it('rejects LIVE_VERIFIED status when a REQUIRED stage has UNKNOWN or FAILED observation', () => {
    expect(() => {
      const invalid: UniversalCapabilityReceipt = {
        schema: 'agent-rules/universal-capability-receipt/v1',
        version: 1,
        receipt_sha256: '0'.repeat(64),
        host: 'antigravity',
        host_surface: 'ide',
        workspace_root: '/repo/test',
        capability_type: 'skill',
        capability_id: 'ui-taste',
        source_hash: 'a'.repeat(64),
        stages: {
          defined: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          built: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          projected: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          native_discovered: { requirement: 'REQUIRED', observation: 'FAILED' }, // FAILED!
          advertised: { requirement: 'REQUIRED', observation: 'UNKNOWN' },
          selected: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          activated: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          actually_used: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          effect_observed: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          verified: { requirement: 'REQUIRED', observation: 'SATISFIED' },
        },
        status: 'LIVE_VERIFIED', // Contradiction!
        evaluated_at: new Date().toISOString(),
      };
      assertUniversalCapabilityReceipt(invalid);
    }).toThrow(/Inadmissible LIVE_VERIFIED receipt: stage native_discovered is REQUIRED but observation is FAILED/);
  });

  it('rejects verified observation when status is STALE_SESSION', () => {
    expect(() => {
      const invalid: UniversalCapabilityReceipt = {
        schema: 'agent-rules/universal-capability-receipt/v1',
        version: 1,
        receipt_sha256: '0'.repeat(64),
        host: 'opencode',
        host_surface: 'cli',
        workspace_root: '/repo/test',
        capability_type: 'skill',
        capability_id: 'security-audit',
        source_hash: 'a'.repeat(64),
        projection: {
          scope: 'global',
          target_path: '/home/user/.config/opencode/skills/security-audit',
          target_hash: 'b'.repeat(64),
          representation_format: 'directory_skill_md',
          ownership_manifest_ref: '/home/user/.agent-rules/ownership-manifest.json',
        },
        stages: {
          defined: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          built: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          projected: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          native_discovered: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          advertised: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          selected: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          activated: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          actually_used: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          effect_observed: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          verified: { requirement: 'REQUIRED', observation: 'SATISFIED' },
        },
        status: 'STALE_SESSION',
        evaluated_at: new Date().toISOString(),
      };
      assertUniversalCapabilityReceipt(invalid);
    }).toThrow(/Status STALE_SESSION cannot have verified observation SATISFIED/);
  });

  it('rejects unknown/unprofiled capability kinds fail-closed', () => {
    expect(() => {
      const invalid = {
        schema: 'agent-rules/universal-capability-receipt/v1',
        version: 1,
        receipt_sha256: '0'.repeat(64),
        host: 'codex',
        host_surface: 'cli',
        workspace_root: '/repo/test',
        capability_type: 'magic_ai_proxy' as any,
        capability_id: 'magic',
        source_hash: 'a'.repeat(64),
        stages: {},
        status: 'LIVE_VERIFIED',
        evaluated_at: new Date().toISOString(),
      };
      assertUniversalCapabilityReceipt(invalid);
    }).toThrow(/Unknown capability_type: magic_ai_proxy/);
  });

  it('rejects NOT_APPLICABLE when supplied as a StageObservation value', () => {
    expect(() => {
      const invalid: UniversalCapabilityReceipt = {
        schema: 'agent-rules/universal-capability-receipt/v1',
        version: 1,
        receipt_sha256: '0'.repeat(64),
        host: 'codex',
        host_surface: 'cli',
        workspace_root: '/repo/test',
        capability_type: 'verifier',
        capability_id: 'test-runner',
        source_hash: 'a'.repeat(64),
        stages: {
          defined: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          built: { requirement: 'OPTIONAL', observation: 'UNKNOWN' },
          projected: { requirement: 'NOT_APPLICABLE', observation: 'NOT_APPLICABLE' as any }, // FORBIDDEN!
          native_discovered: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          advertised: { requirement: 'NOT_APPLICABLE', observation: 'UNKNOWN' },
          selected: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          activated: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          actually_used: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          effect_observed: { requirement: 'REQUIRED', observation: 'SATISFIED' },
          verified: { requirement: 'REQUIRED', observation: 'SATISFIED' },
        },
        effect_evidence: { evidence_kind: 'test', verdict: 'PASS' },
        status: 'LIVE_VERIFIED',
        evaluated_at: new Date().toISOString(),
      };
      assertUniversalCapabilityReceipt(invalid);
    }).toThrow(/NOT_APPLICABLE is forbidden as an observation value/);
  });

  it('explicitly profiles verifier and plan_compiler capabilities', () => {
    const verifierReceipt = createUniversalReceipt({
      host: 'codex',
      host_surface: 'cli',
      workspace_root: '/repo/test',
      capability_type: 'verifier',
      capability_id: 'vitest',
      source_hash: 'a'.repeat(64),
      stage_observations: {
        defined: { observation: 'SATISFIED' },
        built: { observation: 'SATISFIED' },
        native_discovered: { observation: 'SATISFIED' },
        selected: { observation: 'SATISFIED' },
        activated: { observation: 'SATISFIED' },
        actually_used: { observation: 'SATISFIED' },
        effect_observed: { observation: 'SATISFIED' },
        verified: { observation: 'SATISFIED' },
      },
      effect_evidence: { evidence_kind: 'test', verdict: 'PASS' },
    });
    expect(verifierReceipt.status).toBe('LIVE_VERIFIED');
    expect(verifierReceipt.stages.projected.requirement).toBe('NOT_APPLICABLE');
    expect(verifierReceipt.stages.projected.observation).toBe('UNKNOWN');

    const compilerReceipt = createUniversalReceipt({
      host: 'claude',
      host_surface: 'cli',
      workspace_root: '/repo/test',
      capability_type: 'plan_compiler',
      capability_id: 'northstar-compiler',
      source_hash: 'a'.repeat(64),
      stage_observations: {
        defined: { observation: 'SATISFIED' },
        built: { observation: 'SATISFIED' },
        selected: { observation: 'SATISFIED' },
        activated: { observation: 'SATISFIED' },
        actually_used: { observation: 'SATISFIED' },
        effect_observed: { observation: 'SATISFIED' },
        verified: { observation: 'SATISFIED' },
      },
      effect_evidence: { evidence_kind: 'static', verdict: 'PASS' },
    });
    expect(compilerReceipt.status).toBe('LIVE_VERIFIED');
    expect(compilerReceipt.stages.native_discovered.requirement).toBe('NOT_APPLICABLE');
  });
});
