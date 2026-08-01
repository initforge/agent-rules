import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { verifyTerminalGate, verifyMilestoneGate, assertCertifiable, assertNoResidualBeforeFinal, terminalGateCheck, assertWorkLedger, assertCertificationAttestation, finalizeM11, evaluateM11Terminal, REQUIRED_HOSTS, M10_TERMINAL_TOKEN, M11_TERMINAL_TOKEN, deriveM10ProofHash, type M11Evidence, type M11Checks } from '../src/terminal-gate.js';
import { loadM11TerminalEvidenceEnvelope } from '../src/m11-terminal-evidence.js';
import { HOST_ATTESTATION_EVIDENCE_ROLES, hostAttestationEvidenceRef, hostAttestationEvidenceSubjectSha256, type HostAttestation } from '../src/contracts.js';
import { candidateEpochHash, CANDIDATE_EPOCH_SCHEMA, type CandidateEpoch } from '../src/candidate-epoch.js';

const hash = 'a'.repeat(64);
const badHash = 'b'.repeat(64);
const issuedAtBase = new Date();
const expiresAtVal = new Date(issuedAtBase.getTime() + 3600_000).toISOString();
const issuedAtVal = issuedAtBase.toISOString();

function fullAttestation(host: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const value = {
    host,
    hostVersion: '1.0.0',
    commitSha: hash,
    capabilityStatus: 'HOST_NATIVE',
    capabilityIds: ['cap-1'],
    contractSetSha256: hash,
    requestedModel: 'gpt-4',
    resolvedModel: 'gpt-4',
    observedModel: 'gpt-4',
    nativeRunnerIdentity: 'runner-1',
    issuedAt: issuedAtVal,
    expiresAt: expiresAtVal,
  };
  const attestation = value as HostAttestation;
  return {
    ...value,
    evidenceRefs: HOST_ATTESTATION_EVIDENCE_ROLES.map((role) => {
      const evidenceSha256 = hashFor(`evidence:${host}:${role}`);
      return {
        role,
        host,
        commitSha: hash,
        evidenceRef: hostAttestationEvidenceRef(host as HostAttestation['host'], hash, role, evidenceSha256),
        evidenceSha256,
        subjectSha256: hostAttestationEvidenceSubjectSha256(role, attestation),
        observedAt: issuedAtVal,
      };
    }),
    ...overrides,
  };
}

function hashFor(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function stubLedger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const epoch = Date.now();
  const effectivePlanIdentity = 'e'.repeat(64);
  const reconciliationIds = Array.from({ length: 15 }, (_, i) => `REQ-${String(i + 1).padStart(3, '0')}`);
  const evidenceHashes = Array.from({ length: 15 }, (_, i) => hashFor(`m95-evidence-${i}`));
  const evidence = evidenceHashes.map((evidenceHash) => ({ identity: effectivePlanIdentity, fresh: true, observedAt: new Date(epoch).toISOString(), evidenceHash }));
  const ledger: Record<string, unknown> = {
    status: 'COMPLETED',
    execution_state: M10_TERMINAL_TOKEN,
    findings: [],
    orphanFindings: [],
    reconciliations: reconciliationIds.map((requirementId) => ({ requirementId, status: 'MATCH', headCommit: hash, detail: `HEAD ${hash.slice(0, 12)}` })),
    effective_plan_identity: { sha256: effectivePlanIdentity },
    milestones: { 'M9.5': { identity: effectivePlanIdentity, reviewerIdentity: 'final-reviewer', epoch, observedAt: new Date(epoch).toISOString(), evidence } },
    attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('opencode'),
      fullAttestation('antigravity'),
    ],
    plan_anchors: Array.from({ length: 25 }, (_, i) => ({ requirementId: `REQ-${String(i + 1).padStart(3, '0')}` })),
    amendments: [],
    shadowRevision: 1,
    latestShadowRevision: 1,
    latestReview: {
      reviewId: 'R1',
      stale: false,
      originalSha256: hash,
      amendmentsSha256: hash,
      diffFingerprint: hash,
      receiptEvidenceFingerprint: hash,
      evidenceHashes: [hash],
      shadowRevision: 1,
      reviewerIdentity: 'final-reviewer',
    },
    headCommit: hash,
    commitSha: hash,
    ci_checks: [{ passed: true, runUrl: 'https://github.com/initforge/agent-rules/actions/runs/1', repository: 'initforge/agent-rules', workflow: 'CI', check: 'quality', commitSha: hash }],
    plan: {
      original: {
        artifactId: 'PLAN-001',
        sha256: hash,
        bytes: 100,
        status: 'ADOPTED',
      },
    },
  };
  (ledger as any).m10Proof = { headCommit: hash, effectivePlanIdentity, reviewerIdentity: 'final-reviewer', epoch, reconciliationIds, evidenceHashes };
  (ledger as any).m10Proof.proofHash = deriveM10ProofHash({ headCommit: hash, effectivePlanIdentity, reconciliationIds, evidenceHashes, epoch });
  Object.assign(ledger, overrides);
  return ledger;
}

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')); }
function writeFile(p: string, content: string): string { fs.writeFileSync(p, content, 'utf-8'); return p; }

