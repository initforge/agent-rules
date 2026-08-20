import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import {
  sha256Bytes, assertWorkLedger, isSha256,
  type WorkLedger, type Sha256, type WorkLedgerStatus, type ReconciliationStatus,
} from '@initforge/agent-rules-engine/contracts'
import {
  computeCanonicalEffectivePlanIdentity, buildManifestJson,
  PlanValidationError, PlanNotFoundError, PlanIntegrityError, LegacyRejectionError,
  validatePlanId, isLegacyShape, validateAmendmentIds, validateSourceRef, validateFileName,
  LEGACY_KEYS, SHADOW_ALLOWLIST, APPROVED_AMENDMENT_IDS,
  type IntegrityFinding,
} from '@initforge/agent-rules-engine/plan-identity'

const O_NOFOLLOW: number = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0
const MAX_REGULAR_FILE_SIZE = 16 * 1024 * 1024
const MAX_LEDGER_ENTRIES = 1000
const MAX_FILENAME_LENGTH = 255

export type IntegrityStatus = 'VALID' | 'INVALID' | 'UNVERIFIED'

export interface PlanListItem { planId: string }

/**
 * The active North-Star ledger is intentionally not a WorkLedger projection.
 * This metadata lets consumers distinguish a read-only display adapter from
 * the portable v3 ledger contract, so no adapter field can be mistaken for
 * verifier evidence or a terminal PASS.
 */
export interface CanonicalNorthStarSource {
  schema: 'harness/north-star-ledger'
  version: 4
  ledgerPath: string
  ledgerSha256: Sha256
  executionState: string
  status: WorkLedgerStatus
  requirementCount: number
  requirementStatusCounts: Record<string, number>
  approvedAmendmentIds: string[]
  displayProjection: true
}

export type FsSeamReaders = {
  lstatSync: (p: string) => fs.Stats
  openSync: (p: string, f: number) => number
  fstatSync: (fd: number) => fs.Stats
  readSync: (fd: number, buf: Buffer, off: number, len: number, pos: number) => number
  closeSync: (fd: number) => void
  readdirSync: (p: string) => fs.Dirent[]
}

const DEFAULT_SEAM: FsSeamReaders = {
  lstatSync: fs.lstatSync,
  openSync: fs.openSync,
  fstatSync: fs.fstatSync,
  readSync: fs.readSync,
  closeSync: fs.closeSync,
  readdirSync: (p: string) => fs.readdirSync(p, { withFileTypes: true }),
}

function readRegularFileSync(fp: string, label: string, seamOverride?: Partial<FsSeamReaders>): Buffer {
  const f: FsSeamReaders = { ...DEFAULT_SEAM, ...seamOverride }
  let lst: fs.Stats
  try { lst = f.lstatSync(fp) } catch (e: unknown) {
    const ne = e as NodeJS.ErrnoException
    throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `lstat ${label}: ${ne.message}` }], ne.code)
  }
  if (lst.isSymbolicLink()) throw new PlanIntegrityError([{ kind: 'SYMLINK', detail: `${label} is a symlink` }])
  if (!lst.isFile()) throw new PlanIntegrityError([{ kind: 'WRONG_TYPE', detail: `${label} is not a regular file` }])
  if (!Number.isInteger(lst.size) || lst.size < 0) throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `${label}: invalid stat size ${lst.size}` }])
  if (lst.size > MAX_REGULAR_FILE_SIZE) throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `${label}: exceeds max size (${lst.size} > ${MAX_REGULAR_FILE_SIZE})` }])

  let fd: number
  try { fd = f.openSync(fp, fs.constants.O_RDONLY | O_NOFOLLOW) } catch (e: unknown) {
    const ne = e as NodeJS.ErrnoException
    throw new PlanIntegrityError([{ kind: ne.code === 'ELOOP' ? 'SYMLINK' : 'IO_FAULT', detail: `open ${label}: ${ne.message}` }], ne.code)
  }

  const readFindings: IntegrityFinding[] = []
  let buf: Buffer | undefined
  let closeError: Error | undefined

  try {
    const stat = f.fstatSync(fd)
    if (!stat.isFile()) readFindings.push({ kind: 'WRONG_TYPE', detail: `${label} is not a regular file` })
    else if (stat.dev !== lst.dev || stat.ino !== lst.ino) readFindings.push({ kind: 'SYMLINK', detail: `${label}: identity changed between lstat and open` })
    else {
      const size = stat.size
      if (!Number.isInteger(size) || size < 0) readFindings.push({ kind: 'IO_FAULT', detail: `${label}: invalid fstat size ${size}` })
      else if (size > MAX_REGULAR_FILE_SIZE) readFindings.push({ kind: 'IO_FAULT', detail: `${label}: exceeds max size after open (${size} > ${MAX_REGULAR_FILE_SIZE})` })
      else {
        buf = Buffer.alloc(size)
        let totalRead = 0
        while (totalRead < size) {
          const remaining = size - totalRead
          const count = Math.min(remaining, 65536)
          const br = f.readSync(fd, buf, totalRead, count, totalRead)
          if (br <= 0) { readFindings.push({ kind: 'IO_FAULT', detail: `${label}: read returned ${br} at offset ${totalRead}/${size}` }); break }
          if (br > count) { readFindings.push({ kind: 'IO_FAULT', detail: `${label}: read returned ${br} > requested ${count}` }); break }
          totalRead += br
        }
        if (totalRead !== size && readFindings.length === 0) readFindings.push({ kind: 'IO_FAULT', detail: `${label}: read incomplete (expected ${size}, got ${totalRead})` })

        if (readFindings.length === 0) {
          try {
            const post = f.fstatSync(fd)
            if (post.dev !== stat.dev || post.ino !== stat.ino) readFindings.push({ kind: 'SYMLINK', detail: `${label}: fd identity changed during read` })
            else if (post.size !== size) readFindings.push({ kind: 'IO_FAULT', detail: `${label}: size changed during read (was ${size}, now ${post.size})` })
            else if (post.mtimeMs !== stat.mtimeMs || post.ctimeMs !== stat.ctimeMs) readFindings.push({ kind: 'IO_FAULT', detail: `${label}: metadata changed during read` })
          } catch (e: unknown) { readFindings.push({ kind: 'IO_FAULT', detail: `re-fstat ${label}: ${(e as Error).message}` }) }

          if (readFindings.length === 0) {
            try {
              const postPath = f.lstatSync(fp)
              if (postPath.dev !== lst.dev || postPath.ino !== lst.ino) readFindings.push({ kind: 'SYMLINK', detail: `${label}: path identity changed after read (swap detected)` })
            } catch (e: unknown) { readFindings.push({ kind: 'IO_FAULT', detail: `post-path lstat ${label}: ${(e as Error).message}` }) }
          }
        }
      }
    }
  } catch (e: unknown) { readFindings.push({ kind: 'IO_FAULT', detail: `read ${label}: ${(e as Error).message}` }) }

  try { f.closeSync(fd) } catch (e: unknown) { closeError = new Error(`close ${label}: ${(e as Error).message}`) }
  if (closeError) readFindings.push({ kind: 'IO_FAULT', detail: closeError.message })
  if (readFindings.length > 0) throw new PlanIntegrityError(readFindings)
  return buf!
}

