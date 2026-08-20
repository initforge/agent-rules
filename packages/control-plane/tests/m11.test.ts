import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import request from 'supertest'
import { app } from '../src/server/app'
import { getDb, closeDb } from '../src/db'

const PLAN_ID = 'm11-view-fixture'

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()
}

const AUTONOMY_YAML = `
schema_version: 1
readiness_state: BOUNDED_READY
readiness_reasons:
  - requirement(s) GAP (no implementation/evidence)
  - ledger execution_state is NEEDS_REMEDIATION
  - latest review is stale
authority_envelope:
  allowed: [inspect, install, worktree, build, test, Compose, browser, commit, local-merge]
  owner_only: [push, deploy, credential, destructive]
  source: AM-0019 §3
decision_matrix:
  reversible_defaults:
    - action: install
      default: allow
      rollback: runtime update --rollback
  rollback_policy: reversible ambiguity receives a recorded default
  source: AM-0019 §3
host_capability:
  tools: [claude, opencode, grok]
  cpu_count: 20
  total_mem_mb: 15653
  external_ci_green: false
`

const DECISIONS_YAML = `
schema_version: 1
recorded_reversible_defaults:
  - decision_id: D-001
    domain: install
    default: allow
    reason: reversible via rollback
    requires_owner: false
unknowns_register:
  - unknown_id: U-001
    kind: EXTERNAL
    subject: native host observed-model attestation
    wake: provider health/CI watcher
    state: WAITING_EXTERNAL
clarification_batch:
  policy: owner questions batched once before execution
  pending: []
  source: AM-0019 §3
`

const EXECUTION_GRAPH_YAML = `
schema_version: 1
stages:
  - id: C0
    name: activation
    state: COMPLETE
  - id: C1
    name: plan-readiness
    state: IN_PROGRESS
  - id: C2
    name: typed-execution-graph
    state: GAP
  - id: C3
    name: native-swarm-scheduling
    state: GAP
  - id: C4
    name: worktree-isolation-integration-train
    state: GAP
  - id: C5
    name: global-resource-tool-broker
    state: GAP
  - id: C6
    name: durable-autopilot
    state: GAP
  - id: C7
    name: system-topology-verification
    state: GAP
  - id: C8
    name: browser-parity-visual
    state: GAP
  - id: C9
    name: host-convergence-certification
    state: GAP
  - id: C10
    name: terminal-release
    state: GAP
dependency_types: [HARD, SOFT, VERIFY_AFTER, SEMANTIC_CONFLICT, INTEGRATION, GLOBAL_GATE, EXTERNAL]
edges:
  - {from: C0, to: C1, type: HARD}
  - {from: C1, to: C2, type: HARD}
  - {from: C1, to: C3, type: SOFT}
  - {from: C2, to: C3, type: HARD}
  - {from: C3, to: C4, type: HARD}
  - {from: C4, to: C5, type: INTEGRATION}
  - {from: C5, to: C6, type: VERIFY_AFTER}
  - {from: C6, to: C7, type: VERIFY_AFTER}
  - {from: C4, to: C7, type: SEMANTIC_CONFLICT}
  - {from: C6, to: C8, type: HARD}
  - {from: C8, to: C9, type: GLOBAL_GATE}
  - {from: C9, to: C10, type: GLOBAL_GATE}
  - {from: C8, to: C10, type: EXTERNAL}
recoverable_states:
  - {state: WAITING_EXTERNAL, wake: external dependency / CI watcher, deadline: nonterminal, fallback: continue independent work}
  - {state: WAITING_AUTHORITY, wake: owner decision batch, deadline: nonterminal, fallback: proceed on independent closure}
  - {state: NEEDS_REMEDIATION, wake: repair pack acceptance, deadline: nonterminal, fallback: bounded repair slice}
blocked_reserved_for: unrecoverable plan invalidation
critical_path: [C0, C1, C2, C3, C4, C8, C9, C10]
scheduling: maximum conflict-free ready antichain; critical-path priority without starving independent tasks
`

const CONFLICT_GRAPH_YAML = `
schema_version: 1
domains:
  path/glob:
    conflicts:
      - same owned/forbidden path claimed by two clusters
    leases:
      - assignment owned_paths
  lockfile:
    conflicts:
      - package-lock.json concurrent mutation
    leases:
      - package-lock.json
  browser-page-lease:
    conflicts:
      - REF/TGT pair page lease collision
    leases:
      - REF:<pair-id>
      - TGT:<pair-id>
ownership:
  - owner: baseline-repair
    paths:
      - packages/cli/src/commands/build.ts
  - owner: engine
    paths:
      - packages/engine/src/ledger-activation.ts
notes:
  - any post-review commit makes prior review stale
`

