import type { Sha256, PlanAnchor, PlanHandoff, HostTaskRef, RepositoryBaseline, ReviewReceipt, WorkLedgerStatus, TaskAssignment, LedgerBatch } from './contracts.js';
import { sha256Bytes } from './contracts.js';

export { type Sha256, sha256Bytes } from './contracts.js';

export function fatalUtf8Decode(buffer: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isSha256(value: string): value is Sha256 { return /^[a-f0-9]{64}$/.test(value); }

// ── NS0 domain types ─────────────────────────────────────────────────────────

export type CaptureStatus = 'CAPTURED' | 'VERIFIED' | 'STALE' | 'REJECTED';
export type AmendmentStatus = 'PENDING' | 'APPROVED' | 'EFFECTIVE' | 'TOMBSTONED';
export type AmendmentId = `AM${string}`;
export type NsIdentifier = `NS${number}`;
export type AcIdentifier = `AC${number}`;

export const VALID_NS_RANGE = [0, 9] as const;
export const VALID_AC_RANGE = [1, 20] as const;

export interface ContinuationLink {
  readonly predecessorId: string;
  readonly predecessorHash: Sha256;
}

export interface CaptureRecord {
  readonly planId: string;
  readonly relativePath: string;
  readonly sha256: Sha256;
  readonly baselines: readonly RepositoryBaseline[];
  readonly audit: HostTaskRef;
  readonly handoff: PlanHandoff;
  readonly continuation: ContinuationLink;
  readonly status: CaptureStatus;
  readonly rule: string;
}

export interface ActivationAmendment {
  readonly amendmentId: AmendmentId;
  readonly status: AmendmentStatus;
  readonly sha256: Sha256;
  readonly sourceRef: string;
}

export interface NsAnchor {
  readonly nsId: NsIdentifier;
  readonly acIds: readonly AcIdentifier[];
  readonly anchors: readonly PlanAnchor[];
}

export interface Ns0To9Mapping {
  readonly sections: readonly NsAnchor[];
  readonly acOrdered: readonly AcIdentifier[];
}

export interface EvidenceNode {
  readonly id: string;
  readonly boundRoot: string;
  readonly references: readonly string[];
}

export interface EvidenceGraph {
  readonly nodes: readonly EvidenceNode[];
  readonly roots: readonly string[];
}

export interface ReanchoredRecord {
  readonly recordType: 'finding' | 'assignment' | 'review' | 'receipt' | 'diff';
  readonly originalId: string;
  readonly taskId: string;
  readonly anchorId: string;
}

export interface StaleResult {
  readonly staleRoots: readonly string[];
  readonly transitiveDependents: readonly string[];
  readonly unaffectedRoots: readonly string[];
}

// ── Canonical identity helpers ────────────────────────────────────────────────

/** Strict canonical JSON: rejects undefined, NaN, Infinity, sparse arrays, non-plain objects. */
export function validateCanonicalJson(value: unknown, path = '$'): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`canonical JSON: NaN/Infinity at ${path}`);
    return;
  }
  if (typeof value === 'undefined') throw new Error(`canonical JSON: undefined at ${path}`);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new Error(`canonical JSON: sparse array at ${path}[${i}]`);
      validateCanonicalJson(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`canonical JSON: non-plain object at ${path}`);
    }
    for (const key of Object.keys(value)) {
      validateCanonicalJson((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  throw new Error(`canonical JSON: unsupported type ${typeof value} at ${path}`);
}

function sortedObjectKeys(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = record[k];
      return acc;
    }, {});
  }
  return value;
}

export function canonicalJsonIdentity(value: unknown): string {
  validateCanonicalJson(value);
  return JSON.stringify(value, sortedObjectKeys);
}

export function canonicalSha256(value: unknown): Sha256 {
  return sha256Bytes(new TextEncoder().encode(canonicalJsonIdentity(value)));
}

/** Serialize payload to bytes excluding the sha256 field. */
export function payloadBytes<T extends Record<string, unknown>>(payload: T): Uint8Array {
  const clone = { ...payload } as Record<string, unknown>;
  delete clone.sha256;
  return new TextEncoder().encode(canonicalJsonIdentity(clone));
}

