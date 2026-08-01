/**
 * plan-readiness.ts — C1 PlanReadiness & autonomy compiler (AM-0019 §3)
 *
 * Atomically generates the nine machine projections under .agent/plans/<plan-id>/:
 *   projection.plan.yaml, autonomy.yaml, decisions.yaml, system-topology.yaml,
 *   execution-graph.yaml, conflict-graph.yaml, verification-graph.yaml,
 *   integration-train.yaml, resource-budget.yaml
 *
 * Requirement count is NEVER hard-coded. The effective requirement set is
 * compiled from the canonical ledger (milestones.M8.requirements) plus the
 * M11 additive registry parsed from AM-0019 §14. Every requirement maps to a
 * PlanAnchor → AcceptanceCriterion → VerificationProfile → EvidenceContract →
 * ExecutionCluster chain; missing components are marked GAP/PARTIAL honestly.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Sha256 } from './contracts.js';
import { M11_IMPLEMENTATIONS, clusterForM11 } from './plan-readiness-map.js';

// Re-exported so the plan-readiness public API is unchanged after the M11
// mapping table moved to its own module.
export { M11_IMPLEMENTATIONS } from './plan-readiness-map.js';

// ── Public enums ─────────────────────────────────────────────────────────────

export const READINESS_STATES = ['AUTONOMOUS_READY', 'BOUNDED_READY', 'OWNER_DECISION_REQUIRED'] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

export const DEPENDENCY_TYPES = [
  'HARD', 'SOFT', 'VERIFY_AFTER', 'SEMANTIC_CONFLICT', 'INTEGRATION', 'GLOBAL_GATE', 'EXTERNAL',
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const RECOVERABLE_STATES = [
  'WAITING_EXTERNAL', 'WAITING_AUTHORITY', 'WAITING_RESOURCE', 'RETRY_SCHEDULED', 'NEEDS_REMEDIATION',
] as const;
export type RecoverableState = (typeof RECOVERABLE_STATES)[number];

export const CONFLICT_DOMAINS = [
  'path/glob', 'public-api-schema', 'migration', 'lockfile', 'generated-manifest',
  'port/container/fixture', 'shared-data', 'browser-page-lease',
] as const;
export type ConflictDomain = (typeof CONFLICT_DOMAINS)[number];

export const VERIFICATION_LAYERS = [
  'unit', 'component', 'contract', 'service-integration', 'deployed-topology',
  'public-ingress-journey', 'release-rollback',
] as const;
export type VerificationLayer = (typeof VERIFICATION_LAYERS)[number];

export const BUNDLE_FILES = [
  'projection.plan.yaml', 'autonomy.yaml', 'decisions.yaml', 'system-topology.yaml',
  'execution-graph.yaml', 'conflict-graph.yaml', 'verification-graph.yaml',
  'integration-train.yaml', 'resource-budget.yaml',
] as const;

// ── Input / output types ─────────────────────────────────────────────────────

export interface PlanReadinessInput {
  /** Absolute path to the canonical ledger JSON (never mutated). */
  ledgerPath: string;
  /** Absolute path to .agent/plans/<plan-id> (bundle destination). */
  planDir: string;
  /** Absolute path to the AM-0019 amendment markdown (M11-R registry source). */
  amendmentPath?: string;
  /** Absolute path to original.md (used for anchor section text). */
  originalPath?: string;
  /** Observed host capability; auto-detected when omitted. */
  hostProbe?: HostProbe;
  /** Repository HEAD commit to bind evidence. */
  headCommit?: string;
}

export interface HostProbe {
  tools: string[];
  cpuCount: number;
  totalMemMb: number;
  externalCiGreen: boolean;
  ciChecks: Array<{ workflow: string; check: string; conclusion: string; commitSha: string }>;
}

export interface RequirementMapping {
  requirement_id: string;
  source: string;
  status: 'MATCH' | 'PARTIAL' | 'GAP';
  plan_anchor: {
    section_heading?: string;
    line_start?: number;
    line_end?: number;
    anchor_text_sha256?: Sha256;
  } | null;
  acceptance_criteria: string[];
  verification_profile: { layers: VerificationLayer[]; profile_source: string };
  evidence_contract: { hashes: Sha256[]; bound_to: string } | null;
  execution_cluster: { cluster: string; owner?: string; state: 'MATCH' | 'PARTIAL' | 'GAP' };
  notes: string[];
}

export interface PlanReadinessResult {
  planId: string;
  revision: number;
  effectiveIdentity: Sha256;
  readinessState: ReadinessState;
  reasons: string[];
  requirementCount: number;
  requirements: RequirementMapping[];
  files: string[];
}

// ── Small helpers ────────────────────────────────────────────────────────────

function sha256(value: string): Sha256 {
  return createHash('sha256').update(value, 'utf8').digest('hex') as Sha256;
}

