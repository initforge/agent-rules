import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server/app'
import { getDb, closeDb } from '../src/db'
import { validatePlanId, PlanNotFoundError, PlanValidationError } from '@initforge/agent-rules-engine/plan-identity'
import { buildManifestJson } from '@initforge/agent-rules-engine/plan-identity'
import { SYMLINK_CAPABLE } from '../../engine/test/helpers/symlink-capability.js'

describe('API', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb() })
  afterAll(async () => { await closeDb() })

  it('GET /api/health returns status', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
    expect(res.body.status).toBe('healthy')
  })
  it('GET /api/config/all returns canonical data', async () => {
    const res = await request(app).get('/api/config/all')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
    expect(res.body.data.manifest).toBeTruthy(); expect(res.body.data.registry).toBeTruthy()
    expect(res.body.data.profileManifest).toBeTruthy()
    expect(res.body.data.modelPolicy).toBeTruthy(); expect(res.body.data.triggerAudit).toBeTruthy()
  })
  it('GET /api/config/platforms returns platform configs', async () => {
    const res = await request(app).get('/api/config/platforms'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const ps = res.body.data.platforms ? Object.keys(res.body.data.platforms) : Object.keys(res.body.data)
    expect(ps.length).toBeGreaterThanOrEqual(4)
  })
  it('GET /api/config/skills returns skills list', async () => {
    const res = await request(app).get('/api/config/skills'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true); expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(10)
  })
  it('GET /api/config/agents returns agent definitions', async () => {
    const res = await request(app).get('/api/config/agents'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true); expect(Array.isArray(res.body.data)).toBe(true)
  })
  it('GET /api/config/file reads JSON files', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true); expect(res.body.data.version).toBe(5)
  })
  it('GET /api/config/file reads YAML files', async () => {
    const res = await request(app).get('/api/config/file?path=profiles/manifest.yaml')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true); expect(res.body.data.version).toBe(1)
  })
  it('GET /api/audit returns audit log', async () => {
    const res = await request(app).get('/api/audit'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true); expect(Array.isArray(res.body.data)).toBe(true)
  })
  it('POST /api/mutation/diff computes diff', async () => {
    const res = await request(app).post('/api/mutation/diff').send({ filePath: 'automation/model-policy.json', content: JSON.stringify({ version: 5, platforms: {} }) })
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true); expect(res.body.diff).toBeTruthy()
  })
  it('POST /api/mutation/preview returns diff', async () => {
    const res = await request(app).post('/api/mutation/preview').send({ target: 'model-policy', filePath: 'automation/model-policy.json', data: { version: 5, platforms: {} } })
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true); expect(res.body.diff.hasChanges).toBe(true)
  })
  it('POST /api/mutation/preview no diff when identical', async () => {
    const r1 = await request(app).get('/api/config/file?path=automation/model-policy.json')
    const res = await request(app).post('/api/mutation/preview').send({ target: 'model-policy', filePath: 'automation/model-policy.json', data: r1.body.data })
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
  })
  it('POST /api/runs/record-run records a run', async () => {
    const res = await request(app).post('/api/runs/record-run').send({ run_id: 'test-run-001', platform: 'test', model: 'test-model', outcome: 'PASS' })
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
  })
  it('GET /api/runs returns recorded runs', async () => {
    const res = await request(app).get('/api/runs'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true); expect(Array.isArray(res.body.data)).toBe(true)
  })
  it('POST /api/runs/import-telemetry imports events', async () => {
    const res = await request(app).post('/api/runs/import-telemetry').send({ events: [{ event_id: 'test-event-001', event_type: 'test', ts: new Date().toISOString(), platform: 'test', model: 'm', effort: 'medium', outcome: 'PASS' }] })
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true); expect(typeof res.body.imported).toBe('number')
  })
  it('GET /api/runs/telemetry returns telemetry events', async () => {
    const res = await request(app).get('/api/runs/telemetry'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true); expect(Array.isArray(res.body.data)).toBe(true)
  })
  it('POST /api/runs/record-run redacts sensitive details before persistence', async () => {
    const res = await request(app).post('/api/runs/record-run').send({
      run_id: 'redact-test-run', platform: 'test', model: 'test-model', outcome: 'PASS',
      details: { api_key: 'sk-secret', token: 'tok-xxx', safe: 'visible', nested: { secret: 'deep' } },
    })
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
    const list = await request(app).get('/api/runs')
    const run = list.body.data.find((r: Record<string, unknown>) => r.run_id === 'redact-test-run')
    expect(run).toBeDefined()
    const details = JSON.parse(run.details as string)
    expect(details.api_key).toBe('[REDACTED]')
    expect(details.token).toBe('[REDACTED]')
    expect(details.safe).toBe('visible')
    expect(details.nested.secret).toBe('[REDACTED]')
  })
  it('POST /api/runs/import-telemetry redacts sensitive payload before persistence', async () => {
    const res = await request(app).post('/api/runs/import-telemetry').send({
      events: [{ event_id: 'redact-test-telem', event_type: 'test', ts: new Date().toISOString(), platform: 'test', model: 'm', effort: 'medium', outcome: 'PASS', API_KEY: 'sk-leak', safe_data: 'ok' }],
    })
    expect(res.status).toBe(200)
    const list = await request(app).get('/api/runs/telemetry')
    const ev = list.body.data.find((t: Record<string, unknown>) => t.event_id === 'redact-test-telem')
    expect(ev).toBeDefined()
    const parsed = JSON.parse(ev.payload as string)
    expect(parsed.API_KEY).toBe('[REDACTED]')
    expect(parsed.safe_data).toBe('ok')
  })
  it('POST /api/mutation/apply rejects invalid data', async () => {
    const res = await request(app).post('/api/mutation/apply').send({ target: 'model-policy', filePath: 'automation/model-policy.json', data: { version: 'bad' } })
    expect(res.status).toBe(400); expect(res.body.ok).toBe(false); expect(res.body.error).toContain('Validation')
  })
  it('POST /api/mutation/rollback requires valid backup', async () => {
    const res = await request(app).post('/api/mutation/rollback').send({ backupPath: '/nonexistent/backup.bak', targetPath: 'automation/model-policy.json' })
    expect(res.status).toBe(404); expect(res.body.ok).toBe(false)
  })
  it('GET /api/mutation/backups returns list', async () => {
    const res = await request(app).get('/api/mutation/backups'); expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true); expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('auth', () => {
  it('skipped when CONTROL_PLANE_API_KEY unset', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json')
    expect(res.status).toBe(200)
  })
})

describe('path traversal', () => {
  it('path traversal ../ returns 403', async () => {
    const res = await request(app).get('/api/config/file?path=../'); expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false); expect(res.body.error).toBe('Forbidden')
  })
  it('encoded traversal returns 403', async () => {
    const res = await request(app).get('/api/config/file?path=%2e%2e%2f'); expect(res.status).toBe(403)
  })
  it('unknown path returns 403 (allowlist rejection)', async () => {
    const res = await request(app).get('/api/config/file?path=nonexistent/file.json')
    expect(res.status).toBe(403)
  })
})

describe('API auth with API key', () => {
  beforeAll(() => { process.env.CONTROL_PLANE_API_KEY = 'test-api-key-12345' })
  afterAll(() => { delete process.env.CONTROL_PLANE_API_KEY })
  it('health bypasses auth', async () => {
    const res = await request(app).get('/api/health'); expect(res.status).toBe(200)
  })
  it('GET /api/config/file requires auth', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json')
    expect(res.status).toBe(401); expect(res.body.ok).toBe(false)
  })
  it('wrong key returns 401', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json').set('x-api-key', 'wrong-key')
    expect(res.status).toBe(401)
  })
  it('short key returns 401 (timingSafeEqual length mismatch)', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json').set('x-api-key', 'short')
    expect(res.status).toBe(401)
  })
  it('query string api_key not accepted', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json&api_key=test-api-key-12345')
    expect(res.status).toBe(401)
  })
  it('correct x-api-key passes', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json').set('x-api-key', 'test-api-key-12345')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
  })
  it('mutation endpoints require auth', async () => {
    const res = await request(app).post('/api/mutation/diff').send({ filePath: 'automation/model-policy.json', content: '{}' })
    expect(res.status).toBe(401)
  })
  it('config endpoints require auth when API key is set', async () => {
    const res = await request(app).get('/api/config/platforms')
    expect(res.status).toBe(401)
  })
})

function sha256Hex(data: string): string {
  const c = require('node:crypto')
  return c.createHash('sha256').update(Buffer.from(data, 'utf-8')).digest('hex')
}