const INTEGRATION_TRAIN_YAML = `
schema_version: 1
base_epoch:
  revision: 57
  effective_identity: 1d524a2706c1bb9c2aa19945de1197015bbbbc4ce7ef54cb0a37ef54f5ca4c27
  head_commit: 6a97fae7dfa4e38ebb722d1fa01e3395bfce7070
merge_order: "deterministic: accepted branches ordered by integration receipt sequence"
receipts: []
stale_review_policy: any post-review commit makes the prior review stale
integration_owner: one integration owner only
`

const RESOURCE_BUDGET_YAML = `
schema_version: 1
governor_ceilings:
  total_native_children: 14
  writers: 8
  reviewers_auditors: 5
  integration_owner: 1
  browser_heavy: {default: 2, burst: 4}
  full_build_test: 2
  full_compose_topology: 1
  source: AM-0019 §6 pool ceilings
host_capability:
  cpu_count: 20
  total_mem_mb: 15653
  external_ci_green: false
measured_limits:
  runnable_children_by_ram: 30
  ceiling: 14
defaults:
  burst: 10–14 light agents when RAM ≥30%, memory PSI low, CPU <78°C, swap-in negligible
  pause: heavy work paused below 12% available RAM or at 92°C
`

const SYSTEM_TOPOLOGY_YAML = `
schema_version: 1
services:
  - {id: engine, kind: node, status: EXISTS, path: packages/engine}
  - {id: control-plane, kind: web, status: EXISTS, path: packages/control-plane}
  - {id: autopilot-supervisor, kind: process, status: GAP, note: not yet implemented}
ports:
  - {service: control-plane, port: 8787, host: 127.0.0.1}
ingress:
  public_ingress: GAP
  note: no public deployment; harness is local-first
databases:
  - {id: ledger, kind: json-file, status: EXISTS, path: .agent/ledger}
queues:
  - {id: ready-queue, status: GAP, note: cross-stage typed ready queue}
migrations:
  - {id: ledger-revision, status: EXISTS}
health:
  probe: agent-rules doctor
  status: EXISTS
journeys:
  - id: plan-lifecycle
    steps: [inventory, adopt, reconcile, repair, finalize]
    status: EXISTS
  - id: full-stack-public-ingress
    status: GAP
rollback:
  installer: runtime update --rollback
`

function verificationYaml(requirementStates: Record<string, string>, count: number): string {
  const lines: string[] = ['schema_version: 1', 'chain: PlanAnchor → Requirement → AcceptanceCriterion → VerificationProfile → EvidenceContract → ExecutionCluster', `requirement_count: ${count}`, 'requirements:']
  for (const [id, status] of Object.entries(requirementStates)) {
    lines.push(`  - requirement_id: ${id}`)
    lines.push(`    source: fixture requirement ${id}`)
    lines.push(`    status: ${status}`)
    lines.push('    plan_anchor: null')
    lines.push('    acceptance_criteria: []')
    lines.push('    verification_profile:')
    lines.push('      layers: [unit]')
    lines.push('      profile_source: fixture')
    lines.push('    evidence_contract: null')
    lines.push('    execution_cluster:')
    lines.push('      cluster: fixture')
    lines.push(`      state: ${status}`)
    lines.push('    notes: []')
  }
  return lines.join('\n')
}

function ledgerFixture(head: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    plan_id: PLAN_ID,
    status: 'ADOPTED',
    execution_state: 'NEEDS_REMEDIATION',
    terminalMarker: 'HARNESS_V3_10_OF_10_COMPLETE',
    terminalMarkerStatus: 'HISTORICAL_STALE_FOR_M11',
    headCommit: head,
    commitSha: head,
    findings: [{ id: 'F-001', description: 'M11 requirements unaddressed' }],
    latestReview: { reviewId: 'REV-STALE-001', stale: true, staleReason: 'M10-era review' },
    attestations: [],
    ci_checks: [
      { passed: false, workflow: 'Quality', check: 'quality-macos', commitSha: head, conclusion: 'failure', rerunRequired: 'WAITING_EXTERNAL', note: 'rerun required' },
    ],
    milestones: {
      M8: {
        identity: 'e'.repeat(64),
        requirements: [
          { id: 'REQ-001', status: 'MATCH', evidence: [{ fresh: true, evidenceHash: 'a'.repeat(64) }] },
        ],
      },
    },
    amendments: [],
    shadowRevision: 57,
    ...overrides,
  }
}

