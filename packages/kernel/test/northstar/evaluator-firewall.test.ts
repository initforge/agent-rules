/**
 * Evaluator Firewall & Gemini Anti-Regression Negative Controls (P0 Gate)
 * 
 * Verifies that the evaluator fails closed and rejects:
 * 1. Self-authored / worker-authored PASS
 * 2. Catch-to-PASS on verifier throw, timeout, or non-zero exit
 * 3. Stale, future-dated, foreign, or forged evidence
 * 4. Evidence envelope hash tampering and chain breaks
 * 5. Artifact path traversal escaping repository
 * 6. Artifact hash mismatches
 * 7. Fake live certifications on absent/failing hosts
 * 8. Forbidden scope violations
 * 9. Missing mandatory claims / untraceable packets
 * 10. Test-only evidence masquerading as live/operational evidence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  EvidenceLedger,
  deriveAcceptance,
  type EvidenceBinding,
} from '../../src/northstar/evidence-ledger.js';
import { auditAcceptance } from '../../src/northstar/acceptance-audit.js';
import {
  assertClosureIntegrity,
  closureResidue,
} from '../../src/northstar/closure-transaction.js';
import {
  hostCapabilityAttestationV2,
  probeHostCapabilities,
  decideEnforcement,
  unprobedAttestation,
  type CapabilityCertification,
} from '../../src/northstar/host-capabilities.js';
import { runHostCanary } from '../../src/northstar/host-canary.js';
import { resolveHarnessRoot } from '../../src/northstar/domain-packs.js';
import type {
  EvidenceRecord,
  TaskPacket,
  WorkRequest,
  WorkSpec,
} from '../../src/northstar/protocol.js';
import type { TraceabilityManifest } from '../../src/northstar/compiler.js';

let tmpDir: string;
const harnessRoot = resolveHarnessRoot(process.cwd());

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'firewall-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup lock on Windows
  }
});

function baseRequest(): WorkRequest {
  return {
    protocol_version: '2.0',
    work_id: 'W-firewall',
    raw_intent: 'implement secure feature',
    source: 'cli',
  };
}

function baseSpec(): WorkSpec {
  return {
    protocol_version: '2.0',
    spec_id: 'S-firewall',
    revision: 1,
    work_id: 'W-firewall',
    requirements: [
      { id: 'R-001', statement: 'feature works', mandatory: true, claims: ['C-001'] },
    ],
  };
}

function basePackets(): TaskPacket[] {
  return [
    {
      protocol_version: '2.0',
      task_id: 'T-001',
      spec_id: 'S-firewall',
      spec_revision: 1,
      work_id: 'W-firewall',
      goal: 'implement secure feature',
      requirements: ['R-001'],
      scope: { owned: ['src/feature.ts'], forbidden: ['config/secrets.json'] },
      acceptance: [{ claim_id: 'C-001', verifier_id: 'v-test' }],
    },
  ];
}

function baseManifest(): TraceabilityManifest {
  return {
    spec_id: 'S-firewall',
    spec_revision: 1,
    work_id: 'W-firewall',
    requirements: [{ id: 'R-001', statement: 'feature works', mandatory: true, claims: ['C-001'] }],
    claims: [{ claim_id: 'C-001', statement: 'feature passes test', required_kinds: ['test'] }],
    tasks: basePackets(),
  };
}

function baseBinding(): EvidenceBinding {
  return {
    spec_id: 'S-firewall',
    spec_revision: 1,
    candidate_epoch: 1,
    platform: 'test-host',
    now_ms: Date.now(),
    freshness_ms: 60_000,
  };
}

describe('Negative Control 1 — Worker Never Authors PASS', () => {
  it('rejects completion with empty evidence even if worker claims completion', () => {
    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: [],
    });
    expect(acceptance.outcome).not.toBe('PASS');
    expect(acceptance.unresolved_claims).toContain('C-001');
  });

  it('rejects closure if evidence_derived_pass is false', () => {
    const closureCheck = assertClosureIntegrity({
      evidence_derived_pass: false,
      intent_spec_implementation_reconciled: true,
      scope_and_verification_integrity: true,
      no_required_evidence_purged: true,
      no_referenced_artifact_purged: true,
      no_unresolved_work_purged: true,
    });
    expect(closureCheck.pass).toBe(false);
    expect(closureCheck.failures).toContain('evidence_derived_pass');
  });
});

describe('Negative Control 2 — Catch-to-PASS Rejection (Verifier Throw / Timeout / Nonzero)', () => {
  it('verifier failure status fails closed as FAILED', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const failRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-fail',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'fail',
      observed_at: new Date().toISOString(),
      verifier_id: 'v-test',
      spec_id: 'S-firewall',
      spec_revision: 1,
      candidate_epoch: 1,
      platform: 'test-host',
    };

    ledger.append(failRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
    });

    expect(acceptance.outcome).toBe('FAILED');
    expect(acceptance.failed_claims).toContain('C-001');
  });

  it('verifier timeout/blocked status fails closed as BLOCKED, never PASS', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const blockedRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-blocked',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'blocked',
      observed_at: new Date().toISOString(),
      verifier_id: 'v-test',
      spec_id: 'S-firewall',
      spec_revision: 1,
      candidate_epoch: 1,
      platform: 'test-host',
    };

    ledger.append(blockedRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
    });

    expect(acceptance.outcome).toBe('BLOCKED');
    expect(acceptance.unresolved_claims).toContain('C-001');
  });
});

describe('Negative Control 3 — Stale, Foreign, and Forged Evidence Rejection', () => {
  it('excludes stale evidence outside the freshness window', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const now = Date.now();
    const staleTime = new Date(now - 120_000).toISOString(); // 2 mins ago

    const record: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-stale',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      observed_at: staleTime,
      verifier_id: 'v-test',
      spec_id: 'S-firewall',
      spec_revision: 1,
      candidate_epoch: 1,
      platform: 'test-host',
    };

    ledger.append(record, 'verifier');

    const binding: EvidenceBinding = {
      ...baseBinding(),
      now_ms: now,
      freshness_ms: 60_000, // 1 min freshness window
    };

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      binding,
    });

    expect(acceptance.outcome).not.toBe('PASS');
    expect(acceptance.reasons.some((r) => r.includes('stale, foreign, or missing runtime binding'))).toBe(true);
  });

  it('excludes future-dated evidence beyond safety skew', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const now = Date.now();
    const futureTime = new Date(now + 120_000).toISOString(); // 2 mins in the future

    const record: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-future',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      observed_at: futureTime,
      verifier_id: 'v-test',
      spec_id: 'S-firewall',
      spec_revision: 1,
      candidate_epoch: 1,
      platform: 'test-host',
    };

    ledger.append(record, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      binding: { ...baseBinding(), now_ms: now },
    });

    expect(acceptance.outcome).not.toBe('PASS');
  });

  it('excludes evidence with mismatched candidate_epoch or spec_id', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const foreignRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-foreign',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      observed_at: new Date().toISOString(),
      verifier_id: 'v-test',
      spec_id: 'S-DIFFERENT',
      spec_revision: 1,
      candidate_epoch: 999,
      platform: 'test-host',
    };

    ledger.append(foreignRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      binding: baseBinding(),
    });

    expect(acceptance.outcome).not.toBe('PASS');
  });
});

describe('Negative Control 4 — Evidence Ledger Hash Tamper & Chain Integrity', () => {
  it('throws on tampered previous_hash or corrupted envelope line', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const r1: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-001',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      verifier_id: 'v-1',
    };
    ledger.append(r1, 'verifier');

    // Tamper with ledger file
    const content = fs.readFileSync(ledgerFile, 'utf8');
    const envelope = JSON.parse(content.trim());
    envelope.envelope_hash = 'f'.repeat(64); // Tamper hash
    fs.writeFileSync(ledgerFile, `${JSON.stringify(envelope)}\n`);

    expect(() => ledger.read()).toThrow(/evidence envelope hash mismatch/);
    const verification = ledger.verify();
    expect(verification.ok).toBe(false);
  });
});

describe('Negative Control 5 — Artifact Path Traversal & Hash Mismatch', () => {
  it('rejects evidence whose artifact path escapes repository root', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const record: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-escape',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      artifact_path: '../outside.txt',
      sha256: 'a'.repeat(64),
      verifier_id: 'v-1',
    };

    expect(() => ledger.append(record, 'verifier')).toThrow(/escapes repository/);
  });

  it('rejects evidence whose artifact file hash does not match claimed sha256', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const testFile = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(testFile, 'real content\n');

    const record: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-tamper',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      artifact_path: 'file.txt',
      sha256: '0'.repeat(64), // Bogus hash
      verifier_id: 'v-1',
    };

    expect(() => ledger.append(record, 'verifier')).toThrow(/hash mismatch/);
  });
});

describe('Negative Control 6 — Fake Live Certification Rejection', () => {
  it('unprobed host cannot be assumed live and blocks execution', () => {
    const unprobed = unprobedAttestation('cursor');
    const enforcement = decideEnforcement({
      host: 'cursor',
      attestation: unprobed,
      effects: ['filesystem_mutation'],
      broker_manages_effect: false,
      worktree_available: false,
    });
    expect(enforcement.layer).toBe('blocked');
  });

  it('host canary downgrades state on probe error, never emits fake green', () => {
    const failedProbe = runHostCanary({
      repoRoot: harnessRoot,
      host: 'claude',
      probe: { ok: false, error: 'synthetic probe failure' },
    });
    expect(failedProbe.state).toBe('NOT_LIVE_VERIFIED');
    expect(failedProbe.facts.certifications.every((c) => c.certification_state === 'NOT_LIVE_VERIFIED')).toBe(true);
  });
});

describe('Negative Control 7 — Forbidden Scope Violations Fail Closed', () => {
  it('forbidden-scope violation produces hard FAILED outcome even if all verifiers pass', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const passRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-pass',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      verifier_id: 'v-test',
      spec_id: 'S-firewall',
      spec_revision: 1,
      candidate_epoch: 1,
      platform: 'test-host',
    };
    ledger.append(passRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      scopeViolations: ['config/secrets.json'],
    });

    expect(acceptance.outcome).toBe('FAILED');
    expect(acceptance.reasons.some((r) => r.includes('forbidden-scope violation'))).toBe(true);
  });
});

describe('Negative Control 8 — Test-Only Evidence Cannot Prove Live Claims (AM-0005)', () => {
  it('rejects TEST_VERIFIED evidence for claims requiring LIVE_OBSERVED stage', () => {
    const ledgerFile = path.join(tmpDir, 'ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, tmpDir);

    const testRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-test',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      verifier_id: 'v-test',
      evidence_stage: 'TEST_VERIFIED',
    };
    ledger.append(testRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: {
        ...baseManifest(),
        claims: [
          {
            claim_id: 'C-001',
            statement: 'feature works in live deployment',
            required_stage: 'LIVE_OBSERVED',
          },
        ],
      },
      evidence: ledger.read(),
    });

    expect(acceptance.outcome).not.toBe('PASS');
    expect(acceptance.unresolved_claims).toContain('C-001');
    expect(acceptance.reasons.some((r) => r.includes('below required stage LIVE_OBSERVED'))).toBe(true);
  });
});

describe('Negative Control 9 — Acceptance Audit Rejects Identity/Traceability Mismatches', () => {
  it('rejects acceptance audit when request/spec work_id mismatch', () => {
    const audit = auditAcceptance({
      request: { ...baseRequest(), work_id: 'W-OTHER' },
      spec: baseSpec(),
      manifest: baseManifest(),
      packets: basePackets(),
      evidence: [],
      acceptance: { outcome: 'PASS', accepted_claims: ['C-001'], unresolved_claims: [], failed_claims: [], reasons: [] },
    });
    expect(audit.accepted).toBe(false);
    expect(audit.findings).toContain('spec/work request identity mismatch');
  });
});