function writeManifest(planDir: string, planId: string, originalSha256: string, amendments: Array<{amendmentId: string; filename: string; sha256: string; order?: number}>) {
  const path = require('node:path'); const fs = require('node:fs')
  const amends = amendments.map((a, i) => ({ amendmentId: a.amendmentId, sha256: a.sha256, filename: a.filename, order: a.order !== undefined ? a.order : i }))
  fs.writeFileSync(path.join(planDir, 'amendments', 'manifest.json'), buildManifestJson(planId, originalSha256, amends))
}

interface FixtureOpts {
  tamperOriginal?: boolean; tamperShadow?: boolean; tamperAmendment?: boolean
  missingAmendment?: boolean; amendmentOrderMismatch?: boolean; legacy?: boolean
  symlinkLedger?: boolean; symlinkOriginal?: boolean; symlinkManifest?: boolean
  symlinkAmendment?: boolean; planIdMismatch?: string; noOriginal?: boolean; noShadow?: boolean
  noManifest?: boolean; malformedManifest?: boolean; manifestPlanIdMismatch?: string
  manifestShaMismatch?: boolean; duplicateId?: boolean; duplicateFilename?: boolean
  unlistedArtifact?: boolean; noncontiguousAmendments?: boolean; reorderedAmendments?: boolean
  traversalFilename?: string; traversalSourceRef?: string; shadowTraversal?: boolean
  parentSymlink?: boolean
  noAmendDir?: boolean; badSourceRef?: string; extraDir?: string; extraSymlink?: boolean
  shadowSymlink?: string; shadowWrongType?: string; corruptLedger?: boolean
  manifestLength?: number; ledgerAmendLength?: number; dupId?: boolean; dupName?: boolean
}

