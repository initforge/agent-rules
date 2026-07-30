import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { verifyTerminalGate, type TerminalGateResult } from '@initforge/agent-rules-engine/terminal-gate'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

const ROOT = (() => {
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(__dirname, '..', '..', '..')
})()

function harnessRoot(): string {
  const configured = process.env.HARNESS_ROOT
  if (configured && fs.existsSync(path.join(configured, 'rules', 'manifest.yaml'))) return path.resolve(configured)
  return ROOT
}

interface C4Component {
  name: string
  kind: string
  description: string
  technology?: string
  tags?: string[]
  status: string
}

interface C4Container {
  name: string
  kind: string
  description: string
  technology: string
  status: string
  components: C4Component[]
}

interface C4System {
  name: string
  description: string
  status: string
}

interface C4Relationship {
  source: string
  target: string
  label: string
  technology?: string
}

interface C4ContextData {
  scope: string
  systems: C4System[]
  externalSystems: C4System[]
  relationships: C4Relationship[]
}

interface C4CodeItem {
  name: string
  kind: string
  description: string
  file: string
  status: string
}

const CANONICAL_DIMENSIONS = [
  { id: 'd01', label: 'Context Routing', description: 'Canonical context loaded via route-based manifest' },
  { id: 'd02', label: 'Plan Identity Integrity', description: 'planId validation, SHA-256 aggregation, integrity checks' },
  { id: 'd03', label: 'Evidence Binding', description: 'Plan-anchor binding with cryptographic evidence hashes' },
  { id: 'd04', label: 'Amendment Tracking', description: 'Ordered amendment manifest, tombstone-aware, ledger sync' },
  { id: 'd05', label: 'Shadow Hash Verification', description: 'Disk-to-ledger shadow hash comparison with allowlist' },
  { id: 'd06', label: 'Reconciliation Accuracy', description: 'Requirement-level reconciliation matrix with status tracking' },
  { id: 'd07', label: 'Verification Claims Coverage', description: 'Claim pass/fail/blocked/unverified aggregation per plan' },
  { id: 'd08', label: 'Batch Execution', description: 'Task batch status tracking with DAG fallback rendering' },
  { id: 'd09', label: 'Attestation Completeness', description: 'Host, capability, and model attestation capture' },
  { id: 'd10', label: 'Audit Trail Integrity', description: 'Mutation audit with old/new hash and backup path' },
  { id: 'd11', label: 'Path Traversal Protection', description: 'safeResolve with null-byte, absolute, and ../ rejection' },
  { id: 'd12', label: 'Symlink Protection', description: 'O_NOFOLLOW, lstat/open identity verification, swap detection' },
  { id: 'd13', label: 'Schema Validation Rigor', description: 'AJV schema validation for mutation targets' },
  { id: 'd14', label: 'C4 Visualization Maturity', description: 'Context/container/component/code views with ARIA roles' },
  { id: 'd15', label: 'Multi-Platform Support', description: 'Platform adapters with runtime.yaml contracts' },
  { id: 'd16', label: 'API Security Posture', description: 'Auth fail-closed, timingSafeEqual, rate limiting, CORS' },
  { id: 'd17', label: 'Telemetry & Monitoring', description: 'Telemetry import with secrets redaction, health minimal' },
  { id: 'd18', label: 'Release Readiness', description: 'v2.0 release pipeline, CI quality gates, certification' },
]

function buildC4Context(): C4ContextData {
  return {
    scope: 'Agent Rules — opinionated context-management harness for AI coding assistants',
    systems: [
      { name: 'agent-rules', description: 'Canonical ledger-driven harness for agent context, planning, and verification', status: 'active' },
    ],
    externalSystems: [
      { name: 'Developer', description: 'Human user issuing instructions via CLI or dashboard', status: 'active' },
      { name: 'AI Coding Assistant', description: 'LLM-powered agent (Claude, etc.) reading/writing agent-rules context', status: 'active' },
      { name: 'Git Repository', description: 'Version-controlled store for rules, plans, and ledger artifacts', status: 'active' },
      { name: 'File System', description: 'Local disk for runtime mirrors, backups, and cache', status: 'active' },
    ],
    relationships: [
      { source: 'Developer', target: 'agent-rules', label: 'instructs via CLI or web UI' },
      { source: 'AI Coding Assistant', target: 'agent-rules', label: 'reads rules, writes plan evidence' },
      { source: 'agent-rules', target: 'Git Repository', label: 'loads/saves canonical context' },
      { source: 'agent-rules', target: 'File System', label: 'reads/writes ledger, backups' },
    ],
  }
}

