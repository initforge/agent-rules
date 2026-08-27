import { describe, expect, it } from 'vitest';
import {
  compileSlices,
  nextRouteAfterFailures,
  assertNoSingleWorkerSelfClosure,
  assertClassAtLeast,
  assertHostRoleSymmetry,
  assignRoleForRun,
  RUN_ROLES,
  CAPABILITY_CLASS_CONTRACT,
} from '../src/northstar/capability-routing.js';
import { HOST_CAPABILITIES, type HostId } from '../src/northstar/host-adapters.js';

describe('capability-based routing (provider-agnostic)', () => {
  it('keeps planner/researcher responsibilities distinct from bounded worker slices', () => {
    expect(CAPABILITY_CLASS_CONTRACT['planner-researcher'].handles_ambiguity).toBe(true);
    expect(CAPABILITY_CLASS_CONTRACT['planner-researcher'].owns_final_quality).toBe(true);
    expect(CAPABILITY_CLASS_CONTRACT['economy-worker'].handles_architecture).toBe(false);
    expect(CAPABILITY_CLASS_CONTRACT['implementation-worker'].owns_final_quality).toBe(false);
  });

  it('escalates after two same-cause failures and never routes downward', () => {
    const first = nextRouteAfterFailures('economy-worker', [{ slice_id: 's1', cause_class: 'timeout' }]);
    expect(first.escalated).toBe(false);
    const escalated = nextRouteAfterFailures('economy-worker', [
      { slice_id: 's1', cause_class: 'timeout' },
      { slice_id: 's1', cause_class: 'timeout' },
    ]);
    expect(escalated.route).toBe('implementation-worker');
    expect(escalated.escalated).toBe(true);
    const toPlanner = nextRouteAfterFailures('implementation-worker', [
      { slice_id: 's2', cause_class: 'architecture-gap' },
      { slice_id: 's3', cause_class: 'architecture-gap' },
      { slice_id: 's4', cause_class: 'architecture-gap' },
    ]);
    expect(toPlanner.route).toBe('planner-researcher');
    const capped = nextRouteAfterFailures('planner-researcher', [
      { slice_id: 's5', cause_class: 'x' },
      { slice_id: 's6', cause_class: 'x' },
    ]);
    expect(capped.route).toBe('planner-researcher');
    expect(capped.reason).toMatch(/owner decision/);
  });

  it('forbids a single non-planner worker from self-closing a multi-slice task', () => {
    expect(() => assertNoSingleWorkerSelfClosure({ slice_count: 4, worker_class: 'economy-worker', self_verified_closure: true })).toThrow(/self-certification/);
    expect(() => assertNoSingleWorkerSelfClosure({ slice_count: 4, worker_class: 'planner-researcher', self_verified_closure: true })).not.toThrow();
    expect(() => assertNoSingleWorkerSelfClosure({ slice_count: 1, worker_class: 'economy-worker', self_verified_closure: true })).not.toThrow();
  });

  it('compiles one mega-plan into dependency slices without losing any requirement', () => {
    const reqs = ['R1', 'R2', 'R3', 'R4'];
    const slices = compileSlices({ primary_outcome_id: 'PO-9', requirement_ids: reqs });
    const covered = slices.flatMap((s) => s.requirement_ids);
    for (const r of reqs) expect(covered).toContain(r);
    // dependency order foundation -> primary -> proof -> secondary
    expect(slices[0].kind).toBe('foundation');
    expect(slices[1].depends_on).toContain(slices[0].id);
    expect(slices[2].depends_on).toContain(slices[1].id);
    expect(slices[3].depends_on).toContain(slices[2].id);
  });

  it('enforces minimum capability class per slice', () => {
    expect(() => assertClassAtLeast('economy-worker', 'planner-researcher')).toThrow(/escalation required/);
    expect(() => assertClassAtLeast('planner-researcher', 'economy-worker')).not.toThrow();
  });

  it('host-role symmetry: all 9 canonical hosts are eligible for every run role (steering §4)', () => {
    assertHostRoleSymmetry();
    const hosts = Object.keys(HOST_CAPABILITIES) as HostId[];
    expect(hosts).toHaveLength(9);
    for (const role of RUN_ROLES) {
      const assignment = assignRoleForRun({
        run_id: 'run-1',
        role,
        candidates: [...hosts].reverse(), // any evidence-ranked order is legal
        assignment_basis: 'verified-task evidence ranking',
      });
      expect(hosts).toContain(assignment.assigned_host);
    }
    // per-run assignment, never a fixed host identity: a different candidate
    // order assigns a different host to the same role.
    const a = assignRoleForRun({ run_id: 'r1', role: 'planner', candidates: ['claude', 'codex'], assignment_basis: 'evidence-a' });
    const b = assignRoleForRun({ run_id: 'r2', role: 'planner', candidates: ['codex', 'claude'], assignment_basis: 'evidence-b' });
    expect(a.assigned_host).not.toBe(b.assigned_host);
  });

  it('rejects unknown hosts and empty candidate sets in role assignment', () => {
    expect(() => assignRoleForRun({ run_id: 'r', role: 'tester', candidates: [], assignment_basis: 'x' })).toThrow(/empty candidate/);
    expect(() => assignRoleForRun({ run_id: 'r', role: 'tester', candidates: ['not-a-host' as HostId], assignment_basis: 'x' })).toThrow(/unknown host id/);
  });
});
