// M11 control-plane views: file-based projections + canonical ledger + observed
// git/evidence state. Read-only. No engine coupling: the engine writes the
// projection YAMLs and ledger; this module only reads them.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ViewMeta {
  planId: string
  projectionDir: string
  sources: string[]
}

function findRoot(): string {
  const configured = process.env.HARNESS_ROOT
  if (configured && fs.existsSync(path.join(configured, 'rules', 'manifest.yaml'))) return path.resolve(configured)
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(__dirname, '..', '..', '..', '..', '..')
}

function readJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function readYaml(p: string): unknown {
  return yaml.load(fs.readFileSync(p, 'utf-8'))
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? v as Record<string, unknown> : {}
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}

function gitRun(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: findRoot(), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Resolve the active plan projection directory (`.agent/plans/<plan-id>`) that
 * carries the M11 projection bundle. Prefer the highest revision. */
export function resolveProjectionDir(): { planId: string; dir: string } {
  const root = findRoot()
  const plansRoot = path.join(root, '.agent', 'plans')
  const dirs = fs.existsSync(plansRoot)
    ? fs.readdirSync(plansRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(plansRoot, e.name))
        .filter(d => fs.existsSync(path.join(d, 'projection.plan.yaml')))
        .sort()
    : []
  if (dirs.length === 0) return { planId: '', dir: '' }
  const dir = dirs[dirs.length - 1]
  const raw = asRecord(readYaml(path.join(dir, 'projection.plan.yaml')))
  return { planId: str(raw.plan_id, path.basename(dir)), dir }
}

function readProjection(proj: { planId: string; dir: string }, name: string, sources: string[]): unknown {
  if (!proj.dir) return null
  const p = path.join(proj.dir, name)
  if (!fs.existsSync(p)) return null
  sources.push(path.relative(findRoot(), p))
  return readYaml(p)
}

function readLedger(proj: { planId: string; dir: string }, sources: string[]): Record<string, unknown> | null {
  if (!proj.planId) return null
  const root = findRoot()
  const p = path.join(root, '.agent', 'ledger', `${proj.planId}.json`)
  if (!fs.existsSync(p)) return null
  sources.push(path.relative(root, p))
  try {
    return asRecord(readJson(p))
  } catch {
    return null
  }
}

const readinessStates = new Set(['AUTONOMOUS_READY', 'BOUNDED_READY', 'OWNER_DECISION_REQUIRED'])

export interface CoverageSummary {
  total: number
  byStatus: Record<string, number>
  requirements: Array<{ requirementId: string; source: string; status: string; cluster: string }>
}

function summarizeCoverage(verification: Record<string, unknown>): CoverageSummary {
  const reqs = asArray(verification.requirements).map(r => {
    const rec = asRecord(r)
    const cluster = asRecord(rec.execution_cluster)
    return {
      requirementId: str(rec.requirement_id, '?'),
      source: str(rec.source, ''),
      status: str(rec.status, 'UNKNOWN').toUpperCase(),
      cluster: str(cluster.cluster, ''),
    }
  })
  const byStatus: Record<string, number> = {}
  for (const r of reqs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  return { total: reqs.length, byStatus, requirements: reqs }
}

export function readinessView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const autonomy = asRecord(readProjection(meta, 'autonomy.yaml', sources))
  const decisions = asRecord(readProjection(meta, 'decisions.yaml', sources))
  const verification = asRecord(readProjection(meta, 'verification-graph.yaml', sources))
  const ledger = readLedger(meta, sources)

  const state = str(autonomy.readiness_state, 'UNKNOWN')
  const coverage = summarizeCoverage(verification)

  // A green readiness state must be evidence-grounded: every requirement
  // MATCH/SUPERSEDED, no ledger NEEDS_REMEDIATION, no open findings, current review.
  const ledgerState = str(ledger?.execution_state ?? ledger?.status, 'UNKNOWN')
  const findings = asArray(ledger?.findings)
  const review = asRecord(ledger?.latestReview)
  const derivedState = !readinessStates.has(state)
    ? 'OWNER_DECISION_REQUIRED'
    : state
  const evidenceGreen = coverage.total > 0
    && Object.keys(coverage.byStatus).every(s => s === 'MATCH' || s === 'SUPERSEDED')
    && ledgerState !== 'NEEDS_REMEDIATION'
    && findings.length === 0
    && review.stale !== true

  return {
    ok: true,
    planId: meta.planId,
    readinessState: derivedState,
    declaredReadiness: state,
    evidenceGreen,
    readinessReasons: asArray(autonomy.readiness_reasons).map(String),
    coverage: {
      ...coverage,
      declaredRequirementCount: num(verification.requirement_count, coverage.total),
    },
    authorityEnvelope: asRecord(autonomy.authority_envelope),
    decisionMatrix: asRecord(autonomy.decision_matrix),
    recordedDecisions: asArray(decisions.recorded_reversible_defaults),
    unknownsRegister: asArray(decisions.unknowns_register),
    clarificationBatch: asRecord(decisions.clarification_batch),
    hostCapability: asRecord(autonomy.host_capability),
    ledger: { executionState: ledgerState, terminalMarkerStatus: str(ledger?.terminalMarkerStatus, '') },
    sources,
  }
}

const BLOCKING_TYPES = new Set(['HARD', 'GLOBAL_GATE'])

export function dagView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const graph = asRecord(readProjection(meta, 'execution-graph.yaml', sources))

  const stages = asArray(graph.stages).map(s => {
    const rec = asRecord(s)
    return { id: str(rec.id), name: str(rec.name), state: str(rec.state, 'GAP'), note: str(rec.note) }
  })
  const edges = asArray(graph.edges).map(e => {
    const rec = asRecord(e)
    return { from: str(rec.from), to: str(rec.to), type: str(rec.type, 'HARD') }
  })
  const stateOf = new Map(stages.map(s => [s.id, s.state]))

  // AM-0019 §4: a stage is ready when it has no unsatisfied HARD or GLOBAL_GATE
  // incoming edge. Other typed edges never block successor work.
  const ready = stages
    .filter(s => s.state !== 'COMPLETE')
    .filter(s => edges.every(e => e.to !== s.id || !BLOCKING_TYPES.has(e.type) || stateOf.get(e.from) === 'COMPLETE'))
    .map(s => s.id)

  const byType: Record<string, number> = {}
  for (const e of edges) byType[e.type] = (byType[e.type] ?? 0) + 1

  return {
    ok: true,
    planId: meta.planId,
    stages,
    edges,
    edgeTypes: Object.keys(byType).sort(),
    edgeCounts: byType,
    criticalPath: asArray(graph.critical_path).map(String),
    readyAntichain: ready,
    recoverableStates: asArray(graph.recoverable_states),
    blockedReservedFor: str(graph.blocked_reserved_for, ''),
    scheduling: str(graph.scheduling, ''),
    sources,
  }
}

