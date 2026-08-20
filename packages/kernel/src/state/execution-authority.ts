import { readCurrentPointer, type CurrentPointer } from './current-pointer.js';

/**
 * The runtime projection of the canonical current pointer.
 *
 * A missing pointer is deliberately represented as an unbound authority rather
 * than fabricated current work. This keeps isolated unit runs usable while
 * making every bound queue/run fail closed on a generation mismatch.
 */
export interface ExecutionAuthority {
  readonly source: 'current-pointer' | 'unbound';
  readonly work_id: string | null;
  readonly plan_id: string | null;
  readonly execution_generation: number;
  readonly spec_revision: number | null;
}

export interface ExecutionIdentity {
  readonly work_id: string;
  readonly execution_generation: number;
  readonly spec_revision?: number | null;
}

function pointerWorkId(pointer: CurrentPointer): string {
  return pointer.work_id;
}

export function authorityFromPointer(pointer: CurrentPointer | null): ExecutionAuthority {
  if (!pointer) {
    return {
      source: 'unbound',
      work_id: null,
      plan_id: null,
      execution_generation: 0,
      spec_revision: null,
    };
  }
  return {
    source: 'current-pointer',
    work_id: pointerWorkId(pointer),
    plan_id: pointer.plan_id,
    execution_generation: pointer.generation,
    spec_revision: Number.isSafeInteger(pointer.canonical_ledger?.observed_revision)
      ? pointer.canonical_ledger.observed_revision
      : null,
  };
}

export function readExecutionAuthority(repoRoot: string): ExecutionAuthority {
  return authorityFromPointer(readCurrentPointer(repoRoot));
}

/**
 * Compare a durable task/result identity to the latest owner authority.
 * Unbound runs are only eligible for generation zero; they cannot accidentally
 * become current work after a pointer is created.
 */
export function isCurrentExecution(identity: ExecutionIdentity, authority: ExecutionAuthority): boolean {
  if (authority.source === 'unbound') return identity.execution_generation === 0;
  return identity.work_id === authority.work_id
    && identity.execution_generation === authority.execution_generation
    && (identity.spec_revision === undefined || authority.spec_revision === null || identity.spec_revision === authority.spec_revision);
}

export function staleExecutionReason(identity: ExecutionIdentity, authority: ExecutionAuthority): string {
  const current = authority.source === 'unbound'
    ? 'unbound generation 0'
    : `${authority.work_id}@generation-${authority.execution_generation}${authority.spec_revision === null ? '' : `@spec-${authority.spec_revision}`}`;
  return `STALE_RESULT: ${identity.work_id}@generation-${identity.execution_generation}${identity.spec_revision === undefined || identity.spec_revision === null ? '' : `@spec-${identity.spec_revision}`} is not current (${current})`;
}
