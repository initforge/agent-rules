import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { buildManifestJson, PlanValidationError, PlanNotFoundError } from '@initforge/agent-rules-engine/plan-identity'
import {
  PlanIntegrityError,
  readPlanWorkspace, listPlans,
  type FsSeamReaders,
} from '../src/schemas/plan-workspace'

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-')) }

function sha(data: string): string { return crypto.createHash('sha256').update(Buffer.from(data, 'utf-8')).digest('hex') }

function writeFixture(root: string, planId: string, overrides?: {
  noAmendDir?: boolean; noShadowDir?: boolean; noManifest?: boolean
  manifestLength?: number; ledgerAmendLength?: number
  dupId?: boolean; dupName?: boolean; badSourceRef?: string
  extraNonMd?: string; extraDir?: string; extraSymlink?: boolean
  shadowSymlink?: string; shadowWrongType?: boolean
  corruptLedger?: boolean; rootFile?: boolean
}) {
  const ld = path.join(root, '.agent', 'ledger')
  const pd = path.join(root, '.agent', 'plans', planId)
  const ad = path.join(pd, 'amendments')
  const sd = path.join(pd, 'shadow')
  fs.mkdirSync(ld, { recursive: true })
  fs.mkdirSync(pd, { recursive: true })
  if (!overrides?.noAmendDir) fs.mkdirSync(ad, { recursive: true })
  if (!overrides?.noShadowDir) fs.mkdirSync(sd, { recursive: true })

  const origContent = '# Test Plan\n\n## Requirement 1\nDo the work.\n'
  const origBytes = Buffer.from(origContent, 'utf-8')
  const origSha = sha(origContent)
  fs.writeFileSync(path.join(pd, 'original.md'), origContent)

  if (!overrides?.noShadowDir) {
    for (const name of ['tasks.md', 'progress.md', 'amendments.md', 'reconciliation.md']) {
      let c: string
      if (overrides?.shadowSymlink && name === overrides.shadowSymlink) {
        const tgt = path.join(root, `shadow-${name}`); fs.writeFileSync(tgt, '# content\n'); fs.symlinkSync(tgt, path.join(sd, name)); continue
      }
      if (overrides?.shadowWrongType && name === overrides.shadowWrongType) { fs.mkdirSync(path.join(sd, name)); continue }
      if (name === 'tasks.md') c = '# Tasks\n'
      else if (name === 'progress.md') c = '# Progress\n'
      else if (name === 'amendments.md') c = '# Amendments\n'
      else c = '# Recon\n'
      fs.writeFileSync(path.join(sd, name), c)
    }
  }

  const a1Sha = sha('# Amendment 1\n')
  const a2Sha = sha('# Amendment 2\n')

  if (!overrides?.noAmendDir) {
    fs.writeFileSync(path.join(ad, 'amd-001.md'), '# Amendment 1\n')
    fs.writeFileSync(path.join(ad, 'amd-002.md'), '# Amendment 2\n')
  }

  const canonIds = ['AM-0001', 'AM-0002', 'AM-0003', 'AM-0005', 'AM-0006', 'AM-0007', 'AM-0008']

  if (!overrides?.noManifest && !overrides?.noAmendDir) {
    const manLen = overrides?.manifestLength ?? 2
    const ledgerAmendLen = overrides?.ledgerAmendLength ?? 2
    const needsManual = overrides?.dupId || overrides?.dupName || manLen !== ledgerAmendLen
    if (needsManual) {
      const manAmends: Array<{ amendmentId: string; filename: string; sha256: string; order: number }> = []
      for (let i = 0; i < manLen; i++) {
        const baseId = canonIds[i] || 'AM-0001'
        const id = i === 0 ? 'AM-0001' : (overrides?.dupId && i === 1 ? 'AM-0001' : (canonIds[i] || 'AM-0002'))
        const nm = i === 0 ? 'amd-001.md' : (overrides?.dupName && i === 1 ? 'amd-001.md' : 'amd-002.md')
        manAmends.push({ amendmentId: id, sha256: i === 0 ? a1Sha : a2Sha, filename: nm, order: i })
      }
      const raw = { schema: 'harness/amendments-manifest/v1', planId, originalSha256: origSha, amendments: manAmends.map(a => ({ amendmentId: a.amendmentId, sha256: a.sha256, filename: a.filename, order: a.order })) }
      fs.writeFileSync(path.join(ad, 'manifest.json'), JSON.stringify(raw, null, 2))
    } else {
      const manAmends: Array<{ amendmentId: string; filename: string; sha256: string; order: number }> = []
      for (let i = 0; i < manLen; i++) {
        const id = i === 0 ? 'AM-0001' : 'AM-0002'
        const nm = i === 0 ? 'amd-001.md' : 'amd-002.md'
        manAmends.push({ amendmentId: id, sha256: i === 0 ? a1Sha : a2Sha, filename: nm, order: i })
      }
      const json = buildManifestJson(planId, origSha, manAmends)
      fs.writeFileSync(path.join(ad, 'manifest.json'), json)
    }
  }

  if (overrides?.extraNonMd && !overrides?.noAmendDir) fs.writeFileSync(path.join(ad, overrides.extraNonMd), '{}')
  if (overrides?.extraDir && !overrides?.noAmendDir) fs.mkdirSync(path.join(ad, overrides.extraDir))
  if (overrides?.extraSymlink && !overrides?.noAmendDir) {
    const tgt = path.join(root, 'xtra-target'); fs.writeFileSync(tgt, '# extra\n'); fs.symlinkSync(tgt, path.join(ad, 'extra-link.md'))
  }

  const ledgerAmendLen = overrides?.ledgerAmendLength ?? 2
  const ledgerAmends: Array<{ amendmentId: string; approved: boolean; sha256: string; sourceRef: string }> = []
  for (let i = 0; i < ledgerAmendLen; i++) {
    const id = i === 0 ? 'AM-0001' : 'AM-0002'
    const sh = i === 0 ? a1Sha : a2Sha
    const src = overrides?.badSourceRef ?? `.agent/plans/${planId}/amendments/${i === 0 ? 'amd-001.md' : 'amd-002.md'}`
    ledgerAmends.push({ amendmentId: id, approved: true, sha256: sh, sourceRef: src })
  }
  if (overrides?.badSourceRef && ledgerAmends.length > 0) ledgerAmends[0].approved = true

  const hash = 'a'.repeat(64)
  const anchor = { planSha256: origSha, sectionHeading: 'Requirement 1', lineStart: 4, lineEnd: 4,
    anchorTextSha256: sha('Do the work.\n'), requirementId: 'REQ-001' }
  const pa = { artifactId: 'PA', planId, sourceKind: 'chat_plan_artifact', sourceRef: 'msg',
    rawPath: `.agent/plans/${planId}/original.md`, sha256: origSha, bytes: origBytes.length,
    capturedAt: '2026-07-26T00:00:00.000Z', status: 'ADOPTED', repositoryIdentity: 'r',
    repositoryBaseline: { commit: 'c', branch: 'b', dirtyFingerprint: hash },
    hostTask: { host: 'h', taskRef: 't', sessionRef: 's' }, authorIdentity: 'a', ownerIdentity: 'o',
    approvalEvent: 'a', supersedes: [], supplements: [], derivedFrom: [] }

  function agg(rows: string[]): string { return crypto.createHash('sha256').update(Buffer.from(JSON.stringify([...rows].sort()), 'utf-8')).digest('hex') }
  const aid = crypto.createHash('sha256').update(Buffer.from([anchor.planSha256, anchor.sectionHeading, String(anchor.lineStart), String(anchor.lineEnd), anchor.anchorTextSha256, anchor.requirementId].join(':'), 'utf-8')).digest('hex')

  const pp = { schema: 'harness/portable-plan', version: 3, planId, original: pa,
    projectionSha256: hash, objective: 'Build the test fixture.',
    scope: { in: ['packages/engine'], out: [] },
    decisions: [{ decisionId: 'D1', decision: 'Use typed contracts.', rationale: 'Fail closed.', tradeOffs: [] }],
    assumptions: [], knownUnknowns: [],
    taskDag: [{ taskId: 'T1', requirementIds: ['REQ-001'], criterionIds: ['AC1'], dependencies: [] }],
    ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: ['test-profile'],
    rollback: ['Revert the slice.'],
    handoff: { recipientRole: 'reviewer', requiredArtifacts: ['receipt'], nextSafeAction: 'Review independently.' },
    lineage: { head: pa, ancestors: [], resolutionMatrix: [{ requirementId: 'REQ-001', sourceArtifactId: 'PA', resolution: 'CARRIED', rationale: 'current' }], verified: true, reconciliationResult: 'PASS', reconciliationSha256: hash },
    requirements: [{ requirementId: 'REQ-001', statement: 'Do the work.', acceptanceCriteria: [{ criterionId: 'AC1', claim: 'Work is done.', evidenceProfile: 'test-profile', binding: { kind: 'plan-anchor', anchor } }] }],
    anchors: [anchor] }

  const tSha = sha('# Tasks\n'); const pSha = sha('# Progress\n'); const aSha = sha('# Amendments\n'); const rSha = sha('# Recon\n')
  const sMap: Record<string, string> = { 'tasks.md': tSha, 'progress.md': pSha, 'amendments.md': aSha, 'reconciliation.md': rSha }
  const ledger = { status: 'REVIEWING', plan: pp, planAnchors: [anchor],
    batches: [{ batchId: 'P0', status: 'PASSED', taskIds: ['T1'] }], amendments: ledgerAmends,
    assignments: [], receipts: [], verificationClaims: [],
    attestations: [{ host: 'codex', hostVersion: '1', commitSha: 'deadbeef', capabilityStatus: 'HOST_NATIVE', capabilityIds: ['run'], contractSetSha256: hash, requestedModel: 'standard', resolvedModel: 'gpt', observedModel: 'gpt', evidenceHashes: [hash], nativeRunnerIdentity: 'codex-cli', issuedAt: '2026-07-26T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' }],
    reconciliations: [{ requirementId: 'REQ-001', status: 'PARTIAL', anchorIds: [aid], verificationClaimIds: [] }],
    repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [],
    shadowRevision: 2,
    shadowHashes: sMap,
    latestReview: { reviewId: 'R1', stale: false, originalSha256: origSha,
      amendmentsSha256: agg(ledgerAmends.map(a => JSON.stringify([a.amendmentId, a.sha256, a.sourceRef]))),
      diffFingerprint: agg([]), receiptEvidenceFingerprint: agg([]),
      evidenceHashes: [], shadowRevision: 2, reviewerIdentity: 'final-reviewer' } }

  if (overrides?.corruptLedger) fs.writeFileSync(path.join(ld, `${planId}.json`), 'not json')
  else fs.writeFileSync(path.join(ld, `${planId}.json`), JSON.stringify(ledger))
}

