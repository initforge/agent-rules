import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  produceM11TerminalEvidence,
  writeM11TerminalEvidence,
  loadM11TerminalEvidenceEnvelope,
  type M11EvidenceProducerInput,
  type M11TerminalEvidenceEnvelope,
} from '../src/m11-terminal-evidence.js';
import { candidateEpochHash, type CandidateEpoch } from '../src/candidate-epoch.js';

const CANDIDATE_EPOCH_SCHEMA = 'artifact/candidate-epoch/v1';

function mkEpoch(overrides: Partial<CandidateEpoch> = {}): CandidateEpoch {
  return {
    schema: CANDIDATE_EPOCH_SCHEMA,
    source_tree_sha: 'a'.repeat(64),
    candidate_commit_or_tree: 'b'.repeat(40),
    artifact_digest: '',
    container_image_digests: [],
    dependency_lock_hash: createHash('sha256').update('').digest('hex'),
    migration_set_hash: createHash('sha256').update('').digest('hex'),
    environment_hash: createHash('sha256').update(JSON.stringify({ node: 'v20', platform: 'linux' })).digest('hex'),
    fixture_hash: createHash('sha256').update('').digest('hex'),
    topology_hash: createHash('sha256').update('').digest('hex'),
    created_at: new Date().toISOString(),
    build_critical_manifest: [],
    notes: {},
    ...overrides,
  };
}