// ── M11 terminal emission (finalizeM11) fixtures ─────────────────────────────

function makeEpoch(overrides: Partial<CandidateEpoch> = {}): CandidateEpoch {
  return {
    schema: CANDIDATE_EPOCH_SCHEMA,
    source_tree_sha: 'b'.repeat(40),
    candidate_commit_or_tree: hash,
    artifact_digest: hash,
    container_image_digests: [],
    dependency_lock_hash: 'c'.repeat(64),
    migration_set_hash: 'd'.repeat(64),
    environment_hash: 'e'.repeat(64),
    fixture_hash: 'f'.repeat(64),
    topology_hash: 'g'.repeat(64),
    created_at: new Date().toISOString(),
    build_critical_manifest: [],
    notes: {},
    ...overrides,
  };
}

function eligibleM11Fixture(overrides: Record<string, unknown> = {}): { ledger: Record<string, unknown>; evidence: M11Evidence; checks: M11Checks; epoch: CandidateEpoch } {
  const effectivePlanIdentity = 'e'.repeat(64);
  const epoch = makeEpoch();
  const ledger = stubLedger({ execution_state: 'EXECUTING', status: 'EXECUTING', candidate_epoch: epoch, ...overrides });
  const evidence: M11Evidence = {
    headCommit: hash,
    effectivePlanIdentity,
    envelopeSha256: hash,
    observedAt: new Date().toISOString(),
    fresh: true,
    ciSha: hash,
    certifiedArtifactSha256: hash,
    installedArtifactSha256: hash,
    installedFrom: 'certified-local-main',
    reconciliationHeadCommit: hash,
    parity: 'COMPLETE',
    topology: 'COMPLETE',
    reviews: [
      { dimension: 'architecture', accepted: true, reviewId: 'R1', stale: false },
      { dimension: 'security', accepted: true, reviewId: 'R2', stale: false },
      { dimension: 'maintainability', accepted: true, reviewId: 'R3', stale: false },
      { dimension: 'UX', accepted: true, reviewId: 'R4', stale: false },
      { dimension: 'operations', accepted: true, reviewId: 'R5', stale: false },
    ],
    candidate_epoch_hash: candidateEpochHash(epoch),
  };
  const checks: M11Checks = {
    requirements: [{ requirement_id: 'REQ-001', status: 'MATCH' }],
    scorecard: [{ id: 'arch', score: 9, status: 'VERIFIED' }],
    waitingGates: [],
  };
  return { ledger, evidence, checks, epoch };
}