describe('readPlanWorkspace - bundle presence', () => {
  it('missing amendments dir fails', () => {
    const root = tmpDir(); const pid = 'no-amd'
    writeFixture(root, pid, { noAmendDir: true })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
  it('missing shadow dir with ledger hashes fails', () => {
    const root = tmpDir(); const pid = 'no-shd'
    writeFixture(root, pid, { noShadowDir: true })
    try { readPlanWorkspace(pid, root); expect.fail('should throw') } catch (e: unknown) {
      expect(e).toBeInstanceOf(PlanIntegrityError)
      expect((e as PlanIntegrityError).findings.some(f => f.kind === 'MISSING_SHADOW')).toBe(true)
    }
  })
})

describe('validateManifest - length mismatch', () => {
  it('manifest shorter than ledger fails', () => {
    const root = tmpDir(); const pid = 'short'
    writeFixture(root, pid, { manifestLength: 1, ledgerAmendLength: 2 })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
  it('manifest longer than ledger fails', () => {
    const root = tmpDir(); const pid = 'long'
    writeFixture(root, pid, { manifestLength: 3, ledgerAmendLength: 2 })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('validateManifest - duplicates', () => {
  it('duplicate amendmentId fails', () => {
    const root = tmpDir(); const pid = 'dup-id'
    writeFixture(root, pid, { dupId: true })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
  it('duplicate filename fails', () => {
    const root = tmpDir(); const pid = 'dup-nm'
    writeFixture(root, pid, { dupName: true })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('validateManifest - sourceRef', () => {
  it('filename/sourceRef mismatch fails', () => {
    const root = tmpDir(); const pid = 'bad-src'
    writeFixture(root, pid, { badSourceRef: '.agent/plans/bad/amendments/wrong.md' })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('validateManifest - unapproved amendment', () => {
  it('unapproved ledger amendment fails', () => {
    const root = tmpDir(); const pid = 'unapp'
    writeFixture(root, pid)
    const lp = path.join(root, '.agent', 'ledger', `${pid}.json`)
    const ledger = JSON.parse(fs.readFileSync(lp, 'utf-8'))
    ledger.amendments[0].approved = false
    fs.writeFileSync(lp, JSON.stringify(ledger))
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('validateManifest - extra artifacts', () => {
  it('extra non-md file fails', () => {
    const root = tmpDir(); const pid = 'extra-json'
    writeFixture(root, pid, { extraNonMd: 'extra.json' })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
  it('extra directory fails', () => {
    const root = tmpDir(); const pid = 'extra-dir'
    writeFixture(root, pid, { extraDir: 'subdir' })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
  it('extra symlink fails', () => {
    const root = tmpDir(); const pid = 'extra-sym'
    writeFixture(root, pid, { extraSymlink: true })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('validateShadowDir', () => {
  it('shadow symlink fails', () => {
    const root = tmpDir(); const pid = 'sh-sym'
    writeFixture(root, pid, { shadowSymlink: 'tasks.md' })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
  it('shadow wrong type fails', () => {
    const root = tmpDir(); const pid = 'sh-wt'
    writeFixture(root, pid, { shadowWrongType: 'tasks.md' })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('corrupt ledger JSON', () => {
  it('invalid JSON returns integrity failure (409)', () => {
    const root = tmpDir(); const pid = 'bad-json'
    writeFixture(root, pid, { corruptLedger: true })
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('root component wrong type', () => {
  it('root being a file fails', () => {
    const root = tmpDir()
    const fileRoot = path.join(root, 'hack.txt')
    fs.writeFileSync(fileRoot, '')
    expect(() => readPlanWorkspace('any', fileRoot)).toThrow(PlanIntegrityError)
  })
})

describe('secure read - short read', () => {
  it('rejects short read (custom first chunk then pass)', () => {
    const root = tmpDir(); const pid = 'short-rd'
    writeFixture(root, pid)
    let readCount = 0
    const seam: Partial<FsSeamReaders> = {
      readSync(fd: number, buf: Buffer, off: number, len: number, pos: number) {
        readCount++
        if (readCount === 1) return 1
        return fs.readSync(fd, buf, off, len, pos)
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('rejects zero-length read at start', () => {
    const root = tmpDir(); const pid = 'zero-rd'
    writeFixture(root, pid)
    const seam: Partial<FsSeamReaders> = { readSync() { return 0 } }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('rejects readSync returning > requested count', () => {
    const root = tmpDir(); const pid = 'over-rd'
    writeFixture(root, pid)
    const seam: Partial<FsSeamReaders> = {
      readSync(fd: number, buf: Buffer, off: number, len: number, pos: number) {
        return len + 1
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
})

describe('secure read - file size limits', () => {
  it('rejects file exceeding max size via lstat', () => {
    const root = tmpDir(); const pid = 'big-lst'
    writeFixture(root, pid)
    const seam: Partial<FsSeamReaders> = {
      lstatSync(p: string) {
        const st = fs.lstatSync(p)
        if (p.endsWith(`${pid}.json`)) return Object.assign(Object.create(st), { size: 20 * 1024 * 1024 })
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
})

describe('secure read - identity swap', () => {
  it('rejects fd/path identity change (dev/ino mismatch)', () => {
    const root = tmpDir(); const pid = 'dev-ino'
    writeFixture(root, pid)
    let callCount = 0
    const seam: Partial<FsSeamReaders> = {
      fstatSync(fd: number) {
        const st = DEFAULT_FSTAT(fd)
        if (callCount++ === 1) {
          return Object.assign(Object.create(st), { dev: st.dev + 1, ino: st.ino + 1 })
        }
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('rejects path swap via post-read lstat (dev/ino change on path)', () => {
    const root = tmpDir(); const pid = 'post-lst'
    writeFixture(root, pid)
    let lstatCalls = 0
    const seam: Partial<FsSeamReaders> = {
      lstatSync(p: string) {
        const st = fs.lstatSync(p)
        lstatCalls++
        if (lstatCalls >= 2 && p.includes(pid)) {
          return Object.assign(Object.create(st), { dev: st.dev + 1, ino: st.ino + 1 })
        }
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
})

describe('secure read - post-read mutation', () => {
  it('rejects size change during read', () => {
    const root = tmpDir(); const pid = 'mut-size'
    writeFixture(root, pid)
    let fstatCalls = 0
    const seam: Partial<FsSeamReaders> = {
      fstatSync(fd: number) {
        const st = DEFAULT_FSTAT(fd)
        fstatCalls++
        if (fstatCalls === 3) return Object.assign(Object.create(st), { size: st.size + 99, mtimeMs: st.mtimeMs + 1000 })
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('rejects mtime change during read', () => {
    const root = tmpDir(); const pid = 'mut-mt'
    writeFixture(root, pid)
    let fstatCalls = 0
    const seam: Partial<FsSeamReaders> = {
      fstatSync(fd: number) {
        const st = DEFAULT_FSTAT(fd)
        fstatCalls++
        if (fstatCalls === 3) return Object.assign(Object.create(st), { mtimeMs: st.mtimeMs + 1000 })
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('rejects ctime change during read', () => {
    const root = tmpDir(); const pid = 'mut-ct'
    writeFixture(root, pid)
    let fstatCalls = 0
    const seam: Partial<FsSeamReaders> = {
      fstatSync(fd: number) {
        const st = DEFAULT_FSTAT(fd)
        fstatCalls++
        if (fstatCalls === 3) return Object.assign(Object.create(st), { ctimeMs: st.ctimeMs + 1000 })
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('rejects same-size mutation where only metadata changes', () => {
    const root = tmpDir(); const pid = 'samemut'
    writeFixture(root, pid)
    let fstatCalls = 0
    const seam: Partial<FsSeamReaders> = {
      fstatSync(fd: number) {
        const st = DEFAULT_FSTAT(fd)
        fstatCalls++
        if (fstatCalls === 3) return Object.assign(Object.create(st), { mtimeMs: st.mtimeMs + 5000, ctimeMs: st.ctimeMs + 5000 })
        return st
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
})

describe('secure read - close error propagation', () => {
  it('propagates close failure aggregated with success', () => {
    const root = tmpDir(); const pid = 'close-fail'
    writeFixture(root, pid)
    let closeCount = 0
    const seam: Partial<FsSeamReaders> = {
      closeSync(fd: number) {
        closeCount++
        DEFAULT_CLOSE(fd)
        if (closeCount === 1) throw Object.assign(new Error('EIO: close failed'), { code: 'EIO' })
      },
    }
    expect(() => readPlanWorkspace(pid, root, seam)).toThrow(PlanIntegrityError)
  })
  it('aggregates close failure with primary failure', () => {
    const root = tmpDir(); const pid = 'agg-fail'
    writeFixture(root, pid)
    let closeCount = 0
    const seam: Partial<FsSeamReaders> = {
      readSync() { return 0 },
      closeSync(fd: number) {
        closeCount++
        DEFAULT_CLOSE(fd)
        if (closeCount === 1) throw Object.assign(new Error('EIO: close also failed'), { code: 'EIO' })
      },
    }
    try { readPlanWorkspace(pid, root, seam); expect.fail('should throw') } catch (e: unknown) {
      expect(e).toBeInstanceOf(PlanIntegrityError)
      const pi = e as PlanIntegrityError
      expect(pi.findings.some(f => f.kind === 'IO_FAULT' && f.detail.includes('read returned 0'))).toBe(true)
      expect(pi.findings.some(f => f.kind === 'IO_FAULT' && f.detail.includes('close'))).toBe(true)
    }
  })
})

const DEFAULT_READ = fs.readSync.bind(fs)
const DEFAULT_FSTAT = fs.fstatSync.bind(fs)
const DEFAULT_CLOSE = fs.closeSync.bind(fs)

describe('concurrent readers - no seam leakage', () => {
  it('two parallel calls with different seams do not interfere', () => {
    const rootA = tmpDir(); const pidA = 'con-a'
    const rootB = tmpDir(); const pidB = 'con-b'
    writeFixture(rootA, pidA)
    writeFixture(rootB, pidB)
    let aFailed = false
    const seamA: Partial<FsSeamReaders> = {
      readSync(fd: number, buf: Buffer, off: number, len: number, pos: number) {
        if (!aFailed) { aFailed = true; return 0 }
        return fs.readSync(fd, buf, off, len, pos)
      },
    }
    const results: Array<{ ok: boolean; error?: string }> = []
    const t1 = (): void => {
      try { readPlanWorkspace(pidA, rootA, seamA); results.push({ ok: true }) }
      catch (e: unknown) { results.push({ ok: false, error: (e as Error).message }) }
    }
    const t2 = (): void => {
      try { readPlanWorkspace(pidB, rootB); results.push({ ok: true }) }
      catch (e: unknown) { results.push({ ok: false, error: (e as Error).message }) }
    }
    t1()
    t2()
    expect(results[0].ok).toBe(false)
    expect(results[1].ok).toBe(true)
  })
  it('interleaving seam A invokes reader B during A read proving no shared state', () => {
    const rootA = tmpDir(); const pidA = 'inter-a'
    const rootB = tmpDir(); const pidB = 'inter-b'
    writeFixture(rootA, pidA)
    writeFixture(rootB, pidB)
    let invokedB = false
    const seamA: Partial<FsSeamReaders> = {
      readSync(fd: number, buf: Buffer, off: number, len: number, pos: number) {
        if (!invokedB && pos === 0) {
          invokedB = true
          const result = readPlanWorkspace(pidB, rootB)
          expect(result.identity.integrity).toBe('VALID')
        }
        return fs.readSync(fd, buf, off, len, pos)
      },
    }
    const resultA = readPlanWorkspace(pidA, rootA, seamA)
    expect(resultA.identity.integrity).toBe('VALID')
  })
})

describe('AM-0004 tombstone rejection', () => {
  function am4Fixture(root: string, pid: string): void {
    const ld = path.join(root, '.agent', 'ledger')
    const pd = path.join(root, '.agent', 'plans', pid)
    const ad = path.join(pd, 'amendments')
    const sd = path.join(pd, 'shadow')
    fs.mkdirSync(ld, { recursive: true }); fs.mkdirSync(pd, { recursive: true })
    fs.mkdirSync(ad, { recursive: true }); fs.mkdirSync(sd, { recursive: true })
    const orig = '# AM4\n'; const oB = Buffer.from(orig)
    const oSha = crypto.createHash('sha256').update(oB).digest('hex')
    fs.writeFileSync(path.join(pd, 'original.md'), orig)
    for (const n of ['tasks.md', 'progress.md', 'amendments.md', 'reconciliation.md']) fs.writeFileSync(path.join(sd, n), `# ${n}\n`)
    const hash = 'a'.repeat(64)
    const sMap: Record<string, string> = {}
    for (const n of ['tasks.md', 'progress.md', 'amendments.md', 'reconciliation.md']) sMap[n] = crypto.createHash('sha256').update(Buffer.from(`# ${n}\n`)).digest('hex')
    const aSha = crypto.createHash('sha256').update(Buffer.from('# A\n')).digest('hex')
    fs.writeFileSync(path.join(ad, 'amd-001.md'), '# A\n')
    const rawManifest = { schema: 'harness/amendments-manifest/v1', planId: pid, originalSha256: oSha, amendments: [{ amendmentId: 'AM-0004', sha256: aSha, filename: 'amd-001.md', order: 0 }] }
    fs.writeFileSync(path.join(ad, 'manifest.json'), JSON.stringify(rawManifest, null, 2))
    const pa = { artifactId: 'PA', planId: pid, sourceKind: 'chat_plan_artifact', sourceRef: 'msg', rawPath: `.agent/plans/${pid}/original.md`, sha256: oSha, bytes: oB.length, capturedAt: '2026-01-01T00:00:00Z', status: 'ADOPTED', repositoryIdentity: 'r', repositoryBaseline: { commit: 'c', branch: 'b', dirtyFingerprint: hash }, hostTask: { host: 'h', taskRef: 't', sessionRef: 's' }, authorIdentity: 'a', ownerIdentity: 'o', approvalEvent: 'a', supersedes: [], supplements: [], derivedFrom: [] }
    const pp = { schema: 'harness/portable-plan', version: 3, planId: pid, original: pa, projectionSha256: hash, objective: 'T', scope: { in: ['pkg'], out: [] }, decisions: [{ decisionId: 'D', decision: 'x', rationale: 'x', tradeOffs: [] }], assumptions: [], knownUnknowns: [], taskDag: [{ taskId: 'T1', requirementIds: ['R1'], criterionIds: ['C1'], dependencies: [] }], ownedPaths: ['pkg'], forbiddenPaths: [], evidenceProfiles: ['p'], rollback: ['r'], handoff: { recipientRole: 'r', requiredArtifacts: ['r'], nextSafeAction: 'r' }, lineage: { head: pa, ancestors: [], resolutionMatrix: [{ requirementId: 'R1', sourceArtifactId: 'PA', resolution: 'CARRIED', rationale: 'r' }], verified: true, reconciliationResult: 'PASS', reconciliationSha256: hash }, requirements: [{ requirementId: 'R1', statement: 'x', acceptanceCriteria: [{ criterionId: 'C1', claim: 'x', evidenceProfile: 'p', binding: { kind: 'plan-anchor', anchor: { planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: crypto.createHash('sha256').update(Buffer.from('# AM4\n')).digest('hex'), requirementId: 'R1' } } }] }], anchors: [{ planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: crypto.createHash('sha256').update(Buffer.from('# AM4\n')).digest('hex'), requirementId: 'R1' }] }
    function agg(r: string[]) { return crypto.createHash('sha256').update(Buffer.from(JSON.stringify([...r].sort()), 'utf-8')).digest('hex') }
    const ledger = { status: 'REVIEWING', plan: pp, planAnchors: [{ planSha256: oSha, sectionHeading: 'R', lineStart: 1, lineEnd: 1, anchorTextSha256: crypto.createHash('sha256').update(Buffer.from('# AM4\n')).digest('hex'), requirementId: 'R1' }], batches: [{ batchId: 'P0', status: 'PASSED', taskIds: ['T1'] }], amendments: [{ amendmentId: 'AM-0004', approved: true, sha256: aSha, sourceRef: `.agent/plans/${pid}/amendments/amd-001.md` }], assignments: [], receipts: [], verificationClaims: [], attestations: [{ host: 'codex', hostVersion: '1', commitSha: 'deadbeef', capabilityStatus: 'HOST_NATIVE', capabilityIds: ['run'], contractSetSha256: hash, requestedModel: 'standard', resolvedModel: 'gpt', observedModel: 'gpt', evidenceHashes: [hash], nativeRunnerIdentity: 'codex-cli', issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }], reconciliations: [{ requirementId: 'R1', status: 'PARTIAL', anchorIds: ['a'], verificationClaimIds: [] }], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [], shadowRevision: 1, shadowHashes: sMap, latestReview: { reviewId: 'R1', stale: false, originalSha256: oSha, amendmentsSha256: agg([]), diffFingerprint: agg([]), receiptEvidenceFingerprint: agg([]), evidenceHashes: [], shadowRevision: 1, reviewerIdentity: 'r' } }
    fs.writeFileSync(path.join(ld, pid + '.json'), JSON.stringify(ledger))
  }
  it('AM-0004 in manifest is rejected', () => {
    const root = tmpDir(); const pid = 'am4-rej'
    am4Fixture(root, pid)
    expect(() => readPlanWorkspace(pid, root)).toThrow(PlanIntegrityError)
  })
})

describe('listPlans - fail closed', () => {
  it('list rejects symlink in ledger dir', () => {
    const root = tmpDir(); const ld = path.join(root, '.agent', 'ledger')
    fs.mkdirSync(ld, { recursive: true })
    const tgt = path.join(root, 'bad-target'); fs.writeFileSync(tgt, '{}')
    fs.symlinkSync(tgt, path.join(ld, 'plan-x.json'))
    expect(() => listPlans(root)).toThrow(PlanIntegrityError)
  })
  it('list rejects non-json file in ledger dir', () => {
    const root = tmpDir(); const ld = path.join(root, '.agent', 'ledger')
    fs.mkdirSync(ld, { recursive: true })
    fs.writeFileSync(path.join(ld, 'README.txt'), 'readme')
    expect(() => listPlans(root)).toThrow(PlanIntegrityError)
  })
  it('list rejects directory in ledger dir', () => {
    const root = tmpDir(); const ld = path.join(root, '.agent', 'ledger')
    fs.mkdirSync(ld, { recursive: true })
    fs.mkdirSync(path.join(ld, 'subdir'))
    expect(() => listPlans(root)).toThrow(PlanIntegrityError)
  })
  it('list rejects invalid planId in ledger filename', () => {
    const root = tmpDir(); const ld = path.join(root, '.agent', 'ledger')
    fs.mkdirSync(ld, { recursive: true })
    fs.writeFileSync(path.join(ld, 'a..b.json'), '{}')
    expect(() => listPlans(root)).toThrow(PlanIntegrityError)
  })
})

describe('listPlans - code-point sort', () => {
  it('returns plans sorted by code-point order not localeCompare', () => {
    const root = tmpDir(); const ld = path.join(root, '.agent', 'ledger')
    fs.mkdirSync(ld, { recursive: true })
    fs.writeFileSync(path.join(ld, 'plan-b.json'), JSON.stringify({ status: 'REVIEWING', plan: { schema: 'harness/portable-plan', version: 3, planId: 'plan-b' }, planAnchors: [], batches: [], amendments: [], assignments: [], receipts: [], verificationClaims: [], attestations: [], reconciliations: [], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [], shadowRevision: 1, shadowHashes: {}, latestReview: null }))
    fs.writeFileSync(path.join(ld, 'plan-a.json'), JSON.stringify({ status: 'REVIEWING', plan: { schema: 'harness/portable-plan', version: 3, planId: 'plan-a' }, planAnchors: [], batches: [], amendments: [], assignments: [], receipts: [], verificationClaims: [], attestations: [], reconciliations: [], repairSlices: [], sourceAcquisitionReceipts: [], orphanFindings: [], shadowRevision: 1, shadowHashes: {}, latestReview: null }))
    const result = listPlans(root)
    expect(result.map(r => r.planId)).toEqual(['plan-a', 'plan-b'])
  })
})

describe('canceled plan workspace returns PlanNotFoundError', () => {
  it('requesting nonexistent plan throws PlanNotFoundError', () => {
    const root = tmpDir()
    fs.mkdirSync(path.join(root, '.agent', 'ledger'), { recursive: true })
    fs.mkdirSync(path.join(root, '.agent', 'plans'), { recursive: true })
    expect(() => readPlanWorkspace('nope', root)).toThrow(PlanNotFoundError)
  })
})

describe('buildManifestJson validation', () => {
  it('rejects AM-0004 amendment', () => {
    expect(() => buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0004', sha256: 'b'.repeat(64), filename: 'amd-001.md', order: 0 }])).toThrow(PlanValidationError)
  })
  it('rejects duplicate amendmentId', () => {
    expect(() => buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0001', sha256: 'b'.repeat(64), filename: 'amd-001.md', order: 0 }, { amendmentId: 'AM-0001', sha256: 'c'.repeat(64), filename: 'amd-002.md', order: 1 }])).toThrow(PlanValidationError)
  })
  it('rejects out-of-order amendment IDs', () => {
    expect(() => buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0002', sha256: 'b'.repeat(64), filename: 'amd-001.md', order: 0 }, { amendmentId: 'AM-0001', sha256: 'c'.repeat(64), filename: 'amd-002.md', order: 1 }])).toThrow(PlanValidationError)
  })
  it('rejects invalid planId', () => {
    expect(() => buildManifestJson('a..b', 'a'.repeat(64), [])).toThrow(PlanValidationError)
  })
  it('rejects duplicate filename', () => {
    expect(() => buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0001', sha256: 'b'.repeat(64), filename: 'amd-001.md', order: 0 }, { amendmentId: 'AM-0002', sha256: 'c'.repeat(64), filename: 'amd-001.md', order: 1 }])).toThrow(PlanValidationError)
  })
  it('rejects invalid sha256', () => {
    expect(() => buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0001', sha256: 'not-a-sha', filename: 'amd-001.md', order: 0 }])).toThrow(PlanValidationError)
  })
  it('rejects order not matching index', () => {
    expect(() => buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0001', sha256: 'b'.repeat(64), filename: 'amd-001.md', order: 1 }])).toThrow(PlanValidationError)
  })
  it('accepts valid two-amendment manifest', () => {
    const result = buildManifestJson('p', 'a'.repeat(64), [{ amendmentId: 'AM-0001', sha256: 'b'.repeat(64), filename: 'amd-001.md', order: 0 }, { amendmentId: 'AM-0002', sha256: 'c'.repeat(64), filename: 'amd-002.md', order: 1 }])
    expect(result).toContain('"schema"')
    expect(result).toContain('"planId"')
    expect(result).toContain('"originalSha256"')
    expect(result).toContain('"amendments"')
  })
})
