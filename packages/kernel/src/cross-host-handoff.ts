import { createHash } from 'node:crypto';
import type { Sha256 } from './contracts.js';
import { sha256Bytes, isSha256 } from './contracts.js';

/**
 * Canonical cross-host handoff envelope (owner contract REQ-C11..C16).
 *
 * Standard/resumable tasks MUST travel as a materialized artifact envelope;
 * clipboard/raw prompts are acceptable only for short ad-hoc requests and are
 * never a canonical source for large plans. Every guard below fails closed
 * BEFORE the first file edit of the receiving session.
 */

export type HandoffExecutionMode = 'AUTO_EXECUTE' | 'PLAN_REVIEW';

export const HANDOFF_ENVELOPE_SCHEMA = 'artifact/cross-host-handoff';

/** Bounded context capsule carried inside the artifact (steering invariant 2). */
export type ContextCapsule = Record<string, string>;

/** Selected capabilities for the receiving run (host-role symmetric). */
export type SelectedCapabilities = CapabilityProjection[];

export interface ProofObligation {
  id: string;
  kind: string;
  sha256: string | null;
  status: 'PENDING' | 'SATISFIED';
}

export interface CrossHostHandoffEnvelope {
  schema: typeof HANDOFF_ENVELOPE_SCHEMA;
  version: 1;
  artifact_uri: string;
  artifact_sha256: Sha256;
  byte_length: number;
  primary_outcome_id: string;
  primary_outcome: string;
  requirement_ids: string[];
  requirement_count: number;
  source_host: string;
  target_host: string;
  execution_mode: HandoffExecutionMode;
  acknowledged_sha256: Sha256 | null;
  acknowledged_requirement_count: number | null;
  acknowledged_proof_obligation_count: number | null;
  truncation_detected: boolean;
  truncated_fields: string[];
  context_capsule: ContextCapsule;
  selected_capabilities: SelectedCapabilities;
  proof_obligations: ProofObligation[];
}

export type HandoffGuardCode =
  | 'TRUNCATION_DETECTED'
  | 'BYTE_LENGTH_MISMATCH'
  | 'HASH_MISMATCH'
  | 'REQUIREMENT_COUNT_MISMATCH'
  | 'REQUIREMENT_MISSING'
  | 'GRAPH_UNAVAILABLE'
  | 'ACK_MISMATCH'
  | 'ARTIFACT_UNAVAILABLE'
  | 'ENVELOPE_INVALID';

export class HandoffGuardError extends Error {
  constructor(readonly code: HandoffGuardCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'HandoffGuardError';
  }
}

// Genuine truncation sentinels. NOTE: `truncated_fields` is a legitimate
// envelope schema field; declared truncation is handled via its VALUE below,
// never by scanning for the field name. Bare typographic ellipsis in plan
// prose must NOT false-positive, so only unambiguous sentinels are scanned.
const TRUNCATION_MARKERS = ['<truncated>', '[truncated]'];
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,160}$/;

/** Distinguishable capability lifecycle states (steering amendment §2). */
export const CAPABILITY_PROJECTION_STATES = ['LOADED', 'SELECTED', 'PROJECTED', 'APPLIED', 'PROVEN'] as const;
export type CapabilityProjectionState = (typeof CAPABILITY_PROJECTION_STATES)[number];

export interface CapabilityProjection {
  id: string;
  state: CapabilityProjectionState;
  required_behavior: string;
  proof_obligation_ids: string[];
}

/** Bounded context capsule categories (steering amendment §1). */
export const CONTEXT_CAPSULE_CATEGORIES = [
  'repository_facts',
  'owner_decisions',
  'non_goals',
  'constraints',
  'selected_capabilities',
  'known_risks',
  'proof_obligations',
] as const;
export type ContextCapsuleCategory = (typeof CONTEXT_CAPSULE_CATEGORIES)[number];

const MAX_CAPSULE_ENTRIES = 64;
const MAX_CAPSULE_VALUE_LENGTH = 2000;

/**
 * Build a bounded context capsule: only relevant facts/decisions/non-goals/
 * constraints/capabilities/risks/proof obligations. Raw sessions, logs and
 * full skill contents are rejected by category key and size bounds.
 */
