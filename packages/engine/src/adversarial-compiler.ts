/**
 * adversarial-compiler.ts — M11-R30 adversarial counterexample compiler
 * (AM-0020 §7).
 *
 * Negative probes are generated from plan invariants, topology and claim scope,
 * one per §7 subcategory, across four domain profiles: finance_concurrency,
 * authorization_security, browser_parity, release. Browser/parity probes reuse
 * the C7 seeded-defect machinery: they carry a `defect_seed` / `parity_overrides`
 * descriptor and parity-runner executes them via `probeToParityPair`.
 *
 * `runProbe` is honest: a subject that lacks the probed surface is
 * SKIPPED_INAPPLICABLE — never PASS. PASS means the probe was rejected as
 * expected (invariant holds); FAIL means the subject accepted it (false-green).
 * A T2/T3 claim cannot be accepted without a negative probe unless a recorded
 * deterministic proof makes the probe formally unnecessary (§7).
 */
import type { ParityDefectSeed } from './visual-contracts.js';
import type { ParityPair } from './parity-runner.js';
import type { SystemTopology } from './topology-compiler.js';

export const ADVERSARIAL_DOMAINS = [
  'finance_concurrency',
  'authorization_security',
  'browser_parity',
  'release',
] as const;
export type AdversarialDomain = (typeof ADVERSARIAL_DOMAINS)[number];

export type RiskTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T-Visual' | 'T-Global';

/** Per-pair overrides that map a browser_parity probe onto a C7 ParityPair. */
export interface ParityOverrideHint {
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly theme?: 'light' | 'dark' | 'no-preference';
  readonly role?: string;
  readonly stateCheckpoint?: string;
  readonly targetUrl?: string;
}

/** A single negative probe (AM-0020 §7). */
export interface Counterexample {
  readonly probe_id: string;
  readonly domain: AdversarialDomain;
  readonly subcategory: string;
  /** The invariant under attack — the plan/topology property that must hold. */
  readonly invariant: string;
  /** The negative action a subject is probed with. */
  readonly action: string;
  /** The honest rejection an invariant-preserving subject must produce. */
  readonly expected_rejection: string;
  /** Claim the probe targets (AM-0020 §2 claim scope). */
  readonly target_claim: string;
  /** Subject surface the probe applies to; absence → SKIPPED_INAPPLICABLE. */
  readonly surface: string;
  /** C7 seeded defect delegated to parity-runner (browser_parity only). */
  readonly defect_seed?: ParityDefectSeed;
  /** Pair-field overrides for parity-runner execution (browser_parity only). */
  readonly parity_overrides?: ParityOverrideHint;
  readonly topology_context?: Readonly<Record<string, string>>;
}

/** AM-0020 §2 ClaimDefinition subset consumed by the adversarial gate. */
export interface ClaimDef {
  readonly claim_id: string;
  readonly risk_tier: RiskTier;
  readonly scope: string;
  readonly domains?: readonly AdversarialDomain[];
  /** Recorded reason why a deterministic proof makes the probe unnecessary. */
  readonly deterministic_proof?: { readonly justification: string; readonly proof_ref?: string };
}

/** Plan invariant surfaces that select and parameterize probe generators. */
export interface PlanInvariantProfile {
  readonly plan_id: string;
  /** Domains the plan must verify; empty/absent means all four. */
  readonly domains_required?: readonly AdversarialDomain[];
  readonly finance?: {
    readonly tenants?: readonly string[];
    readonly approvals_required?: number;
    readonly idempotency_keys?: boolean;
    readonly capacity_limit?: number;
    readonly uses_transactions?: boolean;
  };
  readonly security?: {
    readonly roles?: readonly string[];
    readonly default_deny?: boolean;
    readonly token_auth?: boolean;
    readonly proxy_aware?: boolean;
  };
  readonly browser?: {
    readonly routes?: readonly string[];
    readonly viewports?: readonly { readonly width: number; readonly height: number }[];
    readonly themes?: readonly ('light' | 'dark')[];
    readonly roles?: readonly string[];
    readonly uses_cdp?: boolean;
  };
  readonly release?: {
    readonly migrations?: readonly string[];
    readonly uses_images?: boolean;
    readonly tracks_untracked?: boolean;
  };
}