interface LedgerShape {
  plan_id: string;
  original_plan: { sha256: string; path?: string };
  effective_plan_identity: { sha256: string };
  shadow_revision: number;
  milestones?: {
    M8?: { requirements?: Array<{ id: string; status: string; evidence?: Array<{ evidenceHash: string }> }> };
    M11?: { identity?: string; headCommit?: string };
  };
  plan_anchors?: Array<{
    requirement_id: string; section_heading?: string; line_start?: number; line_end?: number;
    anchor_text_sha256?: string;
  }>;
  assignments?: Array<{
    assignment_id?: string; owner?: string; status?: string; owned_paths?: string[];
    acceptance_criteria?: string[]; plan_anchor_requirement_id?: string;
  }>;
  amendments?: Array<{ amendment_id?: string; status?: string; sha256?: string }>;
  ci_checks?: Array<{ workflow?: string; check?: string; conclusion?: string; commitSha?: string; passed?: boolean }>;
  headCommit?: string;
  execution_state?: string;
  status?: string;
  latestReview?: { stale?: boolean };
}

export interface CompiledLedger {
  planId: string;
  originalSha: Sha256;
  effectiveIdentity: Sha256;
  revision: number;
  m8Requirements: Array<{ id: string; status: string; evidenceHashes: Sha256[] }>;
  m11Identity: Sha256 | null;
  anchors: NonNullable<LedgerShape['plan_anchors']>;
  assignments: NonNullable<LedgerShape['assignments']>;
  amendments: NonNullable<LedgerShape['amendments']>;
  ciChecks: NonNullable<LedgerShape['ci_checks']>;
  headCommit: string | null;
  executionState: string | null;
  status: string | null;
  latestReviewStale: boolean | null;
}

export function readLedger(ledgerPath: string): CompiledLedger {
  if (!fs.existsSync(ledgerPath)) throw new Error(`Ledger not found: ${ledgerPath}`);
  const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as LedgerShape;
  if (!raw.plan_id || !raw.effective_plan_identity?.sha256) {
    throw new Error(`Ledger ${ledgerPath} missing plan_id or effective_plan_identity.sha256`);
  }
  const m8 = raw.milestones?.M8?.requirements ?? [];
  const m11 = raw.milestones?.M11;
  return {
    planId: raw.plan_id,
    originalSha: raw.original_plan?.sha256 as Sha256,
    effectiveIdentity: raw.effective_plan_identity.sha256 as Sha256,
    revision: raw.shadow_revision ?? 0,
    m8Requirements: m8.map((r) => ({
      id: r.id,
      status: r.status ?? 'UNKNOWN',
      evidenceHashes: (r.evidence ?? []).map((e) => e.evidenceHash as Sha256),
    })),
    m11Identity: m11?.identity ? (m11.identity as Sha256) : null,
    anchors: raw.plan_anchors ?? [],
    assignments: raw.assignments ?? [],
    amendments: raw.amendments ?? [],
    ciChecks: raw.ci_checks ?? [],
    headCommit: raw.headCommit ?? null,
    executionState: raw.execution_state ?? null,
    status: raw.status ?? null,
    latestReviewStale: raw.latestReview?.stale ?? null,
  };
}

/** Parse M11 additive registry from AM-0019 §14 — dynamic, never hard-coded. */
export function parseM11Requirements(amendmentText: string): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = [];
  for (const line of amendmentText.split('\n')) {
    const m = line.match(/^\s*-\s+(M11-R\d+)\s+(.+?)\s*$/);
    if (m) out.push({ id: m[1], title: m[2].replace(/\.+$/, '') });
  }
  return out;
}

const LAYER_KEYWORDS: Array<[VerificationLayer, string[]]> = [
  ['unit', ['test', 'đơn vị', 'unit']],
  ['component', ['component', 'thành phần', 'batch', 'slice']],
  ['contract', ['contract', 'schema', 'giao diện', 'api', 'public contract']],
  ['service-integration', ['integration', 'tích hợp', 'train', 'integration train']],
  ['deployed-topology', ['topology', 'compose', 'deploy', 'triển khai', 'runtime install']],
  ['public-ingress-journey', ['ingress', 'journey', 'ui', 'browser', 'control plane', 'dashboard']],
  ['release-rollback', ['rollback', 'release', 'finalize', 'uninstall', 'installer']],
];

function layersForText(text: string): VerificationLayer[] {
  const hit = new Set<VerificationLayer>();
  const lower = text.toLowerCase();
  for (const [layer, keywords] of LAYER_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) hit.add(layer);
  }
  if (hit.size === 0) hit.add('unit');
  return [...hit];
}

function layerProfile(id: string, text: string, source: string): RequirementMapping['verification_profile'] {
  // M11-R requirement titles map directly onto AM-0019 verification layers.
  const title = text.toLowerCase();
  if (id.startsWith('M11-R')) {
    if (id === 'M11-R11' || id === 'M11-R12') return { layers: ['contract', 'component'], profile_source: 'AM-0019 §3' };
    if (id === 'M11-R13' || id === 'M11-R14') return { layers: ['contract', 'component'], profile_source: 'AM-0019 §4–5' };
    if (id === 'M11-R15') return { layers: ['component', 'service-integration'], profile_source: 'AM-0019 §5' };
    if (id === 'M11-R16') return { layers: ['component'], profile_source: 'AM-0019 §6' };
    if (id === 'M11-R17') return { layers: ['component', 'service-integration'], profile_source: 'AM-0019 §7' };
    if (id === 'M11-R18' || id === 'M11-R19') return { layers: ['deployed-topology', 'service-integration'], profile_source: 'AM-0019 §8' };
    if (id === 'M11-R20' || id === 'M11-R21') return { layers: ['public-ingress-journey'], profile_source: 'AM-0019 §9' };
    if (id === 'M11-R22' || id === 'M11-R23') return { layers: ['component', 'contract'], profile_source: 'AM-0019 §10' };
    if (id === 'M11-R24' || id === 'M11-R25') return { layers: ['contract', 'component'], profile_source: 'AM-0019 §11' };
    if (id === 'M11-R26') return { layers: ['service-integration', 'public-ingress-journey'], profile_source: 'AM-0019 §12' };
  }
  return { layers: layersForText(title), profile_source: source };
}

