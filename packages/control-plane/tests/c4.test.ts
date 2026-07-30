import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
    expect(res.body.ok).toBe(true)
    expect(res.body.status).toBe('healthy')
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
  it('returns healthy when manifest exists', async () => {
    const { app } = await import('../src/server/app')
    const request = (await import('supertest')).default
    const res = await request(app).get('/api/c4/health')
    expect(res.body.status).toBe('healthy')
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
    const evidencePath = path.resolve(ROOT, '..', '..', 'automation', 'scorecard-evidence.json')
    const hasEvidence = fs.existsSync(evidencePath)
    expect(res.body.data.health).toBe(hasEvidence ? 'healthy' : 'unknown')
    expect(res.body.data.evidencePresent).toBe(hasEvidence)
    expect(res.body.data.summary[hasEvidence ? 'pass' : 'unknown']).toBe(18)
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

describe('C4 scorecard evidence API', () => {
  it('scorecard has 18 canonical dimension objects', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'c4.ts'), 'utf-8')
    const matches = src.match(/id: 'd\d{2}'/g)
    expect(matches).toHaveLength(18)
  })
})