function validInput(overrides: Partial<M11EvidenceProducerInput> = {}): M11EvidenceProducerInput {
  return {
    headCommit: 'a'.repeat(40),
    effectivePlanIdentity: 'b'.repeat(64),
    observedAt: new Date().toISOString(),
    fresh: true,
    ciSha: 'c'.repeat(64),
    certifiedArtifactSha256: 'd'.repeat(64),
    installedArtifactSha256: 'e'.repeat(64),
    installedFrom: 'npm:agent-rules@1.0.0',
    reconciliationHeadCommit: 'f'.repeat(40),
    parity: 'COMPLETE',
    topology: 'COMPLETE',
    reviews: [],
    candidateEpoch: mkEpoch({ candidate_commit_or_tree: 'a'.repeat(40) }),
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm11-ev-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// ─── produceM11TerminalEvidence ───────────────────────────────────────────────

describe('produceM11TerminalEvidence', () => {
  it('produces valid envelope with correct envelopeSha256', () => {
    const input = validInput();
    const result = produceM11TerminalEvidence(input);
    expect(result.ok).toBe(true);
    const env = result.envelope!;
    expect(env.envelopeSha256).toMatch(/^[a-f0-9]{64}$/);
    // Verify: recompute SHA over all fields except envelopeSha256
    const { envelopeSha256: _, ...envWithoutSha } = env;
    const expected = createHash('sha256').update(JSON.stringify(envWithoutSha, null, 2)).digest('hex');
    expect(env.envelopeSha256).toBe(expected);
  });

  it('binds candidate_epoch_hash from candidateEpoch', () => {
    const epoch = mkEpoch({ artifact_digest: 'x'.repeat(64) });
    const input = validInput({ candidateEpoch: epoch });
    const result = produceM11TerminalEvidence(input);
    expect(result.ok).toBe(true);
    expect(result.envelope!.candidate_epoch_hash).toBe(candidateEpochHash(epoch));
  });

  it('rejects missing headCommit', () => {
    const input = validInput({ headCommit: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing effectivePlanIdentity', () => {
    const input = validInput({ effectivePlanIdentity: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing observedAt', () => {
    const input = validInput({ observedAt: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects fresh !== true', () => {
    const input = validInput({ fresh: false as unknown as true });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
    expect(produceM11TerminalEvidence(validInput({ fresh: undefined as unknown as true })).ok).toBe(false);
  });

  it('rejects missing ciSha', () => {
    const input = validInput({ ciSha: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing certifiedArtifactSha256', () => {
    const input = validInput({ certifiedArtifactSha256: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing installedArtifactSha256', () => {
    const input = validInput({ installedArtifactSha256: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing installedFrom', () => {
    const input = validInput({ installedFrom: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing reconciliationHeadCommit', () => {
    const input = validInput({ reconciliationHeadCommit: '' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects invalid parity', () => {
    const input = validInput({ parity: 'INVALID' as 'COMPLETE' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
    const input2 = validInput({ parity: 'INCOMPLETE' as 'COMPLETE' });
    expect(produceM11TerminalEvidence(input2).ok).toBe(false);
  });

  it('rejects invalid topology', () => {
    const input = validInput({ topology: 'INVALID' as 'COMPLETE' });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
    const input2 = validInput({ topology: 'PARTIAL' as 'COMPLETE' });
    expect(produceM11TerminalEvidence(input2).ok).toBe(false);
  });

  it('rejects non-array reviews', () => {
    const input = validInput({ reviews: 'not-array' as unknown as [] });
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects missing candidateEpoch', () => {
    const input = { ...validInput(), candidateEpoch: null as unknown as CandidateEpoch };
    expect(produceM11TerminalEvidence(input).ok).toBe(false);
  });

  it('rejects tampered headCommit in envelopeSha256 recompute', () => {
    // Produce valid envelope
    const input = validInput();
    const result = produceM11TerminalEvidence(input);
    expect(result.ok).toBe(true);

    // Simulate tampering: change headCommit after production
    const tampered = { ...result.envelope!, headCommit: 'z'.repeat(40) };
    const { envelopeSha256: _, ...envWithoutSha } = tampered;
    const expectedSha = createHash('sha256').update(JSON.stringify(envWithoutSha, null, 2)).digest('hex');

    // Original SHA should NOT match tampered content
    expect(result.envelope!.envelopeSha256).not.toBe(expectedSha);
  });

  it('envelopeSha256 excludes itself (content-addressed)', () => {
    const input = validInput();
    const result = produceM11TerminalEvidence(input);
    expect(result.ok).toBe(true);

    // The SHA is computed over envelope fields WITHOUT envelopeSha256
    // Changing envelopeSha256 value does not affect the recomputed hash
    const { envelopeSha256: _, ...envWithoutSha } = result.envelope!;
    const recomputed = createHash('sha256').update(JSON.stringify(envWithoutSha, null, 2)).digest('hex');
    expect(recomputed).toBe(result.envelope!.envelopeSha256);
  });

  it('different content produces different envelopeSha256', () => {
    const r1 = produceM11TerminalEvidence(validInput());
    const r2 = produceM11TerminalEvidence(validInput({ headCommit: 'z'.repeat(40) }));
    expect(r1.envelope!.envelopeSha256).not.toBe(r2.envelope!.envelopeSha256);
  });

  it('envelope contains all required fields', () => {
    const result = produceM11TerminalEvidence(validInput());
    expect(result.ok).toBe(true);
    const env = result.envelope!;
    expect(env.headCommit).toBeDefined();
    expect(env.effectivePlanIdentity).toBeDefined();
    expect(env.envelopeSha256).toBeDefined();
    expect(env.observedAt).toBeDefined();
    expect(env.fresh).toBe(true);
    expect(env.ciSha).toBeDefined();
    expect(env.certifiedArtifactSha256).toBeDefined();
    expect(env.installedArtifactSha256).toBeDefined();
    expect(env.installedFrom).toBeDefined();
    expect(env.reconciliationHeadCommit).toBeDefined();
    expect(env.parity).toBe('COMPLETE');
    expect(env.topology).toBe('COMPLETE');
    expect(Array.isArray(env.reviews)).toBe(true);
    expect(env.candidate_epoch_hash).toBeDefined();
  });

  it('handles SKIPPED parity and topology', () => {
    const input = validInput({ parity: 'SKIPPED', topology: 'SKIPPED' });
    const result = produceM11TerminalEvidence(input);
    expect(result.ok).toBe(true);
    expect(result.envelope!.parity).toBe('SKIPPED');
    expect(result.envelope!.topology).toBe('SKIPPED');
  });

  it('handles reviews with content', () => {
    const reviews = [{ id: 'R-1', verdict: 'PASS', reviewer: 'harness', created_at: new Date().toISOString() }];
    const input = validInput({ reviews });
    const result = produceM11TerminalEvidence(input);
    expect(result.ok).toBe(true);
    expect(result.envelope!.reviews).toHaveLength(1);
    expect(result.envelope!.reviews[0].id).toBe('R-1');
  });
});

// ─── writeM11TerminalEvidence ────────────────────────────────────────────────

describe('writeM11TerminalEvidence', () => {
  function makeLedger(): string {
    const p = path.join(tmpDir, 'ledger.json');
    fs.writeFileSync(p, JSON.stringify({ plan_id: 'test-plan', headCommit: 'a'.repeat(40), effective_plan_identity: { sha256: 'b'.repeat(64) }, candidate_epoch: mkEpoch({ candidate_commit_or_tree: 'a'.repeat(40) }) }, null, 2) + '\n');
    return p;
  }

  it('writes envelope to ledger file', () => {
    const ledgerPath = makeLedger();
    const input = validInput();
    const result = writeM11TerminalEvidence(ledgerPath, input);
    expect(result.ok).toBe(true);

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(ledger.m11_terminal_evidence).toBeDefined();
    expect(ledger.m11_terminal_evidence.envelopeSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves existing ledger fields', () => {
    const ledgerPath = makeLedger();
    const input = validInput();
    writeM11TerminalEvidence(ledgerPath, input);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(ledger.plan_id).toBe('test-plan');
    expect(ledger.headCommit).toBeDefined();
    expect(ledger.effective_plan_identity).toBeDefined();
  });

  it('fails when ledger file missing', () => {
    // writeM11TerminalEvidence throws on ENOENT (no try-catch wrapper)
    expect(() => writeM11TerminalEvidence(path.join(tmpDir, 'nonexistent.json'), validInput())).toThrow('ENOENT');
  });

  it('fails when input invalid', () => {
    const ledgerPath = makeLedger();
    const input = validInput({ headCommit: '' });
    const result = writeM11TerminalEvidence(ledgerPath, input);
    expect(result.ok).toBe(false);
  });
});

// ─── loadM11TerminalEvidenceEnvelope (integration) ──────────────────────────

describe('loadM11TerminalEvidenceEnvelope', () => {
  function makeLedger(envelope: M11TerminalEvidenceEnvelope): Record<string, unknown> {
    return {
      plan_id: 'test-plan',
      headCommit: envelope.headCommit,
      effectivePlanIdentity: envelope.effectivePlanIdentity,
      effective_plan_identity: { sha256: envelope.effectivePlanIdentity },
      candidate_epoch: mkEpoch({ candidate_commit_or_tree: envelope.headCommit }),
      m11_terminal_evidence: envelope,
    };
  }

  it('loads valid envelope and returns ok:true', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const ledger = makeLedger(produceResult.envelope!);
    const loadResult = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(loadResult.ok).toBe(true);
    expect(loadResult.evidence).toBeDefined();
    expect(loadResult.evidence!.headCommit).toBe(input.headCommit);
  });

  it('rejects missing envelope', () => {
    const ledger = { plan_id: 'test' };
    const result = loadM11TerminalEvidenceEnvelope(ledger, 'a'.repeat(40));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('no engine-generated m11_terminal_evidence envelope');
  });

  it('rejects missing required field', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    const env = { ...produceResult.envelope! } as Partial<M11TerminalEvidenceEnvelope>;
    delete env.ciSha;
    const ledger = makeLedger(env as M11TerminalEvidenceEnvelope);
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('missing required field');
  });

  it('rejects headCommit mismatch with actual HEAD', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const ledger = makeLedger(produceResult.envelope!);
    const result = loadM11TerminalEvidenceEnvelope(ledger, 'z'.repeat(40));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('does not bind actual HEAD');
  });

  it('rejects tampered envelopeSha256', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const tamperedEnvelope = { ...produceResult.envelope!, envelopeSha256: '0'.repeat(64) };
    const ledger = makeLedger(tamperedEnvelope);
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('envelopeSha256 mismatch');
  });

  it('rejects tampered headCommit in envelope', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    // Tamper headCommit in envelope; loader detects mismatch at headCommit binding check (fires before candidate_epoch_hash)
    const tamperedEnvelope = { ...produceResult.envelope!, headCommit: 'z'.repeat(40) };
    const ledger = {
      plan_id: 'test-plan',
      headCommit: input.headCommit,
      effectivePlanIdentity: input.effectivePlanIdentity,
      effective_plan_identity: { sha256: input.effectivePlanIdentity },
      candidate_epoch: mkEpoch({ candidate_commit_or_tree: input.headCommit }),
      m11_terminal_evidence: tamperedEnvelope,
    };
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    // headCommit binding check fires before candidate_epoch_hash check
    expect(result.reason).toContain('headCommit');
    expect(result.reason).toContain('actual HEAD');
  });

  it('rejects effectivePlanIdentity mismatch', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const ledger = makeLedger(produceResult.envelope!);
    (ledger.effective_plan_identity as Record<string, unknown>).sha256 = 'z'.repeat(64);
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('effectivePlanIdentity does not bind');
  });

  it('rejects candidate_epoch_hash mismatch', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const ledger = makeLedger(produceResult.envelope!);
    const tamperedEnvelope = { ...produceResult.envelope!, candidate_epoch_hash: '0'.repeat(64) };
    (ledger as Record<string, unknown>).m11_terminal_evidence = tamperedEnvelope;
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('candidate_epoch_hash does not bind');
  });

  it('rejects tampered ciSha', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const tamperedEnvelope = { ...produceResult.envelope!, ciSha: 'z'.repeat(64) };
    const ledger = makeLedger(tamperedEnvelope);
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('envelopeSha256 mismatch');
  });

  it('rejects tampered parity', () => {
    const input = validInput({ parity: 'SKIPPED' });
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const tamperedEnvelope = { ...produceResult.envelope!, parity: 'COMPLETE' };
    const ledger = makeLedger(tamperedEnvelope);
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('envelopeSha256 mismatch');
  });

  it('rejects tampered reviews', () => {
    const input = validInput({ reviews: [] });
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    const tamperedEnvelope = { ...produceResult.envelope!, reviews: [{ id: 'INJECTED', verdict: 'PASS', reviewer: 'attacker' }] };
    const ledger = makeLedger(tamperedEnvelope);
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('envelopeSha256 mismatch');
  });

  it('rejects candidate_epoch with mismatched candidate_commit_or_tree (hash mismatch fires first)', () => {
    const input = validInput();
    const produceResult = produceM11TerminalEvidence(input);
    expect(produceResult.ok).toBe(true);
    // Ledger candidate_epoch has different candidate_commit_or_tree than envelope's epoch.
    // The loader detects candidate_epoch_hash mismatch before reaching candidate_commit_or_tree binding check.
    const ledger = {
      plan_id: 'test-plan',
      headCommit: input.headCommit,
      effectivePlanIdentity: input.effectivePlanIdentity,
      effective_plan_identity: { sha256: input.effectivePlanIdentity },
      candidate_epoch: mkEpoch({ candidate_commit_or_tree: 'z'.repeat(40) }),
      m11_terminal_evidence: produceResult.envelope!,
    };
    const result = loadM11TerminalEvidenceEnvelope(ledger, input.headCommit);
    expect(result.ok).toBe(false);
    // candidate_epoch_hash mismatch fires before candidate_commit_or_tree binding check
    expect(result.reason).toContain('candidate_epoch_hash');
  });
});
