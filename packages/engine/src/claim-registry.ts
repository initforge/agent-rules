/**
 * claim-registry.ts — AM-0020 §2 claim semantics registry (M11-R27).
 *
 * Each effective requirement compiles into one or more ClaimDefinition records
 * carrying the full §2 field set. Evidence maturity is a closed 10-state enum
 * and PASS/ready/parity/CDP/production-like/clean are valid only when the
 * corresponding machine formula is satisfied — reviewers and reports cannot
 * redefine them through prose.
 *
 * The registry is DYNAMIC: the claim count is derived from the compiled
 * plan-readiness requirement set (15 REQ + M11-R11..R36 = 41 effective
 * requirements), never from a constant. M11-R27..R36 derive from the AM-0020
 * §14 additive registry exactly as M11-R11..26 derive from AM-0019 §14.
 */
import type { RequirementMapping, VerificationLayer } from './plan-readiness.js';

// ── Public enums ─────────────────────────────────────────────────────────────

export const EVIDENCE_MATURITIES = [
  'UNOBSERVED', 'PRESENT', 'VALID', 'FRESH', 'INDEPENDENTLY_REPRODUCED',
  'TERMINAL_ELIGIBLE', 'PARTIAL', 'CONTRADICTED', 'WAITING_CAPABILITY', 'SUPERSEDED',
] as const;
export type EvidenceMaturity = (typeof EVIDENCE_MATURITIES)[number];

export const CLAIM_FORMULAS = [
  'LOCAL_READY', 'STAGING_READY', 'PRODUCTION_READY', 'HV3_M11_LOCAL_COMPLETE',
] as const;
export type ClaimFormula = (typeof CLAIM_FORMULAS)[number];

export const RISK_TIERS = ['T0', 'T1', 'T2', 'T3', 'T-Visual', 'T-Global'] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

/** Maturity ladder order; higher index = stronger evidence. Blocking states (-1) never satisfy a formula threshold. */
export const MATURITY_RANK: Readonly<Record<EvidenceMaturity, number>> = {
  UNOBSERVED: 0,
  PRESENT: 1,
  VALID: 2,
  FRESH: 3,
  INDEPENDENTLY_REPRODUCED: 4,
  TERMINAL_ELIGIBLE: 5,
  PARTIAL: -1,
  CONTRADICTED: -1,
  WAITING_CAPABILITY: -1,
  SUPERSEDED: 6,
};

/** Per-formula minimum maturity rank for a required claim (SUPERSEDED is approved and always passes). */
export const FORMULA_THRESHOLDS: Readonly<Record<ClaimFormula, number>> = {
  LOCAL_READY: MATURITY_RANK.FRESH,
  STAGING_READY: MATURITY_RANK.INDEPENDENTLY_REPRODUCED,
  PRODUCTION_READY: MATURITY_RANK.INDEPENDENTLY_REPRODUCED,
  HV3_M11_LOCAL_COMPLETE: MATURITY_RANK.TERMINAL_ELIGIBLE,
};

// ── §2 ClaimDefinition fields ────────────────────────────────────────────────

export interface FreshnessDependency {
  /** Evidence that must be FRESH relative to a later, stronger artifact. */
  older_evidence: string;
  /** The artifact it must be fresher than. */
  fresher_than: string;
}

export interface ClaimDefinition {
  claim_id: string;
  requirement_id: string;
  plan_anchor: string;
  meaning: string;
  scope: string[];
  risk_tier: RiskTier;
  positive_invariants: string[];
  negative_invariants: string[];
  required_evidence: string[];
  required_capabilities: string[];
  freshness_dependencies: FreshnessDependency[];
  allowed_deviations: string[];
  terminal_weight: number;
}

export interface ClaimCompileInput {
  /** Effective requirement set from plan-readiness compileRequirements (dynamic count). */
  requirements: RequirementMapping[];
  /** Raw amendment markdown (AM-0019/AM-0020) used to enrich M11-R titles. */
  amendmentTexts?: string[];
}

// ── Risk-tier classification (AM-0020 §6) ────────────────────────────────────

/**
 * Explicit per-requirement tier table (AM-0020 §6): T0 mechanical, T1 standard,
 * T2 business/auth, T3 finance/concurrency/security/migration/release,
 * T-Visual UI parity/taste, T-Global architecture/terminal release. Fallback
 * keyword classification covers requirements added after this registry ships.
 */