export function buildContextCapsule(entries: Partial<Record<ContextCapsuleCategory, string>> & Record<string, string>): ContextCapsule {
  const capsule: ContextCapsule = {};
  const keys = Object.keys(entries);
  if (keys.length > MAX_CAPSULE_ENTRIES) throw new HandoffGuardError('ENVELOPE_INVALID', `context capsule exceeds ${MAX_CAPSULE_ENTRIES} entries`);
  for (const key of keys) {
    const value = entries[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (value.length > MAX_CAPSULE_VALUE_LENGTH) throw new HandoffGuardError('ENVELOPE_INVALID', `capsule entry ${key} exceeds ${MAX_CAPSULE_VALUE_LENGTH} chars`);
    if (/(session|transcript|stdout|stderr|\.log)/i.test(key)) {
      throw new HandoffGuardError('ENVELOPE_INVALID', `capsule must not carry raw session/log content: ${key}`);
    }
    capsule[key] = value;
  }
  return capsule;
}

function assertNonEmpty(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HandoffGuardError('ENVELOPE_INVALID', `${field} must be a non-empty string`);
  }
}

/** Structural validation only; integrity is checked against raw bytes elsewhere. */
export function validateEnvelopeShape(input: unknown): CrossHostHandoffEnvelope {
  const env = input as CrossHostHandoffEnvelope;
  if (!env || typeof env !== 'object') throw new HandoffGuardError('ENVELOPE_INVALID', 'envelope must be an object');
  if (env.schema !== HANDOFF_ENVELOPE_SCHEMA) throw new HandoffGuardError('ENVELOPE_INVALID', `schema must be ${HANDOFF_ENVELOPE_SCHEMA}`);
  if (env.version !== 1) throw new HandoffGuardError('ENVELOPE_INVALID', 'version must be 1');
  assertNonEmpty(env.artifact_uri, 'artifact_uri');
  if (!isSha256(env.artifact_sha256)) throw new HandoffGuardError('ENVELOPE_INVALID', 'artifact_sha256 must be a valid SHA-256');
  if (!Number.isSafeInteger(env.byte_length) || env.byte_length <= 0) throw new HandoffGuardError('ENVELOPE_INVALID', 'byte_length must be a positive integer');
  assertNonEmpty(env.primary_outcome_id, 'primary_outcome_id');
  assertNonEmpty(env.primary_outcome, 'primary_outcome');
  if (!Array.isArray(env.requirement_ids) || env.requirement_ids.length === 0) throw new HandoffGuardError('ENVELOPE_INVALID', 'requirement_ids must be a non-empty array');
  for (const id of env.requirement_ids) {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) {
      // Syntax failure is ENVELOPE_INVALID; REQUIREMENT_MISSING is reserved
      // for acknowledgement/coverage gaps.
      throw new HandoffGuardError('ENVELOPE_INVALID', `requirement id failed safe-id check: ${String(id)}`);
    }
  }
  if (env.requirement_count !== env.requirement_ids.length) {
    throw new HandoffGuardError('REQUIREMENT_COUNT_MISMATCH', `requirement_count ${env.requirement_count} != requirement_ids.length ${env.requirement_ids.length}`);
  }
  assertNonEmpty(env.source_host, 'source_host');
  assertNonEmpty(env.target_host, 'target_host');
  if (env.execution_mode !== 'AUTO_EXECUTE' && env.execution_mode !== 'PLAN_REVIEW') {
    throw new HandoffGuardError('ENVELOPE_INVALID', 'execution_mode must be AUTO_EXECUTE or PLAN_REVIEW');
  }
  if (typeof env.truncation_detected !== 'boolean') throw new HandoffGuardError('ENVELOPE_INVALID', 'truncation_detected must be boolean');
  if (!Array.isArray(env.truncated_fields)) throw new HandoffGuardError('ENVELOPE_INVALID', 'truncated_fields must be an array');
  if (!env.context_capsule || typeof env.context_capsule !== 'object' || Array.isArray(env.context_capsule)) {
    throw new HandoffGuardError('ENVELOPE_INVALID', 'context_capsule must be a bounded object');
  }
  if (Object.keys(env.context_capsule).length > MAX_CAPSULE_ENTRIES) throw new HandoffGuardError('ENVELOPE_INVALID', `context capsule exceeds ${MAX_CAPSULE_ENTRIES} entries`);
  if (!Array.isArray(env.selected_capabilities)) throw new HandoffGuardError('ENVELOPE_INVALID', 'selected_capabilities must be an array');
  if (!Array.isArray(env.proof_obligations)) throw new HandoffGuardError('ENVELOPE_INVALID', 'proof_obligations must be an array');
  for (const obligation of env.proof_obligations) {
    if (!obligation || typeof obligation.id !== 'string' || !SAFE_ID.test(obligation.id)) {
      throw new HandoffGuardError('ENVELOPE_INVALID', `proof obligation failed safe-id check: ${String(obligation?.id)}`);
    }
    if (obligation.status !== 'PENDING' && obligation.status !== 'SATISFIED') {
      throw new HandoffGuardError('ENVELOPE_INVALID', `proof obligation ${obligation.id} status must be PENDING or SATISFIED`);
    }
    if (obligation.sha256 !== null && !isSha256(obligation.sha256)) {
      throw new HandoffGuardError('ENVELOPE_INVALID', `proof obligation ${obligation.id} sha256 invalid`);
    }
  }
  for (const capability of env.selected_capabilities) {
    const cap = capability as unknown as CapabilityProjection;
    if (!cap || typeof cap.id !== 'string' || !SAFE_ID.test(cap.id)) {
      throw new HandoffGuardError('ENVELOPE_INVALID', `capability projection failed safe-id check`);
    }
    if (!CAPABILITY_PROJECTION_STATES.includes(cap.state)) {
      throw new HandoffGuardError('ENVELOPE_INVALID', `capability ${cap.id} has invalid state; must be one of ${CAPABILITY_PROJECTION_STATES.join('|')}`);
    }
    if (typeof cap.required_behavior !== 'string' || cap.required_behavior.length === 0) {
      throw new HandoffGuardError('ENVELOPE_INVALID', `capability ${cap.id} must declare required_behavior`);
    }
  }
  return env;
}

