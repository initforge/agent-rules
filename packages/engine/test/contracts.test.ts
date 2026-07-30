import { describe, expect, it } from 'vitest';
import {
  assertCertificationAttestation, assertHarnessManifestV3, assertPlanAnchor, assertPortablePlanIdentity, assertTaskAssignment,
  assertVerificationClaim, assertWorkerReceipt, assertWorkLedger, assertProvenanceTimestamp,
  planAnchorId, reviewedStateFingerprint, sha256Bytes,
  type HarnessManifestV3, type HostAttestation, type PlanAnchor, type PortablePlan, type TaskAssignment,
  type VerificationClaim, type WorkerReceipt, type WorkLedger,
} from '../src/contracts.js';

const originalBytes = new TextEncoder().encode('# Plan\n\n## Requirement\nDo the work.\n');
const planHash = sha256Bytes(originalBytes);
const anchorBytes = new TextEncoder().encode('## Requirement\nDo the work.\n');
const hash = 'a'.repeat(64);
const tasksShadowBytes = new TextEncoder().encode('# Tasks\n\n- T1\n');
const tasksShadowHash = sha256Bytes(tasksShadowBytes);
const anchor: PlanAnchor = { planSha256: planHash, sectionHeading: 'Requirement', lineStart: 3, lineEnd: 4, anchorTextSha256: sha256Bytes(anchorBytes), requirementId: 'REQ-001' };

function aggregateRows(rows: readonly string[]): string {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify([...rows].sort())));
}

function withFreshReview(value: WorkLedger): WorkLedger {
  return {
    ...value,
    latestReview: {
      ...value.latestReview,
      amendmentsSha256: aggregateRows(value.amendments.filter((amendment) => amendment.approved).map((amendment) => JSON.stringify([amendment.amendmentId, amendment.sha256, amendment.sourceRef]))),
      diffFingerprint: aggregateRows(value.receipts.map((receipt) => JSON.stringify([receipt.receiptId, receipt.assignmentId, receipt.diffSha256 ?? null]))),
      receiptEvidenceFingerprint: reviewedStateFingerprint(value.receipts, value.verificationClaims),
      evidenceHashes: [...new Set(value.verificationClaims.flatMap((claim) => claim.evidenceHashes))].sort(),
    },
  };
}

function plan(status: 'APPROVED' | 'ADOPTED' | 'ACTIVE' | 'DRAFT' | 'REJECTED' = 'ADOPTED'): PortablePlan {
  const original = {
    artifactId: 'PLAN-001', planId: 'plan-001', sourceKind: 'chat_plan_artifact' as const, sourceRef: 'message-001', rawPath: '.agent/plans/plan-001/original.md', sha256: planHash,
    bytes: originalBytes.byteLength, capturedAt: '2026-07-26T00:00:00.000Z', status, repositoryBaseline: { commit: 'deadbeef', branch: 'main', dirtyFingerprint: hash },
    repositoryIdentity: 'agent-rules', hostTask: { host: 'codex', taskRef: 'task-1', sessionRef: 'session-1' },
    authorIdentity: 'planner', ownerIdentity: 'owner', approvalEvent: 'owner-approved', supersedes: [], supplements: [], derivedFrom: [],
  };
  return {
    schema: 'harness/portable-plan', version: 3, planId: 'plan-001', original, projectionSha256: hash,
    objective: 'Build the engine contract.', scope: { in: ['packages/engine'], out: [] },
    decisions: [{ decisionId: 'D1', decision: 'Use typed contracts.', rationale: 'Fail closed.', tradeOffs: [] }],
    assumptions: [], knownUnknowns: [], taskDag: [{ taskId: 'T1', requirementIds: ['REQ-001'], criterionIds: ['AC1'], dependencies: [] }],
    ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: ['engine-contract'], rollback: ['Revert the slice.'],
    handoff: { recipientRole: 'reviewer', requiredArtifacts: ['receipt'], nextSafeAction: 'Review independently.' },
    lineage: { head: original, ancestors: [], resolutionMatrix: [{ requirementId: 'REQ-001', sourceArtifactId: 'PLAN-001', resolution: 'CARRIED', rationale: 'current' }], verified: true, reconciliationResult: 'PASS', reconciliationSha256: hash },
    requirements: [{ requirementId: 'REQ-001', statement: 'Do the work.', acceptanceCriteria: [{ criterionId: 'AC1', claim: 'Contract is enforced.', evidenceProfile: 'engine-contract', binding: { kind: 'plan-anchor', anchor } }] }], anchors: [anchor],
  };
}

function planForOriginal(bytes: Uint8Array, anchoredBytes: Uint8Array, sectionHeading = 'Requirement'): PortablePlan {
  const value = plan();
  const originalSha256 = sha256Bytes(bytes);
  const nextOriginal = { ...value.original, sha256: originalSha256, bytes: bytes.byteLength };
  const nextAnchor = { ...anchor, planSha256: originalSha256, sectionHeading, anchorTextSha256: sha256Bytes(anchoredBytes) };
  return {
    ...value,
    original: nextOriginal,
    lineage: { ...value.lineage, head: nextOriginal },
    anchors: [nextAnchor],
    requirements: value.requirements.map((requirement) => ({
      ...requirement,
      acceptanceCriteria: requirement.acceptanceCriteria.map((criterion) => ({ ...criterion, binding: { kind: 'plan-anchor' as const, anchor: nextAnchor } })),
    })),
  };
}

function planWithUncoveredRequirement(): PortablePlan {
  const value = plan();
  const secondAnchor = { ...anchor, requirementId: 'REQ-002' };
  return {
    ...value,
    requirements: [...value.requirements, { requirementId: 'REQ-002', statement: 'Cover the second requirement.', acceptanceCriteria: [{ criterionId: 'AC2', claim: 'Second requirement is verified.', evidenceProfile: 'engine-contract', binding: { kind: 'plan-anchor', anchor: secondAnchor } }] }],
    anchors: [...value.anchors, secondAnchor],
    lineage: { ...value.lineage, resolutionMatrix: [...value.lineage.resolutionMatrix, { requirementId: 'REQ-002', sourceArtifactId: 'PLAN-001', resolution: 'CARRIED', rationale: 'current' }] },
  };
}

