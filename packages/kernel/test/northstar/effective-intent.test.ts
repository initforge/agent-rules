/**
 * REQ-001/REQ-002/REQ-006/REQ-007 — effective intent events, effective
 * WorkSpec items, TaskPacket execution policy, and the model observation
 * contract. Legacy artifacts must remain readable; Markdown/projections must
 * never be parsed back into canonical truth.
 */
import { describe, it, expect } from 'vitest';
import {
  appendIntentEvent,
  assertSpecExecutable,
  assertTaskPacket,
  assertWorkRequest,
  assertWorkSpec,
  effectiveSpecItems,
  unresolvedItems,
  type TaskPacket,
  type WorkRequest,
  type WorkSpec,
} from '../../src/northstar/protocol.js';
import { observeModelFromLegacyManifest } from '../../src/northstar/model-governor.js';

function request(over: Partial<WorkRequest> = {}): WorkRequest {
  return {
    protocol_version: '2.0',
    work_id: 'W-test',
    raw_intent: 'Implement the widget',
    source: 'cli',
    ...over,
  };
}

function spec(over: Partial<WorkSpec> = {}): WorkSpec {
  return {
    protocol_version: '2.0',
    spec_id: 'S-test',
    revision: 1,
    work_id: 'W-test',
    requirements: [{ id: 'R-001', statement: 'widget exists', mandatory: true, claims: ['C-001'] }],
    ...over,
  };
}

function packet(over: Partial<TaskPacket> = {}): TaskPacket {
  return {
    protocol_version: '2.0',
    task_id: 'T-001',
    spec_id: 'S-test',
    spec_revision: 1,
    goal: 'build widget',
    requirements: ['R-001'],
    scope: { owned: ['src/widget'], forbidden: [] },
    acceptance: [{ claim_id: 'C-001', verifier_id: 'widget-verify' }],
    ...over,
  };
}

describe('REQ-001 — intent events are append-only', () => {
  it('accepts a legacy request without intent_events', () => {
    expect(() => assertWorkRequest(request())).not.toThrow();
  });

  it('validates event kinds, ids and provenance', () => {
    const r = request({ intent_events: [{ id: 'IE-1', kind: 'ADD', subject: 'add auth', provenance: 'operator' }] });
    expect(() => assertWorkRequest(r)).not.toThrow();
    const bad = request({ intent_events: [{ id: 'IE-1', kind: 'NOPE', subject: 'x', provenance: 'y' }] });
    expect(() => assertWorkRequest(bad)).toThrow(/kind is invalid/);
    const dup = request({ intent_events: [{ id: 'IE-1', kind: 'ADD', subject: 'a', provenance: 'o' }, { id: 'IE-1', kind: 'ADD', subject: 'b', provenance: 'o' }] });
    expect(() => assertWorkRequest(dup)).toThrow(/duplicate event id/);
  });

  it('appendIntentEvent never mutates the input and stamps deterministic ids', () => {
    const r = request();
    const next = appendIntentEvent(r, { kind: 'CORRECT', subject: 'drop auth', provenance: 'operator', rationale: 'out of scope' });
    expect(r.intent_events).toBeUndefined();
    expect(next.intent_events).toHaveLength(1);
    expect(next.intent_events![0]!.id).toMatch(/^IE-/);
    expect(next.intent_events![0]!.kind).toBe('CORRECT');
    expect(next.intent_events![0]!.at).toBeTruthy();
    const again = appendIntentEvent(next, { kind: 'CONFIRM', subject: 'drop auth', provenance: 'operator' });
    expect(again.intent_events).toHaveLength(2);
  });
});

