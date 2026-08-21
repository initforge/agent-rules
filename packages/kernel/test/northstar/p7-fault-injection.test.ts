/**
 * Phase P7 — Semantic Test Contract, Polyglot Verification & Fault Injection
 * 
 * Verifies that the fault-injection matrix guarantees zero false PASS,
 * rejects forged evidence, detects tampered receipts, and enforces polyglot verifier truth.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveAcceptance,
  EvidenceLedger,
  type WorkSpec,
  type TaskPacket,
  type TraceabilityManifest,
  type EvidenceBinding,
  type EvidenceRecord,
} from '../../src/northstar/index.js';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p7-fault-'));
});

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup locks on Windows
  }
});

function makeSpec(): WorkSpec {
  return {
    protocol_version: '2.0',
    spec_id: 'S-p7-fault',
    revision: 1,
    work_id: 'W-p7-fault',
    requirements: [
      { id: 'R-001', statement: 'TypeScript unit tests pass', mandatory: true, claims: ['C-001'] },
      { id: 'R-002', statement: 'Python conformance tests pass', mandatory: true, claims: ['C-002'] },
      { id: 'R-003', statement: 'Go integration tests pass', mandatory: true, claims: ['C-003'] },
    ],
  };
}

function makePackets(): TaskPacket[] {
  return [
    {
      protocol_version: '2.0',
      task_id: 'T-001',
      spec_id: 'S-p7-fault',
      spec_revision: 1,
      work_id: 'W-p7-fault',
      goal: 'Polyglot verification',
      requirements: ['R-001', 'R-002', 'R-003'],
      scope: { owned: ['src/**', 'tests/**'], forbidden: [] },
      acceptance: [
        { claim_id: 'C-001', verifier_id: 'V-node' },
        { claim_id: 'C-002', verifier_id: 'V-python' },
        { claim_id: 'C-003', verifier_id: 'V-go' },
      ],
    },
  ];
}

function makeManifest(): TraceabilityManifest {
  return {
    spec_id: 'S-p7-fault',
    spec_revision: 1,
    work_id: 'W-p7-fault',
    requirements: makeSpec().requirements,
    claims: [
      { claim_id: 'C-001', statement: 'TypeScript unit tests pass', required_kinds: ['test'] },
      { claim_id: 'C-002', statement: 'Python conformance tests pass', required_kinds: ['test'] },
      { claim_id: 'C-003', statement: 'Go integration tests pass', required_kinds: ['test'] },
    ],
    tasks: makePackets(),
  };
}

function makeBinding(): EvidenceBinding {
  return {
    spec_id: 'S-p7-fault',
    spec_revision: 1,
    candidate_epoch: 1,
    platform: 'polyglot-runner',
    now_ms: Date.now(),
    freshness_ms: 60_000,
  };
}

function makeRecord(claim_id: string, verifier_id: string, status: 'pass' | 'fail' | 'blocked'): EvidenceRecord {
  return {
    protocol_version: '2.0',
    evidence_id: `E-${claim_id}`,
    claim_id,
    task_id: 'T-001',
    kind: 'test',
    status,
    observed_at: new Date().toISOString(),
    verifier_id,
    work_id: 'W-p7-fault',
    spec_id: 'S-p7-fault',
    spec_revision: 1,
    candidate_epoch: 1,
    platform: 'polyglot-runner',
  };
}

describe('Phase P7 — Semantic Test Contract & Fault Injection Matrix', () => {
  it('Injected Fault 1: Failing verifier in polyglot stack prevents PASS and yields BLOCKED/PARTIAL', () => {
    const ledgerPath = path.join(tempDir, 'evidence-1.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    // Node passes
    ledger.append(makeRecord('C-001', 'V-node', 'pass'), 'verifier');

    // Python FAILS (Fault injected)
    ledger.append(makeRecord('C-002', 'V-python', 'fail'), 'verifier');

    // Go passes
    ledger.append(makeRecord('C-003', 'V-go', 'pass'), 'verifier');

    const acceptance = deriveAcceptance({
      spec: makeSpec(),
      manifest: makeManifest(),
      packets: makePackets(),
      evidence: ledger.read(),
      binding: makeBinding(),
    });

    expect(acceptance.outcome).not.toBe('PASS');
    expect(['FAILED', 'BLOCKED', 'PARTIAL']).toContain(acceptance.outcome);
    expect(acceptance.failed_claims).toContain('C-002');
  });

  it('Injected Fault 2: Tampered artifact hash is detected and rejected', () => {
    const artifactPath = path.join(tempDir, 'artifact.json');
    fs.writeFileSync(artifactPath, JSON.stringify({ valid: true }));

    const ledgerPath = path.join(tempDir, 'evidence-2.jsonl');
    const ledger = new EvidenceLedger(ledgerPath, tempDir);

    const tamperedRecord: EvidenceRecord = {
      ...makeRecord('C-001', 'V-node', 'pass'),
      artifact_path: 'artifact.json',
      sha256: 'tampered-fake-sha256-' + '0'.repeat(44),
    };

    expect(() => {
      ledger.append(tamperedRecord, 'verifier');
    }).toThrow(/hash mismatch/);
  });

  it('Injected Fault 3: Missing verifier evidence results in PARTIAL/BLOCKED outcome', () => {
    const ledgerPath = path.join(tempDir, 'evidence-3.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    // Only C-001 is verified, C-002 and C-003 are missing
    ledger.append(makeRecord('C-001', 'V-node', 'pass'), 'verifier');

    const acceptance = deriveAcceptance({
      spec: makeSpec(),
      manifest: makeManifest(),
      packets: makePackets(),
      evidence: ledger.read(),
      binding: makeBinding(),
    });

    expect(acceptance.outcome).not.toBe('PASS');
    expect(acceptance.unresolved_claims).toContain('C-002');
    expect(acceptance.unresolved_claims).toContain('C-003');
  });

  it('Clean polyglot run: All verifiers pass with verified provenance and achieves trusted PASS', () => {
    const ledgerPath = path.join(tempDir, 'evidence-4.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    ledger.append(makeRecord('C-001', 'V-node', 'pass'), 'verifier');
    ledger.append(makeRecord('C-002', 'V-python', 'pass'), 'verifier');
    ledger.append(makeRecord('C-003', 'V-go', 'pass'), 'verifier');

    const acceptance = deriveAcceptance({
      spec: makeSpec(),
      manifest: makeManifest(),
      packets: makePackets(),
      evidence: ledger.read(),
      binding: makeBinding(),
    });

    expect(acceptance.outcome).toBe('PASS');
    expect(acceptance.accepted_claims).toEqual(['C-001', 'C-002', 'C-003']);
    expect(acceptance.failed_claims).toHaveLength(0);
    expect(acceptance.unresolved_claims).toHaveLength(0);
  });
});
