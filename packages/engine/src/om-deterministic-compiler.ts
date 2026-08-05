/**
 * om-deterministic-compiler.ts — canonical operating-model parser/compiler.
 *
 * Discovers operating model R-001..R-042, SS-01..SS-24, DoD entries
 * from docs/architecture/target-operating-model.md and maps them into canonical
 * plan anchors/claims via the existing claim-registry mechanisms.
 *
 * Ledger-free: all evidence status derives from filesystem probes (module/test existence)
 * and the operating model prose status. No ledger, no amendments required.
 * UNOBSERVED / PARTIAL / GAP are marked honestly where no proof exists.
 *
 * Canonical since consolidation of the duplicate operating-model-crosswalk.ts
 * (ledger-dependent) — this module is the single parser for the operating model.
 * Same input always produces the same output (deterministic).
 *
 * Source: target-operating-model.md (parsed, never hand-edited)
 *ponytail: ceiling = full ledger pipeline (amendments + CI checks + host probe).
 *          Add ledger path when .agent/ledger exists and amend to use plan-readiness.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  EVIDENCE_MATURITIES,
  CLAIM_FORMULAS,
  MATURITY_RANK,
  FORMULA_THRESHOLDS,
  evaluateClaimFormulas,
  type ClaimDefinition,
  type ClaimEvidenceInput,
  type EvidenceMaturity,
} from './plan-readiness.js';

// ── Public enums ──────────────────────────────────────────────────────────────

export { EVIDENCE_MATURITIES, CLAIM_FORMULAS };
export type { ClaimDefinition, ClaimEvidenceInput, EvidenceMaturity };

// ── Source metadata ────────────────────────────────────────────────────────────

export const OM_SOURCE = 'docs/architecture/target-operating-model.md';

/** Operating model prose status (section 12 table column). */
export type OmProseStatus = 'PLANNED' | 'OPERATIONAL' | 'COMPLETED' | 'PARTIAL' | 'VERIFIED' | 'NOT_STARTED';

/** Evidence status derived by the deterministic compiler. */
export type EvidenceStatus = 'UNOBSERVED' | 'PARTIAL' | 'MATCH' | 'GAP';

// ── R→M11-R mapping (canonical; formerly in operating-model-crosswalk.ts) ────

/** R-001..R-042 → M11-R plan anchor. null = GAP (no plan claim maps). */
const R_M11_ANCHOR: Record<string, string | null> = {
  'R-001': 'M11-R11', 'R-002': 'M11-R11', 'R-003': 'M11-R11', 'R-004': null,
  'R-005': 'M11-R29', 'R-006': 'M11-R15', 'R-007': 'M11-R15', 'R-008': 'M11-R18',
  'R-009': 'M11-R22', 'R-010': 'M11-R11', 'R-011': 'M11-R27', 'R-012': 'M11-R11',
  'R-013': 'M11-R11', 'R-014': 'M11-R11', 'R-015': 'M11-R23', 'R-016': 'M11-R23',
  'R-017': 'M11-R23', 'R-018': 'M11-R33', 'R-019': 'M11-R27', 'R-020': 'M11-R11',
  'R-021': 'M11-R13', 'R-022': 'M11-R11', 'R-023': 'M11-R17', 'R-024': 'M11-R15',
  'R-025': 'M11-R27', 'R-026': 'M11-R36', 'R-027': 'M11-R35', 'R-028': 'M11-R22',
  'R-029': 'M11-R24', 'R-030': 'M11-R20', 'R-031': 'M11-R22', 'R-032': 'M11-R16',
  'R-033': null,       'R-034': 'M11-R32', 'R-035': 'M11-R34', 'R-036': 'M11-R32',
  'R-037': 'M11-R31', 'R-038': null,       'R-039': 'M11-R29', 'R-040': 'M11-R29',
  'R-041': null,       'R-042': 'M11-R28',
};

