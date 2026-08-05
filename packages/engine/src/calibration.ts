/**
 * calibration.ts — M11-R36 claim calibration telemetry (AM-0020 §10).
 *
 * Records the adversarial-review disposition events the contract enumerates,
 * aggregates them per model/provider/domain, and derives the review-strength
 * routing rule. Model reputation never authorizes a verdict; historical
 * calibration, capability and exact evidence do.
 *
 * Honesty invariant: a metric with no events reports `UNAVAILABLE` — never `0`
 * as if it were proof of quality. Rates use `reviews` (count of
 * `REVIEW_LATENCY_MS` events, i.e. one per review) as the denominator and are
 * `UNAVAILABLE` when `reviews === 0`.
 *
 * ── R31 call seam (review-independence coordinator) ──────────────────────────
 * `review-independence.ts` is not present in this tree yet. The R31 coordinator
 * calls `store.record(...)` at these points (exact event kinds):
 *   - worker self-PASS later rejected by reviewer      → WORKER_SELF_PASS_REJECTED
 *   - challenger rejects a reviewer ACCEPT             → REVIEWER_ACCEPT_REJECTED_BY_CHALLENGER
 *   - adjudication overturns a false rejection         → FALSE_REJECTION_OVERTURNED
 *   - a defect reaches the pipeline / escapes the gate → DEFECT_ESCAPE
 *   - two findings are merged as duplicates            → DUPLICATE_FINDINGS
 *   - each iteration of a same-root repair loop        → REPAIR_LOOP_COUNT
 *   - once per review (latency/token/cost)             → REVIEW_LATENCY_MS / REVIEW_TOKENS / REVIEW_COST
 *   - a required capability is missing for a verdict   → CAPABILITY_MISMATCH
 *   - evidence is invalidated (cost of the loss)       → EVIDENCE_INVALIDATION_COST
 * Each record may bind the candidate epoch hash when one is available
 * (`record(ev, { epoch: candidateEpochHash(epoch) })`).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RiskTier } from './plan-readiness.js';

export const CALIBRATION_SCHEMA = 'telemetry/calibration/v1';

/** Honest sentinel: the metric exists but has no recorded events. Never `0`. */
export const UNAVAILABLE = 'UNAVAILABLE';
export type Unavailable = typeof UNAVAILABLE;

// ── Event types (AM-0020 §10) ────────────────────────────────────────────────

export interface CalibrationEventBase {
  model: string;
  provider: string;
  /** Canonical claim/artifact identifier the event refers to. */
  claimId?: string;
  /** Domain (e.g. auth, finance, visual) — REQUIRED on DEFECT_ESCAPE. */
  domain?: string;
}

export interface CalibrationEventWithEpoch extends CalibrationEventBase {
  /** Candidate epoch hash (see candidateEpochHash) bound when available. */
  epoch?: string;
}

export type CalibrationEvent =
  | (CalibrationEventWithEpoch & { kind: 'WORKER_SELF_PASS_REJECTED' })
  | (CalibrationEventWithEpoch & { kind: 'REVIEWER_ACCEPT_REJECTED_BY_CHALLENGER' })
  | (CalibrationEventWithEpoch & { kind: 'FALSE_REJECTION_OVERTURNED' })
  | (CalibrationEventWithEpoch & { kind: 'DEFECT_ESCAPE'; domain: string })
  | (CalibrationEventBase & { kind: 'DUPLICATE_FINDINGS'; count: number })
  | (CalibrationEventBase & { kind: 'REPAIR_LOOP_COUNT'; count: number; claimId: string })
  | (CalibrationEventWithEpoch & { kind: 'REVIEW_LATENCY_MS'; latencyMs: number; tier?: RiskTier })
  | (CalibrationEventBase & { kind: 'REVIEW_TOKENS'; tokens: number })
  | (CalibrationEventBase & { kind: 'REVIEW_COST'; cost: number })
  | (CalibrationEventWithEpoch & { kind: 'CAPABILITY_MISMATCH'; requiredCapability: string })
  | (CalibrationEventWithEpoch & { kind: 'EVIDENCE_INVALIDATION_COST'; cost: number })
  // Derived observability record (not in the §10 list): the routing decision.
  | ({ model: string; provider: string; domain?: string } & {
      kind: 'ROUTING_DECISION';
      tier: RiskTier;
      level: 'NONE' | 'ECONOMICAL' | 'STRONG';
      differentProvider: boolean;
      reason: string;
    });

