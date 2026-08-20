import { describe, expect, it } from 'vitest';
import {
  assessFreshness,
  assessVerification,
  buildProgressSnapshot,
  classifyPlanRelation,
  computeReachableFrontier,
  createCompactProgressReceipt,
  evaluateTerminal,
  rejectCandidateTask,
  type FrontierTask,
  type ProgressItem,
} from '../src/northstar/reachable-progress.js';

function item(overrides: Partial<ProgressItem> = {}): ProgressItem {
  return {
    id: 'REQ-001',
    kind: 'requirement',
    activeScope: true,
    implementationState: 'IMPLEMENTED',
    verificationState: 'PASS',
    evidenceState: 'COMPLETE',
    certificationState: 'MATCH',
    blockerKind: null,
    minimumRequiredLevel: 'L3',
    strongestAvailableLevel: 'L3',
    dependents: [],
    dependencies: [],
    nextLocalAction: 'none',
    ...overrides,
  };
}

function task(overrides: Partial<FrontierTask> = {}): FrontierTask {
  return {
    id: 'T-001',
    activeScope: true,
    implementationState: 'TODO',
    dependencies: [],
    dependencyStates: {},
    authorityAvailable: true,
    capabilityAvailable: true,
    nextLocalAction: 'implement bounded task',
    ...overrides,
  };
}

describe('reachable progress semantics', () => {
  it('keeps safe implementation separate from unavailable final proof', () => {
    const assessment = assessVerification({
      minimumRequiredLevel: 'L5',
      strongestAvailableLevel: 'L3',
      verificationState: 'UNAVAILABLE',
      capabilityAvailable: false,
    });
    expect(assessment).toMatchObject({ state: 'UNAVAILABLE', sufficient: false, blockerKind: 'VERIFY_UNAVAILABLE' });
    expect(assessment.state).not.toBe('PASS');
  });

  it('blocks authority work without converting it into verification failure', () => {
    const frontier = computeReachableFrontier([task({ id: 'T-AUTH', authorityAvailable: false })]);
    expect(frontier.blockedTaskIds).toEqual(['T-AUTH']);
    expect(frontier.executableTaskIds).toEqual([]);
    expect(evaluateTerminal({
      items: [item({ id: 'T-AUTH', kind: 'task', implementationState: 'BLOCKED_AUTHORITY', blockerKind: 'AUTHORITY', resumeCondition: 'owner grants the missing authority' })],
      frontier,
    }).executionState).toBe('TERMINAL_BLOCKED');
  });

  it('continues independent work beside a failing dependency closure', () => {
    const frontier = computeReachableFrontier([
      task({ id: 'T-FAILED', implementationState: 'IMPLEMENTED_FAILING' }),
      task({ id: 'T-DEPENDENT', dependencies: ['T-FAILED'], dependencyStates: { 'T-FAILED': 'IMPLEMENTED_FAILING' } }),
      task({ id: 'T-INDEPENDENT' }),
    ]);
    expect(frontier.blockedTaskIds).toEqual(['T-DEPENDENT']);
    expect(frontier.executableTaskIds).toEqual(['T-INDEPENDENT']);
  });

  it('rejects candidate backlog as NOT_IN_ACTIVE_SCOPE', () => {
    const rejection = rejectCandidateTask('AM-010-A1');
    const frontier = computeReachableFrontier([task({ id: 'AM-010-A1', activeScope: false })]);
    expect(rejection.code).toBe('NOT_IN_ACTIVE_SCOPE');
    expect(frontier.candidateTaskIds).toEqual(['AM-010-A1']);
    expect(frontier.rejectedCandidates[0]).toMatchObject({ code: 'NOT_IN_ACTIVE_SCOPE', resumable: false });
  });

  it('does not invalidate source evidence for metadata-only changes', () => {
    const freshness = assessFreshness({
      changedSurfaces: ['plan-metadata'],
      dependencies: [
        { evidenceId: 'source-unit', dependsOn: ['source', 'test', 'runtime'] },
        { evidenceId: 'plan-projection', dependsOn: ['plan-metadata', 'projection'] },
      ],
    });
    expect(freshness.preservedEvidenceIds).toEqual(['source-unit']);
    expect(freshness.invalidatedEvidenceIds).toEqual(['plan-projection']);
  });

  it('terminalizes after frontier exhaustion instead of looping on MATCH < 100%', () => {
    const snapshot = buildProgressSnapshot({
      sourceIdentity: 'source-sha',
      planId: 'phase-new-fixture',
      planRevision: 75,
      items: [item({ id: 'REQ-001', verificationState: 'UNAVAILABLE', evidenceState: 'LOCAL', certificationState: 'PARTIAL' })],
    });
    const frontier = computeReachableFrontier([]);
    const terminal = evaluateTerminal({ items: snapshot.items, frontier, resumeConditions: ['run native L5 capability when host is available'] });
    const receipt = createCompactProgressReceipt({
      snapshot,
      affectedScope: ['REQ-001'],
      claimCoverage: ['CLAIM-REQ-001-1'],
      strongestVerificationLevel: 'L3',
      fresh: true,
      blocker: 'VERIFY_UNAVAILABLE',
      artifactUri: '.agent/evidence/progress-receipt.json',
      terminal,
    });
    expect(terminal.executionState).toBe('TERMINAL_PARTIAL');
    expect(terminal.terminalReason).toMatch(/frontier is exhausted/);
    expect(receipt.resumeConditions).toHaveLength(1);
    expect(receipt.schema).toBe('harness/compact-progress-receipt/v1');
  });

  it('preserves old/new lineage when classifying relations', () => {
    expect(classifyPlanRelation({ sameOutcome: true }).relation).toBe('OVERLAPPING_SAME_OUTCOME');
    expect(classifyPlanRelation({ conflictsWithSpec: true }).relation).toBe('CONFLICTING_SPEC');
    expect(classifyPlanRelation({ providerSpecific: true }).relation).toBe('PROVIDER_VARIANT');
    expect(classifyPlanRelation({}).relation).toBe('COMPATIBLE');
  });
});