// ── Effective plan SHA ────────────────────────────────────────────────────────

export function computeEffectivePlanSha256(
  originalBytes: Uint8Array,
  amendments: readonly ActivationAmendment[],
  amendmentBytesMap: ReadonlyMap<string, Uint8Array>,
): Sha256 {
  const parts: Uint8Array[] = [originalBytes];
  for (const a of amendments) {
    if (a.status === 'EFFECTIVE' || a.status === 'APPROVED') {
      const amBytes = amendmentBytesMap.get(a.amendmentId);
      if (amBytes) parts.push(amBytes);
    }
  }
  const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
  const effective = new Uint8Array(totalLen);
  let off = 0;
  for (const p of parts) { effective.set(p, off); off += p.byteLength; }
  return sha256Bytes(effective);
}

// ── Capture chain validation ──────────────────────────────────────────────────

export function validateCaptureChain(
  captures: readonly CaptureRecord[],
  amendments: readonly ActivationAmendment[],
  amendmentBytesMap: ReadonlyMap<string, Uint8Array>,
): void {
  requireValue(captures.length > 0, 'Capture chain must be non-empty');
  const ids = captures.map((c) => c.planId);
  requireValue(new Set(ids).size === ids.length, 'Capture chain: duplicate planId');
  for (const capture of captures) {
    requireValue(typeof capture.planId === 'string' && capture.planId.length > 0, 'Capture: planId required');
    requireValue(typeof capture.relativePath === 'string' && capture.relativePath.length > 0, 'Capture: relativePath required');
    requireValue(isSha256(capture.sha256), 'Capture: sha256 invalid');
    requireValue(capture.baselines.length > 0, 'Capture: baselines required');
    requireValue(Boolean(capture.audit.host && capture.audit.taskRef), 'Capture: audit required');
    requireValue(Boolean(capture.handoff.recipientRole && capture.handoff.nextSafeAction), 'Capture: handoff required');
    requireValue(Boolean(capture.continuation.predecessorId && capture.continuation.predecessorHash), 'Capture: continuation required');
    requireValue(isSha256(capture.continuation.predecessorHash), 'Capture: continuation predecessorHash invalid');
    requireValue(typeof capture.rule === 'string' && capture.rule.length > 0, 'Capture: rule required');
    const expectedStatuses: readonly CaptureStatus[] = ['CAPTURED', 'VERIFIED', 'STALE', 'REJECTED'];
    requireValue(expectedStatuses.includes(capture.status), 'Capture: unknown status');
  }

  // Every amendment must have bytes that match its declared SHA
  for (const am of amendments) {
    const bytes = amendmentBytesMap.get(am.amendmentId);
    requireValue(bytes !== undefined, `Amendment ${am.amendmentId}: missing bytes`);
    const actualSha = sha256Bytes(bytes);
    requireValue(actualSha === am.sha256,
      `Amendment ${am.amendmentId}: bytes SHA mismatch (declared ${am.sha256}, actual ${actualSha})`);
    // Every amendment SHA must appear in a capture
    const matched = captures.some((c) => c.sha256 === am.sha256);
    requireValue(matched, `Capture chain: missing hash entry for amendment ${am.amendmentId}`);
  }

  // Continuation ordered linked chain
  for (let i = 1; i < captures.length; i++) {
    const prev = captures[i - 1];
    const curr = captures[i];
    requireValue(curr.continuation.predecessorId === prev.planId,
      `Capture ${curr.planId}: continuation predecessorId ${curr.continuation.predecessorId} != previous planId ${prev.planId}`);
    requireValue(curr.continuation.predecessorHash === prev.sha256,
      `Capture ${curr.planId}: continuation predecessorHash mismatch with ${prev.planId}`);
  }
}

// ── Amendment chain validation ────────────────────────────────────────────────

/** Canonicalize amendment ID: strip hyphens for special-ID matching.
 *  Both legacy (AM0012) and modern (AM-0012) spellings map to the same
 *  constraint.  Rejects mixed-case or malformed IDs explicitly. */
