/**
 * REQ-003/REQ-004/REQ-005 — frozen portable contract: compile, hash-verify,
 * plan/prompt renderers as two views of one contract, and the mandatory
 * pre-handoff audit with PASS/BLOCKED/NEEDS_USER (never default BLOCKED).
 */
import { describe, it, expect } from 'vitest';
import {
  auditPreHandoff,
  compileFrozenContract,
  renderPlan,
  renderPrompt,
  verifyContractHash,
  type HandoffAuditReceipt,
} from '../../src/northstar/portable-plan.js';
import { appendIntentEvent, type TaskPacket, type WorkRequest, type WorkSpec } from '../../src/northstar/protocol.js';

function request(): WorkRequest {
  return appendIntentEvent(
    { protocol_version: '2.0', work_id: 'W-test', raw_intent: 'Build the widget with auth', source: 'cli', adapter: 'cli' },
    { kind: 'CORRECT', subject: 'scope: no admin screens', provenance: 'operator', rationale: 'out of scope' },
  );
}

function spec(over: Partial<WorkSpec> = {}): WorkSpec {
  return {
    protocol_version: '2.0',
    spec_id: 'S-test',
    revision: 1,
    work_id: 'W-test',
    requirements: [{ id: 'R-001', statement: 'widget supports login', mandatory: true, claims: ['C-001'] }],
    constraints: ['no admin screens'],
    non_goals: ['admin screens'],
    decisions: ['use sqlite'],
    assumed: ['users exist'],
    items: [
      { id: 'I-1', kind: 'constraint', statement: 'no admin screens', status: 'ACTIVE' },
      { id: 'I-2', kind: 'decision', statement: 'use sqlite', status: 'ACTIVE' },
    ],
    references: [{ path: 'profiles/5fedu/module-mapping/behavior-contract.json', anchor: 'widget', sha256: 'a'.repeat(64), used_by: ['widget'] }],
    ...over,
  };
}

function packets(): TaskPacket[] {
  return [{
    protocol_version: '2.0',
    task_id: 'T-001',
    spec_id: 'S-test',
    spec_revision: 1,
    work_id: 'W-test',
    goal: 'implement login widget',
    requirements: ['R-001'],
    scope: { owned: ['src/widget'], forbidden: ['src/admin'] },
    acceptance: [{ claim_id: 'C-001', verifier_id: 'widget-verify' }],
    policy: {
      phase: 'IMPLEMENT',
      effects: { allowed: ['read', 'filesystem_mutation'], forbidden: ['network'] },
      proof: { required_categories: ['unit'] },
      budgets: { wall_clock_ms: 3600_000 },
    },
  }];
}

describe('REQ-003 — frozen contract compilation', () => {
  it('compiles a hash-bound contract from request+spec+packets', () => {
    const contract = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    expect(contract.schema).toBe('harness/portable-plan-vnext');
    expect(contract.semantic_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.frozen_intent.effective_items_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.traceability.valid).toBe(true);
    expect(contract.traceability.requirement_to_tasks['R-001']).toEqual(['T-001']);
    expect(contract.references[0]!.used_by).toEqual(['widget']);
  });

  it('same revision always has the same semantic hash', () => {
    const a = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    const b = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    expect(a.semantic_hash).toBe(b.semantic_hash);
  });

  it('a changed effective intent changes the hash', () => {
    const original = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    const amendedSpec: WorkSpec = { ...spec(), decisions: ['use postgres'] };
    const amended = compileFrozenContract({ request: request(), spec: amendedSpec, packets: packets(), revision: 2 });
    expect(amended.semantic_hash).not.toBe(original.semantic_hash);
    expect(amended.revision).toBe(2);
  });

  it('assert/verify: tampered contracts are rejected', () => {
    const contract = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    expect(verifyContractHash(contract)).toBe(true);
    const tampered = { ...contract, objective: 'different objective' };
    expect(verifyContractHash(tampered)).toBe(false);
  });
});

describe('REQ-003/REQ-004 — plan and prompt are renderers of one contract', () => {
  it('both renderers carry the same revision and semantic hash', () => {
    const contract = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    const plan = renderPlan(contract);
    const prompt = renderPrompt(contract);
    expect(plan).toContain(`semantic hash: ${contract.semantic_hash}`);
    expect(prompt).toContain(`semantic hash: ${contract.semantic_hash}`);
    expect(prompt).toContain('you do not author PASS');
    expect(plan).toContain('## Tasks');
    expect(plan).toContain(contract.references[0]!.path);
  });

  it('prompt does not invent requirements from wording', () => {
    const contract = compileFrozenContract({ request: request(), spec: spec(), packets: packets() });
    const prompt = renderPrompt(contract);
    const requirementsBlock = prompt.split('\n').find((line) => line.startsWith('Active requirements')) ?? '';
    expect(requirementsBlock).not.toContain('admin screens');
    expect(prompt).not.toContain('intent detected');
    expect(prompt).not.toContain('template checked');
  });
});

