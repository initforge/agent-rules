/**
 * REQ-018/REQ-019 — adaptive artifact lifecycle: admission before
 * persistence, smallest sufficient class, optional support pack, no assumed
 * host-native compaction.
 */
import { describe, it, expect } from 'vitest';
import { admitArtifact, classifyArtifact, persistenceReasonsForClass, recommendedPersistence } from '../../src/northstar/artifact-admission.js';

describe('REQ-018 — artifact admission', () => {
  it('EPHEMERAL refuses persistence without a strong reason', () => {
    const receipt = admitArtifact({ class: 'EPHEMERAL', reasons: [] });
    expect(receipt.admission).toBe('REFUSE');
    expect(receipt.persist).toBe(false);
  });

  it('EPHEMERAL persists only for audit/evidence/owner-policy reasons', () => {
    expect(admitArtifact({ class: 'EPHEMERAL', reasons: ['evidence'] }).persist).toBe(true);
    expect(admitArtifact({ class: 'EPHEMERAL', reasons: ['restart_resume'] }).persist).toBe(false);
  });

  it('CHECKPOINTED persists for restart/resume', () => {
    const receipt = admitArtifact({ class: 'CHECKPOINTED', reasons: ['restart_resume'], ttl_ms: 86_400_000, regeneration_rule: 'recompute from contract' });
    expect(receipt.persist).toBe(true);
    expect(receipt.expires_at).toBeTruthy();
    expect(receipt.regeneration_rule).toBe('recompute from contract');
  });

  it('COORDINATED persists only coordination/evidence state', () => {
    expect(admitArtifact({ class: 'COORDINATED', reasons: ['coordination'] }).persist).toBe(true);
    expect(admitArtifact({ class: 'COORDINATED', reasons: ['restart_resume'] }).persist).toBe(false);
  });

  it('AUDITED always persists and never assumes native compaction', () => {
    const receipt = admitArtifact({ class: 'AUDITED', reasons: ['audit_replay'] });
    expect(receipt.persist).toBe(true);
    expect(receipt.compact).toBe('unsupported');
  });

  it('receipts are hashed and self-identifying', () => {
    const receipt = admitArtifact({ class: 'CHECKPOINTED', reasons: ['restart_resume'] });
    expect(receipt.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.admission_id).toMatch(/^adm-/);
  });

  it('classifyArtifact selects the smallest sufficient class', () => {
    expect(classifyArtifact({ risk: 'low' })).toBe('EPHEMERAL');
    expect(classifyArtifact({ risk: 'low', duration_hint_ms: 5 * 60 * 60 * 1000 })).toBe('CHECKPOINTED');
    expect(classifyArtifact({ risk: 'medium', multi_agent: true })).toBe('COORDINATED');
    expect(classifyArtifact({ risk: 'high' })).toBe('AUDITED');
    expect(classifyArtifact({ risk: 'low', evidence_required: true })).toBe('AUDITED');
  });

  it('recommendedPersistence matches admission', () => {
    expect(recommendedPersistence('EPHEMERAL', [])).toBe(false);
    expect(recommendedPersistence('AUDITED', ['evidence'])).toBe(true);
  });

  it('reasons are scoped per class', () => {
    expect(persistenceReasonsForClass('EPHEMERAL').has('external_input')).toBe(false);
    expect(persistenceReasonsForClass('AUDITED').has('external_input')).toBe(true);
  });
});