// ── target-claim resolution ─────────────────────────────────────────────────

function resolveTargetClaim(domain: AdversarialDomain, claims: readonly ClaimDef[], fallback: string): string {
  for (const c of claims) {
    if ((c.domains ?? []).includes(domain)) return c.claim_id;
  }
  return fallback;
}

type TargetResolver = (domain: AdversarialDomain) => string;

// ── generators (one probe per §7 subcategory, deterministic) ────────────────

function financeProbes(plan: PlanInvariantProfile, topo: SystemTopology, target: TargetResolver): Counterexample[] {
  const f = plan.finance;
  const tenants = f?.tenants && f.tenants.length > 0 ? f.tenants : ['tenant-a', 'tenant-b'];
  const approvals = f?.approvals_required ?? 2;
  const capacity = f?.capacity_limit ?? 100;
  const dbs = topo.databases.map((d) => d.id).filter((id) => id.length > 0);
  const ctx = (extra: Record<string, string> = {}): Record<string, string> => ({
    ...(dbs.length > 0 ? { db: dbs.join(',') } : {}),
    ...extra,
  });
  return [
    {
      probe_id: 'finance_cross-tenant-reference',
      domain: 'finance_concurrency',
      subcategory: 'cross-tenant-reference',
      invariant: `every operation is scoped to exactly one org/tenant (${tenants.join(', ')}); cross-tenant references are rejected`,
      action: `authenticate as ${tenants[0]} and reference an account owned by ${tenants[1]} in one request`,
      expected_rejection: 'REJECT 403: cross-tenant reference; no data crosses the org boundary',
      surface: 'finance.tenancy',
      target_claim: target('finance_concurrency'),
      topology_context: ctx({ tenants: tenants.join(',') }),
    },
    {
      probe_id: 'finance_double-approval',
      domain: 'finance_concurrency',
      subcategory: 'double-approval',
      invariant: `an approval chain requires ${approvals} distinct principals; the same principal cannot approve twice`,
      action: 'the transaction owner submits the second approval on their own approval chain',
      expected_rejection: `REJECT 409: double approval by the same principal (needs ${approvals} distinct approvers)`,
      surface: 'finance.approval',
      target_claim: target('finance_concurrency'),
      topology_context: ctx({ approvals: String(approvals) }),
    },
    {
      probe_id: 'finance_duplicate-idempotency-key',
      domain: 'finance_concurrency',
      subcategory: 'duplicate-idempotency-key',
      invariant: 'an idempotency key commits at most one operation; replays never double-commit',
      action: 'replay a request whose idempotency key already committed',
      expected_rejection: 'REJECT 409 or idempotent replay of the original result; never a second commit',
      surface: 'finance.idempotency',
      target_claim: target('finance_concurrency'),
      topology_context: ctx(),
    },
    {
      probe_id: 'finance_capacity-oversubscription',
      domain: 'finance_concurrency',
      subcategory: 'capacity-oversubscription',
      invariant: `concurrent allocation never exceeds the shared capacity limit ${capacity}`,
      action: `issue ${capacity + 1} concurrent allocations against a capacity pool of ${capacity}`,
      expected_rejection: `REJECT 429 for the excess; total concurrent allocation never exceeds ${capacity}`,
      surface: 'finance.capacity',
      target_claim: target('finance_concurrency'),
      topology_context: ctx({ capacity: String(capacity) }),
    },
    {
      probe_id: 'finance_toctou-validation-commit',
      domain: 'finance_concurrency',
      subcategory: 'toctou-validation-commit',
      invariant: 'commit re-validates state at commit time; a stale read can never commit',
      action: 'read a balance (validation OK), mutate it in a concurrent request, then commit the stale decision',
      expected_rejection: 'REJECT 409: stale-version commit detected; no lost update',
      surface: 'finance.toctou',
      target_claim: target('finance_concurrency'),
      topology_context: ctx(),
    },
    {
      probe_id: 'finance_partial-transaction',
      domain: 'finance_concurrency',
      subcategory: 'partial-transaction',
      invariant: 'multi-step financial operations are atomic or recoverable after a crash',
      action: 'kill the process after step 1 of a 2-step transfer and inspect the persisted state',
      expected_rejection: 'ROLLBACK or RECOVERABLE replay; no orphan half-committed state',
      surface: 'finance.transaction',
      target_claim: target('finance_concurrency'),
      topology_context: ctx(),
    },
    {
      probe_id: 'finance_numeric-boundaries',
      domain: 'finance_concurrency',
      subcategory: 'numeric-boundaries',
      invariant: 'amounts/counts reject zero, negative, overflow and rounding artifacts at every trust boundary',
      action: 'submit amount 0, -1, Number.MAX_SAFE_INTEGER + 1, and 0.1 + 0.2',
      expected_rejection: 'REJECT: all four boundary inputs rejected before commit',
      surface: 'finance.numeric-boundaries',
      target_claim: target('finance_concurrency'),
      topology_context: ctx(),
    },
  ];
}