describe('finalizeM11 (engine-owned M11 terminal emission)', () => {
  it('writes the token, audit event, and regenerated shadows only when all 12 gates pass', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture();
    const shadowDir = path.join(dir, 'shadow');
    fs.mkdirSync(shadowDir);
    fs.writeFileSync(path.join(shadowDir, 'tasks.md'), 'shadow tasks');
    ledger.shadow_hashes = { 'tasks.md': 'x'.repeat(64) };
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    expect(evaluateM11Terminal(ledger, evidence, checks).passed).toBe(true);

    const result = finalizeM11({ ledgerPath, evidence, checks, shadowDir });
    expect(result.passed).toBe(true);
    expect(result.token).toBe(M11_TERMINAL_TOKEN);

    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as Record<string, any>;
    expect(raw.execution_state).toBe(M11_TERMINAL_TOKEN);
    expect(raw.audit_events.at(-1).type).toBe('M11_TERMINAL_FINALIZE');
    expect(raw.shadowRevision).toBe((ledger.shadowRevision as number) + 1);
    // shadows regenerated from disk, not carried over
    const expected = createHash('sha256').update('shadow tasks').digest('hex');
    expect(raw.shadow_hashes['tasks.md']).toBe(expected);
  });

  it('refuses and mutates nothing when a gate fails', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture({ findings: [{ finding_id: 'F-1', status: 'OPEN' }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const before = fs.readFileSync(ledgerPath, 'utf-8');

    const result = finalizeM11({ ledgerPath, evidence, checks });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('M11_NO_OPEN_FINDINGS');
    expect(fs.readFileSync(ledgerPath, 'utf-8')).toBe(before);
  });

  it('refuses when the M10 marker is still present (HISTORICAL_STALE_FOR_M11)', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture({
      execution_state: M10_TERMINAL_TOKEN,
      terminalMarker: M10_TERMINAL_TOKEN,
      terminalMarkerStatus: 'HISTORICAL_STALE_FOR_M11',
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const before = fs.readFileSync(ledgerPath, 'utf-8');

    const result = finalizeM11({ ledgerPath, evidence, checks });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('M11_EXECUTION_STATE_OK');
    expect(fs.readFileSync(ledgerPath, 'utf-8')).toBe(before);
  });

  it('missing ledger returns not-eligible without throwing', () => {
    const { evidence, checks } = eligibleM11Fixture();
    const result = finalizeM11({ ledgerPath: '/nonexistent/ledger.json', evidence, checks });
    expect(result.passed).toBe(false);
  });

  it('requires a bound immutable candidate epoch (fail-closed)', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture();
    delete ledger.candidate_epoch;
    (evidence as M11Evidence).candidate_epoch_hash = undefined;
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const before = fs.readFileSync(ledgerPath, 'utf-8');

    const gate = evaluateM11Terminal(ledger, evidence, checks);
    expect(gate.passed).toBe(false);
    expect(gate.failedGates).toContain('M11_CANDIDATE_EPOCH_BOUND');

    const result = finalizeM11({ ledgerPath, evidence, checks });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('M11_CANDIDATE_EPOCH_BOUND');
    expect(fs.readFileSync(ledgerPath, 'utf-8')).toBe(before);
  });

  it('rejects evidence that does not bind the candidate epoch hash', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture();
    evidence.candidate_epoch_hash = 'f'.repeat(64);
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const gate = evaluateM11Terminal(ledger, evidence, checks);
    expect(gate.passed).toBe(false);
    expect(gate.failedGates).toContain('M11_CANDIDATE_EPOCH_BOUND');
  });

  it('rejects a candidate epoch that does not bind the exact HEAD', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture();
    ledger.candidate_epoch = makeEpoch({ candidate_commit_or_tree: 'c'.repeat(40) });
    (evidence as M11Evidence).candidate_epoch_hash = candidateEpochHash(ledger.candidate_epoch as CandidateEpoch);
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const gate = evaluateM11Terminal(ledger, evidence, checks);
    expect(gate.passed).toBe(false);
    expect(gate.failedGates).toContain('M11_CANDIDATE_EPOCH_BOUND');
  });

  it('rejects a stale candidate epoch', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture();
    ledger.candidate_epoch = makeEpoch({ created_at: '2020-01-01T00:00:00.000Z' });
    (evidence as M11Evidence).candidate_epoch_hash = candidateEpochHash(ledger.candidate_epoch as CandidateEpoch);
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const gate = evaluateM11Terminal(ledger, evidence, checks);
    expect(gate.passed).toBe(false);
    expect(gate.failedGates).toContain('M11_CANDIDATE_EPOCH_BOUND');
  });

  it('rejects an incomplete candidate epoch', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks } = eligibleM11Fixture();
    const partial = makeEpoch() as Partial<CandidateEpoch>;
    delete partial.dependency_lock_hash;
    ledger.candidate_epoch = partial;
    (evidence as M11Evidence).candidate_epoch_hash = candidateEpochHash(partial as CandidateEpoch);
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const gate = evaluateM11Terminal(ledger, evidence, checks);
    expect(gate.passed).toBe(false);
    expect(gate.failedGates).toContain('M11_CANDIDATE_EPOCH_BOUND');
  });

  it('persists the candidate epoch into the ledger on finalize', () => {
    const dir = tmpDir();
    const { ledger, evidence, checks, epoch } = eligibleM11Fixture();
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = finalizeM11({ ledgerPath, evidence, checks });
    expect(result.passed).toBe(true);
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as Record<string, any>;
    expect(raw.candidate_epoch.candidate_commit_or_tree).toBe(epoch.candidate_commit_or_tree);
    expect(raw.audit_events.at(-1).summary).toContain(candidateEpochHash(epoch).slice(0, 12));
  });
});