function createHarness(options: {
  requirementStates?: Record<string, string>
  requirementCount?: number
  ledger?: Record<string, unknown>
  evidenceReceipt?: Record<string, unknown> | null
  diagnostics?: Record<string, unknown> | null
  parityFile?: boolean
} = {}): { root: string; head: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-m11-'))
  fs.mkdirSync(path.join(root, 'rules'), { recursive: true })
  fs.mkdirSync(path.join(root, '.agent', 'ledger'), { recursive: true })
  fs.mkdirSync(path.join(root, '.agent', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(root, '.agent', 'plans', PLAN_ID), { recursive: true })
  fs.mkdirSync(path.join(root, 'automation'), { recursive: true })
  fs.writeFileSync(path.join(root, 'rules', 'manifest.yaml'), 'version: 1\n')
  fs.writeFileSync(path.join(root, '.gitignore'), '.agent/\n')
  git(root, ['init'])
  git(root, ['config', 'user.email', 'm11@example.test'])
  git(root, ['config', 'user.name', 'M11 Test'])
  git(root, ['add', 'rules/manifest.yaml', '.gitignore'])
  git(root, ['commit', '-m', 'fixture'])
  const head = git(root, ['rev-parse', 'HEAD'])

  const pd = path.join(root, '.agent', 'plans', PLAN_ID)
  fs.writeFileSync(path.join(pd, 'projection.plan.yaml'), `schema_version: 2\nplan_id: ${PLAN_ID}\nrevision: 57\nmilestone: M11\n`)
  fs.writeFileSync(path.join(pd, 'autonomy.yaml'), AUTONOMY_YAML)
  fs.writeFileSync(path.join(pd, 'decisions.yaml'), DECISIONS_YAML)
  fs.writeFileSync(path.join(pd, 'execution-graph.yaml'), EXECUTION_GRAPH_YAML)
  fs.writeFileSync(path.join(pd, 'conflict-graph.yaml'), CONFLICT_GRAPH_YAML)
  fs.writeFileSync(path.join(pd, 'integration-train.yaml'), INTEGRATION_TRAIN_YAML)
  fs.writeFileSync(path.join(pd, 'resource-budget.yaml'), RESOURCE_BUDGET_YAML)
  fs.writeFileSync(path.join(pd, 'system-topology.yaml'), SYSTEM_TOPOLOGY_YAML)
  fs.writeFileSync(path.join(pd, 'verification-graph.yaml'), verificationYaml(options.requirementStates ?? {
    'REQ-001': 'MATCH', 'REQ-002': 'MATCH', 'REQ-003': 'PARTIAL', 'M11-R11': 'GAP',
  }, options.requirementCount ?? 4))

  fs.writeFileSync(path.join(root, '.agent', 'ledger', `${PLAN_ID}.json`), JSON.stringify(options.ledger ?? ledgerFixture(head)))

  if (options.evidenceReceipt !== null) {
    const receipt = options.evidenceReceipt ?? {
      schema: 'harness/lifecycle-receipt',
      version: 1,
      receipt_id: 'RCP-FIXTURE-001',
      purpose: 'fixture observed receipt',
      author: { host: 'opencode', model_family: 'deepseek', model_id: 'deepseek-v4-flash', provider: 'qwencoder' },
      routing: { host: 'opencode', observed_model: 'deepseek-v4-flash', requested_model: 'deepseek-v4-flash', resolved_model: 'deepseek-v4-flash', provider: 'qwencoder' },
      created_at: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(root, '.agent', 'evidence', 'fixture-receipt.json'), JSON.stringify(receipt))
  }

  if (options.diagnostics !== null) {
    const diag = options.diagnostics ?? {
      schema: 'local-host-certification-diagnostics/v1',
      status: 'WAITING_EXTERNAL',
      hosts: [
        { host: 'claude', installed: { state: 'OBSERVED', value: '/usr/local/bin/claude' }, nativeExecution: { state: 'OBSERVED' } },
        { host: 'codex', installed: { state: 'MISSING', missingCapability: 'MISSING_HOST', reason: 'codex is not on PATH' }, nativeExecution: { state: 'MISSING' } },
      ],
    }
    fs.writeFileSync(path.join(root, 'certification-diagnostics.json'), JSON.stringify(diag))
  }

  if (options.parityFile) {
    const dir = path.join(root, 'evals', 'parity-output')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'run-001.json'), JSON.stringify({ pairId: 'P-001', verdict: 'FAIL', opened: ['REF:P-001', 'TGT:P-001'] }))
  }

  return { root, head }
}