const EXPLICIT_TIERS: Readonly<Record<string, RiskTier>> = {
  // M8 core requirements
  'REQ-001': 'T2', // identity/priority authority
  'REQ-002': 'T-Global', // target architecture
  'REQ-003': 'T2', // artifact authority + plan lifecycle
  'REQ-004': 'T2', // public contracts + interfaces
  'REQ-005': 'T1', // execution protocol + dogfooding
  'REQ-006': 'T3', // deployment batches / migration
  'REQ-007': 'T1', // test + Definition of Done
  'REQ-008': 'T1', // locked assumptions
  'REQ-009': 'T1',
  'REQ-010': 'T1',
  'REQ-011': 'T1',
  'REQ-012': 'T1',
  'REQ-013': 'T1',
  'REQ-014': 'T1',
  'REQ-015': 'T1',
  // AM-0019 §14
  'M11-R11': 'T1', // plan readiness + semantic coverage
  'M11-R12': 'T2', // authority + decisions
  'M11-R13': 'T0', // typed cross-stage dependency graph
  'M11-R14': 'T1', // max-useful native swarm scheduling
  'M11-R15': 'T2', // worktree isolation + rolling integration train
  'M11-R16': 'T3', // global resource/tool/browser broker (concurrency)
  'M11-R17': 'T3', // durable nonterminal autopilot (concurrency)
  'M11-R18': 'T0', // system topology compiler
  'M11-R19': 'T2', // verification-layer + full-stack gate
  'M11-R20': 'T-Visual', // paired reference/target browser contract
  'M11-R21': 'T-Visual', // non-vision visual verification (UI parity)
  'M11-R22': 'T3', // Tier-A host convergence (security/attestation)
  'M11-R23': 'T2', // host compliance boundaries (auth)
  'M11-R24': 'T-Global', // canonical lifecycle + terminal truth
  'M11-R25': 'T2', // subagent-first audit/review
  'M11-R26': 'T2', // controlled dogfood + adversarial closure
  // AM-0020 §14
  'M11-R27': 'T1', // claim semantics registry
  'M11-R28': 'T3', // evidence provenance + freshness DAG (release/migration integrity)
  'M11-R29': 'T2', // capability-qualified verdicts
  'M11-R30': 'T3', // adversarial counterexample compiler (security)
  'M11-R31': 'T2', // reviewer independence + diversity
  'M11-R32': 'T3', // immutable candidate verification (release/migration)
  'M11-R33': 'T2', // cross-artifact consistency validation
  'M11-R34': 'T3', // machine-generated terminal reporting (release)
  'M11-R35': 'T2', // seeded false-green/false-reject evaluation
  'M11-R36': 'T1', // claim calibration telemetry
};

const TIER_KEYWORDS: ReadonlyArray<[RiskTier, string[]]> = [
  ['T3', ['security', 'concurren', 'finance', 'migration', 'release', 'rollback', 'token', 'credential', 'attestation']],
  ['T-Visual', ['visual', 'parity', 'pixel', 'browser', 'taste', 'ui', 'viewport', 'screenshot']],
  ['T-Global', ['architect', 'terminal', 'global', 'reconcil', 'dogfood', 'certification']],
  ['T2', ['auth', 'business', 'integration', 'approval', 'owner', 'decision', 'authority', 'review', 'adversarial', 'capability', 'consistency']],
  ['T0', ['mechanical', 'generated', 'deterministic', 'scheduler', 'queue', 'broker', 'probe', 'hash', 'compiler']],
];

function tierOfRequirement(requirementId: string, text: string): RiskTier {
  const explicit = EXPLICIT_TIERS[requirementId];
  if (explicit) return explicit;
  const t = text.toLowerCase();
  for (const [tier, keywords] of TIER_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) return tier;
  }
  return 'T1';
}

const TIER_SCOPE: Readonly<Record<RiskTier, string[]>> = {
  'T0': ['mechanical', 'deterministic', 'generated'],
  'T1': ['standard', 'isolated-behavior'],
  'T2': ['business-logic', 'integration', 'auth', 'specialist-review'],
  'T3': ['security', 'concurrency', 'finance', 'migration', 'release', 'specialist-review'],
  'T-Visual': ['visual', 'ui-parity', 'taste', 'vision-review'],
  'T-Global': ['architecture', 'terminal', 'release', 'blind-challenge'],
};

/** Scope labels per verification layer; a claim carrying the layer inherits the label. */
const LAYER_SCOPE: Readonly<Record<VerificationLayer, string>> = {
  'unit': 'unit-behavior',
  'component': 'component-behavior',
  'contract': 'public-contract',
  'service-integration': 'service-integration',
  'deployed-topology': 'deployed-topology',
  'public-ingress-journey': 'public-ingress',
  'release-rollback': 'release-rollback',
};

