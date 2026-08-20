import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_STAGES,
  STAGE_RANK,
  bestStage,
  isLiveStage,
  normalizeStages,
  requiredStageFromText,
  stageSatisfies,
} from '../src/claim-registry.js';
import { deriveAcceptance } from '../src/northstar/evidence-ledger.js';
import { compileWorkSpec } from '../src/northstar/compiler.js';
import { classifyFinding, openPairRepair } from '../src/northstar/pair-repair.js';

const HEAD = '6e9a554a164e3a7d26df3cdb296392284c8c3166';

describe('AM-0005 evidence stage ladder', () => {
  it('defines exactly the canonical stages with a monotonic ladder', () => {
    expect(EVIDENCE_STAGES).toEqual([
      'SOURCE_VERIFIED', 'TEST_VERIFIED', 'NATIVE_SMOKE_VERIFIED',
      'LIVE_CANDIDATE', 'LIVE_OBSERVED', 'OPERATIONALLY_PROVEN', 'LIVE_UNPROVEN',
    ]);
    const promotable = EVIDENCE_STAGES.filter((s) => s !== 'LIVE_UNPROVEN');
    for (let i = 1; i < promotable.length; i++) {
      expect(STAGE_RANK[promotable[i]]).toBeGreaterThan(STAGE_RANK[promotable[i - 1]]);
    }
    expect(STAGE_RANK.LIVE_UNPROVEN).toBe(-1);
  });

  it('never lets test-only evidence satisfy live stages', () => {
    expect(stageSatisfies('LIVE_OBSERVED', ['TEST_VERIFIED'])).toBe(false);
    expect(stageSatisfies('LIVE_OBSERVED', ['SOURCE_VERIFIED', 'TEST_VERIFIED'])).toBe(false);
    expect(stageSatisfies('LIVE_CANDIDATE', ['NATIVE_SMOKE_VERIFIED'])).toBe(false);
    expect(stageSatisfies('OPERATIONALLY_PROVEN', ['LIVE_OBSERVED'])).toBe(false);
    expect(stageSatisfies('LIVE_OBSERVED', ['LIVE_OBSERVED'])).toBe(true);
    expect(stageSatisfies('LIVE_OBSERVED', ['TEST_VERIFIED', 'LIVE_OBSERVED'])).toBe(true);
  });

  it('treats unlabeled legacy records as the TEST_VERIFIED floor', () => {
    expect(normalizeStages(undefined)).toEqual(['TEST_VERIFIED']);
    expect(normalizeStages([])).toEqual(['TEST_VERIFIED']);
    expect(bestStage(normalizeStages(undefined))).toBe('TEST_VERIFIED');
    expect(isLiveStage('LIVE_OBSERVED')).toBe(true);
    expect(isLiveStage('TEST_VERIFIED')).toBe(false);
    expect(isLiveStage(undefined)).toBe(false);
  });

  it('derives required stages from requirement wording', () => {
    expect(requiredStageFromText('Dogfood compiled recipes during this phase')).toBe('LIVE_OBSERVED');
    expect(requiredStageFromText('operationally proven before closeout')).toBe('LIVE_OBSERVED');
    expect(requiredStageFromText('verify native smoke on the installed host')).toBe('NATIVE_SMOKE_VERIFIED');
    expect(requiredStageFromText('keep unit tests green')).toBe('TEST_VERIFIED');
  });
});

