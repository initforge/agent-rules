import type { RiskClass } from './protocol.js';

/**
 * Causal map for S2/S3/cross-cutting work (Phase 3 root-cause discipline).
 *
 * Every fix must be traced through:
 * canonical source -> host projection -> installation -> consumer behavior
 *
 * Unknown root cause creates a discovery task instead of a symptom patch.
 */
export type CausalLayer = 'canonical_source' | 'host_projection' | 'installation' | 'consumer_behavior';
export type ProducerKind = 'project_local' | 'global_harness' | 'generated_projection' | 'installed_projection';

export interface CausalNode {
  layer: CausalLayer;
  path?: string;
  producer: ProducerKind;
  description: string;
}

export interface CausalEdge {
  from: number;
  to: number;
  relation: 'causes' | 'generates' | 'installs' | 'manifests_as';
}

export interface CausalMap {
  schema: 'agent-rules/causal-map/v1';
  version: 1;
  symptom: string;
  root_layer: CausalLayer;
  nodes: CausalNode[];
  edges: CausalEdge[];
  fix_layer: CausalLayer;
  fix_path?: string;
}

export function assertCausalMap(value: unknown): asserts value is CausalMap {
  if (!value || typeof value !== 'object') throw new Error('CausalMap must be an object');
  const map = value as Record<string, unknown>;
  if (map.schema !== 'agent-rules/causal-map/v1') throw new Error('CausalMap schema mismatch');
  if (!Array.isArray(map.nodes) || map.nodes.length === 0) throw new Error('CausalMap must have at least one node');
  if (!map.symptom || typeof map.symptom !== 'string') throw new Error('CausalMap.symptom is required');
  const layers: CausalLayer[] = ['canonical_source', 'host_projection', 'installation', 'consumer_behavior'];
  for (const [i, node] of (map.nodes as CausalNode[]).entries()) {
    if (!layers.includes(node.layer)) throw new Error(`CausalMap.nodes[${i}].layer is invalid`);
    if (!node.description || typeof node.description !== 'string') throw new Error(`CausalMap.nodes[${i}].description is required`);
  }
}

/** S2/S3/cross-cutting work requires a causal map; S0/S1 does not. */
export function requiresCausalMap(riskClass: RiskClass | undefined, isCrossCutting: boolean): boolean {
  return riskClass === 'S2' || riskClass === 'S3' || isCrossCutting;
}

/** Validate that S2/S3 work has a causal map whose fix terminates at canonical harness/adapter/installer. */
export function validateCausalMapForWork(input: {
  riskClass: RiskClass | undefined;
  isCrossCutting: boolean;
  causalMap?: CausalMap | null;
}): { valid: boolean; reason?: string } {
  if (!requiresCausalMap(input.riskClass, input.isCrossCutting)) return { valid: true };
  if (!input.causalMap) return { valid: false, reason: `S2/S3/cross-cutting work requires a causal map; unknown root cause must create a discovery task` };
  try {
    assertCausalMap(input.causalMap);
  } catch (e) {
    return { valid: false, reason: `causal map invalid: ${(e as Error).message}` };
  }
  const fixLayer = input.causalMap.fix_layer;
  if (fixLayer === 'consumer_behavior' || fixLayer === undefined) {
    return { valid: false, reason: 'causal map fix must terminate at canonical source, host projection or installation, not consumer behavior' };
  }
  return { valid: true };
}