function authProbes(plan: PlanInvariantProfile, topo: SystemTopology, target: TargetResolver): Counterexample[] {
  const s = plan.security;
  const topoRoles = topo.auth_roles.roles ?? [];
  const roles = s?.roles && s.roles.length > 0 ? s.roles : topoRoles.length > 0 ? topoRoles : ['admin', 'member'];
  const defaultDeny = s?.default_deny ?? true;
  const ctx = (extra: Record<string, string> = {}): Record<string, string> => ({
    roles: roles.join(','),
    default_deny: defaultDeny ? 'default-deny' : 'no-default-deny-declared',
    ...extra,
  });
  return [
    {
      probe_id: 'auth_wrong-owner-object',
      domain: 'authorization_security',
      subcategory: 'wrong-owner-object',
      invariant: 'a principal may access only objects they own; wrong-owner/object access is rejected',
      action: 'authenticated as owner A, read or update an object owned by B',
      expected_rejection: 'REJECT 403/404: wrong-owner/object access',
      surface: 'auth.ownership',
      target_claim: target('authorization_security'),
      topology_context: ctx(),
    },
    {
      probe_id: 'auth_cross-role-access',
      domain: 'authorization_security',
      subcategory: 'cross-role-access',
      invariant: `an endpoint scoped to ${roles[0]} rejects every other role`,
      action: `${roles[1] ?? 'member'} calls the ${roles[0]}-scoped endpoint`,
      expected_rejection: 'REJECT 403: cross-role access',
      surface: 'auth.roles',
      target_claim: target('authorization_security'),
      topology_context: ctx(),
    },
    {
      probe_id: 'auth_missing-default-deny',
      domain: 'authorization_security',
      subcategory: 'missing-default-deny',
      invariant: `unknown routes/roles/actions default to deny (${defaultDeny ? 'default-deny declared' : 'no default-deny declared'})`,
      action: 'call an unmapped route with a valid token',
      expected_rejection: 'REJECT 403: default-deny; a valid token never grants unknown routes',
      surface: 'auth.default-deny',
      target_claim: target('authorization_security'),
      topology_context: ctx(),
    },
    {
      probe_id: 'auth_enumeration-anti-oracle',
      domain: 'authorization_security',
      subcategory: 'enumeration-anti-oracle',
      invariant: 'lookups leak no existence oracle; responses are indistinguishable for existing and missing resources',
      action: 'probe a range of resource ids and compare status codes and bodies',
      expected_rejection: 'REJECT: identical responses for existing and missing resources (anti-oracle)',
      surface: 'auth.anti-oracle',
      target_claim: target('authorization_security'),
      topology_context: ctx(),
    },
    {
      probe_id: 'auth_stale-revoked-token',
      domain: 'authorization_security',
      subcategory: 'stale-revoked-token',
      invariant: 'revoked and expired tokens are rejected at every endpoint',
      action: 'reuse a token that was revoked at time T after T',
      expected_rejection: 'REJECT 401: stale/revoked token',
      surface: 'auth.token',
      target_claim: target('authorization_security'),
      topology_context: ctx(),
    },
    {
      probe_id: 'auth_header-spoofing',
      domain: 'authorization_security',
      subcategory: 'header-spoofing',
      invariant: 'identity/tenant comes from the authenticated session, never from spoofable headers',
      action: 'set X-Forwarded-For / X-Forwarded-Host / X-Tenant-Id to another tenant',
      expected_rejection: 'REJECT 403: header spoofing ignored; identity from the session only',
      surface: 'auth.headers',
      target_claim: target('authorization_security'),
      topology_context: ctx(),
    },
  ];
}