/** DoD item → M11-R anchor. null = GAP (process requirement or not mapped). */
const DOD_M11_ANCHOR: Record<string, string | null> = {
  'DoD-01': null, 'DoD-02': null, 'DoD-03': null, 'DoD-04': null, 'DoD-05': null,
  'DoD-06': null, 'DoD-07': null, 'DoD-08': null,
  'DoD-09': 'M11-R11', 'DoD-10': 'M11-R11', 'DoD-11': 'M11-R32', 'DoD-12': 'M11-R32',
  'DoD-13': 'M11-R23', 'DoD-14': null, 'DoD-15': null, 'DoD-16': 'M11-R23',
  'DoD-17': 'M11-R27', 'DoD-18': 'M11-R11', 'DoD-19': 'M11-R11', 'DoD-20': 'M11-R11',
  'DoD-21': 'M11-R25', 'DoD-22': null, 'DoD-23': null, 'DoD-24': 'M11-R17',
  'DoD-25': 'M11-R17', 'DoD-26': 'M11-R15', 'DoD-27': 'M11-R29', 'DoD-28': null,
  'DoD-29': 'M11-R19', 'DoD-30': 'M11-R27', 'DoD-31': 'M11-R35', 'DoD-32': 'M11-R27',
  'DoD-33': 'M11-R19', 'DoD-34': 'M11-R36', 'DoD-35': 'M11-R22', 'DoD-36': 'M11-R34',
  'DoD-37': 'M11-R20', 'DoD-38': 'M11-R32', 'DoD-39': 'M11-R35', 'DoD-40': 'M11-R31',
  'DoD-41': 'M11-R34', 'DoD-42': 'M11-R27', 'DoD-43': 'M11-R33', 'DoD-44': 'M11-R29',
  'DoD-45': 'M11-R16', 'DoD-46': null, 'DoD-47': null, 'DoD-48': 'M11-R28',
};

// ── M11-R → module/test evidence paths ────────────────────────────────────────

/** M11-R requirement → implementing module and test paths. */
interface M11Evidence {
  modules: string[];
  tests: string[];
}