function canonicalAmendmentId(raw: string): string {
  const stripped = raw.replace(/-/g, '');
  if (!/^AM\d{4}$/.test(stripped)) {
    throw new Error(`Non-canonical amendment ID: ${raw}`);
  }
  return stripped;
}

export function validateAmendmentChain(
  amendments: readonly ActivationAmendment[],
  expectedOrder: readonly string[],
): void {
  requireValue(amendments.length > 0, 'Amendment chain must be non-empty');
  requireValue(expectedOrder.length === amendments.length,
    `Expected ${expectedOrder.length} amendments, got ${amendments.length}`);
  // Exact ID order from supplied manifest (no canonicalization — order must match literally)
  for (let i = 0; i < amendments.length; i++) {
    requireValue(amendments[i].amendmentId === expectedOrder[i],
      `Position ${i}: expected ${expectedOrder[i]}, got ${amendments[i].amendmentId}`);
  }

  const ids = amendments.map((a) => a.amendmentId);
  requireValue(new Set(ids).size === ids.length, 'Amendment chain: duplicate IDs');

  const statuses: readonly AmendmentStatus[] = ['PENDING', 'APPROVED', 'EFFECTIVE', 'TOMBSTONED'];
  for (const am of amendments) {
    requireValue(statuses.includes(am.status), `Amendment ${am.amendmentId}: unknown status`);
    requireValue(isSha256(am.sha256), `Amendment ${am.amendmentId}: invalid sha256`);
    requireValue(typeof am.sourceRef === 'string' && am.sourceRef.length > 0, `Amendment ${am.amendmentId}: sourceRef required`);
  }

  // AM0004 exact tombstone — match both legacy and hyphenated spelling
  const am0004 = amendments.find((a) => canonicalAmendmentId(a.amendmentId) === 'AM0004');
  if (am0004) {
    requireValue(am0004.status === 'TOMBSTONED', 'AM0004 must be TOMBSTONED');
  }

  // AM0012 pending→effective transition — match both legacy and hyphenated spelling
  const am0012 = amendments.find((a) => canonicalAmendmentId(a.amendmentId) === 'AM0012');
  if (am0012) {
    if (am0012.status === 'PENDING') {
      requireValue(am0012.sourceRef.startsWith('pending:'), 'AM0012 PENDING sourceRef must start with pending:');
    }
    requireValue(am0012.status === 'EFFECTIVE' || am0012.status === 'PENDING', 'AM0012 must be PENDING or EFFECTIVE');
  }

  // APPROVED/EFFECTIVE must appear in manifest order
  const effective = amendments.filter((a) => a.status === 'APPROVED' || a.status === 'EFFECTIVE');
  const effectivePositions = effective.map((a) => amendments.indexOf(a));
  for (let i = 1; i < effectivePositions.length; i++) {
    requireValue(effectivePositions[i] > effectivePositions[i - 1],
      `Manifest order violation: ${effective[i].amendmentId} before ${effective[i - 1].amendmentId}`);
  }
}

// ── Parse AM0012 NS0..NS9 sections ────────────────────────────────────────────