function browserProbes(plan: PlanInvariantProfile, _topo: SystemTopology, target: TargetResolver): Counterexample[] {
  const b = plan.browser;
  const route = b?.routes && b.routes.length > 0 ? b.routes[0] : '/runs';
  const viewport = b?.viewports?.[0] ?? { width: 1280, height: 720 };
  const theme = b?.themes?.[0] ?? 'light';
  const role = b?.roles?.[0] ?? 'visitor';
  const cdp = b?.uses_cdp ?? true;
  const ctx = (): Record<string, string> => ({ routes: (b?.routes ?? ['/runs']).join(','), cdp: cdp ? 'raw-cdp' : 'no-cdp' });
  return [
    {
      probe_id: 'browser_reference-state-mismap',
      domain: 'browser_parity',
      subcategory: 'reference-state-mismap',
      invariant: 'screenshots/evidence bind the exact canonical reference state for the route under test',
      action: `capture evidence for ${route} but bind it to the reference state of a different route`,
      expected_rejection: 'FAIL SEMANTICALLY_VALID: mismapped reference state never passes',
      surface: 'browser.reference-state',
      target_claim: target('browser_parity'),
      parity_overrides: { stateCheckpoint: '{"h1":"wrong-state"}' },
      topology_context: ctx(),
    },
    {
      probe_id: 'browser_missing-control-content-media',
      domain: 'browser_parity',
      subcategory: 'missing-control-content-media',
      invariant: 'every reference control/content/media element is present in the target',
      action: 'remove a reference-required control from the target page before capture',
      expected_rejection: 'parity FAIL: missing control/content/media in target',
      surface: 'browser.presence',
      target_claim: target('browser_parity'),
      defect_seed: 'missing-control',
      topology_context: ctx(),
    },
    {
      probe_id: 'browser_redirect-to-home',
      domain: 'browser_parity',
      subcategory: 'redirect-to-home',
      invariant: `a route that redirects to home is not green parity evidence for ${route}`,
      action: `${route} responds 302 to /home; evidence captured after the redirect lands on /home`,
      expected_rejection: 'FAIL: redirect-to-home is a false-green; the route itself must render',
      surface: 'browser.route-render',
      target_claim: target('browser_parity'),
      parity_overrides: { targetUrl: 'https://target.example.test/home' },
      topology_context: ctx(),
    },
    {
      probe_id: 'browser_runtime-error-on-mount',
      domain: 'browser_parity',
      subcategory: 'runtime-error-on-mount',
      invariant: 'route mount is free of console and network errors',
      action: 'emit a console.error and fail a request during route mount',
      expected_rejection: 'parity FAIL: console/network error evidence present during mount',
      surface: 'browser.runtime-capture',
      target_claim: target('browser_parity'),
      defect_seed: 'console-error',
      topology_context: ctx(),
    },
    {
      probe_id: 'browser_cdp-buffer-reset',
      domain: 'browser_parity',
      subcategory: 'cdp-buffer-reset',
      invariant: 'CDP console/network buffers are captured once after mount and never reset or double-captured',
      action: 'reset the CDP buffer after route mount, or capture the same buffer twice',
      expected_rejection: 'FAIL: lost or duplicated runtime signals; evidence must be one unbroken capture',
      surface: 'browser.cdp-buffer',
      target_claim: target('browser_parity'),
      topology_context: ctx(),
    },
    {
      probe_id: 'browser_vacuous-a11y',
      domain: 'browser_parity',
      subcategory: 'vacuous-a11y',
      invariant: 'focus/accessibility assertions bind real elements and real failure modes',
      action: 'assert focus/ARIA on a selector that matches nothing',
      expected_rejection: 'FAIL: vacuous assertion detected; no element matched',
      surface: 'browser.a11y-assertions',
      target_claim: target('browser_parity'),
      topology_context: ctx(),
    },
    {
      probe_id: 'browser_environment-mismatch',
      domain: 'browser_parity',
      subcategory: 'environment-mismatch',
      invariant: `parity binds the exact environment: viewport ${viewport.width}x${viewport.height}, theme ${theme}, auth-role ${role}`,
      action: 'run parity with a different viewport, theme or auth-role than the reference binding',
      expected_rejection: 'FAIL: environment mismatch (viewport/fixture/auth-role/theme)',
      surface: 'browser.environment',
      target_claim: target('browser_parity'),
      parity_overrides: { viewport: { width: 375, height: 812 }, theme: 'dark', role: 'admin' },
      topology_context: ctx(),
    },
  ];
}

