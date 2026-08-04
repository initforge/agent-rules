import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Sha256 } from './contracts.js';
import { sha256Bytes, isSha256 } from './contracts.js';

// ── ArtifactPointer (AM-0021 §4, M11-R45) ─────────────────────

export type TrustClass = 'UNTRUSTED' | 'QUARANTINED' | 'TRUSTED' | 'VERIFIED';
export type RedactionState = 'RAW' | 'REDACTED' | 'BOUNDED_EXCERPT' | 'POINTER_ONLY';

export interface ArtifactPointer {
  readonly artifactId: string;
  readonly uri: string;
  readonly sha256: Sha256;
  readonly mediaType: string;
  readonly candidateEpoch: number;
  readonly claimScope: readonly string[];
  readonly byteSize: number;
  readonly chunkIndex: number | null;
  readonly trustClass: TrustClass;
  readonly redactionState: RedactionState;
}

export interface ArtifactQuery {
  readonly artifactId?: string;
  readonly uri?: string;
  readonly claimScope?: readonly string[];
  readonly trustClass?: TrustClass;
  readonly redactionState?: RedactionState;
  readonly candidateEpoch?: number;
  readonly chunkIndex?: number;
}

export interface DrilldownReceipt {
  readonly artifactId: string;
  readonly chunks: readonly ArtifactChunk[];
  readonly totalBytes: number;
  readonly tokenEstimate: number;
  readonly reason: string;
  readonly retrievedAt: string;
}

export interface ArtifactChunk {
  readonly chunkIndex: number;
  readonly sha256: Sha256;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly content: string;
}

export interface ArtifactQueryResult {
  readonly pointer: ArtifactPointer;
  readonly drilldown: DrilldownReceipt | null;
  readonly matchedBy: readonly string[];
}

// ── Content-addressed storage ──────────────────────────────────

const ARTIFACT_DIR = '.agent/artifacts';
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,128}$/;

function assertSafePathComponent(id: string, label: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`unsafe path: ${label} "${id}"`);
  }
}

function assertPathWithin(resolved: string, root: string): void {
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${resolved} is not within ${root}`);
  }
}

function computeSha256(content: string): Sha256 {
  return sha256Bytes(new TextEncoder().encode(content));
}

export function createArtifactPointer(
  uri: string,
  content: string,
  candidateEpoch: number,
  claimScope: readonly string[] = [],
  opts: {
    mediaType?: string;
    trustClass?: TrustClass;
    redactionState?: RedactionState;
    chunkIndex?: number | null;
    artifactId?: string;
  } = {},
): ArtifactPointer {
  const sha256 = computeSha256(content);
  const artifactId = opts.artifactId ?? `art-${sha256.slice(0, 16)}`;
  assertSafePathComponent(artifactId, 'artifactId');

  return Object.freeze({
    artifactId,
    uri,
    sha256,
    mediaType: opts.mediaType ?? 'application/octet-stream',
    candidateEpoch,
    claimScope: Object.freeze([...claimScope]),
    byteSize: Buffer.byteLength(content, 'utf-8'),
    chunkIndex: opts.chunkIndex ?? null,
    trustClass: opts.trustClass ?? 'UNTRUSTED',
    redactionState: opts.redactionState ?? 'RAW',
  });
}

export function writeArtifact(
  pointer: ArtifactPointer,
  content: string,
  baseDir: string = process.cwd(),
): string {
  assertSafePathComponent(pointer.artifactId, 'artifactId');
  const artifactBase = path.resolve(baseDir, ARTIFACT_DIR);
  const artifactDir = path.resolve(artifactBase, pointer.artifactId.slice(0, 2));
  assertPathWithin(artifactDir, artifactBase);
  fs.mkdirSync(artifactDir, { recursive: true });

  const filePath = path.join(artifactDir, `${pointer.artifactId}.content`);
  assertPathWithin(filePath, artifactBase);

  const writtenSha = computeSha256(content);
  if (writtenSha !== pointer.sha256) {
    throw new Error(`Content SHA-256 mismatch: expected ${pointer.sha256}, got ${writtenSha}`);
  }

  // ponytail: atomic write via temp+rename; target must not exist
  const tempPath = path.join(artifactDir, `.tmp-${pointer.artifactId}-${randomUUID()}`);
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } finally {
    // Clean up temp file on any error (rename succeeded = no temp file)
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
  return filePath;
}

export function readArtifact(pointer: ArtifactPointer, baseDir: string = process.cwd()): string {
  assertSafePathComponent(pointer.artifactId, 'artifactId');
  const artifactBase = path.resolve(baseDir, ARTIFACT_DIR);
  const filePath = path.join(artifactBase, pointer.artifactId.slice(0, 2), `${pointer.artifactId}.content`);
  assertPathWithin(filePath, artifactBase);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const actualSha = computeSha256(content);
  if (actualSha !== pointer.sha256) {
    throw new Error(`Artifact integrity check failed: expected ${pointer.sha256}, got ${actualSha}`);
  }

  return content;
}

export function queryArtifacts(
  pointers: readonly ArtifactPointer[],
  query: ArtifactQuery,
): ArtifactQueryResult[] {
  return pointers.filter((pointer) => {
    if (query.artifactId !== undefined && pointer.artifactId !== query.artifactId) return false;
    if (query.uri !== undefined && pointer.uri !== query.uri) return false;
    if (query.trustClass !== undefined && pointer.trustClass !== query.trustClass) return false;
    if (query.redactionState !== undefined && pointer.redactionState !== query.redactionState) return false;
    if (query.candidateEpoch !== undefined && pointer.candidateEpoch !== query.candidateEpoch) return false;
    if (query.chunkIndex !== undefined && pointer.chunkIndex !== query.chunkIndex) return false;
    if (query.claimScope && query.claimScope.length > 0) {
      const hasOverlap = query.claimScope.some((s) => pointer.claimScope.includes(s));
      if (!hasOverlap) return false;
    }
    return true;
  }).map((pointer) => ({
    pointer,
    drilldown: null,
    matchedBy: Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k),
  }));
}

export function utf8BoundedTruncate(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content, 'utf-8') <= maxBytes) {
    return content;
  }
  const buf = Buffer.from(content, 'utf-8').subarray(0, maxBytes);
  // Walk back over trailing UTF-8 continuation bytes to a sequence start
  let end = buf.length;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) end--;
  // If the byte at end-1 is a multi-byte lead, its continuation bytes were cut off
  if (end > 0 && (buf[end - 1] & 0xc0) === 0xc0) end--;
  return buf.subarray(0, end).toString('utf-8');
}

export function boundedExcerpt(
  content: string,
  maxBytes: number,
  pointer: ArtifactPointer,
): ArtifactPointer {
  if (Buffer.byteLength(content, 'utf-8') <= maxBytes) {
    return { ...pointer, redactionState: 'BOUNDED_EXCERPT' as RedactionState };
  }
  const truncated = utf8BoundedTruncate(content, maxBytes);
  const sha256 = computeSha256(truncated);
  return {
    ...pointer,
    sha256,
    byteSize: Buffer.byteLength(truncated, 'utf-8'),
    redactionState: 'BOUNDED_EXCERPT' as RedactionState,
  };
}

export function redactArtifact(pointer: ArtifactPointer): ArtifactPointer {
  return {
    ...pointer,
    redactionState: 'REDACTED' as RedactionState,
    uri: '',
    sha256: computeSha256(''),
    byteSize: 0,
  };
}