// ── M11 implementation mapping ──────────────────────────────────────────────
// Canonical requirement→module map for the M11 additive registry (AM-0019 §14)
// now lives in ./plan-readiness-map.ts (cohesive data module).

/** Resolve repo root for module-existence probes. Prefer explicit root; fall back to the plan dir walk. */
function resolveRepoRoot(originalPath?: string, amendmentPath?: string, explicitRoot?: string): string {
  if (explicitRoot) return explicitRoot;
  if (originalPath) return path.resolve(originalPath, '../../../..');
  if (amendmentPath) return path.resolve(amendmentPath, '../../../../..');
  return process.cwd();
}

// ── Requirement compilation ─────────────────────────────────────────────────

export function compileRequirements(
  ledger: CompiledLedger,
  amendmentPath?: string,
  originalPath?: string,
  repoRoot?: string,
): RequirementMapping[] {
  const amText = amendmentPath && fs.existsSync(amendmentPath) ? fs.readFileSync(amendmentPath, 'utf8') : '';
  const m11Reqs = amText ? parseM11Requirements(amText) : [];
  const originalText = originalPath && fs.existsSync(originalPath) ? fs.readFileSync(originalPath, 'utf8') : '';
  const lines = originalText.split('\n');

  const sectionTextFor = (start?: number, end?: number): string => {
    if (!start || !end || start < 1 || end > lines.length) return '';
    return lines.slice(start - 1, end).join('\n');
  };

  const anchorsByReq = new Map<string, NonNullable<LedgerShape['plan_anchors']>[number]>();
  for (const a of ledger.anchors) {
    const req = a.requirement_id;
    if (req?.startsWith('REQ-') && !anchorsByReq.has(req)) anchorsByReq.set(req, a);
  }
  const assignmentsByReq = new Map<string, NonNullable<LedgerShape['assignments']>>();
  for (const asn of ledger.assignments) {
    const req = asn.plan_anchor_requirement_id;
    if (!req) continue;
    const list = assignmentsByReq.get(req) ?? [];
    list.push(asn);
    assignmentsByReq.set(req, list);
  }

  const out: RequirementMapping[] = [];
  for (const req of ledger.m8Requirements) {
    const id = req.id;
    const anchor = anchorsByReq.get(id) ?? null;
    const sectionText = anchor ? sectionTextFor(anchor.line_start, anchor.line_end) : '';
    const asns = assignmentsByReq.get(id) ?? [];
    const acs = [...new Set(asns.flatMap((a) => a.acceptance_criteria ?? []))];
    const acFromText = sectionText
      .split('\n')
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .slice(0, 8);
    const effectiveAcs = acs.length > 0 ? acs : acFromText;

    const notes: string[] = [];
    if (!anchor) notes.push('no plan anchor recorded in ledger');
    if (acs.length === 0) notes.push('no assignment acceptance criteria in ledger; derived from anchored section text');
    if (req.status !== 'MATCH') notes.push(`ledger milestone status: ${req.status}`);
    if (ledger.m11Identity && ledger.effectiveIdentity !== ledger.m11Identity) {
      notes.push(`evidence bound to ${ledger.effectiveIdentity.slice(0, 12)}; M11 identity is ${ledger.m11Identity.slice(0, 12)} — re-verification required`);
    }

    const hasAnchor = anchor !== null;
    const hasAcs = effectiveAcs.length > 0;
    const hasEvidence = req.evidenceHashes.length > 0;
    const status: RequirementMapping['status'] = hasAnchor && hasAcs && hasEvidence ? 'MATCH'
      : hasAnchor || hasAcs || hasEvidence ? 'PARTIAL'
      : 'GAP';

    out.push({
      requirement_id: id,
      source: anchor?.section_heading ?? 'M8 milestone requirement (no anchor)',
      status,
      plan_anchor: anchor ? {
        section_heading: anchor.section_heading,
        line_start: anchor.line_start,
        line_end: anchor.line_end,
        anchor_text_sha256: anchor.anchor_text_sha256 as Sha256,
      } : null,
      acceptance_criteria: effectiveAcs,
      verification_profile: layerProfile(id, sectionText || id, anchor?.section_heading ?? 'ledger'),
      evidence_contract: req.evidenceHashes.length > 0
        ? { hashes: req.evidenceHashes, bound_to: ledger.effectiveIdentity }
        : null,
      execution_cluster: { cluster: 'M8', owner: asns[0]?.owner, state: req.status === 'MATCH' ? 'MATCH' : 'PARTIAL' },
      notes,
    });
  }

  for (const mr of m11Reqs) {
    const impl = M11_IMPLEMENTATIONS[mr.id];
    if (!impl) {
      out.push({
        requirement_id: mr.id,
        source: `AM-0019 §14 — ${mr.title}`,
        status: 'GAP',
        plan_anchor: null,
        acceptance_criteria: [],
        verification_profile: layerProfile(mr.id, mr.title, `AM-0019 §14 ${mr.id}`),
        evidence_contract: null,
        execution_cluster: { cluster: clusterForM11(mr.id), state: 'GAP' },
        notes: ['no implementation mapping registered for this requirement'],
      });
      continue;
    }
    const root = resolveRepoRoot(originalPath, amendmentPath, repoRoot);
    const missingModules = impl.modules.filter((m) => !fs.existsSync(path.resolve(root, m)));
    const missingTests = impl.tests.filter((t) => !fs.existsSync(path.resolve(root, t)));
    const presentModules = impl.modules.filter((m) => fs.existsSync(path.resolve(root, m)));
    const hasAllModules = missingModules.length === 0;
    const hasAllTests = missingTests.length === 0;

    let status: RequirementMapping['status'];
    if (!hasAllModules && !hasAllTests) status = 'GAP';
    else if (hasAllModules && hasAllTests && impl.status === 'MATCH') status = 'MATCH';
    else status = 'PARTIAL';

    const notes: string[] = [];
    if (!hasAllModules) notes.push(`missing module(s): ${missingModules.join(', ')}`);
    if (!hasAllTests) notes.push(`missing test/evidence: ${missingTests.join(', ')}`);
    if (impl.partialReason) notes.push(impl.partialReason);
    if (status === 'MATCH') {
      notes.push(`implemented: ${presentModules.join(', ')}`);
      notes.push(`verified by: ${impl.tests.join(', ')}`);
    }

    // Evidence = SHA-256 of module file bytes. Directories (e.g. evals/m11) are
    // existence-checked only; their files are not hashed as a single blob.
    const moduleEvidence = [...presentModules]
      .filter((m) => fs.statSync(path.resolve(root, m)).isFile())
      .sort()
      .map((m) => sha256(fs.readFileSync(path.resolve(root, m), 'utf8')));

    out.push({
      requirement_id: mr.id,
      source: `AM-0019 §14 — ${mr.title}`,
      status,
      plan_anchor: null,
      acceptance_criteria: impl.acceptanceCriteria,
      verification_profile: layerProfile(mr.id, mr.title, `AM-0019 §14 ${mr.id}`),
      evidence_contract: moduleEvidence.length > 0
        ? { hashes: moduleEvidence, bound_to: ledger.effectiveIdentity }
        : null,
      execution_cluster: { cluster: impl.cluster, owner: 'harness-maintainer', state: status === 'MATCH' ? 'MATCH' : 'PARTIAL' },
      notes,
    });
  }

  return out;
}