export function conflictsView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const graph = asRecord(readProjection(meta, 'conflict-graph.yaml', sources))

  const domains = Object.entries(asRecord(graph.domains)).map(([id, v]) => {
    const rec = asRecord(v)
    return {
      id,
      conflicts: asArray(rec.conflicts).map(String),
      leases: asArray(rec.leases).map(String),
    }
  })

  // Live leases observed from git, not from configuration.
  const gitLeases: string[] = []
  const worktreesRaw = gitRun(['worktree', 'list', '--porcelain'])
  if (worktreesRaw) {
    for (const line of worktreesRaw.split('\n')) {
      if (line.startsWith('worktree ')) gitLeases.push(line.slice('worktree '.length))
    }
  }
  const branchesRaw = gitRun(['branch', '-a', '--format', '%(refname:short)']) ?? ''
  const branches = branchesRaw.split('\n').filter(Boolean)

  return {
    ok: true,
    planId: meta.planId,
    domains,
    ownership: asArray(graph.ownership),
    notes: asArray(graph.notes).map(String),
    liveLeases: { worktrees: gitLeases, branches },
    sources,
  }
}

export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
  dirty: boolean
  untracked: number
}

export function worktreesView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const root = findRoot()

  const raw = gitRun(['worktree', 'list', '--porcelain'])
  const worktrees: WorktreeEntry[] = []
  if (raw) {
    let cur: Partial<WorktreeEntry> | null = null
    for (const line of raw.split('\n')) {
      if (line === '') {
        if (cur?.path) worktrees.push(cur as WorktreeEntry)
        cur = null
        continue
      }
      const [key, ...rest] = line.split(' ')
      const value = rest.join(' ')
      if (!cur) cur = {}
      if (key === 'worktree') cur.path = value
      else if (key === 'HEAD') cur.head = value
      else if (key === 'branch') cur.branch = value.replace(/^refs\/heads\//, '')
      else if (key === 'detached') cur.branch = null
    }
    if (cur?.path) worktrees.push(cur as WorktreeEntry)
  }
  for (const wt of worktrees) {
    const status = gitRun(['-C', wt.path, 'status', '--porcelain'])
    wt.dirty = Boolean(status && status.length > 0)
    wt.untracked = status ? status.split('\n').filter(l => l.startsWith('?? ')).length : 0
  }

  // C3 parallel output location if present: automation/repository-inventory.json
  const inventoryPath = path.join(root, 'automation', 'repository-inventory.json')
  let inventoryOutput: unknown = null
  if (fs.existsSync(inventoryPath)) {
    sources.push(path.relative(root, inventoryPath))
    try { inventoryOutput = readJson(inventoryPath) } catch { inventoryOutput = null }
  }

  const branches = (gitRun(['branch', '-a', '--format', '%(refname:short)']) ?? '').split('\n').filter(Boolean)
  const stashes = (gitRun(['stash', 'list']) ?? '').split('\n').filter(Boolean)

  return {
    ok: true,
    planId: meta.planId,
    worktrees,
    branches,
    stashes,
    integrationTrain: (() => {
      const train = asRecord(readProjection(meta, 'integration-train.yaml', sources))
      return {
        baseEpoch: asRecord(train.base_epoch),
        mergeOrder: str(train.merge_order, ''),
        receipts: asArray(train.receipts),
        staleReviewPolicy: str(train.stale_review_policy, ''),
        integrationOwner: str(train.integration_owner, ''),
      }
    })(),
    inventoryOutput,
    inventorySchema: 'schemas/worktree-inventory.schema.json',
    sources,
  }
}