function releaseProbes(plan: PlanInvariantProfile, topo: SystemTopology, target: TargetResolver): Counterexample[] {
  const r = plan.release;
  const migrations = (r?.migrations && r.migrations.length > 0 ? r.migrations : topo.migrations.map((m) => m.id)).filter((id) => id.length > 0);
  const images = r?.uses_images ?? topo.images.length > 0;
  const ctx = (): Record<string, string> => ({
    migrations: migrations.join(',') || 'none',
    images: images ? 'content-addressed' : 'no-images',
  });
  return [
    {
      probe_id: 'release_evidence-before-fix',
      domain: 'release',
      subcategory: 'evidence-before-fix',
      invariant: 'test evidence must postdate the final fix; pre-fix logs cannot bind the final candidate',
      action: 'bind test logs generated before the final fix commit to the final claim',
      expected_rejection: 'REJECT evidence: freshness/candidate binding fails',
      surface: 'release.evidence-freshness',
      target_claim: target('release'),
      topology_context: ctx(),
    },
    {
      probe_id: 'release_image-before-epoch',
      domain: 'release',
      subcategory: 'image-before-epoch',
      invariant: 'container/image evidence must be built from the final source epoch or later',
      action: 'bind an image built from a pre-epoch source tree to the final candidate',
      expected_rejection: 'REJECT evidence: image digest precedes the final source epoch',
      surface: 'release.image-epoch',
      target_claim: target('release'),
      topology_context: ctx(),
    },
    {
      probe_id: 'release_mutable-artifact',
      domain: 'release',
      subcategory: 'mutable-artifact',
      invariant: 'images and dependencies are content-addressed and immutable at the candidate',
      action: 'rebuild the same image tag with different content after the candidate epoch',
      expected_rejection: 'REJECT: digest pinning required; a mutable tag cannot prove the candidate',
      surface: 'release.artifact-immutability',
      target_claim: target('release'),
      topology_context: ctx(),
    },
    {
      probe_id: 'release_untracked-source',
      domain: 'release',
      subcategory: 'untracked-source',
      invariant: 'every build-critical source file is tracked in the candidate manifest',
      action: 'build from a tree where a build-critical file is untracked and absent from the manifest',
      expected_rejection: 'REJECT candidate: untracked build-critical source',
      surface: 'release.tracking',
      target_claim: target('release'),
      topology_context: ctx(),
    },
    {
      probe_id: 'release_migration-mismatch',
      domain: 'release',
      subcategory: 'migration-mismatch',
      invariant: `fresh-install, upgrade and rollback apply the same migration set (${migrations.join(',') || 'none'})`,
      action: 'install fresh, upgrade from a prior version, then roll back; compare applied migrations and schema version',
      expected_rejection: 'REJECT: migration set mismatch across install/upgrade/rollback',
      surface: 'release.migrations',
      target_claim: target('release'),
      topology_context: ctx(),
    },
  ];
}