function hashRegularFile(fp: string, label: string, seamOverride?: Partial<FsSeamReaders>): Sha256 {
  return sha256Bytes(new Uint8Array(readRegularFileSync(fp, label, seamOverride)))
}

function validateDirSafe(segments: string[], root: string, label: string, seamOverride?: Partial<FsSeamReaders>): void {
  const f: FsSeamReaders = { ...DEFAULT_SEAM, ...seamOverride }
  let cur = path.resolve(root)
  for (let i = 0; i < segments.length; i++) {
    cur = path.join(cur, segments[i])
    let st: fs.Stats
    try { st = f.lstatSync(cur) } catch (e: unknown) {
      const ne = e as NodeJS.ErrnoException
      throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `stat ${label} component ${segments[i]}: ${ne.message}` }], ne.code)
    }
    if (st.isSymbolicLink()) throw new PlanIntegrityError([{ kind: 'SYMLINK', detail: `${label} component ${segments[i]} is a symlink` }])
    if (!st.isDirectory()) throw new PlanIntegrityError([{ kind: 'WRONG_TYPE', detail: `${label} component ${segments[i]} is not a directory` }])
  }
}

export function findRoot(overrides?: { harnessRoot?: string }, seamOverride?: Partial<FsSeamReaders>): string {
  const f: FsSeamReaders = { ...DEFAULT_SEAM, ...seamOverride }
  let root: string | undefined
  if (overrides?.harnessRoot) root = path.resolve(overrides.harnessRoot)
  else if (process.env.HARNESS_ROOT) root = path.resolve(process.env.HARNESS_ROOT)
  else {
    let dir = __dirname
    for (let i = 0; i < 10; i++) {
      try {
        if (f.lstatSync(path.join(dir, 'rules', 'manifest.yaml')).isFile()) { root = dir; break }
      } catch (e: unknown) {
        const ne = e as NodeJS.ErrnoException
        if (ne.code !== 'ENOENT' && ne.code !== 'EACCES') throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `root search stat: ${(e as Error).message}` }])
      }
      const p = path.dirname(dir); if (p === dir) break; dir = p
    }
    if (!root) {
      const fb = path.resolve(__dirname, '..', '..', '..', '..', '..')
      try {
        if (f.lstatSync(path.join(fb, 'rules', 'manifest.yaml')).isFile()) root = fb
      } catch (e: unknown) {
        const ne = e as NodeJS.ErrnoException
        if (ne.code !== 'ENOENT' && ne.code !== 'EACCES') throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `root fallback stat: ${(e as Error).message}` }])
      }
    }
  }
  if (!root) throw new PlanValidationError('Could not find HARNESS_ROOT')
  const parsed = path.parse(root)
  const segs = root.slice(parsed.root.length).split(path.sep).filter(Boolean)
  if (segs.length > 0) {
    let cur = parsed.root
    for (let i = 0; i < segs.length; i++) {
      cur = path.join(cur, segs[i])
      let st: fs.Stats
      try { st = f.lstatSync(cur) } catch (e: unknown) {
        throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `root parent stat: ${(e as Error).message}` }])
      }
      if (st.isSymbolicLink()) throw new PlanIntegrityError([{ kind: 'SYMLINK', detail: `root parent component ${segs[i]} is a symlink` }])
      if (!st.isDirectory()) throw new PlanIntegrityError([{ kind: 'WRONG_TYPE', detail: `root parent component ${segs[i]} is not a directory` }])
    }
  }
  return root
}