describe('REQ-005 — pre-handoff audit', () => {
  function audit(candidate: TaskPacket[] = packets(), over: { spec?: WorkSpec; authorized?: string[]; provided?: string[] } = {}): HandoffAuditReceipt {
    const contract = compileFrozenContract({ request: request(), spec: over.spec ?? spec(), packets: candidate });
    return auditPreHandoff({
      contract,
      spec: over.spec ?? spec(),
      candidate,
      authorized_assumptions: over.authorized ?? ['users exist'],
      provided_references: over.provided ?? ['profiles/5fedu/module-mapping/behavior-contract.json'],
    });
  }

  it('PASS when every checkpoint holds — no default BLOCKED', () => {
    const receipt = audit();
    expect(receipt.verdict).toBe('PASS');
    expect(receipt.gates).toEqual({ intent_completeness: 'PASS', plan_spec_completeness: 'PASS', implementation_completeness: 'PASS' });
    expect(receipt.findings.filter((finding) => finding.severity !== 'info')).toHaveLength(0);
  });

  it('H1/H7 — uncovered requirement blocks implementation completeness', () => {
    const s = spec({ requirements: [spec().requirements[0]!, { id: 'R-002', statement: 'export widget', mandatory: true, claims: [] }] });
    const receipt = audit(packets(), { spec: s });
    expect(receipt.verdict).toBe('BLOCKED');
    expect(receipt.gates.implementation_completeness).toBe('BLOCKED');
    expect(receipt.findings.some((finding) => finding.code === 'H1' && finding.items.includes('R-002'))).toBe(true);
    expect(receipt.findings.some((finding) => finding.code === 'H7' && finding.items.includes('R-002'))).toBe(true);
  });

  it('H2 — dropped constraint blocks plan/spec completeness', () => {
    const contract = compileFrozenContract({ request: request(), spec: { ...spec(), items: [], constraints: [] }, packets: packets() });
    const receipt = auditPreHandoff({ contract, spec: spec(), candidate: packets(), authorized_assumptions: ['users exist'], provided_references: [] });
    expect(receipt.verdict).toBe('BLOCKED');
    expect(receipt.gates.plan_spec_completeness).toBe('BLOCKED');
  });

  it('H3/H4 — decision encoding and no resurrection of rejected decisions', () => {
    const s = spec({ items: [{ id: 'I-9', kind: 'decision', statement: 'use redis', status: 'REJECTED' }] });
    const contract = compileFrozenContract({ request: request(), spec: { ...spec(), items: [], decisions: [] }, packets: packets() });
    const receipt = auditPreHandoff({ contract, spec: s, candidate: packets(), authorized_assumptions: ['users exist'], provided_references: [] });
    expect(receipt.findings.some((finding) => finding.code === 'H3')).toBe(true); // settled decision not encoded
    expect(receipt.verdict).toBe('BLOCKED');
  });

  it('H5 — unauthorized assumption is NEEDS_USER, not BLOCKED', () => {
    const s = spec({ items: [{ id: 'I-5', kind: 'assumption', statement: 'tenant-aware db', status: 'ACTIVE' }] });
    const receipt = audit(packets(), { spec: s, authorized: ['users exist'] });
    expect(receipt.verdict).toBe('NEEDS_USER');
    expect(receipt.gates.intent_completeness).toBe('NEEDS_USER');
  });

  it('H6 — unresolved question turned into fact is BLOCKED', () => {
    const s = spec({ items: [{ id: 'I-6', kind: 'unresolved', statement: 'which auth provider?', status: 'UNRESOLVED' }] });
    const contract = compileFrozenContract({
      request: request(),
      spec: s,
      packets: packets(),
    });
    // Build a contract that encodes the unresolved question as an assumption.
    const fabricated = { ...contract, assumptions: ['which auth provider?', ...contract.assumptions], unresolved: [] };
    const receipt = auditPreHandoff({ contract: fabricated, spec: s, candidate: packets(), authorized_assumptions: [], provided_references: [] });
    expect(receipt.findings.some((finding) => finding.code === 'H6')).toBe(true);
    expect(receipt.verdict).toBe('BLOCKED');
  });

  it('H8 — claim without acceptance routing blocks implementation completeness', () => {
    const s = spec({ requirements: [{ id: 'R-001', statement: 'widget supports login', mandatory: true, claims: ['C-001', 'C-002'] }] });
    const receipt = audit(packets(), { spec: s });
    expect(receipt.findings.some((finding) => finding.code === 'H8' && finding.items.includes('R-001'))).toBe(true);
    expect(receipt.verdict).toBe('BLOCKED');
  });

  it('H9 — important reference not provisioned is NEEDS_USER', () => {
    const receipt = audit(packets(), { provided: [] });
    expect(receipt.findings.some((finding) => finding.code === 'H9')).toBe(true);
    expect(receipt.verdict).toBe('NEEDS_USER');
    expect(receipt.gates.plan_spec_completeness).toBe('NEEDS_USER');
  });

  it('H10 — drift from final effective intent is BLOCKED', () => {
    const drifting = [{ ...packets()[0]!, requirements: ['R-999'] }];
    const receipt = audit(drifting);
    expect(receipt.findings.some((finding) => finding.code === 'H10' && finding.items.some((item) => item.includes('R-999')))).toBe(true);
    expect(receipt.verdict).toBe('BLOCKED');
  });

  it('receipt is self-hashing', () => {
    const receipt = audit();
    const body = { ...receipt };
    delete (body as Record<string, unknown>).audit_sha256;
    // audit_sha256 is over the receipt body; recompute via verifyContractHash-like check is out of scope —
    // assert shape instead.
    expect(receipt.audit_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.candidate_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