export function parseAm0012Ns0To9(
  amendmentBytes: Uint8Array,
  planSha256: Sha256,
  planLineCount: number,
): Ns0To9Mapping {
  const text = fatalUtf8Decode(amendmentBytes);
  const sections: NsAnchor[] = [];
  const seenNs = new Set<string>();
  const seenAc = new Set<string>();

  const lines = text.split(/\r?\n/);
  let currentNs: NsIdentifier | null = null;
  let currentAc: AcIdentifier[] = [];
  let currentAnchors: PlanAnchor[] = [];
  let nsHasAnchor = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const nsMatch = line.match(/^\[NS(\d+)\](?:\s+\[([^\]]+)\])?\s*$/i);
    if (nsMatch) {
      // Flush previous NS section: every NS must have at least one anchor
      if (currentNs !== null) {
        requireValue(currentAnchors.length > 0, `NS${currentNs}: no valid anchor defined`);
        sections.push({ nsId: currentNs, acIds: [...currentAc], anchors: [...currentAnchors] });
      }

      const nsNum = parseInt(nsMatch[1], 10);
      requireValue(nsNum >= VALID_NS_RANGE[0] && nsNum <= VALID_NS_RANGE[1],
        `NS${nsNum} out of range [0..9]`);
      const nsId = `NS${nsNum}` as NsIdentifier;
      requireValue(!seenNs.has(nsId), `Duplicate NS${nsNum} section`);
      seenNs.add(nsId);
      currentNs = nsId;
      currentAc = [];
      currentAnchors = [];
      nsHasAnchor = false;

      if (nsMatch[2]) {
        const acParts = nsMatch[2].replace(/[\[\]]/g, '').split(',').map((s) => s.trim());
        for (const acPart of acParts) {
          const acMatch = acPart.match(/^AC(\d+)$/i);
          requireValue(acMatch, `Invalid AC identifier: ${acPart}`);
          const acNum = parseInt(acMatch[1], 10);
          requireValue(acNum >= VALID_AC_RANGE[0] && acNum <= VALID_AC_RANGE[1],
            `AC${acNum} out of range [1..20]`);
          const acId = `AC${acNum}` as AcIdentifier;
          requireValue(!seenAc.has(acId), `Duplicate AC${acNum}`);
          seenAc.add(acId);
          currentAc.push(acId);
        }
      }
      continue;
    }

    const anchorMatch = line.match(/^anchor:\s*(.+?)\s*\|\s*(\d+)\s+(\d+)\s*\|\s*(\S+)$/i);
    if (anchorMatch && currentNs !== null) {
      const sectionHeading = anchorMatch[1].trim();
      const lineStart = parseInt(anchorMatch[2], 10);
      const lineEnd = parseInt(anchorMatch[3], 10);
      requireValue(Number.isInteger(lineStart) && Number.isInteger(lineEnd) && lineStart >= 1 && lineEnd >= lineStart,
        `Anchor invalid line range ${lineStart}-${lineEnd}`);
      requireValue(lineEnd <= planLineCount, `Anchor line ${lineEnd} exceeds plan line count ${planLineCount}`);
      const requirementId = anchorMatch[4];
      currentAnchors.push({
        planSha256, sectionHeading, lineStart, lineEnd,
        anchorTextSha256: '' as Sha256, requirementId,
      });
      nsHasAnchor = true;
      continue;
    }

    // Fail closed on malformed/unknown lines inside NS sections
    if (currentNs !== null) {
      throw new Error(`NS${currentNs}: malformed line: ${line}`);
    }
  }

  // Flush last
  if (currentNs !== null) {
    requireValue(currentAnchors.length > 0, `NS${currentNs}: no valid anchor defined`);
    sections.push({ nsId: currentNs, acIds: [...currentAc], anchors: [...currentAnchors] });
  }

  requireValue(sections.length === 10, `AM0012: expected 10 NS sections (NS0..NS9), got ${sections.length}`);
  for (let n = 0; n <= 9; n++) {
    requireValue(seenNs.has(`NS${n}`), `AM0012: missing NS${n} section`);
  }

  requireValue(seenAc.size === 20, `AM0012: expected 20 unique ACs (AC1..AC20), got ${seenAc.size}`);
  for (let a = 1; a <= 20; a++) {
    requireValue(seenAc.has(`AC${a}`), `AM0012: missing AC${a}`);
  }

  const allAcPresent = [...seenAc].sort((a, b) => {
    const an = parseInt(a.replace('AC', ''), 10);
    const bn = parseInt(b.replace('AC', ''), 10);
    return an - bn;
  });

  return { sections, acOrdered: allAcPresent as AcIdentifier[] };
}