const M11_EVIDENCE: Record<string, M11Evidence> = {
  'M11-R11': { modules: ['packages/engine/src/plan-readiness.ts', 'packages/cli/src/commands/plan.ts'], tests: ['packages/engine/test/plan-readiness.test.ts'] },
  'M11-R13': { modules: ['packages/engine/src/plan-readiness.ts', 'packages/engine/src/dispatch-ready-set.ts [DELETED S5]'], tests: ['packages/engine/test/dispatch-ready-set.test.ts'] },
  'M11-R15': { modules: ['packages/engine/src/worktree-train.ts [DELETED S5]', 'packages/cli/src/commands/train.ts'], tests: ['packages/engine/test/worktree-train.test.ts'] },
  'M11-R16': { modules: ['packages/engine/src/resource-broker.ts [DELETED S5]', 'packages/engine/src/resource-governor.ts [DELETED S5]'], tests: ['packages/engine/test/resource-broker.test.ts'] },
  'M11-R17': { modules: ['packages/engine/src/autopilot-m11.ts [DELETED S5]', 'packages/engine/src/supervisor.ts [DELETED S5]'], tests: ['packages/engine/test/autopilot-m11.test.ts'] },
  'M11-R18': { modules: ['packages/engine/src/topology-compiler.ts'], tests: ['packages/engine/test/topology-compiler.test.ts'] },
  'M11-R19': { modules: ['packages/engine/src/topology-compiler.ts', 'packages/engine/src/terminal-gate.ts'], tests: ['packages/engine/test/topology-compiler.test.ts'] },
  'M11-R20': { modules: ['packages/engine/src/parity-runner.ts'], tests: ['packages/engine/test/parity-runner.test.ts'] },
  'M11-R21': { modules: ['packages/engine/src/parity-runner.ts', 'packages/engine/src/parity-pixels.ts'], tests: ['packages/engine/test/visual-harness.test.ts'] },
  'M11-R22': { modules: ['platforms/opencode/adapter.ts', 'platforms/claude/adapter.ts'], tests: ['platforms/opencode/adapter.test.ts'] },
  'M11-R23': { modules: ['packages/engine/src/contracts.ts'], tests: ['packages/engine/test/workflow-validation.test.ts'] },
  'M11-R24': { modules: ['packages/engine/src/terminal-gate.ts', 'packages/engine/src/ledger-activation.ts'], tests: ['packages/engine/test/terminal-gate.test.ts'] },
  'M11-R25': { modules: ['packages/engine/src/supervisor.ts [DELETED S5]', 'packages/engine/src/worker-adapter.ts'], tests: ['packages/engine/test/supervisor.test.ts'] },
  'M11-R26': { modules: ['evals/m11'], tests: ['evals/m11/runner.py'] },
  'M11-R27': { modules: ['packages/engine/src/claim-registry.ts'], tests: ['packages/engine/test/claim-registry.test.ts'] },
  'M11-R28': { modules: ['packages/engine/src/evidence-dag.ts', 'packages/engine/src/evidence-packet.ts'], tests: ['packages/engine/test/evidence-dag.test.ts'] },
  'M11-R29': { modules: ['packages/engine/src/review-receipt.ts', 'packages/engine/src/native-session-adapter.ts'], tests: ['packages/engine/test/review-receipt.test.ts'] },
  'M11-R30': { modules: ['packages/engine/src/adversarial-compiler.ts'], tests: ['packages/engine/test/adversarial-compiler.test.ts'] },
  'M11-R31': { modules: ['packages/engine/src/review-independence.ts'], tests: ['packages/engine/test/review-independence.test.ts'] },
  'M11-R32': { modules: ['packages/engine/src/candidate-epoch.ts'], tests: ['packages/engine/test/candidate-epoch.test.ts'] },
  'M11-R33': { modules: ['packages/engine/src/artifact-consistency.ts'], tests: ['packages/engine/test/artifact-consistency.test.ts'] },
  'M11-R34': { modules: ['packages/engine/src/terminal-gate.ts'], tests: ['packages/engine/test/terminal-report.test.ts'] },
  'M11-R35': { modules: ['evals/m11/false_green.py'], tests: ['evals/m11/false_green.py'] },
  'M11-R36': { modules: ['packages/engine/src/calibration.ts'], tests: ['packages/engine/test/calibration.test.ts'] },
};

// ── FS evidence probe ─────────────────────────────────────────────────────────

function sha256(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}

/** Probe filesystem for module + test existence → evidence status. */
function probeM11Evidence(repoRoot: string, m11Id: string): { status: EvidenceStatus; modulesPresent: string[]; testsPresent: string[]; evidenceHashes: string[] } {
  const ev = M11_EVIDENCE[m11Id];
  if (!ev) return { status: 'UNOBSERVED', modulesPresent: [], testsPresent: [], evidenceHashes: [] };

  const modulesPresent = ev.modules.filter((m) => {
    try { return fs.statSync(path.resolve(repoRoot, m)).isFile(); } catch { return false; }
  });
  const testsPresent = ev.tests.filter((t) => {
    try { return fs.existsSync(path.resolve(repoRoot, t)); } catch { return false; }
  });

  const hasAllModules = modulesPresent.length === ev.modules.length;
  const hasAllTests = testsPresent.length === ev.tests.length;
  const hasSome = modulesPresent.length > 0 || testsPresent.length > 0;

  let status: EvidenceStatus;
  if (hasAllModules && hasAllTests) status = 'MATCH';
  else if (hasSome) status = 'PARTIAL';
  else status = 'UNOBSERVED';

  // Hash only regular files (not directories)
  const evidenceHashes = modulesPresent
    .filter((m) => { try { return fs.statSync(path.resolve(repoRoot, m)).isFile(); } catch { return false; } })
    .sort()
    .map((m) => sha256(fs.readFileSync(path.resolve(repoRoot, m), 'utf8')));

  return { status, modulesPresent, testsPresent, evidenceHashes };
}

// ── Parsing ────────────────────────────────────────────────────────────────────

