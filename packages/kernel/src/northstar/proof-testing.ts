/**
 * northstar/proof-testing.ts — adaptive minimal-proof-testing (global behavior).
 *
 * Owner contract: adaptive-minimal-proof-testing is a permanent always-on
 * canonical harness behavior. It selects the SMALLEST proof set that can
 * actually prove a task's claims (minimal sufficient proof), derives
 * activation from scope/claim/risk (never keywords alone), supports all
 * evidence categories, enforces live proof for live claims, classifies every
 * result with the six-status semantics, and records selected AND omitted proof.
 *
 * This module is the canonical implementation consumed by the North-Star
 * runtime, the verification router, the CLI, host adapters and platform
 * projections. Engine facades re-export it unchanged.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. Status semantics (owner §11) — exactly one of six.
// ────────────────────────────────────────────────────────────────────────────

export type ProofStatus = 'PASS' | 'PARTIAL' | 'BLOCKED' | 'UNSUPPORTED' | 'PRE-EXISTING' | 'NEEDS_USER';

export const PROOF_STATUSES: readonly ProofStatus[] = [
  'PASS',
  'PARTIAL',
  'BLOCKED',
  'UNSUPPORTED',
  'PRE-EXISTING',
  'NEEDS_USER',
] as const;

export function assertProofStatus(value: unknown): asserts value is ProofStatus {
  if (typeof value !== 'string' || !(PROOF_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`proof status must be one of ${PROOF_STATUSES.join('|')}; got ${JSON.stringify(value)}`);
  }
}

export interface ProofStatusRule {
  status: ProofStatus;
  condition: string;
  allowed_transition_to: ProofStatus[];
}

/**
 * Canonical status semantics (owner §11): PASS requires sufficient fresh
 * evidence; BLOCKED/UNSUPPORTED can never be converted to PASS; PARTIAL keeps
 * open claims; PRE-EXISTING requires reproduction outside changed scope;
 * NEEDS_USER requires owner action.
 */
export const PROOF_STATUS_RULES: readonly ProofStatusRule[] = [
  { status: 'PASS', condition: 'sufficient fresh evidence for every required claim', allowed_transition_to: ['PARTIAL', 'NEEDS_USER'] },
  { status: 'PARTIAL', condition: 'some claims pass, others remain open', allowed_transition_to: ['PASS', 'BLOCKED', 'NEEDS_USER', 'PRE-EXISTING'] },
  { status: 'BLOCKED', condition: 'required authority or environment is missing', allowed_transition_to: ['PARTIAL', 'NEEDS_USER', 'UNSUPPORTED'] },
  { status: 'UNSUPPORTED', condition: 'host/product cannot provide the behavior', allowed_transition_to: ['NEEDS_USER', 'BLOCKED'] },
  { status: 'PRE-EXISTING', condition: 'reproduced outside the changed scope', allowed_transition_to: ['PASS', 'NEEDS_USER'] },
  { status: 'NEEDS_USER', condition: 'requires owner action or decision', allowed_transition_to: ['PASS', 'PARTIAL', 'BLOCKED', 'PRE-EXISTING', 'UNSUPPORTED'] },
];

export function canTransitionStatus(from: ProofStatus, to: ProofStatus): boolean {
  if (from === to) return true;
  const rule = PROOF_STATUS_RULES.find((r) => r.status === from);
  return rule ? rule.allowed_transition_to.includes(to) : false;
}