function attestation(status: HostAttestation['capabilityStatus'] = 'HOST_NATIVE'): HostAttestation {
  return { host: 'codex', hostVersion: '1', commitSha: 'deadbeef', capabilityStatus: status, capabilityIds: ['run'], contractSetSha256: hash,
    requestedModel: 'standard', resolvedModel: 'gpt', observedModel: 'gpt', evidenceHashes: [hash], nativeRunnerIdentity: 'codex-cli', issuedAt: '2026-07-26T00:00:00.000Z', expiresAt: '2026-07-26T01:00:00.000Z' };
}

function ledger(): WorkLedger {
  return withFreshReview({
    status: 'REVIEWING', plan: plan(), planAnchors: [anchor], batches: [{ batchId: 'P0', status: 'PASSED', taskIds: ['T1'] }],
    amendments: [], assignments: [], receipts: [], verificationClaims: [], attestations: [attestation()],
    reconciliations: [{ requirementId: 'REQ-001', status: 'PARTIAL', anchorIds: [planAnchorId(anchor)], verificationClaimIds: [] }], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [],
    shadowRevision: 2, shadowHashes: { 'tasks.md': tasksShadowHash }, latestReview: { reviewId: 'R1', stale: false, originalSha256: planHash, amendmentsSha256: hash, diffFingerprint: hash, receiptEvidenceFingerprint: hash, evidenceHashes: [hash], shadowRevision: 2, reviewerIdentity: 'final-reviewer' },
  });
}

function assignment(): TaskAssignment {
  return {
    assignmentId: 'A1', taskId: 'T1', requirementIds: ['REQ-001'], anchors: [anchor], dependencies: [],
    sourceOfTruthPaths: ['original.md'], ownedPaths: ['packages/engine'], forbiddenPaths: ['packages/cli'], allowedTools: ['apply_patch'],
    acceptanceCriteria: [{ criterionId: 'AC1', claim: 'Contract is enforced.', evidenceProfile: 'engine-contract', binding: { kind: 'plan-anchor', anchor } }],
    modelTier: 'standard', riskTier: 'high', tokenBudget: 1000, timeBudgetMs: 60_000, costBudgetUsd: 1,
    verificationCommands: [{ executable: 'npm', args: ['test'] }], escalationConditions: ['Repeated failure'], receiptContractSha256: hash,
  };
}

function workerReceipt(): WorkerReceipt {
  return {
    receiptId: 'WR1', assignmentId: 'A1', workerIdentity: 'worker', host: 'codex', model: 'gpt',
    diffSha256: hash, artifactUris: [], artifactHashes: [], filesChanged: ['packages/engine/src/contracts.ts'],
    commands: [{ executable: 'npm', args: ['test'] }], exitCodes: [0], logUris: ['log://test'], logHashes: [hash],
    testEvidenceUris: ['evidence://test'], testEvidenceHashes: [hash],
    startedAt: '2026-07-26T00:00:00.000Z', completedAt: '2026-07-26T00:01:00.000Z',
  };
}

function verificationClaim(): VerificationClaim {
  return {
    claimId: 'VC1', claim: 'Contract tests pass.', requirementId: 'REQ-001', criterionId: 'AC1', receiptId: 'WR1',
    verificationProfile: 'engine-contract', probe: { command: { executable: 'npm', args: ['test'] }, exitCode: 0, durationMs: 10 },
    host: 'codex', platform: 'linux', platformVersion: '1', evidenceUris: ['evidence://test'], evidenceHashes: [hash],
    verifierIdentity: 'reviewer', reducerIdentity: 'independent-reducer', reducerResult: 'PASS', outcome: 'PASS',
  };
}

function completedLedger(): WorkLedger {
  return withFreshReview({
    ...ledger(),
    status: 'COMPLETED',
    assignments: [assignment()],
    receipts: [workerReceipt()],
    verificationClaims: [verificationClaim()],
    reconciliations: [{ requirementId: 'REQ-001', status: 'MATCH', anchorIds: [planAnchorId(anchor)], verificationClaimIds: ['VC1'] }],
  });
}

function artifactOnlyCompletedLedger(): WorkLedger {
  const value = completedLedger();
  const artifactReceipt: WorkerReceipt = {
    ...value.receipts[0],
    diffSha256: undefined,
    artifactUris: ['artifact://bundle'],
    artifactHashes: [hash],
    filesChanged: [],
  };
  return withFreshReview({ ...value, receipts: [artifactReceipt] });
}

function completedTwoRequirementLedger(): WorkLedger {
  const secondRequirementPlan = planWithUncoveredRequirement();
  const expandedPlan: PortablePlan = {
    ...secondRequirementPlan,
    taskDag: [{ ...secondRequirementPlan.taskDag[0], requirementIds: ['REQ-001', 'REQ-002'], criterionIds: ['AC1', 'AC2'] }],
  };
  const expandedAssignment: TaskAssignment = {
    ...assignment(),
    requirementIds: ['REQ-001', 'REQ-002'],
    anchors: expandedPlan.anchors,
    acceptanceCriteria: expandedPlan.requirements.flatMap((requirement) => requirement.acceptanceCriteria),
  };
  const secondClaim: VerificationClaim = { ...verificationClaim(), claimId: 'VC2', claim: 'Second requirement passes.', requirementId: 'REQ-002', criterionId: 'AC2' };
  return withFreshReview({
    ...completedLedger(),
    plan: expandedPlan,
    planAnchors: expandedPlan.anchors,
    assignments: [expandedAssignment],
    verificationClaims: [verificationClaim(), secondClaim],
    reconciliations: [
      { requirementId: 'REQ-001', status: 'MATCH', anchorIds: [planAnchorId(expandedPlan.anchors[0])], verificationClaimIds: ['VC1'] },
      { requirementId: 'REQ-002', status: 'MATCH', anchorIds: [planAnchorId(expandedPlan.anchors[1])], verificationClaimIds: ['VC2'] },
    ],
  });
}

