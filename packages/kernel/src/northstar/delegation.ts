export type DelegationReason = 'independent-review' | 'specialized-capability' | 'parallel-independent-research';

export interface DelegationRequest {
  id: string;
  reason: DelegationReason;
  parent_depth: number;
  independent_scope: string[];
}

/** North-Star invariant: subagents are exceptions, max two, no recursion. */
export function validateDelegation(requests: readonly DelegationRequest[], max = 2): void {
  if (requests.length > max) throw new Error(`delegation budget exceeded: ${requests.length} > ${max}`);
  const ids = new Set<string>();
  for (const request of requests) {
    if (request.parent_depth !== 0) throw new Error(`recursive delegation forbidden for ${request.id}`);
    if (ids.has(request.id)) throw new Error(`duplicate delegation id ${request.id}`);
    if (request.independent_scope.length === 0) throw new Error(`delegation ${request.id} has no bounded scope`);
    ids.add(request.id);
  }
}
