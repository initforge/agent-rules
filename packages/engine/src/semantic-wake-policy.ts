/**
 * semantic-wake-policy.ts — M11-R41: Premium main wakes only under the closed
 * semantic wake policy (AM-0021 §11).
 *
 * Closed wake policy: main wakes only when one of these wake reasons applies:
 *   - PLAN_ADOPTED      : new plan adopted, execution begins
 *   - AMENDMENT_APPLIED : amendment effective, execution must adapt
 *   - WORKER_COMPLETE   : worker finished, decision required
 *   - WORKER_FAILED     : worker failed, remediation required
 *   - EVIDENCE_RECEIVED : verification evidence received
 *   - CLAIM_UPDATED     : claim status changed
 *   - CANDIDATE_EPOCH   : epoch changed, re-verification needed
 *   - LEDGER_REVISION   : ledger updated, sync required
 *   - DRILL_DOWN        : explicit drill-down request
 *   - MANUAL_WAKE       : explicit resume signal
 *
 * Any other signal is silently discarded. The policy returns a WakeDecision
 * that includes the reason, confidence (1.0 = authoritative, <1.0 = advisory)
 * and required capsule snapshot for idempotent re-entry.
 */
import { createHash } from 'node:crypto';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WakeReason =
  | 'PLAN_ADOPTED'
  | 'AMENDMENT_APPLIED'
  | 'WORKER_COMPLETE'
  | 'WORKER_FAILED'
  | 'EVIDENCE_RECEIVED'
  | 'CLAIM_UPDATED'
  | 'CANDIDATE_EPOCH'
  | 'LEDGER_REVISION'
  | 'DRILL_DOWN'
  | 'MANUAL_WAKE';

export const CLOSED_WAKE_REASONS: readonly WakeReason[] = [
  'PLAN_ADOPTED',
  'AMENDMENT_APPLIED',
  'WORKER_COMPLETE',
  'WORKER_FAILED',
  'EVIDENCE_RECEIVED',
  'CLAIM_UPDATED',
  'CANDIDATE_EPOCH',
  'LEDGER_REVISION',
  'DRILL_DOWN',
  'MANUAL_WAKE',
];

export const WAKE_REASON_SET = new Set<WakeReason>(CLOSED_WAKE_REASONS);

export interface WakeSignal {
  reason: WakeReason;
  planId: string;
  runId: string;
  actor: string;
  epoch: number;
  metadata?: Record<string, string>;
}

export interface WakeDecision {
  readonly reason: WakeReason;
  readonly confidence: number; // 1.0 = authoritative, <1.0 advisory
  readonly shouldWake: boolean;
  readonly capsuleSnapshot: WakeCapsuleSnapshot;
  readonly decisionSha256: Sha256;
  readonly decidedAt: string;
  readonly idempotencyKey: string;
}

export interface WakeCapsuleSnapshot {
  readonly planId: string;
  readonly runId: string;
  readonly epoch: number;
  readonly decisions: readonly string[]; // decision IDs committed since last wake
  readonly pendingClaims: readonly string[];
  readonly pendingEvidence: readonly string[];
  readonly activeWorkers: readonly string[];
  readonly metadata: Record<string, string>;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function computeDecisionSha(decision: Omit<WakeDecision, 'decisionSha256'>): Sha256 {
  const payload = [
    decision.reason,
    decision.confidence,
    decision.shouldWake,
    decision.idempotencyKey,
    decision.decidedAt,
    decision.capsuleSnapshot.planId,
    decision.capsuleSnapshot.runId,
    decision.capsuleSnapshot.epoch,
    decision.capsuleSnapshot.decisions,
    decision.capsuleSnapshot.pendingClaims,
    decision.capsuleSnapshot.pendingEvidence,
    decision.capsuleSnapshot.activeWorkers,
  ];
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(payload)));
}

function makeIdempotencyKey(signal: WakeSignal, epoch: number): string {
  const key = [signal.reason, signal.planId, signal.runId, epoch, signal.actor];
  return createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 32);
}

// ── Semantic Wake Policy ──────────────────────────────────────────────────────

export interface WakePolicyConfig {
  advisoryConfidence: number; // confidence for non-critical signals
  authoritativeConfidence: number; // confidence for authoritative signals
}

/** Default: advisory signals get 0.7, authoritative get 1.0 */
export const DEFAULT_WAKE_POLICY_CONFIG: WakePolicyConfig = {
  advisoryConfidence: 0.7,
  authoritativeConfidence: 1.0,
};

const AUTHORITATIVE_REASONS = new Set<WakeReason>([
  'MANUAL_WAKE',
  'WORKER_FAILED',
  'CANDIDATE_EPOCH',
  'LEDGER_REVISION',
]);

/**
 * evaluateWakeSignal applies the closed semantic wake policy.
 * Returns a WakeDecision; if shouldWake is false, the signal was rejected.
 *
 * ponytail: skip — multi-factor confidence scoring, policy override flags,
 * cross-run wake coordination. Add when AM-0021 cluster 3 ships.
 */
export function evaluateWakeSignal(
  signal: WakeSignal,
  capsuleSnapshot: WakeCapsuleSnapshot,
  config: WakePolicyConfig = DEFAULT_WAKE_POLICY_CONFIG,
): WakeDecision {
  // Step 1: Closed reason check — reject unknown reasons
  if (!WAKE_REASON_SET.has(signal.reason)) {
    return {
      reason: signal.reason,
      confidence: 0,
      shouldWake: false,
      capsuleSnapshot,
      decisionSha256: '0'.repeat(64) as Sha256,
      decidedAt: new Date().toISOString(),
      idempotencyKey: 'REJECTED_UNKNOWN_REASON',
    };
  }

  // Step 2: Determine confidence
  const authoritative = AUTHORITATIVE_REASONS.has(signal.reason);
  const confidence = authoritative ? config.authoritativeConfidence : config.advisoryConfidence;

  // Step 3: Build decision (always wakes for closed reasons)
  const idempotencyKey = makeIdempotencyKey(signal, capsuleSnapshot.epoch);
  const rawDecision = {
    reason: signal.reason,
    confidence,
    shouldWake: true,
    capsuleSnapshot,
    idempotencyKey,
    decidedAt: new Date().toISOString(),
  };

  return {
    ...rawDecision,
    decisionSha256: computeDecisionSha(rawDecision),
  };
}

/** isClosedWakeReason — guard for external callers */
export function isClosedWakeReason(reason: string): reason is WakeReason {
  return WAKE_REASON_SET.has(reason as WakeReason);
}

/** listClosedWakeReasons — for UI/routing */
export function listClosedWakeReasons(): readonly WakeReason[] {
  return CLOSED_WAKE_REASONS;
}

/** computeCapsuleSnapshotSha — derive deterministic hash for snapshot */
export function computeCapsuleSnapshotSha(snapshot: WakeCapsuleSnapshot): Sha256 {
  const payload = [
    snapshot.planId,
    snapshot.runId,
    snapshot.epoch,
    snapshot.decisions.slice().sort(),
    snapshot.pendingClaims.slice().sort(),
    snapshot.pendingEvidence.slice().sort(),
    snapshot.activeWorkers.slice().sort(),
    snapshot.metadata,
  ];
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(payload)));
}
