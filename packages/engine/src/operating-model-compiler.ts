/**
 * operating-model-compiler.ts — Minimal deterministic parser/compiler.
 *
 * Maps R001-042 / SS01-24 / DoD from the operating model into explicit
 * claim records. Unknown entries are preserved as UNOBSERVED. No ledger
 * or shadow mutation. Same input always produces the same output.
 *
 * Source: docs/architecture/target-operating-model.md (parsed, never hand-edited)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ── Types ──────────────────────────────────────────────────────────────

export type OmProseStatus =
  | 'PLANNED'
  | 'OPERATIONAL'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'VERIFIED'
  | 'NOT_STARTED';

export type EvidenceStatus = 'UNOBSERVED' | 'PARTIAL' | 'MATCH' | 'GAP';

export interface ClaimRecord {
  id: string;
  kind: 'R' | 'SS' | 'DoD';
  description: string;
  proseStatus: OmProseStatus | undefined;
  evidenceStatus: EvidenceStatus;
  planAnchor: string | null;
  evidenceHashes: string[];
  notes: string[];
}

export interface CompilerResult {
  claims: ClaimRecord[];
  rCount: number;
  ssCount: number;
  dodCount: number;
  unobservedCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────

export const OM_SOURCE = 'docs/architecture/target-operating-model.md';

const R_M11_ANCHOR: Record<string, string | null> = {
  'R-001': 'M11-R11', 'R-002': 'M11-R11', 'R-003': 'M11-R11', 'R-004': null,
  'R-005': 'M11-R29', 'R-006': 'M11-R15', 'R-007': 'M11-R15', 'R-008': 'M11-R18',
  'R-009': 'M11-R22', 'R-010': 'M11-R11', 'R-011': 'M11-R27', 'R-012': 'M11-R11',
  'R-013': 'M11-R11', 'R-014': 'M11-R11', 'R-015': 'M11-R23', 'R-016': 'M11-R23',
  'R-017': 'M11-R23', 'R-018': 'M11-R33', 'R-019': 'M11-R27', 'R-020': 'M11-R11',
  'R-021': 'M11-R13', 'R-022': 'M11-R11', 'R-023': 'M11-R17', 'R-024': 'M11-R15',
  'R-025': 'M11-R27', 'R-026': 'M11-R36', 'R-027': 'M11-R35', 'R-028': 'M11-R22',
  'R-029': 'M11-R24', 'R-030': 'M11-R20', 'R-031': 'M11-R22', 'R-032': 'M11-R16',
  'R-033': null, 'R-034': 'M11-R32', 'R-035': 'M11-R34', 'R-036': 'M11-R32',
  'R-037': 'M11-R31', 'R-038': null, 'R-039': 'M11-R29', 'R-040': 'M11-R29',
  'R-041': null, 'R-042': 'M11-R28',
};

const DOD_M11_ANCHOR: Record<string, string | null> = {
  'DoD-01': null, 'DoD-02': null, 'DoD-03': null, 'DoD-04': null,
  'DoD-05': null, 'DoD-06': null, 'DoD-07': null, 'DoD-08': null,
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

const SS_REQUIREMENT_IDS: Record<string, string[]> = {
  'SS-01': ['R-019'], 'SS-02': ['R-020'], 'SS-03': ['R-021'], 'SS-04': ['R-018'],
  'SS-05': ['R-008', 'R-029'], 'SS-06': ['R-005', 'R-039'], 'SS-07': ['R-040'],
  'SS-08': ['R-028'], 'SS-09': ['R-009', 'R-031'], 'SS-10': ['R-022'],
  'SS-11': ['R-023'], 'SS-12': ['R-024'], 'SS-13': ['R-011', 'R-025'],
  'SS-14': ['R-026'], 'SS-15': ['R-027'], 'SS-16': ['R-032'],
  'SS-17': ['R-030'], 'SS-18': ['R-001', 'R-014', 'R-034'],
  'SS-19': ['R-035'], 'SS-20': ['R-033'], 'SS-21': ['R-041'],
  'SS-22': ['R-013', 'R-036'], 'SS-23': ['R-015', 'R-016', 'R-017'],
  'SS-24': ['R-042'],
};

// ── Helpers ────────────────────────────────────────────────────────────

function sha256(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}

function padR(id: string): string {
  const n = parseInt(id, 10);
  return n >= 1 && n <= 42 ? `R-${String(n).padStart(3, '0')}` : id;
}

function padSS(id: string): string {
  const n = parseInt(id, 10);
  return n >= 1 && n <= 24 ? `SS-${String(n).padStart(2, '0')}` : id;
}

// ── Parsing ────────────────────────────────────────────────────────────

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

// ── Evidence probing ───────────────────────────────────────────────────

interface M11Evidence {
  modules: string[];
  tests: string[];
}

const M11_EVIDENCE: Record<string, M11Evidence> = {
  'M11-R11': { modules: ['packages/engine/src/plan-readiness.ts', 'packages/cli/src/commands/plan.ts'], tests: ['packages/engine/test/plan-readiness.test.ts'] },
  'M11-R13': { modules: ['packages/engine/src/plan-readiness.ts', 'packages/engine/src/dispatch-ready-set.ts'], tests: ['packages/engine/test/dispatch-ready-set.test.ts'] },
  'M11-R15': { modules: ['packages/engine/src/worktree-train.ts', 'packages/cli/src/commands/train.ts'], tests: ['packages/engine/test/worktree-train.test.ts'] },
  'M11-R16': { modules: ['packages/engine/src/resource-broker.ts', 'packages/engine/src/resource-governor.ts'], tests: ['packages/engine/test/resource-broker.test.ts'] },
  'M11-R17': { modules: ['packages/engine/src/autopilot-m11.ts', 'packages/engine/src/supervisor.ts'], tests: ['packages/engine/test/autopilot-m11.test.ts'] },
  'M11-R18': { modules: ['packages/engine/src/topology-compiler.ts'], tests: ['packages/engine/test/topology-compiler.test.ts'] },
  'M11-R19': { modules: ['packages/engine/src/topology-compiler.ts', 'packages/engine/src/terminal-gate.ts'], tests: ['packages/engine/test/topology-compiler.test.ts'] },
  'M11-R20': { modules: ['packages/engine/src/parity-runner.ts'], tests: ['packages/engine/test/parity-runner.test.ts'] },
  'M11-R21': { modules: ['packages/engine/src/parity-runner.ts', 'packages/engine/src/parity-pixels.ts'], tests: ['packages/engine/test/visual-harness.test.ts'] },
  'M11-R22': { modules: ['platforms/opencode/adapter.ts', 'platforms/claude/adapter.ts'], tests: ['platforms/opencode/adapter.test.ts'] },
  'M11-R23': { modules: ['packages/engine/src/contracts.ts'], tests: ['packages/engine/test/workflow-validation.test.ts'] },
  'M11-R24': { modules: ['packages/engine/src/terminal-gate.ts', 'packages/engine/src/ledger-activation.ts'], tests: ['packages/engine/test/terminal-gate.test.ts'] },
  'M11-R25': { modules: ['packages/engine/src/supervisor.ts', 'packages/engine/src/worker-adapter.ts'], tests: ['packages/engine/test/supervisor.test.ts'] },
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

  const evidenceHashes = modulesPresent
    .filter((m) => { try { return fs.statSync(path.resolve(repoRoot, m)).isFile(); } catch { return false; } })
    .sort()
    .map((m) => sha256(fs.readFileSync(path.resolve(repoRoot, m), 'utf8')));

  return { status, modulesPresent, testsPresent, evidenceHashes };
}

// ── Compilation ────────────────────────────────────────────────────────

export function compileOMClaims(omText: string, repoRoot: string): CompilerResult {
  const reqs = parseRequirements(omText);
  const subs = parseSubsystems(omText);
  const dods = parseDoD(omText);
  const claims: ClaimRecord[] = [];

  for (const r of reqs) {
    const anchor = R_M11_ANCHOR[r.id] ?? null;
    let evidenceStatus: EvidenceStatus = 'UNOBSERVED';
    let evidenceHashes: string[] = [];
    const notes: string[] = [];

    if (anchor) {
      const probe = probeM11Evidence(repoRoot, anchor);
      evidenceStatus = probe.status;
      evidenceHashes = probe.evidenceHashes;
      if (probe.status === 'UNOBSERVED') notes.push(`no filesystem evidence for anchor ${anchor}`);
      if (probe.status === 'PARTIAL') notes.push(`partial evidence for anchor ${anchor}`);
    } else {
      notes.push('no M11-R plan anchor (operating-model-only requirement)');
      evidenceStatus = 'GAP';
    }

    claims.push({
      id: r.id,
      kind: 'R',
      description: r.description,
      proseStatus: r.status,
      evidenceStatus,
      planAnchor: anchor,
      evidenceHashes,
      notes,
    });
  }

  for (const ss of subs) {
    const reqIds = SS_REQUIREMENT_IDS[ss.id] ?? [];
    const anchor = reqIds.map((rid) => R_M11_ANCHOR[rid]).find((a): a is string => a !== null) ?? null;
    let evidenceStatus: EvidenceStatus = 'UNOBSERVED';
    let evidenceHashes: string[] = [];
    const notes: string[] = [];

    if (anchor) {
      const probe = probeM11Evidence(repoRoot, anchor);
      evidenceStatus = probe.status;
      evidenceHashes = probe.evidenceHashes;
      if (probe.status === 'UNOBSERVED') notes.push(`no filesystem evidence for anchor ${anchor}`);
    } else {
      notes.push('no M11-R plan anchor for this subsystem');
      evidenceStatus = 'GAP';
    }

    if (ss.status === 'NOT_STARTED') {
      evidenceStatus = 'GAP';
      notes.push('subsystem status: NOT_STARTED');
    }

    claims.push({
      id: ss.id,
      kind: 'SS',
      description: ss.subsystem,
      proseStatus: ss.status,
      evidenceStatus,
      planAnchor: anchor,
      evidenceHashes,
      notes,
    });
  }

  for (const dod of dods) {
    const anchor = DOD_M11_ANCHOR[dod.id] ?? null;
    let evidenceStatus: EvidenceStatus = 'UNOBSERVED';
    let evidenceHashes: string[] = [];
    const notes: string[] = [];

    if (anchor) {
      const probe = probeM11Evidence(repoRoot, anchor);
      evidenceStatus = probe.status;
      evidenceHashes = probe.evidenceHashes;
      if (probe.status === 'UNOBSERVED') notes.push(`no filesystem evidence for anchor ${anchor}`);
    } else {
      notes.push('no M11-R plan anchor (process requirement)');
      evidenceStatus = 'GAP';
    }

    claims.push({
      id: dod.id,
      kind: 'DoD',
      description: dod.description,
      proseStatus: undefined,
      evidenceStatus,
      planAnchor: anchor,
      evidenceHashes,
      notes,
    });
  }

  const rCount = reqs.length;
  const ssCount = subs.length;
  const dodCount = dods.length;
  const unobservedCount = claims.filter((c) => c.evidenceStatus === 'UNOBSERVED' || c.evidenceStatus === 'GAP').length;

  return { claims, rCount, ssCount, dodCount, unobservedCount };
}

/** Read the operating model from disk and compile. Throws if file not found. */
export function compileFromRepo(repoRoot: string): CompilerResult {
  const omPath = path.resolve(repoRoot, OM_SOURCE);
  if (!fs.existsSync(omPath)) throw new Error(`Operating model not found: ${omPath}`);
  return compileOMClaims(fs.readFileSync(omPath, 'utf8'), repoRoot);
}
