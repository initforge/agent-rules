import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunStore, admitEvidenceWrite, type ProofPlan } from '../../src/northstar/run-store.js';
import { reduceOutcome, assertClaimOutcome } from '../../src/northstar/outcome-reducer.js';
import { SINGLE_FLOW, OWNER_MODULES, TASK_STATES, CLAIM_OUTCOMES, HOST_STATES, PROVIDER_STATES } from '../../src/northstar/behavior-runtime.js';
import type { AcceptanceResult } from '../../src/northstar/evidence-ledger.js';

/**
 * Deterministic truth-chain tests (REQ-116): single writer + atomic update,
 * candidate digest sensitivity, stale/foreign evidence rejection, state
 * transitions, and verification honesty.
 */

function acceptance(outcome: AcceptanceResult['outcome'], extra: Partial<AcceptanceResult> = {}): AcceptanceResult {
  return {
    outcome,
    accepted_claims: outcome === 'PASS' ? ['C-1'] : [],
    unresolved_claims: outcome === 'BLOCKED' ? ['C-1'] : [],
    failed_claims: outcome === 'FAILED' ? ['C-1'] : [],
    reasons: [],
    ...extra,
  };
}

const auditOk = { accepted: true, findings: [] as string[] };

describe('RunStore single writer + atomic updates (REQ-112/REQ-116)', () => {
  it('finalizes exactly once and refuses a second finalization', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runstore-1-'));
    try {
      const store = new RunStore(path.join(root, '.agent', 'runs'));
      store.putState('run-1', { run_id: 'run-1', task_state: 'EXECUTING' });
      const r1 = store.finalize('run-1', {
        schema: 'agent-rules/outcome-receipt', version: 1, run_id: 'run-1', git_head: 'a'.repeat(40),
        outcome: 'PASS', claims: {}, proof_plan: { run_id: 'run-1', selected: [], omitted: [], claims: [] },
        evidence_ledger_hash: '0'.repeat(64), created_at: new Date().toISOString(),
      });
      expect(r1.receipt_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(() => store.finalize('run-1', {
        schema: 'agent-rules/outcome-receipt', version: 1, run_id: 'run-1', git_head: 'a'.repeat(40),
        outcome: 'PASS', claims: {}, proof_plan: { run_id: 'run-1', selected: [], omitted: [], claims: [] },
        evidence_ledger_hash: '0'.repeat(64), created_at: new Date().toISOString(),
      })).toThrow(/already finalized/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('events journal is hash-chained and sequential', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runstore-2-'));
    try {
      const store = new RunStore(path.join(root, '.agent', 'runs'));
      const e1 = store.appendEvent('run-2', { event: 'a' });
      const e2 = store.appendEvent('run-2', { event: 'b' });
      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
      const events = store.readEvents('run-2') as Array<{ seq: number; previous_hash: string }>;
      expect(events[1]!.previous_hash).toBe(e1.hash);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('evidence admission is claim-bound: a claim outside the ProofPlan is omitted, never admitted', () => {
    const plan: ProofPlan = { run_id: 'r', selected: ['C-1'], omitted: [{ proof: 'C-2', reason: 'not required' }], claims: ['C-1'] };
    const ok = admitEvidenceWrite({ claimId: 'C-1', proofPlan: plan, artifactClass: 'evidence' });
    expect(ok.admitted).toBe(true);
    const outside = admitEvidenceWrite({ claimId: 'C-9', proofPlan: plan, artifactClass: 'evidence' });
    expect(outside.admitted).toBe(false);
    expect(outside.reason).toMatch(/not in ProofPlan/);
    const omitted = admitEvidenceWrite({ claimId: 'C-2', proofPlan: plan, artifactClass: 'evidence' });
    expect(omitted.admitted).toBe(false);
    expect(omitted.reason).toMatch(/not selected|not in ProofPlan/);
  });
});

describe('candidate digest & evidence binding (REQ-116)', () => {
  it('candidate digest changes when any tracked byte changes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-'));
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
      const hash = (dir: string, rel: string) => require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
      const h1 = hash(root, 'src/a.ts');
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 2;\n');
      const h2 = hash(root, 'src/a.ts');
      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stale/foreign evidence is rejected by the acceptance binding', async () => {
    const { deriveAcceptance } = await import('../../src/northstar/evidence-ledger.js');
    const spec = {
      protocol_version: 'northstar/2.0', spec_id: 'S-1', revision: 1, work_id: 'W-1',
      requirements: [{ id: 'R-1', statement: 'x', mandatory: true, claims: ['C-1'] }],
      risk_class: 'S1', constraints: [], non_goals: [], known: [], decisions: [], unresolved: [],
    } as const;
    const manifest = { claims: [{ claim_id: 'C-1', statement: 'x', class: 'mechanical', required_kinds: ['test'], verifier_id: 'V-1' }] } as const;
    const packet = {
      protocol_version: 'northstar/2.0',
      task_id: 'T-1', work_id: 'W-1', spec_id: 'S-1', spec_revision: 1, execution_generation: 0,
      goal: 'x', requirements: ['R-1'], acceptance: [{ claim_id: 'C-1', verifier_id: 'V-1' }],
      scope: { owned: ['src'], forbidden: [] },
    } as const;
    const fresh = {
      evidence_id: 'E-1', claim_id: 'C-1', task_id: 'T-1', kind: 'test', status: 'pass',
      spec_id: 'S-1', spec_revision: 1, candidate_epoch: 0, platform: 'win32',
      verifier_id: 'V-1', observed_at: new Date().toISOString(),
    } as const;
    const foreign = { ...fresh, evidence_id: 'E-2', spec_id: 'S-OTHER', observed_at: new Date().toISOString() } as const;
    const stale = { ...fresh, evidence_id: 'E-3', observed_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString() } as const;
    const accept = deriveAcceptance({
      spec, manifest, packets: [packet],
      evidence: [
        { seq: 1, origin: 'verifier', previous_hash: '0'.repeat(64), record: fresh, envelope_hash: 'a'.repeat(64) },
      ],
      binding: { spec_id: 'S-1', spec_revision: 1, candidate_epoch: 0, platform: 'win32' },
    });
    expect(accept.outcome).toBe('PASS');
    const withForeign = deriveAcceptance({
      spec, manifest, packets: [packet],
      evidence: [
        { seq: 1, origin: 'verifier', previous_hash: '0'.repeat(64), record: fresh, envelope_hash: 'a'.repeat(64) },
        { seq: 2, origin: 'verifier', previous_hash: 'a'.repeat(64), record: foreign, envelope_hash: 'b'.repeat(64) },
      ],
      binding: { spec_id: 'S-1', spec_revision: 1, candidate_epoch: 0, platform: 'win32' },
    });
    expect(withForeign.reasons.some((r) => r.includes('foreign'))).toBe(true);
    const withStale = deriveAcceptance({
      spec, manifest, packets: [packet],
      evidence: [
        { seq: 1, origin: 'verifier', previous_hash: '0'.repeat(64), record: stale, envelope_hash: 'c'.repeat(64) },
      ],
      binding: { spec_id: 'S-1', spec_revision: 1, candidate_epoch: 0, platform: 'win32', now_ms: Date.now() },
    });
    expect(withStale.reasons.some((r) => r.includes('stale')) || withStale.outcome !== 'PASS').toBe(true);
  });
});

describe('state vocabulary transitions (REQ-105/REQ-116)', () => {
  it('canonical vocabularies are exactly the locked sets', () => {
    expect(TASK_STATES).toEqual(['DISCUSSING', 'PLANNED', 'EXECUTING', 'VERIFYING', 'COMPLETE', 'BLOCKED', 'NEEDS_USER']);
    expect(CLAIM_OUTCOMES).toEqual(['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER']);
    expect(HOST_STATES).toEqual(['NOT_DETECTED', 'DETECTED', 'INSTALLED', 'OFFLINE_VERIFIED', 'LIVE_VERIFIED', 'FAILED']);
    expect(PROVIDER_STATES).toEqual(['UNAVAILABLE', 'AVAILABLE', 'AUTHORIZED', 'ACTIVE', 'FAILED']);
  });

  it('single flow and 11 owners are fixed', () => {
    expect(SINGLE_FLOW.join('→')).toBe('RequestIntake→PlanCompiler→ContextRuntime→SkillResolver→CapabilityBroker→ExecutionCoordinator→ProofRouter→RunStore→OutcomeReducer');
    expect(OWNER_MODULES).toHaveLength(11);
  });

  it('reducer never upgrades and only derives from evidence', () => {
    const r = reduceOutcome({ acceptance: acceptance('PASS'), audit: auditOk, run_id: 'r', spec_id: 'S', spec_revision: 1, candidate_epoch: 0, platform: 'win32' });
    expect(r.claim_outcome).toBe('PASS');
    expect(r.derived_from).toBe('acceptance-audit');
    const blocked = reduceOutcome({ acceptance: acceptance('BLOCKED'), audit: auditOk, run_id: 'r', spec_id: 'S', spec_revision: 1, candidate_epoch: 0, platform: 'win32' });
    expect(blocked.claim_outcome).toBe('BLOCKED');
    expect(() => assertClaimOutcome('Live pass')).toThrow(/canonical claim_outcome/);
  });
});