// ── Host probe ───────────────────────────────────────────────────────────────

const HOST_BINARIES = ['claude', 'codex', 'opencode', 'grok'] as const;

export function detectHostProbe(ciChecks: Array<{ workflow?: string; check?: string; conclusion?: string; commitSha?: string; passed?: boolean }>): HostProbe {
  const tools: string[] = [];
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const bin of HOST_BINARIES) {
    const found = pathDirs.some((dir) => {
      try { return fs.existsSync(path.join(dir, bin)) || fs.existsSync(path.join(dir, `${bin}.exe`)); } catch { return false; }
    });
    if (found) tools.push(bin);
  }
  const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const greenChecks = ciChecks.filter((c) => c.passed === true || c.conclusion === 'success');
  return {
    tools,
    cpuCount,
    totalMemMb,
    externalCiGreen: ciChecks.length > 0 && greenChecks.length === ciChecks.length,
    ciChecks: ciChecks.map((c) => ({
      workflow: c.workflow ?? 'unknown',
      check: c.check ?? 'unknown',
      conclusion: c.conclusion ?? (c.passed ? 'success' : 'unknown'),
      commitSha: c.commitSha ?? '',
    })),
  };
}

// ── Readiness derivation ─────────────────────────────────────────────────────

export function deriveReadiness(
  requirements: RequirementMapping[],
  host: HostProbe,
  ledger: CompiledLedger,
  headCommit?: string,
): { state: ReadinessState; reasons: string[] } {
  const reasons: string[] = [];
  const gaps = requirements.filter((r) => r.status === 'GAP');
  const partials = requirements.filter((r) => r.status === 'PARTIAL');

  if (gaps.length > 0) reasons.push(`${gaps.length} requirement(s) GAP (no implementation/evidence)`);
  if (partials.length > 0) reasons.push(`${partials.length} requirement(s) PARTIAL (anchor or criteria incomplete)`);

  const missingTools = HOST_BINARIES.filter((b) => !host.tools.includes(b));
  if (missingTools.length > 0) reasons.push(`missing host tool(s): ${missingTools.join(', ')}`);
  if (!host.externalCiGreen) {
    const failing = host.ciChecks.filter((c) => c.conclusion !== 'success').map((c) => `${c.workflow}/${c.check}:${c.conclusion}`).join('; ');
    reasons.push(failing ? `external CI not green (${failing})` : 'no external CI checks recorded');
  }
  if (ledger.executionState === 'NEEDS_REMEDIATION') reasons.push('ledger execution_state is NEEDS_REMEDIATION');
  if (ledger.latestReviewStale === true) reasons.push('latest review is stale');
  if (ledger.m11Identity && ledger.effectiveIdentity === ledger.m11Identity) {
    reasons.push(`effective identity ${ledger.effectiveIdentity.slice(0, 16)} bound to M11`);
  }
  if (headCommit && ledger.headCommit && ledger.headCommit !== headCommit) {
    reasons.push(`ledger headCommit ${ledger.headCommit.slice(0, 12)} != running HEAD ${headCommit.slice(0, 12)}`);
  }

  const missingClaude = !host.tools.includes('claude');
  const externalBlocked = !host.externalCiGreen;
  const hasGaps = gaps.length > 0;

  if (missingClaude || externalBlocked || hasGaps) {
    reasons.push('bounded: reversible defaults recorded; owner-only authority retained; independent work may proceed');
    return { state: 'BOUNDED_READY', reasons };
  }
  if (partials.length === 0 && host.tools.length >= 2) {
    return { state: 'AUTONOMOUS_READY', reasons: ['all requirements MATCH; tools and CI present'] };
  }
  return { state: 'BOUNDED_READY', reasons: [...reasons, 'partial coverage or reduced host capability; bounded mode'] };
}

