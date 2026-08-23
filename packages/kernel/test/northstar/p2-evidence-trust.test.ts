/**
 * Phase P2 — Evidence Trust & Scoped Terminal Authority Test Suite
 * 
 * Verifies that terminal outcomes (TASK, HOST_ADAPTER, RELEASE) are derived
 * strictly from independent verifier evidence, hash-chained ledgers, and semantic audits.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EvidenceLedger,
  deriveAcceptance,
  type EvidenceRecord,
  type WorkSpec,
  type TraceabilityManifest,
  type TaskPacket,
  type EvidenceBinding,
} from '../../src/northstar/index.js';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-trust-'));
  fs.mkdirSync(path.join(tempDir, '.agent'), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup locks on Windows
  }
});

function baseSpec(): WorkSpec {
  return {
    protocol_version: '2.0',
    spec_id: 'S-p2-test',
    revision: 1,
    work_id: 'W-p2-test',
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
      spec_id: 'S-p2-test',
      spec_revision: 1,
      work_id: 'W-p2-test',
      goal: 'implement feature',
      requirements: ['R-001'],
      scope: { owned: ['src/feature.ts'], forbidden: ['config/secrets.json'] },
      acceptance: [{ claim_id: 'C-001', verifier_id: 'V-001' }],
    },
  ];
}

function baseManifest(): TraceabilityManifest {
  return {
    spec_id: 'S-p2-test',
    spec_revision: 1,
    work_id: 'W-p2-test',
    requirements: [{ id: 'R-001', statement: 'feature works', mandatory: true, claims: ['C-001'] }],
    claims: [{ claim_id: 'C-001', statement: 'feature passes test', required_kinds: ['test'] }],
    tasks: basePackets(),
  };
}

function baseBinding(): EvidenceBinding {
  return {
    spec_id: 'S-p2-test',
    spec_revision: 1,
    candidate_epoch: 1,
    platform: 'test-host',
    now_ms: Date.now(),
    freshness_ms: 60_000,
  };
}

describe('Phase P2 — Evidence Trust & Terminal Reducer Binding', () => {
  it('derives PASS only when independent verifier emits passing evidence bound to candidate contract', () => {
    const ledgerPath = path.join(tempDir, 'evidence.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    const record: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-001',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      observed_at: new Date().toISOString(),
      verifier_id: 'V-001',
      work_id: 'W-p2-test',
      spec_id: 'S-p2-test',
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
      binding: baseBinding(),
    });

    expect(acceptance.outcome).toBe('PASS');
    expect(acceptance.accepted_claims).toContain('C-001');
    expect(acceptance.failed_claims).toHaveLength(0);
  });

  it('negative control: worker prose claiming PASS without verifier evidence fails closed', () => {
    const ledgerPath = path.join(tempDir, 'empty-evidence.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      binding: baseBinding(),
    });

    // Worker prose is ignored; without verifier evidence, outcome is BLOCKED/unresolved
    expect(acceptance.outcome).not.toBe('PASS');
    expect(acceptance.accepted_claims).toHaveLength(0);
    expect(acceptance.unresolved_claims).toContain('C-001');
  });

  it('negative control: foreign candidate epoch / execution generation fails closed', () => {
    const ledgerPath = path.join(tempDir, 'epoch-evidence.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    const foreignRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-002',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      observed_at: new Date().toISOString(),
      verifier_id: 'V-001',
      work_id: 'W-p2-test',
      spec_id: 'S-p2-test',
      spec_revision: 1,
      candidate_epoch: 999, // Stale / foreign epoch
      platform: 'test-host',
    };

    ledger.append(foreignRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      binding: baseBinding(), // expects candidate_epoch: 1
    });

    expect(acceptance.outcome).not.toBe('PASS');
    expect(acceptance.unresolved_claims).toContain('C-001');
  });

  it('negative control: verifier failure produces FAILED and cannot be bypassed', () => {
    const ledgerPath = path.join(tempDir, 'failed-evidence.jsonl');
    const ledger = new EvidenceLedger(ledgerPath);

    const failedRecord: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-003',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'fail',
      observed_at: new Date().toISOString(),
      verifier_id: 'V-001',
      work_id: 'W-p2-test',
      spec_id: 'S-p2-test',
      spec_revision: 1,
      candidate_epoch: 1,
      platform: 'test-host',
    };

    ledger.append(failedRecord, 'verifier');

    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: baseManifest(),
      evidence: ledger.read(),
      binding: baseBinding(),
    });

    expect(acceptance.outcome).toBe('FAILED');
    expect(acceptance.failed_claims).toContain('C-001');
  });
});