export interface AgentHostStatus {
  host: string
  state: 'OBSERVED' | 'MISSING' | 'WAITING_EXTERNAL' | 'UNKNOWN'
  reason: string
  receipts: number
  diagnostics: Record<string, unknown> | null
}

const REQUIRED_HOSTS = ['codex', 'claude', 'opencode', 'grok', 'antigravity']

export function agentsView(): Record<string, unknown> {
  const root = findRoot()
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const ledger = readLedger(meta, sources)

  const evidenceDir = path.join(root, '.agent', 'evidence')
  const receipts: unknown[] = []
  if (fs.existsSync(evidenceDir)) {
    for (const entry of fs.readdirSync(evidenceDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const p = path.join(evidenceDir, entry.name)
      try {
        const rec = asRecord(readJson(p))
        receipts.push({ file: entry.name, ...rec })
      } catch { /* unreadable receipt is itself a finding */ }
    }
    if (receipts.length > 0) sources.push(path.relative(root, evidenceDir))
  }

  const attestations = asArray(ledger?.attestations)

  // Host certification diagnostics (native-only advisory) if present.
  let diagnostics: Record<string, unknown> | null = null
  const diagPath = path.join(root, 'certification-diagnostics.json')
  if (fs.existsSync(diagPath)) {
    sources.push(path.relative(root, diagPath))
    try { diagnostics = asRecord(readJson(diagPath)) } catch { diagnostics = null }
  }
  const hostDiags: Record<string, unknown> = {}
  for (const h of asArray(diagnostics?.hosts)) {
    const rec = asRecord(h)
    hostDiags[str(rec.host).toLowerCase()] = rec
  }
  const diagStatus = str(diagnostics?.status, 'UNKNOWN')

  // OBSERVED only from recorded evidence/receipts; WAITING_EXTERNAL when the
  // diagnostics file itself says so; never derived from configuration.
  const hosts: AgentHostStatus[] = REQUIRED_HOSTS.map(host => {
    const hostReceipts = receipts.filter(r => {
      const rec = asRecord(r)
      const author = asRecord(rec.author)
      const routing = asRecord(rec.routing)
      return str(author.host).toLowerCase() === host || str(routing.host).toLowerCase() === host
    })
    const diag = hostDiags[host] as Record<string, unknown> | undefined
    const installed = asRecord(diag?.installed)
    const observed = hostReceipts.length > 0
    if (observed) {
      return { host, state: 'OBSERVED' as const, reason: `${hostReceipts.length} recorded receipt(s)`, receipts: hostReceipts.length, diagnostics: diag ?? null }
    }
    if (diag && installed.state === 'OBSERVED') {
      return { host, state: 'WAITING_EXTERNAL' as const, reason: 'installed; awaiting observed-model attestation', receipts: 0, diagnostics: diag }
    }
    if (diag) {
      return { host, state: 'MISSING' as const, reason: str(installed.reason, 'no observed receipt; diagnostics present'), receipts: 0, diagnostics: diag }
    }
    return { host, state: 'MISSING' as const, reason: 'no recorded receipt or diagnostics evidence', receipts: 0, diagnostics: null }
  })

  return {
    ok: true,
    planId: meta.planId,
    policy: 'OBSERVED | MISSING | WAITING_EXTERNAL — status never derives from configuration or self-claim',
    hosts,
    receipts,
    attestations,
    diagnostics: diagnostics ? { status: diagStatus, file: 'certification-diagnostics.json' } : null,
    ledgerAttestationCount: attestations.length,
    sources,
  }
}

export function resourcesView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const budget = asRecord(readProjection(meta, 'resource-budget.yaml', sources))
  const root = findRoot()

  // Any runtime governor snapshot files (engine writes them; read-only here).
  const snapshots: Array<{ file: string; data: unknown }> = []
  for (const candidate of ['automation/governor-snapshot.json', '.agent/governor-snapshot.json', '.agent/supervisors/governor-snapshot.json']) {
    const p = path.join(root, candidate)
    if (fs.existsSync(p)) {
      try {
        snapshots.push({ file: candidate, data: readJson(p) })
        sources.push(candidate)
      } catch { /* ignore unreadable snapshot */ }
    }
  }

  return {
    ok: true,
    planId: meta.planId,
    governorCeilings: asRecord(budget.governor_ceilings),
    hostCapability: asRecord(budget.host_capability),
    measuredLimits: asRecord(budget.measured_limits),
    defaults: asRecord(budget.defaults),
    runtimeSnapshots: snapshots,
    sources,
  }
}

