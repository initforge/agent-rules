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
  computeEffectivePlanSha256, buildManifestJson,
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

  const eff = computeEffectivePlanSha256(ledger.plan.original.sha256, mResult.hashes)
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
  latestReview: WorkLedger['latestReview']; shadowHashes: WorkLedger['shadowHashes']
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

export function computeReconciliationMatrix(ledger: WorkLedger): Array<{ requirementId: string; statement: string; status: ReconciliationStatus; claimCount: number; hasRepairSlice: boolean }> {
  const reqs = ledger.plan?.requirements
  if (!reqs) return []
  return reqs.map(q => {
    const rc = (ledger.reconciliations || []).find(x => x.requirementId === q.requirementId)
    return { requirementId: q.requirementId, statement: q.statement, status: rc?.status || 'MISSING', claimCount: rc?.verificationClaimIds?.length || 0, hasRepairSlice: !!rc?.repairSliceId }
  })
}