function createFixture(root: string, planId_: string, opts: FixtureOpts = {}): string {
  const fs = require('node:fs'); const path = require('node:path'); const c = require('node:crypto')
  const ledgerDir = path.join(root, '.agent', 'ledger')
  const planDir = path.join(root, '.agent', 'plans', planId_)
  const shadowDir = path.join(planDir, 'shadow')
  const amdDir = path.join(planDir, 'amendments')
  fs.mkdirSync(ledgerDir, { recursive: true })
  fs.mkdirSync(planDir, { recursive: true })
  fs.mkdirSync(shadowDir, { recursive: true })
  fs.mkdirSync(amdDir, { recursive: true })

  const originalContent = '# Test Plan\n\n## Requirement 1\nDo the work.\n'
  const originalBytes = Buffer.from(originalContent, 'utf-8')
  const originalSha = c.createHash('sha256').update(originalBytes).digest('hex')
  const tamperedContent = '# DIFFERENT TAMPERED\n'
  const tamperedSha = c.createHash('sha256').update(Buffer.from(tamperedContent, 'utf-8')).digest('hex')
  const fileOrigContent = opts.tamperOriginal ? tamperedContent : originalContent

  if (!opts.noOriginal) {
    if (opts.symlinkOriginal) {
      const tgt = path.join(root, 'orig-target.md')
      fs.writeFileSync(tgt, fileOrigContent)
      fs.symlinkSync(tgt, path.join(planDir, 'original.md'))
    } else {
      fs.writeFileSync(path.join(planDir, 'original.md'), fileOrigContent)
    }
  }

  const shadowMap: Record<string, string> = {}
  const defShadows: Record<string, { content: string; tampered?: string }> = {
    'tasks.md': { content: '# Tasks\n', tampered: '# TAMPERED SHADOW\n' },
    'progress.md': { content: '# Progress\n' },
    'amendments.md': { content: '# Amendments\n' },
    'reconciliation.md': { content: '# Recon\n' },
  }

  if (opts.parentSymlink) {
    const realBase = path.join(root, '_real_plans')
    const realPlanDir = path.join(realBase, planId_)
    fs.mkdirSync(path.join(realPlanDir, 'shadow'), { recursive: true })
    fs.mkdirSync(path.join(realPlanDir, 'amendments'), { recursive: true })
    fs.writeFileSync(path.join(realPlanDir, 'original.md'), fileOrigContent)
    for (const [name, info] of Object.entries(defShadows)) {
      fs.writeFileSync(path.join(realPlanDir, 'shadow', name), info.content)
      shadowMap[name] = c.createHash('sha256').update(Buffer.from(info.content, 'utf-8')).digest('hex')
    }
    if (fs.existsSync(planDir)) fs.rmSync(planDir, { recursive: true, force: true })
    fs.symlinkSync(realPlanDir, planDir)
  }

  if (!opts.noShadow) {
    for (const [name, info] of Object.entries(defShadows)) {
      const finalContent = opts.tamperShadow && info.tampered ? info.tampered : info.content
      fs.writeFileSync(path.join(shadowDir, name), finalContent)
      shadowMap[name] = c.createHash('sha256').update(Buffer.from(info.content, 'utf-8')).digest('hex')
    }
    if (opts.shadowTraversal) {
      const realFile = path.join(shadowDir, 'tasks.md')
      const badDir = path.join(root, 'outside')
      fs.mkdirSync(badDir, { recursive: true })
      fs.writeFileSync(path.join(badDir, 'hack.md'), '# HACK')
      fs.unlinkSync(realFile)
      fs.symlinkSync(badDir, realFile)
    }
  }

  const amendSha = (content: string) => c.createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex')

  const a1Content = opts.tamperAmendment ? '# TAMPERED\n' : '# Amendment 1\n'
  const a1Sha = amendSha('# Amendment 1\n')
  const a2Content = '# Amendment 2\n'
  const a2Sha = amendSha(a2Content)
  const a3Content = '# Amendment 3\n'
  const a3Sha = amendSha(a3Content)

  const manAmends: Array<{amendmentId: string; filename: string; sha256: string}> = []
  const ledgerAmends: Array<{amendmentId: string; approved: boolean; sha256: string; sourceRef: string}> = []

  if (!opts.noncontiguousAmendments) {
    manAmends.push({ amendmentId: 'AM-0001', filename: 'amd-001.md', sha256: a1Sha })
    manAmends.push({ amendmentId: 'AM-0002', filename: 'amd-002.md', sha256: a2Sha })
  } else {
    manAmends.push({ amendmentId: 'AM-0001', filename: 'amd-001.md', sha256: a1Sha })
    manAmends.push({ amendmentId: 'AM-0003', filename: 'amd-003.md', sha256: a3Sha })
  }

  if (opts.duplicateId) manAmends.push(manAmends[0])
  if (opts.duplicateFilename) { const dup = { ...manAmends[0], amendmentId: 'AM-0005' }; manAmends.push(dup) }

  if (!opts.missingAmendment) {
    fs.writeFileSync(path.join(amdDir, 'amd-001.md'), opts.tamperAmendment ? a1Content : '# Amendment 1\n')
  }
  fs.writeFileSync(path.join(amdDir, 'amd-002.md'), a2Content)

  if (opts.unlistedArtifact) {
    fs.writeFileSync(path.join(amdDir, 'rogue.md'), '# ROGUE')
  }

  if (opts.symlinkAmendment) {
    const tgt = path.join(root, 'amend-target.md')
    fs.writeFileSync(tgt, '# Amendment 1\n')
    fs.unlinkSync(path.join(amdDir, 'amd-001.md'))
    fs.symlinkSync(tgt, path.join(amdDir, 'amd-001.md'))
  }

  const ledgerOrderIds = opts.amendmentOrderMismatch ? ['AM-0002', 'AM-0001'] : manAmends.map(m => m.amendmentId)
  const mMap = new Map(manAmends.map(m => [m.amendmentId, m]))
  for (const id of ledgerOrderIds) {
    const m = mMap.get(id)
    if (m) ledgerAmends.push({ amendmentId: m.amendmentId, approved: true, sha256: m.sha256, sourceRef: `.agent/plans/${planId_}/amendments/${m.filename}` })
  }

  if (!opts.noManifest) {
    if (opts.malformedManifest) {
      fs.writeFileSync(path.join(amdDir, 'manifest.json'), 'not json')
    } else if (opts.duplicateId || opts.duplicateFilename || opts.noncontiguousAmendments) {
      const mPlanId = opts.manifestPlanIdMismatch ?? planId_
      const mOrigSha = opts.manifestShaMismatch ? '0000000000000000000000000000000000000000000000000000000000000000' : originalSha
      const rawAmends = manAmends.map((a, i) => ({ amendmentId: a.amendmentId, sha256: a.sha256, filename: a.filename, order: i }))
      fs.writeFileSync(path.join(amdDir, 'manifest.json'), JSON.stringify({ schema: 'harness/amendments-manifest/v1', planId: mPlanId, originalSha256: mOrigSha, amendments: rawAmends }, null, 2))
    } else {
      const mPlanId = opts.manifestPlanIdMismatch ?? planId_
      const mOrigSha = opts.manifestShaMismatch ? '0000000000000000000000000000000000000000000000000000000000000000' : originalSha
      writeManifest(planDir, mPlanId, mOrigSha, manAmends)
    }
  }

  if (opts.symlinkManifest) {
    const tgt = path.join(root, 'manifest-target.json')
    fs.writeFileSync(tgt, JSON.stringify({ schema: 'harness/amendments-manifest/v1', planId: planId_, originalSha256: originalSha, amendments: manAmends }))
    const mp = path.join(amdDir, 'manifest.json')
    if (fs.existsSync(mp)) fs.unlinkSync(mp)
    fs.symlinkSync(tgt, mp)
  }

  if (opts.traversalFilename) {
    const existing = path.join(amdDir, 'manifest.json')
    if (fs.existsSync(existing)) {
      const m = JSON.parse(fs.readFileSync(existing, 'utf-8'))
      m.amendments.push({ amendmentId: 'AM-0005', filename: opts.traversalFilename, sha256: a1Sha })
      fs.writeFileSync(existing, JSON.stringify(m))
    }
  }

  if (opts.traversalSourceRef) {
    ledgerAmends.push({ amendmentId: 'AM-0005', approved: true, sha256: a1Sha, sourceRef: opts.traversalSourceRef })
  }

  const fakeSha = '0000000000000000000000000000000000000000000000000000000000000000'
  const hash = 'a'.repeat(64)

  const anchor = { planSha256: originalSha, sectionHeading: 'Requirement 1', lineStart: 4, lineEnd: 4,
    anchorTextSha256: c.createHash('sha256').update(Buffer.from('Do the work.\n', 'utf-8')).digest('hex'), requirementId: 'REQ-001', chunkIndex: 0 }

  const planArt = { artifactId: 'PLAN-001', planId: planId_, sourceKind: 'chat_plan_artifact', sourceRef: 'msg-001',
    rawPath: `.agent/plans/${planId_}/original.md`, sha256: originalSha, bytes: originalBytes.length,
    capturedAt: '2026-07-26T00:00:00.000Z', status: 'ADOPTED', repositoryIdentity: 'agent-rules',
    repositoryBaseline: { commit: 'deadbeef', branch: 'main', dirtyFingerprint: hash },
    hostTask: { host: 'codex', taskRef: 'task-1', sessionRef: 'session-1' }, authorIdentity: 'planner',
    ownerIdentity: 'owner', approvalEvent: 'owner-approved', supersedes: [], supplements: [], derivedFrom: [] }

  function planAnchorId(a: typeof anchor): string {
    return c.createHash('sha256').update(Buffer.from([a.planSha256,a.sectionHeading,String(a.lineStart),String(a.lineEnd),a.anchorTextSha256,a.requirementId,String(a.chunkIndex)].join(':'),'utf-8')).digest('hex')
  }
  const anchorId = planAnchorId(anchor)
  function agg(rows: string[]): string { return c.createHash('sha256').update(Buffer.from(JSON.stringify([...rows].sort()),'utf-8')).digest('hex') }

  const effectivePlanId = opts.planIdMismatch || planId_
  const pp = { schema: 'harness/portable-plan', version: 3, planId: effectivePlanId, original: planArt,
    projectionSha256: hash, objective: 'Build the test fixture.',
    scope: { in: ['packages/engine'], out: [] }, decisions: [{ decisionId:'D1', decision:'Use typed contracts.', rationale:'Fail closed.', tradeOffs: [] }],
    assumptions: [], knownUnknowns: [], taskDag: [{ taskId:'T1', requirementIds:['REQ-001'], criterionIds:['AC1'], dependencies: [] }],
    ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: ['test-profile'], rollback: ['Revert the slice.'],
    handoff: { recipientRole:'reviewer', requiredArtifacts:['receipt'], nextSafeAction:'Review independently.' },
    lineage: { head: planArt, ancestors: [], resolutionMatrix: [{ requirementId:'REQ-001', sourceArtifactId:'PLAN-001', resolution:'CARRIED', rationale:'current' }], verified: true, reconciliationResult:'PASS', reconciliationSha256: hash },
    requirements: [{ requirementId:'REQ-001', statement:'Do the work.', acceptanceCriteria: [{ criterionId:'AC1', claim:'Work is done.', evidenceProfile:'test-profile', binding: { kind:'plan-anchor', anchor } }] }],
    anchors: [anchor] }

  const amendRows = ledgerAmends.filter(a => a.approved).map(a => JSON.stringify([a.amendmentId, a.sha256, a.sourceRef]))
  const expectedAmendSha = agg(amendRows)

  const ledger: Record<string, unknown> = { status: 'REVIEWING', plan: pp, planAnchors: [anchor],
    batches: [{ batchId:'P0', status:'PASSED', taskIds:['T1'] }], amendments: ledgerAmends,
    assignments: [], receipts: [], verificationClaims: [],
    attestations: [{ host:'codex',hostVersion:'1',commitSha:'deadbeef',capabilityStatus:'HOST_NATIVE',capabilityIds:['run'],contractSetSha256:hash,requestedModel:'standard',resolvedModel:'gpt',observedModel:'gpt',evidenceHashes:[hash],nativeRunnerIdentity:'codex-cli',issuedAt:'2026-07-26T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z'}],
    reconciliations: [{ requirementId:'REQ-001',status:'PARTIAL',anchorIds:[anchorId],verificationClaimIds:[] }],
    repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [],
    shadowRevision: 2, shadowHashes: opts.noShadow ? {} : shadowMap,
    latestReview: { reviewId:'R1', stale:false, originalSha256:originalSha,
      amendmentsSha256:expectedAmendSha, diffFingerprint:agg([]), receiptEvidenceFingerprint:agg([]),
      evidenceHashes: [], shadowRevision:2, reviewerIdentity:'final-reviewer' } }

  const ledgerPath = path.join(ledgerDir, planId_+'.json')
  if (opts.symlinkLedger) {
    const tgt = path.join(root, 'ledger-target.json'); fs.writeFileSync(tgt, JSON.stringify(ledger)); fs.symlinkSync(tgt, ledgerPath)
  } else if (opts.corruptLedger) {
    fs.writeFileSync(ledgerPath, 'not json')
  } else fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))

  if (opts.legacy) {
    const legacy = { schema_version:2, plan_id:planId_, status:'ADOPTED', execution_state:'IN_PROGRESS',
      effective_plan_identity:{ sha256:originalSha, original_sha256:originalSha }, amendments:[],
      reconciliations:[{ requirementId:'REQ-001', status:'PARTIAL' }],
      attestations:[{ profile:'test', status:'BOUND' }], findings:[], audit_events:[], shadow_revision:null }
    fs.writeFileSync(ledgerPath, JSON.stringify(legacy, null, 2))
  }
  return planId_
}