describe('loadM11TerminalEvidenceEnvelope (engine-generated ledger envelope)', () => {
  // ponytail: real envelopeSha256 via computeEnvelopeSha256 — mirrors the loader's
  // computeEnvelopeSha256. Skipped: envelope tampering detection (tested by
  // negative cases). Add when loading from a write-producer path.
  function computeEnvelopeSha256(env: Record<string, unknown>): string {
    const { envelopeSha256: _drop, ...rest } = env;
    return createHash('sha256').update(JSON.stringify(rest, null, 2)).digest('hex');
  }

  function envelopeLedger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const { ledger, evidence, epoch } = eligibleM11Fixture();
    // Build envelope with real envelopeSha256 (AM-0020 §4): the content hash of all
    // envelope fields except envelopeSha256 itself.  The loader recomputes and rejects
    // any mismatch (forged/stale envelope = fail-closed).
    const envBase = { ...evidence, candidate_epoch_hash: candidateEpochHash(epoch) };
    delete (envBase as any).envelopeSha256; // strip decorative placeholder
    const envelope = { ...envBase, envelopeSha256: computeEnvelopeSha256(envBase) };
    (ledger as any).m11_terminal_evidence = envelope;
    return { ...ledger, ...overrides };
  }

  it('binds a complete envelope: headCommit/identity/epoch hash all match', () => {
    const ledger = envelopeLedger();
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.headCommit).toBe(hash);
      expect(result.evidence.effectivePlanIdentity).toBe('e'.repeat(64));
      expect(result.evidence.candidate_epoch_hash).toBe(candidateEpochHash(ledger.candidate_epoch as CandidateEpoch));
      expect(result.evidence.parity).toBe('COMPLETE');
    }
  });

  it('rejects when the ledger has no m11_terminal_evidence envelope', () => {
    const { ledger } = eligibleM11Fixture();
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('m11_terminal_evidence');
  });

  it('rejects an incomplete envelope missing a required field', () => {
    const ledger = envelopeLedger();
    delete (ledger as any).m11_terminal_evidence.installedArtifactSha256;
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('installedArtifactSha256');
  });

  it('rejects an envelope whose headCommit does not bind the ledger HEAD', () => {
    const ledger = envelopeLedger();
    (ledger as any).m11_terminal_evidence.headCommit = badHash;
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('headCommit');
  });

  it('rejects an envelope whose effectivePlanIdentity does not bind the ledger identity', () => {
    const ledger = envelopeLedger();
    (ledger as any).m11_terminal_evidence.effectivePlanIdentity = 'f'.repeat(64);
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('effectivePlanIdentity');
  });

  it('rejects a candidate_epoch_hash that does not match candidateEpochHash(ledger.candidate_epoch)', () => {
    const ledger = envelopeLedger();
    (ledger as any).m11_terminal_evidence.candidate_epoch_hash = 'f'.repeat(64);
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('candidate_epoch_hash');
  });

  it('rejects when the ledger has no candidate_epoch to bind', () => {
    const ledger = envelopeLedger();
    delete (ledger as any).candidate_epoch;
    const result = loadM11TerminalEvidenceEnvelope(ledger, hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('candidate_epoch');
  });
});

