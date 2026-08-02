import type { ArtifactPointer } from './artifact-pointer.js';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';

// ── Deterministic EventDelta (AM-0021 §4, M11-R39) ─────────────────────

export type EventType =
  | 'PLAN_LOCK'
  | 'PLAN_AMENDMENT'
  | 'DISPATCH'
  | 'LEASE_ACQUIRE'
  | 'LEASE_RELEASE'
  | 'HEARTBEAT'
  | 'WORKER_COMPLETE'
  | 'WORKER_FAIL'
  | 'EVIDENCE_RECEIVED'
  | 'CLAIM_UPDATED'
  | 'CANDIDATE_EPOCH'
  | 'LEDGER_REVISION'
  | 'CHECKPOINT'
  | 'CAPSULE_COMPILE'
  | 'WAKE_DECISION'
  | 'DRILL_DOWN'
  | 'TERMINAL_GATE'
  | 'RECONCILIATION';

export type Severity = 'INFO' | 'ADVISORY' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface EventDelta {
  readonly sequence: number;
  readonly eventType: EventType;
  readonly actor: string;
  readonly affectedRequirements: readonly string[];
  readonly affectedClaims: readonly string[];
  readonly previousState: Record<string, unknown> | null;
  readonly currentState: Record<string, unknown>;
  readonly severity: Severity;
  readonly candidateEpoch: number;
  readonly artifactRefs: readonly ArtifactPointer[];
  readonly wakeReason: string | null;
  readonly createdAt: string;
  readonly eventSha256: Sha256;
}

export interface EventDeltaInput {
  readonly sequence: number;
  readonly eventType: EventType;
  readonly actor: string;
  readonly affectedRequirements?: readonly string[];
  readonly affectedClaims?: readonly string[];
  readonly previousState?: Record<string, unknown> | null;
  readonly currentState: Record<string, unknown>;
  readonly severity?: Severity;
  readonly candidateEpoch: number;
  readonly artifactRefs?: readonly ArtifactPointer[];
  readonly wakeReason?: string | null;
  readonly createdAt?: string;
}

export interface EventDeltaReceipt {
  readonly eventSha256: Sha256;
  readonly sequence: number;
  readonly eventType: EventType;
  readonly actor: string;
  readonly candidateEpoch: number;
  readonly createdAt: string;
}

// ── Deterministic hash ──────────────────────────────────────────────────

function computeEventSha256(input: EventDeltaInput): Sha256 {
  const canonical = JSON.stringify([
    input.sequence,
    input.eventType,
    input.actor,
    input.affectedRequirements ?? [],
    input.affectedClaims ?? [],
    input.previousState ?? null,
    input.currentState,
    input.severity ?? 'INFO',
    input.candidateEpoch,
    input.artifactRefs ?? [],
    input.wakeReason ?? null,
    input.createdAt ?? '',
  ]);
  return sha256Bytes(new TextEncoder().encode(canonical));
}

export function createEventDelta(input: EventDeltaInput): EventDelta {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const eventSha256 = computeEventSha256(input);

  return Object.freeze({
    sequence: input.sequence,
    eventType: input.eventType,
    actor: input.actor,
    affectedRequirements: Object.freeze([...(input.affectedRequirements ?? [])]),
    affectedClaims: Object.freeze([...(input.affectedClaims ?? [])]),
    previousState: input.previousState ?? null,
    currentState: Object.freeze({ ...input.currentState }),
    severity: input.severity ?? 'INFO',
    candidateEpoch: input.candidateEpoch,
    artifactRefs: Object.freeze([...(input.artifactRefs ?? [])]),
    wakeReason: input.wakeReason ?? null,
    createdAt,
    eventSha256,
  });
}

export function verifyEventDeltaIntegrity(delta: EventDelta): boolean {
  const { eventSha256, createdAt, ...rest } = delta;
  const reconstructed = computeEventSha256({ ...rest, createdAt: '' });
  return eventSha256 === reconstructed;
}

export function eventDeltaReceipt(delta: EventDelta): EventDeltaReceipt {
  return Object.freeze({
    eventSha256: delta.eventSha256,
    sequence: delta.sequence,
    eventType: delta.eventType,
    actor: delta.actor,
    candidateEpoch: delta.candidateEpoch,
    createdAt: delta.createdAt,
  });
}

// ── Deterministic reducer ───────────────────────────────────────────────

export interface EventDeltaBatch {
  readonly deltas: readonly EventDelta[];
  readonly batchSha256: Sha256;
}

export function reduceEventDeltas(deltas: readonly EventDelta[]): EventDeltaBatch {
  const sorted = [...deltas].sort((a, b) => a.sequence - b.sequence);
  const batchSha256 = sha256Bytes(
    new TextEncoder().encode(sorted.map((d) => d.eventSha256).join('')),
  );
  return Object.freeze({ deltas: Object.freeze(sorted), batchSha256 });
}

export function idempotentInsert(delta: EventDelta, existing: readonly EventDelta[]): readonly EventDelta[] {
  const seen = new Set(existing.map((d) => d.eventSha256));
  if (seen.has(delta.eventSha256)) return existing;
  return [...existing, delta];
}