describe('portable plan contracts', () => {
  it('accepts approved/adopted plans backed by exact physical bytes', () => {
    expect(() => assertPortablePlanIdentity(plan('APPROVED'), originalBytes)).not.toThrow();
    expect(() => assertPortablePlanIdentity(plan('ADOPTED'), originalBytes)).not.toThrow();
  });
  it('accepts an ACTIVE plan artifact backed by exact physical bytes', () => expect(() => assertPortablePlanIdentity(plan('ACTIVE'), originalBytes)).not.toThrow());
  it.each(['DRAFT', 'REJECTED'] as const)('rejects non-executable plan status %s', (status) => expect(() => assertPortablePlanIdentity(plan(status), originalBytes)).toThrow('APPROVED, ADOPTED, or ACTIVE'));
  it('rejects unverified lineage', () => { const value = plan(); expect(() => assertPortablePlanIdentity({ ...value, lineage: { ...value.lineage, verified: false } }, originalBytes)).toThrow('unverified'); });
  it('rejects empty and duplicate requirements', () => {
    const value = plan(); expect(() => assertPortablePlanIdentity({ ...value, requirements: [] }, originalBytes)).toThrow('non-empty');
    expect(() => assertPortablePlanIdentity({ ...value, requirements: [...value.requirements, value.requirements[0]] }, originalBytes)).toThrow('duplicates');
  });
  it('fails closed on legacy string-only plan acceptance criteria', () => {
    const value = plan();
    const legacyPlan = { ...value, requirements: [{ ...value.requirements[0], acceptanceCriteria: ['Verified'] }] } as unknown as PortablePlan;
    expect(() => assertPortablePlanIdentity(legacyPlan, originalBytes)).toThrow('criterion IDs');
  });
  it('rejects anchor plan SHA and physical byte mismatches', () => {
    expect(() => assertPlanAnchor({ ...anchor, planSha256: hash }, planHash, originalBytes)).toThrow('plan SHA mismatch');
    expect(() => assertPlanAnchor({ ...anchor, anchorTextSha256: hash }, planHash, originalBytes)).toThrow('physical bytes mismatch');
    expect(() => assertPortablePlanIdentity(plan(), new TextEncoder().encode('tampered'))).toThrow('physical bytes mismatch');
  });
  it('requires positive integer PlanAnchor positions', () => {
    expect(() => assertPlanAnchor({ ...anchor, lineStart: 1.5 }, planHash, originalBytes)).toThrow('invalid location');
    expect(() => assertPlanAnchor({ ...anchor, lineEnd: 4.5 }, planHash, originalBytes)).toThrow('invalid location');
  });
  it('accepts exact LF and CRLF/BOM Unicode plan bytes', () => {
    expect(() => assertPortablePlanIdentity(plan(), originalBytes)).not.toThrow();
    const unicodeBytes = new TextEncoder().encode('\uFEFF# Kế hoạch\r\n\r\n## Yêu cầu\r\nLàm đúng.\r\n');
    const unicodeAnchorBytes = new TextEncoder().encode('## Yêu cầu\r\nLàm đúng.\r\n');
    expect(() => assertPortablePlanIdentity(planForOriginal(unicodeBytes, unicodeAnchorBytes, 'Yêu cầu'), unicodeBytes)).not.toThrow();
  });
  it('rejects cyclic or requirement-incomplete task DAGs', () => {
    const value = plan();
    expect(() => assertPortablePlanIdentity({ ...value, taskDag: [
      { taskId: 'T1', requirementIds: ['REQ-001'], criterionIds: ['AC1'], dependencies: ['T2'] },
      { taskId: 'T2', requirementIds: ['REQ-001'], criterionIds: ['AC1'], dependencies: ['T1'] },
    ] }, originalBytes)).toThrow('contains a cycle');
    expect(() => assertPortablePlanIdentity(planWithUncoveredRequirement(), originalBytes)).toThrow('does not cover every requirement');
  });
});

