import { describe, expect, it } from 'vitest';
import {
  createEventDelta,
  verifyEventDeltaIntegrity,
  eventDeltaReceipt,
  reduceEventDeltas,
  idempotentInsert,
  type EventDelta,
  type EventDeltaInput,
} from '../src/event-delta.js';

function makeInput(overrides: Partial<EventDeltaInput> = {}): EventDeltaInput {
  return {
    sequence: 1,
    eventType: 'DISPATCH',
    actor: 'orchestrator',
    affectedRequirements: ['R-039'],
    affectedClaims: ['C-001'],
    previousState: { status: 'PENDING' },
    currentState: { status: 'DISPATCHED', worker: 'worker-1' },
    severity: 'INFO',
    candidateEpoch: 1_700_000_000_000,
    artifactRefs: [],
    wakeReason: null,
    ...overrides,
  };
}

describe('createEventDelta', () => {
  it('produces a frozen delta with SHA-256 event hash', () => {
    const delta = createEventDelta(makeInput());
    expect(delta.eventSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(delta)).toBe(true);
  });

  it('includes all required fields', () => {
    const delta = createEventDelta(makeInput());
    expect(delta.sequence).toBe(1);
    expect(delta.eventType).toBe('DISPATCH');
    expect(delta.actor).toBe('orchestrator');
    expect(delta.affectedRequirements).toEqual(['R-039']);
    expect(delta.affectedClaims).toEqual(['C-001']);
    expect(delta.severity).toBe('INFO');
    expect(delta.candidateEpoch).toBe(1_700_000_000_000);
    expect(delta.wakeReason).toBeNull();
  });

  it('freezes arrays and nested objects', () => {
    const delta = createEventDelta(makeInput());
    expect(Object.isFrozen(delta.affectedRequirements)).toBe(true);
    expect(Object.isFrozen(delta.affectedClaims)).toBe(true);
    expect(Object.isFrozen(delta.currentState)).toBe(true);
    expect(Object.isFrozen(delta.artifactRefs)).toBe(true);
  });

  it('defaults severity to INFO', () => {
    const delta = createEventDelta(makeInput({ severity: undefined }));
    expect(delta.severity).toBe('INFO');
  });

  it('defaults createdAt to now', () => {
    const before = Date.now() - 1000;
    const delta = createEventDelta(makeInput());
    const after = Date.now() + 1000;
    const created = new Date(delta.createdAt).getTime();
    expect(created).toBeGreaterThanOrEqual(before);
    expect(created).toBeLessThanOrEqual(after);
  });
});

describe('verifyEventDeltaIntegrity', () => {
  it('returns true for a valid delta', () => {
    const delta = createEventDelta(makeInput());
    expect(verifyEventDeltaIntegrity(delta)).toBe(true);
  });

  it('returns false when currentState is tampered', () => {
    const delta = createEventDelta(makeInput());
    const tampered = { ...delta, currentState: { status: 'TAMPERED' } };
    expect(verifyEventDeltaIntegrity(tampered as EventDelta)).toBe(false);
  });

  it('returns false when sequence is changed', () => {
    const delta = createEventDelta(makeInput());
    const tampered = { ...delta, sequence: 999 };
    expect(verifyEventDeltaIntegrity(tampered as EventDelta)).toBe(false);
  });
});

describe('eventDeltaReceipt', () => {
  it('returns a frozen receipt with essential fields', () => {
    const delta = createEventDelta(makeInput());
    const receipt = eventDeltaReceipt(delta);
    expect(receipt.eventSha256).toBe(delta.eventSha256);
    expect(receipt.sequence).toBe(1);
    expect(receipt.eventType).toBe('DISPATCH');
    expect(Object.isFrozen(receipt)).toBe(true);
  });
});

describe('reduceEventDeltas', () => {
  it('sorts deltas by sequence and produces batch hash', () => {
    const d1 = createEventDelta(makeInput({ sequence: 2 }));
    const d2 = createEventDelta(makeInput({ sequence: 1 }));
    const batch = reduceEventDeltas([d1, d2]);
    expect(batch.deltas[0].sequence).toBe(1);
    expect(batch.deltas[1].sequence).toBe(2);
    expect(batch.batchSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(batch.deltas)).toBe(true);
  });

  it('produces deterministic hash for same deltas in different order', () => {
    const d1 = createEventDelta(makeInput({ sequence: 1 }));
    const d2 = createEventDelta(makeInput({ sequence: 2 }));
    const batch1 = reduceEventDeltas([d1, d2]);
    const batch2 = reduceEventDeltas([d2, d1]);
    expect(batch1.batchSha256).toBe(batch2.batchSha256);
  });

  it('empty batch produces a valid hash', () => {
    const batch = reduceEventDeltas([]);
    expect(batch.deltas).toEqual([]);
    expect(batch.batchSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('idempotentInsert', () => {
  it('inserts a new delta', () => {
    const d1 = createEventDelta(makeInput({ sequence: 1 }));
    const result = idempotentInsert(d1, []);
    expect(result).toHaveLength(1);
  });

  it('rejects duplicate by eventSha256', () => {
    const d1 = createEventDelta(makeInput({ sequence: 1 }));
    const result = idempotentInsert(d1, [d1]);
    expect(result).toHaveLength(1);
  });

  it('preserves existing order', () => {
    const d1 = createEventDelta(makeInput({ sequence: 1 }));
    const d2 = createEventDelta(makeInput({ sequence: 2 }));
    const result = idempotentInsert(d2, [d1]);
    expect(result).toHaveLength(2);
    expect(result[0].sequence).toBe(1);
    expect(result[1].sequence).toBe(2);
  });
});