/** Required raw evidence kinds per verification layer (AM-0020 §4 evidence envelope). */
const LAYER_EVIDENCE: Readonly<Record<VerificationLayer, string[]>> = {
  'unit': ['unit-test-log', 'unit-test-hash'],
  'component': ['component-test-log', 'component-test-hash'],
  'contract': ['contract-schema-verification', 'schema-hash'],
  'service-integration': ['integration-run-log', 'integration-run-hash'],
  'deployed-topology': ['topology-hash', 'topology-validation-log'],
  'public-ingress-journey': ['browser-session-recording', 'browser-route-coverage'],
  'release-rollback': ['release-rollback-log', 'install-upgrade-log'],
};

const TIER_WEIGHT: Readonly<Record<RiskTier, number>> = {
  'T0': 1,
  'T1': 2,
  'T2': 3,
  'T3': 4,
  'T-Visual': 3,
  'T-Global': 5,
};

function terminalWeight(tier: RiskTier): number {
  return TIER_WEIGHT[tier] + 1;
}

function capabilitiesFor(tier: RiskTier, text: string): string[] {
  const caps = new Set<string>();
  const t = text.toLowerCase();
  // T2/T3 (and T-Global) require specialist review capability (AM-0020 §6).
  if (tier === 'T2' || tier === 'T3' || tier === 'T-Global') caps.add('specialist');
  if (tier === 'T-Visual') caps.add('vision');
  // Raw-CDP parity claims need a real CDP session — Playwright Chromium without
  // a CDP session cannot prove RAW_CDP (AM-0020 §4).
  if (t.includes('cdp') || tier === 'T-Visual') caps.add('cdp');
  if (tier === 'T0') caps.add('deterministic-verifier');
  return [...caps];
}

// ── Negative probe seeds (AM-0020 §7 adversarial counterexamples) ────────────

const TIER_NEGATIVE_INVARIANTS: Readonly<Record<RiskTier, string[]>> = {
  'T0': ['generated artifact must be byte-reproducible', 'hash must bind exact source bytes'],
  'T1': ['no undefined or null in canonical output', 'single responsibility per artifact'],
  'T2': ['cross-role access must fail closed', 'duplicate idempotency key must be rejected', 'TOCTOU between validation and commit must be impossible'],
  'T3': ['double approval must be rejected', 'concurrent oversubscription must be rejected', 'zero/negative/overflow amounts must fail one trust boundary', 'revoked/stale tokens must fail closed', 'test evidence preceding the final fix must not bind the candidate'],
  'T-Visual': ['wrong reference-state mapping must fail SEMANTICALLY_VALID', 'redirect-to-home false-green must be rejected', 'CDP buffer reset or double capture must be detected', 'vacuous focus/accessibility assertions must fail'],
  'T-Global': ['report totals must match raw runner output', 'a terminal marker written by an LLM/Markdown outside an engine event is invalid', 'open blocking findings cannot be silenced by report prose'],
};

/** Parse M11-R title lines from amendment text (both AM-0019 §14 and AM-0020 §14). */
export function parseM11ClaimTitles(amendmentText: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of amendmentText.split('\n')) {
    const m = line.match(/^\s*-\s+(M11-R\d+)\s+(.+?)\s*$/);
    if (m) out.set(m[1], m[2].replace(/\.+$/, ''));
  }
  return out;
}

// ── Claim compilation ────────────────────────────────────────────────────────

function positiveInvariants(req: RequirementMapping, tier: RiskTier): string[] {
  const out = new Set<string>([
    `requirement ${req.requirement_id} compiled into the verification graph`,
    'evidence envelope records claim_ids, candidate_epoch, command, exit_code, hashes, freshness',
  ]);
  for (const ac of req.acceptance_criteria) out.add(`acceptance criterion satisfied: ${ac}`);
  if (tier === 'T0') out.add('deterministic verifier proves the claim without an LLM reviewer');
  if (tier === 'T3') out.add('two independent reviewers; at least one strong or different-provider reviewer (AM-0020 §6)');
  if (tier === 'T-Visual') out.add('deterministic visual compiler plus a vision-capable reviewer');
  if (tier === 'T-Global') out.add('sharded specialist reviews plus blind final challenger');
  return [...out];
}

/** Build one ClaimDefinition per requirement (some requirements split into two claims where the
 * deterministic and the capability-qualified parts must not be conflated). */