describe('certification and ledger gates', () => {
  it.each(['EMULATED', 'ADAPTER_ENFORCED', 'UNVERIFIED'] as const)('rejects non-native certification status %s', (status) => expect(() => assertCertificationAttestation(attestation(status), 'deadbeef')).toThrow('native'));
  it('rejects stale attestations', () => { const value = attestation(); expect(() => assertCertificationAttestation({ ...value, expiresAt: '2020-01-01T00:00:00.000Z' }, 'deadbeef')).toThrow('stale'); });
  it('rejects unparseable issuedAt', () => { const value = attestation(); expect(() => assertCertificationAttestation({ ...value, issuedAt: 'not-a-date' }, 'deadbeef')).toThrow('not parseable'); });
  it('rejects unparseable expiresAt', () => { const value = attestation(); expect(() => assertCertificationAttestation({ ...value, expiresAt: 'bad-date' }, 'deadbeef')).toThrow('not parseable'); });
  it('rejects future issuedAt', () => { const value = attestation(); expect(() => assertCertificationAttestation({ ...value, issuedAt: '2099-07-29T00:00:00.000Z' }, 'deadbeef', new Date('2026-07-26T00:00:00.000Z'))).toThrow('future'); });
  it('rejects unbounded TTL exceeding 24h maximum', () => { const value = attestation(); expect(() => assertCertificationAttestation({ ...value, expiresAt: '2026-07-28T00:00:00.000Z' }, 'deadbeef', new Date('2026-07-26T01:00:00.000Z'))).toThrow('TTL'); });
  it('accepts valid provenance timestamp within window', () => expect(() => assertProvenanceTimestamp('2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z', '2026-07-26T01:00:00.000Z', new Date('2026-07-26T00:30:00.000Z'))).not.toThrow());
  it('rejects unparseable provenance timestamp', () => expect(() => assertProvenanceTimestamp('not-a-date', '2026-07-26T00:00:00.000Z', '2026-07-26T01:00:00.000Z')).toThrow('not parseable'));
  it('rejects provenance timestamp in the future', () => expect(() => assertProvenanceTimestamp('2099-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z', '2026-07-26T01:00:00.000Z', new Date('2026-07-26T00:00:00.000Z'))).toThrow('future'));
  it('rejects provenance timestamp before issuedAt', () => expect(() => assertProvenanceTimestamp('2026-07-25T23:00:00.000Z', '2026-07-26T00:00:00.000Z', '2026-07-26T01:00:00.000Z', new Date('2026-07-26T00:00:00.000Z'))).toThrow('before issuedAt'));
  it('rejects provenance timestamp after expiresAt', () => expect(() => assertProvenanceTimestamp('2026-07-26T01:30:00.000Z', '2026-07-26T00:00:00.000Z', '2026-07-26T01:00:00.000Z', new Date('2026-07-26T02:00:00.000Z'))).toThrow('after expiresAt'));
  it('rejects missing ledger collections', () => { const value = ledger() as WorkLedger & { batches?: WorkLedger['batches'] }; delete value.batches; expect(() => assertWorkLedger(value as WorkLedger, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('missing batches'); });
  it.each(['amendments', 'sourceAcquisitionReceipts', 'orphanFindings'] as const)('rejects missing %s collection', (field) => {
    const value = ledger() as WorkLedger & Partial<Pick<WorkLedger, typeof field>>;
    delete value[field];
    expect(() => assertWorkLedger(value as WorkLedger, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow(`missing ${field}`);
  });
  it('rejects stale shadow and review bindings', () => {
    const value = ledger(); expect(() => assertWorkLedger({ ...value, latestReview: { ...value.latestReview, stale: true } }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('review is stale');
    expect(() => assertWorkLedger({ ...value, shadowHashes: { 'tasks.md': 'bad' } }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('shadow state');
  });
  it('binds the latest review to current amendments, receipt diffs, and exact claim evidence', () => {
    const fresh = completedLedger();
    expect(() => assertWorkLedger(fresh, originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
    expect(() => assertWorkLedger({ ...fresh, amendments: [{ amendmentId: 'AM-1', approved: true, sha256: hash, sourceRef: 'owner://amendment-1' }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('amendment binding is stale');
    const changedDiff = { ...fresh.receipts[0], diffSha256: 'b'.repeat(64) };
    expect(() => assertWorkLedger({ ...fresh, receipts: [changedDiff] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('diff binding is stale');
    const changedEvidence = { ...fresh.verificationClaims[0], evidenceHashes: ['b'.repeat(64)] };
    expect(() => assertWorkLedger({ ...fresh, verificationClaims: [changedEvidence] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('evidence binding is stale');
  });
  it('stales artifact-only completion when reviewed artifact evidence changes', () => {
    const fresh = artifactOnlyCompletedLedger();
    expect(() => assertWorkLedger(fresh, originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
    const changedReceipt = { ...fresh.receipts[0], artifactHashes: ['b'.repeat(64)] };
    expect(() => assertWorkLedger({ ...fresh, receipts: [changedReceipt] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('receipt/evidence binding is stale');
  });
  it.each([
    ['worker identity', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, workerIdentity: 'worker-2' })],
    ['host', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, host: 'cursor' })],
    ['model', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, model: 'reviewed-model-2' })],
    ['files changed', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, filesChanged: ['packages/engine/test/contracts.test.ts'] })],
    ['artifact pair', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, artifactUris: ['artifact://bundle'], artifactHashes: ['b'.repeat(64)] })],
    ['command', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, commands: [{ executable: 'npm', args: ['test', '--runInBand'] }] })],
    ['exit result', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, exitCodes: [1] })],
    ['log URI', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, logUris: ['log://changed'] })],
    ['log hash', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, logHashes: ['b'.repeat(64)] })],
    ['test evidence URI', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, testEvidenceUris: ['evidence://changed-test'] })],
    ['test evidence hash', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, testEvidenceHashes: ['b'.repeat(64)] })],
    ['start timestamp', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, startedAt: '2026-07-26T00:00:30.000Z' })],
    ['completion timestamp', (receipt: WorkerReceipt): WorkerReceipt => ({ ...receipt, completedAt: '2026-07-26T00:02:00.000Z' })],
  ])('stales review on WorkerReceipt %s mutation', (_name, mutate) => {
    const fresh = completedLedger();
    expect(() => assertWorkLedger({ ...fresh, receipts: [mutate(fresh.receipts[0])] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('receipt/evidence binding is stale');
  });
  it.each([
    ['claim text', (claim: VerificationClaim): VerificationClaim => ({ ...claim, claim: 'Changed reviewed claim.' })],
    ['probe command', (claim: VerificationClaim): VerificationClaim => ({ ...claim, probe: { ...claim.probe, command: { executable: 'npm', args: ['test', '--runInBand'] } } })],
    ['probe duration', (claim: VerificationClaim): VerificationClaim => ({ ...claim, probe: { ...claim.probe, durationMs: 11 } })],
    ['host', (claim: VerificationClaim): VerificationClaim => ({ ...claim, host: 'cursor' })],
    ['platform version', (claim: VerificationClaim): VerificationClaim => ({ ...claim, platformVersion: '2' })],
    ['evidence URI', (claim: VerificationClaim): VerificationClaim => ({ ...claim, evidenceUris: ['evidence://changed'] })],
    ['verifier identity', (claim: VerificationClaim): VerificationClaim => ({ ...claim, verifierIdentity: 'reviewer-2' })],
    ['reducer identity', (claim: VerificationClaim): VerificationClaim => ({ ...claim, reducerIdentity: 'independent-reducer-2' })],
  ])('stales review on VerificationClaim %s mutation', (_name, mutate) => {
    const fresh = completedLedger();
    expect(() => assertWorkLedger({ ...fresh, verificationClaims: [mutate(fresh.verificationClaims[0])] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('receipt/evidence binding is stale');
  });
  it('keeps review fresh across semantically identical set and object-key order permutations', () => {
    const value = completedLedger();
    const receipt: WorkerReceipt = {
      ...value.receipts[0],
      filesChanged: ['packages/engine/test/contracts.test.ts', 'packages/engine/src/contracts.ts'],
      artifactUris: ['artifact://b', 'artifact://a'],
      artifactHashes: ['b'.repeat(64), hash],
      logUris: ['log://b', 'log://a'],
      logHashes: ['b'.repeat(64), hash],
      testEvidenceUris: ['evidence://test-b', 'evidence://test-a'],
      testEvidenceHashes: ['b'.repeat(64), hash],
    };
    const claim: VerificationClaim = {
      ...value.verificationClaims[0],
      evidenceUris: ['evidence://b', 'evidence://a'],
      evidenceHashes: ['b'.repeat(64), hash],
    };
    const fresh = withFreshReview({ ...value, receipts: [receipt], verificationClaims: [claim] });
    const reorderedReceipt: WorkerReceipt = {
      completedAt: receipt.completedAt,
      startedAt: receipt.startedAt,
      testEvidenceHashes: [hash, 'b'.repeat(64)],
      testEvidenceUris: ['evidence://test-a', 'evidence://test-b'],
      logHashes: [hash, 'b'.repeat(64)],
      logUris: ['log://a', 'log://b'],
      exitCodes: receipt.exitCodes,
      commands: receipt.commands.map((command) => ({ cwd: command.cwd, args: [...command.args], executable: command.executable })),
      filesChanged: [...receipt.filesChanged].reverse(),
      artifactHashes: [hash, 'b'.repeat(64)],
      artifactUris: ['artifact://a', 'artifact://b'],
      diffSha256: receipt.diffSha256,
      model: receipt.model,
      host: receipt.host,
      workerIdentity: receipt.workerIdentity,
      assignmentId: receipt.assignmentId,
      receiptId: receipt.receiptId,
    };
    const reorderedClaim: VerificationClaim = {
      outcome: claim.outcome,
      reducerResult: claim.reducerResult,
      reducerIdentity: claim.reducerIdentity,
      verifierIdentity: claim.verifierIdentity,
      evidenceHashes: [hash, 'b'.repeat(64)],
      evidenceUris: ['evidence://a', 'evidence://b'],
      platformVersion: claim.platformVersion,
      platform: claim.platform,
      host: claim.host,
      probe: { durationMs: claim.probe.durationMs, exitCode: claim.probe.exitCode, command: { cwd: claim.probe.command.cwd, args: [...claim.probe.command.args], executable: claim.probe.command.executable } },
      verificationProfile: claim.verificationProfile,
      receiptId: claim.receiptId,
      criterionId: claim.criterionId,
      requirementId: claim.requirementId,
      claim: claim.claim,
      claimId: claim.claimId,
    };
    expect(() => assertWorkLedger({ ...fresh, receipts: [reorderedReceipt], verificationClaims: [reorderedClaim] }, originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
  });
  it('keeps review fresh when receipt and claim collection ordering changes', () => {
    const value = completedLedger();
    const secondReceipt: WorkerReceipt = { ...value.receipts[0], receiptId: 'WR2', diffSha256: 'b'.repeat(64) };
    const secondClaim: VerificationClaim = {
      ...value.verificationClaims[0],
      claimId: 'VC2',
      receiptId: 'WR2',
      evidenceUris: ['evidence://second'],
      evidenceHashes: ['b'.repeat(64)],
    };
    const fresh = withFreshReview({
      ...value,
      receipts: [value.receipts[0], secondReceipt],
      verificationClaims: [value.verificationClaims[0], secondClaim],
    });
    expect(() => assertWorkLedger({
      ...fresh,
      receipts: [...fresh.receipts].reverse(),
      verificationClaims: [...fresh.verificationClaims].reverse(),
    }, originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
  });
  it('treats command execution order as reviewed semantics', () => {
    const value = completedLedger();
    const orderedReceipt: WorkerReceipt = {
      ...value.receipts[0],
      commands: [
        { executable: 'npm', args: ['run', 'typecheck'] },
        { executable: 'npm', args: ['test'] },
      ],
      exitCodes: [0, 1],
    };
    const fresh = withFreshReview({ ...value, receipts: [orderedReceipt] });
    const reorderedReceipt: WorkerReceipt = {
      ...orderedReceipt,
      commands: [...orderedReceipt.commands].reverse(),
      exitCodes: [...orderedReceipt.exitCodes].reverse(),
    };
    expect(() => assertWorkLedger({ ...fresh, receipts: [reorderedReceipt] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('receipt/evidence binding is stale');
  });
  it.each(['worker', 'reviewer', 'independent-reducer'])('rejects latest reviewer identity conflict with reviewed identity %s', (reviewerIdentity) => {
    const value = completedLedger();
    expect(() => assertWorkLedger({ ...value, latestReview: { ...value.latestReview, reviewerIdentity } }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('reviewer must be independent');
  });
  it('requires an open repair while needs-remediation', () => { const value = ledger(); expect(() => assertWorkLedger({ ...value, status: 'needs-remediation' }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('open repair'); });
  it('keeps a repaired slice open until independent review', () => {
    const value = ledger();
    expect(() => assertWorkLedger({ ...value, status: 'needs-remediation', repairSlices: [{ repairSliceId: 'RPR-1', status: 'PENDING_REVIEW', findingIds: ['F1'], reopenedCriterionIds: ['AC1'] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
  });
  it('blocks false completion with missing batches or evidence', () => { const value = ledger(); expect(() => assertWorkLedger({ ...value, status: 'COMPLETED', batches: [] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('non-empty'); });
  it('rejects unknown ledger and batch statuses', () => {
    expect(() => assertWorkLedger({ ...ledger(), status: 'UNKNOWN' as WorkLedger['status'] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('status is unknown');
    const value = ledger();
    expect(() => assertWorkLedger({ ...value, batches: [{ ...value.batches[0], status: 'UNKNOWN' as WorkLedger['batches'][number]['status'] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('batch status is unknown');
  });
  it('rejects ledger PlanAnchors that are forged or diverge from the physical plan', () => {
    expect(() => assertWorkLedger({ ...ledger(), planAnchors: [{ ...anchor, sectionHeading: 'Forged' }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('not canonical');
    expect(() => assertWorkLedger({ ...ledger(), planAnchors: [{ ...anchor, lineStart: 1.5 }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('invalid location');
  });
  it('requires independent evidence coverage for every acceptance criterion before COMPLETED', () => {
    expect(() => assertWorkLedger(completedLedger(), originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
    const value = completedLedger();
    const firstAssignment = value.assignments[0];
    const uncoveredCriterion = { ...firstAssignment.acceptanceCriteria[0], criterionId: 'AC2', claim: 'Second criterion is enforced.' };
    const expandedPlan = {
      ...value.plan,
      requirements: [{ ...value.plan.requirements[0], acceptanceCriteria: [...value.plan.requirements[0].acceptanceCriteria, uncoveredCriterion] }],
      taskDag: [{ ...value.plan.taskDag[0], criterionIds: [...value.plan.taskDag[0].criterionIds, 'AC2'] }],
    };
    expect(() => assertWorkLedger({ ...value, plan: expandedPlan, assignments: [{ ...firstAssignment, acceptanceCriteria: [...firstAssignment.acceptanceCriteria, uncoveredCriterion] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('every acceptance criterion');
  });
  it('requires exact plan task coverage and reconciled live AC claims before COMPLETED', () => {
    const value = completedLedger();
    const planWithT2 = { ...value.plan, taskDag: [...value.plan.taskDag, { taskId: 'T2', requirementIds: ['REQ-001'], criterionIds: ['AC1'], dependencies: [] }] };
    expect(() => assertWorkLedger({ ...value, plan: planWithT2 }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('exact plan task assignment coverage');
    expect(() => assertWorkLedger({ ...value, batches: [{ ...value.batches[0], taskIds: [] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('exact plan task batch coverage');
    expect(() => assertWorkLedger({ ...value, reconciliations: [{ ...value.reconciliations[0], verificationClaimIds: [] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('reconciled PASS claim');
  });
  it('rejects false completion when a claim profile or requirement owner differs from its criterion', () => {
    const value = completedTwoRequirementLedger();
    expect(() => assertWorkLedger(value, originalBytes, { 'tasks.md': tasksShadowBytes })).not.toThrow();
    const profileMismatch = { ...value.verificationClaims[0], verificationProfile: 'wrong-profile' };
    expect(() => assertWorkLedger({ ...value, verificationClaims: [profileMismatch, value.verificationClaims[1]] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('profile does not match');
    const crossBound = { ...value.verificationClaims[1], requirementId: 'REQ-001' };
    expect(() => assertWorkLedger({ ...value, verificationClaims: [value.verificationClaims[0], crossBound] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('cross-bound');
  });
  it.each(['packages/cli/forbidden.ts', 'outside-owned.txt'])('rejects false completion when receipt changes out-of-scope path %s', (changedPath) => {
    const value = completedLedger();
    expect(() => assertWorkLedger({ ...value, receipts: [{ ...value.receipts[0], filesChanged: [changedPath] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('outside assignment ownership');
  });
  it('rejects reconciliation references to forged anchors or missing claims', () => {
    const value = ledger();
    expect(() => assertWorkLedger({ ...value, reconciliations: [{ ...value.reconciliations[0], anchorIds: [hash] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('non-canonical');
    const completed = completedLedger();
    expect(() => assertWorkLedger({ ...completed, reconciliations: [{ ...completed.reconciliations[0], verificationClaimIds: ['VC-missing'] }] }, originalBytes, { 'tasks.md': tasksShadowBytes })).toThrow('non-canonical');
  });
  it('rejects valid but stale shadow hashes against supplied physical shadow bytes', () => {
    const staleBytes = new TextEncoder().encode('# Tasks\n\n- stale\n');
    expect(() => assertWorkLedger(ledger(), originalBytes, { 'tasks.md': staleBytes })).toThrow('shadow state is stale');
  });
  it('requires physical original and shadow bytes for executable ledger validation', () => {
    // @ts-expect-error evidence bytes are mandatory
    expect(() => assertWorkLedger(ledger(), originalBytes)).toThrow('physical shadow bytes are required');
    // @ts-expect-error original plan bytes are mandatory
    expect(() => assertPortablePlanIdentity(plan())).toThrow('physical original bytes are required');
  });
});

describe('assignment, receipt, claim, and manifest gates', () => {
  it('rejects duplicate task requirements and unanchored work', () => {
    const value = assignment();
    expect(() => assertTaskAssignment({ ...value, requirementIds: ['REQ-001', 'REQ-001'] }, plan(), originalBytes)).toThrow('duplicates');
    expect(() => assertTaskAssignment({ ...value, anchors: [] }, plan(), originalBytes)).toThrow('anchors');
  });
  it('requires every acceptance criterion to bind a canonical PlanAnchor or approved amendment', () => {
    const value = assignment();
    expect(() => assertTaskAssignment({ ...value, acceptanceCriteria: [{ ...value.acceptanceCriteria[0], binding: { kind: 'plan-anchor', anchor: { ...anchor, lineEnd: 3 } } }] }, plan(), originalBytes)).toThrow('physical bytes mismatch');
    expect(() => assertTaskAssignment({ ...value, acceptanceCriteria: [{ ...value.acceptanceCriteria[0], binding: { kind: 'approved-amendment', amendmentId: 'AM-1' } }] }, plan(), originalBytes)).toThrow('unapproved');
    expect(() => assertTaskAssignment({ ...value, acceptanceCriteria: [{ ...value.acceptanceCriteria[0], binding: { kind: 'approved-amendment', amendmentId: 'AM-1' } }] }, plan(), originalBytes, new Set(['AM-1']))).not.toThrow();
    expect(() => assertTaskAssignment({ ...value, acceptanceCriteria: [{ ...value.acceptanceCriteria[0], claim: 'Drifted semantics.' }] }, plan(), originalBytes)).toThrow('semantics do not match');
  });
  it('binds assignments to a physically validated plan task and its exact dependencies', () => {
    const value = assignment();
    expect(() => assertTaskAssignment({ ...value, taskId: 'T-missing' }, plan(), originalBytes)).toThrow('absent from the plan DAG');
    expect(() => assertTaskAssignment({ ...value, dependencies: ['T-missing'] }, plan(), originalBytes)).toThrow('dependencies does not match');
    const forgedBytes = new TextEncoder().encode('# Forged\n\n## Requirement\nDo the work.\n');
    const forgedAnchorBytes = new TextEncoder().encode('## Requirement\nDo the work.\n');
    expect(() => assertTaskAssignment(value, planForOriginal(forgedBytes, forgedAnchorBytes), originalBytes)).toThrow('physical bytes mismatch');
    expect(() => assertPlanAnchor(anchor, planHash, forgedBytes)).toThrow('physical bytes do not match');
  });
  it('validates normalized owned and forbidden path contracts', () => {
    const value = assignment();
    expect(() => assertTaskAssignment({ ...value, ownedPaths: ['/packages/engine'] }, plan(), originalBytes)).toThrow('absolute');
    expect(() => assertTaskAssignment({ ...value, ownedPaths: ['packages/engine', 'packages\\engine'] }, plan(), originalBytes)).toThrow('duplicate normalized');
    expect(() => assertTaskAssignment({ ...value, ownedPaths: ['packages/engine', 'PACKAGES/ENGINE'] }, plan(), originalBytes)).toThrow('duplicate normalized');
    expect(() => assertTaskAssignment({ ...value, ownedPaths: ['packages/CLI'], forbiddenPaths: ['packages/cli'] }, plan(), originalBytes)).toThrow('fully forbidden');
    expect(() => assertTaskAssignment({ ...value, ownedPaths: ['packages/engine'], forbiddenPaths: ['packages'] }, plan(), originalBytes)).toThrow('fully forbidden');
    expect(() => assertTaskAssignment({ ...value, forbiddenPaths: ['C:packages/cli'] }, plan(), originalBytes)).toThrow('drive path');
    expect(() => assertPortablePlanIdentity({ ...plan(), ownedPaths: ['packages/CLI'], forbiddenPaths: ['packages/cli'] }, originalBytes)).toThrow('fully forbidden');
  });
  it.each([
    'packages/CLI.',
    'packages/CLI /src',
    'packages/CON',
    'packages/con.txt/src',
    'packages/engine:metadata',
    'packages//engine',
    'packages/./engine',
    'packages/engine\u0085src',
    'packages/engine?',
  ])('rejects non-portable assignment contract path %s', (ownedPath) => {
    expect(() => assertTaskAssignment({ ...assignment(), ownedPaths: [ownedPath], forbiddenPaths: [] }, plan(), originalBytes)).toThrow();
  });
  it('accepts portable assignment contract names after Windows comparison folding', () => {
    expect(() => assertTaskAssignment({ ...assignment(), ownedPaths: ['PACKAGES/ENGINE'], forbiddenPaths: [] }, plan(), originalBytes)).not.toThrow();
    expect(() => assertTaskAssignment({ ...assignment(), ownedPaths: ['packages/đường dẫn'], forbiddenPaths: [] }, plan(), originalBytes)).not.toThrow();
  });
  it('does not expose physical-evidence bypasses in anchor, assignment, or claim validators', () => {
    // @ts-expect-error physical plan bytes are mandatory
    expect(() => assertPlanAnchor(anchor, planHash)).toThrow('physical original bytes are required');
    // @ts-expect-error physical plan bytes are mandatory
    expect(() => assertTaskAssignment(assignment(), plan())).toThrow('physical original bytes are required');
    // @ts-expect-error plan and physical bytes are mandatory
    expect(() => assertVerificationClaim(verificationClaim(), workerReceipt(), assignment())).toThrow('physical original bytes are required');
  });
  it('rejects receipts without artifacts and mismatched command results', () => {
    const value = workerReceipt();
    expect(() => assertWorkerReceipt({ ...value, diffSha256: undefined }, assignment())).toThrow('diff or artifact');
    expect(() => assertWorkerReceipt({ ...value, filesChanged: [] }, assignment())).toThrow('filesChanged must be non-empty');
    expect(() => assertWorkerReceipt({ ...value, exitCodes: [] }, assignment())).toThrow('command results');
    expect(() => assertWorkerReceipt({
      ...value,
      diffSha256: undefined,
      artifactUris: ['artifact://report'],
      artifactHashes: [hash],
      filesChanged: [],
    }, assignment())).not.toThrow();
  });
  it.each([
    'packages/engine/../cli/forbidden.ts',
    'packages\\engine\\..\\cli\\forbidden.ts',
    '/packages/engine/src/contracts.ts',
    'C:\\repo\\packages\\engine\\src\\contracts.ts',
    'C:packages\\engine\\src\\contracts.ts',
    './C:packages/engine/src/contracts.ts',
    '.\\C:packages\\engine\\src\\contracts.ts',
    '\\\\server\\share\\contracts.ts',
    '.\\\\server\\share\\contracts.ts',
    '\\\\?\\C:\\repo\\contracts.ts',
    './packages/engine/src/contracts.ts',
    'packages/engine/./src/contracts.ts',
    'packages/engine//src/contracts.ts',
    'packages/engine/src/',
  ])('rejects traversal, empty or dot segments, absolute, drive, UNC, and device changed path %s', (changedPath) => {
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: [changedPath] }, assignment())).toThrow();
  });
  it.each([
    'packages/engine/src/CON',
    'packages/engine/src/con.txt',
    'packages/engine/src/PRN.log',
    'packages/engine/src/AUX',
    'packages/engine/src/nul.json',
    'packages/engine/src/COM1.ts',
    'packages/engine/src/com9',
    'packages/engine/src/COM¹',
    'packages/engine/src/com².txt',
    'packages/engine/src/CoM³.LOG',
    'packages/engine/src/LPT1.fixture',
    'packages/engine/src/lpt9',
    'packages/engine/src/LPT¹',
    'packages/engine/src/lpt².txt',
    'packages/engine/src/LpT³.log',
    'packages/engine/src/CONIN$',
    'packages/engine/src/conin$.txt',
    'packages/engine/src/ConOut$',
    'packages/engine/src/conout$.log',
    'packages/engine/src/CLOCK$',
    'packages/engine/src/clock$.txt',
    'packages/engine/src/contracts.ts:metadata',
    'packages/engine/src/contracts.ts ',
    'packages/engine/src/contracts.ts.',
    'packages/engine./src/contracts.ts',
    'packages/engine/src/bad?.ts',
    'packages/engine/src/control\u0085.ts',
  ])('rejects non-portable Windows path alias %s', (changedPath) => {
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: [changedPath] }, assignment())).toThrow();
  });
  it.each([
    ['packages/engine/src/contracts.ts', 'PACKAGES/ENGINE/SRC/CONTRACTS.TS'],
    ['packages/engine/src/contracts.ts', 'packages\\engine\\src\\contracts.ts'],
  ])('rejects case-folded and normalized duplicate changed paths', (firstPath, aliasPath) => {
    expect(() => assertWorkerReceipt({
      ...workerReceipt(),
      filesChanged: [firstPath, aliasPath],
    }, assignment())).toThrow('duplicate normalized paths');
  });
  it('uses portable case-folded segment boundaries and accepts safe in-scope paths', () => {
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engineered/contracts.ts'] }, assignment())).toThrow('outside assignment ownership');
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages\\engine\\src\\contracts.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['PACKAGES/ENGINE/src/contracts.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/COM10.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/COM⁴.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/CONINPUT$.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/clockwork$.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/console.ts'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/.gitignore'] }, assignment())).not.toThrow();
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/engine/src/đường dẫn.ts'] }, assignment())).not.toThrow();
    const exactFileAssignment = { ...assignment(), ownedPaths: ['packages/engine/src/contracts.ts'], forbiddenPaths: [] };
    expect(() => assertWorkerReceipt(workerReceipt(), exactFileAssignment)).not.toThrow();
    const forbiddenAssignment = { ...assignment(), ownedPaths: ['packages'], forbiddenPaths: ['packages/CLI'] };
    expect(() => assertWorkerReceipt({ ...workerReceipt(), filesChanged: ['packages/cli/forbidden.ts'] }, forbiddenAssignment)).toThrow('forbidden');
  });
  it('rejects self-verification and PASS with a failed probe', () => {
    const value = verificationClaim();
    expect(() => assertVerificationClaim({ ...value, verifierIdentity: 'worker' }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('independent');
    expect(() => assertVerificationClaim({ ...value, probe: { ...value.probe, exitCode: 1 } }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('successful probe');
  });
  it('requires an explicit independent reducer and a reducer result that binds the outcome', () => {
    const value = verificationClaim();
    expect(() => assertVerificationClaim({ ...value, reducerIdentity: 'worker' }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('reducer must be independent');
    expect(() => assertVerificationClaim({ ...value, reducerResult: 'FAIL' }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('reducer result must match');
  });
  it('rejects open-ended verification outcomes and a reducer that is also the verifier', () => {
    const value = verificationClaim();
    expect(() => assertVerificationClaim({ ...value, outcome: 'MAYBE' as VerificationClaim['outcome'] }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('closed enums');
    expect(() => assertVerificationClaim({ ...value, reducerResult: 'MAYBE' as VerificationClaim['reducerResult'] }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('closed enums');
    expect(() => assertVerificationClaim({ ...value, reducerIdentity: value.verifierIdentity }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('distinct from verifier');
  });
  it('binds verification claims to the selected criterion profile and requirement owner', () => {
    const value = verificationClaim();
    expect(() => assertVerificationClaim(value, workerReceipt(), assignment(), plan(), originalBytes)).not.toThrow();
    expect(() => assertVerificationClaim({ ...value, verificationProfile: 'wrong-profile' }, workerReceipt(), assignment(), plan(), originalBytes)).toThrow('profile does not match');
    const expanded = completedTwoRequirementLedger();
    expect(() => assertVerificationClaim({ ...expanded.verificationClaims[1], requirementId: 'REQ-001' }, expanded.receipts[0], expanded.assignments[0], expanded.plan, originalBytes)).toThrow('cross-bound');
  });
  it('rejects manifest dependency and routing references outside canonical registries', () => {
    const manifest: HarnessManifestV3 = {
      schema: 'harness/manifest', version: 3, manifestSha256: hash,
      subsystems: [{ subsystemId: 'engine', owner: 'engine-owner', capabilities: ['dispatch'] }],
      registries: { skills: [], behaviors: [], profiles: [] },
      capabilities: [{ capabilityId: 'dispatch', dependencies: [], requiredEvidence: ['receipt'], routingMetadata: {} }],
      contextBudgets: { global: 1500 },
      modelClasses: [{ classId: 'standard', approvedModels: ['gpt'], riskTiers: ['low', 'medium', 'high', 'critical'] }],
      approvedRouting: { low: 'standard', medium: 'standard', high: 'standard', critical: 'standard' },
      platformSupport: { codex: 'HOST_NATIVE', cursor: 'UNVERIFIED', antigravity: 'UNVERIFIED', grok: 'UNVERIFIED', opencode: 'UNVERIFIED' },
      sourceIntegrity: [{ sourceId: 'engine', uri: 'repo://agent-rules', commit: 'deadbeef', sha256: hash }],
    };
    expect(() => assertHarnessManifestV3(manifest)).not.toThrow();
    expect(() => assertHarnessManifestV3({ ...manifest, capabilities: [{ ...manifest.capabilities[0], dependencies: ['missing'] }] })).toThrow('capability graph');
    expect(() => assertHarnessManifestV3({ ...manifest, approvedRouting: { low: 'missing' } })).toThrow('unknown model class');
    expect(() => assertHarnessManifestV3({ ...manifest, capabilities: [
      { capabilityId: 'dispatch', dependencies: ['verify'], requiredEvidence: ['receipt'], routingMetadata: {} },
      { capabilityId: 'verify', dependencies: ['dispatch'], requiredEvidence: ['receipt'], routingMetadata: {} },
    ], subsystems: [{ subsystemId: 'engine', owner: 'engine-owner', capabilities: ['dispatch', 'verify'] }] })).toThrow('contains a cycle');
    expect(() => assertHarnessManifestV3({ ...manifest, approvedRouting: { low: 'standard', medium: 'standard', high: 'standard' } })).toThrow('coverage');
    expect(() => assertHarnessManifestV3({ ...manifest, modelClasses: [{ classId: 'standard', approvedModels: ['gpt'], riskTiers: ['low'] }] })).toThrow('incoherent');
  });
});