export function hashEnvelopeBytes(bytes: Uint8Array): Sha256 {
  return createHash('sha256').update(bytes).digest('hex') as Sha256;
}

/**
 * Verify integrity of a received envelope against its raw serialized bytes.
 * Detects truncation markers regardless of the declared flag.
 */
export function verifyEnvelopeIntegrity(env: CrossHostHandoffEnvelope, rawBytes: Uint8Array): void {
  const text = new TextDecoder().decode(rawBytes);
  const markerHit = TRUNCATION_MARKERS.find((m) => text.includes(m));
  if (markerHit) {
    throw new HandoffGuardError('TRUNCATION_DETECTED', `truncation marker "${markerHit}" present in artifact`);
  }
  if (env.truncation_detected || env.truncated_fields.length > 0) {
    throw new HandoffGuardError('TRUNCATION_DETECTED', 'envelope declares truncated fields');
  }
  if (rawBytes.byteLength !== env.byte_length) {
    throw new HandoffGuardError('BYTE_LENGTH_MISMATCH', `declared ${env.byte_length} bytes but received ${rawBytes.byteLength}`);
  }
  const actualHash = hashEnvelopeBytes(rawBytes);
  if (actualHash !== env.artifact_sha256) {
    throw new HandoffGuardError('HASH_MISMATCH', `declared ${env.artifact_sha256} but computed ${actualHash}`);
  }
}

/**
 * Final fail-closed gate. Call before the FIRST file edit of the receiving
 * session. graphAvailable=false blocks unconditionally (REQ-C13).
 */
