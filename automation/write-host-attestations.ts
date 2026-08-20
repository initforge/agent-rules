import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  rename,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  assertCertificationAttestation,
  assertProvenanceTimestamp,
  CERTIFICATION_REQUIRED_HOSTS,
  isSha256,
  type HostAttestation,
} from '../packages/engine/src/contracts.js';
import {
  parseEvidenceModelValueForRole,
  type CollectedModelEvidence,
  type ModelEvidenceRecord,
} from './host-attestation.js';

const execFileAsync = promisify(execFile);
const MODEL_EVIDENCE = [
  ['requested', 'requestedModel'],
  ['resolved', 'resolvedModel'],
  ['observed', 'observedModel'],
] as const;

type RequiredHost = typeof CERTIFICATION_REQUIRED_HOSTS[number];
type ModelEvidenceField = typeof MODEL_EVIDENCE[number][0];
type ModelEvidenceRole = typeof MODEL_EVIDENCE[number][1];

export interface RepositoryState {
  readonly headCommit: string;
  readonly dirty: boolean;
}

export interface WriteHostAttestationsOptions {
  /** Existing canonical ledger. It is updated only after every input validates. */
  readonly ledgerPath: string;
  /** Directory for immutable content-addressed raw model-evidence envelopes. */
  readonly evidenceDirectory: string;
  /** Repository whose exact, clean HEAD is being certified. */
  readonly repositoryRoot: string;
  /** The caller's expected HEAD. It must equal the repository's actual HEAD. */
  readonly headCommit: string;
  readonly attestations: readonly HostAttestation[];
  /** Raw, provenance-bearing records collected by sessions; values are never inferred. */
  readonly modelEvidence: Readonly<Record<string, CollectedModelEvidence>>;
  readonly now?: Date;
  /** Test seam. Production callers should leave this unset. */
  readonly getRepositoryState?: (repositoryRoot: string) => Promise<RepositoryState>;
}

export interface WriteHostAttestationsResult {
  readonly ledgerPath: string;
  readonly ledgerSha256: string;
  readonly rawEvidencePaths: readonly string[];
}

interface StoredRawModelEvidence {
  readonly schema: 'host-attestation-raw-model-evidence/v1';
  readonly attestationEvidenceSha256: string;
  readonly evidenceRef: string;
  readonly host: RequiredHost;
  readonly commitSha: string;
  readonly role: ModelEvidenceRole;
  readonly model: string;
  readonly rawEvidenceBase64: string;
  readonly provenance: {
    readonly sourceUri: string;
    readonly producerIdentity: string;
    readonly timestamp: string;
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function modelEvidenceSha256(role: ModelEvidenceRole, record: ModelEvidenceRecord): string {
  const provenance = record.provenance;
  return sha256(concatBytes(
    utf8(`role:${role}`),
    utf8(`value:${record.value}`),
    record.rawEvidenceBytes,
    utf8(`source:${provenance.sourceUri}`),
    utf8(`producer:${provenance.producerIdentity}`),
    utf8(`ts:${provenance.timestamp}`),
  ));
}

async function repositoryState(repositoryRoot: string): Promise<RepositoryState> {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD']),
    execFileAsync('git', ['-C', repositoryRoot, 'status', '--porcelain=v1']),
  ]);
  return { headCommit: head.trim(), dirty: status.length > 0 };
}