export function topologyView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const topo = asRecord(readProjection(meta, 'system-topology.yaml', sources))

  return {
    ok: true,
    planId: meta.planId,
    services: asArray(topo.services),
    ports: asArray(topo.ports),
    ingress: asRecord(topo.ingress),
    databases: asArray(topo.databases),
    queues: asArray(topo.queues),
    migrations: asArray(topo.migrations),
    health: asRecord(topo.health),
    journeys: asArray(topo.journeys),
    rollback: asRecord(topo.rollback),
    sources,
  }
}

export function parityView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const root = findRoot()

  // C7 parity run outputs, if any. No fixed location exists yet, so probe the
  // known candidate locations. Empty result is rendered honestly as a gap.
  const candidates: Array<{ dir: string; files: string[] }> = []
  for (const dir of ['.agent/qa-reports/parity', '.agent/parity', 'evals/parity-output', 'automation/parity-output']) {
    const full = path.join(root, dir)
    if (!fs.existsSync(full)) continue
    sources.push(dir)
    const entries = fs.readdirSync(full, { withFileTypes: true })
      .filter(e => e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.yaml') || e.name.endsWith('.yml')))
      .map(e => e.name)
    candidates.push({ dir, files: entries })
  }

  const runs = (() => {
    const out: unknown[] = []
    for (const c of candidates) {
      for (const f of c.files) {
        const p = path.join(root, c.dir, f)
        try {
          const rec = asRecord(readJson(p))
          out.push({ file: path.join(c.dir, f), ...rec })
        } catch { /* yaml parity files skipped in JSON scan */ }
      }
    }
    return out
  })()

  return {
    ok: true,
    planId: meta.planId,
    present: runs.length > 0,
    runs,
    candidates,
    note: runs.length === 0
      ? 'No C7 parity run output found yet. C7 (browser parity) is GAP in the execution graph.'
      : 'C7 parity run outputs read from recorded files.',
    sources,
  }
}