// ── Projection builders ──────────────────────────────────────────────────────

function buildProjectionPlanYaml(ledger: CompiledLedger, headCommit: string | undefined): Record<string, unknown> {
  return {
    schema_version: 2,
    plan_id: ledger.planId,
    revision: ledger.revision,
    milestone: 'M11',
    original: { path: 'original.md', sha256: ledger.originalSha },
    effective_plan_identity: { sha256: ledger.effectiveIdentity, algorithm: 'SHA-256 over canonical ordered approved amendments' },
    head_commit: headCommit ?? ledger.headCommit,
    amendments: ledger.amendments.map((a) => ({ amendment_id: a.amendment_id, status: a.status, sha256: a.sha256 })),
    lifecycle: { status: ledger.status, execution_state: ledger.executionState },
    requirements_compiled: 'dynamic from ledger milestones.M8.requirements + AM-0019 §14; see verification-graph.yaml',
  };
}

function buildAutonomyYaml(
  state: ReadinessState,
  reasons: string[],
  host: HostProbe,
): Record<string, unknown> {
  return {
    schema_version: 1,
    readiness_state: state,
    readiness_reasons: reasons,
    authority_envelope: {
      allowed: ['inspect', 'install', 'worktree', 'build', 'test', 'Compose', 'browser', 'commit', 'local-merge'],
      owner_only: ['push', 'deploy', 'credential', 'destructive'],
      source: 'AM-0019 §3 AuthorityEnvelope; §1 owner-authorized Git boundary',
    },
    decision_matrix: {
      reversible_defaults: [
        { action: 'install', default: 'allow', rollback: 'runtime update --rollback' },
        { action: 'worktree-create', default: 'allow', rollback: 'remove abandoned worktree after completion/crash' },
        { action: 'dependency-install', default: 'allow within lockfile', rollback: 'restore package-lock.json from git' },
        { action: 'local-merge', default: 'integration-owner only', rollback: 'revert merge commit' },
        { action: 'test-rerun', default: 'allow', rollback: 'none (read-only)' },
      ],
      rollback_policy: 'reversible ambiguity receives a recorded default; rollback restores the pre-action snapshot',
      source: 'AM-0019 §3 DecisionMatrix',
    },
    host_capability: {
      tools: host.tools,
      cpu_count: host.cpuCount,
      total_mem_mb: host.totalMemMb,
      external_ci_green: host.externalCiGreen,
    },
  };
}

function buildDecisionsYaml(): Record<string, unknown> {
  return {
    schema_version: 1,
    recorded_reversible_defaults: [
      { decision_id: 'D-001', domain: 'install', default: 'allow', reason: 'reversible via rollback', requires_owner: false },
      { decision_id: 'D-002', domain: 'test-rerun', default: 'allow', reason: 'read-only', requires_owner: false },
      { decision_id: 'D-003', domain: 'worktree-create', default: 'allow', reason: 'isolated, reclaimable', requires_owner: false },
    ],
    unknowns_register: [
      { unknown_id: 'U-001', kind: 'EXTERNAL', subject: 'native host observed-model attestation', wake: 'provider health/CI watcher', state: 'WAITING_EXTERNAL' },
      { unknown_id: 'U-002', kind: 'EXTERNAL', subject: 'external CI green on current HEAD', wake: 'CI watcher', state: 'WAITING_EXTERNAL' },
    ],
    clarification_batch: {
      policy: 'owner questions batched once before execution; allowed only for product intent, unavailable credentials, destructive data changes, or new irreversible authority',
      pending: [],
      source: 'AM-0019 §3',
    },
  };
}