describe('verifyTerminalGate', () => {
  it('rejects tampered original → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ plan: { original: { artifactId: 'PLAN-001', sha256: hash, status: 'TAMPERED', tampered: true } } });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('ORIGINAL_NOT_TAMPERED');
  });

  it('rejects missing AC evidence → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ amendments: [{ id: 'am1', sha256: null, content: null }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
  });

  it('rejects stale shadow → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ shadowRevision: 1, latestShadowRevision: 3 });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('SHADOW_NOT_STALE');
  });

  it('rejects stale review → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ latestReview: { reviewId: 'R1', stale: true } });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('REVIEW_NOT_STALE');
  });

  it('rejects wrong HEAD → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ headCommit: badHash, commitSha: badHash });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('HEAD_MATCH');
  });

  it('rejects non-native host → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('opencode'),
      fullAttestation('unknown-llm'),
    ] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('NO_NON_NATIVE_HOST');
  });

  it('rejects absent GitHub CI → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('passes all conditions met → PASS', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(true);
    expect(result.failedGates).toEqual([]);
  });

  it.each([
    ['forged reviewer', { reviewerIdentity: 'forged' }],
    ['stale epoch', { epoch: 0 }],
    ['forged identity', { identity: 'f'.repeat(64) }],
  ])('rejects M9.5 %s', (_name, patch) => {
    const dir = tmpDir();
    const base = stubLedger() as any;
    const ledger = stubLedger({ milestones: { 'M9.5': { ...base.milestones['M9.5'], ...patch } }, m10Proof: undefined });
    const result = verifyTerminalGate(writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger)), hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('M9_5_CANONICAL_GATE');
  });

  it.each([
    ['duplicate reconciliation IDs', (p: any) => ({ ...p, reconciliationIds: [...p.reconciliationIds.slice(0, 14), p.reconciliationIds[0]] })],
    ['wrong proof hash', (p: any) => ({ ...p, proofHash: badHash })],
    ['mismatched HEAD', (p: any) => ({ ...p, headCommit: badHash })],
  ])('rejects forged M10 proof: %s', (_name, mutate) => {
    const dir = tmpDir();
    const base = stubLedger() as any;
    const ledger = stubLedger({ m10Proof: mutate(base.m10Proof) });
    const result = verifyTerminalGate(writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger)), hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('M10_PROOF_BINDING');
  });

  it('rejects nonterminal state', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ execution_state: 'NEEDS_REMEDIATION', status: 'NEEDS_REMEDIATION' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('EXECUTION_STATE_COMPLETED');
  });

  it('rejects fake M8 pass with non-created marker', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ execution_state: 'NEEDS_REMEDIATION', status: 'NEEDS_REMEDIATION', milestones: { M8: { status: 'INTERNAL_READY' } } });
    const result = verifyTerminalGate(writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger)), hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('M8_CANONICAL_GATE');
  });

  it('rejects M8 evidence with forged identity or stale freshness', () => {
    const identity = 'i'.repeat(64);
    const requirement = { id: 'M8-REQ-1', status: 'MATCH', evidence: [{ identity: 'forged', fresh: false, observedAt: new Date().toISOString() }] };
    const ledger = { milestones: { M8: { requirements: [requirement], scorecard: { dimensions: Array.from({ length: 18 }, () => ({ score: 8 })) } } }, effective_plan_identity: { sha256: identity } };
    expect(verifyMilestoneGate(ledger, 'M8', identity).passed).toBe(false);
  });

  it('accepts M8 only with all requirements, scorecard, identity, and fresh evidence', () => {
    const identity = 'i'.repeat(64);
    const evidence = { identity, fresh: true, observedAt: new Date().toISOString() };
    const ledger = { milestones: { M8: { requirements: Array.from({ length: 15 }, (_, i) => ({ id: `M8-${i}`, status: 'MATCH', evidence: [evidence] })), scorecard: { dimensions: Array.from({ length: 18 }, () => ({ score: 8 })) } } }, effective_plan_identity: { sha256: identity } };
    expect(verifyMilestoneGate(ledger, 'M8').passed).toBe(true);
  });

  it('recognizes only the exact M10 terminal token', () => {
    expect(verifyMilestoneGate({ execution_state: 'M10_COMPLETE' }, 'M10').passed).toBe(false);
    expect(verifyMilestoneGate({ execution_state: M10_TERMINAL_TOKEN }, 'M10').passed).toBe(true);
  });

  it('rejects open findings', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ findings: [{ finding_id: 'F-001', status: 'OPEN' }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('NO_OPEN_FINDINGS');
  });

  it('requires exactly codex, claude, grok, opencode, and antigravity', () => {
    expect(REQUIRED_HOSTS).toEqual(['codex', 'claude', 'grok', 'opencode', 'antigravity']);
    expect(REQUIRED_HOSTS).not.toContain('cursor');
    expect(REQUIRED_HOSTS).toContain('antigravity');
  });

  it('rejects when attestations < 5', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: [fullAttestation('codex')] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('rejects when attestations do not bind HEAD', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: REQUIRED_HOSTS.map((host) => fullAttestation(host, { commitSha: badHash })) });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('handles missing ledger gracefully', () => {
    const result = terminalGateCheck('/nonexistent/ledger.json', hash);
    expect(result.passed).toBe(false);
  });

  it('rejects NOT_INSTALLED attestation', () => {
    const dir = tmpDir();
    const attestations = REQUIRED_HOSTS.map((host) =>
      fullAttestation(host, { capabilityStatus: host === 'codex' ? 'NOT_INSTALLED' : 'HOST_NATIVE' }),
    );
    const ledger = stubLedger({ attestations });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('rejects NOT_INSTALLED_NOT_REQUIRED attestation', () => {
    const dir = tmpDir();
    const attestations = REQUIRED_HOSTS.map((host) =>
      fullAttestation(host, { capabilityStatus: host === 'codex' ? 'NOT_INSTALLED_NOT_REQUIRED' : 'HOST_NATIVE' }),
    );
    const ledger = stubLedger({ attestations });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('rejects EMULATED attestation', () => {
    const dir = tmpDir();
    const attestations = REQUIRED_HOSTS.map((host) =>
      fullAttestation(host, { capabilityStatus: host === 'opencode' ? 'EMULATED' : 'HOST_NATIVE' }),
    );
    const ledger = stubLedger({ attestations });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('rejects wrong original SHA', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const wrongBytes = new TextEncoder().encode('wrong original content');
    const result = verifyTerminalGate(ledgerPath, hash, wrongBytes);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('ORIGINAL_SHA_MATCH');
  });

  it('rejects missing shadow hash', () => {
    const dir = tmpDir();
    const ledger = stubLedger({
      shadowHashes: { 'tasks.md': hash },
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const wrongShadowBytes: Record<string, Uint8Array> = {
      'tasks.md': new TextEncoder().encode('wrong shadow content'),
    };
    const result = verifyTerminalGate(ledgerPath, hash, new TextEncoder().encode('original'), wrongShadowBytes);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('SHADOW_HASHES_MATCH');
  });

  it('rejects local-only CI runUrl', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: 'local://ci', repository: 'r', workflow: 'w', check: 'c', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects empty CI runUrl', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: '', repository: 'r', workflow: 'w', check: 'c', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects CI check without passed boolean', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ status: 'PASS', runUrl: 'https://github.com/x/actions/runs/1', repository: 'r', workflow: 'w', check: 'c', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects repository not matching runUrl', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: 'https://github.com/initforge/agent-rules/actions/runs/1', repository: 'other/repo', workflow: 'w', check: 'c', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects missing workflow field in CI', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: 'https://github.com/x/actions/runs/1', repository: 'x', check: 'c', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects missing check field in CI', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: 'https://github.com/x/actions/runs/1', repository: 'x', workflow: 'w', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects non-GitHub runUrl in CI', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: 'https://ci.example.com/run/1', repository: 'r', workflow: 'w', check: 'c', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('rejects CI commitSha not matching HEAD', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_checks: [{ passed: true, runUrl: 'https://github.com/initforge/agent-rules/actions/runs/1', repository: 'initforge/agent-rules', workflow: 'CI', check: 'quality', commitSha: 'c'.repeat(64) }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('GITHUB_CI_PASSED');
  });

  it('passes with proper CI checks', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(true);
  });

  it('rejects empty headCommit in ledger', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ headCommit: '', commitSha: '' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('HEAD_MATCH');
  });
});

describe('assertCertifiable', () => {
  it('throws on failure', () => {
    const result = verifyTerminalGate('/nonexistent', hash);
    expect(() => assertCertifiable(result)).toThrow();
  });

  it('passes on success', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(() => assertCertifiable(result)).not.toThrow();
  });
});

describe('assertNoResidualBeforeFinal', () => {
  it('blocks when residual exists', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ execution_state: 'NEEDS_REMEDIATION' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    expect(() => assertNoResidualBeforeFinal(ledgerPath, hash)).toThrow();
  });

  it('transitions to needs-remediation on bypass attempt', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ execution_state: 'ADOPTED' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    try { assertNoResidualBeforeFinal(ledgerPath, hash); } catch {}
    const reloaded = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(reloaded.execution_state).toBe('NEEDS_REMEDIATION');
  });

  it('passes after repair', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    expect(() => assertNoResidualBeforeFinal(ledgerPath, hash)).not.toThrow();
  });
});