export function setAnchorTextHashes(
  sections: readonly NsAnchor[],
  planBytes: Uint8Array,
  planSha256: Sha256,
): readonly NsAnchor[] {
  const text = fatalUtf8Decode(planBytes);
  const planLines = text.split(/\r?\n/);
  return sections.map((section) => ({
    ...section,
    anchors: section.anchors.map((anchor) => {
      const startIdx = anchor.lineStart - 1;
      const endIdx = anchor.lineEnd;
      const lineSlice = planLines.slice(startIdx, endIdx).join('\n');
      const anchorSha = sha256Bytes(new TextEncoder().encode(lineSlice));
      return { ...anchor, planSha256, anchorTextSha256: anchorSha };
    }),
  }));
}

// ── AC mapping validation ─────────────────────────────────────────────────────

export function validateAcMapping(sections: readonly NsAnchor[]): void {
  requireValue(sections.length === 10, 'validateAcMapping: need exactly 10 NS sections');
  const allAc = new Set<string>();
  for (const section of sections) {
    const acSet = new Set(section.acIds);
    requireValue(acSet.size === section.acIds.length, `Duplicate ACs in ${section.nsId}`);
    for (const ac of section.acIds) {
      requireValue(!allAc.has(ac), `AC ${ac} mapped to multiple NS sections`);
      allAc.add(ac);
    }
  }
  requireValue(allAc.size === 20, `validateAcMapping: expected 20 unique ACs, got ${allAc.size}`);
  const nsCounts = new Map<string, number>();
  for (let a = 1; a <= 20; a++) nsCounts.set(`AC${a}`, 0);
  for (const section of sections) {
    for (const ac of section.acIds) {
      nsCounts.set(ac, (nsCounts.get(ac) ?? 0) + 1);
    }
  }
  for (const [ac, count] of nsCounts) {
    requireValue(count === 1, `AC ${ac} appears in ${count} sections (must be 1)`);
  }
}

// ── Full anchor key ───────────────────────────────────────────────────────────

export function fullAnchorKey(a: PlanAnchor): string {
  return `${a.planSha256}:${a.sectionHeading}:${a.lineStart}:${a.lineEnd}:${a.anchorTextSha256}:${a.requirementId}`;
}

// ── Canonical flat-ledger shape ───────────────────────────────────────────────

export function validateAssignmentsBatches(
  assignments: readonly TaskAssignment[],
  batches: readonly LedgerBatch[],
  sections: readonly NsAnchor[],
): void {
  requireValue(new Set(assignments.map((a) => a.assignmentId)).size === assignments.length, 'Assignments: duplicate IDs');
  requireValue(new Set(assignments.map((a) => a.taskId)).size === assignments.length, 'Assignments: duplicate taskIds');
  requireValue(new Set(batches.map((b) => b.batchId)).size === batches.length, 'Batches: duplicate IDs');

  const assignmentTaskIds = new Set(assignments.map((a) => a.taskId));
  for (const batch of batches) {
    requireValue(batch.taskIds.length > 0, `Batch ${batch.batchId}: empty taskIds`);
    requireValue(new Set(batch.taskIds).size === batch.taskIds.length, `Batch ${batch.batchId}: duplicate taskIds`);
    for (const taskId of batch.taskIds) {
      requireValue(assignmentTaskIds.has(taskId), `Batch ${batch.batchId}: task ${taskId} has no assignment`);
    }
  }

  const allSectionAnchorKeys = new Set(sections.flatMap((s) => s.anchors.map(fullAnchorKey)));
  for (const assignment of assignments) {
    requireValue(assignment.anchors.length > 0, `Assignment ${assignment.assignmentId}: no anchors`);
    for (const anchor of assignment.anchors) {
      requireValue(allSectionAnchorKeys.has(fullAnchorKey(anchor)),
        `Assignment ${assignment.assignmentId}: anchor not in any NS section`);
    }
  }

  const batchedTaskIds = new Set(batches.flatMap((b) => b.taskIds));
  for (const assignment of assignments) {
    requireValue(batchedTaskIds.has(assignment.taskId),
      `Assignment ${assignment.assignmentId}: task ${assignment.taskId} not in any batch`);
  }

  const assignedBatch = new Map<string, string>();
  for (const batch of batches) {
    for (const taskId of batch.taskIds) {
      if (assignedBatch.has(taskId)) {
        requireValue(false, `Task ${taskId} in batches ${assignedBatch.get(taskId)} and ${batch.batchId}`);
      }
      assignedBatch.set(taskId, batch.batchId);
    }
  }
}