async function withHarness<T>(root: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.HARNESS_ROOT
  process.env.HARNESS_ROOT = root
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.HARNESS_ROOT
    else process.env.HARNESS_ROOT = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('M11 views API', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb() })
  afterAll(async () => { await closeDb() })

  it('readiness route returns real ledger-derived state (no self-claim green)', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/readiness')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.planId).toBe(PLAN_ID)
      expect(res.body.readinessState).toBe('BOUNDED_READY')
      expect(res.body.evidenceGreen).toBe(false)
      expect(res.body.coverage.total).toBe(4)
      expect(res.body.coverage.byStatus.GAP).toBe(1)
      expect(res.body.ledger.executionState).toBe('NEEDS_REMEDIATION')
      expect(res.body.authorityEnvelope.allowed).toContain('inspect')
      expect(res.body.authorityEnvelope.owner_only).toContain('push')
      expect(res.body.recordedDecisions.length).toBe(1)
      expect(res.body.readinessReasons.length).toBeGreaterThan(0)
    })
  })

  it('readiness evidenceGreen requires full MATCH coverage + clean ledger + fresh review', async () => {
    const { root } = createHarness({
      requirementStates: { 'REQ-001': 'MATCH', 'REQ-002': 'MATCH' },
      requirementCount: 2,
      ledger: ledgerFixture('x'.repeat(40), {
        execution_state: 'ADOPTED',
        findings: [],
        latestReview: { reviewId: 'REV-FRESH-001', stale: false },
        attestations: [{ profile: 'REQ-001', status: 'BOUND' }],
        headCommit: 'x'.repeat(40),
        commitSha: 'x'.repeat(40),
      }),
    })
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/readiness')
      expect(res.status).toBe(200)
      expect(res.body.coverage.byStatus.GAP).toBeUndefined()
      expect(res.body.evidenceGreen).toBe(true)
    })
  })

  it('dag route returns typed edges and computed ready antichain', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/dag')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.stages.length).toBe(11)
      expect(res.body.edgeTypes).toEqual(expect.arrayContaining(['HARD', 'SOFT', 'VERIFY_AFTER', 'SEMANTIC_CONFLICT', 'INTEGRATION', 'GLOBAL_GATE', 'EXTERNAL']))
      const hardEdge = res.body.edges.find((e: { from: string; to: string; type: string }) => e.from === 'C0' && e.to === 'C1')
      expect(hardEdge.type).toBe('HARD')
      // AM-0019 §4: INTEGRATION edge does not block; C5 is ready alongside C1
      expect(res.body.readyAntichain).toEqual(expect.arrayContaining(['C1', 'C5']))
      expect(res.body.readyAntichain).not.toContain('C2')
      expect(res.body.criticalPath).toEqual(expect.arrayContaining(['C0', 'C1', 'C2', 'C3', 'C4', 'C8', 'C9', 'C10']))
      expect(res.body.recoverableStates.length).toBe(3)
    })
  })

  it('conflicts route returns domains and observed leases', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/conflicts')
      expect(res.status).toBe(200)
      expect(res.body.domains.length).toBeGreaterThanOrEqual(3)
      const lockfile = res.body.domains.find((d: { id: string }) => d.id === 'lockfile')
      expect(lockfile.leases).toContain('package-lock.json')
      expect(res.body.ownership.length).toBeGreaterThan(0)
      expect(res.body.liveLeases.worktrees.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('worktrees route returns current worktree inventory + integration train', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/worktrees')
      expect(res.status).toBe(200)
      expect(res.body.worktrees.length).toBeGreaterThanOrEqual(1)
      expect(res.body.worktrees[0].path).toBe(root)
      expect(typeof res.body.worktrees[0].head).toBe('string')
      expect(res.body.integrationTrain.baseEpoch.revision).toBe(57)
      expect(res.body.branches.length).toBeGreaterThan(0)
    })
  })

  it('agents route derives OBSERVED from receipts and MISSING otherwise (no green from config)', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/agents')
      expect(res.status).toBe(200)
      const hosts = res.body.hosts as Array<{ host: string; state: string; reason: string; receipts: number }>
      const opencode = hosts.find(h => h.host === 'opencode')
      expect(opencode?.state).toBe('OBSERVED')
      expect(opencode?.receipts).toBe(1)
      const claude = hosts.find(h => h.host === 'claude')
      expect(claude?.state).toBe('WAITING_EXTERNAL')
      const codex = hosts.find(h => h.host === 'codex')
      expect(codex?.state).toBe('MISSING')
      const antigravity = hosts.find(h => h.host === 'antigravity')
      expect(antigravity?.state).toBe('MISSING')
      expect(res.body.diagnostics.status).toBe('WAITING_EXTERNAL')
    })
  })

  it('resources route returns governor ceilings and host capability', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/resources')
      expect(res.status).toBe(200)
      expect(res.body.governorCeilings.total_native_children).toBe(14)
      expect(res.body.governorCeilings.writers).toBe(8)
      expect(res.body.hostCapability.total_mem_mb).toBe(15653)
      expect(res.body.measuredLimits.ceiling).toBe(14)
    })
  })

  it('topology route renders services with honest GAP markers', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/topology')
      expect(res.status).toBe(200)
      const engine = res.body.services.find((s: { id: string }) => s.id === 'engine')
      expect(engine.status).toBe('EXISTS')
      const autopilot = res.body.services.find((s: { id: string }) => s.id === 'autopilot-supervisor')
      expect(autopilot.status).toBe('GAP')
      expect(res.body.ingress.public_ingress).toBe('GAP')
      const fullStack = res.body.journeys.find((j: { id: string }) => j.id === 'full-stack-public-ingress')
      expect(fullStack.status).toBe('GAP')
    })
  })

  it('parity route renders honest empty state when no C7 outputs exist', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/parity')
      expect(res.status).toBe(200)
      expect(res.body.present).toBe(false)
      expect(res.body.runs).toEqual([])
      expect(res.body.note).toContain('No C7 parity run output found')
    })
  })

  it('parity route reads recorded run outputs when present', async () => {
    const { root } = createHarness({ parityFile: true })
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/parity')
      expect(res.status).toBe(200)
      expect(res.body.present).toBe(true)
      expect(res.body.runs.length).toBe(1)
      expect(res.body.runs[0].pairId).toBe('P-001')
    })
  })

  it('waits route returns waiting tasks with wake conditions', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/waits')
      expect(res.status).toBe(200)
      const tasks = res.body.tasks as Array<{ id: string; state: string; wake: string }>
      expect(tasks.length).toBeGreaterThanOrEqual(3)
      expect(tasks.some(t => t.id === 'ci:quality-macos' && t.state === 'WAITING_EXTERNAL' && t.wake === 'CI watcher')).toBe(true)
      expect(tasks.some(t => t.id === 'U-001' && t.state === 'WAITING_EXTERNAL')).toBe(true)
      expect(tasks.some(t => t.state === 'WAITING_AUTHORITY')).toBe(true)
      const byState = res.body.byState as Array<{ state: string; count: number }>
      const waitingExternal = byState.find(s => s.state === 'WAITING_EXTERNAL')
      expect(waitingExternal.count).toBeGreaterThanOrEqual(2)
    })
  })

  it('terminal gate route shows NEEDS_REMEDIATION (never green)', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/gates')
      expect(res.status).toBe(200)
      expect(res.body.executionState).toBe('NEEDS_REMEDIATION')
      expect(res.body.terminalMarkerStatus).toBe('HISTORICAL_STALE_FOR_M11')
      expect(res.body.verdict).toBe('NEEDS_REMEDIATION')
      expect(res.body.verdict).not.toBe('TERMINAL_GATE_PASS')
      expect(res.body.gates.length).toBe(6)
      expect(res.body.summary.pass).toBeLessThan(res.body.summary.total)
      const gate01 = res.body.gates.find((g: { id: string }) => g.id === 'GATE-01')
      expect(gate01.status).toBe('NOT_PASS')
      expect(gate01.detail).toContain('GAP=1')
    })
  })

  it('views listing returns all eleven view names', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/views')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual(['readiness', 'dag', 'conflicts', 'worktrees', 'agents', 'resources', 'topology', 'parity', 'waits', 'gates', 'calibration'])
    })
  })

  it('calibration view reports honest UNAVAILABLE when the ledger is empty', async () => {
    const { root } = createHarness()
    await withHarness(root, async () => {
      const res = await request(app).get('/api/m11/calibration')
      expect(res.status).toBe(200)
      expect(res.body.present).toBe(false)
      expect(res.body.metricState).toBe('UNAVAILABLE')
      expect(res.body.eventCount).toBe(0)
      expect(res.body.note).toContain('UNAVAILABLE')
    })
  })
})
