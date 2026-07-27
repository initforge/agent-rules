import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { verifyTerminalGate, assertCertifiable, assertNoResidualBeforeFinal, terminalGateCheck } from '../src/terminal-gate.js';

const hash = 'a'.repeat(40);

function stubLedger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'COMPLETED',
    execution_state: 'COMPLETED',
    findings: [],
    orphanFindings: [],
    reconciliations: [{ status: 'MATCH', headCommit: hash, detail: `HEAD ${hash.slice(0, 12)}` }],
    attestations: [
      { host: 'codex', commitSha: hash },
      { host: 'cursor', commitSha: hash },
      { host: 'antigravity', commitSha: hash },
      { host: 'grok', commitSha: hash },
      { host: 'opencode', commitSha: hash },
    ],
    plan_anchors: Array.from({ length: 25 }, (_, i) => ({ requirementId: `REQ-${String(i + 1).padStart(3, '0')}` })),
    ...overrides,
  };
}

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')); }
function writeFile(p: string, content: string): string { fs.writeFileSync(p, content, 'utf-8'); return p; }

describe('verifyTerminalGate', () => {
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

  it('rejects when reconciliation is not MATCH', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ reconciliations: [{ status: 'PARTIAL' }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
  });

  it('rejects when attestations < 5', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: [{ host: 'codex', commitSha: hash }] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('FIVE_HOST_ATTESTATIONS');
  });

  it('rejects when attestations do not bind HEAD', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: Array.from({ length: 5 }, (_, i) => ({ host: `h${i}`, commitSha: 'bbbbbb' })) });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('FIVE_HOST_ATTESTATIONS');
  });

  it('rejects CI quality failure', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash, { passed: false });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CI_QUALITY');
  });

  it('rejects CI certify failure', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash, { passed: true }, { passed: false });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CI_CERTIFY');
  });

  it('passes when all conditions met', () => {
    const dir = tmpDir();
    const ledger = stubLedger({});
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash, { passed: true }, { passed: true });
    expect(result.passed).toBe(true);
    expect(result.failedGates).toEqual([]);
  });

  it('detects ADOPTED status as FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ status: 'ADOPTED', execution_state: 'ADOPTED' });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));
    const result = verifyTerminalGate(ledgerPath, hash);
    expect(result.passed).toBe(false);
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
    const result = verifyTerminalGate(ledgerPath, hash, { passed: true }, { passed: true });
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