// ── Content addressing ───────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deterministic canonical JSON (sorted keys) — same payload ⇒ same hash. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return v;
  });
}

/** Content address of the event payload — excludes the recorded-at timestamp. */
export function calibrationEventId(event: CalibrationEvent): string {
  return createHash('sha256').update(canonicalJson(event)).digest('hex');
}

interface StoredCalibrationEvent {
  eventId: string;
  event: CalibrationEvent;
  recordedAt: string;
}

// ── Store ────────────────────────────────────────────────────────────────────

export interface RecordOptions {
  /** Candidate epoch hash to bind when available. */
  epoch?: string;
  /** Deduplicate by content address (default true). */
  dedupe?: boolean;
}

export interface RecordResult {
  eventId: string;
  /** false when the event was deduplicated and not appended. */
  recorded: boolean;
  kind: CalibrationEvent['kind'];
}

export class CalibrationStore {
  private events: StoredCalibrationEvent[] = [];
  private ids = new Set<string>();
  private storagePath: string;

  constructor(storagePath?: string) {
    // Same convention as telemetry.ts (.telemetry/…). Callers own the path;
    // the engine default keeps calibration and telemetry adjacent.
    this.storagePath = storagePath ?? path.join(process.cwd(), '.telemetry', 'calibration.jsonl');
    this.ids = new Set(this.readStored().map((e) => e.eventId));
  }

  get path(): string {
    return this.storagePath;
  }

  /** Append-only + content-addressed. Identical payload twice ⇒ one record (dedupe, default). */
  record(event: CalibrationEvent, opts: RecordOptions = {}): RecordResult {
    const bindsEpoch = opts.epoch && (event as { epoch?: string }).epoch === undefined;
    const full: CalibrationEvent = bindsEpoch
      ? ({ ...event, epoch: opts.epoch } as CalibrationEvent)
      : event;
    const eventId = calibrationEventId(full);
    const dedupe = opts.dedupe ?? true;
    if (dedupe && this.ids.has(eventId)) {
      return { eventId, recorded: false, kind: event.kind };
    }
    this.ids.add(eventId);
    this.events.push({ eventId, event: full, recordedAt: new Date().toISOString() });
    return { eventId, recorded: true, kind: event.kind };
  }

  /** Persist appended events (append-only JSONL). */
  async flush(): Promise<void> {
    if (this.events.length === 0) return;
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const stream = fs.createWriteStream(this.storagePath, { flags: 'a' });
    for (const stored of this.events) stream.write(JSON.stringify(stored) + '\n');
    await new Promise<void>((resolve, reject) => {
      stream.end((err: Error | null) => (err ? reject(err) : resolve()));
    });
    this.events = [];
  }

  /** All events: unflushed in-memory records plus persisted ones. */
  allEvents(): CalibrationEvent[] {
    return [...this.readStored(), ...this.events].map((e) => e.event);
  }

  private readStored(): StoredCalibrationEvent[] {
    if (!fs.existsSync(this.storagePath)) return [];
    const content = fs.readFileSync(this.storagePath, 'utf-8');
    const out: StoredCalibrationEvent[] = [];
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        out.push(JSON.parse(line) as StoredCalibrationEvent);
      } catch {
        // unparseable line is ignored; the store is a telemetry sink, not a source of truth
      }
    }
    return out;
  }
}

// ── Aggregation ──────────────────────────────────────────────────────────────

export interface CalibrationFilter {
  model?: string;
  provider?: string;
  domain?: string;
}

export interface CalibrationGroupSummary {
  model: string;
  provider: string;
  domain: string;
  /** Denominator for all rates: one REVIEW_LATENCY_MS event per review. */
  reviews: number;
  falseAcceptCount: number;
  falseRejectCount: number;
  defectEscapeCount: number;
  duplicateFindings: number;
  repairLoopCount: number;
  capabilityMismatchCount: number;
  evidenceInvalidationCost: number;
  falseAcceptRate: number | Unavailable;
  falseRejectRate: number | Unavailable;
  defectEscapeRate: number | Unavailable;
  avgLatencyMs: number | Unavailable;
  avgTokens: number | Unavailable;
  avgCost: number | Unavailable;
}

