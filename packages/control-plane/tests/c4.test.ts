import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import {
  HOST_ATTESTATION_EVIDENCE_ROLES,
  hostAttestationEvidenceRef,
  hostAttestationEvidenceSubjectSha256,
  type HostAttestation,
} from '@initforge/agent-rules-engine/contracts'
import { M10_TERMINAL_TOKEN, deriveM10ProofHash } from '@initforge/agent-rules-engine/terminal-gate'

const REQUIRED_HOSTS = ['codex', 'claude', 'grok', 'opencode', 'antigravity']

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()
}

function scorecard(head: string, branch: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const labels = [
    'Context Routing', 'Plan Identity Integrity', 'Evidence Binding', 'Amendment Tracking',
    'Shadow Hash Verification', 'Reconciliation Accuracy', 'Verification Claims Coverage',
    'Batch Execution', 'Attestation Completeness', 'Audit Trail Integrity',
    'Path Traversal Protection', 'Symlink Protection', 'Schema Validation Rigor',
    'C4 Visualization Maturity', 'Multi-Platform Support', 'API Security Posture',
    'Telemetry & Monitoring', 'Release Readiness',
  ]
  return {
    schema: 'am0015/scorecard-evidence/v2',
    _git: { commit: head, branch },
    dimensions: labels.map((label, index) => ({ id: `d${String(index + 1).padStart(2, '0')}`, label, score: 10, maxScore: 10, status: 'pass' })),
    ...overrides,
  }
}

function attestation(host: string, head: string): Record<string, unknown> {
  const issuedAt = new Date(Date.now() - 60_000).toISOString()
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
  const subject: HostAttestation = {
    host: host as HostAttestation['host'],
    hostVersion: '1.0.0',
    commitSha: head,
    capabilityStatus: 'HOST_NATIVE',
    capabilityIds: ['run'],
    contractSetSha256: 'a'.repeat(64),
    requestedModel: 'standard',
    resolvedModel: 'standard',
    observedModel: 'standard',
    nativeRunnerIdentity: `${host}-runner`,
    issuedAt,
    expiresAt,
  }
  return {
    ...subject,
    evidenceRefs: HOST_ATTESTATION_EVIDENCE_ROLES.map((role, index) => {
      const evidenceSha256 = String(index + 1).repeat(64)
      return {
        role,
        host: subject.host,
        commitSha: head,
        evidenceSha256,
        evidenceRef: hostAttestationEvidenceRef(subject.host, head, role, evidenceSha256),
        subjectSha256: hostAttestationEvidenceSubjectSha256(role, subject),
        observedAt: issuedAt,
      }
    }),
  }
}

function ledger(head: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const epoch = Date.now()
  const identity = 'e'.repeat(64)
  const reconciliations = Array.from({ length: 15 }, (_, index) => ({ requirementId: `REQ-${String(index + 1).padStart(3, '0')}`, status: 'MATCH', headCommit: head, detail: `HEAD ${head.slice(0, 12)}` }))
  const evidenceHashes = Array.from({ length: 15 }, (_, index) => `${String(index + 1).padStart(2, '0')}${'a'.repeat(62)}`)
  const proof = { headCommit: head, effectivePlanIdentity: identity, reviewerIdentity: 'c4-fixture', epoch, reconciliationIds: reconciliations.map(r => r.requirementId), evidenceHashes }
  return {
    plan_id: 'truth-plan',
    status: 'COMPLETED',
    execution_state: M10_TERMINAL_TOKEN,
    findings: [],
    orphanFindings: [],
    reconciliations,
    attestations: REQUIRED_HOSTS.map(host => attestation(host, head)),
    plan_anchors: Array.from({ length: 25 }, (_, index) => ({ requirementId: `REQ-${index + 1}` })),
    amendments: [],
    shadowRevision: 1,
    latestShadowRevision: 1,
    latestReview: { reviewId: 'review', stale: false, reviewerIdentity: 'c4-fixture' },
    headCommit: head,
    commitSha: head,
    effective_plan_identity: { sha256: identity },
    m10Proof: { ...proof, proofHash: deriveM10ProofHash(proof) },
    milestones: {
      'M9.5': {
        identity,
        reviewerIdentity: 'c4-fixture',
        epoch,
        observedAt: new Date(epoch).toISOString(),
        evidence: Array.from({ length: 15 }, (_, index) => ({
          identity,
          fresh: true,
          observedAt: new Date(epoch).toISOString(),
          evidenceHash: `${String(index + 1).padStart(2, '0')}${'a'.repeat(62)}`,
        })),
      },
    },
    ci_checks: [{ passed: true, runUrl: 'https://github.com/initforge/agent-rules/actions/runs/1', repository: 'initforge/agent-rules', workflow: 'quality', check: 'test', commitSha: head }],
    plan: { original: { artifactId: 'plan', sha256: 'a'.repeat(64), status: 'ADOPTED' } },
    ...overrides,
  }
}

