/**
 * claim-registry.ts — AM-0020 claim semantics and fail-closed maturity formulas.
 * Kept separate from plan-readiness so plan compilation and claim truth semantics
 * remain independently reviewable and the production source stays bounded.
 */
import type { RequirementMapping, VerificationLayer } from './plan-readiness.js';

export const EVIDENCE_MATURITIES = [
  'UNOBSERVED', 'PRESENT', 'VALID', 'FRESH', 'INDEPENDENTLY_REPRODUCED',
  'TERMINAL_ELIGIBLE', 'PARTIAL', 'CONTRADICTED', 'WAITING_CAPABILITY', 'SUPERSEDED',
] as const;
export type EvidenceMaturity = (typeof EVIDENCE_MATURITIES)[number];

/**
 * Evidence stage (AM-0005): what was actually executed, orthogonal to the
 * maturity/integrity ladder above. A valid, fresh, independently reproduced
 * test run is still only TEST_VERIFIED; it never proves live usage. No stage
 * auto-promotes to a higher one.
 *
 * One canonical owner: this file. Schemas mirror the enum; they do not extend it.
 */
export const EVIDENCE_STAGES = [
  'SOURCE_VERIFIED',
  'TEST_VERIFIED',
  'NATIVE_SMOKE_VERIFIED',
  'LIVE_CANDIDATE',
  'LIVE_OBSERVED',
  'OPERATIONALLY_PROVEN',
  'LIVE_UNPROVEN',
] as const;
export type EvidenceStage = (typeof EVIDENCE_STAGES)[number];

/** Stage ladder order; higher index = stronger proof. LIVE_UNPROVEN is terminal-honest, never promotable. */
export const STAGE_RANK: Readonly<Record<EvidenceStage, number>> = {
  SOURCE_VERIFIED: 1,
  TEST_VERIFIED: 2,
  NATIVE_SMOKE_VERIFIED: 3,
  LIVE_CANDIDATE: 4,
  LIVE_OBSERVED: 5,
  OPERATIONALLY_PROVEN: 6,
  LIVE_UNPROVEN: -1,
};

/** Stages that assert real usage. Test-only evidence can never satisfy these. */
export const LIVE_STAGES: readonly EvidenceStage[] = ['LIVE_CANDIDATE', 'LIVE_OBSERVED', 'OPERATIONALLY_PROVEN'] as const;

export function isLiveStage(stage: EvidenceStage | undefined): boolean {
  return stage !== undefined && LIVE_STAGES.includes(stage);
}

/** Highest stage among observed records; undefined when no record declares a stage. */
export function bestStage(stages: readonly EvidenceStage[] | undefined): EvidenceStage | undefined {
  if (!stages || stages.length === 0) return undefined;
  let best: EvidenceStage | undefined;
  for (const stage of stages) {
    const rank = STAGE_RANK[stage];
    if (rank < 0) continue; // LIVE_UNPROVEN never promotes acceptance
    if (best === undefined || rank > STAGE_RANK[best]) best = stage;
  }
  return best;
}

/** True when at least one observed record reached the claim's required stage. */
export function stageSatisfies(required: EvidenceStage, stages: readonly EvidenceStage[] | undefined): boolean {
  const best = bestStage(stages);
  if (best === undefined) return false;
  if (required === 'LIVE_UNPROVEN') return false; // never satisfiable as a requirement
  return STAGE_RANK[best] >= STAGE_RANK[required];
}

/**
 * AM-0005 compatibility floor: records written before stages existed (no
 * explicit evidence_stage) are treated as TEST_VERIFIED — the strongest stage
 * an unlabeled verifier-observed pass can honestly support. Live stages always
 * require explicit labeling; nothing unlabeled ever reaches a live stage.
 */
export function normalizeStages(stages: readonly EvidenceStage[] | undefined): EvidenceStage[] {
  if (!stages || stages.length === 0) return ['TEST_VERIFIED'];
  return [...stages];
}

/** Derive a claim's minimum evidence stage from requirement wording (AM-0005). */
export function requiredStageFromText(text: string): EvidenceStage {
  const t = text.toLowerCase();
  if (t.includes('dogfood') || t.includes('operationally proven') || t.includes('operational proof')) return 'LIVE_OBSERVED';
  if (t.includes('live observed') || t.includes('live usage')) return 'LIVE_OBSERVED';
  if (t.includes('native smoke')) return 'NATIVE_SMOKE_VERIFIED';
  if (t.includes('live')) return 'LIVE_CANDIDATE';
  return 'TEST_VERIFIED';
}

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
  /** AM-0005: minimum evidence stage this claim may be accepted on. */
  required_stage: EvidenceStage;
}