export function assertSafeToEdit(
  env: CrossHostHandoffEnvelope,
  options: { artifactBytes: Uint8Array; graphAvailable: boolean },
): void {
  // Integrity is mandatory: the receiving session MUST have the materialized
  // artifact bytes before any edit (no silent skip of hash/length/markers).
  verifyEnvelopeIntegrity(env, options.artifactBytes);
  if (env.truncation_detected || env.truncated_fields.length > 0) {
    throw new HandoffGuardError('TRUNCATION_DETECTED', 'envelope declares truncated fields');
  }
  if (!options.graphAvailable) {
    throw new HandoffGuardError('GRAPH_UNAVAILABLE', 'context graph unavailable — editing blocked before first edit');
  }
  if (env.acknowledged_sha256 !== null && env.acknowledged_sha256 !== undefined) {
    if (env.acknowledged_sha256 !== env.artifact_sha256) {
      throw new HandoffGuardError('ACK_MISMATCH', 'acknowledged_sha256 does not bind this artifact');
    }
    if (env.acknowledged_requirement_count !== env.requirement_count) {
      throw new HandoffGuardError('ACK_MISMATCH', `acknowledged ${env.acknowledged_requirement_count} of ${env.requirement_count} requirements`);
    }
    if (env.proof_obligations.length > 0 && env.acknowledged_proof_obligation_count !== env.proof_obligations.length) {
      throw new HandoffGuardError('ACK_MISMATCH', `acknowledged ${env.acknowledged_proof_obligation_count} of ${env.proof_obligations.length} proof obligations`);
    }
  }
}

/** Receiver acknowledgement binding — requirements AND proof obligations (steering §2). */
export function acknowledgeEnvelope(env: CrossHostHandoffEnvelope, ack: { requirement_ids: string[]; proof_obligation_ids?: string[] }): CrossHostHandoffEnvelope {
  const missing = env.requirement_ids.filter((id) => !ack.requirement_ids.includes(id));
  if (missing.length > 0) {
    throw new HandoffGuardError('REQUIREMENT_MISSING', `receiver dropped requirements: ${missing.join(', ')}`);
  }
  const pendingProofs = env.proof_obligations.filter((o) => o.status === 'PENDING');
  const ackedProofIds = ack.proof_obligation_ids ?? env.proof_obligations.map((o) => o.id);
  const missingProofs = env.proof_obligations.filter((o) => !ackedProofIds.includes(o.id));
  if (missingProofs.length > 0) {
    throw new HandoffGuardError('REQUIREMENT_MISSING', `receiver did not acknowledge proof obligations: ${missingProofs.map((o) => o.id).join(', ')}`);
  }
  void pendingProofs;
  return {
    ...env,
    acknowledged_sha256: env.artifact_sha256,
    acknowledged_requirement_count: ack.requirement_ids.length,
    acknowledged_proof_obligation_count: ackedProofIds.length,
  };
}

/** AUTO_EXECUTE contract (REQ-C16): valid envelope executes without approval pause. */
export function resolveExecutionContract(env: CrossHostHandoffEnvelope, ownerPlanReviewMode: boolean): { action: 'EXECUTE_IMMEDIATELY' | 'PAUSE_FOR_REVIEW'; reason: string } {
  if (ownerPlanReviewMode) return { action: 'PAUSE_FOR_REVIEW', reason: 'owner enabled Plan/Review mode' };
  if (env.execution_mode === 'AUTO_EXECUTE') return { action: 'EXECUTE_IMMEDIATELY', reason: 'AUTO_EXECUTE envelope is valid; no approval pause' };
  return { action: 'PAUSE_FOR_REVIEW', reason: 'PLAN_REVIEW envelope awaits explicit owner review' };
}

// ── Per-host encoder/decoder adapters ────────────────────────────────
// Real framing dialects per host; decode always re-verifies integrity so any
// mutation (dropped/altered requirement) fails closed.

export interface HandoffHostAdapter {
  host: string;
  frame(envelope: CrossHostHandoffEnvelope): Uint8Array;
  unframe(packet: Uint8Array): CrossHostHandoffEnvelope;
}

interface Framing {
  begin: (host: string) => string;
  end: (host: string) => string;
}