export function compileClaims(input: ClaimCompileInput): ClaimDefinition[] {
  const titles = new Map<string, string>();
  for (const am of input.amendmentTexts ?? []) {
    for (const [id, title] of parseM11ClaimTitles(am)) titles.set(id, title);
  }

  const claims: ClaimDefinition[] = [];
  for (const req of input.requirements) {
    const source = req.source ?? '';
    const text = `${source} ${req.acceptance_criteria.join(' ')} ${req.requirement_id}`;
    const tier = tierOfRequirement(req.requirement_id, text);
    const scope = new Set<string>([...TIER_SCOPE[tier]]);
    for (const layer of req.verification_profile.layers) scope.add(LAYER_SCOPE[layer]);
    const evidence = new Set<string>();
    for (const layer of req.verification_profile.layers) {
      for (const kind of LAYER_EVIDENCE[layer]) evidence.add(kind);
    }
    if (evidence.size === 0) evidence.add('requirement-test-log');

    const base: ClaimDefinition = {
      claim_id: `CLAIM-${req.requirement_id}-1`,
      requirement_id: req.requirement_id,
      plan_anchor: req.plan_anchor?.section_heading ?? source,
      meaning: titles.get(req.requirement_id) ?? (source || req.requirement_id),
      scope: [...scope],
      risk_tier: tier,
      positive_invariants: positiveInvariants(req, tier),
      negative_invariants: TIER_NEGATIVE_INVARIANTS[tier],
      required_evidence: [...evidence],
      required_capabilities: capabilitiesFor(tier, text),
      freshness_dependencies: [
        { older_evidence: 'review-receipt', fresher_than: 'candidate-epoch' },
        { older_evidence: 'prior-requirement-evidence', fresher_than: 'candidate-epoch' },
      ],
      allowed_deviations: ['approved SUPERSEDED requirement', 'owner-approved design-token deviation'],
      terminal_weight: terminalWeight(tier),
    };

    // Raw-CDP parity claims split into a deterministic diff claim and a
    // capability-qualified verdict claim so a no-vision review cannot issue a
    // visual PASS (AM-0020 §4/§6).
    const t = text.toLowerCase();
    if ((tier === 'T-Visual' && (t.includes('cdp') || t.includes('parity'))) || req.requirement_id === 'M11-R20' || req.requirement_id === 'M11-R21') {
      claims.push(base, {
        ...base,
        claim_id: `CLAIM-${req.requirement_id}-2`,
        meaning: `${base.meaning} — capability-qualified verdict`,
        scope: [...scope, 'capability-qualified-verdict'],
        required_capabilities: [...base.required_capabilities, 'vision', 'cdp'],
        freshness_dependencies: [
          { older_evidence: 'deterministic-diff', fresher_than: 'vision-verdict' },
          ...base.freshness_dependencies,
        ],
        terminal_weight: base.terminal_weight + 1,
      });
      continue;
    }
    claims.push(base);
  }
  return claims;
}

// ── Evidence evaluation (AM-0020 §2/§4) ──────────────────────────────────────

export interface ClaimEvidenceInput {
  /** Raw artifact(s) exist for the claim (screenshot existence proves PRESENT, not parity). */
  present?: boolean;
  /** Artifact is parseable and semantically valid (wrong reference state fails this). */
  valid?: boolean;
  /** Evidence is FRESH (within the freshness window / binds the final candidate). */
  fresh?: boolean;
  /** Explicit staleness — evidence was fresh but aged past the freshness window. */
  stale?: boolean;
  independently_reproduced?: boolean;
  terminal_eligible?: boolean;
  /** Required capability (e.g. vision) is absent for this claim → capability-invalid. */
  capability_invalid?: boolean;
  /** Explicitly partial / contradictory / superseded evidence. */
  partial?: boolean;
  contradicted?: boolean;
  superseded?: boolean;
  /** Host capabilities actually available for the claim (default: claim requirements unmet). */
  capabilities?: string[];
  /** Preferred explicit maturity — overrides the ladder when present (blocking states win). */
  explicit?: EvidenceMaturity;
}

export interface ClaimEvaluationResult {
  claim_id: string;
  requirement_id: string;
  maturity: EvidenceMaturity;
  /** True when the claim cannot satisfy any aggregate formula. */
  blocked: boolean;
  blockReason: string | null;
}

export interface ClaimFormulaResult {
  formula: ClaimFormula;
  /** All required claims reach the formula threshold and no subclaim is blocked. */
  satisfied: boolean;
  blockedClaims: Array<{ claim_id: string; maturity: EvidenceMaturity; reason: string }>;
  /** Formula blocked reasons — aggregate terms cannot be redefined by prose (AM-0020 §2). */
  reasons: string[];
}

export interface ClaimFormulaSummary {
  byClaim: Record<string, ClaimEvaluationResult>;
  formulas: ClaimFormulaResult[];
  formulaState: Record<ClaimFormula, boolean>;
}