describe('terminalGateCheck', () => {
  it('returns passed when no residual', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = terminalGateCheck(ledgerPath, hash);
    expect(result.passed).toBe(true);
  });

  it('returns failed when open findings exist', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ findings: [{ finding_id: 'F-001', status: 'OPEN' }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = terminalGateCheck(ledgerPath, hash);
    expect(result.passed).toBe(false);
  });

  it('returns failed when ledger in incomplete state', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ execution_state: 'NEEDS_REMEDIATION' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = terminalGateCheck(ledgerPath, hash);
    expect(result.passed).toBe(false);
  });

  it('handles missing ledger gracefully', () => {
    const result = terminalGateCheck('/nonexistent/ledger.json', hash);
    expect(result.passed).toBe(false);
  });
});

describe('assertWorkLedger', () => {
  it('rejects tampered status', () => {
    const ledger = stubLedger({ status: 'TAMPERED', execution_state: 'TAMPERED' });
    expect(() => assertWorkLedger(ledger)).toThrow('TAMPERED');
  });

  it('rejects tampered original', () => {
    const ledger = stubLedger({ plan: { original: { artifactId: 'PLAN-001', sha256: hash, status: 'TAMPERED', tampered: true } } });
    expect(() => assertWorkLedger(ledger)).toThrow('TAMPERED');
  });

  it('rejects missing original artifact', () => {
    const ledger = stubLedger({ plan: {}, original_artifact: undefined });
    expect(() => assertWorkLedger(ledger)).toThrow('missing original');
  });

  it('rejects missing amendments array', () => {
    const ledger = stubLedger({ amendments: undefined });
    expect(() => assertWorkLedger(ledger)).toThrow('amendments');
  });

  it('passes valid ledger', () => {
    const ledger = stubLedger({});
    expect(() => assertWorkLedger(ledger)).not.toThrow();
  });
});