function createTruthHarness(options: { ledger?: Record<string, unknown>; scorecard?: Record<string, unknown> } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-c4-truth-'))
  fs.mkdirSync(path.join(root, 'rules'), { recursive: true })
  fs.mkdirSync(path.join(root, 'automation'), { recursive: true })
  fs.writeFileSync(path.join(root, 'rules', 'manifest.yaml'), 'version: 1\n')
  fs.writeFileSync(path.join(root, '.gitignore'), '.agent/\nautomation/scorecard-evidence.json\n')
  git(root, ['init'])
  git(root, ['config', 'user.email', 'c4@example.test'])
  git(root, ['config', 'user.name', 'C4 Test'])
  git(root, ['add', 'rules/manifest.yaml', '.gitignore'])
  git(root, ['commit', '-m', 'fixture'])
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = git(root, ['branch', '--show-current'])
  fs.mkdirSync(path.join(root, '.agent', 'ledger'), { recursive: true })
  fs.writeFileSync(path.join(root, '.agent', 'ledger', 'truth-plan.json'), JSON.stringify(options.ledger ?? ledger(head)))
  fs.writeFileSync(path.join(root, 'automation', 'scorecard-evidence.json'), JSON.stringify(options.scorecard ?? scorecard(head, branch)))
  return root
}

async function withTruthHarness<T>(root: string, run: () => Promise<T>): Promise<T> {
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

const ROOT = path.resolve(__dirname, '..')

describe('C4 API', () => {
  const c4RoutePath = path.join(ROOT, 'src', 'routes', 'c4.ts')
  const c4Exists = fs.existsSync(c4RoutePath)

  it('C4 route file exists', () => {
    expect(c4Exists).toBe(true)
  })

  it('C4 route exports a default router', async () => {
    if (!c4Exists) return
    const mod = await import('../src/routes/c4')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default.stack).toBe('object')
    expect(Array.isArray(mod.default.stack)).toBe(true)
  })

  it('context endpoint returns expected shape', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/context')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.scope).toBeDefined()
    expect(Array.isArray(res.body.data.systems)).toBe(true)
    expect(Array.isArray(res.body.data.externalSystems)).toBe(true)
    expect(Array.isArray(res.body.data.relationships)).toBe(true)
  })

  it('containers endpoint returns containers', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/containers')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(3)
    const names = res.body.data.map((c: Record<string, unknown>) => c.name)
    expect(names).toContain('Control Plane')
    expect(names).toContain('CLI')
    expect(names).toContain('Engine')
  })

  it('containers have components', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/containers')
    const cp = res.body.data.find((c: Record<string, unknown>) => c.name === 'Control Plane')
    expect(cp).toBeDefined()
    expect(Array.isArray((cp as Record<string, unknown>).components)).toBe(true)
    expect(((cp as Record<string, unknown>).components as Array<unknown>).length).toBeGreaterThanOrEqual(3)
  })

  it('components endpoint returns all components', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/components')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.total).toBeGreaterThanOrEqual(5)
  })

  it('components endpoint filters by container', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/components?container=Control+Plane')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.container).toBe('Control Plane')
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('components endpoint 404 for unknown container', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/components?container=Nope')
    expect(res.status).toBe(404)
  })

  it('code endpoint returns modules', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/code')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('code endpoint accepts scope param', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/code?scope=src/routes')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('health endpoint returns status', async () => {
    if (!c4Exists) return
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.status).toBe('degraded')
    expect(res.body.operational.source).toBe('canonical-ledger')
  })
})

describe('C4 client components', () => {
  const diagramPath = path.join(ROOT, 'src', 'client', 'components', 'C4Diagram.tsx')
  const pagePath = path.join(ROOT, 'src', 'client', 'pages', 'C4.tsx')

  it('C4Diagram component exists', () => {
    expect(fs.existsSync(diagramPath)).toBe(true)
  })

  it('C4Page component exists', () => {
    expect(fs.existsSync(pagePath)).toBe(true)
  })
})