// ── Evidence graph: multi-identity nodes ──────────────────────────────────────

const IDENTITY_FIELDS = ['id', 'receiptId', 'claimId', 'findingId', 'reviewId', 'assignmentId'] as const;

function collectIdentityIds(record: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const field of IDENTITY_FIELDS) {
    if (typeof record[field] === 'string') ids.push(record[field] as string);
  }
  return ids;
}

function collectOwnRefs(record: Record<string, unknown>): string[] {
  const refs: string[] = [];
  if (typeof record.receiptId === 'string') refs.push(record.receiptId);
  if (typeof record.assignmentId === 'string') refs.push(record.assignmentId);
  if (typeof record.requirementId === 'string') refs.push(record.requirementId);
  if (typeof record.taskId === 'string') refs.push(record.taskId);
  return refs;
}

export function discoverEvidenceGraph(
  records: ReadonlyArray<Record<string, unknown>>,
  roots: readonly string[],
): EvidenceGraph {
  const nodes: EvidenceNode[] = [];
  const nodeMap = new Map<string, EvidenceNode>();
  const rootSet = new Set(roots);

  function extractIds(value: unknown, parentRefs: readonly string[]): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) extractIds(item, parentRefs);
      return;
    }
    const record = value as Record<string, unknown>;

    const foundIds = collectIdentityIds(record);
    const ownRefs = collectOwnRefs(record);
    const allParentRefs = [...parentRefs];

    // Create a node for EVERY identity field found
    for (const id of foundIds) {
      if (nodeMap.has(id)) continue;
      // References: sibling IDs from same record + own refs + parent traversal
      const refs = [...new Set([
        ...foundIds.filter((fid) => fid !== id),
        ...ownRefs.filter((r) => r !== id),
        ...allParentRefs,
      ])];
      let boundRoot = rootSet.has(id) ? id : '';
      if (!boundRoot) {
        for (const ref of refs) {
          if (rootSet.has(ref)) { boundRoot = ref; break; }
        }
      }
      const node: EvidenceNode = { id, boundRoot, references: refs };
      nodeMap.set(id, node);
      nodes.push(node);
    }

    // Recurse into all fields with ALL found IDs as parent context
    const childRefs = [...allParentRefs, ...foundIds];
    for (const key of Object.keys(record)) {
      if (typeof record[key] === 'object') {
        extractIds(record[key], childRefs);
      }
    }
  }

  for (const record of records) {
    extractIds(record, []);
  }

  return { nodes, roots };
}

// Transitive stale via reference edge BFS
export function computeStale(
  graph: EvidenceGraph,
  currentLiveRoots: readonly string[],
): StaleResult {
  const liveSet = new Set(currentLiveRoots);
  const staleRoots: string[] = [];
  const unaffectedRoots: string[] = [];
  const nodeMap = new Map<string, EvidenceNode>();
  for (const node of graph.nodes) nodeMap.set(node.id, node);

  for (const root of graph.roots) {
    if (liveSet.has(root)) unaffectedRoots.push(root);
    else staleRoots.push(root);
  }

  // BFS from stale roots through reference edges
  const staleSet = new Set(staleRoots);
  const visited = new Set(staleRoots);
  const queue = [...staleRoots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of graph.nodes) {
      if (node.references.includes(current) && !visited.has(node.id)) {
        visited.add(node.id);
        queue.push(node.id);
      }
    }
  }

  const transitiveDependents = [...visited].filter((id) => !staleSet.has(id) && nodeMap.has(id));

  return { staleRoots, transitiveDependents, unaffectedRoots };
}

// ── Re-anchor records to NS7/NS9 ─────────────────────────────────────────────

