/**
 * token-attribution.ts — M11-R43: Token, cost and cache telemetry attributed by
 * actor/run/source (AM-0021 §11).
 *
 * Every token event is attributed to:
 *   - actor  : main | worker-<role> | verifier | auditor
 *   - run    : the execution run ID
 *   - source : cache | provider | artifact | manual
 *
 * Attribution records are immutable, content-addressed, and can be aggregated
 * without replay.
 */
import { createHash } from 'node:crypto';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActorRole = 'main' | 'orchestrator' | 'worker' | 'verifier' | 'auditor' | 'reviewer';

export type TokenSource =
  | 'cache'       // served from local/provider cache
  | 'provider'    // fresh from model provider
  | 'artifact'    // from plan/evidence artifact
  | 'manual';     // human-provided content

export interface TokenAttributionId {
  readonly runId: string;
  readonly actorId: string;
  readonly turnIndex: number;
}

export interface TokenEvent {
  readonly attributionId: TokenAttributionId;
  readonly actorRole: ActorRole;
  readonly planId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheHitTokens: number; // tokens served from cache
  readonly costUsd: number;
  readonly source: TokenSource;
  readonly turnStartedAt: string;
  readonly turnCompletedAt: string;
  readonly providerModel?: string;
}

export interface AttributionSummary {
  readonly runId: string;
  readonly planId: string;
  readonly byActor: Readonly<Record<ActorRole, ActorTokenTotals>>;
  readonly bySource: Readonly<Record<TokenSource, SourceTokenTotals>>;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheHitTokens: number;
  readonly totalCostUsd: number;
  readonly turnCount: number;
  readonly computedAt: string;
  readonly summarySha256: Sha256;
}

export interface ActorTokenTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheHitTokens: number;
  readonly costUsd: number;
  readonly turnCount: number;
}

export interface SourceTokenTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheHitTokens: number;
  readonly costUsd: number;
  readonly turnCount: number;
}

// ── Attribution builder ────────────────────────────────────────────────────────

export interface AttributionBuilder {
  runId: string;
  planId: string;
  events: TokenEvent[];
  turnIndex: number;
}

export function createAttributionBuilder(runId: string, planId: string): AttributionBuilder {
  return { runId, planId, events: [], turnIndex: 0 };
}

/** recordTokenEvent appends an immutable attribution record */
export function recordTokenEvent(
  builder: AttributionBuilder,
  event: Omit<TokenEvent, 'attributionId'>,
): TokenEvent {
  const full: TokenEvent = {
    ...event,
    attributionId: {
      runId: builder.runId,
      actorId: event.actorRole,
      turnIndex: builder.turnIndex,
    },
  };
  builder.events.push(Object.freeze({ ...full }));
  builder.turnIndex++;
  return full;
}

/** computeAttributionSummary aggregates events into a summary without replay.
 *  Runs in O(n) — single pass over events.
 *
 * ponytail: skip — multi-run aggregation, time-windowed summaries, cost budget
 * alerts. Add when AM-0021 cluster 6 (control plane) ships.
 */
export function computeAttributionSummary(builder: AttributionBuilder): AttributionSummary {
  const byActor: Record<ActorRole, ActorTokenTotals> = {
    main: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    orchestrator: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    worker: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    verifier: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    auditor: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    reviewer: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
  };

  const bySource: Record<TokenSource, SourceTokenTotals> = {
    cache: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    provider: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    artifact: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
    manual: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costUsd: 0, turnCount: 0 },
  };

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheHit = 0;
  let totalCost = 0;

  for (const e of builder.events) {
    totalInput += e.inputTokens;
    totalOutput += e.outputTokens;
    totalCacheHit += e.cacheHitTokens;
    totalCost += e.costUsd;

    const a = byActor[e.actorRole];
    byActor[e.actorRole] = {
      inputTokens: a.inputTokens + e.inputTokens,
      outputTokens: a.outputTokens + e.outputTokens,
      cacheHitTokens: a.cacheHitTokens + e.cacheHitTokens,
      costUsd: a.costUsd + e.costUsd,
      turnCount: a.turnCount + 1,
    };

    const s = bySource[e.source];
    bySource[e.source] = {
      inputTokens: s.inputTokens + e.inputTokens,
      outputTokens: s.outputTokens + e.outputTokens,
      cacheHitTokens: s.cacheHitTokens + e.cacheHitTokens,
      costUsd: s.costUsd + e.costUsd,
      turnCount: s.turnCount + 1,
    };
  }

  const payload = [builder.runId, builder.planId, totalInput, totalOutput, totalCacheHit, totalCost, builder.events.length];
  const summarySha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify(payload)));

  return Object.freeze({
    runId: builder.runId,
    planId: builder.planId,
    byActor: Object.freeze({ ...byActor }),
    bySource: Object.freeze({ ...bySource }),
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheHitTokens: totalCacheHit,
    totalCostUsd: totalCost,
    turnCount: builder.events.length,
    computedAt: new Date().toISOString(),
    summarySha256,
  });
}

/** computeEventSha256 — deterministic hash for an individual event */
export function computeEventSha256(event: TokenEvent): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    attributionId: event.attributionId,
    actorRole: event.actorRole,
    planId: event.planId,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheHitTokens: event.cacheHitTokens,
    costUsd: event.costUsd,
    source: event.source,
    turnStartedAt: event.turnStartedAt,
    turnCompletedAt: event.turnCompletedAt,
    providerModel: event.providerModel,
  })));
}

/** isAttributionComplete — checks if attribution covers all expected sources */
export function isAttributionComplete(
  summary: AttributionSummary,
  expectedActors: readonly ActorRole[] = ['main', 'worker'],
): { complete: boolean; missingActors: ActorRole[]; missingSources: TokenSource[] } {
  const missingActors: ActorRole[] = [];
  for (const role of expectedActors) {
    if (summary.byActor[role].turnCount === 0) missingActors.push(role);
  }

  const usedSources = (Object.entries(summary.bySource) as [TokenSource, SourceTokenTotals][])
    .filter(([, v]) => v.turnCount > 0)
    .map(([k]) => k);
  const allSources: TokenSource[] = ['cache', 'provider', 'artifact', 'manual'];
  const missingSources = allSources.filter(s => !usedSources.includes(s));

  return { complete: missingActors.length === 0, missingActors, missingSources };
}
