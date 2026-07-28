import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { verifyTerminalGate, assertCertifiable, assertNoResidualBeforeFinal, terminalGateCheck, assertWorkLedger, assertCertificationAttestation, REQUIRED_HOSTS } from '../src/terminal-gate.js';

const hash = 'a'.repeat(40);

function stubLedger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ledger: Record<string, unknown> = {
    status: 'COMPLETED',
    execution_state: 'COMPLETED',
    findings: [],
    orphanFindings: [],
    reconciliations: [{ status: 'MATCH', headCommit: hash, detail: `HEAD ${hash.slice(0, 12)}` }],
    attestations: [
      { host: 'codex', commitSha: hash, attestationId: 'att-1', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'cursor', commitSha: hash, attestationId: 'att-2', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'antigravity', commitSha: hash, attestationId: 'att-3', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'grok', commitSha: hash, attestationId: 'att-4', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'opencode', commitSha: hash, attestationId: 'att-5', signedAt: '2026-07-27T00:00:00.000Z' },
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
    ci_quality: { passed: true, status: 'PASS', runUrl: 'https://github.com/example/actions/runs/1' },
    ci_certify: { passed: true, status: 'PASS', runUrl: 'https://github.com/example/actions/runs/2' },
    plan: {
      original: {
        artifactId: 'PLAN-001',
        sha256: hash,
        bytes: 100,
        status: 'ADOPTED',
      },
    },
    ...overrides,
  };
  return ledger;
}

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')); }
function writeFile(p: string, content: string): string { fs.writeFileSync(p, content, 'utf-8'); return p; }

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
    const ledger = stubLedger({ headCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('HEAD_MATCH');
  });

  it('rejects non-native host → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: [
      { host: 'codex', commitSha: hash, attestationId: 'att-1', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'cursor', commitSha: hash, attestationId: 'att-2', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'antigravity', commitSha: hash, attestationId: 'att-3', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'grok', commitSha: hash, attestationId: 'att-4', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'opencode', commitSha: hash, attestationId: 'att-5', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'unknown-llm', commitSha: hash, attestationId: 'att-6', signedAt: '2026-07-27T00:00:00.000Z' },
    ] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('NO_NON_NATIVE_HOST');
  });

  it('rejects absent GitHub CI → FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ ci_quality: {}, ci_certify: {}, ci_checks: [] });
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

  it('rejects non-COMPLETED state', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ execution_state: 'NEEDS_REMEDIATION', status: 'NEEDS_REMEDIATION' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('EXECUTION_STATE_COMPLETED');
  });

  it('rejects open findings', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ findings: [{ finding_id: 'F-001', status: 'OPEN' }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('NO_OPEN_FINDINGS');
  });

  it('rejects when attestations < 5', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: [{ host: 'codex', commitSha: hash, attestationId: 'att-1', signedAt: '2026-07-27T00:00:00.000Z' }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('rejects when attestations do not bind HEAD', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: Array.from({ length: 5 }, (_, i) => ({ host: REQUIRED_HOSTS[i], commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', attestationId: `att-${i}`, signedAt: '2026-07-27T00:00:00.000Z' })) });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CERTIFICATION_ATTESTATION');
  });

  it('handles missing ledger gracefully', () => {
    const result = terminalGateCheck('/nonexistent/ledger.json', hash);
    expect(result.passed).toBe(false);
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
      { host: 'codex', commitSha: hash, attestationId: 'att-1', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'cursor', commitSha: hash, attestationId: 'att-2', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'antigravity', commitSha: hash, attestationId: 'att-3', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'grok', commitSha: hash, attestationId: 'att-4', signedAt: '2026-07-27T00:00:00.000Z' },
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow('opencode');
  });

  it('rejects empty commitSha', () => {
    const ledger = stubLedger({ attestations: [
      { host: 'codex', commitSha: hash, attestationId: 'att-1', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'cursor', commitSha: hash, attestationId: 'att-2', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'antigravity', commitSha: hash, attestationId: 'att-3', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'grok', commitSha: '', attestationId: 'att-4', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'opencode', commitSha: hash, attestationId: 'att-5', signedAt: '2026-07-27T00:00:00.000Z' },
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow('empty commitSha');
  });

  it('rejects null field in attestation', () => {
    const ledger = stubLedger({ attestations: [
      { host: 'codex', commitSha: hash, attestationId: null, signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'cursor', commitSha: hash, attestationId: 'att-2', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'antigravity', commitSha: hash, attestationId: 'att-3', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'grok', commitSha: hash, attestationId: 'att-4', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'opencode', commitSha: hash, attestationId: 'att-5', signedAt: '2026-07-27T00:00:00.000Z' },
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow(/null\/empty/);
  });

  it('rejects wrong HEAD binding', () => {
    const ledger = stubLedger({ attestations: [
      { host: 'codex', commitSha: hash, attestationId: 'att-1', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'cursor', commitSha: hash, attestationId: 'att-2', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'antigravity', commitSha: hash, attestationId: 'att-3', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'grok', commitSha: hash, attestationId: 'att-4', signedAt: '2026-07-27T00:00:00.000Z' },
      { host: 'opencode', commitSha: 'cccccccccccccccccccccccccccccccccccccccc', attestationId: 'att-5', signedAt: '2026-07-27T00:00:00.000Z' },
    ] });
    expect(() => assertCertificationAttestation(ledger, hash)).toThrow('HEAD');
  });

  it('passes valid attestations', () => {
    const ledger = stubLedger({});
    expect(() => assertCertificationAttestation(ledger, hash)).not.toThrow();
  });
});