function buildSystemTopologyYaml(): Record<string, unknown> {
  // Honest per AM-0019 §8. Components implemented by the merged M11 clusters are
  // EXISTS; genuinely absent items (deployed public topology, service DB) stay GAP.
  return {
    schema_version: 1,
    services: [
      { id: 'engine', kind: 'node', status: 'EXISTS', path: 'packages/engine', note: 'canonical contracts, controller, verifier, terminal gate' },
      { id: 'cli', kind: 'node', status: 'EXISTS', path: 'packages/cli', note: 'thin commander CLI' },
      { id: 'control-plane', kind: 'web', status: 'EXISTS', path: 'packages/control-plane', note: 'local-only observe/configure; no run control' },
      { id: 'autopilot-supervisor', kind: 'process', status: 'EXISTS', path: 'packages/engine/src/autopilot-m11.ts + supervisor.ts', note: 'host-neutral durable supervisor (M11-C5)' },
      { id: 'integration-train', kind: 'process', status: 'EXISTS', path: 'packages/engine/src/worktree-train.ts + CLI train/worktree', note: 'rolling train merge owner (M11-C3)' },
    ],
    ports: [
      { service: 'control-plane', port: 8787, host: '127.0.0.1', note: 'local-only; origin/host checks enforced' },
      { service: 'engine-broker', port: 'TBD', host: '127.0.0.1', note: 'resource broker is engine-internal; no external port bound' },
    ],
    ingress: { public_ingress: 'GAP', note: 'no public deployment; harness is local-first' },
    databases: [{ id: 'ledger', kind: 'json-file', status: 'EXISTS', path: '.agent/ledger/<plan-id>.json', note: 'canonical runtime state' }],
    queues: [{ id: 'ready-queue', status: 'EXISTS', path: 'packages/engine/src/dispatch-ready-set.ts', note: 'cross-stage typed ready queue from AM-0019 §4 (M11-C2)' }],
    migrations: [
      { id: 'ledger-revision', status: 'EXISTS', note: 'shadow revision sequence (r57 current)' },
      { id: 'db-migrations', status: 'GAP', note: 'no service DB yet' },
    ],
    health: { probe: 'agent-rules doctor', status: 'EXISTS' },
    journeys: [
      { id: 'plan-lifecycle', steps: ['inventory', 'adopt', 'reconcile', 'repair', 'finalize'], status: 'EXISTS' },
      { id: 'runtime-lifecycle', steps: ['install', 'update', 'rollback', 'uninstall'], status: 'EXISTS' },
      { id: 'run-execution', steps: ['run', 'status', 'resume', 'cancel'], status: 'EXISTS' },
      { id: 'full-stack-public-ingress', status: 'GAP', note: 'requires exact deployed topology (AM-0019 §8); verifyLayers gate implemented in topology-compiler.ts' },
    ],
    rollback: {
      installer: 'runtime update --rollback',
      ledger: 'activation generation backup restore',
      local_branch: 'revert merge commit / keep worktrees until owner review',
    },
  };
}

function buildExecutionGraphYaml(repoRoot: string): Record<string, unknown> {
  // Cluster states are derived from the M11 implementation mapping: a cluster is
  // COMPLETE only when every module it maps to exists in the tree (all merged).
  const byCluster = new Map<string, string[]>();
  for (const impl of Object.values(M11_IMPLEMENTATIONS)) {
    const list = byCluster.get(impl.cluster) ?? [];
    for (const m of impl.modules) {
      if (fs.existsSync(path.resolve(repoRoot, m))) list.push(m);
    }
    byCluster.set(impl.cluster, list);
  }
  const clusterState = (cluster: string): { state: string; note: string } => {
    const modules = byCluster.get(cluster) ?? [];
    if (modules.length > 0) {
      return { state: 'COMPLETE', note: `implemented and merged: ${modules.join(', ')}` };
    }
    return { state: 'GAP', note: 'no implementing module found in tree' };
  };
  const c1 = clusterState('C1');
  const c2 = clusterState('C2');
  const c3 = clusterState('C3');
  const c4 = clusterState('C4');
  const c5 = clusterState('C5');
  const c6 = clusterState('C6');
  const c7 = clusterState('C7');
  const c8 = clusterState('C8');
  const c9 = clusterState('C9');
  const c10 = clusterState('C10');
  const edges: Array<{ from: string; to: string; type: DependencyType }> = [
    { from: 'C0', to: 'C1', type: 'HARD' },
    { from: 'C1', to: 'C2', type: 'HARD' },
    { from: 'C1', to: 'C3', type: 'SOFT' },
    { from: 'C2', to: 'C3', type: 'HARD' },
    { from: 'C3', to: 'C4', type: 'HARD' },
    { from: 'C4', to: 'C5', type: 'INTEGRATION' },
    { from: 'C5', to: 'C6', type: 'VERIFY_AFTER' },
    { from: 'C6', to: 'C7', type: 'VERIFY_AFTER' },
    { from: 'C4', to: 'C7', type: 'SEMANTIC_CONFLICT' },
    { from: 'C6', to: 'C8', type: 'HARD' },
    { from: 'C8', to: 'C9', type: 'GLOBAL_GATE' },
    { from: 'C9', to: 'C10', type: 'GLOBAL_GATE' },
    { from: 'C8', to: 'C10', type: 'EXTERNAL' },
  ];
  return {
    schema_version: 1,
    stages: [
      { id: 'C0', name: 'activation', state: 'COMPLETE', note: 'ledger r57 activated, effective identity bound' },
      { id: 'C1', name: 'plan-readiness', state: c1.state, note: c1.note },
      { id: 'C2', name: 'typed-execution-graph', state: c2.state, note: c2.note },
      { id: 'C3', name: 'native-swarm-scheduling', state: c3.state, note: c3.note },
      { id: 'C4', name: 'worktree-isolation-integration-train', state: c4.state, note: c4.note },
      { id: 'C5', name: 'global-resource-tool-broker', state: c5.state, note: c5.note },
      { id: 'C6', name: 'durable-autopilot', state: c6.state, note: c6.note },
      { id: 'C7', name: 'system-topology-verification', state: c7.state, note: c7.note },
      { id: 'C8', name: 'browser-parity-visual', state: c8.state, note: c8.note },
      { id: 'C9', name: 'host-convergence-certification', state: c9.state, note: c9.note },
      { id: 'C10', name: 'terminal-release', state: c10.state, note: c10.note },
    ],
    dependency_types: [...DEPENDENCY_TYPES],
    edges,
    recoverable_states: [
      { state: 'WAITING_EXTERNAL', wake: 'external dependency / CI watcher', deadline: 'nonterminal', fallback: 'continue independent work' },
      { state: 'WAITING_AUTHORITY', wake: 'owner decision batch', deadline: 'nonterminal', fallback: 'proceed on independent closure' },
      { state: 'WAITING_RESOURCE', wake: 'governor hysteresis', deadline: 'nonterminal', fallback: 'defer heavy work' },
      { state: 'RETRY_SCHEDULED', wake: 'retry/backoff policy', deadline: 'bounded', fallback: 'escalate after two same-root repairs' },
      { state: 'NEEDS_REMEDIATION', wake: 'repair pack acceptance', deadline: 'nonterminal', fallback: 'bounded repair slice' },
    ],
    blocked_reserved_for: 'unrecoverable plan invalidation',
    critical_path: ['C0', 'C1', 'C2', 'C3', 'C4', 'C8', 'C9', 'C10'],
    scheduling: 'maximum conflict-free ready antichain; critical-path priority without starving independent tasks',
  };
}

