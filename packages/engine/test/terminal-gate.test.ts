import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  verifyTerminalGate,
  assertCertifiable,
  TERMINAL_GATES,
  type TerminalGateResult,
} from '../src/terminal-gate.js';
import type { WorkLedger } from '../src/contracts.js';

const tmpDirs: string[] = [];
const hash = 'a'.repeat(64);

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-gate-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(relativePath: string, content: string): string {
  const abs = path.resolve(relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

function stubLedger(overrides: Partial<WorkLedger> = {}): WorkLedger {
  const base: WorkLedger = {
    status: 'COMPLETED',
    plan: {
      schema: 'harness/portable-plan',
      version: 3 as const,
      planId: 'test-plan-001',
      original: {
        artifactId: 'PLAN-001', planId: 'test-plan-001', sourceKind: 'chat_plan_artifact', sourceRef: 'msg-1',
        rawPath: '.agent/plans/test-plan-001/original.md', sha256: hash, bytes: 100,
        capturedAt: '2026-07-27T00:00:00.000Z', status: 'ADOPTED',
        repositoryBaseline: { commit: 'a', branch: 'main', dirtyFingerprint: hash },
        repositoryIdentity: 'agent-rules', hostTask: { host: 'codex', taskRef: 't1', sessionRef: 's1' },
        authorIdentity: 'planner', ownerIdentity: 'owner', approvalEvent: 'approved',
        supersedes: [], supplements: [], derivedFrom: [],
      },
      projectionSha256: hash, objective: 'test', scope: { in: ['packages/engine'], out: [] },
      decisions: [], assumptions: [], knownUnknowns: [], taskDag: [],
      ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: [],
      rollback: [], handoff: { recipientRole: 'reviewer', requiredArtifacts: [], nextSafeAction: 'pass' },
      lineage: {
        head: {} as WorkLedger['plan']['lineage']['head'],
        ancestors: [], resolutionMatrix: [], verified: true,
        reconciliationResult: 'PASS', reconciliationSha256: hash,
      },
      requirements: [
        {
          requirementId: 'REQ-001',
          statement: 'System must compile',
          acceptanceCriteria: [
            { criterionId: 'AC-001', claim: 'Build succeeds', evidenceProfile: 'ci', binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Build', lineStart: 1, lineEnd: 1, anchorTextSha256: hash, requirementId: 'REQ-001' } } },
          ],
        },
      ],
      anchors: [{ planSha256: hash, sectionHeading: 'Build', lineStart: 1, lineEnd: 1, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    },
    planAnchors: [{ planSha256: hash, sectionHeading: 'Build', lineStart: 1, lineEnd: 1, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['T1'] }],
    amendments: [],
    assignments: [
      {
        assignmentId: 'A1', taskId: 'T1', requirementIds: ['REQ-001'],
        anchors: [{ planSha256: hash, sectionHeading: 'Build', lineStart: 1, lineEnd: 1, anchorTextSha256: hash, requirementId: 'REQ-001' }],
        dependencies: [], sourceOfTruthPaths: ['packages/engine'], ownedPaths: ['packages/engine'],
        forbiddenPaths: [], allowedTools: ['typescript'],
        acceptanceCriteria: [{ criterionId: 'AC-001', claim: 'Build succeeds', evidenceProfile: 'ci', binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Build', lineStart: 1, lineEnd: 1, anchorTextSha256: hash, requirementId: 'REQ-001' } } }],
        modelTier: 'standard', riskTier: 'high', tokenBudget: 100000, timeBudgetMs: 300000, costBudgetUsd: 1,
        verificationCommands: [{ executable: 'npm', args: ['run', 'build'] }],
        escalationConditions: [], receiptContractSha256: hash,
      },
    ],
    receipts: [
      {
        receiptId: 'R1', assignmentId: 'A1', workerIdentity: 'worker-1', host: 'codex', model: 'deepseek-v4',
        diffSha256: hash, artifactUris: [], artifactHashes: [], filesChanged: ['packages/engine/src/main.ts'],
        commands: [{ executable: 'npm', args: ['run', 'build'], cwd: 'packages/engine' }],
        exitCodes: [0], logUris: [], logHashes: [],
        testEvidenceUris: [], testEvidenceHashes: [],
        startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T01:00:00.000Z',
      },
    ],
    verificationClaims: [
      {
        claimId: 'VC-001', claim: 'Build succeeds', requirementId: 'REQ-001', criterionId: 'AC-001',
        receiptId: 'R1', verificationProfile: 'ci',
        probe: { command: { executable: 'npm', args: ['run', 'build'], cwd: 'packages/engine' }, exitCode: 0, durationMs: 5000 },
        host: 'codex', platform: 'linux', platformVersion: 'x86_64',
        evidenceUris: ['file:///tmp/build.log'], evidenceHashes: [hash],
        verifierIdentity: 'verifier-1', reducerIdentity: 'reducer-1',
        reducerResult: 'PASS', outcome: 'PASS',
      },
    ],
    attestations: [
      { host: 'codex', hostVersion: '1.0', commitSha: hash, capabilityStatus: 'HOST_NATIVE', capabilityIds: ['build'], contractSetSha256: hash, requestedModel: 'deepseek-v4', resolvedModel: 'deepseek-v4', observedModel: 'deepseek-v4', evidenceHashes: [hash], nativeRunnerIdentity: 'runner-1', issuedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-28T00:00:00.000Z' },
      { host: 'cursor', hostVersion: '1.0', commitSha: hash, capabilityStatus: 'HOST_NATIVE', capabilityIds: ['build'], contractSetSha256: hash, requestedModel: 'deepseek-v4', resolvedModel: 'deepseek-v4', observedModel: 'deepseek-v4', evidenceHashes: [hash], nativeRunnerIdentity: 'runner-2', issuedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-28T00:00:00.000Z' },
      { host: 'antigravity', hostVersion: '1.0', commitSha: hash, capabilityStatus: 'HOST_NATIVE', capabilityIds: ['build'], contractSetSha256: hash, requestedModel: 'deepseek-v4', resolvedModel: 'deepseek-v4', observedModel: 'deepseek-v4', evidenceHashes: [hash], nativeRunnerIdentity: 'runner-3', issuedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-28T00:00:00.000Z' },
      { host: 'grok', hostVersion: '1.0', commitSha: hash, capabilityStatus: 'HOST_NATIVE', capabilityIds: ['build'], contractSetSha256: hash, requestedModel: 'deepseek-v4', resolvedModel: 'deepseek-v4', observedModel: 'deepseek-v4', evidenceHashes: [hash], nativeRunnerIdentity: 'runner-4', issuedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-28T00:00:00.000Z' },
      { host: 'opencode', hostVersion: '1.0', commitSha: hash, capabilityStatus: 'HOST_NATIVE', capabilityIds: ['build'], contractSetSha256: hash, requestedModel: 'deepseek-v4', resolvedModel: 'deepseek-v4', observedModel: 'deepseek-v4', evidenceHashes: [hash], nativeRunnerIdentity: 'runner-5', issuedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-28T00:00:00.000Z' },
    ],
    reconciliations: [
      { requirementId: 'REQ-001', status: 'MATCH', anchorIds: [], verificationClaimIds: ['VC-001'] },
    ],
    repairSlices: [],
    sourceAcquisitionReceipts: [],
    orphanFindings: [],
    shadowRevision: 1,
    shadowHashes: { 'tasks.md': hash },
    latestReview: {
      reviewId: 'R1', stale: false, originalSha256: hash, amendmentsSha256: hash,
      diffFingerprint: hash, receiptEvidenceFingerprint: hash, evidenceHashes: [hash],
      shadowRevision: 1, reviewerIdentity: 'final-reviewer',
    },
  };
  return { ...base, ...overrides };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('verifyTerminalGate', () => {
  const head = hash;

  it('rejects when requirement is PARTIAL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({
      reconciliations: [
        { requirementId: 'REQ-001', status: 'PARTIAL', anchorIds: [], verificationClaimIds: ['VC-001'] },
      ],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: true });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED');
  });

  it('rejects when missing AC verification', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ verificationClaims: [] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: true });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('ALL_AC_FRESH_INDEPENDENT_PASS');
  });

  it('rejects when stale review exists', () => {
    const dir = tmpDir();
    const ledger = stubLedger({
      receipts: [
        {
          receiptId: 'R1', assignmentId: 'A1', workerIdentity: 'worker-1', host: 'codex', model: 'deepseek-v4',
          diffSha256: hash, artifactUris: [], artifactHashes: [], filesChanged: ['packages/engine/src/main.ts'],
          commands: [{ executable: 'npm', args: ['run', 'build'], cwd: 'packages/engine' }],
          exitCodes: [0], logUris: [], logHashes: [],
          testEvidenceUris: [], testEvidenceHashes: [],
          startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T01:00:00.000Z',
          stale: true,
        },
      ],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: true });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('NO_STALE_REVIEWS');
  });

  it('rejects when host attestations < 5', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ attestations: [] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: true });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('FIVE_HOST_ATTESTATIONS_BIND_FINAL_HEAD');
  });

  it('rejects when CI quality not passed', () => {
    const dir = tmpDir();
    const ledger = stubLedger();
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: false, ciCertifyPassed: true });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CI_QUALITY_PASS_ON_HEAD');
  });

  it('rejects when CI certify not passed', () => {
    const dir = tmpDir();
    const ledger = stubLedger();
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: false });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('CI_CERTIFY_PASS_ON_HEAD');
  });

  it('passes when all conditions met', () => {
    const dir = tmpDir();
    const ledger = stubLedger();
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: true });
    expect(result.passed).toBe(true);
    expect(result.failedGates).toHaveLength(0);
  });

  it('detects ledger still ADOPTED -> FAIL', () => {
    const dir = tmpDir();
    const ledger = stubLedger({ status: 'ADOPTED', reconciliations: [] });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = verifyTerminalGate(ledgerPath, head, { hostAttestations: 5, ciQualityPassed: true, ciCertifyPassed: true });
    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED');
  });
});

describe('assertCertifiable', () => {
  it('throws on failure', () => {
    const result: TerminalGateResult = {
      passed: false,
      gates: [{ name: 'NO_OPEN_FINDINGS', status: 'FAIL', detail: 'open finding' }],
      failedGates: ['NO_OPEN_FINDINGS'],
      timestamp: new Date().toISOString(),
    };
    expect(() => assertCertifiable(result)).toThrow('Terminal gate FAILED');
  });

  it('passes on success', () => {
    const result: TerminalGateResult = {
      passed: true,
      gates: [{ name: 'ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED', status: 'PASS', detail: 'ok' }],
      failedGates: [],
      timestamp: new Date().toISOString(),
    };
    expect(() => assertCertifiable(result)).not.toThrow();
  });
});