export function reanchorToNsTask(
  records: ReadonlyArray<Record<string, unknown>>,
  targetNs: NsIdentifier,
  targetAnchorId: string,
  taskId: string,
): readonly ReanchoredRecord[] {
  const result: ReanchoredRecord[] = [];
  const targetNsStr = targetNs.toUpperCase();

  for (const record of records) {
    const ids = collectIdentityIds(record);
    if (ids.length === 0) continue;

    const nsMatch = typeof record.namespace === 'string' && record.namespace.toUpperCase() === targetNsStr;
    const taskMatch = typeof record.taskId === 'string' && record.taskId === taskId;
    if (!nsMatch && !taskMatch) continue;

    let recordType: ReanchoredRecord['recordType'];
    if (record.findingId) recordType = 'finding';
    else if (record.assignmentId) recordType = 'assignment';
    else if (record.reviewId) recordType = 'review';
    else if (record.receiptId) recordType = 'receipt';
    else if (record.diffSha256 || record.diffFingerprint) recordType = 'diff';
    else continue;

    result.push({ recordType, originalId: ids[0], taskId, anchorId: targetAnchorId });
  }

  return result;
}

// ── Fast-path ledger status verifier ──────────────────────────────────────────

export interface ExecutionStateSnapshot {
  readonly execution_state: WorkLedgerStatus;
  readonly needsRemediation: boolean;
  readonly openRepairCount: number;
  readonly latestReview: ReviewReceipt | null;
  readonly shadowRevision: number;
}

export interface AuditEventShape {
  readonly eventType: string;
  readonly actor: string;
  readonly detail: string;
  readonly sha256: Sha256;
}

export interface FastPathVerification {
  readonly executionState: ExecutionStateSnapshot;
  readonly auditEvents: readonly AuditEventShape[];
  readonly valid: boolean;
  readonly reason?: string;
}

export function fastPathStructure(ledger: Record<string, unknown>): FastPathVerification {
  const status = ledger.status as WorkLedgerStatus | undefined;
  if (!status) return { executionState: {} as ExecutionStateSnapshot, auditEvents: [], valid: false, reason: 'Missing status' };

  const statusValues: readonly string[] = [
    'ADOPTED', 'DISCOVERING', 'PLANNED', 'VALIDATED', 'DISPATCHING',
    'EXECUTING', 'VERIFYING', 'REVIEWING', 'needs-remediation', 'needs-replan',
    'COMPLETED', 'PARTIAL', 'BLOCKED', 'FAILED', 'CANCELLED',
  ];
  const needsRemediation = status === 'needs-remediation';
  const openRepairSlices: Array<Record<string, unknown>> = Array.isArray(ledger.repairSlices)
    ? (ledger.repairSlices as Array<Record<string, unknown>>).filter(
        (s) => s.status !== 'PASSED' && s.status !== 'BLOCKED')
    : [];
  const latestReview = ledger.latestReview as ReviewReceipt | undefined;
  const shadowRevision = (ledger.shadowRevision as number) ?? 0;

  const snapshot: ExecutionStateSnapshot = {
    execution_state: status,
    needsRemediation,
    openRepairCount: openRepairSlices.length,
    latestReview: latestReview ?? null,
    shadowRevision: typeof shadowRevision === 'number' ? shadowRevision : 0,
  };

  const auditEvents: AuditEventShape[] = [];
  if (needsRemediation) {
    for (const slice of openRepairSlices) {
      const findingIds = Array.isArray(slice.findingIds) ? (slice.findingIds as string[]).join(',') : '';
      auditEvents.push({
        eventType: 'needs-remediation',
        actor: 'system',
        detail: `Repair slice ${slice.repairSliceId as string}: findings ${findingIds}`,
        sha256: sha256Bytes(new TextEncoder().encode(JSON.stringify(slice))) as Sha256,
      });
    }
  }
  if (shadowRevision > 0) {
    auditEvents.push({
      eventType: 'shadow-revision',
      actor: 'system',
      detail: `Revision ${shadowRevision}`,
      sha256: sha256Bytes(new TextEncoder().encode(`revision:${shadowRevision}`)) as Sha256,
    });
  }

  return {
    executionState: snapshot,
    auditEvents,
    valid: statusValues.includes(status),
    reason: statusValues.includes(status) ? undefined : `Unknown status: ${status}`,
  };
}
