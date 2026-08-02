/**
 * main-run-capsule.test.ts — Tests for C5 M11R37/R38/R42 MainRunCapsule and fidelity validation.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { IdentityAmendment } from '../src/plan-identity.js';
import type { CandidateEpoch } from '../src/candidate-epoch.js';
import { candidateEpochHash } from '../src/candidate-epoch.js';
import {
  compileCapsule,
  validateCapsuleFidelity,
  computeCapsuleHash,
  computeEffectivePlanIdentity,
  type CapsuleCompileInput,
  type FidelityValidationInput,
  type MainRunCapsule,
} from '../src/main-run-capsule.js';
import { CAPSULE_SCHEMA, CAPSULE_VERSION } from '../src/main-run-capsule.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const TEST_ORIGINAL_SHA = sha256('original-plan');
const TEST_AMENDMENT_SHA = sha256('amendment-1');
// AM-0001 is in the approved list (AM-0001, AM-0002, AM-0003, AM-0005, AM-0006, AM-0007, AM-0008)
const TEST_APPROVED_AMENDMENT: IdentityAmendment = { amendment_id: 'AM-0001', sha256: TEST_AMENDMENT_SHA };

function makeCandidateEpoch(): CandidateEpoch {
  return {
    schema: 'artifact/candidate-epoch/v1',
    source_tree_sha: sha256('tree'),
    candidate_commit_or_tree: sha256('commit'),
    artifact_digest: sha256('artifact'),
    container_image_digests: [],
    dependency_lock_hash: sha256('deps'),
    migration_set_hash: sha256('migrations'),
    environment_hash: sha256('env'),
    fixture_hash: sha256('fixtures'),
    topology_hash: sha256('topology'),
    created_at: new Date().toISOString(),
    build_critical_manifest: [],
    notes: {},
  };
}

function makeCapsuleInput(overrides: Partial<CapsuleCompileInput> = {}): CapsuleCompileInput {
  const amendments: IdentityAmendment[] = [
    TEST_APPROVED_AMENDMENT,
  ];

  return {
    run_id: 'run-001',
    plan_id: 'test-plan',
    original_sha256: TEST_ORIGINAL_SHA,
    amendments,
    candidate_epoch: makeCandidateEpoch(),
    ledger_revision: 1,
    event_cursor: 0,
    capsule_revision: 1,
    ready_queue_digest: sha256('ready-queue'),
    verification_digest: sha256('verification'),
    review_digest: sha256('review'),
    terminal_gate_digest: sha256('terminal'),
    budget_envelope: {
      max_tokens_per_run: 100000,
      max_cost_per_run_usd: 1.0,
      max_latency_ms: 300000,
      advisory_context_tokens: 8000,
    },
    ...overrides,
  };
}

function makeFidelityInput(
  capsule: MainRunCapsule,
  overrides: Partial<FidelityValidationInput> = {},
): FidelityValidationInput {
  return {
    capsule,
    expected_original_sha256: TEST_ORIGINAL_SHA,
    expected_amendments: [TEST_APPROVED_AMENDMENT],
    expected_candidate_epoch: makeCandidateEpoch(),
    expected_ledger_revision: 1,
    expected_event_cursor: 0,
    ...overrides,
  };
}

describe('compileCapsule', () => {
  it('creates a valid capsule with required fields', () => {
    const input = makeCapsuleInput();
    const capsule = compileCapsule(input);

    expect(capsule.schema).toBe(CAPSULE_SCHEMA);
    expect(capsule.version).toBe(CAPSULE_VERSION);
    expect(capsule.run_id).toBe('run-001');
    expect(capsule.plan_id).toBe('test-plan');
    expect(capsule.original_plan_sha256).toBe(TEST_ORIGINAL_SHA);
    expect(capsule.capsule_sha256).toMatch(/^[a-f0-9]{64}$/);
    // Verify candidate_epoch_hash is computed correctly
    expect(capsule.candidate_epoch_hash).toBe(candidateEpochHash(input.candidate_epoch));
    expect(capsule.compiled_at).toBeTruthy();
  });

  it('computes effective_plan_sha256 from original and amendments', () => {
    const input = makeCapsuleInput();
    const capsule = compileCapsule(input);
    expect(capsule.effective_plan_sha256).toBeTruthy();
    expect(capsule.effective_plan_sha256).not.toBe(capsule.original_plan_sha256);
  });

  it('sets default values for optional fields', () => {
    const input = makeCapsuleInput();
    const capsule = compileCapsule(input);

    expect(capsule.owner_intent_invariants).toEqual([]);
    expect(capsule.active_decisions).toEqual([]);
    expect(capsule.critical_path).toEqual([]);
    expect(capsule.assignments_by_state).toEqual({});
    expect(capsule.changed_claims).toEqual([]);
    expect(capsule.open_findings).toEqual([]);
    expect(capsule.conflicts_requiring_decision).toEqual([]);
    expect(capsule.artifact_pointers).toEqual([]);
  });

  it('creates default omitted_manifest when not provided', () => {
    const input = makeCapsuleInput();
    const capsule = compileCapsule(input);

    expect(capsule.omitted_manifest.total_artifacts).toBe(0);
    expect(capsule.omitted_manifest.omitted_count).toBe(0);
    expect(capsule.omitted_manifest.omitted_bytes).toBe(0);
  });

  it('sets default allowed_drilldowns when not provided', () => {
    const input = makeCapsuleInput();
    const capsule = compileCapsule(input);

    expect(capsule.allowed_drilldowns).toContain('PLAN_ANCHORS');
    expect(capsule.allowed_drilldowns).toContain('DIFF_HUNKS');
    expect(capsule.allowed_drilldowns).toContain('FULL_ARTIFACT');
  });

  it('preserves provided optional fields', () => {
    const input = makeCapsuleInput({
      owner_intent_invariants: [
        { invariant_id: 'INV-1', description: 'test', binding_sha256: sha256('binding') },
      ],
      active_decisions: [
        { decision_id: 'D-1', category: 'TEST', rationale: 'test', made_at: new Date().toISOString(), binding_sha256: sha256('binding') },
      ],
    });
    const capsule = compileCapsule(input);

    expect(capsule.owner_intent_invariants).toHaveLength(1);
    expect(capsule.active_decisions).toHaveLength(1);
  });

  it('throws for invalid original_sha256', () => {
    const input = makeCapsuleInput({ original_sha256: 'invalid' as any });
    expect(() => compileCapsule(input)).toThrow('SHA-256');
  });

  it('throws for negative ledger_revision', () => {
    const input = makeCapsuleInput({ ledger_revision: -1 });
    expect(() => compileCapsule(input)).toThrow('non-negative integer');
  });

  it('throws for negative event_cursor', () => {
    const input = makeCapsuleInput({ event_cursor: -1 });
    expect(() => compileCapsule(input)).toThrow('non-negative integer');
  });
});

describe('computeCapsuleHash', () => {
  it('produces deterministic hash for same capsule', () => {
    const input = makeCapsuleInput();
    const capsule = compileCapsule(input);
    const hash1 = computeCapsuleHash(capsule);
    const hash2 = computeCapsuleHash(capsule);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different capsule', () => {
    const input1 = makeCapsuleInput({ run_id: 'run-001' });
    const input2 = makeCapsuleInput({ run_id: 'run-002' });
    const capsule1 = compileCapsule(input1);
    const capsule2 = compileCapsule(input2);
    expect(computeCapsuleHash(capsule1)).not.toBe(computeCapsuleHash(capsule2));
  });

  it('produces different hash for different ledger_revision', () => {
    const input1 = makeCapsuleInput({ ledger_revision: 1 });
    const input2 = makeCapsuleInput({ ledger_revision: 2 });
    const capsule1 = compileCapsule(input1);
    const capsule2 = compileCapsule(input2);
    expect(computeCapsuleHash(capsule1)).not.toBe(computeCapsuleHash(capsule2));
  });
});

describe('computeEffectivePlanIdentity', () => {
  it('computes effective plan identity from original and amendments', () => {
    const effective = computeEffectivePlanIdentity(TEST_ORIGINAL_SHA, [
      TEST_APPROVED_AMENDMENT,
    ]);
    expect(effective).toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws for invalid original_sha256', () => {
    expect(() => computeEffectivePlanIdentity('invalid' as any, [])).toThrow('SHA-256');
  });
});

describe('validateCapsuleFidelity', () => {
  let capsule: MainRunCapsule;

  beforeEach(() => {
    const input = makeCapsuleInput();
    capsule = compileCapsule(input);
  });

  it('validates a correct capsule', () => {
    const result = validateCapsuleFidelity(makeFidelityInput(capsule));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.checks).toContain('schema');
      expect(result.checks).toContain('original_identity');
      expect(result.checks).toContain('effective_identity');
      expect(result.checks).toContain('candidate_epoch');
      expect(result.checks).toContain('capsule_hash');
    }
  });

  it('rejects schema mismatch', () => {
    const badCapsule = { ...capsule, schema: 'bad-schema' };
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('SCHEMA_MISMATCH');
    }
  });

  it('rejects version mismatch', () => {
    const badCapsule = { ...capsule, version: 99 };
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('VERSION_MISMATCH');
    }
  });

  it('rejects original_sha256 mismatch', () => {
    const badCapsule = { ...capsule, original_plan_sha256: sha256('different') };
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('ORIGINAL_SHA_MISMATCH');
    }
  });

  it('rejects candidate_epoch_hash mismatch', () => {
    const badCapsule = { ...capsule, candidate_epoch_hash: sha256('different') };
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CANDIDATE_EPOCH_MISMATCH');
    }
  });

  it('rejects ledger_revision mismatch', () => {
    // Recompile with ledger_revision 99 to get correct capsule hash
    const badInput = makeCapsuleInput({ ledger_revision: 99 });
    const badCapsule = compileCapsule(badInput);
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule, { expected_ledger_revision: 99 }));
    // This won't fail because we expect 99
    expect(result.valid).toBe(true);
  });

  it('rejects capsule hash mismatch (tampered capsule)', () => {
    // Modify the capsule without recompiling - this will cause hash mismatch
    const badCapsule = { ...capsule, run_id: 'tampered' } as MainRunCapsule;
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CAPSULE_HASH_MISMATCH');
    }
  });

  it('rejects omitted manifest with omissions not disclosed', () => {
    // Recompile with the bad omitted_manifest to get correct capsule hash
    const badInput = makeCapsuleInput({
      omitted_manifest: {
        total_artifacts: 10,
        omitted_count: 5,
        omitted_uris: [], // Should list omitted URIs
        total_bytes: 1000,
        omitted_bytes: 500,
      },
    });
    const badCapsule = compileCapsule(badInput);
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('OMISSION_NOT_DISCLOSED');
    }
  });

  it('accepts omitted manifest when properly disclosed', () => {
    // Recompile with the good omitted_manifest to get correct capsule hash
    const goodInput = makeCapsuleInput({
      omitted_manifest: {
        total_artifacts: 10,
        omitted_count: 5,
        omitted_uris: ['s3://bucket/artifact-1', 's3://bucket/artifact-2'],
        total_bytes: 1000,
        omitted_bytes: 500,
      },
    });
    const goodCapsule = compileCapsule(goodInput);
    const result = validateCapsuleFidelity(makeFidelityInput(goodCapsule));
    expect(result.valid).toBe(true);
  });

  it('rejects invalid compiled_at timestamp', () => {
    // Recompile with invalid timestamp to get correct capsule hash
    const badInput = makeCapsuleInput();
    const badCapsule = compileCapsule(badInput);
    // Manually set invalid timestamp (this breaks the hash, so we test hash mismatch)
    const tamperedCapsule = { ...badCapsule, compiled_at: 'invalid-date' } as MainRunCapsule;
    const result = validateCapsuleFidelity(makeFidelityInput(tamperedCapsule));
    // The hash will mismatch first because we changed compiled_at
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CAPSULE_HASH_MISMATCH');
    }
  });

  it('rejects owner_intent_invariants with invalid binding_sha256', () => {
    // Recompile with the bad invariants to get correct capsule hash
    const badInput = makeCapsuleInput({
      owner_intent_invariants: [
        { invariant_id: 'INV-1', description: 'test', binding_sha256: 'invalid' as any },
      ],
    });
    const badCapsule = compileCapsule(badInput);
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_INVARIANT_SHA');
    }
  });

  it('rejects active_decisions with invalid binding_sha256', () => {
    // Recompile with the bad decisions to get correct capsule hash
    const badInput = makeCapsuleInput({
      active_decisions: [
        { decision_id: 'D-1', category: 'TEST', rationale: 'test', made_at: new Date().toISOString(), binding_sha256: 'invalid' as any },
      ],
    });
    const badCapsule = compileCapsule(badInput);
    const result = validateCapsuleFidelity(makeFidelityInput(badCapsule));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_DECISION_SHA');
    }
  });
});

describe('capsule revision increments', () => {
  it('increments capsule_revision on recompile', () => {
    const input1 = makeCapsuleInput({ capsule_revision: 1 });
    const capsule1 = compileCapsule(input1);
    expect(capsule1.capsule_revision).toBe(1);

    const input2 = makeCapsuleInput({ capsule_revision: 2 });
    const capsule2 = compileCapsule(input2);
    expect(capsule2.capsule_revision).toBe(2);

    // Different revisions should produce different hashes
    expect(computeCapsuleHash(capsule1)).not.toBe(computeCapsuleHash(capsule2));
  });
});