/** Parse R-001..R-042 from section 12 markdown table. */
export function parseRequirements(text: string): Array<{ id: string; source: string; description: string; status: OmProseStatus }> {
  const out: Array<{ id: string; source: string; description: string; status: OmProseStatus }> = [];
  const section12 = text.match(/## 12\. Requirement IDs.*?\n\n([\s\S]*?)(?=\n## |\n#\s*$)/);
  if (!section12) return out;
  for (const line of section12[1].split('\n')) {
    const m = line.match(/^\|\s*R-(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([A-Z_]+)\s*\|/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= 42) {
        out.push({
          id: `R-${m[1].padStart(3, '0')}`,
          source: m[2].trim(),
          description: m[3].trim(),
          status: m[4].trim() as OmProseStatus,
        });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Parse SS-01..SS-24 from section 6 table. */
export function parseSubsystems(text: string): Array<{ id: string; subsystem: string; status: OmProseStatus; milestone: string }> {
  const out: Array<{ id: string; subsystem: string; status: OmProseStatus; milestone: string }> = [];
  const section6 = text.match(/## 6\. Required harness subsystems[\s\S]*?\n\n([\s\S]*?)(?=\n## |\n#\s*$)/);
  if (!section6) return out;
  for (const line of section6[1].split('\n')) {
    const m = line.match(/^\|\s*SS-(\d+)\s*\|\s*([^|]+?)\s*\|\s*([A-Z_]+)\s*\|\s*(M\d+)\s*\|/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= 24) {
        out.push({
          id: `SS-${m[1].padStart(2, '0')}`,
          subsystem: m[2].trim(),
          status: m[3].trim() as OmProseStatus,
          milestone: m[4].trim(),
        });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Parse DoD items from section 8. */
export function parseDoD(text: string): Array<{ id: string; description: string }> {
  const out: Array<{ id: string; description: string }> = [];
  const section8 = text.match(/## 8\. Definition of Done[\s\S]*?\n\n([\s\S]*?)(?=\n## |\n#\s*$)/);
  if (!section8) return out;
  for (const line of section8[1].split('\n')) {
    const m = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (m) {
      const desc = m[2].trim();
      if (desc && desc !== 'Do not return PASS unless:') {
        out.push({ id: `DoD-${String(out.length + 1).padStart(2, '0')}`, description: desc });
      }
    }
  }
  return out;
}

// ── Crosswalk entry ───────────────────────────────────────────────────────────

export interface OMCrosswalkEntry {
  omId: string;
  kind: 'R' | 'SS' | 'DoD';
  planAnchor: string | null;
  description: string;
  /** Deterministically derived status. */
  evidenceStatus: EvidenceStatus;
  proseStatus?: OmProseStatus;
  subsystemStatus?: OmProseStatus;
  /** Filesystem-probed evidence hashes. */
  evidenceHashes: string[];
  /** Files that contributed evidence. */
  modulesPresent: string[];
  testsPresent: string[];
  notes: string[];
}

// ── Compilation ────────────────────────────────────────────────────────────────

/** Deterministic risk tier from subsystem. */
function riskTierForSubsystem(ssId: string): ClaimDefinition['risk_tier'] {
  const t: Record<string, ClaimDefinition['risk_tier']> = {
    'SS-04': 'T-Global', 'SS-09': 'T2', 'SS-12': 'T3', 'SS-17': 'T-Visual',
    'SS-18': 'T3', 'SS-22': 'T-Global', 'SS-23': 'T2', 'SS-24': 'T3',
  };
  return t[ssId] ?? 'T1';
}

/** Verification layers from subsystem. */
function layersForSubsystem(ssId: string): string[] {
  const l: Record<string, string[]> = {
    'SS-01': ['unit', 'contract'], 'SS-02': ['unit', 'component'],
    'SS-03': ['contract', 'component'], 'SS-04': ['contract', 'service-integration'],
    'SS-05': ['contract', 'component'], 'SS-06': ['contract', 'component'],
    'SS-07': ['contract', 'component'], 'SS-08': ['component', 'service-integration'],
    'SS-09': ['contract', 'component'], 'SS-10': ['unit', 'component'],
    'SS-11': ['unit', 'component'], 'SS-12': ['component', 'service-integration'],
    'SS-13': ['contract', 'service-integration'], 'SS-14': ['unit', 'component'],
    'SS-15': ['service-integration'], 'SS-16': ['contract', 'component'],
    'SS-17': ['public-ingress-journey'], 'SS-18': ['release-rollback'],
    'SS-19': ['unit', 'component'], 'SS-20': ['unit', 'contract'],
    'SS-21': ['unit', 'component'], 'SS-22': ['contract', 'release-rollback'],
    'SS-23': ['contract', 'component'], 'SS-24': ['unit', 'component'],
  };
  return l[ssId] ?? ['unit'];
}

/**
 * Compile operating model entries into crosswalk entries using filesystem probing.
 * Ledger-free: evidence derives from module/test file existence checks.
 */
export function compileOMCrosswalk(omText: string, repoRoot: string): OMCrosswalkEntry[] {
  const reqs = parseRequirements(omText);
  const subs = parseSubsystems(omText);
  const dods = parseDoD(omText);
  const entries: OMCrosswalkEntry[] = [];

  // R-001..R-042
  for (const r of reqs) {
    const m11Anchor = R_M11_ANCHOR[r.id] ?? null;
    let evidenceStatus: EvidenceStatus = 'UNOBSERVED';
    let evidenceHashes: string[] = [];
    let modulesPresent: string[] = [];
    let testsPresent: string[] = [];
    const notes: string[] = [];

    if (m11Anchor) {
      const probe = probeM11Evidence(repoRoot, m11Anchor);
      evidenceStatus = probe.status;
      evidenceHashes = probe.evidenceHashes;
      modulesPresent = probe.modulesPresent;
      testsPresent = probe.testsPresent;
      if (probe.status === 'UNOBSERVED') notes.push(`module(s) unobserved for ${m11Anchor}: ${M11_EVIDENCE[m11Anchor]?.modules.join(', ') ?? 'none'}`);
      if (probe.status === 'PARTIAL') notes.push(`partial evidence for ${m11Anchor}: ${probe.modulesPresent.length}/${M11_EVIDENCE[m11Anchor]?.modules.length ?? 0} modules, ${probe.testsPresent.length}/${M11_EVIDENCE[m11Anchor]?.tests.length ?? 0} tests`);
    } else {
      notes.push('no M11-R plan anchor (operating-model-only requirement)');
      evidenceStatus = 'GAP';
    }

    entries.push({
      omId: r.id, kind: 'R', planAnchor: m11Anchor, description: r.description,
      evidenceStatus, proseStatus: r.status, evidenceHashes, modulesPresent, testsPresent, notes,
    });
  }

  // SS-01..SS-24
  const SS_REQ_IDS: Record<string, string[]> = {
    'SS-01': ['R-019'], 'SS-02': ['R-020'], 'SS-03': ['R-021'], 'SS-04': ['R-018'],
    'SS-05': ['R-008', 'R-029'], 'SS-06': ['R-005', 'R-039'], 'SS-07': ['R-040'],
    'SS-08': ['R-028'], 'SS-09': ['R-009', 'R-031'], 'SS-10': ['R-022'],
    'SS-11': ['R-023'], 'SS-12': ['R-024'], 'SS-13': ['R-011', 'R-025'],
    'SS-14': ['R-026'], 'SS-15': ['R-027'], 'SS-16': ['R-032'],
    'SS-17': ['R-030'], 'SS-18': ['R-001', 'R-014', 'R-034'], 'SS-19': ['R-035'],
    'SS-20': ['R-033'], 'SS-21': ['R-041'], 'SS-22': ['R-013', 'R-036'],
    'SS-23': ['R-015', 'R-016', 'R-017'], 'SS-24': ['R-042'],
  };

  for (const ss of subs) {
    const reqIds = SS_REQ_IDS[ss.id] ?? [];
    // Pick the first M11-R anchor for evidence probing
    const m11Anchor = reqIds.map((rid) => R_M11_ANCHOR[rid]).find((a): a is string => a !== null) ?? null;
    let evidenceStatus: EvidenceStatus = 'UNOBSERVED';
    let evidenceHashes: string[] = [];
    let modulesPresent: string[] = [];
    let testsPresent: string[] = [];
    const notes: string[] = [];

    if (m11Anchor) {
      const probe = probeM11Evidence(repoRoot, m11Anchor);
      evidenceStatus = probe.status;
      evidenceHashes = probe.evidenceHashes;
      modulesPresent = probe.modulesPresent;
      testsPresent = probe.testsPresent;
      if (probe.status === 'UNOBSERVED') notes.push(`module(s) unobserved for ${m11Anchor}`);
    } else {
      evidenceStatus = 'GAP';
      notes.push('no M11-R plan anchor for this subsystem');
    }

    // Subsystem with NOT_STARTED status gets GAP regardless of anchor
    if (ss.status === 'NOT_STARTED') {
      evidenceStatus = 'GAP';
      notes.push(`subsystem status: NOT_STARTED`);
    }

    entries.push({
      omId: ss.id, kind: 'SS', planAnchor: m11Anchor, description: ss.subsystem,
      evidenceStatus, subsystemStatus: ss.status, evidenceHashes, modulesPresent, testsPresent, notes,
    });
  }

  // DoD items
  for (const dod of dods) {
    const m11Anchor = DOD_M11_ANCHOR[dod.id] ?? null;
    let evidenceStatus: EvidenceStatus = 'UNOBSERVED';
    let evidenceHashes: string[] = [];
    let modulesPresent: string[] = [];
    let testsPresent: string[] = [];
    const notes: string[] = [];

    if (m11Anchor) {
      const probe = probeM11Evidence(repoRoot, m11Anchor);
      evidenceStatus = probe.status;
      evidenceHashes = probe.evidenceHashes;
      modulesPresent = probe.modulesPresent;
      testsPresent = probe.testsPresent;
      if (probe.status === 'UNOBSERVED') notes.push(`module(s) unobserved for ${m11Anchor}`);
    } else {
      notes.push('no M11-R plan anchor (process/code-quality requirement)');
      evidenceStatus = 'GAP';
    }

    entries.push({
      omId: dod.id, kind: 'DoD', planAnchor: m11Anchor, description: dod.description,
      evidenceStatus, evidenceHashes, modulesPresent, testsPresent, notes,
    });
  }

  return entries;
}

// ── Claim compilation ──────────────────────────────────────────────────────────

/** Compile crosswalk entries into ClaimDefinition for evaluateClaimFormulas. */
export function compileOMClaims(entries: OMCrosswalkEntry[]): ClaimDefinition[] {
  return entries.map((e, idx): ClaimDefinition => {
    const layers = e.kind === 'SS' ? layersForSubsystem(e.omId) : ['unit'];
    const tier: ClaimDefinition['risk_tier'] = e.kind === 'SS' ? riskTierForSubsystem(e.omId) : 'T1';
    const cap = tier === 'T2' || tier === 'T3' || tier === 'T-Global' ? ['specialist'] : [];

    return {
      claim_id: `CLAIM-OM-${e.omId}-1`,
      requirement_id: e.omId,
      plan_anchor: e.planAnchor ?? `${e.kind} entry: ${e.description}`,
      meaning: e.description,
      scope: layers,
      risk_tier: tier,
      positive_invariants: [
        `operating-model crosswalk compiled for ${e.omId} (${e.kind})`,
        `evidence status: ${e.evidenceStatus}`,
        `plan anchor: ${e.planAnchor ?? 'none (GAP)'}`,
        ...(e.evidenceHashes.length > 0 ? [`${e.evidenceHashes.length} file(s) hashed as evidence`] : []),
      ],
      negative_invariants: [
        'no claim claims MATCH without filesystem-probed evidence',
        'no GAP claim marked MATCH',
        'UNOBSERVED means no module or test file was found',
      ],
      required_evidence: layers.flatMap((l) => {
        const le: Record<string, string[]> = {
          'unit': ['unit-test-log'], 'component': ['component-test-log'],
          'contract': ['contract-schema-verification'], 'service-integration': ['integration-run-log'],
          'deployed-topology': ['topology-hash'], 'public-ingress-journey': ['browser-session-recording'],
          'release-rollback': ['release-rollback-log'],
        };
        return le[l] ?? ['requirement-test-log'];
      }),
      required_capabilities: cap,
      freshness_dependencies: [
        { older_evidence: 'review-receipt', fresher_than: 'candidate-epoch' },
        { older_evidence: 'prior-requirement-evidence', fresher_than: 'candidate-epoch' },
      ],
      allowed_deviations: ['approved SUPERSEDED requirement'],
      terminal_weight: tier === 'T-Global' ? 6 : tier === 'T3' ? 5 : tier === 'T2' ? 4 : 3,
    };
  });
}

// ── Evidence input for evaluateClaimFormulas ───────────────────────────────────

/** Convert filesystem-probed evidence status → ClaimEvidenceInput for evaluateClaimFormulas. */
export function evidenceInputForEntry(e: OMCrosswalkEntry): ClaimEvidenceInput {
  if (e.evidenceStatus === 'GAP') return {};
  if (e.evidenceStatus === 'UNOBSERVED') return {};
  // PARTIAL or MATCH: evidence is present
  if (e.evidenceStatus === 'PARTIAL') {
    return { present: true, valid: true, partial: true };
  }
  // MATCH: full evidence
  return {
    present: true, valid: true, fresh: true,
    independently_reproduced: true, terminal_eligible: true,
    capabilities: e.kind === 'SS' && (riskTierForSubsystem(e.omId) === 'T2' || riskTierForSubsystem(e.omId) === 'T3' || riskTierForSubsystem(e.omId) === 'T-Global')
      ? ['specialist'] : [],
  };
}

// ── Deterministic compile entrypoint ──────────────────────────────────────────

export interface CompilerResult {
  entries: OMCrosswalkEntry[];
  claims: ClaimDefinition[];
  rCount: number;
  ssCount: number;
  dodCount: number;
  unmatchedCount: number;
  /** Map entry omId → evaluateClaimFormulas result. */
  formulaSummary: ReturnType<typeof evaluateClaimFormulas>;
  /** Shortcut: formulaState.formulaName = satisfied (boolean). */
  formulaState: Record<string, boolean>;
}

/**
 * Deterministic compile: read operating model → parse → probe filesystem → derive claims → evaluate.
 * Ledger-free. Same input (omText + repoRoot) always produces same output.
 */
export function deterministicCompile(omText: string, repoRoot: string): CompilerResult {
  const entries = compileOMCrosswalk(omText, repoRoot);
  const claims = compileOMClaims(entries);
  const evidenceByClaim: Record<string, ClaimEvidenceInput> = {};
  for (const e of entries) {
    evidenceByClaim[`CLAIM-OM-${e.omId}-1`] = evidenceInputForEntry(e);
  }

  const rCount = entries.filter((e) => e.kind === 'R').length;
  const ssCount = entries.filter((e) => e.kind === 'SS').length;
  const dodCount = entries.filter((e) => e.kind === 'DoD').length;
  const unmatchedCount = entries.filter((e) => e.evidenceStatus === 'UNOBSERVED' || e.evidenceStatus === 'GAP').length;

  const formulaSummary = evaluateClaimFormulas(claims, evidenceByClaim);

  return {
    entries,
    claims,
    rCount,
    ssCount,
    dodCount,
    unmatchedCount,
    formulaSummary,
    formulaState: formulaSummary.formulaState,
  };
}

/** Read operating model and compile. Throws if file not found. */
export function compileFromRepo(repoRoot: string): CompilerResult {
  const omPath = path.resolve(repoRoot, OM_SOURCE);
  if (!fs.existsSync(omPath)) throw new Error(`Operating model not found: ${omPath}`);
  return deterministicCompile(fs.readFileSync(omPath, 'utf8'), repoRoot);
}