type DomainGenerator = (plan: PlanInvariantProfile, topo: SystemTopology, target: TargetResolver) => Counterexample[];
const GENERATORS: Readonly<Record<string, DomainGenerator>> = {
  finance_concurrency: financeProbes,
  authorization_security: authProbes,
  browser_parity: browserProbes,
  release: releaseProbes,
};

// ── compiler ────────────────────────────────────────────────────────────────

export interface AdversarialCoverageReport {
  readonly probes: readonly Counterexample[];
  readonly coverage: Readonly<Record<AdversarialDomain, number>>;
  /** Required domains whose generator produced zero probes — the eval FAIL path. */
  readonly empty_required_domains: readonly AdversarialDomain[];
}

/**
 * Compile negative probes for every domain the plan requires, parameterized by
 * the topology and scoped to the claims. Deterministic: same inputs, same
 * probe_id set.
 */
export function compileAdversarial(
  plan: PlanInvariantProfile,
  topo: SystemTopology,
  claims: readonly ClaimDef[],
): AdversarialCoverageReport {
  const required = plan.domains_required && plan.domains_required.length > 0
    ? [...new Set(plan.domains_required)]
    : [...ADVERSARIAL_DOMAINS];
  const fallback = `${plan.plan_id}::plan-invariant`;
  const target: TargetResolver = (domain) => resolveTargetClaim(domain, claims, fallback);

  const probes: Counterexample[] = [];
  const coverage: Record<AdversarialDomain, number> = {
    finance_concurrency: 0,
    authorization_security: 0,
    browser_parity: 0,
    release: 0,
  };
  const empty: AdversarialDomain[] = [];

  for (const domain of required) {
    const gen = GENERATORS[domain];
    if (!gen) {
      empty.push(domain);
      continue;
    }
    const domainProbes = gen(plan, topo, target);
    probes.push(...domainProbes);
    coverage[domain] = domainProbes.length;
    if (domainProbes.length === 0) empty.push(domain);
  }
  return { probes, coverage, empty_required_domains: empty };
}

/** Contract form of the compiler (AM-0020 §7): returns the probe list. */
export function compileCounterexamples(
  plan: PlanInvariantProfile,
  topo: SystemTopology,
  claims: readonly ClaimDef[],
): readonly Counterexample[] {
  return compileAdversarial(plan, topo, claims).probes;
}

// ── probe execution (honest semantics) ──────────────────────────────────────

export type ProbeOutcome = 'PASS' | 'FAIL' | 'SKIPPED_INAPPLICABLE';

/** Subject under test: an implementation/evidence surface the probes attack. */
export interface ProbeSubject {
  readonly id: string;
  /** Honest surface check — false yields SKIPPED_INAPPLICABLE, never PASS. */
  hasSurface(probe: Counterexample): boolean;
  /** Run the negative action; rejected=true means the invariant held. */
  execute(probe: Counterexample): { readonly rejected: boolean; readonly observed?: string };
}

export interface ProbeRunResult {
  readonly probe_id: string;
  readonly subject_id: string;
  readonly outcome: ProbeOutcome;
  readonly reason: string;
}

/**
 * PASS  — the subject rejected the probe as expected → invariant holds.
 * FAIL  — the subject accepted it → invariant violated (false-green found).
 * SKIPPED_INAPPLICABLE — the subject lacks the probed surface (honest skip).
 */