function buildC4Containers(): C4Container[] {
  const containers: C4Container[] = [
    {
      name: 'Control Plane',
      kind: 'Web Application',
      description: 'Local dashboard and REST API for monitoring and management',
      technology: 'TypeScript, React, Express',
      status: 'active',
      components: [
        { name: 'API Routes', kind: 'HTTP Endpoint', description: 'RESTful endpoints for config, health, plans, mutations, audit, runs', tags: ['express'], status: 'active' },
        { name: 'Services', kind: 'Service Module', description: 'Business logic: reader, writer, differ, validator, safety, auditor', tags: ['typescript'], status: 'active' },
        { name: 'Database Layer', kind: 'Data Access', description: 'SQLite persistence via sql.js for runs, telemetry, audit log', technology: 'SQLite', tags: ['sql.js'], status: 'active' },
        { name: 'Client UI', kind: 'Single-Page App', description: 'React-based dashboard with architecture, plan workspace, and health views', technology: 'React 18', tags: ['react', 'vite'], status: 'active' },
        { name: 'Middleware', kind: 'Request Filter', description: 'Auth, CORS, error handling, path traversal guards', tags: ['express'], status: 'active' },
      ],
    },
    {
      name: 'CLI',
      kind: 'Command-Line Tool',
      description: 'Cross-platform CLI for plan validation, evidence binding, and status checks',
      technology: 'TypeScript, Node.js',
      status: 'active',
      components: [
        { name: 'Commands', kind: 'CLI Command', description: 'validate, bind, status, check, diff subcommands', tags: ['commander'], status: 'active' },
        { name: 'Engine Adapter', kind: 'Library', description: 'Thin wrapper calling engine package for plan integrity verification', tags: ['engine'], status: 'active' },
      ],
    },
    {
      name: 'Engine',
      kind: 'Library',
      description: 'Canonical plan-identity verification, amendment ordering, shadow-hash computation',
      technology: 'TypeScript',
      status: 'active',
      components: [
        { name: 'Plan Identity', kind: 'Module', description: 'planId validation, integrity checks, effective SHA-256 aggregation', tags: ['core'], status: 'active' },
        { name: 'Contracts', kind: 'Module', description: 'TypeScript interfaces for WorkLedger, PortablePlan, amendments', tags: ['types'], status: 'active' },
        { name: 'Manifest Builder', kind: 'Module', description: 'Build and validate amendments manifest JSON', tags: ['core'], status: 'active' },
      ],
    },
  ]

  const platformDir = path.join(harnessRoot(), 'platforms')
  if (fs.existsSync(platformDir)) {
    const platforms = fs.readdirSync(platformDir).filter(f => fs.statSync(path.join(platformDir, f)).isDirectory())
    for (const p of platforms) {
      containers.push({
        name: `Platform: ${p}`,
        kind: 'Runtime Adapter',
        description: `Platform-specific contract bindings for ${p}`,
        technology: 'various',
        status: 'active',
        components: [],
      })
    }
  }

  return containers
}

function buildC4Code(scope?: string): C4CodeItem[] {
  const root = scope ? path.join(harnessRoot(), scope) : path.join(__dirname, '..')
  const codeItems: C4CodeItem[] = []

  function walk(dir: string, basePath: string) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('node_modules') && !entry.name.startsWith('dist') && !entry.name.startsWith('.') && !entry.name.startsWith('backups') && !entry.name.startsWith('data')) {
        walk(full, basePath)
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        const rel = path.relative(root, full)
        const name = entry.name.replace(/\.(ts|tsx)$/, '')
        const kind = entry.name.endsWith('.tsx') ? 'Component' : 'Module'
        const filePath = path.relative(basePath || root, full)
        codeItems.push({
          name,
          kind,
          description: rel,
          file: filePath,
          status: 'active',
        })
      }
    }
  }

  walk(root, scope || path.basename(root))
  return codeItems
}