const WAIT_STATES = new Set(['WAITING_EXTERNAL', 'WAITING_AUTHORITY', 'WAITING_RESOURCE', 'RETRY_SCHEDULED'])

export function waitsView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const ledger = readLedger(meta, sources)
  const decisions = asRecord(readProjection(meta, 'decisions.yaml', sources))
  const graph = asRecord(readProjection(meta, 'execution-graph.yaml', sources))

  const tasks: Array<Record<string, unknown>> = []

  for (const u of asArray(decisions.unknowns_register)) {
    const rec = asRecord(u)
    const state = str(rec.state, 'WAITING_EXTERNAL')
    if (WAIT_STATES.has(state)) {
      tasks.push({
        id: str(rec.unknown_id, 'U-?'),
        kind: `unknown:${str(rec.kind, 'EXTERNAL')}`,
        state,
        subject: str(rec.subject, ''),
        wake: str(rec.wake, ''),
        deadline: 'nonterminal',
        fallback: 'continue independent work',
      })
    }
  }

  for (const c of asArray(ledger?.ci_checks)) {
    const rec = asRecord(c)
    const rerun = str(rec.rerunRequired, '')
    if (rerun) {
      tasks.push({
        id: `ci:${str(rec.check, '')}`,
        kind: 'external-ci',
        state: rerun,
        subject: `${str(rec.workflow, '')}/${str(rec.check, '')} @ ${str(rec.commitSha, '').slice(0, 12)}`,
        wake: 'CI watcher',
        deadline: 'nonterminal',
        fallback: str(rec.note, ''),
      })
    }
  }

  for (const s of asArray(graph.recoverable_states)) {
    const rec = asRecord(s)
    tasks.push({
      id: `policy:${str(rec.state, '')}`,
      kind: 'recoverable-state-policy',
      state: str(rec.state, ''),
      subject: str(rec.state, ''),
      wake: str(rec.wake, ''),
      deadline: str(rec.deadline, ''),
      fallback: str(rec.fallback, ''),
    })
  }

  return {
    ok: true,
    planId: meta.planId,
    tasks,
    byState: Array.from(WAIT_STATES).map(s => ({ state: s, count: tasks.filter(t => t.state === s).length })),
    sources,
  }
}