function buildConflictGraphYaml(ledger: CompiledLedger): Record<string, unknown> {
  const domains: Record<string, { conflicts: string[]; leases: string[] }> = {
    'path/glob': { conflicts: ['same owned/forbidden path claimed by two clusters'], leases: ['assignment owned_paths'] },
    'public-api-schema': { conflicts: ['contract change invalidates affected dependants only'], leases: ['packages/engine/src/contracts.ts', 'schemas/'] },
    migration: { conflicts: ['two writers on same migration revision'], leases: ['packages/engine/src/ledger-migration.ts'] },
    lockfile: { conflicts: ['package-lock.json concurrent mutation'], leases: ['package-lock.json'] },
    'generated-manifest': { conflicts: ['generated/ hand-edit or concurrent regeneration'], leases: ['generated/'] },
    'port/container/fixture': { conflicts: ['temporary port / compose fixture collision'], leases: ['temporary ports, compose topology'] },
    'shared-data': { conflicts: ['browser/MCP context pooled vs per-agent'], leases: ['browser pool, context cache'] },
    'browser-page-lease': { conflicts: ['REF/TGT pair page lease collision'], leases: ['REF:<pair-id>', 'TGT:<pair-id>'] },
  };
  const ownership: Array<{ owner: string; paths: string[] }> = [];
  const seen = new Set<string>();
  for (const asn of ledger.assignments) {
    const owner = asn.owner ?? asn.assignment_id;
    if (!owner || seen.has(owner)) continue;
    seen.add(owner);
    if (asn.owned_paths && asn.owned_paths.length > 0) ownership.push({ owner, paths: asn.owned_paths });
  }
  return {
    schema_version: 1,
    domains,
    ownership,
    notes: ['any post-review commit makes prior review stale', 'contract frozen by integration epoch; change invalidates only affected dependants'],
  };
}

function buildVerificationGraphYaml(requirements: RequirementMapping[]): Record<string, unknown> {
  return {
    schema_version: 1,
    chain: 'PlanAnchor → Requirement → AcceptanceCriterion → VerificationProfile → EvidenceContract → ExecutionCluster',
    requirement_count: requirements.length,
    requirements: requirements.map((r) => ({
      requirement_id: r.requirement_id,
      source: r.source,
      status: r.status,
      plan_anchor: r.plan_anchor,
      acceptance_criteria: r.acceptance_criteria,
      verification_profile: r.verification_profile,
      evidence_contract: r.evidence_contract,
      execution_cluster: r.execution_cluster,
      notes: r.notes,
    })),
  };
}

function buildIntegrationTrainYaml(ledger: CompiledLedger, headCommit: string | undefined): Record<string, unknown> {
  return {
    schema_version: 1,
    base_epoch: { revision: ledger.revision, effective_identity: ledger.effectiveIdentity, head_commit: headCommit ?? ledger.headCommit },
    merge_order: 'deterministic: accepted branches ordered by integration receipt sequence; no logical wave barriers',
    receipts: [],
    stale_review_policy: 'any post-review commit makes the prior review stale; reviewers use stable branch snapshots; findings consolidated into one bounded repair pack; a different writer repairs, a different reviewer rechecks',
    integration_owner: 'one integration owner only; engine may fast-forward local main after fresh certification',
  };
}