/** Fail-closed per-claim maturity. One PARTIAL/CONTRADICTED/stale/capability-invalid
 * subclaim blocks the aggregate (AM-0020 §2). SUPERSEDED is an approved deviation. */
function evaluateOneClaim(claim: ClaimDefinition, ev: ClaimEvidenceInput): ClaimEvaluationResult {
  const caps = new Set(ev.capabilities ?? []);
  const capabilityInvalid = claim.required_capabilities.some((c) => !caps.has(c));
  const block = (maturity: EvidenceMaturity, reason: string): ClaimEvaluationResult => ({
    claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity, blocked: true, blockReason: reason,
  });

  // Blocking states always win over the ladder. SUPERSEDED (approved deviation)
  // is terminal and outranks everything, including capability absence.
  if (ev.explicit === 'SUPERSEDED' || ev.superseded === true) {
    return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'SUPERSEDED', blocked: false, blockReason: 'approved SUPERSEDED deviation' };
  }
  if (ev.explicit === 'CONTRADICTED' || ev.contradicted === true) return block('CONTRADICTED', 'contradicted evidence');
  if (ev.explicit === 'WAITING_CAPABILITY' || capabilityInvalid) {
    return block('WAITING_CAPABILITY', capabilityInvalid ? 'capability-invalid: missing required capability' : 'waiting capability');
  }
  if (ev.explicit === 'PARTIAL' || ev.partial === true) return block('PARTIAL', 'partial evidence');
  if (ev.explicit) {
    const blocked = MATURITY_RANK[ev.explicit] < 0;
    return {
      claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: ev.explicit,
      blocked, blockReason: blocked ? `explicit ${ev.explicit}` : null,
    };
  }

  // Ladder: UNOBSERVED → PRESENT → VALID → FRESH → INDEPENDENTLY_REPRODUCED → TERMINAL_ELIGIBLE.
  if (ev.present !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'UNOBSERVED', blocked: true, blockReason: 'unobserved evidence' };
  if (ev.valid !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'PRESENT', blocked: true, blockReason: 'evidence present but not semantically valid' };
  // Stale evidence is a blocking condition distinct from never-fresh evidence
  // (AM-0020 §2: stale subclaim prevents aggregate completion).
  if (ev.stale === true) return block('PARTIAL', 'stale evidence — freshness window exceeded or evidence predates the final candidate');
  if (ev.fresh !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'VALID', blocked: true, blockReason: 'evidence valid but not fresh' };
  if (ev.independently_reproduced !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'FRESH', blocked: false, blockReason: null };
  if (ev.terminal_eligible !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'INDEPENDENTLY_REPRODUCED', blocked: false, blockReason: null };
  return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'TERMINAL_ELIGIBLE', blocked: false, blockReason: null };
}

export function evaluateClaimFormulas(
  claims: ClaimDefinition[],
  evidenceByClaim: Record<string, ClaimEvidenceInput>,
): ClaimFormulaSummary {
  const byClaim: Record<string, ClaimEvaluationResult> = {};
  for (const claim of claims) {
    byClaim[claim.claim_id] = evaluateOneClaim(claim, evidenceByClaim[claim.claim_id] ?? {});
  }

  const formulas: ClaimFormulaResult[] = [];
  for (const formula of CLAIM_FORMULAS) {
    const blockedClaims: ClaimFormulaResult['blockedClaims'] = [];
    for (const claim of claims) {
      const evalResult = byClaim[claim.claim_id];
      if (evalResult.maturity === 'SUPERSEDED') continue; // approved deviation always passes
      const rank = MATURITY_RANK[evalResult.maturity];
      // PRODUCTION_READY strengthens the threshold for material-risk tiers.
      const threshold = formula === 'PRODUCTION_READY' && (claim.risk_tier === 'T3' || claim.risk_tier === 'T-Visual' || claim.risk_tier === 'T-Global')
        ? MATURITY_RANK.TERMINAL_ELIGIBLE
        : FORMULA_THRESHOLDS[formula];
      if (rank < threshold || evalResult.blocked) {
        blockedClaims.push({
          claim_id: claim.claim_id,
          maturity: evalResult.maturity,
          reason: evalResult.blockReason ?? `maturity below ${formula} threshold`,
        });
      }
    }
    const reasons = blockedClaims.map((b) => `${b.claim_id}:${b.maturity} (${b.reason})`);
    formulas.push({ formula, satisfied: blockedClaims.length === 0, blockedClaims, reasons });
  }

  const formulaState = Object.fromEntries(formulas.map((f) => [f.formula, f.satisfied])) as Record<ClaimFormula, boolean>;
  return { byClaim, formulas, formulaState };
}