export interface CalibrationSummary {
  schema: typeof CALIBRATION_SCHEMA;
  filter: CalibrationFilter;
  totalEvents: number;
  /** Per model/provider/domain (or a coarser grouping when filtered). */
  groups: CalibrationGroupSummary[];
  /** Across all groups in the (filtered) population. */
  overall: CalibrationGroupSummary;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function rate(count: number, denominator: number): number | Unavailable {
  return denominator > 0 ? count / denominator : UNAVAILABLE;
}

function avg(values: number[]): number | Unavailable {
  return values.length > 0 ? sum(values) / values.length : UNAVAILABLE;
}

/**
 * Aggregate calibration events per model/provider/domain. When a filter names a
 * model/provider/domain the grouping coarsens to the remaining unbound keys, so
 * a model-level summary still separates providers and domains. Every metric with
 * no events reports `UNAVAILABLE` — never `0`.
 */
export function calibrationSummary(store: CalibrationStore | CalibrationEvent[], filter: CalibrationFilter = {}): CalibrationSummary {
  const events = Array.isArray(store) ? store : store.allEvents();

  const byKey = new Map<string, CalibrationEvent[]>();
  const filtered: CalibrationEvent[] = [];
  const keyOf = (e: CalibrationEvent): string => {
    const model = filter.model ?? e.model ?? '';
    const provider = filter.provider ?? e.provider ?? '';
    const domain = filter.domain ?? e.domain ?? 'ALL';
    return `${model}\u0000${provider}\u0000${domain}`;
  };
  for (const e of events) {
    if (filter.model && e.model !== filter.model) continue;
    if (filter.provider && e.provider !== filter.provider) continue;
    if (filter.domain && e.domain !== filter.domain) continue;
    filtered.push(e);
    const k = keyOf(e);
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }

  const build = (bucket: CalibrationEvent[], model: string, provider: string, domain: string): CalibrationGroupSummary => {
    const falseAcceptCount = bucket.filter((e) => e.kind === 'WORKER_SELF_PASS_REJECTED' || e.kind === 'REVIEWER_ACCEPT_REJECTED_BY_CHALLENGER').length;
    const falseRejectCount = bucket.filter((e) => e.kind === 'FALSE_REJECTION_OVERTURNED').length;
    const defectEscapeCount = bucket.filter((e) => e.kind === 'DEFECT_ESCAPE').length;
    const reviews = bucket.filter((e) => e.kind === 'REVIEW_LATENCY_MS').length;
    const repairLoopCount = bucket
      .filter((e) => e.kind === 'REPAIR_LOOP_COUNT')
      .reduce((a, e) => a + ((e as { count?: number }).count ?? 0), 0);
    const duplicateFindings = bucket
      .filter((e) => e.kind === 'DUPLICATE_FINDINGS')
      .reduce((a, e) => a + ((e as { count?: number }).count ?? 0), 0);
    const capabilityMismatchCount = bucket.filter((e) => e.kind === 'CAPABILITY_MISMATCH').length;
    const evidenceInvalidationCost = bucket
      .filter((e) => e.kind === 'EVIDENCE_INVALIDATION_COST')
      .reduce((a, e) => a + ((e as { cost?: number }).cost ?? 0), 0);
    const latency = bucket.filter((e) => e.kind === 'REVIEW_LATENCY_MS').map((e) => (e as { latencyMs: number }).latencyMs);
    const tokens = bucket.filter((e) => e.kind === 'REVIEW_TOKENS').map((e) => (e as { tokens: number }).tokens);
    const cost = bucket.filter((e) => e.kind === 'REVIEW_COST').map((e) => (e as { cost: number }).cost);
    return {
      model, provider, domain,
      reviews,
      falseAcceptCount, falseRejectCount, defectEscapeCount,
      duplicateFindings, repairLoopCount, capabilityMismatchCount, evidenceInvalidationCost,
      falseAcceptRate: rate(falseAcceptCount, reviews),
      falseRejectRate: rate(falseRejectCount, reviews),
      defectEscapeRate: rate(defectEscapeCount, reviews),
      avgLatencyMs: avg(latency),
      avgTokens: avg(tokens),
      avgCost: avg(cost),
    };
  };

  const groups: CalibrationGroupSummary[] = [];
  for (const [k, bucket] of byKey) {
    const [model, provider, domain] = k.split('\u0000');
    groups.push(build(bucket, model, provider, domain));
  }
  groups.sort((a, b) => `${a.model}/${a.provider}/${a.domain}`.localeCompare(`${b.model}/${b.provider}/${b.domain}`));

  return {
    schema: CALIBRATION_SCHEMA,
    filter,
    totalEvents: filtered.length,
    groups,
    overall: build(filtered, filter.model ?? '*', filter.provider ?? '*', filter.domain ?? 'ALL'),
  };
}

// ── Review-strength routing (AM-0020 §10) ────────────────────────────────────

export interface RoutingDecision {
  tier: RiskTier;
  level: 'NONE' | 'ECONOMICAL' | 'STRONG';
  differentProvider: boolean;
  reason: string;
}

/** Default false-accept rate above which a model loses economical/self-provider routing. */
export const FALSE_ACCEPT_RATE_THRESHOLD = 0.15;
/** Repeated same-root repair loops at/above which the tier escalates. */
export const REPEATED_ROOT_CAUSE_LOOPS = 2;

/**
 * Routing rule (AM-0020 §10):
 *   T0 — mechanical, deterministic verifier, no LLM.
 *   T1 — economical reviewer on clean calibration; STRONG + different-provider
 *        when false-accept rate is above threshold or repair loops repeat.
 *   T2/T3/T-Visual/T-Global — STRONG reviewer by tier; different-provider when
 *        calibration shows high false-accept rate or repeated root-cause failure.
 * `calibration` may be a summary group or `null` (unknown); an UNAVAILABLE
 * calibration never authorizes downgrading a tier's strong-review requirement —
 * it only admits the tier default.
 */
export function routeReviewStrength(
  tier: RiskTier,
  calibration: CalibrationGroupSummary | null,
): RoutingDecision {
  if (tier === 'T0') {
    return { tier, level: 'NONE', differentProvider: false, reason: 'T0 mechanical: deterministic verifier, no LLM reviewer' };
  }

  const highFalseAccept = calibration !== null
    && calibration.reviews > 0
    && calibration.falseAcceptRate !== UNAVAILABLE
    && calibration.falseAcceptRate > FALSE_ACCEPT_RATE_THRESHOLD;
  const repeatedRootCause = calibration !== null && calibration.repairLoopCount >= REPEATED_ROOT_CAUSE_LOOPS;
  const unhealthy = highFalseAccept === true || repeatedRootCause;

  if (tier === 'T1') {
    if (unhealthy) {
      return { tier, level: 'STRONG', differentProvider: true, reason: `T1 escalated: ${highFalseAccept ? 'false-accept rate above threshold' : ''}${highFalseAccept && repeatedRootCause ? ' and ' : ''}${repeatedRootCause ? 'repeated same-root repair loop' : ''}` };
    }
    return { tier, level: 'ECONOMICAL', differentProvider: false, reason: 'T1 clean calibration: economical reviewer' };
  }

  // T2 / T3 / T-Visual / T-Global — strong reviewer by tier.
  if (unhealthy) {
    return { tier, level: 'STRONG', differentProvider: true, reason: `${tier} escalated to different-provider reviewer: ${highFalseAccept ? 'false-accept rate above threshold' : ''}${highFalseAccept && repeatedRootCause ? ' and ' : ''}${repeatedRootCause ? 'repeated same-root repair loop' : ''}` };
  }
  return { tier, level: 'STRONG', differentProvider: false, reason: `${tier} requires a strong reviewer` };
}

/** Route and record the routing decision for observability. */
export function routeAndRecord(
  tier: RiskTier,
  calibration: CalibrationGroupSummary | null,
  store?: CalibrationStore,
): RoutingDecision {
  const decision = routeReviewStrength(tier, calibration);
  if (store) {
    store.record({
      kind: 'ROUTING_DECISION',
      tier,
      level: decision.level,
      differentProvider: decision.differentProvider,
      reason: decision.reason,
      model: calibration?.model ?? 'unknown',
      provider: calibration?.provider ?? 'unknown',
    });
  }
  return decision;
}