describe('REQ-002 — effective WorkSpec items', () => {
  it('normalizes legacy string arrays into ACTIVE items', () => {
    const s = spec({ constraints: ['no network'], decisions: ['use sqlite'], assumed: ['users exist'] });
    const items = effectiveSpecItems(s);
    expect(items).toContainEqual(expect.objectContaining({ kind: 'constraint', statement: 'no network', status: 'ACTIVE' }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'decision', statement: 'use sqlite', status: 'ACTIVE' }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'assumption', statement: 'users exist', status: 'ACTIVE' }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'requirement', id: 'R-001', status: 'ACTIVE' }));
  });

  it('structured items carry authoritative status', () => {
    const s = spec({
      decisions: ['use sqlite'],
      items: [
        { id: 'I-1', kind: 'decision', statement: 'use sqlite', status: 'REJECTED', rationale: 'owner changed mind' },
        { id: 'I-2', kind: 'constraint', statement: 'no network', status: 'ACTIVE' },
        { id: 'I-3', kind: 'unresolved', statement: 'which auth provider?', status: 'UNRESOLVED' },
      ],
    });
    const items = effectiveSpecItems(s);
    const decision = items.find((item) => item.id === 'I-1')!;
    expect(decision.status).toBe('REJECTED');
    expect(items).toHaveLength(4);
  });

  it('never parses projections back into truth: unknown keys fail closed', () => {
    expect(() => assertWorkSpec({ ...spec(), markdown_truth: 'x' } as unknown as WorkSpec)).toThrow(/unknown field/);
  });

  it('rejected requirements are not active', () => {
    const s = spec({ requirements: [{ id: 'R-001', statement: 'widget exists', mandatory: true, claims: ['C-001'], status: 'REJECTED' }] });
    const active = effectiveSpecItems(s).filter((item) => item.status === 'ACTIVE');
    expect(active.find((item) => item.id === 'R-001')).toBeUndefined();
  });

  it('unresolvedItems aggregates legacy strings and UNRESOLVED items', () => {
    const s = spec({
      unresolved: ['legacy blocker'],
      requires_user: ['needs owner decision'],
      items: [{ id: 'I-1', kind: 'unresolved', statement: 'structured blocker', status: 'UNRESOLVED' }],
      requirements: [{ id: 'R-001', statement: 'widget exists', mandatory: true, claims: ['C-001'], status: 'UNRESOLVED' }],
    });
    expect(unresolvedItems(s)).toEqual(expect.arrayContaining(['legacy blocker', 'needs owner decision', 'structured blocker', 'widget exists']));
    expect(() => assertSpecExecutable(s)).toThrow(/cannot execute unresolved WorkSpec/);
  });

  it('assertSpecExecutable passes for a fully resolved spec', () => {
    expect(() => assertSpecExecutable(spec())).not.toThrow();
  });

  it('work references are validated', () => {
    const good = spec({ references: [{ path: 'profiles/5fedu/module-mapping/behavior-contract.json', anchor: 'REQ-1', sha256: 'a'.repeat(64), used_by: ['widget'] }] });
    expect(() => assertWorkSpec(good)).not.toThrow();
    const bad = spec({ references: [{ path: '../escape' }] });
    expect(() => assertWorkSpec(bad)).not.toThrow(); // path safety is enforced by the broker, not the schema
    const badHash = spec({ references: [{ path: 'x', sha256: 'not-a-hash' }] });
    expect(() => assertWorkSpec(badHash)).toThrow(/sha256/);
  });
});

describe('REQ-006 — TaskPacket execution policy', () => {
  it('accepts a packet with a full execution policy', () => {
    const p = packet({
      policy: {
        phase: 'IMPLEMENT',
        effects: { allowed: ['read', 'filesystem_mutation'], forbidden: ['network', 'destructive'], mcp_integration_ids: ['context7'] },
        capabilities: ['docs.lookup'],
        resources: { memory_mb: 1024, cpu_share: 0.5 },
        budgets: { wall_clock_ms: 3600_000, max_steps: 40, max_tool_calls: 200, max_retries: 3, max_repair_rounds: 2 },
        concurrency: { exclusive: true, shared_mutation_serialized: true },
        proof: { required_categories: ['unit', 'contract'] },
        recovery: { resume_allowed: true, checkpoint_interval_ms: 60_000 },
        stop_conditions: ['budget exhausted'],
        requires_strong_planner: false,
      },
    });
    expect(() => assertTaskPacket(p)).not.toThrow();
  });

  it('rejects a forbidden effect that is also allowed', () => {
    const p = packet({ policy: { phase: 'VERIFY', effects: { allowed: ['network'], forbidden: ['network'] } } });
    expect(() => assertTaskPacket(p)).toThrow(/both allowed and forbidden/);
  });

  it('rejects invalid phases, budgets and recovery fields', () => {
    expect(() => assertTaskPacket(packet({ policy: { phase: 'EXECUTE', effects: { allowed: ['read'], forbidden: [] } } }))).toThrow(/phase is invalid/);
    expect(() => assertTaskPacket(packet({ policy: { phase: 'CLOSE', effects: { allowed: ['read'], forbidden: [] }, budgets: { max_steps: 0 } } }))).toThrow(/max_steps/);
    expect(() => assertTaskPacket(packet({ policy: { phase: 'DISCOVER', effects: { allowed: ['read'], forbidden: [] }, recovery: { checkpoint_interval_ms: -1 } } }))).toThrow(/checkpoint_interval_ms/);
  });

  it('legacy packets without policy remain valid', () => {
    expect(() => assertTaskPacket(packet())).not.toThrow();
  });
});

describe('REQ-007 — model observation contract', () => {
  it('converts legacy approvedModels/approvedRouting into observations without authority', () => {
    const observations = observeModelFromLegacyManifest({
      modelClasses: [{ classId: 'standard', approvedModels: ['claude-sonnet', 'gpt-4o'] }],
      approvedRouting: { worker: 'standard', planner: 'expert' },
    });
    expect(observations).toHaveLength(3);
    const worker = observations.find((observation) => observation.role === 'worker')!;
    expect(worker.legacy?.routing_class).toBe('standard');
    expect(worker.legacy?.approved_models).toEqual(['claude-sonnet', 'gpt-4o']);
    expect(worker.source).toBe('unknown');
    expect(worker.requested).toBeNull();
    expect(worker.capability_proven).toBeNull();
  });

  it('handles manifests without routing tables', () => {
    const observations = observeModelFromLegacyManifest({});
    expect(observations.every((observation) => observation.legacy?.routing_class === null)).toBe(true);
  });
});