function zeroAmendmentFixture(root: string, planId: string, overrides?: { noManifest?: boolean; extraFile?: string; shadows?: Record<string, string> }): void {
  const fs = require('node:fs'); const path = require('node:path'); const c = require('node:crypto')
  const ld = path.join(root, '.agent', 'ledger'); const pd = path.join(root, '.agent', 'plans', planId)
  const sd = path.join(pd, 'shadow'); const ad = path.join(pd, 'amendments')
  fs.mkdirSync(ld, { recursive: true }); fs.mkdirSync(pd, { recursive: true }); fs.mkdirSync(sd, { recursive: true }); fs.mkdirSync(ad, { recursive: true })
  const orig = '# Z\n'; const oB = Buffer.from(orig, 'utf-8'); const oSha = c.createHash('sha256').update(oB).digest('hex')
  fs.writeFileSync(path.join(pd, 'original.md'), orig)
  const shContent: Record<string, string> = overrides?.shadows ?? { 'tasks.md': '# Tasks\n', 'progress.md': '# Progress\n', 'amendments.md': '# Amendments\n', 'reconciliation.md': '# Recon\n' }
  for (const [name, content] of Object.entries(shContent)) fs.writeFileSync(path.join(sd, name), content)
  const shHashes: Record<string, string> = {}
  for (const [name, content] of Object.entries(shContent)) shHashes[name] = c.createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex')
  const hash = 'a'.repeat(64)
  if (!overrides?.noManifest) fs.writeFileSync(path.join(ad, 'manifest.json'), buildManifestJson(planId, oSha, []))
  if (overrides?.extraFile) fs.writeFileSync(path.join(ad, overrides.extraFile), '# ROGUE')
  const anchor = { planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: c.createHash('sha256').update(Buffer.from('# Z\n', 'utf-8')).digest('hex'), requirementId: 'R1', chunkIndex: 0 }
  const aid = c.createHash('sha256').update(Buffer.from([anchor.planSha256, anchor.sectionHeading, String(anchor.lineStart), String(anchor.lineEnd), anchor.anchorTextSha256, anchor.requirementId, String(anchor.chunkIndex)].join(':'), 'utf-8')).digest('hex')
  function agg(r: string[]) { return c.createHash('sha256').update(Buffer.from(JSON.stringify([...r].sort()), 'utf-8')).digest('hex') }
  const pa = { artifactId: 'PA', planId, sourceKind: 'chat_plan_artifact', sourceRef: 'msg', rawPath: `.agent/plans/${planId}/original.md`, sha256: oSha, bytes: oB.length, capturedAt: '2026-01-01T00:00:00Z', status: 'ADOPTED', repositoryIdentity: 'r', repositoryBaseline: { commit: 'c', branch: 'b', dirtyFingerprint: hash }, hostTask: { host: 'h', taskRef: 't', sessionRef: 's' }, authorIdentity: 'a', ownerIdentity: 'o', approvalEvent: 'a', supersedes: [], supplements: [], derivedFrom: [] }
  const pp = { schema: 'harness/portable-plan', version: 3, planId, original: pa, projectionSha256: hash, objective: 'T', scope: { in: ['packages'], out: [] }, decisions: [{ decisionId: 'D1', decision: 'x', rationale: 'x', tradeOffs: [] }], assumptions: [], knownUnknowns: [], taskDag: [{ taskId: 'T1', requirementIds: ['R1'], criterionIds: ['C1'], dependencies: [] }], ownedPaths: ['packages'], forbiddenPaths: [], evidenceProfiles: ['p'], rollback: ['r'], handoff: { recipientRole: 'r', requiredArtifacts: ['r'], nextSafeAction: 'r' }, lineage: { head: pa, ancestors: [], resolutionMatrix: [{ requirementId: 'R1', sourceArtifactId: 'PA', resolution: 'CARRIED', rationale: 'r' }], verified: true, reconciliationResult: 'PASS', reconciliationSha256: hash }, requirements: [{ requirementId: 'R1', statement: 'x', acceptanceCriteria: [{ criterionId: 'C1', claim: 'x', evidenceProfile: 'p', binding: { kind: 'plan-anchor', anchor } }] }], anchors: [anchor] }
  const l = { status: 'REVIEWING', plan: pp, planAnchors: [anchor], batches: [{ batchId: 'P0', status: 'PASSED', taskIds: ['T1'] }], amendments: [], assignments: [], receipts: [], verificationClaims: [], attestations: [{ host: 'codex', hostVersion: '1', commitSha: 'deadbeef', capabilityStatus: 'HOST_NATIVE', capabilityIds: ['run'], contractSetSha256: hash, requestedModel: 'standard', resolvedModel: 'gpt', observedModel: 'gpt', evidenceHashes: [hash], nativeRunnerIdentity: 'codex-cli', issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }], reconciliations: [{ requirementId: 'R1', status: 'PARTIAL', anchorIds: [aid], verificationClaimIds: [] }], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [], shadowRevision: 1, shadowHashes: shHashes, latestReview: { reviewId: 'R1', stale: false, originalSha256: oSha, amendmentsSha256: agg([]), diffFingerprint: agg([]), receiptEvidenceFingerprint: agg([]), evidenceHashes: [], shadowRevision: 1, reviewerIdentity: 'r' } }
  fs.writeFileSync(path.join(ld, planId + '.json'), JSON.stringify(l))
}

function orderSensitivityFixture(root: string, pid: string, orderIds: string[]): void {
  const fs = require('node:fs'); const path = require('node:path'); const c = require('node:crypto')
  const ld = path.join(root, '.agent', 'ledger'); const pd = path.join(root, '.agent', 'plans', pid)
  const sd = path.join(pd, 'shadow'); const ad = path.join(pd, 'amendments')
  fs.mkdirSync(ld, { recursive: true }); fs.mkdirSync(pd, { recursive: true }); fs.mkdirSync(sd, { recursive: true }); fs.mkdirSync(ad, { recursive: true })
  const orig = '# O\n'; const oB = Buffer.from(orig, 'utf-8'); const oSha = c.createHash('sha256').update(oB).digest('hex')
  fs.writeFileSync(path.join(pd, 'original.md'), orig)
  const sDef: Record<string, string> = { 'tasks.md': '# Tasks\n', 'progress.md': '# Progress\n', 'amendments.md': '# Amendments\n', 'reconciliation.md': '# Recon\n' }
  const sHashes: Record<string, string> = {}
  for (const [n, c2] of Object.entries(sDef)) { fs.writeFileSync(path.join(sd, n), c2); sHashes[n] = c.createHash('sha256').update(Buffer.from(c2, 'utf-8')).digest('hex') }
  const hash = 'a'.repeat(64)
  const shaContent: Record<string, { sha256: string; content: string; filename: string }> = {
    'AM-0001': { sha256: c.createHash('sha256').update(Buffer.from('# A1\n')).digest('hex'), content: '# A1\n', filename: 'amd-001.md' },
    'AM-0002': { sha256: c.createHash('sha256').update(Buffer.from('# A2\n')).digest('hex'), content: '# A2\n', filename: 'amd-002.md' },
    'AM-0003': { sha256: c.createHash('sha256').update(Buffer.from('# A3\n')).digest('hex'), content: '# A3\n', filename: 'amd-003.md' },
  }
  for (const id of orderIds) { fs.writeFileSync(path.join(ad, shaContent[id].filename), shaContent[id].content) }
  const amendMap: Record<string, { amendmentId: string; filename: string; sha256: string; order: number }> = {}
  for (const id of orderIds) { amendMap[id] = { amendmentId: id, filename: shaContent[id].filename, sha256: shaContent[id].sha256, order: -1 } }
  const manEntries = orderIds.map((id, i) => ({ amendmentId: amendMap[id].amendmentId, sha256: amendMap[id].sha256, filename: amendMap[id].filename, order: i }))
  fs.writeFileSync(path.join(ad, 'manifest.json'), buildManifestJson(pid, oSha, manEntries))
  const anchor = { planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: c.createHash('sha256').update(Buffer.from('# O\n', 'utf-8')).digest('hex'), requirementId: 'R1', chunkIndex: 0 }
  const aid = c.createHash('sha256').update(Buffer.from([anchor.planSha256, anchor.sectionHeading, String(anchor.lineStart), String(anchor.lineEnd), anchor.anchorTextSha256, anchor.requirementId, String(anchor.chunkIndex)].join(':'), 'utf-8')).digest('hex')
  function agg(r: string[]) { return c.createHash('sha256').update(Buffer.from(JSON.stringify([...r].sort()), 'utf-8')).digest('hex') }
  const ledgerAmends = orderIds.map((id, i) => ({ amendmentId: id, approved: true, sha256: amendMap[id].sha256, sourceRef: `.agent/plans/${pid}/amendments/${amendMap[id].filename}` }))
  const pa = { artifactId: 'PA', planId: pid, sourceKind: 'chat_plan_artifact', sourceRef: 'msg', rawPath: `.agent/plans/${pid}/original.md`, sha256: oSha, bytes: oB.length, capturedAt: '2026-01-01T00:00:00Z', status: 'ADOPTED', repositoryIdentity: 'r', repositoryBaseline: { commit: 'c', branch: 'b', dirtyFingerprint: hash }, hostTask: { host: 'h', taskRef: 't', sessionRef: 's' }, authorIdentity: 'a', ownerIdentity: 'o', approvalEvent: 'a', supersedes: [], supplements: [], derivedFrom: [] }
  const pp = { schema: 'harness/portable-plan', version: 3, planId: pid, original: pa, projectionSha256: hash, objective: 'T', scope: { in: ['pkg'], out: [] }, decisions: [{ decisionId: 'D', decision: 'x', rationale: 'x', tradeOffs: [] }], assumptions: [], knownUnknowns: [], taskDag: [{ taskId: 'T1', requirementIds: ['R1'], criterionIds: ['C1'], dependencies: [] }], ownedPaths: ['pkg'], forbiddenPaths: [], evidenceProfiles: ['p'], rollback: ['r'], handoff: { recipientRole: 'r', requiredArtifacts: ['r'], nextSafeAction: 'r' }, lineage: { head: pa, ancestors: [], resolutionMatrix: [{ requirementId: 'R1', sourceArtifactId: 'PA', resolution: 'CARRIED', rationale: 'r' }], verified: true, reconciliationResult: 'PASS', reconciliationSha256: hash }, requirements: [{ requirementId: 'R1', statement: 'x', acceptanceCriteria: [{ criterionId: 'C1', claim: 'x', evidenceProfile: 'p', binding: { kind: 'plan-anchor', anchor } }] }], anchors: [anchor] }
  fs.writeFileSync(path.join(ld, pid + '.json'), JSON.stringify({ status: 'REVIEWING', plan: pp, planAnchors: [anchor], batches: [{ batchId: 'P0', status: 'PASSED', taskIds: ['T1'] }], amendments: ledgerAmends, assignments: [], receipts: [], verificationClaims: [], attestations: [{ host: 'codex', hostVersion: '1', commitSha: 'deadbeef', capabilityStatus: 'HOST_NATIVE', capabilityIds: ['run'], contractSetSha256: hash, requestedModel: 'standard', resolvedModel: 'gpt', observedModel: 'gpt', evidenceHashes: [hash], nativeRunnerIdentity: 'codex-cli', issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }], reconciliations: [{ requirementId: 'R1', status: 'PARTIAL', anchorIds: [aid], verificationClaimIds: [] }], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [], shadowRevision: 1, shadowHashes: sHashes, latestReview: { reviewId: 'R1', stale: false, originalSha256: oSha, amendmentsSha256: agg(ledgerAmends.map(a => JSON.stringify([a.amendmentId, a.sha256, a.sourceRef]))), diffFingerprint: agg([]), receiptEvidenceFingerprint: agg([]), evidenceHashes: [], shadowRevision: 1, reviewerIdentity: 'r' } }))
}

