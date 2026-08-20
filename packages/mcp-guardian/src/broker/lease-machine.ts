/**
 * broker/lease-machine.ts — lease state machine.
 *
 * States: CREATED, ACQUIRING, STARTING, READY, RELOCATED, RECONNECTING, STALE,
 * QUARANTINED, RESOURCE_RECREATED, RELEASED, REVOKED, FAILED.
 * Every transition must be legal and must carry a receipt + reason.
 */
import type { LeaseStatus, LeaseTransitionReceipt } from '../types.js';

export interface TransitionRule {
  from: LeaseStatus;
  to: LeaseStatus;
}

export const ALLOWED_TRANSITIONS: readonly TransitionRule[] = [
  { from: 'CREATED', to: 'ACQUIRING' },
  { from: 'CREATED', to: 'RELEASED' }, // session ended before provider start
  { from: 'CREATED', to: 'REVOKED' },
  { from: 'CREATED', to: 'STALE' },
  { from: 'CREATED', to: 'QUARANTINED' }, // fingerprint mismatch before start
  { from: 'ACQUIRING', to: 'STARTING' },
  { from: 'ACQUIRING', to: 'FAILED' },
  { from: 'ACQUIRING', to: 'RELEASED' },
  { from: 'ACQUIRING', to: 'REVOKED' },
  { from: 'ACQUIRING', to: 'STALE' },
  { from: 'ACQUIRING', to: 'QUARANTINED' },
  { from: 'STARTING', to: 'READY' },
  { from: 'STARTING', to: 'FAILED' },
  { from: 'STARTING', to: 'QUARANTINED' },
  { from: 'STARTING', to: 'RELEASED' },
  { from: 'STARTING', to: 'REVOKED' },
  { from: 'STARTING', to: 'STALE' },
  { from: 'READY', to: 'RELOCATED' },
  { from: 'READY', to: 'RECONNECTING' },
  { from: 'READY', to: 'STALE' },
  { from: 'READY', to: 'QUARANTINED' },
  { from: 'READY', to: 'RELEASED' },
  { from: 'READY', to: 'REVOKED' },
  { from: 'READY', to: 'FAILED' }, // provider broke after READY (handshake/stdio proof failed)
  { from: 'RELOCATED', to: 'READY' }, // moved back to initial workspace
  { from: 'RELOCATED', to: 'RECONNECTING' },
  { from: 'RELOCATED', to: 'STALE' },
  { from: 'RELOCATED', to: 'QUARANTINED' },
  { from: 'RELOCATED', to: 'RELEASED' },
  { from: 'RELOCATED', to: 'REVOKED' },
  { from: 'RECONNECTING', to: 'READY' },
  { from: 'RECONNECTING', to: 'RESOURCE_RECREATED' },
  { from: 'RECONNECTING', to: 'QUARANTINED' },
  { from: 'RECONNECTING', to: 'FAILED' },
  { from: 'RECONNECTING', to: 'RELEASED' },
  { from: 'RECONNECTING', to: 'REVOKED' },
  { from: 'RESOURCE_RECREATED', to: 'READY' },
  { from: 'RESOURCE_RECREATED', to: 'QUARANTINED' },
  { from: 'RESOURCE_RECREATED', to: 'FAILED' },
  { from: 'STALE', to: 'RELEASED' },
  { from: 'STALE', to: 'REVOKED' },
  { from: 'STALE', to: 'RECONNECTING' }, // ownership re-proven, retry
  { from: 'STALE', to: 'QUARANTINED' },
  { from: 'QUARANTINED', to: 'RELEASED' },
  { from: 'QUARANTINED', to: 'REVOKED' },
  { from: 'FAILED', to: 'RELEASED' },
  { from: 'FAILED', to: 'REVOKED' },
  { from: 'RELEASED', to: 'REVOKED' },
];

const ALLOWED = new Map<string, LeaseStatus[]>();
for (const r of ALLOWED_TRANSITIONS) {
  const list = ALLOWED.get(r.from) ?? [];
  list.push(r.to);
  ALLOWED.set(r.from, list);
}

export function canTransition(from: LeaseStatus, to: LeaseStatus): boolean {
  if (from === to) return true;
  return (ALLOWED.get(from) ?? []).includes(to);
}

export function assertTransition(from: LeaseStatus, to: LeaseStatus, reason: string): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `illegal lease transition ${from} -> ${to} (reason: ${reason}); transitions must be explicit and legal`,
    );
  }
}

export function receipt(
  leaseId: string,
  from: LeaseStatus,
  to: LeaseStatus,
  reason: string,
  payload: Record<string, unknown> = {},
): LeaseTransitionReceipt {
  return {
    transition_id: -1,
    lease_id: leaseId,
    from_status: from,
    to_status: to,
    reason,
    payload,
    ts: new Date().toISOString(),
  };
}
