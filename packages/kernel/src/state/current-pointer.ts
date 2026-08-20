import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const POINTER_FILE = '.agent/current.json';
export const STAGE_PREFIX = '.current-pointer.stage.';
export const STALE_STAGE_MS = 60_000;

export const POINTER_CAS_ERRORS = {
  STALE_EXPECTED: 'POINTER_STALE_EXPECTED',
  TARGET_MISSING: 'POINTER_TARGET_MISSING',
  INVALID_CANDIDATE: 'POINTER_INVALID_CANDIDATE',
  PATH_UNSAFE: 'POINTER_PATH_UNSAFE',
  REFERENCED_TARGET_MISSING: 'POINTER_REFERENCED_TARGET_MISSING',
  REFERENCED_HASH_MISMATCH: 'POINTER_REFERENCED_HASH_MISMATCH',
  PARTIAL_WRITE: 'POINTER_PARTIAL_WRITE',
  HASH_MISMATCH: 'POINTER_HASH_MISMATCH',
  LOCKED_STAGE: 'POINTER_LOCKED_STAGE',
  REOPEN_MISMATCH: 'POINTER_REOPEN_MISMATCH',
} as const;

export class PointerCasError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PointerCasError';
  }
}

export interface ArtifactRef {
  readonly path: string;
  readonly sha256: string;
}

export interface ChainTip extends ArtifactRef {
  readonly amendment_id: string;
}

export interface CandidateChainTip extends ChainTip {
  readonly status: string;
}

export interface CanonicalLedger extends ArtifactRef {
  readonly observed_revision: number;
  readonly observed_effective_sha256: string;
  readonly plan_status: string;
  readonly execution_state: string;
}

export interface ContractRef extends ArtifactRef {
  readonly schema_path: string;
  readonly requirement_ids: readonly string[];
  readonly status: string;
}

export interface PointerAtomicity {
  readonly protocol: string;
  readonly expected_previous_generation: number;
  readonly commit_target: string;
  readonly activation_state: string;
  readonly updated_at: string;
}

export interface PointerSupersession {
  readonly transaction_id: string;
  readonly previous_work_id: string;
  readonly previous_plan_id: string;
  readonly reason: string;
  readonly changed_at: string;
}

export interface CurrentPointer {
  readonly schema: string;
  readonly version: number;
  readonly kind: string;
  readonly generation: number;
  /** Stable owner identity; plan_id is descriptive and cannot substitute for it. */
  readonly work_id: string;
  readonly plan_id: string;
  readonly plan_root: string;
  readonly original: ArtifactRef;
  readonly canonical_ledger: CanonicalLedger;
  readonly effective_chain_tip: ChainTip;
  readonly candidate_chain_tip: CandidateChainTip;
  readonly contract: ContractRef;
  /** Present when this pointer was activated by a canonical goal switch. */
  readonly supersession?: PointerSupersession;
  readonly atomicity: PointerAtomicity;
}

export interface PointerCommitReceipt {
  readonly generation: number;
  readonly staged_path: string;
  readonly commit_target: string;
  readonly staged_sha256: string;
  readonly verified_sha256: string;
  readonly reopened: true;
  readonly updated_at: string;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function isRelativeSafe(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..' || seg === '');
}

function assertRelative(p: string, what: string): void {
  if (!isRelativeSafe(p)) {
    throw new PointerCasError(POINTER_CAS_ERRORS.PATH_UNSAFE, `${what}: absolute or traversing path "${p}"`);
  }
}

function assertTargetNotLink(target: string): void {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch (e: any) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  if (st.isSymbolicLink()) throw new PointerCasError(POINTER_CAS_ERRORS.PATH_UNSAFE, `${POINTER_FILE} is a symlink`);
  if (st.nlink > 1) throw new PointerCasError(POINTER_CAS_ERRORS.PATH_UNSAFE, `${POINTER_FILE} is a hardlink (nlink=${st.nlink})`);
}

function assertPointerShape(p: unknown): void {
  if (!p || typeof p !== 'object') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} is not an object`);
  }
  const ptr = p as Record<string, any>;
  if (ptr.schema !== 'artifact/execution-contract' || ptr.kind !== 'current-pointer') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} is not a current-pointer artifact`);
  }
  if (!Number.isSafeInteger(ptr.generation) || ptr.generation < 1) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} has invalid generation`);
  }
  if (typeof ptr.work_id !== 'string' || ptr.work_id.trim().length === 0) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} requires a non-empty work_id`);
  }
  if (ptr.atomicity?.protocol !== 'generation-compare-and-swap') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} lacks generation-compare-and-swap atomicity`);
  }
  if (ptr.atomicity?.commit_target !== POINTER_FILE) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} commit_target mismatch`);
  }
}

