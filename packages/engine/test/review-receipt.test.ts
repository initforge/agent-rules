/**
 * review-receipt.test.ts — M11-R29 capability-qualified verdicts (AM-0020 §5-6).
 *
 * Covers: valid ACCEPT_SCOPE for a T1 claim; every §5 INVALID reason; §6 tier
 * enforcement (T0 none, T1 one, T2 specialist+probe, T3 two reviewers with >=1
 * strong/different-provider, T-Visual vision, T-Global sharded + challenger);
 * staleness on new epoch / claim change; ACCEPT_SCOPE never implies complete.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  REVIEW_VERDICTS,
  validateReceipt,
  validateReviewSet,
  requiredReviewersFor,
  receiptStale,
  claimTerminalEligible,
  assessTerminalReceipts,
  evaluateTerminalEligibility,
  claimFingerprint,
  reviewerRecordFromAttestation,
  type ReviewReceipt,
  type ReviewerRecord,
  type ReviewerRegistry,
} from '../src/review-receipt.js';
import { candidateEpochHash, type CandidateEpoch } from '../src/candidate-epoch.js';
import type { ClaimDefinition, ClaimEvidenceInput } from '../src/plan-readiness.js';
import type { Counterexample } from '../src/adversarial-compiler.js';

function makeProbe(probeId: string): Counterexample {
  return {
    probe_id: probeId,
    domain: 'authorization_security',
    subcategory: 'probe',
    invariant: 'i',
    action: 'a',
    expected_rejection: 'r',
    target_claim: 'CLAIM-T1-1',
    surface: 'auth.token',
  };
}

const EPOCH: CandidateEpoch = {
  schema: 'artifact/candidate-epoch/v1',
  source_tree_sha: 'a'.repeat(40),
  candidate_commit_or_tree: 'b'.repeat(40),
  artifact_digest: '',
  container_image_digests: [],
  dependency_lock_hash: 'c'.repeat(64),
  migration_set_hash: '',
  environment_hash: 'd'.repeat(64),
  fixture_hash: '',
  topology_hash: 'e'.repeat(64),
  created_at: '2026-08-01T00:00:00.000Z',
  build_critical_manifest: [],
  notes: {},
};
const EPOCH_HASH = candidateEpochHash(EPOCH);
const EPOCH2: CandidateEpoch = { ...EPOCH, source_tree_sha: 'f'.repeat(40) };

function makeClaim(overrides: Partial<ClaimDefinition> = {}): ClaimDefinition {
  return {
    claim_id: 'CLAIM-T1-1',
    requirement_id: 'REQ-007',
    plan_anchor: 'plan:anchor',
    meaning: 'm',
    scope: ['standard', 'unit-behavior'],
    risk_tier: 'T1',
    positive_invariants: ['p'],
    negative_invariants: ['n'],
    required_evidence: ['unit-test-log'],
    required_capabilities: [],
    freshness_dependencies: [],
    allowed_deviations: [],
    terminal_weight: 3,
    ...overrides,
  };
}

function makeRecord(sessionId: string, overrides: Partial<ReviewerRecord> = {}): ReviewerRecord {
  return {
    session_id: sessionId,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    strength: 'economy',
    capabilities: ['specialist', 'vision', 'cdp'],
    capability_status: 'ADAPTER_ENFORCED',
    requested_model: 'deepseek-v4-flash',
    resolved_model: 'deepseek-v4-flash',
    observed_model: 'deepseek-v4-flash',
    ...overrides,
  };
}

function makeRegistry(reviewers: ReviewerRecord[] = [makeRecord('rev-1')]): ReviewerRegistry {
  return { writer: makeRecord('writer-1'), reviewers };
}

function makeReceipt(overrides: Partial<ReviewReceipt> = {}): ReviewReceipt {
  return {
    review_id: 'review-1',
    claim_scope: ['standard', 'unit-behavior'],
    risk_tier: 'T1',
    candidate_epoch: EPOCH_HASH,
    reviewer_session: 'rev-1',
    reviewer_model_provider_effort: {
      requested_model: 'deepseek-v4-flash',
      resolved_model: 'deepseek-v4-flash',
      observed_model: 'deepseek-v4-flash',
      provider: 'deepseek',
      effort: 'economy',
    },
    capability_attestation: ['specialist', 'vision', 'cdp'],
    independence_proof: 'separate-session:rev-1; read-only; evidence://host/commit/capabilities/hash',
    blind_review_completed: true,
    threat_hypotheses: ['stale token on the claim route must fail closed'],
    adversarial_probes: ['auth_stale-revoked-token'],
    evidence_reproduced: ['unit-test-log'],
    findings: [],
    coverage: '100%',
    verdict: 'ACCEPT_SCOPE',
    confidence: 0.9,
    limitations: [],
    ...overrides,
  };
}

describe('valid receipts', () => {
  it('ACCEPT_SCOPE for a T1 claim is VALID', () => {
    const claim = makeClaim();
    const result = validateReceipt(makeReceipt(), { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.deepEqual(result, { valid: true });
    const set = validateReviewSet([makeReceipt()], { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.equal(set.valid, true);
  });

  it('every verdict in the allowed 5-set is structurally accepted', () => {
    assert.equal(REVIEW_VERDICTS.length, 5);
    assert.deepEqual([...REVIEW_VERDICTS].sort(), ['ACCEPT_SCOPE', 'CAPABILITY_MISSING', 'NEEDS_REPAIR', 'REJECT_EVIDENCE', 'REVIEW_CONFLICT']);
  });

  it('non-accepting verdicts are not capability-gated (a no-vision reviewer may flag defects)', () => {
    const claim = makeClaim({ risk_tier: 'T2', scope: ['auth', 'specialist-review'], required_capabilities: ['specialist'] });
    const receipt = makeReceipt({
      claim_scope: ['auth', 'specialist-review'],
      risk_tier: 'T2',
      verdict: 'NEEDS_REPAIR',
      capability_attestation: [], // no specialist — but not accepting, so valid
      adversarial_probes: [],
      findings: ['cross-role access allowed'],
    });
    const result = validateReceipt(receipt, { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.deepEqual(result, { valid: true });
  });

  it('CAPABILITY_MISSING is the honest verdict when a capability is absent', () => {
    const claim = makeClaim({ risk_tier: 'T-Visual', scope: ['visual', 'ui-parity', 'vision-review'], required_capabilities: ['vision', 'cdp'] });
    const receipt = makeReceipt({
      claim_scope: ['visual', 'ui-parity', 'vision-review'],
      risk_tier: 'T-Visual',
      verdict: 'CAPABILITY_MISSING',
      capability_attestation: [],
      adversarial_probes: [],
      limitations: ['reviewer has no vision capability'],
    });
    const result = validateReceipt(receipt, { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.deepEqual(result, { valid: true });
  });
});

describe('INVALID reasons (AM-0020 §5)', () => {
  const claim = makeClaim();
  const ctx = { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() };
  const cases: Array<[string, Partial<ReviewReceipt>]> = [
    ['verdict outside the allowed set', { verdict: 'PASS' as ReviewReceipt['verdict'] }],
    ['claim_scope does not cover the claim scope', { claim_scope: ['standard'] }],
    ['risk_tier mismatch', { risk_tier: 'T3' }],
    ['candidate_epoch does not equal the final epoch', { candidate_epoch: 'deadbeef' }],
    ['self-review: same session as the writer', { reviewer_session: 'writer-1' }],
    ['missing independence_proof', { independence_proof: '' }],
    ['blind_review not completed', { blind_review_completed: false }],
    ['unknown reviewer session', { reviewer_session: 'ghost-9' }],
    ['confidence out of range', { confidence: 1.5 }],
  ];
  for (const [label, receiptOverrides] of cases) {
    it(`rejects: ${label}`, () => {
      const result = validateReceipt(makeReceipt(receiptOverrides), ctx);
      assert.equal(result.valid, false);
    });
  }

  it('rejects: no-vision reviewer cannot ACCEPT_SCOPE a T-Visual claim', () => {
    const visualClaim = makeClaim({
      claim_id: 'CLAIM-R21-2', risk_tier: 'T-Visual',
      scope: ['visual', 'ui-parity', 'taste', 'vision-review'],
      required_capabilities: ['vision', 'cdp'],
    });
    const receipt = makeReceipt({
      claim_scope: ['visual', 'ui-parity', 'taste', 'vision-review'],
      risk_tier: 'T-Visual',
      capability_attestation: ['cdp'], // no vision
      adversarial_probes: [],
    });
    const result = validateReceipt(receipt, { claim: visualClaim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.equal(result.valid, false);
    assert.match(result.valid === false ? result.reason : '', /vision/);
  });

  it('rejects: no specialist on a T2 claim cannot ACCEPT_SCOPE', () => {
    const t2 = makeClaim({ risk_tier: 'T2', scope: ['auth', 'specialist-review'], required_capabilities: ['specialist'] });
    const receipt = makeReceipt({
      claim_scope: ['auth', 'specialist-review'],
      risk_tier: 'T2',
      capability_attestation: ['deterministic-verifier'], // no specialist
    });
    const result = validateReceipt(receipt, { claim: t2, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.equal(result.valid, false);
    assert.match(result.valid === false ? result.reason : '', /specialist/);
  });

  it('rejects: T2/T3 with no adversarial probes and no deterministic-proof justification', () => {
    const t2 = makeClaim({ risk_tier: 'T2', scope: ['auth', 'specialist-review'], required_capabilities: ['specialist'] });
    const receipt = makeReceipt({
      claim_scope: ['auth', 'specialist-review'],
      risk_tier: 'T2',
      adversarial_probes: [],
    });
    const result = validateReceipt(receipt, { claim: t2, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.equal(result.valid, false);
    assert.match(result.valid === false ? result.reason : '', /probe|deterministic/i);
    // A recorded deterministic-proof justification satisfies the R30 gate link.
    const withProof = { ...receipt, deterministic_proof_justification: 'invariant formally proven; probe unnecessary' };
    assert.equal(validateReceipt(withProof, { claim: t2, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, true);
  });

  it('rejects: adversarial_probes referencing unknown compiled probe ids (R30 linkage)', () => {
    const t2 = makeClaim({ risk_tier: 'T2', scope: ['auth', 'specialist-review'], required_capabilities: ['specialist'] });
    const receipt = makeReceipt({
      claim_scope: ['auth', 'specialist-review'],
      risk_tier: 'T2',
      adversarial_probes: ['auth_wrong-owner-object', 'ghost-probe'],
    });
    const compiledProbes = [makeProbe('auth_wrong-owner-object')];
    const result = validateReceipt(receipt, {
      claim: t2, epoch: EPOCH, reviewerRegistry: makeRegistry(),
      compiledProbes,
    });
    assert.equal(result.valid, false);
  });
});

describe('tier enforcement (AM-0020 §6)', () => {
  it('T0 requires no reviewers and no receipts', () => {
    const t0 = makeClaim({ risk_tier: 'T0' });
    assert.equal(requiredReviewersFor(t0).minimum_reviewers, 0);
    assert.equal(validateReviewSet([], { claim: t0, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, true);
  });

  it('T1 requires one independent reviewer', () => {
    const t1 = makeClaim();
    assert.equal(requiredReviewersFor(t1).minimum_reviewers, 1);
    assert.equal(validateReviewSet([], { claim: t1, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, false);
    assert.equal(validateReviewSet([makeReceipt()], { claim: t1, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, true);
  });

  it('T2 requires a specialist reviewer plus adversarial probe', () => {
    const t2 = makeClaim({ risk_tier: 'T2', scope: ['auth', 'specialist-review'], required_capabilities: ['specialist'] });
    const base = {
      claim_scope: ['auth', 'specialist-review'],
      risk_tier: 'T2',
      adversarial_probes: ['auth_cross-role-access'],
    } as const;
    // No specialist in the registry record.
    const registryNoSpec = makeRegistry([makeRecord('rev-1', { capabilities: [] })]);
    assert.equal(validateReviewSet([makeReceipt(base)], { claim: t2, epoch: EPOCH, reviewerRegistry: registryNoSpec }).valid, false);
    // Probe missing from the accepting receipt.
    const noProbe = makeReceipt({ ...base, adversarial_probes: [] });
    assert.equal(validateReviewSet([noProbe], { claim: t2, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, false);
    // Complete set.
    assert.equal(validateReviewSet([makeReceipt(base)], { claim: t2, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, true);
  });

  it('T3 with one reviewer is insufficient', () => {
    const t3 = makeClaim({ risk_tier: 'T3', scope: ['release', 'specialist-review'], required_capabilities: ['specialist'] });
    const r = makeReceipt({ claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    assert.equal(validateReviewSet([r], { claim: t3, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, false);
  });

  it('T3 with two reviewers sharing the writer provider and strength is insufficient', () => {
    const t3 = makeClaim({ risk_tier: 'T3', scope: ['release', 'specialist-review'], required_capabilities: ['specialist'] });
    const registry = makeRegistry([
      makeRecord('rev-1', { provider: 'deepseek', strength: 'economy' }),
      makeRecord('rev-2', { provider: 'deepseek', strength: 'economy' }),
    ]);
    const a = makeReceipt({ review_id: 'a', reviewer_session: 'rev-1', claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    const b = makeReceipt({ review_id: 'b', reviewer_session: 'rev-2', claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    const result = validateReviewSet([a, b], { claim: t3, epoch: EPOCH, reviewerRegistry: registry });
    assert.equal(result.valid, false);
    assert.match(result.valid === false ? result.reason : '', /strong|different-provider/i);
  });

  it('T3 with two reviewers of different providers is valid', () => {
    const t3 = makeClaim({ risk_tier: 'T3', scope: ['release', 'specialist-review'], required_capabilities: ['specialist'] });
    const registry = makeRegistry([
      makeRecord('rev-1', { provider: 'deepseek', strength: 'economy' }),
      makeRecord('rev-2', { provider: 'anthropic', strength: 'economy' }),
    ]);
    const a = makeReceipt({ review_id: 'a', reviewer_session: 'rev-1', claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    const b = makeReceipt({ review_id: 'b', reviewer_session: 'rev-2', claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    assert.equal(validateReviewSet([a, b], { claim: t3, epoch: EPOCH, reviewerRegistry: registry }).valid, true);
  });

  it('T3 diversity is also satisfied by one strong reviewer on the same provider', () => {
    const t3 = makeClaim({ risk_tier: 'T3', scope: ['release', 'specialist-review'], required_capabilities: ['specialist'] });
    const registry = makeRegistry([
      makeRecord('rev-1', { provider: 'deepseek', strength: 'expert' }),
      makeRecord('rev-2', { provider: 'deepseek', strength: 'economy' }),
    ]);
    const a = makeReceipt({ review_id: 'a', reviewer_session: 'rev-1', claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    const b = makeReceipt({ review_id: 'b', reviewer_session: 'rev-2', claim_scope: ['release', 'specialist-review'], risk_tier: 'T3' });
    assert.equal(validateReviewSet([a, b], { claim: t3, epoch: EPOCH, reviewerRegistry: registry }).valid, true);
  });

  it('T-Visual: no-vision ACCEPT_SCOPE is rejected; a vision reviewer is valid', () => {
    const visual = makeClaim({
      claim_id: 'CLAIM-R21-2', risk_tier: 'T-Visual',
      scope: ['visual', 'ui-parity', 'vision-review'],
      required_capabilities: ['vision', 'cdp'],
    });
    const scope = ['visual', 'ui-parity', 'vision-review'];
    // Receipt attests cdp but not vision → ACCEPT_SCOPE invalid.
    const noVision = makeReceipt({
      claim_scope: scope, risk_tier: 'T-Visual',
      capability_attestation: ['cdp'], adversarial_probes: [],
    });
    assert.equal(validateReceipt(noVision, { claim: visual, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, false);
    // Vision reviewer: registry record + receipt both carry vision.
    const vision = makeReceipt({
      claim_scope: scope, risk_tier: 'T-Visual',
      capability_attestation: ['vision', 'cdp'], adversarial_probes: [],
    });
    assert.equal(validateReceipt(vision, { claim: visual, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, true);
    assert.equal(validateReviewSet([vision], { claim: visual, epoch: EPOCH, reviewerRegistry: makeRegistry() }).valid, true);
  });

  it('T-Global: sharded specialists plus a blind final challenger', () => {
    const globalClaim = makeClaim({
      risk_tier: 'T-Global',
      scope: ['architecture', 'terminal', 'blind-challenge'],
      required_capabilities: ['specialist'],
    });
    const scope = ['architecture', 'terminal', 'blind-challenge'];
    const registry = makeRegistry([
      makeRecord('rev-1'), makeRecord('rev-2'), makeRecord('rev-3'),
    ]);
    const sharded = [
      makeReceipt({ review_id: 'a', reviewer_session: 'rev-1', claim_scope: scope, risk_tier: 'T-Global' }),
      makeReceipt({ review_id: 'b', reviewer_session: 'rev-2', claim_scope: scope, risk_tier: 'T-Global' }),
    ];
    // Without a blind final challenger the set is insufficient.
    assert.equal(validateReviewSet(sharded, { claim: globalClaim, epoch: EPOCH, reviewerRegistry: registry }).valid, false);
    const challenger = makeReceipt({
      review_id: 'c', reviewer_session: 'rev-3', claim_scope: scope, risk_tier: 'T-Global',
      blind_challenger: true, threat_hypotheses: ['aggregate PASS must not hide PARTIAL records'],
    });
    assert.equal(validateReviewSet([...sharded, challenger], { claim: globalClaim, epoch: EPOCH, reviewerRegistry: registry }).valid, true);
  });
});

describe('staleness (AM-0020 §5)', () => {
  it('a new candidate epoch makes the receipt stale', () => {
    const claim = makeClaim();
    const receipt = makeReceipt();
    assert.equal(receiptStale(receipt, { epoch: EPOCH, claim }), null);
    assert.equal(receiptStale(receipt, { epoch: EPOCH2, claim }), 'post-review change: new candidate epoch');
  });

  it('a claim scope change makes the receipt stale', () => {
    const claim = makeClaim();
    const receipt = makeReceipt();
    const grown = makeClaim({ scope: ['standard', 'unit-behavior', 'release-rollback'] });
    assert.match(receiptStale(receipt, { epoch: EPOCH, claim: grown }) ?? '', /scope changed/);
  });

  it('a claim definition change (fingerprint) makes the receipt stale', () => {
    const claim = makeClaim();
    const receipt = makeReceipt({ reviewed_claim_fingerprint: claimFingerprint(claim) });
    assert.equal(receiptStale(receipt, { epoch: EPOCH, claim }), null);
    const changed = makeClaim({ meaning: 'reworded meaning after review' });
    assert.match(receiptStale(receipt, { epoch: EPOCH, claim: changed }) ?? '', /claim definition changed/);
  });

  it('a risk tier change makes the receipt stale', () => {
    const claim = makeClaim();
    const receipt = makeReceipt();
    assert.match(receiptStale(receipt, { epoch: EPOCH, claim: makeClaim({ risk_tier: 'T3' }) }) ?? '', /risk tier changed/);
  });
});

describe('ACCEPT_SCOPE never implies project complete (fail-closed seam)', () => {
  const fullEvidence = (): ClaimEvidenceInput => ({
    present: true, valid: true, fresh: true, independently_reproduced: true, terminal_eligible: true,
    capabilities: ['specialist', 'vision', 'cdp'],
  });

  it('validateReceipt returns a plain validation and never sets project state', () => {
    const claim = makeClaim();
    const receipt = makeReceipt();
    const before = JSON.stringify(claim);
    const result = validateReceipt(receipt, { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.deepEqual(result, { valid: true });
    assert.equal(JSON.stringify(claim), before); // the claim (project state input) is untouched
  });

  it('the combined seam still blocks when the formula is not satisfied', () => {
    const claim = makeClaim();
    const receipts = [makeReceipt()];
    const evidence: Record<string, ClaimEvidenceInput> = {
      [claim.claim_id]: { present: true, valid: true, fresh: true }, // FRESH, not TERMINAL_ELIGIBLE
    };
    const out = evaluateTerminalEligibility([claim], evidence, { [claim.claim_id]: receipts }, {
      claim, epoch: EPOCH, reviewerRegistry: makeRegistry(),
    });
    assert.equal(out.eligible, false); // receipts cannot upgrade a FRESH formula
    assert.match(out.reasons.join(' '), /CLAIM-T1-1/);
  });

  it('terminal eligibility requires a valid, fresh receipt set for every non-T0 claim', () => {
    const a = makeClaim({ claim_id: 'CLAIM-A' });
    const b = makeClaim({ claim_id: 'CLAIM-B', requirement_id: 'REQ-008' });
    const evidence: Record<string, ClaimEvidenceInput> = { [a.claim_id]: fullEvidence(), [b.claim_id]: fullEvidence() };
    const ctx = { epoch: EPOCH, reviewerRegistry: makeRegistry() } as const;
    // Only A reviewed — B lacks a receipt set → blocked.
    const out = assessTerminalReceipts([a, b], { [a.claim_id]: [makeReceipt()] }, { ...ctx, claim: a });
    assert.equal(out.eligible, false);
    assert.match(out.reasons.join(' '), /CLAIM-B/);
    // Fresh + valid receipt sets for both.
    const full = assessTerminalReceipts([a, b], {
      [a.claim_id]: [makeReceipt({ review_id: 'ra' })],
      [b.claim_id]: [makeReceipt({ review_id: 'rb' })],
    }, { ...ctx, claim: a });
    assert.equal(full.eligible, true);
    assert.equal(claimTerminalEligible(a, [makeReceipt()], { ...ctx, claim: a }).eligible, true);
  });

  it('a stale receipt set cannot certify terminal eligibility', () => {
    const claim = makeClaim();
    const stale = makeReceipt({ candidate_epoch: 'stale-hash' });
    const check = claimTerminalEligible(claim, [stale], { claim, epoch: EPOCH, reviewerRegistry: makeRegistry() });
    assert.equal(check.eligible, false);
    assert.match(check.reason ?? '', /fresh|epoch/i);
  });
});

describe('adapter capability observation (engine-side wrap)', () => {
  it('reviewerRecordFromAttestation folds HostAttestation model evidence into a ReviewerRecord', () => {
    const record = reviewerRecordFromAttestation({
      host: 'opencode',
      requestedModel: 'deepseek-v4-flash',
      resolvedModel: 'deepseek-v4-flash',
      observedModel: 'deepseek-v4-flash',
      capabilityStatus: 'HOST_NATIVE',
      capabilityIds: ['opencode:run', 'opencode:model'],
    }, { session_id: 'rev-1', provider: 'deepseek', strength: 'economy', capabilities: ['vision'] });
    assert.equal(record.requested_model, 'deepseek-v4-flash');
    assert.equal(record.observed_model, 'deepseek-v4-flash');
    assert.equal(record.capability_status, 'HOST_NATIVE');
    assert.ok(record.capabilities.includes('vision'));
  });
});