describe('AM-0005 acceptance reducer fail-closed semantics', () => {
  function scenario(requiredStage, records) {
    const request = {
      protocol_version: '2.0',
      work_id: 'W-reducer',
      raw_intent: 'Dogfood compiled recipes during this phase',
      source: 'cli',
      risk_hint: 'S1',
    };
    const compiled = compileWorkSpec(request, {
      risk_class: 'S1',
      requirements: [{
        statement: 'Dogfood compiled recipes during this phase',
        mandatory: true,
        claims: [{ statement: 'Dogfood compiled recipes during this phase', class: 'mechanical', required_stage: requiredStage }],
      }],
    });
    const spec = compiled.spec;
    const manifest = compiled.manifest;
    const claimId = spec.requirements[0].claims[0];
    const staged = records.map((record) => ({ ...record, claim_id: claimId }));
    const packets = [{
      protocol_version: '2.0', task_id: 'T-001', spec_id: spec.spec_id, spec_revision: spec.revision,
      goal: 'prove', requirements: [spec.requirements[0].id], scope: { owned: ['x'], forbidden: [] },
      acceptance: [{ claim_id: claimId }],
    }];
    let previous = '0'.repeat(64);
    const chain = [];
    for (const record of staged) {
      const body = { seq: chain.length + 1, origin: 'verifier', previous_hash: previous, record };
      const envelope_hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      chain.push({ ...body, envelope_hash });
      previous = envelope_hash;
    }
    return deriveAcceptance({ spec, packets, manifest, evidence: chain });
  }

  it('refuses live completion on test-only evidence (negative fixture)', () => {
    const result = scenario('LIVE_OBSERVED', [{
      protocol_version: '2.0', evidence_id: 'E-001', claim_id: 'C-001', task_id: 'T-001',
      kind: 'test', status: 'pass', evidence_stage: 'TEST_VERIFIED',
      verifier_id: 'V-1', oracle_group: 'unit', candidate_epoch: 2, platform: 'linux-x86_64',
    }]);
    expect(result.accepted_claims).not.toContain('C-001');
    expect(result.outcome).not.toBe('PASS');
    expect(result.reasons.join(' ')).toMatch(/below required stage LIVE_OBSERVED/);
  });

  it('accepts live claims only with properly staged live evidence (positive fixture)', () => {
    const now = new Date().toISOString();
    const result = scenario('LIVE_OBSERVED', [
      {
        protocol_version: '2.0', evidence_id: 'E-002', claim_id: 'C-001', task_id: 'T-001',
        kind: 'integration', status: 'pass', evidence_stage: 'NATIVE_SMOKE_VERIFIED',
        verifier_id: 'V-2', oracle_group: 'native', candidate_epoch: 2, platform: 'linux-x86_64',
        artifact_path: 'packages/cli/dist/index.js', sha256: HEAD,
      },
      {
        protocol_version: '2.0', evidence_id: 'E-003', claim_id: 'C-001', task_id: 'T-001',
        kind: 'browser', status: 'pass', evidence_stage: 'LIVE_OBSERVED',
        verifier_id: 'V-3', oracle_group: 'live', candidate_epoch: 2, platform: 'linux-x86_64',
        observed_at: now, artifact_path: 'packages/cli/dist/index.js', sha256: HEAD,
      },
    ]);
    expect(result.accepted_claims).toContain('C-001a');
    expect(result.outcome).toBe('PASS');
  });

  it('keeps test-level claims green on test evidence (compatibility)', () => {
    const result = scenario('TEST_VERIFIED', [{
      protocol_version: '2.0', evidence_id: 'E-004', claim_id: 'C-001', task_id: 'T-001',
      kind: 'test', status: 'pass', evidence_stage: 'TEST_VERIFIED',
      verifier_id: 'V-1', oracle_group: 'unit', candidate_epoch: 2, platform: 'linux-x86_64',
    }]);
    expect(result.accepted_claims).toContain('C-001a');
    expect(result.outcome).toBe('PASS');
  });

  it('does not downgrade pre-stage (unlabeled) evidence at test level', () => {
    const result = scenario('TEST_VERIFIED', [{
      protocol_version: '2.0', evidence_id: 'E-005', claim_id: 'C-001', task_id: 'T-001',
      kind: 'test', status: 'pass', verifier_id: 'V-1', oracle_group: 'unit', candidate_epoch: 1, platform: 'linux-x86_64',
    }]);
    expect(result.accepted_claims).toContain('C-001a');
  });
});