function validateManifest(amendDir: string, ledger: WorkLedger, planId: string, seamOverride?: Partial<FsSeamReaders>): { findings: IntegrityFinding[]; hashes: Sha256[] } {
  const findings: IntegrityFinding[] = []
  const hashes: Sha256[] = []
  const f: FsSeamReaders = { ...DEFAULT_SEAM, ...seamOverride }

  const mp = path.join(amendDir, 'manifest.json')
  let manifestBytes: Buffer
  try { manifestBytes = readRegularFileSync(mp, 'manifest.json', seamOverride) } catch (e: unknown) {
    if (e instanceof PlanIntegrityError) {
      if (e.errno === 'ENOENT') findings.push({ kind: 'MANIFEST', detail: 'manifest.json missing' })
      else findings.push(...e.findings)
    } else findings.push({ kind: 'IO_FAULT', detail: `manifest.json: ${(e as Error).message}` })
    return { findings, hashes }
  }

  let m: Record<string, unknown>
  try { m = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown> }
  catch (e: unknown) { findings.push({ kind: 'MANIFEST', detail: `manifest.json not valid JSON: ${(e as Error).message}` }); return { findings, hashes } }

  if (m.schema !== 'harness/amendments-manifest/v1') findings.push({ kind: 'MANIFEST', detail: `schema: ${JSON.stringify(m.schema)}` })
  if (m.planId !== planId) findings.push({ kind: 'MANIFEST', detail: `planId mismatch: ${m.planId}` })
  if (m.originalSha256 !== ledger.plan.original.sha256) findings.push({ kind: 'MANIFEST', detail: 'originalSha256 mismatch' })

  const arr = m.amendments
  if (!Array.isArray(arr)) { findings.push({ kind: 'MANIFEST', detail: 'amendments must be an array' }); return { findings, hashes } }

  if (arr.length !== ledger.amendments.length) {
    findings.push({ kind: 'MANIFEST', detail: `manifest amendments length ${arr.length} != ledger amendments length ${ledger.amendments.length}` })
    return { findings, hashes }
  }

  const expectedTopKeys = new Set(['schema', 'planId', 'originalSha256', 'amendments'])
  const actualTopKeys = Object.keys(m)
  for (const k of actualTopKeys) { if (!expectedTopKeys.has(k)) findings.push({ kind: 'MANIFEST', detail: `Unexpected manifest top-level key: ${k}` }) }
  if (actualTopKeys.length !== expectedTopKeys.size) {
    const missing = [...expectedTopKeys].filter(k => !actualTopKeys.includes(k))
    for (const k of missing) findings.push({ kind: 'MANIFEST', detail: `Missing manifest key: ${k}` })
  }

  const fns = new Set<string>()
  const ids = new Set<string>()
  const parsed: Array<{ amendmentId: string; sha256: string; filename: string; order: number }> = []

  for (let i = 0; i < arr.length; i++) {
    const e = arr[i]
    if (!e || typeof e !== 'object') { findings.push({ kind: 'MANIFEST', detail: `amendments[${i}] not an object` }); continue }
    const ent = e as Record<string, unknown>
    const id = ent.amendmentId; const fn = ent.filename; const sh = ent.sha256; const ord = ent.order

    const expectedEntryKeys = new Set(['amendmentId', 'sha256', 'filename', 'order'])
    const actualEntryKeys = Object.keys(ent)
    for (const k of actualEntryKeys) { if (!expectedEntryKeys.has(k)) findings.push({ kind: 'MANIFEST', detail: `amendments[${i}] unexpected key: ${k}` }) }

    const idOk = typeof id === 'string' && id.length > 0
    const ordOk = typeof ord === 'number' && Number.isInteger(ord) && ord === i
    if (!idOk) findings.push({ kind: 'MANIFEST', detail: `amendments[${i}].amendmentId invalid` })
    if (!ordOk) findings.push({ kind: 'MANIFEST', detail: `amendments[${i}].order must be ${i}` })

    const fnF = validateFileName(fn as string); if (fnF) findings.push(fnF)
    if (typeof sh !== 'string' || !isSha256(sh)) findings.push({ kind: 'MANIFEST', detail: `amendments[${i}].sha256 invalid` })
    if (fn && typeof fn === 'string') { if (fns.has(fn)) findings.push({ kind: 'MANIFEST', detail: `Duplicate filename: ${fn}` }); fns.add(fn) }
    if (id && typeof id === 'string') { if (ids.has(id)) findings.push({ kind: 'MANIFEST', detail: `Duplicate amendmentId: ${id}` }); ids.add(id) }

    const la = ledger.amendments[i]
    if (la) {
      if (!la.approved) findings.push({ kind: 'MANIFEST', detail: `Ledger amendment ${i} is not approved` })
      if (la.amendmentId !== id) findings.push({ kind: 'AMENDMENT_ORDER', detail: `amendments[${i}] ledger id ${la.amendmentId} != manifest id ${id}` })
      if (la.sha256 !== sh) findings.push({ kind: 'AMENDMENT_ORDER', detail: `amendments[${i}] ledger sha ${la.sha256} != manifest sha ${sh}` })
      const expectedRef = `.agent/plans/${planId}/amendments/${fn}`
      if (la.sourceRef !== expectedRef) findings.push({ kind: 'MANIFEST', detail: `amendments[${i}] sourceRef ${la.sourceRef} != expected ${expectedRef}` })
    }
    parsed.push({ amendmentId: id as string, sha256: sh as string, filename: fn as string, order: ord as number })
  }

  const amdErr = validateAmendmentIds(parsed.map(p => p.amendmentId))
  if (amdErr) findings.push({ kind: 'AMENDMENT_ORDER', detail: amdErr })

  if (findings.length > 0) return { findings, hashes }

  const canonical = Buffer.from(buildManifestJson(planId, ledger.plan.original.sha256, parsed), 'utf-8')
  if (!manifestBytes.equals(canonical)) { findings.push({ kind: 'MANIFEST', detail: 'manifest bytes do not match canonical serialization' }); return { findings, hashes } }

  let entries: fs.Dirent[]
  try { entries = f.readdirSync(amendDir) } catch (e: unknown) {
    findings.push({ kind: 'IO_FAULT', detail: `readdir amendments: ${(e as Error).message}` }); return { findings, hashes }
  }
  for (const ent of entries) {
    if (ent.name === 'manifest.json') continue
    if (ent.name.length > MAX_FILENAME_LENGTH) { findings.push({ kind: 'IO_FAULT', detail: `Amendment filename too long: ${ent.name.length}` }); continue }
    let st: fs.Stats
    try { st = f.lstatSync(path.join(amendDir, ent.name)) } catch (e: unknown) {
      findings.push({ kind: 'IO_FAULT', detail: `lstat amendment ${ent.name}: ${(e as Error).message}` }); continue
    }
    if (st.isSymbolicLink()) { findings.push({ kind: 'SYMLINK', detail: `Amendment ${ent.name} is a symlink` }); continue }
    if (st.isDirectory()) { findings.push({ kind: 'MANIFEST', detail: `Unexpected artifact in amendments: ${ent.name}` }); continue }
    if (st.isFile() && ent.name.endsWith('.md') && fns.has(ent.name)) continue
    findings.push({ kind: 'MANIFEST', detail: `Unexpected artifact in amendments: ${ent.name}` })
  }

  if (findings.length > 0) return { findings, hashes }

  for (const e of parsed) {
    const fp = path.join(amendDir, e.filename)
    try {
      const ph = hashRegularFile(fp, e.filename, seamOverride)
      if (ph !== e.sha256) findings.push({ kind: 'AMENDMENT_TAMPER', detail: `Amendment ${e.filename} sha256 mismatch` })
      else hashes.push(ph)
    } catch (err) {
      if (err instanceof PlanIntegrityError) findings.push(...err.findings)
      else findings.push({ kind: 'IO_FAULT', detail: `Amendment ${e.filename}: ${(err as Error).message}` })
    }
  }

  return { findings, hashes }
}