export function gatesView(): Record<string, unknown> {
  const meta = resolveProjectionDir()
  const sources: string[] = []
  const ledger = readLedger(meta, sources)
  const verification = asRecord(readProjection(meta, 'verification-graph.yaml', sources))

  const executionState = str(ledger?.execution_state ?? ledger?.status, 'UNKNOWN')
  const terminalMarkerStatus = str(ledger?.terminalMarkerStatus, '')
  const terminalMarker = str(ledger?.terminalMarker, '')
  const findings = asArray(ledger?.findings)
  const review = asRecord(ledger?.latestReview)
  const headCommit = str(ledger?.headCommit, '')
  const currentHead = gitRun(['rev-parse', 'HEAD']) ?? ''
  const ci = asArray(ledger?.ci_checks)
  const coverage = summarizeCoverage(verification)

  // Gate list derived from AM-0019 §13 terminal states. Every gate evaluates to
  // a boolean check against recorded evidence; PASS is never derived from config.
  const gates = [
    {
      id: 'GATE-01',
      label: 'Every effective requirement MATCH or approved SUPERSEDED',
      status: coverage.requirements.every(r => r.status === 'MATCH' || r.status === 'SUPERSEDED')
        ? 'PASS' : 'NOT_PASS',
      detail: `coverage MATCH=${coverage.byStatus.MATCH ?? 0} PARTIAL=${coverage.byStatus.PARTIAL ?? 0} GAP=${coverage.byStatus.GAP ?? 0} of ${coverage.total}`,
    },
    {
      id: 'GATE-02',
      label: 'Zero open findings',
      status: findings.length === 0 ? 'PASS' : 'NOT_PASS',
      detail: `${findings.length} open finding(s)`,
    },
    {
      id: 'GATE-03',
      label: 'Independent reviews accept the integrated diff',
      status: review.stale === true || !review.reviewId ? 'NOT_PASS' : 'PASS',
      detail: review.stale === true ? `latest review ${str(review.reviewId, '')} is stale` : str(review.reviewId, 'no recorded review'),
    },
    {
      id: 'GATE-04',
      label: 'CI green on the exact bound HEAD',
      status: ci.length > 0 && ci.every(c => asRecord(c).passed === true) && headCommit === currentHead ? 'PASS' : 'NOT_PASS',
      detail: ci.length === 0 ? 'no CI check recorded' : `${ci.filter(c => asRecord(c).passed !== true).length} failing/pending check(s); ledger HEAD ${headCommit.slice(0, 12)} vs running ${currentHead.slice(0, 12)}`,
    },
    {
      id: 'GATE-05',
      label: 'Evidence binds the exact HEAD and artifact',
      status: (asArray(ledger?.attestations).length > 0 || coverage.requirements.some(r => r.status === 'MATCH')) && headCommit === currentHead ? 'PASS' : 'NOT_PASS',
      detail: `attestations=${asArray(ledger?.attestations).length}; ledger HEAD ${headCommit.slice(0, 12)} vs running ${currentHead.slice(0, 12)}`,
    },
    {
      id: 'GATE-06',
      label: 'No terminal state while execution needs remediation or a gate waits',
      status: executionState === 'NEEDS_REMEDIATION' ? 'NOT_PASS' : (terminalMarkerStatus === 'HISTORICAL_STALE_FOR_M11' ? 'NOT_PASS' : 'PASS'),
      detail: `execution_state=${executionState}; terminalMarkerStatus=${terminalMarkerStatus}`,
    },
  ]
  const passed = gates.filter(g => g.status === 'PASS').length
  const verdict = passed === gates.length ? 'TERMINAL_GATE_PASS' : 'NEEDS_REMEDIATION'

  return {
    ok: true,
    planId: meta.planId,
    verdict,
    executionState,
    terminalMarker,
    terminalMarkerStatus,
    headCommit,
    currentHead,
    gates,
    summary: { pass: passed, total: gates.length },
    sources,
  }
}

export const m11View = {
  readiness: readinessView,
  dag: dagView,
  conflicts: conflictsView,
  worktrees: worktreesView,
  agents: agentsView,
  resources: resourcesView,
  topology: topologyView,
  parity: parityView,
  waits: waitsView,
  gates: gatesView,
}