export interface ClaimCompileInput {
  /** Effective requirement set from plan-readiness compileRequirements (dynamic count). */
  requirements: RequirementMapping[];
  /** Raw amendment markdown (AM-0019/AM-0020) used to enrich M11-R titles. */
  amendmentTexts?: string[];
}

const EXPLICIT_TIERS: Readonly<Record<string, RiskTier>> = {
  'REQ-001': 'T2', 'REQ-002': 'T-Global', 'REQ-003': 'T2', 'REQ-004': 'T2',
  'REQ-005': 'T1', 'REQ-006': 'T3', 'REQ-007': 'T1',
  'REQ-008': 'T1', 'REQ-009': 'T1', 'REQ-010': 'T1', 'REQ-011': 'T1', 'REQ-012': 'T1',
  'REQ-013': 'T1', 'REQ-014': 'T1', 'REQ-015': 'T1',
  'M11-R11': 'T1', 'M11-R12': 'T2', 'M11-R13': 'T0', 'M11-R14': 'T1',
  'M11-R15': 'T2', 'M11-R16': 'T3', 'M11-R17': 'T3', 'M11-R18': 'T0',
  'M11-R19': 'T2', 'M11-R20': 'T-Visual', 'M11-R21': 'T-Visual',
  'M11-R22': 'T3', 'M11-R23': 'T2', 'M11-R24': 'T-Global',
  'M11-R25': 'T2', 'M11-R26': 'T2',
  'M11-R27': 'T1', 'M11-R28': 'T3', 'M11-R29': 'T2', 'M11-R30': 'T3',
  'M11-R31': 'T2', 'M11-R32': 'T3', 'M11-R33': 'T2', 'M11-R34': 'T3',
  'M11-R35': 'T2', 'M11-R36': 'T1',
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
    if (keywords.some((keyword) => keyword.length <= 3
      ? new RegExp(`(^|[^\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(t)
      : t.includes(keyword))) return tier;
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

const LAYER_SCOPE: Readonly<Record<VerificationLayer, string>> = {
  'unit': 'unit-behavior', 'component': 'component-behavior', 'contract': 'public-contract',
  'service-integration': 'service-integration', 'deployed-topology': 'deployed-topology',
  'public-ingress-journey': 'public-ingress', 'release-rollback': 'release-rollback',
};

const LAYER_EVIDENCE: Readonly<Record<VerificationLayer, string[]>> = {
  'unit': ['unit-test-log', 'unit-test-hash'], 'component': ['component-test-log', 'component-test-hash'],
  'contract': ['contract-schema-verification', 'schema-hash'],
  'service-integration': ['integration-run-log', 'integration-run-hash'],
  'deployed-topology': ['topology-hash', 'topology-validation-log'],
  'public-ingress-journey': ['browser-session-recording', 'browser-route-coverage'],
  'release-rollback': ['release-rollback-log', 'install-upgrade-log'],
};

const TIER_WEIGHT: Readonly<Record<RiskTier, number>> = {
  'T0': 1, 'T1': 2, 'T2': 3, 'T3': 4, 'T-Visual': 3, 'T-Global': 5,
};

function terminalWeight(tier: RiskTier): number { return TIER_WEIGHT[tier] + 1; }

function capabilitiesFor(tier: RiskTier, text: string): string[] {
  const caps = new Set<string>();
  const t = text.toLowerCase();
  if (tier === 'T2' || tier === 'T3' || tier === 'T-Global') caps.add('specialist');
  if (tier === 'T-Visual') caps.add('vision');
  if (t.includes('cdp') || tier === 'T-Visual') caps.add('cdp');
  if (tier === 'T0') caps.add('deterministic-verifier');
  return [...caps];
}

const TIER_NEGATIVE_INVARIANTS: Readonly<Record<RiskTier, string[]>> = {
  'T0': ['generated artifact must be byte-reproducible', 'hash must bind exact source bytes'],
  'T1': ['no undefined or null in canonical output', 'single responsibility per artifact'],
  'T2': ['cross-role access must fail closed', 'duplicate idempotency key must be rejected', 'TOCTOU between validation and commit must be impossible'],
  'T3': ['double approval must be rejected', 'concurrent oversubscription must be rejected', 'zero/negative/overflow amounts must fail one trust boundary', 'revoked/stale tokens must fail closed', 'test evidence preceding the final fix must not bind the candidate'],
  'T-Visual': ['wrong reference-state mapping must fail SEMANTICALLY_VALID', 'redirect-to-home false-green must be rejected', 'CDP buffer reset or double capture must be detected', 'vacuous focus/accessibility assertions must fail'],
  'T-Global': ['report totals must match raw runner output', 'a terminal marker written by an LLM/Markdown outside an engine event is invalid', 'open blocking findings cannot be silenced by report prose'],
};

export function parseM11ClaimTitles(amendmentText: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of amendmentText.split('\n')) {
    const m = line.match(/^\s*-\s+(M11-R\d+)\s+(.+?)\s*$/);
    if (m) out.set(m[1], m[2].replace(/\.+$/, ''));
  }
  return out;
}

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
      plan_anchor: req.plan_anchor?.section_heading ?? req.effective_source_anchor?.section_heading ?? source,
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
      required_stage: requiredStageFromText(text),
    };

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

export interface ClaimEvidenceInput {
  present?: boolean;
  valid?: boolean;
  fresh?: boolean;
  stale?: boolean;
  independently_reproduced?: boolean;
  terminal_eligible?: boolean;
  capability_invalid?: boolean;
  partial?: boolean;
  contradicted?: boolean;
  superseded?: boolean;
  capabilities?: string[];
  explicit?: EvidenceMaturity;
  /**
   * AM-0005: evidence stage(s) actually reached by the observations backing
   * this claim. The claim's minimum stage (ClaimDefinition.required_stage)
   * gates acceptance; below-stage evidence blocks regardless of integrity.
   */
  evidence_stages?: EvidenceStage[];
}

export interface ClaimEvaluationResult {
  claim_id: string;
  requirement_id: string;
  maturity: EvidenceMaturity;
  blocked: boolean;
  blockReason: string | null;
}

export interface ClaimFormulaResult {
  formula: ClaimFormula;
  satisfied: boolean;
  blockedClaims: Array<{ claim_id: string; maturity: EvidenceMaturity; reason: string }>;
  reasons: string[];
}

export interface ClaimFormulaSummary {
  byClaim: Record<string, ClaimEvaluationResult>;
  formulas: ClaimFormulaResult[];
  formulaState: Record<ClaimFormula, boolean>;
}

function evaluateOneClaim(claim: ClaimDefinition, ev: ClaimEvidenceInput): ClaimEvaluationResult {
  const caps = new Set(ev.capabilities ?? []);
  const capabilityInvalid = claim.required_capabilities.some((c) => !caps.has(c));
  const block = (maturity: EvidenceMaturity, reason: string): ClaimEvaluationResult => ({
    claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity, blocked: true, blockReason: reason,
  });

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

  if (ev.present !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'UNOBSERVED', blocked: true, blockReason: 'unobserved evidence' };
  if (ev.valid !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'PRESENT', blocked: true, blockReason: 'evidence present but not semantically valid' };
  if (ev.stale === true) return block('PARTIAL', 'stale evidence — freshness window exceeded or evidence predates the final candidate');
  if (ev.fresh !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'VALID', blocked: true, blockReason: 'evidence valid but not fresh' };
  if (ev.independently_reproduced !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'FRESH', blocked: false, blockReason: null };
  if (ev.terminal_eligible !== true) return { claim_id: claim.claim_id, requirement_id: claim.requirement_id, maturity: 'INDEPENDENTLY_REPRODUCED', blocked: false, blockReason: null };
  if (!stageSatisfies(claim.required_stage ?? 'TEST_VERIFIED', normalizeStages(ev.evidence_stages))) {
    const got = bestStage(normalizeStages(ev.evidence_stages));
    return block('PARTIAL', `evidence stage ${got ?? 'none'} below required stage ${claim.required_stage ?? 'TEST_VERIFIED'} (AM-0005: test-only evidence never satisfies a live/dogfood claim)`);
  }
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
      if (evalResult.maturity === 'SUPERSEDED') continue;
      const rank = MATURITY_RANK[evalResult.maturity];
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