function validateShadowDir(shadowDir: string, shadowHashes: Record<string, Sha256>, seamOverride?: Partial<FsSeamReaders>): { findings: IntegrityFinding[]; shadowBytes: Record<string, Buffer> } {
  const findings: IntegrityFinding[] = []
  const shadowBytes: Record<string, Buffer> = {}
  const f: FsSeamReaders = { ...DEFAULT_SEAM, ...seamOverride }

  const declaredKeys = Object.keys(shadowHashes)
  const expectedSet = new Set(SHADOW_ALLOWLIST)
  if (declaredKeys.length !== SHADOW_ALLOWLIST.length || !declaredKeys.every(k => expectedSet.has(k))) {
    findings.push({ kind: 'SHADOW_DRIFT', detail: `Ledger shadowHashes keys must be exactly: ${SHADOW_ALLOWLIST.join(', ')}` })
    return { findings, shadowBytes }
  }
  for (const [k, v] of Object.entries(shadowHashes)) {
    if (!isSha256(v)) findings.push({ kind: 'SHADOW_DRIFT', detail: `Shadow ${k} has invalid SHA` })
  }

  let onDisk: fs.Dirent[]
  try { onDisk = f.readdirSync(shadowDir) } catch (e: unknown) {
    findings.push({ kind: 'IO_FAULT', detail: `readdir shadow: ${(e as Error).message}` }); return { findings, shadowBytes }
  }

  const diskNames = new Set<string>()
  for (const ent of onDisk) {
    diskNames.add(ent.name)
    if (!expectedSet.has(ent.name)) { findings.push({ kind: 'SHADOW_DRIFT', detail: `Undeclared file on disk: ${ent.name}` }); continue }
    if (ent.name.length > MAX_FILENAME_LENGTH) { findings.push({ kind: 'IO_FAULT', detail: `Shadow filename too long: ${ent.name.length}` }); continue }
    let st: fs.Stats
    try { st = f.lstatSync(path.join(shadowDir, ent.name)) } catch (e: unknown) {
      findings.push({ kind: 'IO_FAULT', detail: `lstat shadow ${ent.name}: ${(e as Error).message}` }); continue
    }
    if (st.isSymbolicLink()) { findings.push({ kind: 'SYMLINK', detail: `Shadow ${ent.name} is a symlink` }); continue }
    if (!st.isFile()) { findings.push({ kind: 'WRONG_TYPE', detail: `Shadow ${ent.name} is not a regular file` }); continue }
    const sf = path.join(shadowDir, ent.name)
    try {
      const bytes = readRegularFileSync(sf, `shadow ${ent.name}`, seamOverride)
      const ph = sha256Bytes(new Uint8Array(bytes))
      if (ph !== shadowHashes[ent.name]) findings.push({ kind: 'SHADOW_DRIFT', detail: `Shadow ${ent.name} hash mismatch` })
      else shadowBytes[ent.name] = bytes
    } catch (err) {
      if (err instanceof PlanIntegrityError) findings.push(...err.findings)
      else findings.push({ kind: 'IO_FAULT', detail: `Shadow ${ent.name}: ${(err as Error).message}` })
    }
  }
  for (const name of SHADOW_ALLOWLIST) { if (!diskNames.has(name)) findings.push({ kind: 'MISSING_SHADOW', detail: `Shadow ${name} missing from disk` }) }

  return { findings, shadowBytes }
}

export function listPlans(root: string, seamOverride?: Partial<FsSeamReaders>): PlanListItem[] {
  validateDirSafe(['.agent'], root, '.agent', seamOverride)

  // An absent ledger directory means "no plans in the legacy layout", not an integrity
  // failure. Treating it as one made every dashboard route answer 409 as soon as the
  // repo moved to the flat requirements ledger (.agent/README.md), because the whole UI
  // funnels through this call.
  const f: FsSeamReaders = { ...DEFAULT_SEAM, ...seamOverride }
  const ld = path.resolve(root, '.agent', 'ledger')
  try {
    const st = f.lstatSync(ld)
    if (st.isSymbolicLink()) {
      throw new PlanIntegrityError([{ kind: 'SYMLINK', detail: 'ledger dir is a symlink' }])
    }
    if (!st.isDirectory()) {
      throw new PlanIntegrityError([{ kind: 'WRONG_TYPE', detail: 'ledger dir is not a directory' }])
    }
  } catch (e: unknown) {
    if (e instanceof PlanIntegrityError) throw e
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new PlanIntegrityError([
      { kind: 'IO_FAULT', detail: `stat ledger dir: ${(e as Error).message}` },
    ])
  }

  let entries: fs.Dirent[]
  try { entries = f.readdirSync(ld) } catch (e: unknown) {
    throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `listPlans readdir: ${(e as Error).message}` }])
  }
  if (entries.length > MAX_LEDGER_ENTRIES) {
    throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `listPlans: too many entries (${entries.length} > ${MAX_LEDGER_ENTRIES})` }])
  }
  for (const ent of entries) {
    if (ent.name.length > MAX_FILENAME_LENGTH) throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `Ledger entry name too long: ${ent.name.length}` }])
    const st = f.lstatSync(path.join(ld, ent.name))
    if (st.isSymbolicLink()) throw new PlanIntegrityError([{ kind: 'SYMLINK', detail: `Ledger entry ${ent.name} is a symlink` }])
    if (!st.isFile()) throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `Unexpected ledger artifact: ${ent.name}` }])
    if (!ent.name.endsWith('.json')) throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `Unexpected ledger artifact: ${ent.name}` }])
    try { validatePlanId(ent.name.slice(0, -5)) } catch { throw new PlanIntegrityError([{ kind: 'IO_FAULT', detail: `Invalid planId in ledger filename: ${ent.name}` }]) }
  }
  return entries
    .filter(e => e.name.endsWith('.json'))
    .map(e => e.name.slice(0, -5))
    .sort((a, b) => { if (a < b) return -1; if (a > b) return 1; return 0 })
    .map(planId => ({ planId }))
}