describe('AM-0005 owner-correction loop (PASS -> correction -> reopen -> fresh proof)', () => {
  const spec = {
    protocol_version: '2.0', spec_id: 'S-loop', revision: 4, work_id: 'W-loop', risk_class: 'S1',
    requirements: [
      { id: 'REQ-001', statement: 'Dogfood compiled recipes during this phase', mandatory: true, claims: ['C-016'] },
    ],
  };
  const claim_to_requirements = { 'C-016': ['REQ-001'] };
  const accepted_claims = ['C-016'];
  const plans = [{
    plan_id: 'harness-universal-reconciliation-v1', head_sha: HEAD, worktree_dirty: false,
    ledger_ref: '.agent/ledger/harness-universal-reconciliation-v1.json', diff_ref: 'main..candidate',
    evidence_refs: ['.agent/evidence/harness-universal-reconciliation-v1/S8/evidence.json'],
  }];

  it('classifies the boundary mismatch as an evidence defect', () => {
    expect(classifyFinding('The evidence file only ran a validator but the claim demands real usage')).toBe('evidence_defect');
  });

  it('reopens the affected claim in a new epoch and requires fresh proof', () => {
    const outcome = openPairRepair({
      raw_finding: 'C-016 was recorded PASS from validator-only evidence although REQ-016 claims dogfood of compiled recipes, reconciliation, provider routing, and runtime parity',
      candidate_plans: plans,
      current_epoch: 1,
      spec,
      claim_to_requirements,
      accepted_claims,
    });
    expect(outcome.needs_user).toBe(false);
    const packet = outcome.packet!;
    expect(packet.reopened_claims).toContain('C-016');
    expect(packet.candidate_epoch).toBe(2);
    expect(packet.proof_requirements.fresh_proof_required).toBe(true);
    expect(packet.proof_requirements.historical_pass_preserved).toBe(true);
    const reopenedOnly = packet.reopened_claims.every((c) => accepted_claims.includes(c));
    expect(reopenedOnly).toBe(true);
  });

  it('a reopened live claim cannot be re-accepted on test-only evidence', () => {
    const request = {
      protocol_version: '2.0', work_id: 'W-reopen', raw_intent: 'Dogfood compiled recipes during this phase',
      source: 'cli', risk_hint: 'S1',
    };
    const compiled = compileWorkSpec(request, {
      risk_class: 'S1',
      requirements: [{
        statement: 'Dogfood compiled recipes during this phase',
        mandatory: true,
        claims: [{ statement: 'Dogfood compiled recipes during this phase', class: 'mechanical', required_stage: 'LIVE_OBSERVED' }],
      }],
    });
    const spec = compiled.spec;
    const manifest = compiled.manifest;
    const claimId = spec.requirements[0].claims[0];
    const packets = [{
      protocol_version: '2.0', task_id: 'T-001', spec_id: spec.spec_id, spec_revision: spec.revision,
      goal: 'prove', requirements: [spec.requirements[0].id], scope: { owned: ['x'], forbidden: [] },
      acceptance: [{ claim_id: claimId }],
    }];
    const record = {
      protocol_version: '2.0', evidence_id: 'E-006', claim_id: claimId, task_id: 'T-001',
      kind: 'test', status: 'pass', evidence_stage: 'TEST_VERIFIED',
      verifier_id: 'V-1', oracle_group: 'unit', candidate_epoch: 2, platform: 'linux-x86_64',
    };
    const body = { seq: 1, origin: 'verifier', previous_hash: '0'.repeat(64), record };
    const chain = [{ ...body, envelope_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') }];
    const result = deriveAcceptance({ spec, packets, manifest, evidence: chain });
    expect(result.accepted_claims).not.toContain(claimId);
    expect(result.outcome).toBe('PARTIAL');
  });
});
