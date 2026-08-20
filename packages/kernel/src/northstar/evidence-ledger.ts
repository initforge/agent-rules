import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  assertEvidenceRecord,
  assertTaskPacket,
  assertWorkSpec,
  sha256Canonical,
  validateTraceability,
  type EvidenceKind,
  type EvidenceRecord,
  type RiskClass,
  type TaskPacket,
  type WorkSpec,
} from './protocol.js';
import type { TraceabilityManifest } from './compiler.js';
import { STAGE_RANK, bestStage, normalizeStages, type EvidenceStage } from '../claim-registry.js';

export type EvidenceOrigin = 'runtime' | 'verifier' | 'auditor';

export interface EvidenceEnvelope {
  seq: number;
  origin: EvidenceOrigin;
  previous_hash: string;
  record: EvidenceRecord;
  envelope_hash: string;
}

export interface ClaimAcceptancePolicy {
  claim_id: string;
  required_kinds?: EvidenceKind[];
  minimum_channels?: number;
  /** AM-0005: minimum evidence stage. When set, below-stage evidence never accepts the claim. */
  required_stage?: EvidenceStage;
}

export interface EvidenceBinding {
  spec_id: string;
  spec_revision: number;
  candidate_epoch: number;
  platform: string;
  now_ms?: number;
  freshness_ms?: number;
}

export interface AcceptanceResult {
  outcome: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED';
  accepted_claims: string[];
  unresolved_claims: string[];
  failed_claims: string[];
  reasons: string[];
}

const GENESIS = '0'.repeat(64);

function fileSha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function atomicAppend(file: string, line: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line, { encoding: 'utf8', mode: 0o600 });
}

/** Append-only, hash-chained evidence store. Worker-origin records are not representable. */
export class EvidenceLedger {
  constructor(readonly file: string, private readonly repoRoot?: string) {}

  append(record: EvidenceRecord, origin: EvidenceOrigin): EvidenceEnvelope {
    assertEvidenceRecord(record);
    if (record.artifact_path && record.sha256 && this.repoRoot) {
      const artifact = path.resolve(this.repoRoot, record.artifact_path);
      const root = path.resolve(this.repoRoot) + path.sep;
      if (artifact !== path.resolve(this.repoRoot) && !artifact.startsWith(root)) throw new Error(`evidence artifact escapes repository: ${record.artifact_path}`);
      if (!fs.existsSync(artifact)) throw new Error(`evidence artifact does not exist: ${record.artifact_path}`);
      const actual = fileSha256(artifact);
      if (actual !== record.sha256) throw new Error(`evidence artifact hash mismatch for ${record.artifact_path}`);
    }
    const prior = this.read();
    const body = { seq: (prior.at(-1)?.seq ?? 0) + 1, origin, previous_hash: prior.at(-1)?.envelope_hash ?? GENESIS, record };
    const envelope: EvidenceEnvelope = { ...body, envelope_hash: sha256Canonical(body) };
    atomicAppend(this.file, `${JSON.stringify(envelope)}\n`);
    return envelope;
  }

  read(): EvidenceEnvelope[] {
    if (!fs.existsSync(this.file)) return [];
    const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    const out: EvidenceEnvelope[] = [];
    for (const [index, line] of lines.entries()) {
      const envelope = JSON.parse(line) as EvidenceEnvelope;
      assertEvidenceRecord(envelope.record);
      const expectedPrevious = out.at(-1)?.envelope_hash ?? GENESIS;
      if (envelope.previous_hash !== expectedPrevious) throw new Error(`evidence chain broken at line ${index + 1}`);
      const body = { seq: envelope.seq, origin: envelope.origin, previous_hash: envelope.previous_hash, record: envelope.record };
      if (!['runtime', 'verifier', 'auditor'].includes(envelope.origin)) throw new Error(`invalid evidence origin at line ${index + 1}`);
      if (envelope.envelope_hash !== sha256Canonical(body)) throw new Error(`evidence envelope hash mismatch at line ${index + 1}`);
      if (envelope.seq !== index + 1) throw new Error(`evidence sequence mismatch at line ${index + 1}`);
      out.push(envelope);
    }
    return out;
  }

  verify(): { ok: boolean; records: number; reason?: string } {
    try { const records = this.read(); return { ok: true, records: records.length }; }
    catch (error) { return { ok: false, records: 0, reason: error instanceof Error ? error.message : String(error) }; }
  }
}

function channelKey(record: EvidenceRecord): string {
  // Same oracle lineage counts once even when exposed through multiple verifier commands.
  return record.oracle_group ?? record.verifier_id ?? `kind:${record.kind}`;
}

function latestByChannelKind(records: readonly EvidenceRecord[]): Map<string, EvidenceRecord> {
  const out = new Map<string, EvidenceRecord>();
  // Preserve distinct kinds from the same oracle while deduplicating retries of the same observation.
  for (const record of records) out.set(`${channelKey(record)}\u0000${record.kind}`, record);
  return out;
}

function defaultMinimumChannels(risk: RiskClass | undefined): number {
  return risk === 'S2' || risk === 'S3' ? 2 : 1;
}

