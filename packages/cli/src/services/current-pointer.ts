/**
 * current-pointer.ts — M11-R63 atomic generation-based current pointer (CAS).
 *
 * `.agent/current.json` is the singular current-plan pointer. Updates use a
 * generation compare-and-swap through a same-filesystem staged file:
 *
 *   read target generation (CAS gate 1)
 *   -> validate candidate (relative non-traversing paths, referenced target
 *      hashes, generation arithmetic, atomicity protocol)
 *   -> exclusive same-filesystem stage file keyed by the NEXT generation
 *      (CAS gate 2: only one writer can own a given next generation)
 *   -> write + fsync + reopen + hash-verify the staged bytes
 *   -> fresh pre-rename generation check (CAS gate 3)
 *   -> atomic rename
 *   -> reopen + hash-verify the committed pointer and referenced identities
 *
 * Fail-closed: a stale expected generation, absolute/traversing path, missing
 * referenced target, hash mismatch, partial write, symlink/hardlink target, or
 * an occupied next-generation stage aborts without touching the live pointer.
 * Crash before rename leaves the previous valid pointer intact; stale stage
 * files are swept by later commits.
 *
 * ponytail: exclusivity comes from one deterministic stage name per next
 * generation (O_EXCL), not a lock file — two writers targeting the same next
 * generation collide at open, and the pre-rename check proves no lower/higher
 * generation can interleave. Crashed-writer stage files block their generation
 * until they age past STALE_STAGE_MS, then are swept.
 */
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

