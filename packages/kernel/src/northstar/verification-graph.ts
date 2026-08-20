import type { EvidenceKind, TaskPacket } from './protocol.js';
import type { TraceabilityManifest } from './compiler.js';

/** Closed-loop sensor typing (AM-0001 / REQ-019). */
export type SensorDirection = 'feedforward' | 'feedback';
export type OracleClass = 'computational' | 'inferential' | 'human';

export interface SensorPolicy {
  direction: SensorDirection;
  oracle: OracleClass;
  lifecycle: string;
  applicability: string;
  cost: 'cheap' | 'normal' | 'deep';
  independence: string;
  freshness_ms: number;
  confidence: number;
  escalation: { on_fail: string; retry_budget?: number };
}

export interface VerificationNode {
  /** Unique executable proof-node identity; claim_id alone is not unique with multi-oracle verification. */
  node_id: string;
  claim_id: string;
  task_id: string;
  verifier_id: string;
  kinds: EvidenceKind[];
  cost: 'cheap' | 'normal' | 'deep';
  /** Semantic claim dependencies retained for audit/report readability. */
  depends_on: string[];
  /** Expanded executable dependencies used by the runtime DAG. */
  depends_on_nodes: string[];
  oracle_group?: string;
  /** Typed closed-loop sensor metadata (REQ-019). */
  sensor?: SensorPolicy;
}

const DEEP = new Set<EvidenceKind>(['browser', 'visual', 'mobile', 'semantic', 'security']);
const ORDER = { cheap: 0, normal: 1, deep: 2 } as const;

/** Default typed sensor policy derived from the claim/verifier facts. */
export function sensorPolicyFor(claim: { class: string; required_kinds?: EvidenceKind[] }, node: { kinds: EvidenceKind[]; cost: 'cheap' | 'normal' | 'deep' }): SensorPolicy {
  const deep = node.kinds.some((kind) => DEEP.has(kind));
  const oracle: OracleClass = node.kinds.includes('semantic') || node.kinds.includes('visual') ? 'inferential' : 'computational';
  return {
    direction: 'feedback',
    oracle,
    lifecycle: 'post-execution',
    applicability: `claim class ${claim.class}; kinds ${node.kinds.join('+') || 'test'}`,
    cost: node.cost,
    independence: `oracle-group:${node.kinds.sort().join('-') || 'test'}`,
    freshness_ms: deep ? 0 : 600_000,
    confidence: oracle === 'inferential' ? 0.6 : 0.9,
    escalation: {
      on_fail: oracle === 'inferential' ? 'NEEDS_USER review with the exact unresolved item' : 're-run claim-matched proof once before escalation',
      retry_budget: 2,
    },
  };
}

function proofNodeId(taskId: string, claimId: string, verifierId: string): string {
  return `${taskId}::${claimId}::${verifierId}`;
}

/** Build an executable proof DAG. Semantic claim dependencies win; cost ordering is fallback only. */
export function buildVerificationGraph(
  packets: readonly TaskPacket[],
  manifest: TraceabilityManifest,
  oracleGroups: Readonly<Record<string, string>> = {},
): VerificationNode[] {
  const claims = new Map(manifest.claims.map((claim) => [claim.claim_id, claim]));
  const nodes: VerificationNode[] = [];
  for (const packet of packets) {
    for (const acceptance of packet.acceptance) {
      if (!acceptance.verifier_id) throw new Error(`claim ${acceptance.claim_id} has no verifier`);
      const claim = claims.get(acceptance.claim_id);
      if (!claim) throw new Error(`claim ${acceptance.claim_id} missing from manifest`);
      const kinds: EvidenceKind[] = claim.required_kinds?.length
        ? [...claim.required_kinds]
        : [claim.class === 'runtime' ? 'integration' : claim.class === 'semantic' ? 'semantic' : 'test'];
      const cost: VerificationNode['cost'] = kinds.some((kind) => DEEP.has(kind)) ? 'deep' : kinds.includes('integration') || kinds.includes('api') ? 'normal' : 'cheap';
      const explicit = [...new Set(claim.depends_on ?? [])];
      for (const dep of explicit) if (!claims.has(dep)) throw new Error(`claim ${claim.claim_id} depends on unknown claim ${dep}`);
      const node_id = proofNodeId(packet.task_id, acceptance.claim_id, acceptance.verifier_id);
      if (nodes.some((node) => node.node_id === node_id)) throw new Error(`duplicate verification node ${node_id}`);
      const oracle = oracleGroups[acceptance.verifier_id] ?? claim.oracle_group;
      const node: VerificationNode = {
        node_id,
        claim_id: acceptance.claim_id,
        task_id: packet.task_id,
        verifier_id: acceptance.verifier_id,
        kinds,
        cost,
        depends_on: explicit,
        depends_on_nodes: [],
        ...(oracle ? { oracle_group: oracle } : {}),
      };
      node.sensor = sensorPolicyFor(claim, node);
      nodes.push(node);
    }
  }

  const packetOrder = new Map(packets.map((packet, index) => [packet.task_id, index]));
  const nodesByClaim = new Map<string, VerificationNode[]>();
  for (const node of nodes) nodesByClaim.set(node.claim_id, [...(nodesByClaim.get(node.claim_id) ?? []), node]);

  for (const node of nodes) {
    if (node.depends_on.length) {
      for (const depClaim of node.depends_on) {
        const deps = nodesByClaim.get(depClaim) ?? [];
        if (deps.length === 0) throw new Error(`claim ${node.claim_id} depends on unrouted claim ${depClaim}`);
        for (const dep of deps) node.depends_on_nodes.push(dep.node_id);
      }
      node.depends_on_nodes = [...new Set(node.depends_on_nodes)];
      continue;
    }

    // Cost funnel is an optimization fallback only and stays task-local.
    const lower = nodes.filter((candidate) => candidate.task_id === node.task_id && ORDER[candidate.cost] < ORDER[node.cost]);
    node.depends_on = [...new Set(lower.map((candidate) => candidate.claim_id))];
    node.depends_on_nodes = [...new Set(lower.map((candidate) => candidate.node_id))];
  }

  const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
  const indegree = new Map(nodes.map((node) => [node.node_id, 0]));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    for (const depId of node.depends_on_nodes) {
      if (!nodeById.has(depId)) throw new Error(`verification node ${node.node_id} depends on unknown node ${depId}`);
      if (depId === node.node_id) throw new Error(`verification graph cycle detected at ${node.node_id}`);
      indegree.set(node.node_id, (indegree.get(node.node_id) ?? 0) + 1);
      children.set(depId, [...(children.get(depId) ?? []), node.node_id]);
    }
  }

  const rank = (a: VerificationNode, b: VerificationNode) =>
    (packetOrder.get(a.task_id)! - packetOrder.get(b.task_id)!) ||
    (ORDER[a.cost] - ORDER[b.cost]) ||
    a.claim_id.localeCompare(b.claim_id) ||
    a.verifier_id.localeCompare(b.verifier_id);
  const ready = nodes.filter((node) => indegree.get(node.node_id) === 0).sort(rank);
  const ordered: VerificationNode[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    ordered.push(node);
    for (const childId of children.get(node.node_id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) {
        ready.push(nodeById.get(childId)!);
        ready.sort(rank);
      }
    }
  }
  if (ordered.length !== nodes.length) {
    const cyclic = nodes.filter((node) => (indegree.get(node.node_id) ?? 0) > 0).map((node) => node.node_id).join(', ');
    throw new Error(`verification graph cycle detected: ${cyclic}`);
  }
  return ordered;
}
