import type { CompiledContext } from './context.js';

export type ContextFeedbackKind = 'symbol' | 'path' | 'decision' | 'failure';
export interface ContextFeedbackRequest { kind: ContextFeedbackKind; query: string; reason: string }

/** Typed feedback sensor metadata (AM-0001 / REQ-019). */
export interface ContextFeedbackSensor {
  direction: 'feedback';
  oracle: 'inferential' | 'computational';
  lifecycle: 'repair';
  applicability: string;
  cost: 'cheap';
  independence: string;
  freshness_ms: number;
  confidence: number;
  escalation: { on_fail: string; retry_budget: number };
}

export interface ContextFeedbackObservation {
  request: ContextFeedbackRequest;
  sensor: ContextFeedbackSensor;
}

const PATH_RE = /(?:^|[\s'"`(])((?:[A-Za-z0-9_.-]+\/)+(?:[A-Za-z0-9_.-]+))(?:[:#](\d+))?/g;
const SYMBOL_RE = /\b(?:class|function|method|symbol|type|interface|service|component)\s+[`'\"]?([A-Za-z_$][\w$.:#-]{2,})/gi;

function sensorFor(kind: ContextFeedbackKind): ContextFeedbackSensor {
  return {
    direction: 'feedback',
    oracle: kind === 'decision' ? 'inferential' : 'computational',
    lifecycle: 'repair',
    applicability: `bounded context feedback after a failed attempt (kind=${kind})`,
    cost: 'cheap',
    independence: `oracle-group:context-feedback-${kind}`,
    freshness_ms: 0,
    confidence: kind === 'decision' ? 0.6 : 0.9,
    escalation: { on_fail: 'escalate to NEEDS_USER with the bounded failure summary', retry_budget: 2 },
  };
}

/** Derive bounded follow-up retrieval from a failed attempt without replaying reads. */
export function deriveContextFeedback(input: {
  failure: string;
  prior: CompiledContext;
  maxRequests?: number;
}): ContextFeedbackRequest[] {
  const text = input.failure.trim();
  if (!text) return [];
  const seen = new Set(input.prior.items.map((item) => item.source.toLowerCase()));
  const out: ContextFeedbackRequest[] = [];
  const push = (request: ContextFeedbackRequest): void => {
    const key = request.query.toLowerCase();
    if (!key || seen.has(key) || out.some((item) => item.kind === request.kind && item.query.toLowerCase() === key)) return;
    out.push(request);
  };
  for (const match of text.matchAll(PATH_RE)) {
    push({ kind: 'path', query: match[1]!, reason: 'failure referenced a concrete path not present in prior context' });
  }
  for (const match of text.matchAll(SYMBOL_RE)) {
    push({ kind: 'symbol', query: match[1]!, reason: 'failure referenced a concrete symbol not present in prior context' });
  }
  if (/decision|adr|architecture|contract|schema/i.test(text)) {
    push({ kind: 'decision', query: text.slice(0, 240), reason: 'failure suggests an architecture/contract decision is missing' });
  }
  if (out.length === 0) push({ kind: 'failure', query: text.slice(0, 240), reason: 'no structured target was extractable; retain only the bounded failure summary' });
  return out.slice(0, input.maxRequests ?? 6);
}

/** Same bounded derivation, but each request carries its typed sensor record. */
export function deriveContextFeedbackSensors(input: {
  failure: string;
  prior: CompiledContext;
  maxRequests?: number;
}): ContextFeedbackObservation[] {
  return deriveContextFeedback(input).map((request) => ({ request, sensor: sensorFor(request.kind) }));
}