export function runProbe(probe: Counterexample, subject: ProbeSubject): ProbeRunResult {
  if (!subject.hasSurface(probe)) {
    return {
      probe_id: probe.probe_id,
      subject_id: subject.id,
      outcome: 'SKIPPED_INAPPLICABLE',
      reason: `subject ${subject.id} lacks surface ${probe.surface} for ${probe.probe_id} — honest skip, not PASS`,
    };
  }
  const r = subject.execute(probe);
  if (r.rejected) {
    return {
      probe_id: probe.probe_id,
      subject_id: subject.id,
      outcome: 'PASS',
      reason: r.observed !== undefined
        ? `${r.observed} — rejected as expected, invariant holds`
        : `probe ${probe.probe_id} rejected as expected — invariant holds`,
    };
  }
  return {
    probe_id: probe.probe_id,
    subject_id: subject.id,
    outcome: 'FAIL',
    reason: r.observed !== undefined
      ? `${r.observed} — false-green: invariant violated`
      : `probe ${probe.probe_id} was accepted — invariant violated (false-green)`,
  };
}

export function runProbes(probes: readonly Counterexample[], subject: ProbeSubject): readonly ProbeRunResult[] {
  return probes.map((p) => runProbe(p, subject));
}

// ── T2/T3 negative-probe gate (AM-0020 §7) ──────────────────────────────────

export interface ProbeGateResult {
  readonly claim_id: string;
  readonly risk_tier: RiskTier;
  readonly accepted: boolean;
  readonly reason: string;
  readonly probe_id?: string;
}

/**
 * A T2/T3 claim is accepted only when a compiled negative probe targets it or
 * the claim carries a recorded deterministic-proof justification. T0/T1 and
 * other tiers are not gated.
 */
export function assertNegativeProbeOrDeterministicProof(
  claim: ClaimDef,
  probes: readonly Counterexample[],
): ProbeGateResult {
  if (claim.risk_tier !== 'T2' && claim.risk_tier !== 'T3') {
    return {
      claim_id: claim.claim_id,
      risk_tier: claim.risk_tier,
      accepted: true,
      reason: `claim ${claim.claim_id} is ${claim.risk_tier} — the negative-probe gate applies to T2/T3 claims only`,
    };
  }
  if (claim.deterministic_proof) {
    return {
      claim_id: claim.claim_id,
      risk_tier: claim.risk_tier,
      accepted: true,
      reason: `claim ${claim.claim_id} has a recorded deterministic proof: ${claim.deterministic_proof.justification}`,
    };
  }
  const hit = probes.find((p) => p.target_claim === claim.claim_id);
  if (hit) {
    return {
      claim_id: claim.claim_id,
      risk_tier: claim.risk_tier,
      accepted: true,
      probe_id: hit.probe_id,
      reason: `claim ${claim.claim_id} has negative probe ${hit.probe_id}`,
    };
  }
  return {
    claim_id: claim.claim_id,
    risk_tier: claim.risk_tier,
    accepted: false,
    reason: `claim ${claim.claim_id} (${claim.risk_tier}) has no negative probe and no recorded deterministic proof — cannot be accepted`,
  };
}

// ── C7 delegation (browser_parity descriptors → ParityPair) ─────────────────

/**
 * Adapt a browser_parity probe descriptor to a C7 ParityPair. The compiler only
 * generates descriptors; parity-runner executes them (no browser driving here).
 */
export function probeToParityPair(probe: Counterexample, base: ParityPair): ParityPair {
  if (probe.domain !== 'browser_parity') {
    throw new Error(`probeToParityPair: probe ${probe.probe_id} is not in browser_parity domain`);
  }
  const o = probe.parity_overrides ?? {};
  return {
    ...base,
    id: `${base.id}:${probe.probe_id}`,
    defectSeed: probe.defect_seed ?? base.defectSeed,
    viewport: o.viewport ?? base.viewport,
    theme: o.theme ?? base.theme,
    role: o.role ?? base.role,
    stateCheckpoint: o.stateCheckpoint ?? base.stateCheckpoint,
    targetUrl: o.targetUrl ?? base.targetUrl,
  };
}
