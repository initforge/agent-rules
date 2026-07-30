import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { verifyTerminalGate, assertCertifiable, assertNoResidualBeforeFinal, terminalGateCheck, assertWorkLedger, assertCertificationAttestation, REQUIRED_HOSTS } from '../src/terminal-gate.js';
import { HOST_ATTESTATION_EVIDENCE_ROLES, hostAttestationEvidenceRef, hostAttestationEvidenceSubjectSha256, type HostAttestation } from '../src/contracts.js';

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
  const ledger: Record<string, unknown> = {
    status: 'COMPLETED',
    execution_state: 'COMPLETED',
    findings: [],
    orphanFindings: [],
    reconciliations: [{ status: 'MATCH', headCommit: hash, detail: `HEAD ${hash.slice(0, 12)}` }],
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
