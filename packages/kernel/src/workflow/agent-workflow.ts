import { planProofRoute, type ProofRoutePlan, type ProofRouteRequest } from '../northstar/proof-router.js';

/** The one admission point for runtime-enforced work. */
export function resolveManagedWorkflow(input: {
  proofRouter?: (request: ProofRouteRequest) => ProofRoutePlan;
}): {
  decisionFabricMode: 'active';
  proofRouter: (request: ProofRouteRequest) => ProofRoutePlan;
} {
  return { decisionFabricMode: 'active', proofRouter: input.proofRouter ?? planProofRoute };
}