describe('assertCertificationAttestation', () => {
  it('rejects missing attestations', () => {
    const ledger = stubLedger({ attestations: [] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow('no attestations');
  });

  it('rejects missing host', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('antigravity'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow(/expected 5.*got 4/);
  });

  it('rejects empty commitSha', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok', { commitSha: '' }),
      fullAttestation('opencode'),
      fullAttestation('antigravity'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow('empty commitSha');
  });

  it('rejects null field in attestation (all 5 hosts present)', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex', { hostVersion: null }),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('opencode'),
      fullAttestation('antigravity'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow(/null\/empty/);
  });

  it('rejects duplicate attestation for same host', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('opencode'),
      fullAttestation('antigravity'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow(/duplicate/);
  });

  it('rejects extra host beyond required five', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('opencode'),
      fullAttestation('antigravity'),
      fullAttestation('cursor'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow(/unexpected.*cursor/);
  });

  it('rejects wrong attestation count', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow(/expected 5.*got 3/);
  });

  it('rejects wrong HEAD binding', () => {
    const ledger = stubLedger({ attestations: [
      fullAttestation('codex'),
      fullAttestation('claude'),
      fullAttestation('grok'),
      fullAttestation('opencode', { commitSha: 'c'.repeat(64) }),
      fullAttestation('antigravity'),
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow('HEAD');
  });

  it('passes valid attestations', () => {
    const ledger = stubLedger({});
    expect(() => assertCertificationAttestation(ledger, hash)).not.toThrow();
  });
});