export function readCurrentPointer(root: string): CurrentPointer | null {
  const target = path.join(root, POINTER_FILE);
  let raw: string;
  try {
    raw = fs.readFileSync(target, 'utf-8');
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  let ptr: unknown;
  try {
    ptr = JSON.parse(raw);
  } catch {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} is not valid JSON`);
  }
  assertPointerShape(ptr);
  return ptr as CurrentPointer;
}

function assertReferencedTargetHash(root: string, ref: ArtifactRef): void {
  assertRelative(ref.path, 'artifact path');
  const abs = path.join(root, ref.path);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(abs);
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      throw new PointerCasError(POINTER_CAS_ERRORS.REFERENCED_TARGET_MISSING, `referenced target missing: ${ref.path}`);
    }
    throw e;
  }
  if (st.isSymbolicLink()) {
    throw new PointerCasError(POINTER_CAS_ERRORS.PATH_UNSAFE, `referenced target is a symlink: ${ref.path}`);
  }
  const bytes = fs.readFileSync(abs);
  const computed = sha256(bytes);
  if (computed !== ref.sha256) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.REFERENCED_HASH_MISMATCH,
      `referenced target hash mismatch: ${ref.path} (computed ${computed.slice(0, 16)}... != expected ${ref.sha256.slice(0, 16)}...)`,
    );
  }
}

function validateCandidate(root: string, candidate: CurrentPointer, nextGen: number, expectedPrev: number): void {
  assertPointerShape(candidate);
  if (candidate.generation !== nextGen) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.INVALID_CANDIDATE,
      `candidate generation ${candidate.generation} != next expected generation ${nextGen}`,
    );
  }
  if (candidate.atomicity.expected_previous_generation !== expectedPrev) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.INVALID_CANDIDATE,
      `candidate expected_previous_generation ${candidate.atomicity.expected_previous_generation} != expected ${expectedPrev}`,
    );
  }
  assertRelative(candidate.plan_root, 'plan_root');
  assertReferencedTargetHash(root, candidate.original);
  assertReferencedTargetHash(root, candidate.canonical_ledger);
  assertReferencedTargetHash(root, candidate.effective_chain_tip);
  assertReferencedTargetHash(root, candidate.candidate_chain_tip);
  assertReferencedTargetHash(root, candidate.contract);
}

function sweepStaleStages(dir: string): void {
  try {
    const names = fs.readdirSync(dir);
    const now = Date.now();
    for (const n of names) {
      if (n.startsWith(STAGE_PREFIX)) {
        const full = path.join(dir, n);
        const st = fs.statSync(full);
        if (now - st.mtimeMs > STALE_STAGE_MS) {
          fs.rmSync(full, { force: true });
        }
      }
    }
  } catch {}
}

export function commitCurrentPointer(
  root: string,
  candidate: CurrentPointer,
  expectedPreviousGeneration: number,
): PointerCommitReceipt {
  const dir = path.join(root, '.agent');
  const target = path.join(dir, 'current.json');
  fs.mkdirSync(dir, { recursive: true });
  sweepStaleStages(dir);

  assertGeneration(root, expectedPreviousGeneration);

  const nextGen = expectedPreviousGeneration + 1;
  validateCandidate(root, candidate, nextGen, expectedPreviousGeneration);

  const content = Buffer.from(JSON.stringify(candidate, null, 2) + '\n', 'utf-8');
  const contentHash = sha256(content);

  const stageFile = path.join(dir, `${STAGE_PREFIX}${nextGen}`);
  let fd: number;
  try {
    fd = fs.openSync(stageFile, 'wx', 0o600);
  } catch (e: any) {
    if (e.code === 'EEXIST') {
      throw new PointerCasError(
        POINTER_CAS_ERRORS.LOCKED_STAGE,
        `stage file for generation ${nextGen} is locked: another commit is active or crashed stage remains`,
      );
    }
    throw e;
  }

  try {
    writeFull(fd, content, stageFile);
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    const stagedBytes = fs.readFileSync(stageFile);
    const stagedHash = sha256(stagedBytes);
    if (stagedHash !== contentHash) {
      throw new PointerCasError(POINTER_CAS_ERRORS.HASH_MISMATCH, `staged bytes hash verification failed`);
    }

    assertTargetNotLink(target);
    assertGeneration(root, expectedPreviousGeneration);

    fs.renameSync(stageFile, target);

    const committedBytes = fs.readFileSync(target);
    const committedHash = sha256(committedBytes);
    if (committedHash !== contentHash) {
      throw new PointerCasError(POINTER_CAS_ERRORS.REOPEN_MISMATCH, `committed bytes hash verification failed`);
    }

    return {
      generation: nextGen,
      staged_path: stageFile,
      commit_target: POINTER_FILE,
      staged_sha256: stagedHash,
      verified_sha256: committedHash,
      reopened: true,
      updated_at: candidate.atomicity.updated_at,
    };
  } catch (err) {
    try {
      fs.closeSync(fd);
    } catch {}
    fs.rmSync(stageFile, { force: true });
    throw err;
  }
}

function writeFull(fd: number, content: Buffer, staged: string): void {
  let off = 0;
  while (off < content.length) {
    const n = fs.writeSync(fd, content, off, content.length - off);
    if (n === 0) throw new PointerCasError(POINTER_CAS_ERRORS.PARTIAL_WRITE, `staged write made no progress: ${staged}`);
    off += n;
  }
}

function assertGeneration(root: string, expectedPrevious: number): void {
  const current = readCurrentPointer(root);
  if (expectedPrevious === 0) {
    if (current !== null) {
      throw new PointerCasError(
        POINTER_CAS_ERRORS.STALE_EXPECTED,
        `bootstrap expected no pointer but found generation ${current.generation}`,
      );
    }
    return;
  }
  if (current === null) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.TARGET_MISSING,
      `no current pointer at ${POINTER_FILE}; bootstrap expected generation 0`,
    );
  }
  if (current.generation !== expectedPrevious) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.STALE_EXPECTED,
      `expected generation ${expectedPrevious} but current pointer is generation ${current.generation}`,
    );
  }
}