describe('C4 accessibility', () => {
  const stylesPath = path.join(ROOT, 'src', 'client', 'styles.css')

  it('CSS uses prefers-reduced-motion media query', () => {
    const css = fs.readFileSync(stylesPath, 'utf-8')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('C4 components use semantic roles', () => {
    const c4Diagram = fs.readFileSync(path.join(ROOT, 'src', 'client', 'components', 'C4Diagram.tsx'), 'utf-8')
    expect(c4Diagram).toContain('role="list"')
    expect(c4Diagram).toContain('role="listitem"')
    expect(c4Diagram).toContain('aria-label')
    expect(c4Diagram).toContain('aria-selected')
    expect(c4Diagram).toContain('tabIndex={0}')
    expect(c4Diagram).toContain('aria-valuenow')
    expect(c4Diagram).toContain('role="progressbar"')
  })

  it('C4 page uses role=tablist and role=tabpanel', () => {
    const c4Page = fs.readFileSync(path.join(ROOT, 'src', 'client', 'pages', 'C4.tsx'), 'utf-8')
    expect(c4Page).toContain('role="tablist"')
    expect(c4Page).toContain('role="tab"')
    expect(c4Page).toContain('role="tabpanel"')
    expect(c4Page).toContain('aria-selected')
  })
})

describe('C4 data invariants', () => {
  it('does not report healthy from a manifest when canonical ledger remediation is pending', async () => {
    const root = createTruthHarness()
    const head = git(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(
      path.join(root, '.agent', 'ledger', 'truth-plan.json'),
      JSON.stringify(ledger(head, { status: 'NEEDS_REMEDIATION', execution_state: 'NEEDS_REMEDIATION' }))
    )
    await withTruthHarness(root, async () => {
      const { app } = await import('../src/server/app')
      const request = (await import('supertest')).default
      const res = await request(app).get('/api/c4/health')
      expect(res.body.status).toBe('degraded')
      expect(res.body.operational.ledgers[0].executionState).toBe('NEEDS_REMEDIATION')
    })
  })

  it('context data has valid scope', async () => {
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/context')
    expect(res.body.data.scope.length).toBeGreaterThan(0)
  })

  it('all containers have names and descriptions', async () => {
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/containers')
    for (const c of res.body.data as Array<Record<string, unknown>>) {
      expect(typeof c.name).toBe('string')
      expect((c.name as string).length).toBeGreaterThan(0)
      expect(typeof c.description).toBe('string')
    }
  })

  it('control plane has API Routes, Services, and Client UI components', async () => {
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/components?container=Control+Plane')
    const names = (res.body.data as Array<Record<string, unknown>>).map(c => c.name)
    expect(names).toContain('API Routes')
    expect(names).toContain('Services')
    expect(names).toContain('Client UI')
  })

  it('C4DimScorecard exported from C4Diagram', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'client', 'components', 'C4Diagram.tsx'), 'utf-8')
    expect(src).toContain('C4DimScorecard')
  })

  it('scorecard endpoint returns 18 dimensions', async () => {
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/scorecard')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.dimensions).toHaveLength(18)
    expect(res.body.data.health).toBe('degraded')
    expect(res.body.data.evidencePresent).toBe(true)
    expect(res.body.data.summary.pass).toBe(18)
    expect(res.body.data.operational.source).toBe('canonical-ledger')
  })

  it('scorecard dimensions from evidence API, not hardcoded scores', async () => {
    const c4Page = fs.readFileSync(path.join(ROOT, 'src', 'client', 'pages', 'C4.tsx'), 'utf-8')
    expect(c4Page).not.toContain("id: 'd01', label: 'Context Routing', score: 100")
    expect(c4Page).toContain("/api/c4/scorecard")
  })

  it('absent evidence returns unknown status for all dimensions', async () => {
    const previous = process.env.C4_SCORECARD_EVIDENCE_PATH
    process.env.C4_SCORECARD_EVIDENCE_PATH = path.join(
      os.tmpdir(),
      `agent-rules-scorecard-missing-${process.pid}-${Date.now()}.json`,
    )
    try {
      const { app } = await import('../src/server/app')
      const request = (await import('supertest')).default
      const res = await request(app).get('/api/c4/scorecard')
      expect(res.body.data.health).toBe('unknown')
      expect(res.body.data.evidencePresent).toBe(false)
      for (const d of res.body.data.dimensions) {
        expect(d.status).toBe('unknown')
        expect(d.score).toBe(0)
        expect(d.maxScore).toBe(0)
      }
    } finally {
      if (previous === undefined) delete process.env.C4_SCORECARD_EVIDENCE_PATH
      else process.env.C4_SCORECARD_EVIDENCE_PATH = previous
    }
  })
})