/** PASS is a reducer over independent evidence; worker prose has no input to this function. */
export function deriveAcceptance(input: {
  spec: WorkSpec;
  packets: readonly TaskPacket[];
  manifest: TraceabilityManifest;
  evidence: readonly EvidenceEnvelope[];
  policies?: readonly ClaimAcceptancePolicy[];
  scopeViolations?: readonly string[];
  policyViolations?: readonly string[];
  /** When supplied, only fresh evidence with this exact runtime binding may count. */
  binding?: EvidenceBinding;
}): AcceptanceResult {
  assertWorkSpec(input.spec);
  input.packets.forEach(assertTaskPacket);
  const reasons: string[] = [];
  const trace = validateTraceability(input.spec, input.packets);
  if (!trace.valid) reasons.push(...trace.problems.map((problem) => `${problem.code}: ${problem.message}`));
  if (input.scopeViolations?.length) reasons.push(`forbidden-scope violation(s): ${input.scopeViolations.join(', ')}`);
  if (input.policyViolations?.length) reasons.push(...input.policyViolations.map((v) => `policy: ${v}`));
  if (input.spec.unresolved?.length) reasons.push(...input.spec.unresolved.map((v) => `unresolved: ${v}`));

  const mandatoryClaims = new Set(input.spec.requirements.filter((r) => r.mandatory).flatMap((r) => r.claims));
  const evidenceForAcceptance = input.binding
    ? input.evidence.filter((envelope) => {
      const record = envelope.record;
      const observed = record.observed_at ? Date.parse(record.observed_at) : Number.NaN;
      const now = input.binding!.now_ms ?? Date.now();
      const freshness = input.binding!.freshness_ms ?? 24 * 60 * 60 * 1000;
      const matches = record.spec_id === input.binding!.spec_id
        && record.spec_revision === input.binding!.spec_revision
        && record.candidate_epoch === input.binding!.candidate_epoch
        && record.platform === input.binding!.platform
        && !!record.verifier_id;
      const fresh = Number.isFinite(observed) && observed <= now + 60_000 && now - observed <= freshness;
      return matches && fresh;
    })
    : input.evidence;
  if (input.binding && evidenceForAcceptance.length !== input.evidence.length) {
    reasons.push('some evidence was stale, foreign, or missing runtime binding and was excluded');
  }
  const recordsByClaim = new Map<string, EvidenceRecord[]>();
  for (const envelope of evidenceForAcceptance) recordsByClaim.set(envelope.record.claim_id, [...(recordsByClaim.get(envelope.record.claim_id) ?? []), envelope.record]);

  const accepted: string[] = [];
  const unresolved: string[] = [];
  const failed: string[] = [];
  for (const claimId of mandatoryClaims) {
    const claimDef = input.manifest.claims.find((claim) => claim.claim_id === claimId);
    if (!claimDef) { unresolved.push(claimId); reasons.push(`claim ${claimId} has no semantic definition`); continue; }
    const latest = latestByChannelKind(recordsByClaim.get(claimId) ?? []);
    const latestRecords = [...latest.values()];
    if (latestRecords.some((record) => record.status === 'fail')) { failed.push(claimId); continue; }
    if (latestRecords.some((record) => record.status === 'blocked')) { unresolved.push(claimId); continue; }
    const policy = input.policies?.find((candidate) => candidate.claim_id === claimId);
    const requiredKinds = policy?.required_kinds ?? claimDef.required_kinds ?? [];
    const missingKinds = requiredKinds.filter((kind) => !latestRecords.some((record) => record.kind === kind && record.status === 'pass'));
    if (missingKinds.length) { unresolved.push(claimId); reasons.push(`claim ${claimId} lacks required evidence kind(s): ${missingKinds.join(', ')}`); continue; }
    // AM-0005: evidence stage gate. Test-only evidence never satisfies a
    // live/dogfood/operational claim; below-stage acceptance fails closed.
    // Records without an explicit stage default to the TEST_VERIFIED floor.
    const requiredStage = policy?.required_stage ?? claimDef.required_stage;
    if (requiredStage) {
      const passingStages = normalizeStages(
        latestRecords
          .filter((record) => record.status === 'pass')
          .map((record) => record.evidence_stage as EvidenceStage | undefined)
          .filter((stage): stage is EvidenceStage => stage !== undefined),
      );
      const best = bestStage(passingStages);
      if (best === undefined || STAGE_RANK[best] < STAGE_RANK[requiredStage] || requiredStage === 'LIVE_UNPROVEN') {
        unresolved.push(claimId);
        reasons.push(`claim ${claimId} evidence stage ${best ?? 'none'} below required stage ${requiredStage} (AM-0005: test-only evidence cannot prove a live/dogfood/operational claim)`);
        continue;
      }
    }
    const passingChannels = new Set(latestRecords.filter((record) => record.status === 'pass').map(channelKey));
    const minimum = policy?.minimum_channels ?? defaultMinimumChannels(input.spec.risk_class);
    if (passingChannels.size < minimum) { unresolved.push(claimId); reasons.push(`claim ${claimId} has ${passingChannels.size}/${minimum} required independent oracle channel(s)`); continue; }
    accepted.push(claimId);
  }

  const hardFailure = failed.length > 0 || (input.scopeViolations?.length ?? 0) > 0 || (input.policyViolations?.length ?? 0) > 0;
  const blocked = (input.spec.unresolved?.length ?? 0) > 0 || unresolved.some((id) => (recordsByClaim.get(id) ?? []).some((r) => r.status === 'blocked'));
  const outcome = hardFailure ? 'FAILED' : reasons.length === 0 && unresolved.length === 0 ? 'PASS' : blocked ? 'BLOCKED' : 'PARTIAL';
  return { outcome, accepted_claims: accepted.sort(), unresolved_claims: unresolved.sort(), failed_claims: failed.sort(), reasons };
}