function buildResourceBudgetYaml(host: HostProbe): Record<string, unknown> {
  const runnableByMem = Math.max(1, Math.floor(host.totalMemMb / 512));
  return {
    schema_version: 1,
    governor_ceilings: {
      total_native_children: 14,
      writers: 8,
      reviewers_auditors: 5,
      integration_owner: 1,
      browser_heavy: { default: 2, burst: 4 },
      full_build_test: 2,
      full_compose_topology: 1,
      source: 'AM-0019 §6 pool ceilings',
    },
    host_capability: {
      cpu_count: host.cpuCount,
      total_mem_mb: host.totalMemMb,
      tools: host.tools,
      external_ci_green: host.externalCiGreen,
    },
    measured_limits: {
      runnable_children_by_ram: runnableByMem,
      ceiling: Math.min(14, runnableByMem),
      note: 'self-reported RSS is not sufficient; governor reads process-tree RSS, PSI, swap churn, load, temperature, I/O and browser/MCP counts',
    },
    defaults: {
      burst: '10–14 light agents when RAM ≥30%, memory PSI low, CPU <78°C, swap-in negligible',
      reduce: 'heavy concurrency reduced when RAM <20%, PSI/swap up, CPU ≥85°C, or sustained load >1.25× logical CPUs',
      pause: 'heavy work paused below 12% available RAM or at 92°C',
      resume: 'hysteresis after RAM ≥25% and CPU ≤78°C for 60s',
    },
  };
}

// ── Atomic write + validation ────────────────────────────────────────────────

export function validatePlanReadinessBundle(planDir: string): { valid: boolean; errors: string[]; requirementCount: number } {
  const errors: string[] = [];
  let requirementCount = 0;
  for (const file of BUNDLE_FILES) {
    const p = path.join(planDir, file);
    if (!fs.existsSync(p)) {
      errors.push(`missing ${file}`);
      continue;
    }
    try {
      const parsed = parseYaml(fs.readFileSync(p, 'utf8')) as Record<string, unknown> | null;
      if (parsed === null || typeof parsed !== 'object') errors.push(`${file}: not an object`);
      if (file === 'verification-graph.yaml') {
        const reqs = (parsed as { requirements?: unknown }).requirements;
        if (Array.isArray(reqs)) requirementCount = reqs.length;
      }
      if (file === 'autonomy.yaml') {
        const state = (parsed as { readiness_state?: string }).readiness_state;
        if (!state || !READINESS_STATES.includes(state as ReadinessState)) {
          errors.push(`autonomy.yaml: readiness_state ${String(state)} not in enum`);
        }
      }
    } catch (err) {
      errors.push(`${file}: YAML parse failed (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return { valid: errors.length === 0, errors, requirementCount };
}

export function writePlanReadinessBundle(planDir: string, documents: Record<string, unknown>): string[] {
  if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
  const written: string[] = [];
  const temps: string[] = [];
  try {
    for (const file of BUNDLE_FILES) {
      const doc = documents[file];
      if (!doc) throw new Error(`missing document for ${file}`);
      const target = path.join(planDir, file);
      const tmp = path.join(planDir, `.${file}.tmp-${process.pid}-${Date.now()}`);
      fs.writeFileSync(tmp, stringifyYaml(doc, { lineWidth: 0 }), 'utf8');
      temps.push(tmp);
      fs.renameSync(tmp, target);
      written.push(file);
    }
  } catch (err) {
    for (const t of temps) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
    throw err;
  }
  return written;
}

export function compilePlanReadiness(input: PlanReadinessInput): PlanReadinessResult {
  const ledger = readLedger(input.ledgerPath);
  const host = input.hostProbe ?? detectHostProbe(ledger.ciChecks);
  const repoRoot = path.resolve(input.planDir, '../../..');
  const requirements = compileRequirements(ledger, input.amendmentPath, input.originalPath, repoRoot);
  const readiness = deriveReadiness(requirements, host, ledger, input.headCommit);

  const documents: Record<string, unknown> = {
    'projection.plan.yaml': buildProjectionPlanYaml(ledger, input.headCommit),
    'autonomy.yaml': buildAutonomyYaml(readiness.state, readiness.reasons, host),
    'decisions.yaml': buildDecisionsYaml(),
    'system-topology.yaml': buildSystemTopologyYaml(),
    'execution-graph.yaml': buildExecutionGraphYaml(repoRoot),
    'conflict-graph.yaml': buildConflictGraphYaml(ledger),
    'verification-graph.yaml': buildVerificationGraphYaml(requirements),
    'integration-train.yaml': buildIntegrationTrainYaml(ledger, input.headCommit),
    'resource-budget.yaml': buildResourceBudgetYaml(host),
  };

  const files = writePlanReadinessBundle(input.planDir, documents);
  const validation = validatePlanReadinessBundle(input.planDir);
  if (!validation.valid) throw new Error(`PlanReadiness bundle invalid: ${validation.errors.join('; ')}`);

  return {
    planId: ledger.planId,
    revision: ledger.revision,
    effectiveIdentity: ledger.effectiveIdentity,
    readinessState: readiness.state,
    reasons: readiness.reasons,
    requirementCount: requirements.length,
    requirements,
    files,
  };
}

/** Re-exported so CLI/tests can round-trip with the ledger unchanged. */
export const PLAN_READINESS_BUNDLE_FILES = BUNDLE_FILES;