interface ScorecardEvidence {
  dimensions: Record<string, { score: number; maxScore: number; status: string }>
  commit?: string
  branch?: string
}

interface GitState {
  head: string
  branch: string
  dirty: boolean
}

interface LedgerTruth {
  planId: string
  status: string
  executionState: string
  passed: boolean
  failedGates: string[]
}

interface OperationalTruth {
  status: 'healthy' | 'degraded' | 'unknown'
  source: 'canonical-ledger'
  ledgerDirectory: string
  ledgers: LedgerTruth[]
  head?: string
  branch?: string
  dirty: boolean
  reasons: string[]
}

function gitState(root: string): GitState | null {
  try {
    const run = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return { head: run(['rev-parse', 'HEAD']), branch: run(['branch', '--show-current']), dirty: run(['status', '--porcelain']).length > 0 }
  } catch {
    return null
  }
}

function canonicalLedgerTruth(root: string): OperationalTruth {
  const ledgerDirectory = path.join(root, '.agent', 'ledger')
  const git = gitState(root)
  const reasons: string[] = []
  const ledgers: LedgerTruth[] = []

  if (!git) reasons.push('GIT_STATE_UNAVAILABLE')
  if (!fs.existsSync(ledgerDirectory)) reasons.push('LEDGER_DIRECTORY_MISSING')
  else {
    const files = fs.readdirSync(ledgerDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name))
    if (files.length === 0) reasons.push('LEDGER_MISSING')
    for (const entry of files) {
      const ledgerPath = path.join(ledgerDirectory, entry.name)
      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as Record<string, unknown>
      } catch {
        ledgers.push({ planId: path.basename(entry.name, '.json'), status: 'INVALID', executionState: 'INVALID', passed: false, failedGates: ['LEDGER_INVALID'] })
        reasons.push(`LEDGER_INVALID:${entry.name}`)
        continue
      }
      let gate: TerminalGateResult | null = null
      if (git) {
        try {
          gate = verifyTerminalGate(ledgerPath, git.head)
        } catch {
          gate = null
        }
      }
      const failedGates = gate?.failedGates ?? ['LEDGER_UNVERIFIABLE']
      const passed = gate?.passed === true
      ledgers.push({
        planId: typeof raw.plan_id === 'string' ? raw.plan_id : path.basename(entry.name, '.json'),
        status: typeof raw.status === 'string' ? raw.status : 'UNKNOWN',
        executionState: typeof raw.execution_state === 'string' ? raw.execution_state : (typeof raw.status === 'string' ? raw.status : 'UNKNOWN'),
        passed,
        failedGates,
      })
      if (!passed) reasons.push(`LEDGER_GATE_FAILED:${entry.name}`)
    }
  }

  if (git?.dirty) reasons.push('WORKTREE_DIRTY')
  const healthy = Boolean(git) && !git!.dirty && ledgers.length > 0 && ledgers.every(ledger => ledger.passed)
  return {
    status: healthy ? 'healthy' : (ledgers.length === 0 ? 'unknown' : 'degraded'),
    source: 'canonical-ledger',
    ledgerDirectory,
    ledgers,
    head: git?.head,
    branch: git?.branch,
    dirty: git?.dirty ?? false,
    reasons,
  }
}