export interface CurrentPointer {
  readonly schema: string;
  readonly version: number;
  readonly kind: string;
  readonly generation: number;
  readonly plan_id: string;
  readonly plan_root: string;
  readonly original: ArtifactRef;
  readonly canonical_ledger: CanonicalLedger;
  readonly effective_chain_tip: ChainTip;
  readonly candidate_chain_tip: CandidateChainTip;
  readonly contract: ContractRef;
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
    if (e.code === 'ENOENT') return; // bootstrap: no pointer yet
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
  if (ptr.atomicity?.protocol !== 'generation-compare-and-swap') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} lacks generation-compare-and-swap atomicity`);
  }
  if (ptr.atomicity?.commit_target !== POINTER_FILE) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `${POINTER_FILE} commit_target mismatch`);
  }
}

/**
 * Read and structurally validate the current pointer. Returns null when the
 * pointer file is absent (pre-bootstrap). Throws PointerCasError on corrupt
 * or non-conforming content — readers must never trust a broken pointer.
 */
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
  if (st.isSymbolicLink()) throw new PointerCasError(POINTER_CAS_ERRORS.PATH_UNSAFE, `referenced target is a symlink: ${ref.path}`);
  if (st.isDirectory()) throw new PointerCasError(POINTER_CAS_ERRORS.REFERENCED_TARGET_MISSING, `referenced target is a directory: ${ref.path}`);
  if (st.nlink > 1) throw new PointerCasError(POINTER_CAS_ERRORS.PATH_UNSAFE, `referenced target is a hardlink: ${ref.path}`);
  const h = sha256(fs.readFileSync(abs));
  if (h !== ref.sha256) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.REFERENCED_HASH_MISMATCH,
      `referenced hash mismatch for ${ref.path}: recorded ${ref.sha256}, actual ${h}`,
    );
  }
}

function validateCandidate(root: string, c: CurrentPointer, nextGen: number, expectedPrevious: number): void {
  if (!c || typeof c !== 'object') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, 'candidate is not an object');
  }
  if (c.schema !== 'artifact/execution-contract' || c.version !== 1 || c.kind !== 'current-pointer') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, 'candidate schema/version/kind mismatch');
  }
  if (!Number.isSafeInteger(c.generation) || c.generation !== nextGen) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `candidate generation must be ${nextGen}`);
  }
  if (!c.atomicity || c.atomicity.protocol !== 'generation-compare-and-swap') {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, 'candidate must declare generation-compare-and-swap atomicity');
  }
  if (c.atomicity.expected_previous_generation !== expectedPrevious) {
    throw new PointerCasError(
      POINTER_CAS_ERRORS.INVALID_CANDIDATE,
      `candidate expected_previous_generation must be ${expectedPrevious}`,
    );
  }
  if (c.atomicity.commit_target !== POINTER_FILE) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, `candidate commit_target must be ${POINTER_FILE}`);
  }
  if (typeof c.plan_id !== 'string' || c.plan_id.length === 0) {
    throw new PointerCasError(POINTER_CAS_ERRORS.INVALID_CANDIDATE, 'candidate plan_id must be a non-empty string');
  }
  assertRelative(c.plan_root, 'plan_root');
  assertRelative(c.original.path, 'original.path');
  assertRelative(c.canonical_ledger.path, 'canonical_ledger.path');
  assertRelative(c.effective_chain_tip.path, 'effective_chain_tip.path');
  assertRelative(c.candidate_chain_tip.path, 'candidate_chain_tip.path');
  assertRelative(c.contract.path, 'contract.path');
  assertRelative(c.contract.schema_path, 'contract.schema_path');

  const planRootAbs = path.join(root, c.plan_root);
  try {
    if (!fs.lstatSync(planRootAbs).isDirectory()) {
      throw new PointerCasError(POINTER_CAS_ERRORS.REFERENCED_TARGET_MISSING, `plan_root is not a directory: ${c.plan_root}`);
    }
  } catch (e) {
    if (e instanceof PointerCasError) throw e;
    throw new PointerCasError(POINTER_CAS_ERRORS.REFERENCED_TARGET_MISSING, `plan_root missing: ${c.plan_root}`);
  }

  assertReferencedTargetHash(root, c.original);
  assertReferencedTargetHash(root, c.canonical_ledger);
  assertReferencedTargetHash(root, c.effective_chain_tip);
  assertReferencedTargetHash(root, c.candidate_chain_tip);
  assertReferencedTargetHash(root, c.contract);
}

function verifyReferencedIdentities(root: string, ptr: CurrentPointer): void {
  // Acceptance: pointer, amendment, and ledger identities are reopen-verified.
  assertReferencedTargetHash(root, ptr.original);
  assertReferencedTargetHash(root, ptr.canonical_ledger);
  assertReferencedTargetHash(root, ptr.effective_chain_tip);
  assertReferencedTargetHash(root, ptr.candidate_chain_tip);
  assertReferencedTargetHash(root, ptr.contract);
}

function sweepStaleStages(dir: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith(STAGE_PREFIX)) continue;
    const p = path.join(dir, name);
    try {
      const st = fs.lstatSync(p);
      if (now - st.mtimeMs > STALE_STAGE_MS) fs.unlinkSync(p);
    } catch {
      /* ignore races */
    }
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

/**
 * Commit the next pointer by generation compare-and-swap. Fails closed on any
 * violated invariant and never leaves the live pointer partially written.
 */
export function commitCurrentPointer(
  root: string,
  candidate: CurrentPointer,
  expectedPreviousGeneration: number,
): PointerCommitReceipt {
  const dir = path.join(root, '.agent');
  const target = path.join(dir, 'current.json');
  fs.mkdirSync(dir, { recursive: true });
  sweepStaleStages(dir);

  // CAS gate 1: current pointer must sit at the expected generation.
  assertGeneration(root, expectedPreviousGeneration);

  const nextGen = expectedPreviousGeneration + 1;
  validateCandidate(root, candidate, nextGen, expectedPreviousGeneration);

  const content = Buffer.from(JSON.stringify(candidate, null, 2) + '\n', 'utf-8');
  const contentHash = sha256(content);

  // CAS gate 2: exclusive per-generation stage file on the same filesystem.
  const staged = path.join(dir, `${STAGE_PREFIX}${nextGen}`);
  let fd: number;
  try {
    fd = fs.openSync(
      staged,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
  } catch (e: any) {
    if (e.code === 'EEXIST') {
      throw new PointerCasError(
        POINTER_CAS_ERRORS.LOCKED_STAGE,
        `next generation ${nextGen} already staged by another writer: ${path.relative(root, staged)}`,
      );
    }
    throw e;
  }

  let stageOwner = true;
  let closed = false;
  try {
    writeFull(fd, content, staged);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    closed = true;
    // Reopen + hash-verify the staged bytes: torn/partial writes fail closed.
    if (!fs.readFileSync(staged).equals(content)) {
      throw new PointerCasError(POINTER_CAS_ERRORS.HASH_MISMATCH, `staged content mismatch: ${staged}`);
    }

    // CAS gate 3: fresh pre-rename check under the exclusive stage.
    assertGeneration(root, expectedPreviousGeneration);

    assertTargetNotLink(target);
    fs.renameSync(staged, target);
    stageOwner = false;

    // Reopen-verify the committed pointer bytes and identities.
    const reopened = fs.readFileSync(target);
    if (sha256(reopened) !== contentHash) {
      throw new PointerCasError(POINTER_CAS_ERRORS.REOPEN_MISMATCH, `committed pointer hash mismatch at ${POINTER_FILE}`);
    }
    const verified = JSON.parse(reopened.toString('utf-8')) as CurrentPointer;
    if (verified.generation !== nextGen) {
      throw new PointerCasError(POINTER_CAS_ERRORS.REOPEN_MISMATCH, `committed pointer generation mismatch at ${POINTER_FILE}`);
    }
    verifyReferencedIdentities(root, verified);
  } catch (e) {
    if (!closed) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    if (stageOwner) {
      try {
        fs.unlinkSync(staged);
      } catch {
        /* ignore */
      }
    }
    throw e;
  }

  return {
    generation: nextGen,
    staged_path: path.relative(root, staged),
    commit_target: POINTER_FILE,
    staged_sha256: contentHash,
    verified_sha256: contentHash,
    reopened: true,
    updated_at: candidate.atomicity.updated_at,
  };
}