type CanonicalRequirement = {
  id: string
  // V3.1-era canonical ledgers use MATCH/PARTIAL/GAP/BLOCKED; universal
  // reconciliation v5 ledgers use COMPLETED/PENDING/VERIFIED. Accept both.
  status: 'MATCH' | 'PARTIAL' | 'GAP' | 'BLOCKED' | 'COMPLETED' | 'PENDING' | 'VERIFIED'
  proofStatus?: 'MATCH' | 'PARTIAL' | 'GAP' | 'BLOCKED' | 'COMPLETED' | 'PENDING' | 'VERIFIED'
  statement: string
  evidenceRefs?: unknown[]
}

const NORTH_STAR_STATUS_MAP: Record<CanonicalRequirement['status'], ReconciliationStatus> = {
  MATCH: 'MATCH', PARTIAL: 'PARTIAL', GAP: 'MISSING', BLOCKED: 'MISSING',
  COMPLETED: 'MATCH', PENDING: 'PARTIAL', VERIFIED: 'MATCH',
}

const WORK_LEDGER_STATUSES: readonly WorkLedgerStatus[] = [
  'ADOPTED', 'DISCOVERING', 'PLANNED', 'VALIDATED', 'DISPATCHING', 'EXECUTING', 'VERIFYING', 'REVIEWING',
  'needs-remediation', 'needs-replan', 'COMPLETED', 'PARTIAL', 'BLOCKED', 'FAILED', 'CANCELLED',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCanonicalNorthStarCandidate(obj: Record<string, unknown>): boolean {
  // schema_version is the authoritative discriminator. v4 is the V3.1-era
  // canonical shape; v5 is the universal-reconciliation canonical shape.
  // The extra shape check keeps older malformed/legacy fixtures on the legacy
  // rejection path.
  return (obj.schema_version === 4 || obj.schema_version === 5) || (
    typeof obj.plan_id === 'string' && 'milestones' in obj && 'original_plan' in obj
  )
}

function readCanonicalNorthStarWorkspace(
  planId: string,
  root: string,
  ledgerBytes: Buffer,
  obj: Record<string, unknown>,
  planDir: string,
  ledgerPath: string,
  seamOverride?: Partial<FsSeamReaders>,
): PlanWorkspace {
  const findings: IntegrityFinding[] = []
  if (obj.schema_version !== 4 && obj.schema_version !== 5) findings.push({ kind: 'MANIFEST', detail: `North-Star ledger schema_version must be 4 or 5` })
  if (obj.plan_id !== planId) findings.push({ kind: 'PLANID_MISMATCH', detail: `Ledger plan_id (${String(obj.plan_id)}) != requested (${planId})` })

  const rawStatus = obj.status
  if (typeof rawStatus !== 'string' || !WORK_LEDGER_STATUSES.includes(rawStatus as WorkLedgerStatus)) {
    findings.push({ kind: 'MANIFEST', detail: `North-Star ledger status is invalid: ${String(rawStatus)}` })
  }
  const executionState = obj.execution_state
  if (typeof executionState !== 'string' || executionState.length === 0) {
    findings.push({ kind: 'MANIFEST', detail: 'North-Star ledger execution_state must be a non-empty string' })
  }

  const original = isRecord(obj.original_plan) ? obj.original_plan : undefined
  const identity = isRecord(obj.effective_plan_identity) ? obj.effective_plan_identity : undefined
  if (!original) findings.push({ kind: 'MANIFEST', detail: 'North-Star ledger original_plan must be an object' })
  if (!identity) findings.push({ kind: 'MANIFEST', detail: 'North-Star ledger effective_plan_identity must be an object' })

  let originalSha256: Sha256 | null = null
  let originalBytes: Uint8Array = new Uint8Array(0)
  let originalMarkdown = ''
  if (original) {
    const expectedOriginalPath = `.agent/plans/${planId}/original.md`
    const declaredPath = original.path
    const normalizedDeclaredPath = typeof declaredPath === 'string'
      ? path.normalize(declaredPath).split(path.sep).join('/')
      : undefined
    if (typeof declaredPath !== 'string' || path.isAbsolute(declaredPath) || normalizedDeclaredPath !== expectedOriginalPath) {
      findings.push({ kind: 'MANIFEST', detail: `North-Star original_plan.path must be ${expectedOriginalPath}` })
    }
    if (typeof original.sha256 !== 'string' || !isSha256(original.sha256)) {
      findings.push({ kind: 'MANIFEST', detail: 'North-Star original_plan.sha256 is invalid' })
    } else originalSha256 = original.sha256
    if (typeof original.bytes !== 'number' || !Number.isInteger(original.bytes) || original.bytes < 0) {
      findings.push({ kind: 'MANIFEST', detail: 'North-Star original_plan.bytes is invalid' })
    }

    const originalPath = path.join(planDir, 'original.md')
    try {
      originalBytes = readRegularFileSync(originalPath, 'original.md', seamOverride)
      originalMarkdown = new TextDecoder().decode(originalBytes)
      const physicalSha = sha256Bytes(new Uint8Array(originalBytes))
      if (originalSha256 && physicalSha !== originalSha256) findings.push({ kind: 'ORIGINAL_TAMPER', detail: 'original.md sha256 mismatch' })
      if (typeof original.bytes === 'number' && originalBytes.length !== original.bytes) findings.push({ kind: 'ORIGINAL_TAMPER', detail: 'original.md byte length mismatch' })
    } catch (e: unknown) {
      if (e instanceof PlanIntegrityError) {
        if (e.errno === 'ENOENT') findings.push({ kind: 'MISSING_ORIGINAL', detail: 'original.md not found' })
        else findings.push(...e.findings)
      } else findings.push({ kind: 'IO_FAULT', detail: `original.md: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  let approvedAmendmentIds: string[] = []
  if (identity) {
    if (typeof identity.sha256 !== 'string' || !isSha256(identity.sha256)) {
      findings.push({ kind: 'MANIFEST', detail: 'North-Star effective_plan_identity.sha256 is invalid' })
    }
      if (typeof identity.canonical_json_utf8 !== 'string') {
        findings.push({ kind: 'MANIFEST', detail: 'North-Star effective_plan_identity.canonical_json_utf8 is required' })
      } else {
        const canonicalBytes = Buffer.from(identity.canonical_json_utf8, 'utf-8')
        if (typeof identity.sha256 === 'string' && isSha256(identity.sha256) && sha256Bytes(new Uint8Array(canonicalBytes)) !== identity.sha256) {
          findings.push({ kind: 'MANIFEST', detail: 'North-Star effective identity hash does not match canonical_json_utf8' })
        }
        let canonicalIdentity: unknown
        try { canonicalIdentity = JSON.parse(identity.canonical_json_utf8) } catch (e: unknown) {
          findings.push({ kind: 'MANIFEST', detail: `North-Star canonical_json_utf8 is not valid JSON: ${e instanceof Error ? e.message : String(e)}` })
        }
        if (isRecord(canonicalIdentity)) {
          const originalInIdentity = canonicalIdentity.original_plan_sha256
          if (originalSha256 && originalInIdentity !== originalSha256) findings.push({ kind: 'MANIFEST', detail: 'North-Star effective identity original plan hash mismatch' })
          if (canonicalIdentity.approved_amendments !== undefined) {
            // v4 ledgers store amendment ids as strings; canonical v5 ledgers
            // store {amendment_id, sha256} records. Accept both.
            const amendments = canonicalIdentity.approved_amendments
            const validStrings = Array.isArray(amendments) && amendments.every(x => typeof x === 'string')
            const validRecords = Array.isArray(amendments) && amendments.every(x => isRecord(x) && typeof x.amendment_id === 'string' && typeof x.sha256 === 'string')
            if (!validStrings && !validRecords) {
              findings.push({ kind: 'MANIFEST', detail: 'North-Star approved_amendments must be an array of strings or {amendment_id, sha256} records' })
            } else if (validStrings) {
              approvedAmendmentIds = [...amendments as string[]]
            } else {
              approvedAmendmentIds = (amendments as Array<Record<string, unknown>>).map(x => String(x.amendment_id))
            }
          }
        }
      }
  }

  const milestones = isRecord(obj.milestones) ? obj.milestones : undefined
  const m8 = milestones && isRecord(milestones.M8) ? milestones.M8 : undefined
  const rawRequirements = m8?.requirements
  if (!Array.isArray(rawRequirements)) findings.push({ kind: 'MANIFEST', detail: 'North-Star milestones.M8.requirements must be an array' })
  const requirements: CanonicalRequirement[] = []
  const requirementIds = new Set<string>()
  if (Array.isArray(rawRequirements)) {
    for (let i = 0; i < rawRequirements.length; i++) {
      const row = rawRequirements[i]
      if (!isRecord(row) || typeof row.id !== 'string' || row.id.length === 0) {
        findings.push({ kind: 'MANIFEST', detail: `North-Star M8 requirement ${i} has no valid id` }); continue
      }
      if (requirementIds.has(row.id)) findings.push({ kind: 'MANIFEST', detail: `Duplicate North-Star requirement id: ${row.id}` })
      requirementIds.add(row.id)
      const status = row.status
      if (status !== 'MATCH' && status !== 'PARTIAL' && status !== 'GAP' && status !== 'BLOCKED'
          // Canonical v5 ledgers use COMPLETED/PENDING requirement statuses.
          && status !== 'COMPLETED' && status !== 'PENDING' && status !== 'VERIFIED') {
        findings.push({ kind: 'MANIFEST', detail: `North-Star requirement ${row.id} has invalid status: ${String(status)}` }); continue
      }
      if (typeof row.statement !== 'string') findings.push({ kind: 'MANIFEST', detail: `North-Star requirement ${row.id} statement is not a string` })
      if (row.evidenceRefs !== undefined && !Array.isArray(row.evidenceRefs)) findings.push({ kind: 'MANIFEST', detail: `North-Star requirement ${row.id} evidenceRefs must be an array` })
      requirements.push({ id: row.id, status, proofStatus: row.proofStatus as CanonicalRequirement['proofStatus'], statement: typeof row.statement === 'string' ? row.statement : '', evidenceRefs: Array.isArray(row.evidenceRefs) ? row.evidenceRefs : [] })
    }
  }

  const rawAnchors = obj.plan_anchors
  const canonicalAnchors: Array<{ requirement_id: string; section_heading: string; line_start: number; line_end: number; anchor_text_sha256: Sha256 }> = []
  if (rawAnchors !== undefined && !Array.isArray(rawAnchors)) findings.push({ kind: 'MANIFEST', detail: 'North-Star plan_anchors must be an array' })
  if (Array.isArray(rawAnchors)) {
    for (let i = 0; i < rawAnchors.length; i++) {
      const anchor = rawAnchors[i]
      if (!isRecord(anchor) || typeof anchor.requirement_id !== 'string' || !requirementIds.has(anchor.requirement_id)) {
        findings.push({ kind: 'MANIFEST', detail: `North-Star plan anchor ${i} references an unknown requirement` }); continue
      }
      if (typeof anchor.section_heading !== 'string' || typeof anchor.line_start !== 'number' || !Number.isInteger(anchor.line_start) || typeof anchor.line_end !== 'number' || !Number.isInteger(anchor.line_end) || typeof anchor.anchor_text_sha256 !== 'string' || !isSha256(anchor.anchor_text_sha256)) {
        findings.push({ kind: 'MANIFEST', detail: `North-Star plan anchor ${i} is malformed` }); continue
      }
      canonicalAnchors.push({ requirement_id: anchor.requirement_id, section_heading: anchor.section_heading, line_start: anchor.line_start, line_end: anchor.line_end, anchor_text_sha256: anchor.anchor_text_sha256 })
    }
  }

  const scope = obj.canonical_scope
  if (scope !== undefined && (!isRecord(scope) || (scope.plan_id !== undefined && scope.plan_id !== planId))) findings.push({ kind: 'PLANID_MISMATCH', detail: 'North-Star canonical_scope.plan_id does not match requested plan' })
  const contract = isRecord(scope) && isRecord(scope.reviewed_contract) ? scope.reviewed_contract : undefined
  if (contract?.requirement_ids !== undefined && (!Array.isArray(contract.requirement_ids) || !contract.requirement_ids.every(x => typeof x === 'string' && requirementIds.has(x)))) {
    findings.push({ kind: 'MANIFEST', detail: 'North-Star reviewed_contract requirement_ids must reference known requirements' })
  }

  if (findings.length > 0) throw new PlanIntegrityError(findings)

  const status = rawStatus as WorkLedgerStatus
  const canonicalStatusCounts = requirements.reduce<Record<string, number>>((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts }, {})
  const planRequirements = requirements.map(row => ({ requirementId: row.id, statement: row.statement, acceptanceCriteria: [] }))
  const reconciliations = requirements.map(row => ({
    requirementId: row.id,
    statement: row.statement,
    status: NORTH_STAR_STATUS_MAP[row.status],
    anchorIds: canonicalAnchors.map((_anchor, index) => `canonical-anchor-${index}`).filter((_id, index) => canonicalAnchors[index].requirement_id === row.id),
    verificationClaimIds: [],
    canonicalStatus: row.proofStatus ?? row.status,
  }))
  const ledgerSha256 = sha256Bytes(new Uint8Array(ledgerBytes))
  const displayPlan = {
    schema: 'harness/portable-plan', version: 3, planId,
    requirements: planRequirements,
  } as unknown as WorkLedger['plan']
  return {
    planId,
    identity: { originalSha256, effectiveSha256: identity?.sha256 as Sha256, status, shadowRevision: typeof obj.shadow_revision === 'number' ? obj.shadow_revision : 0, integrity: 'VALID', integrityFindings: [] },
    plan: displayPlan,
    originalMarkdown,
    amendments: [],
    planAnchors: canonicalAnchors.map(anchor => ({ planSha256: originalSha256!, sectionHeading: anchor.section_heading, lineStart: anchor.line_start, lineEnd: anchor.line_end, anchorTextSha256: anchor.anchor_text_sha256, requirementId: anchor.requirement_id, chunkIndex: 0 })),
    reconciliations: reconciliations as WorkLedger['reconciliations'],
    batches: [], assignments: [], receipts: [], verificationClaims: [], attestations: [], repairSlices: [], orphanFindings: [], sourceAcquisitionReceipts: [], latestReview: undefined, shadowHashes: {},
    canonicalSource: {
      schema: 'harness/north-star-ledger', version: 4,
      ledgerPath: path.relative(root, ledgerPath).split(path.sep).join('/'), ledgerSha256,
      executionState: executionState as string, status, requirementCount: requirements.length,
      requirementStatusCounts: canonicalStatusCounts, approvedAmendmentIds, displayProjection: true,
    },
  }
}

export function readPlanWorkspace(planId: string, rootArg?: string, seamOverride?: Partial<FsSeamReaders>): PlanWorkspace {
  const root = rootArg ? path.resolve(rootArg) : findRoot(undefined, seamOverride)
  validatePlanId(planId)

  validateDirSafe(['.agent'], root, '.agent', seamOverride)
  validateDirSafe(['.agent', 'ledger'], root, 'ledger dir', seamOverride)
  validateDirSafe(['.agent', 'plans'], root, 'plans dir', seamOverride)

  const ledgerPath = path.resolve(root, '.agent', 'ledger', `${planId}.json`)
  const planDir = path.resolve(root, '.agent', 'plans', planId)

  let ledgerBytes: Buffer
  try { ledgerBytes = readRegularFileSync(ledgerPath, 'ledger', seamOverride) } catch (e: unknown) {
    if (e instanceof PlanIntegrityError && e.errno === 'ENOENT')
      throw new PlanNotFoundError(`Plan not found: ${planId}`)
    throw e
  }
  validateDirSafe(['.agent', 'plans', planId], root, 'plan dir', seamOverride)

  let ledgerJson: unknown
  try { ledgerJson = JSON.parse(new TextDecoder().decode(ledgerBytes)) } catch (e: unknown) {
    throw new PlanIntegrityError([{ kind: 'MANIFEST', detail: `WorkLedger must be valid JSON: ${(e as Error).message}` }])
  }
  if (!ledgerJson || typeof ledgerJson !== 'object') throw new PlanIntegrityError([{ kind: 'MANIFEST', detail: 'WorkLedger must be a JSON object' }])
  const obj = ledgerJson as Record<string, unknown>
  if (isCanonicalNorthStarCandidate(obj)) return readCanonicalNorthStarWorkspace(planId, root, ledgerBytes, obj, planDir, ledgerPath, seamOverride)
  if (isLegacyShape(obj)) throw new LegacyRejectionError(`Found legacy key(s): ${LEGACY_KEYS.filter(k => k in obj).join(', ')}`)

  const po = obj.plan as Record<string, unknown> | undefined
  if (!po || typeof po !== 'object') throw new PlanIntegrityError([{ kind: 'MANIFEST', detail: 'WorkLedger.plan must be a PortablePlan object' }])
  if (po.schema !== 'harness/portable-plan' || po.version !== 3) throw new PlanIntegrityError([{ kind: 'MANIFEST', detail: 'WorkLedger.plan must have schema=harness/portable-plan and version=3' }])
  if (po.planId !== planId) throw new PlanIntegrityError([{ kind: 'PLANID_MISMATCH', detail: `Ledger planId (${po.planId}) != requested (${planId})` }])

  const ledger = ledgerJson as WorkLedger
  const findings: IntegrityFinding[] = []

  const origPath = path.join(planDir, 'original.md')
  let origBytes: Buffer
  try {
    origBytes = readRegularFileSync(origPath, 'original.md', seamOverride)
    const ph = sha256Bytes(new Uint8Array(origBytes))
    if (ph !== ledger.plan.original.sha256) findings.push({ kind: 'ORIGINAL_TAMPER', detail: 'original.md sha256 mismatch' })
  } catch (e: unknown) {
    if (e instanceof PlanIntegrityError) {
      if (e.errno === 'ENOENT') findings.push({ kind: 'MISSING_ORIGINAL', detail: 'original.md not found' })
      else findings.push(...e.findings)
    } else findings.push({ kind: 'IO_FAULT', detail: `original.md: ${(e as Error).message}` })
    if (findings.length > 0) throw new PlanIntegrityError([...findings])
    throw e
  }

  for (const a of ledger.amendments || []) { const srcF = validateSourceRef(a.sourceRef); if (srcF) findings.push(srcF) }

  const amendDir = path.join(planDir, 'amendments')
  const shadowDir = path.join(planDir, 'shadow')

  try { validateDirSafe(['.agent', 'plans', planId, 'amendments'], root, 'amendments dir', seamOverride) } catch (e: unknown) {
    if (e instanceof PlanIntegrityError && e.errno === 'ENOENT') { findings.push({ kind: 'MANIFEST', detail: 'amendments directory missing' }); throw new PlanIntegrityError([...findings]) }
    throw e
  }
  try { validateDirSafe(['.agent', 'plans', planId, 'shadow'], root, 'shadow dir', seamOverride) } catch (e: unknown) {
    if (e instanceof PlanIntegrityError && e.errno === 'ENOENT') { findings.push({ kind: 'MISSING_SHADOW', detail: 'shadow directory missing' }); throw new PlanIntegrityError([...findings]) }
    throw e
  }

  const mResult = validateManifest(amendDir, ledger, planId, seamOverride)
  findings.push(...mResult.findings)

  const sResult = validateShadowDir(shadowDir, ledger.shadowHashes || {}, seamOverride)
  findings.push(...sResult.findings)

  if (findings.length > 0) throw new PlanIntegrityError(findings)

  try { assertWorkLedger(ledger, new Uint8Array(origBytes), Object.fromEntries(Object.entries(sResult.shadowBytes).map(([k, v]) => [k, new Uint8Array(v)]))) } catch (e: unknown) {
    throw new PlanIntegrityError([{ kind: 'ENGINE_VALIDATION', detail: `Engine validation: ${e instanceof Error ? e.message : String(e)}` }])
  }

  // The legacy NUL-joined hash remains exported only for older external
  // consumers.  The Control Plane is a canonical producer and must bind its
  // workspace identity to the versioned amendment manifest instead.
  const eff = computeCanonicalEffectivePlanIdentity(
    ledger.plan.original.sha256,
    ledger.amendments.map((amendment, index) => ({
      amendment_id: amendment.amendmentId,
      sha256: mResult.hashes[index],
    })),
  ).sha256
  const omd = new TextDecoder().decode(origBytes)
  return {
    planId: ledger.plan.planId,
    identity: { originalSha256: ledger.plan.original.sha256, effectiveSha256: eff, status: ledger.status, shadowRevision: ledger.shadowRevision, integrity: 'VALID', integrityFindings: [] },
    plan: ledger.plan, originalMarkdown: omd, amendments: [...ledger.amendments], planAnchors: [...ledger.planAnchors],
    reconciliations: [...ledger.reconciliations], batches: [...ledger.batches], assignments: [...ledger.assignments],
    receipts: [...ledger.receipts], verificationClaims: [...ledger.verificationClaims], attestations: [...ledger.attestations],
    repairSlices: [...ledger.repairSlices], orphanFindings: [...ledger.orphanFindings],
    sourceAcquisitionReceipts: [...ledger.sourceAcquisitionReceipts], latestReview: ledger.latestReview, shadowHashes: { ...ledger.shadowHashes },
  }
}

export interface PlanWorkspace {
  planId: string
  identity: { originalSha256: Sha256 | null; effectiveSha256: Sha256 | null; status: WorkLedgerStatus; shadowRevision: number; integrity: IntegrityStatus; integrityFindings: IntegrityFinding[] }
  plan: WorkLedger['plan']; originalMarkdown: string; amendments: WorkLedger['amendments']
  planAnchors: WorkLedger['planAnchors']; reconciliations: WorkLedger['reconciliations']
  batches: WorkLedger['batches']; assignments: WorkLedger['assignments']; receipts: WorkLedger['receipts']
  verificationClaims: WorkLedger['verificationClaims']; attestations: WorkLedger['attestations']
  repairSlices: WorkLedger['repairSlices']; orphanFindings: WorkLedger['orphanFindings']
  sourceAcquisitionReceipts: WorkLedger['sourceAcquisitionReceipts']
  latestReview: WorkLedger['latestReview'] | undefined; shadowHashes: WorkLedger['shadowHashes']
  canonicalSource?: CanonicalNorthStarSource
}

export function computeVerificationSummary(claims: WorkLedger['verificationClaims']): { pass: number; fail: number; blocked: number; unverified: number; total: number } {
  let p = 0; let f = 0; let b = 0; let u = 0
  for (const c of claims) { if (c.outcome === 'PASS') p++; else if (c.outcome === 'FAIL') f++; else if (c.outcome === 'BLOCKED') b++; else u++ }
  return { pass: p, fail: f, blocked: b, unverified: u, total: claims.length }
}

export {
  PlanValidationError, PlanNotFoundError, PlanIntegrityError, LegacyRejectionError,
  validatePlanId, isLegacyShape,
} from '@initforge/agent-rules-engine/plan-identity'

export function computeReconciliationMatrix(ledger: Pick<WorkLedger, 'plan' | 'reconciliations' | 'repairSlices'>): Array<{ requirementId: string; statement: string; status: ReconciliationStatus; claimCount: number; hasRepairSlice: boolean }> {
  const reqs = ledger.plan?.requirements
  if (!reqs) return []
  return reqs.map(q => {
    const rc = (ledger.reconciliations || []).find(x => x.requirementId === q.requirementId)
    return { requirementId: q.requirementId, statement: q.statement, status: rc?.status || 'MISSING', claimCount: rc?.verificationClaimIds?.length || 0, hasRepairSlice: !!rc?.repairSliceId }
  })
}