function loadScorecardEvidence(): ScorecardEvidence | null {
  // Local-only override lets tests prove the unknown state without mutating
  // canonical evidence. Production defaults to the real repository artifact.
  const evidencePath = process.env.C4_SCORECARD_EVIDENCE_PATH
    ? path.resolve(process.env.C4_SCORECARD_EVIDENCE_PATH)
    : path.join(harnessRoot(), 'automation', 'scorecard-evidence.json')
  if (!fs.existsSync(evidencePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'))
    const dims = raw?.dimensions
    if (!Array.isArray(dims)) return null
    const dimensions: Record<string, { score: number; maxScore: number; status: string }> = {}
    for (const d of dims) {
      if (d?.id) {
        dimensions[d.id] = { score: d.score ?? 0, maxScore: d.maxScore ?? 0, status: d.status || 'fail' }
      }
    }
    return {
      dimensions,
      commit: typeof raw?._git?.commit === 'string' ? raw._git.commit : undefined,
      branch: typeof raw?._git?.branch === 'string' ? raw._git.branch : undefined,
    }
  } catch {
    return null
  }
}

router.get('/context', (_req: Request, res: Response) => {
  try {
    const data = buildC4Context()
    res.json({ ok: true, data })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

router.get('/containers', (_req: Request, res: Response) => {
  try {
    const data = buildC4Containers()
    res.json({ ok: true, data, total: data.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

router.get('/components', (req: Request, res: Response) => {
  try {
    const container = (req.query.container as string) || ''
    const allContainers = buildC4Containers()
    if (container) {
      const found = allContainers.find(c => c.name === container)
      if (!found) {
        res.status(404).json({ ok: false, error: `Container "${container}" not found` })
        return
      }
      res.json({ ok: true, data: found.components, container: found.name })
      return
    }
    const allComponents = allContainers.flatMap(c => c.components.map(comp => ({ ...comp, container: c.name })))
    res.json({ ok: true, data: allComponents, total: allComponents.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

router.get('/code', (req: Request, res: Response) => {
  try {
    const scope = (req.query.scope as string) || ''
    const data = buildC4Code(scope || undefined)
    res.json({ ok: true, data, total: data.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

router.get('/scorecard', (_req: Request, res: Response) => {
  try {
    const evidence = loadScorecardEvidence()
    const evidencePresent = evidence !== null
    const evidenceMeaningful = evidencePresent && Object.values(evidence.dimensions).some(e => (e.score ?? 0) > 0)
    const operational = canonicalLedgerTruth(harnessRoot())
    const scorecardFreshness = !evidenceMeaningful
      ? 'unverified'
      : evidence!.commit !== operational.head || (evidence!.branch && evidence!.branch !== operational.branch)
        ? 'stale'
        : 'current'
    const dimensions = CANONICAL_DIMENSIONS.map(d => {
      const ev = evidence?.dimensions[d.id]
      if (!evidenceMeaningful) {
        return { id: d.id, label: d.label, description: d.description, score: 0, maxScore: 0, status: 'unknown' }
      }
      return {
        id: d.id,
        label: d.label,
        description: d.description,
        score: ev?.score ?? 0,
        maxScore: ev?.maxScore ?? 0,
        status: ev?.status ?? 'fail',
      }
    })
    const passCount = dimensions.filter(d => d.status === 'pass').length
    const warnCount = dimensions.filter(d => d.status === 'warn').length
    const failCount = dimensions.filter(d => d.status === 'fail').length
    const unknownCount = dimensions.filter(d => d.status === 'unknown').length
    const overallScore = dimensions.reduce((s, d) => s + d.score, 0)
    const overallMax = dimensions.reduce((s, d) => s + d.maxScore, 0)
    const overallPct = overallMax > 0 ? Math.round((overallScore / overallMax) * 100) : 0
    // Scorecard evidence enriches canonical ledger truth; it cannot promote an
    // unverified, stale, foreign, or dirty operational state to healthy.
    const health = !evidenceMeaningful ? 'unknown'
      : operational.status === 'healthy' && scorecardFreshness === 'current' && overallPct >= 80
        ? 'healthy'
        : 'degraded'
    res.json({
      ok: true,
      data: {
        name: 'AM0015 Maturity Assessment',
        description: '18 agent-maturity dimensions across the harness',
        health,
        evidencePresent: evidenceMeaningful,
        scorecardFreshness,
        operational,
        overall: { score: overallScore, maxScore: overallMax, pct: overallPct },
        summary: { pass: passCount, warn: warnCount, fail: failCount, unknown: unknownCount, total: dimensions.length },
        dimensions,
      },
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

router.get('/health', (_req: Request, res: Response) => {
  const root = harnessRoot()
  const rulesExist = fs.existsSync(path.join(root, 'rules', 'manifest.yaml'))
  if (!rulesExist) {
    res.json({ ok: false, status: 'unhealthy', error: 'rules/manifest.yaml missing', timestamp: new Date().toISOString() })
    return
  }
  const operational = canonicalLedgerTruth(root)
  res.json({ ok: operational.status === 'healthy', status: operational.status, operational, timestamp: new Date().toISOString() })
})

export default router