const tmp = require('node:fs').mkdtempSync(require('node:path').join(require('node:fs').realpathSync(require('node:os').tmpdir()), 'cp-plan-test-'))

describe('Plan workspace API', () => {
  beforeAll(() => {
    const fs = require('node:fs'); const path = require('node:path')
    process.env.HARNESS_ROOT = tmp
  })
  afterAll(() => {
    delete process.env.HARNESS_ROOT
    try { const fs = require('node:fs'); fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  })

  it('GET /api/plans lists plans', async () => {
    createFixture(tmp, 'plan-a'); createFixture(tmp, 'plan-b')
    const res = await request(app).get('/api/plans')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
    expect(res.body.data.some((p: { planId: string }) => p.planId === 'plan-a')).toBe(true)
    expect(res.body.data.some((p: { planId: string }) => p.planId === 'plan-b')).toBe(true)
  })

  it('rejects non-json files in ledger dir with 409', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    const ld = path.join(tmp, '.agent', 'ledger')
    fs.writeFileSync(path.join(ld, 'bad.txt'), '{}')
    const res = await request(app).get('/api/plans')
    expect(res.status).toBe(409)
    fs.unlinkSync(path.join(ld, 'bad.txt'))
  })

  it('valid plan returns canonical workspace', async () => {
    createFixture(tmp, 'vp')
    const res = await request(app).get('/api/plans/vp')
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true)
    expect(res.body.planId).toBe('vp'); expect(res.body.identity.integrity).toBe('VALID')
    expect(res.body.identity.status).toBe('REVIEWING')
    expect(res.body.identity.effectiveSha256).toBeTruthy()
    expect(res.body.plan.schema).toBe('harness/portable-plan')
    expect(res.body.originalMarkdown).toContain('# Test Plan')
    expect(res.body.reconciliationMatrix).toBeDefined()
    expect(Array.isArray(res.body.batches)).toBe(true)
    expect(Array.isArray(res.body.assignments)).toBe(true)
    expect(res.body.latestReview).toBeDefined()
    expect(res.body.shadowHashes).toBeDefined()
    expect(res.body.verificationSummary).toBeDefined()
  })

  it('tampered original returns 409 ORIGINAL_TAMPER', async () => {
    createFixture(tmp, 'to', { tamperOriginal: true })
    const res = await request(app).get('/api/plans/to')
    expect(res.status).toBe(409); expect(res.body.code).toBe('INTEGRITY_FAILURE')
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'ORIGINAL_TAMPER')).toBe(true)
  })

  it('missing original returns 409 MISSING_ORIGINAL', async () => {
    createFixture(tmp, 'mo', { noOriginal: true })
    const res = await request(app).get('/api/plans/mo')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MISSING_ORIGINAL')).toBe(true)
  })

  it('shadow drift returns 409 SHADOW_DRIFT', async () => {
    createFixture(tmp, 'sd', { tamperShadow: true })
    const res = await request(app).get('/api/plans/sd')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SHADOW_DRIFT')).toBe(true)
  })

  it('missing shadow returns 409 MISSING_SHADOW', async () => {
    createFixture(tmp, 'ms', { noShadow: true })
    const res = await request(app).get('/api/plans/ms')
    expect(res.status).toBe(409)
  })

  it('legacy shape returns 422', async () => {
    createFixture(tmp, 'lg', { legacy: true })
    const res = await request(app).get('/api/plans/lg')
    expect(res.status).toBe(422); expect(res.body.code).toBe('LEGACY_SHAPE')
  })

  it('traversal planId returns 400', async () => {
    const res = await request(app).get('/api/plans/a..b'); expect(res.status).toBe(400)
    const res2 = await request(app).get('/api/plans/test%2Fplan'); expect(res2.status).toBe(400)
  })

  it.skipIf(!SYMLINK_CAPABLE)('symlink ledger returns 409', async () => {
    createFixture(tmp, 'sl', { symlinkLedger: true })
    const res = await request(app).get('/api/plans/sl'); expect(res.status).toBe(409)
  })

  it.skipIf(!SYMLINK_CAPABLE)('symlink original returns 409', async () => {
    createFixture(tmp, 'so', { symlinkOriginal: true })
    const res = await request(app).get('/api/plans/so'); expect(res.status).toBe(409)
  })

  it('nonexistent plan returns 404', async () => {
    const res = await request(app).get('/api/plans/nope'); expect(res.status).toBe(404)
  })

  it('no false MATCH reconciliation', async () => {
    createFixture(tmp, 'nfm')
    const res = await request(app).get('/api/plans/nfm')
    expect(res.status).toBe(200)
    for (const row of res.body.reconciliationMatrix) expect(row.status).not.toBe('MATCH')
  })

  it('tampered amendment returns 409 AMENDMENT_TAMPER', async () => {
    createFixture(tmp, 'ta', { tamperAmendment: true })
    const res = await request(app).get('/api/plans/ta')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'AMENDMENT_TAMPER')).toBe(true)
  })

  it('missing amendment artifact returns 409 MISSING_AMENDMENT', async () => {
    createFixture(tmp, 'ma', { missingAmendment: true })
    const res = await request(app).get('/api/plans/ma')
    expect(res.status).toBe(409)
  })

  it('amendment order mismatch returns 409 AMENDMENT_ORDER', async () => {
    createFixture(tmp, 'ao', { amendmentOrderMismatch: true })
    const res = await request(app).get('/api/plans/ao')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'AMENDMENT_ORDER')).toBe(true)
  })

  it('planId mismatch in ledger returns 409 PLANID_MISMATCH', async () => {
    createFixture(tmp, 'req-id', { planIdMismatch: 'other-id' })
    const res = await request(app).get('/api/plans/req-id')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'PLANID_MISMATCH')).toBe(true)
  })

  it('planId mismatch in manifest returns 409 MANIFEST', async () => {
    createFixture(tmp, 'mpm', { manifestPlanIdMismatch: 'wrong-plan' })
    const res = await request(app).get('/api/plans/mpm')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it('originalSha256 mismatch in manifest returns 409 MANIFEST', async () => {
    createFixture(tmp, 'msm', { manifestShaMismatch: true })
    const res = await request(app).get('/api/plans/msm')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it('malformed manifest JSON returns 409 MANIFEST', async () => {
    createFixture(tmp, 'mm', { malformedManifest: true })
    const res = await request(app).get('/api/plans/mm')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it('noncontiguous amendment entries returns 409', async () => {
    createFixture(tmp, 'nc', { noncontiguousAmendments: true })
    const res = await request(app).get('/api/plans/nc')
    expect(res.status).toBe(409)
  })

  it('duplicate amendmentId in manifest returns 409 MANIFEST', async () => {
    createFixture(tmp, 'di', { duplicateId: true })
    const res = await request(app).get('/api/plans/di')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it('duplicate filename in manifest returns 409 MANIFEST', async () => {
    createFixture(tmp, 'df', { duplicateFilename: true })
    const res = await request(app).get('/api/plans/df')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it('unlisted markdown artifact returns 409 MANIFEST', async () => {
    createFixture(tmp, 'ua', { unlistedArtifact: true })
    const res = await request(app).get('/api/plans/ua')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it.skipIf(!SYMLINK_CAPABLE)('symlink manifest returns 409', async () => {
    createFixture(tmp, 'smf', { symlinkManifest: true })
    const res = await request(app).get('/api/plans/smf')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
  })

  it.skipIf(!SYMLINK_CAPABLE)('symlink amendment artifact returns 409', async () => {
    createFixture(tmp, 'saa', { symlinkAmendment: true })
    const res = await request(app).get('/api/plans/saa')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
  })

  it('missing manifest with amendments returns 409 MANIFEST', async () => {
    createFixture(tmp, 'nma', { noManifest: true })
    const res = await request(app).get('/api/plans/nma')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it('zero-amendment manifest with empty array passes', async () => {
    zeroAmendmentFixture(tmp, 'z-empty')
    const res = await request(app).get('/api/plans/z-empty')
    expect(res.status).toBe(200); expect(res.body.identity.integrity).toBe('VALID')
  })

  it('missing zero-amendment manifest fails MANIFEST', async () => {
    zeroAmendmentFixture(tmp, 'z-miss', { noManifest: true })
    const res = await request(app).get('/api/plans/z-miss')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })

  it.skipIf(!SYMLINK_CAPABLE)('shadow traversal via symlink returns 409 SYMLINK', async () => {
    createFixture(tmp, 'st', { shadowTraversal: true })
    const res = await request(app).get('/api/plans/st')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
  })

  it.skipIf(!SYMLINK_CAPABLE)('parent-directory symlink returns 409 SYMLINK', async () => {
    createFixture(tmp, 'ps', { parentSymlink: true })
    const res = await request(app).get('/api/plans/ps')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
  })

  it('traversal filename in manifest returns 409 MANIFEST', async () => {
    createFixture(tmp, 'tf', { traversalFilename: '../../escape.md' })
    const res = await request(app).get('/api/plans/tf')
    expect(res.status).toBe(409)
  })

  it('traversal sourceRef in ledger returns 409 PATH_ESCAPE', async () => {
    createFixture(tmp, 'tsr', { traversalSourceRef: '../../escape.md' })
    const res = await request(app).get('/api/plans/tsr')
    expect(res.status).toBe(409)
  })

  it('reordered amendments (manifest != ledger) returns 409 AMENDMENT_ORDER', async () => {
    createFixture(tmp, 'ro', { amendmentOrderMismatch: true })
    const res = await request(app).get('/api/plans/ro')
    expect(res.status).toBe(409)
    expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'AMENDMENT_ORDER')).toBe(true)
  })

  it('order sensitivity: different amendment sets produce different effective hashes', async () => {
    orderSensitivityFixture(tmp, 'order-a', ['AM-0001', 'AM-0002'])
    orderSensitivityFixture(tmp, 'order-b', ['AM-0001', 'AM-0003'])
    const ra = await request(app).get('/api/plans/order-a'); expect(ra.status).toBe(200)
    const rb = await request(app).get('/api/plans/order-b'); expect(rb.status).toBe(200)
    expect(ra.body.identity.effectiveSha256).not.toBe(rb.body.identity.effectiveSha256)
  })

  it('ENGINE_VALIDATION finding kind for structural errors', async () => {
    zeroAmendmentFixture(tmp, 'ev-test')
    const res = await request(app).get('/api/plans/ev-test')
    expect(res.status).toBe(200)
  })
  it('corrupt ledger JSON returns 409', async () => {
    createFixture(tmp, 'cldg', { corruptLedger: true })
    const res = await request(app).get('/api/plans/cldg')
    expect(res.status).toBe(409)
  })
  it('AM-0004 tombstoned returns 409 AMENDMENT_ORDER', async () => {
    const fs = require('node:fs'); const path = require('node:path'); const c = require('node:crypto')
    const planId = 'am4-api'
    const root = tmp
    const ld = path.join(root, '.agent', 'ledger'); const pd = path.join(root, '.agent', 'plans', planId)
    const sd = path.join(pd, 'shadow'); const ad = path.join(pd, 'amendments')
    fs.mkdirSync(ld, { recursive: true }); fs.mkdirSync(pd, { recursive: true }); fs.mkdirSync(sd, { recursive: true }); fs.mkdirSync(ad, { recursive: true })
    const orig = '# A\n'; const oB = Buffer.from(orig); const oSha = c.createHash('sha256').update(oB).digest('hex')
    fs.writeFileSync(path.join(pd, 'original.md'), orig)
    for (const n of ['tasks.md','progress.md','amendments.md','reconciliation.md']) fs.writeFileSync(path.join(sd, n), `# ${n}\n`)
    const tSha = c.createHash('sha256').update(Buffer.from('# tasks.md\n')).digest('hex')
    const pSha = c.createHash('sha256').update(Buffer.from('# progress.md\n')).digest('hex')
    const aSha = c.createHash('sha256').update(Buffer.from('# amendments.md\n')).digest('hex')
    const rSha = c.createHash('sha256').update(Buffer.from('# reconciliation.md\n')).digest('hex')
    const hash = 'a'.repeat(64)
    const a1Sha = c.createHash('sha256').update(Buffer.from('# A1\n')).digest('hex')
    fs.writeFileSync(path.join(ad, 'amd-001.md'), '# A1\n')
    fs.writeFileSync(path.join(ad, 'manifest.json'), JSON.stringify({ schema: 'harness/amendments-manifest/v1', planId, originalSha256: oSha, amendments: [{ amendmentId: 'AM-0004', sha256: a1Sha, filename: 'amd-001.md', order: 0 }] }, null, 2))
    const pa = { artifactId: 'PA', planId, sourceKind: 'chat_plan_artifact', sourceRef: 'msg', rawPath: `.agent/plans/${planId}/original.md`, sha256: oSha, bytes: oB.length, capturedAt: '2026-01-01T00:00:00Z', status: 'ADOPTED', repositoryIdentity: 'r', repositoryBaseline: { commit: 'c', branch: 'b', dirtyFingerprint: hash }, hostTask: { host: 'h', taskRef: 't', sessionRef: 's' }, authorIdentity: 'a', ownerIdentity: 'o', approvalEvent: 'a', supersedes: [], supplements: [], derivedFrom: [] }
    const pp = { schema: 'harness/portable-plan', version: 3, planId, original: pa, projectionSha256: hash, objective: 'T', scope: { in: ['pkg'], out: [] }, decisions: [{ decisionId: 'D', decision: 'x', rationale: 'x', tradeOffs: [] }], assumptions: [], knownUnknowns: [], taskDag: [{ taskId: 'T1', requirementIds: ['R1'], criterionIds: ['C1'], dependencies: [] }], ownedPaths: ['pkg'], forbiddenPaths: [], evidenceProfiles: ['p'], rollback: ['r'], handoff: { recipientRole: 'r', requiredArtifacts: ['r'], nextSafeAction: 'r' }, lineage: { head: pa, ancestors: [], resolutionMatrix: [{ requirementId: 'R1', sourceArtifactId: 'PA', resolution: 'CARRIED', rationale: 'r' }], verified: true, reconciliationResult: 'PASS', reconciliationSha256: hash }, requirements: [{ requirementId: 'R1', statement: 'x', acceptanceCriteria: [{ criterionId: 'C1', claim: 'x', evidenceProfile: 'p', binding: { kind: 'plan-anchor', anchor: { planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: c.createHash('sha256').update(Buffer.from('# A\n')).digest('hex'), requirementId: 'R1', chunkIndex: 0 } } }] }], anchors: [{ planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: c.createHash('sha256').update(Buffer.from('# A\n')).digest('hex'), requirementId: 'R1', chunkIndex: 0 }] }
    function agg(r: string[]) { return c.createHash('sha256').update(Buffer.from(JSON.stringify([...r].sort()),'utf-8')).digest('hex') }
    fs.writeFileSync(path.join(ld, planId+'.json'), JSON.stringify({ status: 'REVIEWING', plan: pp, planAnchors: [{ planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: c.createHash('sha256').update(Buffer.from('# A\n')).digest('hex'), requirementId: 'R1', chunkIndex: 0 }], batches: [{ batchId: 'P0', status: 'PASSED', taskIds: ['T1'] }], amendments: [{ amendmentId: 'AM-0004', approved: true, sha256: a1Sha, sourceRef: `.agent/plans/${planId}/amendments/amd-001.md` }], assignments: [], receipts: [], verificationClaims: [], attestations: [{ host: 'codex', hostVersion: '1', commitSha: 'deadbeef', capabilityStatus: 'HOST_NATIVE', capabilityIds: ['run'], contractSetSha256: hash, requestedModel: 'standard', resolvedModel: 'gpt', observedModel: 'gpt', evidenceHashes: [hash], nativeRunnerIdentity: 'codex-cli', issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }], reconciliations: [{ requirementId: 'R1', status: 'PARTIAL', anchorIds: [c.createHash('sha256').update(Buffer.from('dummy')).digest('hex')], verificationClaimIds: [] }], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [], shadowRevision: 1, shadowHashes: { 'tasks.md': tSha, 'progress.md': pSha, 'amendments.md': aSha, 'reconciliation.md': rSha }, latestReview: { reviewId: 'R1', stale: false, originalSha256: oSha, amendmentsSha256: agg([]), diffFingerprint: agg([]), receiptEvidenceFingerprint: agg([]), evidenceHashes: [], shadowRevision: 1, reviewerIdentity: 'r' } }))
    const res = await request(app).get(`/api/plans/${planId}`)
    expect(res.status).toBe(409)
  })
  it.skipIf(!SYMLINK_CAPABLE)('listPlans fails on symlink in ledger dir returns 409', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    const tgt = path.join(tmp, 'symlink-target'); fs.writeFileSync(tgt, '{}')
    fs.symlinkSync(tgt, path.join(tmp, '.agent', 'ledger', 'symlink-plan.json'))
    const res = await request(app).get('/api/plans')
    expect(res.status).toBe(409)
    fs.unlinkSync(path.join(tmp, '.agent', 'ledger', 'symlink-plan.json'))
  })
  it('listPlans fails on non-json file in ledger dir returns 409', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    fs.writeFileSync(path.join(tmp, '.agent', 'ledger', 'README.md'), '# Ledger')
    const res = await request(app).get('/api/plans')
    expect(res.status).toBe(409)
    fs.unlinkSync(path.join(tmp, '.agent', 'ledger', 'README.md'))
  })
})

describe('Overview plan-integrity regression', () => {
  // These tests verify that plan integrity errors on the overview/plan read path
  // produce a well-formed 409 response so the UI can render an honest error state.
  beforeAll(() => { process.env.HARNESS_ROOT = tmp })
  afterAll(() => { delete process.env.HARNESS_ROOT })

  function cleanupRegFixtures(planIds: string[]) {
    const fs = require('node:fs'); const path = require('node:path')
    for (const id of planIds) {
      try { fs.rmSync(path.join(tmp, '.agent', 'ledger', `${id}.json`), { force: true }) } catch {}
      try { fs.rmSync(path.join(tmp, '.agent', 'plans', id), { recursive: true, force: true }) } catch {}
    }
  }

  afterEach(() => { cleanupRegFixtures(['reg-tampered', 'reg-multi', 'reg-malformed', 'reg-valid-x', 'reg-legacy', 'reg-corrupt-file']) })

  it('tampered plan returns 409 on individual fetch', async () => {
    // Individual plan fetch is the primary path for overview/plan UI
    createFixture(tmp, 'reg-tampered', { tamperOriginal: true })
    const badRes = await request(app).get('/api/plans/reg-tampered')
    expect(badRes.status).toBe(409)
    expect(badRes.body.code).toBe('INTEGRITY_FAILURE')
    expect(badRes.body.details.findings.some((f: { kind: string }) => f.kind === 'ORIGINAL_TAMPER')).toBe(true)
    expect(badRes.body.error).toBeTruthy()
  })

  it('list endpoint returns 409 on ledger corruption (not 500)', async () => {
    // Verifies fail-closed: any ledger corruption causes 409, not crash
    const fs = require('node:fs'); const path = require('node:path')
    fs.writeFileSync(path.join(tmp, '.agent', 'ledger', 'reg-corrupt-file.json'), 'not-json{')
    const res = await request(app).get('/api/plans')
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INTEGRITY_FAILURE')
    expect(res.body.details.findings.length).toBeGreaterThan(0)
    fs.unlinkSync(path.join(tmp, '.agent', 'ledger', 'reg-corrupt-file.json'))
  })

  it('individual plan fetch returns 409 with full findings on multiple failures', async () => {
    // Verifies the 409 response includes all findings, not just the first
    createFixture(tmp, 'reg-multi', { tamperOriginal: true, tamperShadow: true })
    const res = await request(app).get('/api/plans/reg-multi')
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INTEGRITY_FAILURE')
    const kinds = res.body.details.findings.map((f: { kind: string }) => f.kind)
    expect(kinds).toContain('ORIGINAL_TAMPER')
    expect(kinds).toContain('SHADOW_DRIFT')
  })

  // Note: list endpoint is fail-closed — any legacy or corrupt plan in ledger causes 409,
  // not partial results. The primary path for "get a specific plan" is GET /api/plans/:planId.

  it('409 response body is valid JSON with required fields', async () => {
    createFixture(tmp, 'reg-malformed', { malformedManifest: true })
    const res = await request(app).get('/api/plans/reg-malformed')
    expect(res.status).toBe(409)
    expect(res.body).toHaveProperty('ok', false)
    expect(res.body).toHaveProperty('code', 'INTEGRITY_FAILURE')
    expect(res.body).toHaveProperty('error')
    expect(res.body).toHaveProperty('details')
    expect(res.body.details).toHaveProperty('findings')
    expect(Array.isArray(res.body.details.findings)).toBe(true)
    expect(res.body.details.findings[0]).toHaveProperty('kind')
    expect(res.body.details.findings[0]).toHaveProperty('detail')
  })
})

describe('Adversarial integrity', () => {
  beforeAll(() => { process.env.HARNESS_ROOT = tmp })
  afterAll(() => { delete process.env.HARNESS_ROOT })
  it.skipIf(!SYMLINK_CAPABLE)('.agent symlink returns 409 SYMLINK', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    createFixture(tmp, 'ag-sym')
    const agentPath = path.join(tmp, '.agent'); const realAgent = path.join(tmp, '_real_agent')
    fs.renameSync(agentPath, realAgent); fs.symlinkSync(realAgent, agentPath)
    const res = await request(app).get('/api/plans/ag-sym')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
    fs.unlinkSync(agentPath); fs.renameSync(realAgent, agentPath)
  })
  it.skipIf(!SYMLINK_CAPABLE)('ledger dir symlink returns 409 SYMLINK', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    createFixture(tmp, 'ld-sym')
    const ld = path.join(tmp, '.agent', 'ledger'); const realLd = path.join(tmp, '.agent', '_real_ledger')
    fs.renameSync(ld, realLd); fs.symlinkSync(realLd, ld)
    const res = await request(app).get('/api/plans/ld-sym')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
    fs.unlinkSync(ld); fs.renameSync(realLd, ld)
  })
  it.skipIf(!SYMLINK_CAPABLE)('plans dir symlink returns 409 SYMLINK', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    createFixture(tmp, 'pd-sym')
    const pd = path.join(tmp, '.agent', 'plans'); const realPd = path.join(tmp, '.agent', '_real_plans')
    fs.renameSync(pd, realPd); fs.symlinkSync(realPd, pd)
    const res = await request(app).get('/api/plans/pd-sym')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
    fs.unlinkSync(pd); fs.renameSync(realPd, pd)
  })
  it.skipIf(!SYMLINK_CAPABLE)('root symlink returns 409 SYMLINK', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    const altRoot = path.join(require('node:os').tmpdir(), 'cp-root-test-' + Date.now())
    fs.mkdirSync(altRoot, { recursive: true }); createFixture(altRoot, 'vp')
    const linkRoot = path.join(altRoot, '_root_link')
    fs.symlinkSync(altRoot, linkRoot)
    const old = process.env.HARNESS_ROOT; process.env.HARNESS_ROOT = linkRoot
    const res = await request(app).get('/api/plans/vp')
    process.env.HARNESS_ROOT = old
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SYMLINK')).toBe(true)
    fs.rmSync(altRoot, { recursive: true, force: true })
  })
  it('Windows backslash traversal sourceRef returns 409 PATH_ESCAPE', async () => {
    createFixture(tmp, 'ws-tr', { traversalSourceRef: '..\\..\\escape.md' })
    const res = await request(app).get('/api/plans/ws-tr')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'PATH_ESCAPE')).toBe(true)
  })
  it('Percent-encoded traversal sourceRef returns 409 PATH_ESCAPE', async () => {
    createFixture(tmp, 'pe-tr', { traversalSourceRef: '%2e%2e%2fescape.md' })
    const res = await request(app).get('/api/plans/pe-tr')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'PATH_ESCAPE')).toBe(true)
  })
  it('dot filename in manifest returns 409 MANIFEST', async () => {
    const fs = require('node:fs'); const path = require('node:path'); const c = require('node:crypto')
    const planId = 'dot-fn'
    const ld = path.join(tmp, '.agent', 'ledger'); const pd = path.join(tmp, '.agent', 'plans', planId)
    const sd = path.join(pd, 'shadow'); const ad = path.join(pd, 'amendments')
    fs.mkdirSync(ld, { recursive: true }); fs.mkdirSync(pd, { recursive: true }); fs.mkdirSync(sd, { recursive: true }); fs.mkdirSync(ad, { recursive: true })
    const orig = '# D\n'; const oB = Buffer.from(orig, 'utf-8'); const oSha = c.createHash('sha256').update(oB).digest('hex')
    fs.writeFileSync(path.join(pd, 'original.md'), orig)
    fs.writeFileSync(path.join(sd, 'tasks.md'), '# Tasks\n'); fs.writeFileSync(path.join(sd, 'progress.md'), '# Progress\n')
    fs.writeFileSync(path.join(sd, 'amendments.md'), '# Amendments\n'); fs.writeFileSync(path.join(sd, 'reconciliation.md'), '# Recon\n')
    const tSha = c.createHash('sha256').update(Buffer.from('# Tasks\n', 'utf-8')).digest('hex')
    const pSha = c.createHash('sha256').update(Buffer.from('# Progress\n', 'utf-8')).digest('hex')
    const aSha = c.createHash('sha256').update(Buffer.from('# Amendments\n', 'utf-8')).digest('hex')
    const rSha = c.createHash('sha256').update(Buffer.from('# Recon\n', 'utf-8')).digest('hex')
    const hash = 'a'.repeat(64)
    fs.writeFileSync(path.join(ad, 'manifest.json'), JSON.stringify({ schema: 'harness/amendments-manifest/v1', planId, originalSha256: oSha, amendments: [{ amendmentId: 'AM-0001', sha256: hash, filename: '.hidden.md', order: 0 }] }))
    const anchor = { planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: c.createHash('sha256').update(Buffer.from('# D\n', 'utf-8')).digest('hex'), requirementId: 'R1', chunkIndex: 0 }
    const aid = c.createHash('sha256').update(Buffer.from([anchor.planSha256,anchor.sectionHeading,String(anchor.lineStart),String(anchor.lineEnd),anchor.anchorTextSha256,anchor.requirementId].join(':'),'utf-8')).digest('hex')
    function agg(r: string[]) { return c.createHash('sha256').update(Buffer.from(JSON.stringify([...r].sort()),'utf-8')).digest('hex') }
    const pa = { artifactId:'PA', planId, sourceKind:'chat_plan_artifact', sourceRef:'msg', rawPath:`.agent/plans/${planId}/original.md`, sha256:oSha, bytes:oB.length, capturedAt:'2026-01-01T00:00:00Z', status:'ADOPTED', repositoryIdentity:'r', repositoryBaseline:{commit:'c',branch:'b',dirtyFingerprint:hash}, hostTask:{host:'h',taskRef:'t',sessionRef:'s'}, authorIdentity:'a', ownerIdentity:'o', approvalEvent:'a', supersedes:[], supplements:[], derivedFrom:[] }
    const pp = { schema:'harness/portable-plan', version:3, planId, original:pa, projectionSha256:hash, objective:'T', scope:{in:['packages'],out:[]}, decisions:[{decisionId:'D1',decision:'x',rationale:'x',tradeOffs:[]}], assumptions:[], knownUnknowns:[], taskDag:[{taskId:'T1',requirementIds:['R1'],criterionIds:['C1'],dependencies:[]}], ownedPaths:['packages'], forbiddenPaths:[], evidenceProfiles:['p'], rollback:['r'], handoff:{recipientRole:'r',requiredArtifacts:['r'],nextSafeAction:'r'}, lineage:{head:pa,ancestors:[],resolutionMatrix:[{requirementId:'R1',sourceArtifactId:'PA',resolution:'CARRIED',rationale:'r'}],verified:true,reconciliationResult:'PASS',reconciliationSha256:hash}, requirements:[{requirementId:'R1',statement:'x',acceptanceCriteria:[{criterionId:'C1',claim:'x',evidenceProfile:'p',binding:{kind:'plan-anchor',anchor}}]}], anchors:[anchor] }
    const ledger = { status:'REVIEWING', plan:pp, planAnchors:[anchor], batches:[{batchId:'P0',status:'PASSED',taskIds:['T1']}], amendments:[{ amendmentId: 'AM-0001', approved: true, sha256: hash, sourceRef: '.agent/plans/dot-fn/amendments/.hidden.md' }], assignments:[], receipts:[], verificationClaims:[], attestations:[{host:'codex',hostVersion:'1',commitSha:'deadbeef',capabilityStatus:'HOST_NATIVE',capabilityIds:['run'],contractSetSha256:hash,requestedModel:'standard',resolvedModel:'gpt',observedModel:'gpt',evidenceHashes:[hash],nativeRunnerIdentity:'codex-cli',issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}], reconciliations:[{requirementId:'R1',status:'PARTIAL',anchorIds:[aid],verificationClaimIds:[]}], repairSlices:[], sourceAcquisitionReceipts:[], orphanFindings:[], shadowRevision:1, shadowHashes:{'tasks.md':tSha,'progress.md':pSha,'amendments.md':aSha,'reconciliation.md':rSha}, latestReview:{reviewId:'R1',stale:false,originalSha256:oSha,amendmentsSha256:agg([]),diffFingerprint:agg([]),receiptEvidenceFingerprint:agg([]),evidenceHashes:[],shadowRevision:1,reviewerIdentity:'r'} }
    fs.writeFileSync(path.join(ld, planId+'.json'), JSON.stringify(ledger))
    const res = await request(app).get(`/api/plans/${planId}`)
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })
  it('extra shadow file returns 409 SHADOW_DRIFT', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    createFixture(tmp, 'ex-sh')
    fs.writeFileSync(path.join(tmp, '.agent', 'plans', 'ex-sh', 'shadow', 'rogue.md'), '# ROGUE')
    const res = await request(app).get('/api/plans/ex-sh')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'SHADOW_DRIFT')).toBe(true)
  })
  it('extra file in zero amendments returns 409 MANIFEST', async () => {
    zeroAmendmentFixture(tmp, 'z-extra', { extraFile: 'rogue.md' })
    const res = await request(app).get('/api/plans/z-extra')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })
  it('noncanonical manifest key order returns 409 MANIFEST', async () => {
    const fs = require('node:fs'); const path = require('node:path'); const c = require('node:crypto')
    createFixture(tmp, 'nc-m')
    const mp = path.join(tmp, '.agent', 'plans', 'nc-m', 'amendments', 'manifest.json')
    const raw = JSON.parse(fs.readFileSync(mp, 'utf-8'))
    const reordered = { planId: raw.planId, originalSha256: raw.originalSha256, amendments: raw.amendments, schema: raw.schema }
    fs.writeFileSync(mp, JSON.stringify(reordered, null, 2))
    const res = await request(app).get('/api/plans/nc-m')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'MANIFEST')).toBe(true)
  })
  it('IO error on original.md returns 409 IO_FAULT', async () => {
    const fs = require('node:fs'); const path = require('node:path')
    createFixture(tmp, 'io-err')
    const op = path.join(tmp, '.agent', 'plans', 'io-err', 'original.md')
    fs.chmodSync(op, 0o000)
    const res = await request(app).get('/api/plans/io-err')
    expect(res.status).toBe(409); expect(res.body.details.findings.some((f: { kind: string }) => f.kind === 'IO_FAULT')).toBe(true)
    fs.chmodSync(op, 0o644)
  })
})

describe('Plan validation callable', () => {
  it('rejects double dots', () => { expect(() => validatePlanId('test..plan')).toThrow('Path traversal') })
  it('rejects empty', () => { expect(() => validatePlanId('')).toThrow('Invalid planId') })
  it('rejects slash', () => { expect(() => validatePlanId('a/b')).toThrow('Invalid planId') })
  it('rejects too long', () => { expect(() => validatePlanId('x'.repeat(129))).toThrow('planId too long') })
  it('accepts valid', () => { expect(() => validatePlanId('valid-plan-id_001')).not.toThrow() })
})