export function assertStatusTransition(from: ProofStatus, to: ProofStatus, context: string): void {
  if (!canTransitionStatus(from, to)) {
    throw new Error(`illegal proof status transition ${from} -> ${to} (${context}); BLOCKED/UNSUPPORTED can never become PASS`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Evidence categories (owner §5, A–K).
// ────────────────────────────────────────────────────────────────────────────

export type EvidenceCategory =
  | 'static'          // A: syntax, formatting, lint, typecheck, boundaries, dependency graph, generated consistency, build validation
  | 'unit'            // B: pure functions, parsers, selectors, reducers, state machines, error classification, lifecycle transitions
  | 'contract'        // C: JSON/YAML/TOML schemas, API/route/provider/artifact/migration contracts, compatibility fixtures
  | 'integration'     // D: module interaction, fs, db, queue, cache, process, provider bridge, broker/lease, host adapter
  | 'api'             // E: request/response, auth, authorization, validation, idempotency, concurrency, error handling, consistency
  | 'browser'         // F: browser smoke, interaction, a11y, responsive, visual/parity, console, network, data-state, real auth
  | 'live'            // G: real process, MCP handshake, browser, desktop window, virtual desktop, focus/placement, host session, network/provider, reconnect
  | 'security'        // H: wrong-session attachment, permission boundary, secret leakage, direct bypass, stale identity, PID/window reuse
  | 'performance'     // I: load, concurrency, timeout, retry, memory/resource, long-running session, reconnect, crash recovery
  | 'data'            // J: schema drift, migration ordering, rollback, seed/data integrity, backward compat, destructive safety
  | 'packaging'       // K: build, package contents, installation, runtime projection, mirror parity, executable resolution, version pinning, rollback
  | 'other';

export const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = [
  'static', 'unit', 'contract', 'integration', 'api', 'browser', 'live',
  'security', 'performance', 'data', 'packaging', 'other',
] as const;

/** Live claims (owner §8) — the categories that always require real live proof. */
export const LIVE_CLAIM_SURFACES: readonly string[] = [
  'browser', 'desktop', 'mcp', 'handshake', 'process-attribution', 'window-attribution',
  'virtual-desktop', 'focus', 'headed', 'session-persistence', 'reconnect',
  'resource-recreation', 'network', 'provider', 'host-integration', 'auth', 'data-state',
] as const;

export function isLiveClaim(surface: string): boolean {
  return (LIVE_CLAIM_SURFACES as readonly string[]).includes(surface);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Trigger model (owner §3) — scope/claim/risk based, never keyword-only.
// ────────────────────────────────────────────────────────────────────────────

export type ProofSurface =
  | 'feature' | 'bugfix' | 'refactor' | 'source' | 'dependency' | 'schema'
  | 'migration' | 'api' | 'backend' | 'frontend' | 'browser' | 'accessibility'
  | 'mcp' | 'desktop' | 'process' | 'session' | 'workspace' | 'security'
  | 'performance' | 'concurrency' | 'build' | 'package' | 'install' | 'release'
  | 'qa' | 'verification' | 'parity' | 'regression' | 'test' | 'claim-evidence'
  | 'other';

export const CHANGE_SURFACES: readonly ProofSurface[] = [
  'feature', 'bugfix', 'refactor', 'source', 'dependency', 'schema', 'migration',
  'api', 'backend', 'frontend', 'browser', 'accessibility', 'mcp', 'desktop',
  'process', 'session', 'workspace', 'security', 'performance', 'concurrency',
  'build', 'package', 'install', 'release', 'qa', 'verification', 'parity',
  'regression', 'test', 'claim-evidence', 'other',
] as const;

export interface ProofTriggerInput {
  /** Changed files (relative paths) — the primary scope signal. */
  changed_files: string[];
  /** Affected claims (ids or statements). */
  affected_claims?: string[];
  /** Affected dependencies (package names / providers / modules). */
  affected_dependencies?: string[];
  /** Risk class hint from the work request (S0..S3). */
  risk_hint?: 'S0' | 'S1' | 'S2' | 'S3';
  /** Runtime surfaces touched (browser/desktop/mcp/...). */
  runtime_surfaces?: string[];
  /** Project test architecture signals (has tests, has browser tests, ...). */
  project_test_architecture?: string[];
  /** Host capabilities (x11, browser-bin, mcp-provider, ...). */
  host_capabilities?: string[];
  /** Explicit user wording (optional; never the sole trigger). */
  user_wording?: string;
  /** Required evidence fidelity (e.g. 'live' when a claim demands it). */
  required_fidelity?: 'static' | 'deterministic' | 'live';
}

export interface ProofTriggerResult {
  activated: boolean;
  surfaces: ProofSurface[];
  /** Why activation happened — must cite scope/claim/risk evidence, not keywords. */
  reasons: string[];
  /** All categories that could be relevant (selection narrows later). */
  candidate_categories: EvidenceCategory[];
  /** The evidence fidelity the claims require. */
  required_fidelity: 'static' | 'deterministic' | 'live';
}

const KEYWORD_HINTS: ReadonlyArray<{ surface: ProofSurface; words: string[] }> = [
  { surface: 'browser', words: ['browser', 'ui', 'frontend', 'page', 'click', 'render', 'dom', 'css'] },
  { surface: 'accessibility', words: ['a11y', 'accessibility', 'contrast', 'screen reader', 'focus-visible', 'keyboard nav'] },
  { surface: 'mcp', words: ['mcp', 'provider', 'tool call', 'handshake', 'lease', 'broker'] },
  { surface: 'desktop', words: ['desktop', 'window', 'workspace', 'virtual desktop', 'focus', 'x11', 'wmctrl'] },
  { surface: 'security', words: ['security', 'permission', 'auth', 'authorization', 'secret', 'bypass', 'isolation', 'acl'] },
  { surface: 'migration', words: ['migration', 'schema change', 'migrate', 'rollback'] },
  { surface: 'dependency', words: ['dependency', 'package.json', 'lockfile', 'npm install', 'upgrade', 'pin'] },
  { surface: 'api', words: ['api', 'endpoint', 'route', 'http', 'request', 'response', 'rest', 'graphql'] },
  { surface: 'performance', words: ['performance', 'concurrency', 'load', 'latency', 'timeout', 'throughput'] },
  { surface: 'test', words: ['test', 'spec', 'assert', 'verify', 'proof', 'coverage'] },
];

function surfaceFromPath(path: string): ProofSurface | null {
  const p = path.toLowerCase();
  if (/\.(test|spec)\./.test(p)) return 'test';
  if (p.includes('test/') || p.includes('tests/') || p.includes('__tests__')) return 'test';
  if (/\.(schema\.json|schema\.yaml|schema\.ts)$/.test(p) || p.includes('/schemas/')) return 'schema';
  if (p.includes('migration') || /\/migrations?\//.test(p)) return 'migration';
  if (p.includes('/api/') || p.includes('/routes/') || p.includes('/endpoints/') || p.includes('/controllers/') || p.includes('/handlers/')) return 'api';
  if (p.includes('/mcp/') || p.includes('/providers/') || p.includes('/broker/')) return 'mcp';
  if (p.includes('/desktop/') || p.includes('/guardian/') || p.includes('/x11/') || p.includes('/window')) return 'desktop';
  if (p.includes('/security/') || p.includes('/auth/') || p.includes('/permissions/') || p.includes('/acl')) return 'security';
  if (p.includes('/performance/') || p.includes('/benchmark') || p.includes('/load/')) return 'performance';
  if (/\.(tsx|jsx|vue|svelte|css|scss|html)$/.test(p) || p.includes('/ui/') || p.includes('/components/') || p.includes('/pages/')) return 'frontend';
  if (/\.(md|mdx)$/.test(p)) return 'other';
  if (/\.(ts|js|mjs|cjs)$/.test(p)) return 'source';
  if (p.includes('package.json') || p.includes('package-lock') || p.includes('pnpm-lock') || p.includes('yarn.lock')) return 'dependency';
  if (p.includes('docker') || p.includes('compose') || p.includes('Dockerfile')) return 'build';
  return 'other';
}

const SURFACE_TO_CATEGORIES: Readonly<Record<ProofSurface, EvidenceCategory[]>> = {
  feature: ['unit', 'contract', 'integration'],
  bugfix: ['unit', 'integration'],
  refactor: ['static', 'unit', 'integration'],
  source: ['static', 'unit'],
  dependency: ['static', 'packaging', 'contract'],
  schema: ['contract', 'data'],
  migration: ['contract', 'data'],
  api: ['contract', 'api', 'security'],
  backend: ['unit', 'integration', 'api'],
  frontend: ['static', 'browser'],
  browser: ['browser', 'live'],
  accessibility: ['browser'],
  mcp: ['contract', 'integration', 'live', 'security'],
  desktop: ['live', 'security'],
  process: ['integration', 'live', 'security'],
  session: ['integration', 'live'],
  workspace: ['live'],
  security: ['security', 'unit'],
  performance: ['performance', 'unit'],
  concurrency: ['performance', 'unit'],
  build: ['static', 'packaging'],
  package: ['packaging'],
  install: ['packaging', 'live'],
  release: ['packaging', 'static', 'browser'],
  qa: ['browser', 'live', 'api'],
  verification: ['static', 'unit', 'contract'],
  parity: ['contract', 'static'],
  regression: ['unit', 'integration'],
  test: ['unit'],
  'claim-evidence': ['contract', 'live'],
  other: ['static'],
};

/** The global always-on trigger: derive surfaces from scope/claims/risk. */
export function deriveProofTrigger(input: ProofTriggerInput): ProofTriggerResult {
  const surfaces = new Set<ProofSurface>();
  const reasons: string[] = [];

  // 1. Scope: changed files map to surfaces (deterministic, never keyword-only).
  for (const file of input.changed_files) {
    const surface = surfaceFromPath(file);
    if (surface !== null && (surface !== 'other' || input.changed_files.length === 1)) surfaces.add(surface);
  }
  if (input.changed_files.length > 0) reasons.push(`changed scope: ${input.changed_files.length} file(s) (${input.changed_files.slice(0, 3).join(', ')})`);

  // 2. Claims: explicit affected claims always activate.
  if (input.affected_claims && input.affected_claims.length > 0) {
    surfaces.add('claim-evidence');
    reasons.push(`affected claims: ${input.affected_claims.length}`);
  }

  // 3. Dependencies: affected dependencies activate packaging/contract proof.
  if (input.affected_dependencies && input.affected_dependencies.length > 0) {
    surfaces.add('dependency');
    reasons.push(`affected dependencies: ${input.affected_dependencies.slice(0, 3).join(', ')}`);
  }

  // 4. Runtime surfaces: explicit runtime surface claims (live fidelity).
  // Live surfaces map onto the change-surfaces that carry live categories
  // (browser/mcp/desktop), never onto the 'live' category directly.
  if (input.runtime_surfaces && input.runtime_surfaces.length > 0) {
    for (const s of input.runtime_surfaces) {
      if (s === 'browser' || s === 'ui' || s === 'data-state' || s === 'auth') surfaces.add('browser');
      if (s === 'mcp' || s === 'handshake' || s === 'provider' || s === 'tool' || s === 'tools') surfaces.add('mcp');
      if (s === 'desktop' || s === 'window' || s === 'focus' || s === 'virtual-desktop' || s === 'headed' || s === 'process-attribution' || s === 'window-attribution') surfaces.add('desktop');
      if (s === 'session-persistence' || s === 'reconnect' || s === 'resource-recreation' || s === 'host-integration') surfaces.add('session');
      if (s === 'auth' || s === 'permission' || s === 'security') surfaces.add('security');
      if (s === 'network' || s === 'host-integration') surfaces.add('integration' as unknown as ProofSurface);
      // Pass through any runtime surface that is itself a canonical change
      // surface (release/qa/verification/parity/regression/...), so
      // scope-driven activation is complete and never keyword-only.
      if ((CHANGE_SURFACES as readonly string[]).includes(s)) surfaces.add(s as ProofSurface);
    }
    reasons.push(`runtime surfaces: ${input.runtime_surfaces.join(', ')}`);
  }

  // 5. Risk: S2/S3 escalate the candidate set.
  if (input.risk_hint === 'S2' || input.risk_hint === 'S3') {
    surfaces.add('security');
    reasons.push(`risk class ${input.risk_hint} requires security/isolation proof`);
  }

  // 6. Project test architecture + host capability inform candidate categories.
  const arch = input.project_test_architecture ?? [];
  const host = input.host_capabilities ?? [];
  if (arch.some((a) => /browser|playwright|live/i.test(a))) surfaces.add('browser');
  if (arch.some((a) => /mcp|provider/i.test(a))) surfaces.add('mcp');
  if (host.some((h) => /x11|display/i.test(h))) surfaces.add('desktop');
  if (arch.some((a) => /no-tests|none/i.test(a))) reasons.push('project has no tests — proof must be external/probed');
  if (host.length > 0) reasons.push(`host capabilities: ${host.slice(0, 3).join(', ')}`);

  // 7. User wording is a HINT only — it can add candidate categories but can
  //    never be the sole basis for activation (scope/claims/risk must fire).
  const wording = (input.user_wording ?? '').toLowerCase();
  for (const hint of KEYWORD_HINTS) {
    if (hint.words.some((w) => wording.includes(w))) surfaces.add(hint.surface);
  }
  if (wording && input.changed_files.length === 0 && !input.affected_claims?.length) {
    // Wording-only with no scope: still activates (testing/QA requests are
    // legitimate), but the reason must say so honestly.
    reasons.push('user requested testing/verification (wording hint; no changed scope provided)');
    surfaces.add('verification');
  }

  const surfacesList: ProofSurface[] = surfaces.size > 0 ? [...surfaces] : ['other'];
  const categories = new Set<EvidenceCategory>();
  for (const s of surfacesList) for (const c of SURFACE_TO_CATEGORIES[s]) categories.add(c);

  // required fidelity: any live surface claim => live; else deterministic; a
  // pure static change (docs/formatting) can stay static.
  const hasLive = surfacesList.some((s) => ['browser', 'frontend', 'accessibility', 'mcp', 'desktop', 'live', 'install', 'qa'].includes(s));
  const requiredFidelity: 'static' | 'deterministic' | 'live' = hasLive
    ? 'live'
    : input.required_fidelity ?? 'deterministic';

  return {
    activated: true, // always-on: every task gets at least a minimal proof plan
    surfaces: surfacesList,
    reasons,
    candidate_categories: [...categories],
    required_fidelity: requiredFidelity,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Proof profiles (owner §7) — reusable default profiles with escalation.
// ────────────────────────────────────────────────────────────────────────────

export interface ProofProfileStep {
  category: EvidenceCategory;
  description: string;
  /** When false, this step only runs when a claim explicitly requires it. */
  conditional?: boolean;
}

export interface ProofProfile {
  id: string;
  name: string;
  applies_to: ProofSurface[];
  steps: ProofProfileStep[];
  escalation_to: string[];
  /** Honest downgrade guard: profiles may escalate, never silently downgrade. */
  min_fidelity: 'static' | 'deterministic' | 'live';
}

export const PROOF_PROFILES: readonly ProofProfile[] = [
  {
    id: 'trivial-static',
    name: 'Trivial / static change',
    applies_to: ['source', 'other'],
    steps: [
      { category: 'static', description: 'syntax/typecheck/format' },
      { category: 'unit', description: 'focused unit or contract test for the touched behavior', conditional: true },
      { category: 'packaging', description: 'affected package build', conditional: true },
    ],
    escalation_to: ['business-logic', 'api-service'],
    min_fidelity: 'static',
  },
  {
    id: 'business-logic',
    name: 'Business logic',
    applies_to: ['feature', 'bugfix', 'refactor', 'backend'],
    steps: [
      { category: 'static', description: 'typecheck/build' },
      { category: 'unit', description: 'focused unit tests for changed behavior' },
      { category: 'contract', description: 'contract/schema for affected interfaces' },
      { category: 'integration', description: 'affected integration path' },
      { category: 'unit', description: 'regression proof for previously fixed defects', conditional: true },
    ],
    escalation_to: ['api-service', 'mcp-session'],
    min_fidelity: 'deterministic',
  },
  {
    id: 'api-service',
    name: 'API / service',
    applies_to: ['api', 'backend'],
    steps: [
      { category: 'static', description: 'typecheck/build' },
      { category: 'contract', description: 'API contract validation' },
      { category: 'api', description: 'focused API/integration tests (request/response, error path)' },
      { category: 'security', description: 'authorization positive + negative path' },
      { category: 'data', description: 'migration/data proof when relevant', conditional: true },
    ],
    escalation_to: ['business-logic', 'mcp-session'],
    min_fidelity: 'deterministic',
  },
  {
    id: 'ui-browser',
    name: 'UI / browser',
    applies_to: ['frontend', 'browser', 'accessibility', 'release'],
    steps: [
      { category: 'static', description: 'build/typecheck' },
      { category: 'browser', description: 'focused live interaction (smallest real browser)' },
      { category: 'browser', description: 'accessibility proof when affected', conditional: true },
      { category: 'browser', description: 'console/network proof', conditional: true },
      { category: 'browser', description: 'visual/parity proof only when the claim requires it', conditional: true },
    ],
    escalation_to: ['business-logic', 'mcp-session'],
    min_fidelity: 'live',
  },
  {
    id: 'mcp-session',
    name: 'MCP / desktop / process / session',
    applies_to: ['mcp', 'desktop', 'process', 'session', 'workspace'],
    steps: [
      { category: 'contract', description: 'deterministic lifecycle/state proof' },
      { category: 'live', description: 'real MCP handshake' },
      { category: 'security', description: 'real identity/isolation proof' },
      { category: 'integration', description: 'reconnect/crash proof' },
      { category: 'live', description: 'GUI relocation/focus proof when GUI affected', conditional: true },
      { category: 'integration', description: 'explicit stop/manual-close proof', conditional: true },
      { category: 'security', description: 'no-bypass/security proof', conditional: true },
    ],
    escalation_to: ['business-logic', 'security'],
    min_fidelity: 'live',
  },
  {
    id: 'security',
    name: 'Security / permissions',
    applies_to: ['security'],
    steps: [
      { category: 'unit', description: 'positive authorization test' },
      { category: 'security', description: 'negative unauthorized path' },
      { category: 'security', description: 'boundary/isolation proof' },
      { category: 'static', description: 'secret/config scan' },
      { category: 'unit', description: 'regression proof' },
    ],
    escalation_to: ['api-service', 'mcp-session'],
    min_fidelity: 'deterministic',
  },
  {
    id: 'migration-data',
    name: 'Migration / data',
    applies_to: ['migration', 'schema'],
    steps: [
      { category: 'contract', description: 'schema validation' },
      { category: 'data', description: 'migration apply' },
      { category: 'data', description: 'drift check' },
      { category: 'data', description: 'rollback or safety proof' },
      { category: 'data', description: 'data invariant' },
    ],
    escalation_to: ['business-logic', 'api-service'],
    min_fidelity: 'deterministic',
  },
  {
    id: 'performance-reliability',
    name: 'Performance / reliability',
    applies_to: ['performance', 'concurrency'],
    steps: [
      { category: 'unit', description: 'deterministic behavior first' },
      { category: 'performance', description: 'focused load/concurrency proof', conditional: true },
      { category: 'performance', description: 'resource/timeout proof', conditional: true },
    ],
    escalation_to: ['business-logic', 'api-service'],
    min_fidelity: 'deterministic',
  },
];

export function profileForSurfaces(surfaces: ProofSurface[], claims: Array<{ claim: string; live_surface?: boolean }> = []): ProofProfile {
  // Claim-driven escalation first: a live claim always lands on a live
  // profile; business/API/security/migration/performance wording in a claim
  // escalates beyond the trivial profile even when the changed file is a
  // generic source file. This is claim-based, never keyword-only trigger —
  // the claim itself is compiled scope/risk evidence.
  const joined = claims.map((c) => c.claim.toLowerCase()).join(' ');
  if (claims.some((c) => c.live_surface === true) || /\b(mcp|handshake|desktop|window|virtual desktop|focus|reconnect|browser|headed|session persistence)\b/.test(joined)) {
    const liveSurface = surfaces.find((s) => ['mcp', 'desktop', 'process', 'session', 'workspace', 'browser', 'frontend'].includes(s));
    const liveProfile = PROOF_PROFILES.find((p) => p.min_fidelity === 'live' && (liveSurface ? p.applies_to.includes(liveSurface) : true));
    if (liveProfile) return liveProfile;
  }
  if (/\b(migration|schema change|rollback|schema drift)\b/.test(joined)) return PROOF_PROFILES.find((p) => p.id === 'migration-data')!;
  if (/\b(security|permission|authorization|isolation|secret|bypass)\b/.test(joined)) return PROOF_PROFILES.find((p) => p.id === 'security')!;
  if (/\b(api|endpoint|request|response|auth)\b/.test(joined)) return PROOF_PROFILES.find((p) => p.id === 'api-service')!;
  if (/\b(performance|concurrency|load|latency|timeout)\b/.test(joined)) return PROOF_PROFILES.find((p) => p.id === 'performance-reliability')!;
  if (/\b(business|feature|logic|behavior|totals|regression|calculat|compute|correct|returns|handles|applies|updates|validates|coverage|deterministic|math|pure)\b/.test(joined) && surfaces.some((s) => ['source', 'feature', 'bugfix', 'refactor', 'backend', 'test'].includes(s))) {
    return PROOF_PROFILES.find((p) => p.id === 'business-logic')!;
  }
  // First matching profile by surface priority; 'other' falls back to trivial.
  const order: ProofSurface[] = ['mcp', 'desktop', 'process', 'session', 'workspace', 'security', 'migration', 'schema', 'api', 'backend', 'browser', 'frontend', 'accessibility', 'performance', 'concurrency', 'feature', 'bugfix', 'refactor', 'test', 'source', 'other'];
  for (const surface of order) {
    if (!surfaces.includes(surface)) continue;
    const profile = PROOF_PROFILES.find((p) => p.applies_to.includes(surface));
    if (profile) return profile;
  }
  return PROOF_PROFILES[0];
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Selection engine (owner §4/§6) — minimal sufficient proof.
// ────────────────────────────────────────────────────────────────────────────

export interface ClaimToProof {
  claim_id: string;
  claim: string;
  required_categories: EvidenceCategory[];
  required_fidelity: 'static' | 'deterministic' | 'live';
  /** True when the claim concerns a live surface (browser/desktop/mcp/...). */
  live_surface: boolean;
}

export interface OmittedProof {
  category: EvidenceCategory;
  reason: string;
  why_safe: string;
  escalation_condition: string;
}

export interface SelectedProof {
  claim_id: string;
  proof_id: string;
  category: EvidenceCategory;
  /** Why this proof is sufficient for the claim. */
  sufficiency: string;
  environment: string;
  result?: ProofStatus;
  evidence_path?: string;
  limitations?: string;
  escalation_path: string;
}

export interface ProofPlan {
  task_id: string;
  repository: string;
  changed_scope: string[];
  claims: ClaimToProof[];
  risks: string[];
  profile: string;
  selected: SelectedProof[];
  omitted: OmittedProof[];
  required_fidelity: 'static' | 'deterministic' | 'live';
  /** Full-suite run required only when scope/dependency/architecture/release risk justifies it. */
  full_suite_required: boolean;
  full_suite_reason?: string;
  created_at: string;
}

export interface ProofSelectionInput {
  task_id: string;
  repository: string;
  changed_files: string[];
  claims: Array<{ id: string; claim: string; live_surface?: boolean; required_categories?: EvidenceCategory[] }>;
  risks: string[];
  host_capabilities?: string[];
  /** Project inventory: existing tests mapped to behaviors. */
  existing_proofs?: Array<{ id: string; category: EvidenceCategory; covers_claim?: string; live?: boolean }>;
  /** Prior failure history for regression escalation. */
  failure_history?: string[];
  trigger: ProofTriggerResult;
  /** True when changed scope spans architecture/deps/release => full suite. */
  force_full_suite?: boolean;
  full_suite_reason?: string;
}

/**
 * Minimal-sufficient selection: start with the profile for the triggered
 * surfaces, keep only steps that cover an actual claim, reuse existing proof
 * when it genuinely covers the claim (never a passing test that does not
 * exercise the change), escalate fidelity for live claims, and record every
 * omission with a reason.
 */
export function selectProofs(input: ProofSelectionInput): ProofPlan {
  const profile = profileForSurfaces(input.trigger.surfaces, input.claims);
  const selected: SelectedProof[] = [];
  const omitted: OmittedProof[] = [];

  for (const claim of input.claims) {
    const claimIsLive = claim.live_surface === true || isLiveClaim(claim.claim) || input.trigger.required_fidelity === 'live';
    const fidelity: 'static' | 'deterministic' | 'live' = claimIsLive ? 'live' : input.trigger.required_fidelity;
    let requiredCats = claim.required_categories ?? profile.steps.filter((s) => !s.conditional).map((s) => s.category);
    if (claimIsLive && !requiredCats.includes('live')) requiredCats = [...requiredCats, 'live'];

    for (const cat of requiredCats) {
      // Reuse an existing proof only when it covers THIS claim (never a
      // passing test unrelated to the change).
      const existing = input.existing_proofs?.find((p) => p.category === cat && (p.covers_claim === undefined || p.covers_claim === claim.id));
      // Reuse only when the existing proof is not a fake standing in for a
      // live claim (owner §8: unit/fake cannot replace live proof).
      if (existing && (!claimIsLive || existing.live)) {
        selected.push({
          claim_id: claim.id,
          proof_id: existing.id,
          category: cat,
          sufficiency: `existing ${cat} proof covers claim ${claim.id} directly`,
          environment: 'existing project test',
          escalation_path: 're-run focused; escalate to live if the claim demands it',
        });
        continue;
      }
      if (cat === 'live' || (fidelity === 'live' && claimIsLive)) {
        if (!input.host_capabilities?.some((h) => /x11|display|browser|mcp|live/i.test(h))) {
          omitted.push({
            category: cat,
            reason: `claim ${claim.id} requires live proof but no live host capability is available`,
            why_safe: 'live claim cannot be honestly PASSed from weaker evidence',
            escalation_condition: 'provide a live host (X11/display/browser/MCP provider) and re-run',
          });
          continue;
        }
        selected.push({
          claim_id: claim.id,
          proof_id: `${cat}-live:${claim.id}`,
          category: cat,
          sufficiency: `real ${cat} proof required for live claim ${claim.id}`,
          environment: 'live host (smallest real provider, pinned versions)',
          escalation_path: 'escalate to the smallest real provider that proves the claim',
        });
        continue;
      }
      selected.push({
        claim_id: claim.id,
        proof_id: `${cat}:${claim.id}`,
        category: cat,
        sufficiency: `focused ${cat} proof for claim ${claim.id} "${claim.claim}" (deterministic first)`,
        environment: 'deterministic project test',
        escalation_path: 'escalate fidelity when the claim requires it',
      });
    }
  }

  // Omit profile steps that no claim requires — record why.
  const usedCats = new Set(selected.map((s) => s.category));
  for (const step of profile.steps) {
    if (step.conditional && !usedCats.has(step.category)) {
      omitted.push({
        category: step.category,
        reason: `profile step ${step.category} is conditional and no claim requires it`,
        why_safe: 'no affected claim depends on this evidence category',
        escalation_condition: 'add a claim that touches this category or escalate risk class',
      });
    }
  }

  // Regression: prior failure history escalates regression proof.
  if (input.failure_history && input.failure_history.length > 0) {
    selected.push({
      claim_id: input.claims[0]?.id ?? 'regression',
      proof_id: 'regression-history',
      category: 'unit',
      sufficiency: `prior failure history (${input.failure_history.length}) requires regression proof`,
      environment: 'project regression suite (focused)',
      escalation_path: 'run the full regression suite when scope justifies it',
    });
  }

  // Full suite only when justified.
  const fullSuite = input.force_full_suite === true
    || input.trigger.surfaces.includes('release')
    || (input.changed_files.length > 20 && input.trigger.surfaces.some((s) => ['api', 'backend', 'frontend', 'mcp'].includes(s)))
    || (input.risks ?? []).some((r) => /architect|migration|release|security|data-loss/i.test(r));

  return {
    task_id: input.task_id,
    repository: input.repository,
    changed_scope: input.changed_files,
    claims: input.claims.map((c) => ({
      claim_id: c.id,
      claim: c.claim,
      required_categories: c.required_categories ?? [],
      required_fidelity: c.live_surface ? 'live' : input.trigger.required_fidelity,
      live_surface: c.live_surface ?? false,
    })),
    risks: input.risks,
    profile: profile.id,
    selected,
    omitted,
    required_fidelity: profile.min_fidelity === 'live' ? 'live' : input.trigger.required_fidelity,
    full_suite_required: fullSuite,
    ...(fullSuite ? { full_suite_reason: input.full_suite_reason ?? 'scope/dependency/architecture/release risk justifies a full-suite run' } : {}),
    created_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Proof receipt (owner §12) — the router's durable output.
// ────────────────────────────────────────────────────────────────────────────

export interface ProofReceipt {
  schema: 'agent-rules/proof-receipt/v1';
  version: 1;
  task_id: string;
  repository: string;
  changed_scope: string[];
  claims: Array<{ claim_id: string; claim: string }>;
  risks: string[];
  selected_profile: string;
  selected: SelectedProof[];
  omitted: OmittedProof[];
  escalation_decisions: string[];
  environment: string;
  results: Array<{ proof_id: string; status: ProofStatus }>;
  evidence_refs: string[];
  final_status: ProofStatus;
  generated_at: string;
}

export interface ProofReceiptInput {
  plan: ProofPlan;
  results: Array<{ proof_id: string; status: ProofStatus }>;
  escalation_decisions?: string[];
  environment?: string;
  evidence_refs?: string[];
}

export function finalStatusFromResults(results: Array<{ proof_id: string; status: ProofStatus }>, claimCount = 1): ProofStatus {
  if (claimCount === 0) return 'NEEDS_USER'; // no claim to prove — never PASS on empty claims
  if (results.length === 0) return 'NEEDS_USER';
  if (results.some((r) => r.status === 'BLOCKED' || r.status === 'UNSUPPORTED')) return 'BLOCKED';
  if (results.some((r) => r.status === 'NEEDS_USER')) return 'NEEDS_USER';
  if (results.some((r) => r.status === 'PRE-EXISTING')) return 'PRE-EXISTING';
  if (results.every((r) => r.status === 'PASS')) return 'PASS';
  return 'PARTIAL';
}

export function buildProofReceipt(input: ProofReceiptInput): ProofReceipt {
  const finalStatus = finalStatusFromResults(input.results, input.plan.claims.length);
  return {
    schema: 'agent-rules/proof-receipt/v1',
    version: 1,
    task_id: input.plan.task_id,
    repository: input.plan.repository,
    changed_scope: input.plan.changed_scope,
    claims: input.plan.claims.map((c) => ({ claim_id: c.claim_id, claim: c.claim })),
    risks: input.plan.risks,
    selected_profile: input.plan.profile,
    selected: input.plan.selected,
    omitted: input.plan.omitted,
    escalation_decisions: input.escalation_decisions ?? [],
    environment: input.environment ?? 'deterministic',
    results: input.results,
    evidence_refs: input.evidence_refs ?? [],
    final_status: finalStatus,
    generated_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Test-refactor policy (owner §9) — coverage mapping + protected tests.
// ────────────────────────────────────────────────────────────────────────────

export type RefactorAction = 'keep' | 'merge' | 'rewrite' | 'remove' | 'move';

export interface TestInventoryEntry {
  test_id: string;
  file: string;
  category: EvidenceCategory;
  covers_claims: string[];
  protected?: boolean;
  /** When true the test is live and cannot be replaced by a fake without changing the claim. */
  live?: boolean;
  duplicate_of?: string;
  obsolete_reason?: string;
  over_broad_reason?: string;
  action: RefactorAction;
  action_reason: string;
}

export interface TestRefactorMatrix {
  schema: 'agent-rules/test-refactor-matrix/v1';
  version: 1;
  repository: string;
  audited_at: string;
  baseline: { files: number; tests: number };
  after: { files: number; tests: number };
  entries: TestInventoryEntry[];
  protected_count: number;
  coverage_preserved: boolean;
  coverage_evidence: string;
  post_refactor_proof_run: string;
  forbidden_violations: string[];
}

export const PROTECTED_TEST_REASONS: readonly string[] = [
  'security', 'authorization', 'data-integrity', 'migration', 'concurrency',
  'lifecycle', 'regression', 'user-visible-behavior',
] as const;

export function isProtectedTest(entry: Pick<TestInventoryEntry, 'category' | 'covers_claims'>): boolean {
  if (entry.category === 'security' || entry.category === 'data' || entry.category === 'live') return true;
  const joined = entry.covers_claims.join(' ').toLowerCase().replace(/-/g, ' ');
  return PROTECTED_TEST_REASONS.some((r) => joined.includes(r.replace(/-/g, ' ')));
}

export interface RefactorValidationResult {
  ok: boolean;
  violations: string[];
}

/** Forbidden operations (owner §9) — the router refuses these. */
export function validateRefactorMatrix(matrix: Omit<TestRefactorMatrix, 'forbidden_violations'>): RefactorValidationResult {
  const violations: string[] = [];
  for (const entry of matrix.entries) {
    if (entry.action === 'remove' && !entry.obsolete_reason) violations.push(`${entry.test_id}: remove without obsolete_reason`);
    if (entry.action === 'remove' && isProtectedTest(entry)) violations.push(`${entry.test_id}: protected test (${entry.category}) cannot be removed`);
    if (entry.action === 'rewrite' && entry.live && !entry.over_broad_reason) violations.push(`${entry.test_id}: live test rewrite requires an explicit reason (never live->fake without a claim change)`);
    if (entry.action === 'remove' && entry.duplicate_of) {
      const target = matrix.entries.find((e) => e.test_id === entry.duplicate_of);
      if (!target) violations.push(`${entry.test_id}: duplicate_of ${entry.duplicate_of} not in matrix`);
    }
  }
  if (matrix.after.tests > matrix.baseline.tests && matrix.entries.every((e) => e.action !== 'merge' && e.action !== 'rewrite')) {
    violations.push('after count grew without merge/rewrite entries — inconsistent matrix');
  }
  return { ok: violations.length === 0, violations };
}