async function readRegularFileNoFollow(filePath: string): Promise<Uint8Array> {
  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`not a regular file: ${filePath}`);
    const bytes = await handle.readFile();
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } finally {
    await handle.close();
  }
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  const handle = await open(lockPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
  await handle.close();
  return async () => {
    try {
      await unlink(lockPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
}

async function ensureEvidenceDirectory(directory: string): Promise<boolean> {
  let existed = true;
  try {
    await lstat(directory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    existed = false;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`evidence directory is not a real directory: ${directory}`);
  }
  return !existed;
}

async function writeImmutableFile(filePath: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const handle = await open(filePath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readRegularFileNoFollow(filePath);
    if (sha256(existing) !== sha256(bytes) || existing.length !== bytes.length) {
      throw new Error(`content-addressed evidence collision at ${filePath}`);
    }
    return false;
  }
}

async function atomicReplaceLedger(ledgerPath: string, bytes: Uint8Array, mode: number): Promise<void> {
  const directory = path.dirname(ledgerPath);
  const stageDirectory = await mkdtemp(path.join(directory, '.host-attestations-'));
  const stagedPath = path.join(stageDirectory, 'ledger.json');
  try {
    const handle = await open(stagedPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, mode);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(stagedPath, ledgerPath);
  } finally {
    try { await unlink(stagedPath); } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try { await rmdir(stageDirectory); } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function requiredHost(value: string): value is RequiredHost {
  return (CERTIFICATION_REQUIRED_HOSTS as readonly string[]).includes(value);
}

function assertExactFiveHostAttestations(attestations: readonly HostAttestation[]): void {
  if (attestations.length !== CERTIFICATION_REQUIRED_HOSTS.length) {
    throw new Error(`expected exactly ${CERTIFICATION_REQUIRED_HOSTS.length} attestations, got ${attestations.length}`);
  }
  const hosts = new Set<string>();
  for (const attestation of attestations) {
    if (!requiredHost(attestation.host)) throw new Error(`foreign certification host: ${attestation.host}`);
    if (hosts.has(attestation.host)) throw new Error(`duplicate attestation for host ${attestation.host}`);
    hosts.add(attestation.host);
  }
  for (const host of CERTIFICATION_REQUIRED_HOSTS) {
    if (!hosts.has(host)) throw new Error(`missing attestation for host ${host}`);
  }
}

function storedEvidence(
  host: RequiredHost,
  attestation: HostAttestation,
  field: ModelEvidenceField,
  role: ModelEvidenceRole,
  record: ModelEvidenceRecord,
): { readonly bytes: Uint8Array; readonly filename: string } {
  const reference = attestation.evidenceRefs!.find((item) => item.role === role);
  if (!reference) throw new Error(`${host}: missing ${role} evidence reference`);
  const attestationEvidenceSha = modelEvidenceSha256(role, record);
  if (reference.evidenceSha256 !== attestationEvidenceSha) {
    throw new Error(`${host}: ${field} raw evidence does not match attestation evidence hash`);
  }
  const document: StoredRawModelEvidence = {
    schema: 'host-attestation-raw-model-evidence/v1',
    attestationEvidenceSha256: attestationEvidenceSha,
    evidenceRef: reference.evidenceRef,
    host,
    commitSha: attestation.commitSha,
    role,
    model: record.value,
    rawEvidenceBase64: Buffer.from(record.rawEvidenceBytes).toString('base64'),
    provenance: {
      sourceUri: record.provenance.sourceUri,
      producerIdentity: record.provenance.producerIdentity,
      timestamp: record.provenance.timestamp,
    },
  };
  const bytes = utf8(`${JSON.stringify(document)}\n`);
  return { bytes, filename: `${sha256(bytes)}.json` };
}

function validateAndPrepare(options: WriteHostAttestationsOptions, now: Date): { readonly files: readonly { filename: string; bytes: Uint8Array }[] } {
  if (!isSha256(options.headCommit)) throw new Error('headCommit must be a SHA-256 commit ID');
  assertExactFiveHostAttestations(options.attestations);

  const suppliedModelHosts = Object.keys(options.modelEvidence);
  if (suppliedModelHosts.some((host) => !requiredHost(host))) {
    throw new Error('model evidence contains a foreign host');
  }

  const files: { filename: string; bytes: Uint8Array }[] = [];
  for (const host of CERTIFICATION_REQUIRED_HOSTS) {
    const attestation = options.attestations.find((item) => item.host === host)!;
    // This is the canonical contract, applied at the caller's exact HEAD.
    assertCertificationAttestation(attestation, options.headCommit, now);

    const evidence = options.modelEvidence[host];
    if (!evidence) throw new Error(`${host}: missing collected model evidence`);
    for (const [field, role] of MODEL_EVIDENCE) {
      const record = evidence[field];
      const attestedValue = attestation[role];
      if (!record || !record.value || record.value.trim().length === 0) {
        throw new Error(`${host}: ${field} model value is missing`);
      }
      if (record.value !== attestedValue) {
        throw new Error(`${host}: ${field} model value does not match the attestation`);
      }
      if (!record.rawEvidenceBytes || record.rawEvidenceBytes.length === 0) {
        throw new Error(`${host}: ${field} raw evidence is missing`);
      }
      if (!record.provenance?.sourceUri || !record.provenance.producerIdentity || !record.provenance.timestamp) {
        throw new Error(`${host}: ${field} evidence provenance is incomplete`);
      }
      if (parseEvidenceModelValueForRole(record.rawEvidenceBytes, field) !== record.value) {
        throw new Error(`${host}: ${field} raw evidence does not prove the attested model`);
      }
      assertProvenanceTimestamp(record.provenance.timestamp, attestation.issuedAt, attestation.expiresAt, now);
      files.push(storedEvidence(host, attestation, field, role, record));
    }
  }

  const names = new Set<string>();
  for (const file of files) {
    if (names.has(file.filename)) throw new Error(`duplicate raw evidence artifact: ${file.filename}`);
    names.add(file.filename);
  }
  return { files };
}

/**
 * Atomically installs a complete five-host certification set. This writer only
 * persists already-collected evidence; it never invokes a host session or
 * invents requested, resolved, or observed model values.
 */
export async function writeHostAttestations(options: WriteHostAttestationsOptions): Promise<WriteHostAttestationsResult> {
  if (!options.ledgerPath || !options.evidenceDirectory || !options.repositoryRoot) {
    throw new Error('ledgerPath, evidenceDirectory, and repositoryRoot are required');
  }
  const now = options.now ?? new Date();
  const actualRepositoryState = await (options.getRepositoryState ?? repositoryState)(options.repositoryRoot);
  if (actualRepositoryState.dirty) throw new Error('refusing to attest a dirty repository');
  if (actualRepositoryState.headCommit !== options.headCommit) throw new Error('caller HEAD does not match repository HEAD');

  // Do all validation before creating an evidence directory or modifying a ledger.
  const { files } = validateAndPrepare(options, now);
  const ledgerPath = path.resolve(options.ledgerPath);
  const evidenceDirectory = path.resolve(options.evidenceDirectory);
  const releaseLock = await acquireLock(`${ledgerPath}.host-attestations.lock`);
  const createdEvidence: string[] = [];
  let createdEvidenceDirectory = false;
  try {
    const originalLedgerBytes = await readRegularFileNoFollow(ledgerPath);
    const ledgerMode = (await stat(ledgerPath)).mode & 0o777;
    let ledger: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(originalLedgerBytes));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ledger must be a JSON object');
      ledger = parsed as Record<string, unknown>;
    } catch (error: unknown) {
      throw new Error(`canonical ledger is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    createdEvidenceDirectory = await ensureEvidenceDirectory(evidenceDirectory);
    for (const file of files) {
      const target = path.join(evidenceDirectory, file.filename);
      if (await writeImmutableFile(target, file.bytes)) createdEvidence.push(target);
    }

    // The lock coordinates this writer; the byte check prevents overwriting a
    // ledger changed by a non-cooperating writer while evidence was staged.
    const currentLedgerBytes = await readRegularFileNoFollow(ledgerPath);
    if (sha256(currentLedgerBytes) !== sha256(originalLedgerBytes)) {
      throw new Error('canonical ledger changed while attestations were being staged');
    }
    const nextLedger = { ...ledger, attestations: [...options.attestations] };
    const nextLedgerBytes = utf8(`${JSON.stringify(nextLedger, null, 2)}\n`);
    await atomicReplaceLedger(ledgerPath, nextLedgerBytes, ledgerMode);
    return {
      ledgerPath,
      ledgerSha256: sha256(nextLedgerBytes),
      rawEvidencePaths: files.map((file) => path.join(evidenceDirectory, file.filename)),
    };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const evidencePath of createdEvidence.reverse()) {
      try { await unlink(evidencePath); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    if (createdEvidenceDirectory) {
      try { await rmdir(evidenceDirectory); } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOTEMPTY' && (cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
          cleanupErrors.push(cleanupError);
        }
      }
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`attestation write failed and evidence cleanup failed: ${cleanupErrors.map(String).join('; ')}`);
    }
    throw error;
  } finally {
    await releaseLock();
  }
}