describe('C4 canonical operational truth', () => {
  async function requestTruth(root: string, endpoint: '/api/c4/health' | '/api/c4/scorecard') {
    return withTruthHarness(root, async () => {
      const { app } = await import('../src/server/app')
      const request = (await import('supertest')).default
      return request(app).get(endpoint)
    })
  }

  it('rejects a stale all-pass scorecard even when its ledger is otherwise current', async () => {
    const root = createTruthHarness()
    const head = git(root, ['rev-parse', 'HEAD'])
    const branch = git(root, ['branch', '--show-current'])
    fs.writeFileSync(path.join(root, 'automation', 'scorecard-evidence.json'), JSON.stringify(scorecard('b'.repeat(64), branch)))
    const res = await requestTruth(root, '/api/c4/scorecard')
    expect(res.body.data.operational.ledgers[0].failedGates).toEqual([])
    expect(res.body.data.operational.status).toBe('healthy')
    expect(res.body.data.scorecardFreshness).toBe('stale')
    expect(res.body.data.health).toBe('degraded')
    expect(head).not.toBe('b'.repeat(64))
  })

  it('rejects configured scores when ledger has no attestations or CI evidence', async () => {
    const root = createTruthHarness()
    const head = git(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(root, '.agent', 'ledger', 'truth-plan.json'), JSON.stringify(ledger(head, { attestations: [], ci_checks: [] })))
    const res = await requestTruth(root, '/api/c4/scorecard')
    expect(res.body.data.health).toBe('degraded')
    expect(res.body.data.operational.ledgers[0].failedGates).toEqual(expect.arrayContaining(['CERTIFICATION_ATTESTATION', 'GITHUB_CI_PASSED']))
  })

  it('rejects configured scores when ledger HEAD binding mismatches the repository HEAD', async () => {
    const root = createTruthHarness()
    const head = git(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(root, '.agent', 'ledger', 'truth-plan.json'), JSON.stringify(ledger(head, { headCommit: 'c'.repeat(64), commitSha: 'c'.repeat(64) })))
    const res = await requestTruth(root, '/api/c4/health')
    expect(res.body.status).toBe('degraded')
    expect(res.body.operational.ledgers[0].failedGates).toContain('HEAD_MATCH')
  })

  it('rejects configured scores while the canonical ledger is NEEDS_REMEDIATION', async () => {
    const root = createTruthHarness()
    const head = git(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(root, '.agent', 'ledger', 'truth-plan.json'), JSON.stringify(ledger(head, { status: 'NEEDS_REMEDIATION', execution_state: 'NEEDS_REMEDIATION' })))
    const res = await requestTruth(root, '/api/c4/scorecard')
    expect(res.body.data.health).toBe('degraded')
    expect(res.body.data.operational.ledgers[0]).toMatchObject({ executionState: 'NEEDS_REMEDIATION' })
    expect(res.body.data.operational.ledgers[0].failedGates).toContain('EXECUTION_STATE_COMPLETED')
  })

  it('rejects a foreign attestation host', async () => {
    const root = createTruthHarness()
    const head = git(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(root, '.agent', 'ledger', 'truth-plan.json'), JSON.stringify(ledger(head, { attestations: [...REQUIRED_HOSTS.map(host => attestation(host, head)), attestation('foreign-host', head)] })))
    const res = await requestTruth(root, '/api/c4/health')
    expect(res.body.status).toBe('degraded')
    expect(res.body.operational.ledgers[0].failedGates).toContain('NO_NON_NATIVE_HOST')
  })
})

describe('C4 scorecard evidence API', () => {
  it('scorecard has 18 canonical dimension objects', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'c4.ts'), 'utf-8')
    const matches = src.match(/id: 'd\d{2}'/g)
    expect(matches).toHaveLength(18)
  })
})