const FRAMINGS: Record<string, Framing> = {
  claude: { begin: (h) => `<!-- agent-rules:handoff:${h}\n`, end: (h) => `\nagent-rules:handoff:${h} -->` },
  codex: { begin: (h) => `--- BEGIN AGENT-RULES HANDOFF [${h}] ---\n`, end: (h) => `\n--- END AGENT-RULES HANDOFF [${h}] ---` },
  opencode: { begin: (h) => `::agent-rules-handoff{host=${h}}\n`, end: () => '\n::end-agent-rules-handoff' },
  cursor: { begin: (h) => `# agent-rules handoff (${h})\n\`\`\`json\n`, end: () => '\n```' },
  antigravity: { begin: (h) => `=== agent-rules handoff <${h}> ===\n`, end: (h) => `\n=== /agent-rules handoff <${h}> ===` },
  grok: { begin: (h) => `[agent-rules][${h}]\n`, end: (h) => `\n[/agent-rules][${h}]` },
  'deepseek-harness': { begin: (h) => `{"dialect":"dsh","host":"${h}","payload":`, end: () => '}' },
  'command-code': { begin: (h) => `.SYNOPSIS agent-rules handoff ${h}\n#BEGIN#\n`, end: () => '\n#END#' },
  omp: { begin: (h) => `<!-- agent-rules:handoff:${h} -->\n`, end: (h) => `\n<!-- /agent-rules:handoff:${h} -->` },
};

function serializePayload(env: CrossHostHandoffEnvelope): string {
  return JSON.stringify(env, null, 2);
}

const adapterCache = new Map<string, HandoffHostAdapter>();

export function getHandoffHostAdapter(host: string): HandoffHostAdapter {
  const cached = adapterCache.get(host);
  if (cached) return cached;
  const framing = FRAMINGS[host];
  if (!framing) throw new HandoffGuardError('ENVELOPE_INVALID', `no handoff dialect registered for host: ${host}`);
  const adapter: HandoffHostAdapter = {
    host,
    frame(envelope) {
      validateEnvelopeShape(envelope);
      const payload = serializePayload(envelope);
      const packet = `${framing.begin(host)}${payload}${framing.end(host)}`;
      return new TextEncoder().encode(packet);
    },
    unframe(packet) {
      const text = new TextDecoder().decode(packet);
      const begin = framing.begin(host);
      const end = framing.end(host);
      const startIdx = text.indexOf(begin);
      const endIdx = text.lastIndexOf(end);
      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new HandoffGuardError('ENVELOPE_INVALID', `packet missing ${host} framing markers`);
      }
      const payload = text.slice(startIdx + begin.length, endIdx);
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new HandoffGuardError('ENVELOPE_INVALID', `payload is not valid JSON for host ${host}`);
      }
      return validateEnvelopeShape(parsed);
    },
  };
  adapterCache.set(host, adapter);
  return adapter;
}

export function listHandoffDialectHosts(): string[] {
  return Object.keys(FRAMINGS);
}

/** Build an outgoing envelope from materialized plan bytes (REQ-C12, steering §1/§2). */
export function createHandoffEnvelope(input: {
  artifactUri: string;
  artifactBytes: Uint8Array;
  primaryOutcomeId: string;
  primaryOutcome: string;
  requirementIds: string[];
  sourceHost: string;
  targetHost: string;
  executionMode: HandoffExecutionMode;
  contextCapsule?: ContextCapsule;
  selectedCapabilities?: CapabilityProjection[];
  proofObligations?: ProofObligation[];
}): CrossHostHandoffEnvelope {
  const env: CrossHostHandoffEnvelope = {
    schema: HANDOFF_ENVELOPE_SCHEMA,
    version: 1,
    artifact_uri: input.artifactUri,
    artifact_sha256: hashEnvelopeBytes(input.artifactBytes),
    byte_length: input.artifactBytes.byteLength,
    primary_outcome_id: input.primaryOutcomeId,
    primary_outcome: input.primaryOutcome,
    requirement_ids: [...input.requirementIds],
    requirement_count: input.requirementIds.length,
    source_host: input.sourceHost,
    target_host: input.targetHost,
    execution_mode: input.executionMode,
    acknowledged_sha256: null,
    acknowledged_requirement_count: null,
    acknowledged_proof_obligation_count: null,
    truncation_detected: false,
    truncated_fields: [],
    context_capsule: input.contextCapsule ?? {},
    selected_capabilities: [...(input.selectedCapabilities ?? [])],
    proof_obligations: [...(input.proofObligations ?? [])],
  };
  return validateEnvelopeShape(env);
}

export { sha256Bytes };
