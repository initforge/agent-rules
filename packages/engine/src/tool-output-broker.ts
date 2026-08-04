import { randomUUID } from 'node:crypto';
import { createArtifactPointer, writeArtifact, utf8BoundedTruncate, type ArtifactPointer, type TrustClass, type RedactionState } from './artifact-pointer.js';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';

// ── ToolOutputBroker (AM-0021 §5, M11-R40) ──────────────────

export type ToolKind = 'native_child' | 'cli' | 'test_runner' | 'browser_runner' | 'lsp' | 'build' | 'other';

export interface ToolOutputReceipt {
  readonly toolOutputId: string;
  readonly toolKind: ToolKind;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly stdoutArtifact: ArtifactPointer;
  readonly stderrArtifact: ArtifactPointer;
  readonly stdoutExcerpt: string;
  readonly stderrExcerpt: string;
  readonly anomalyFlags: readonly string[];
  readonly stdoutPointer: ArtifactPointer;
  readonly stderrPointer: ArtifactPointer;
  readonly stdoutSha256: Sha256;
  readonly stderrSha256: Sha256;
  readonly stdoutExcerptSha256: Sha256; // hash of bounded excerpt (can differ from stdoutSha256 if truncated)
  readonly stderrExcerptSha256: Sha256;
  readonly rawContentSha256: Sha256; // canonically framed: SHA-256(JSON.stringify([stdoutSha256, stderrSha256]))
  readonly retrievedAt: string;
  /** True when raw artifact is restricted (anomaly detected), excerpt is redacted */
  readonly hasRestrictedArtifact: boolean;
}

export interface ReceiptValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ExcerptBounds {
  readonly stdoutExcerptBytes: number;
  readonly stderrExcerptBytes: number;
  readonly maxExcerptBytes: number;
  readonly withinBounds: boolean;
}

export interface ToolOutputOptions {
  readonly maxExcerptBytes?: number;
  readonly trustClass?: TrustClass;
  readonly redactionState?: RedactionState;
  readonly candidateEpoch?: number;
  readonly claimScope?: readonly string[];
  readonly baseDir?: string;
  /** Enable content redaction in excerpts (default: true when anomaly patterns detected) */
  readonly redactExcerpts?: boolean;
}

export interface RestrictedArtifact {
  readonly artifactId: string;
  readonly anomalyFlags: readonly string[];
  readonly redactionState: 'REDACTED';
  readonly originalSha256: Sha256;
  readonly restrictedAt: string;
}

const DEFAULT_MAX_EXCERPT = 512;
const ANOMALY_PATTERNS = [
  /(?:password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+/gi,
  /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/gi,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  /(?:aws|gcp|azure)[_-]?(?:secret|key|token)\s*[:=]\s*\S+/gi,
  /(?:npm|pip|maven|gradle)\s+(?:token|key|auth)\s*[:=]\s*\S+/gi,
  /(?:bearer|authorization)\s*[:=]\s*\S+/gi,
];

// ponytail: value redaction limited to key=value and line patterns; add URL/header redaction when needed
const VALUE_REDACTION_PATTERNS: readonly [RegExp, (match: string) => string][] = [
  [/(?:password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+/gi, (m) => m.split('=')[0] + '=[REDACTED]'],
  [/(?:aws|gcp|azure)(?:[_-](?:secret|key|token))+\s*[:=]\s*\S+/gi, (m) => m.split('=')[0] + '=[REDACTED]'],
  [/(?:bearer|authorization)[\s:]+Bearer\s+\S+/gi, (m) => m.replace(/\S+$/, '[REDACTED]')],
  [/(?:npm|pip|maven|gradle)\s+(?:token|key|auth)\s*[:=]\s*\S+/gi, (m) => m.split('=')[0] + '=[REDACTED]'],
];

// ── Content-addressed artifact helpers ──────────────────

function computeSha256(content: string): Sha256 {
  return sha256Bytes(new TextEncoder().encode(content));
}

function safeId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function detectAnomalies(content: string): string[] {
  const flags: string[] = [];
  for (const pattern of ANOMALY_PATTERNS) {
    pattern.lastIndex = 0; // reset global regex state
    if (pattern.test(content)) {
      flags.push(`anomaly:secret-like-content`);
      break;
    }
  }
  if (content.length > 10_000_000) {
    flags.push('anomaly:oversized-output');
  }
  return flags;
}

function extractExcerpt(content: string, maxBytes: number): string {
  return utf8BoundedTruncate(content, maxBytes);
}

/**
 * Redact secret-like values from text content.
 * Replaces patterns like `password=secret` with `password=[REDACTED]`.
 * ponytail: does not redact private key blocks (those trigger anomaly only); extend when needed.
 */
export function redactContent(content: string): string {
  let redacted = content;
  for (const [pattern, replacer] of VALUE_REDACTION_PATTERNS) {
    if (pattern instanceof RegExp) pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => replacer(match));
  }
  return redacted;
}

/**
 * Create a restricted artifact record for anomaly-trigged raw content.
 * The raw artifact stays on disk but is not referenced in main-facing receipts.
 */
export function createRestrictedArtifact(
  artifactId: string,
  originalSha256: Sha256,
  anomalyFlags: readonly string[],
): RestrictedArtifact {
  return Object.freeze({
    artifactId,
    anomalyFlags: Object.freeze([...anomalyFlags]),
    redactionState: 'REDACTED',
    originalSha256,
    restrictedAt: new Date().toISOString(),
  });
}

/**
 * Validate excerpt bounds compliance.
 */
export function validateExcerptBounds(
  receipt: ToolOutputReceipt,
  maxExcerptBytes: number = DEFAULT_MAX_EXCERPT,
): ExcerptBounds {
  const stdoutExcerptBytes = Buffer.byteLength(receipt.stdoutExcerpt, 'utf-8');
  const stderrExcerptBytes = Buffer.byteLength(receipt.stderrExcerpt, 'utf-8');
  return Object.freeze({
    stdoutExcerptBytes,
    stderrExcerptBytes,
    maxExcerptBytes,
    withinBounds: stdoutExcerptBytes <= maxExcerptBytes && stderrExcerptBytes <= maxExcerptBytes,
  });
}

// ── ToolOutputBroker ──────────────────────────────────────

export interface ToolOutputResult {
  readonly receipt: ToolOutputReceipt;
}

export function brokerToolOutput(
  command: string,
  args: readonly string[],
  stdoutContent: string,
  stderrContent: string,
  exitCode: number,
  durationMs: number,
  opts: ToolOutputOptions = {},
): ToolOutputResult {
  const toolOutputId = safeId('toolout');
  const maxExcerptBytes = opts.maxExcerptBytes ?? DEFAULT_MAX_EXCERPT;
  const candidateEpoch = opts.candidateEpoch ?? Date.now();
  const claimScope = opts.claimScope ?? [];
  const trustClass = opts.trustClass ?? 'UNTRUSTED';
  const redactionState = opts.redactionState ?? 'RAW';
  const baseDir = opts.baseDir ?? process.cwd();
  const retrievedAt = new Date().toISOString();

  // Detect anomalies in raw content before any artifact writes
  const anomalyFlags = detectAnomalies(stdoutContent + stderrContent);
  const hasAnomaly = anomalyFlags.length > 0;
  const shouldRedact = opts.redactExcerpts ?? hasAnomaly;

  // Write stdout to content-addressed artifact
  // If anomaly detected, mark as REDACTED (raw still stored but flagged)
  const stdoutRedactionState: RedactionState = hasAnomaly ? 'REDACTED' : redactionState;
  const stdoutPointer = createArtifactPointer(
    `tool://${command}`,
    stdoutContent,
    candidateEpoch,
    claimScope,
    {
      mediaType: 'text/plain',
      trustClass,
      redactionState: stdoutRedactionState,
      chunkIndex: 0,
      artifactId: `${toolOutputId}-stdout`,
    },
  );
  writeArtifact(stdoutPointer, stdoutContent, baseDir);

  // Write stderr to content-addressed artifact
  const stderrRedactionState: RedactionState = hasAnomaly ? 'REDACTED' : redactionState;
  const stderrPointer = createArtifactPointer(
    `tool://${command}:stderr`,
    stderrContent,
    candidateEpoch,
    claimScope,
    {
      mediaType: 'text/plain',
      trustClass,
      redactionState: stderrRedactionState,
      chunkIndex: 0,
      artifactId: `${toolOutputId}-stderr`,
    },
  );
  writeArtifact(stderrPointer, stderrContent, baseDir);

  // Compute bounded excerpts — redact secret-like values if anomaly detected or requested
  let stdoutRawExcerpt = extractExcerpt(stdoutContent, maxExcerptBytes);
  let stderrRawExcerpt = extractExcerpt(stderrContent, maxExcerptBytes);
  const stdoutExcerpt = shouldRedact ? redactContent(stdoutRawExcerpt) : stdoutRawExcerpt;
  const stderrExcerpt = shouldRedact ? redactContent(stderrRawExcerpt) : stderrRawExcerpt;

  // Separate hashes — no delimiter ambiguity
  const stdoutSha256 = computeSha256(stdoutContent);
  const stderrSha256 = computeSha256(stderrContent);
  const stdoutExcerptSha256 = computeSha256(stdoutExcerpt);
  const stderrExcerptSha256 = computeSha256(stderrExcerpt);
  const rawContentSha256 = computeSha256(JSON.stringify([stdoutSha256, stderrSha256]));

  const receipt: ToolOutputReceipt = Object.freeze({
    toolOutputId,
    toolKind: 'native_child',
    command,
    args: Object.freeze([...args]),
    exitCode,
    durationMs,
    stdoutBytes: Buffer.byteLength(stdoutContent, 'utf-8'),
    stderrBytes: Buffer.byteLength(stderrContent, 'utf-8'),
    stdoutArtifact: stdoutPointer,
    stderrArtifact: stderrPointer,
    stdoutExcerpt,
    stderrExcerpt,
    anomalyFlags: Object.freeze(anomalyFlags),
    stdoutPointer,
    stderrPointer,
    stdoutSha256,
    stderrSha256,
    stdoutExcerptSha256,
    stderrExcerptSha256,
    rawContentSha256,
    retrievedAt,
    hasRestrictedArtifact: hasAnomaly,
  });

  return { receipt };
}

export function brokerExitCode(receipt: ToolOutputReceipt): { exitCode: number; success: boolean } {
  return {
    exitCode: receipt.exitCode,
    success: receipt.exitCode === 0,
  };
}

export function brokerAnomalySummary(receipt: ToolOutputReceipt): {
  hasAnomalies: boolean;
  flagCount: number;
  flags: readonly string[];
  safeForMainContext: boolean;
} {
  const hasAnomalies = receipt.anomalyFlags.length > 0;
  return {
    hasAnomalies,
    flagCount: receipt.anomalyFlags.length,
    flags: receipt.anomalyFlags,
    safeForMainContext: !hasAnomalies && receipt.stdoutBytes <= 10_000 && receipt.stderrBytes <= 10_000,
  };
}

export function brokerSummary(receipt: ToolOutputReceipt): {
  toolOutputId: string;
  exitCode: number;
  success: boolean;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  anomalyFlags: readonly string[];
  stdoutArtifactId: string;
  stderrArtifactId: string;
  stdoutSha256: Sha256;
  stderrSha256: Sha256;
  stdoutExcerptSha256: Sha256;
  stderrExcerptSha256: Sha256;
  rawContentSha256: Sha256;
} {
  return {
    toolOutputId: receipt.toolOutputId,
    exitCode: receipt.exitCode,
    success: receipt.exitCode === 0,
    durationMs: receipt.durationMs,
    stdoutBytes: receipt.stdoutBytes,
    stderrBytes: receipt.stderrBytes,
    anomalyFlags: receipt.anomalyFlags,
    stdoutArtifactId: receipt.stdoutPointer.artifactId,
    stderrArtifactId: receipt.stderrPointer.artifactId,
    stdoutSha256: receipt.stdoutSha256,
    stderrSha256: receipt.stderrSha256,
    stdoutExcerptSha256: receipt.stdoutExcerptSha256,
    stderrExcerptSha256: receipt.stderrExcerptSha256,
    rawContentSha256: receipt.rawContentSha256,
  };
}

// ── Receipt validation ────────────────────────────────────────

export function validateReceipt(
  receipt: ToolOutputReceipt,
  maxExcerptBytes: number = DEFAULT_MAX_EXCERPT,
): ReceiptValidation {
  const errors: string[] = [];

  // Verify excerpt hashes match the actual excerpt strings
  const computedStdoutExcerptSha = computeSha256(receipt.stdoutExcerpt);
  const computedStderrExcerptSha = computeSha256(receipt.stderrExcerpt);
  if (computedStdoutExcerptSha !== receipt.stdoutExcerptSha256) {
    errors.push('stdoutExcerptSha256 mismatch — excerpt content was tampered');
  }
  if (computedStderrExcerptSha !== receipt.stderrExcerptSha256) {
    errors.push('stderrExcerptSha256 mismatch — excerpt content was tampered');
  }

  // Verify raw content hash is canonically framed from separate hashes
  const expectedRaw = computeSha256(JSON.stringify([receipt.stdoutSha256, receipt.stderrSha256]));
  if (expectedRaw !== receipt.rawContentSha256) {
    errors.push('rawContentSha256 mismatch — hash chain broken');
  }

  // Verify excerpt byte sizes don't exceed maxExcerptBytes (512 by default)
  if (Buffer.byteLength(receipt.stdoutExcerpt, 'utf-8') > maxExcerptBytes) {
    errors.push(`stdoutExcerpt exceeds max excerpt bytes (${maxExcerptBytes})`);
  }
  if (Buffer.byteLength(receipt.stderrExcerpt, 'utf-8') > maxExcerptBytes) {
    errors.push(`stderrExcerpt exceeds max excerpt bytes (${maxExcerptBytes})`);
  }

  // Verify receipt is frozen (immutable)
  if (!Object.isFrozen(receipt)) {
    errors.push('receipt is not frozen — mutable receipt may be tampered');
  }
  if (!Object.isFrozen(receipt.args)) {
    errors.push('receipt.args is not frozen');
  }
  if (!Object.isFrozen(receipt.anomalyFlags)) {
    errors.push('receipt.anomalyFlags is not frozen');
  }

  // Verify artifact pointers match the receipt hashes
  if (receipt.stdoutPointer.sha256 !== receipt.stdoutSha256) {
    errors.push('stdoutPointer.sha256 does not match stdoutSha256');
  }
  if (receipt.stderrPointer.sha256 !== receipt.stderrSha256) {
    errors.push('stderrPointer.sha256 does not match stderrSha256');
  }

  // Verify hasRestrictedArtifact consistency with anomaly state
  const hasAnomaly = receipt.anomalyFlags.length > 0;
  if (hasAnomaly && !receipt.hasRestrictedArtifact) {
    errors.push('hasRestrictedArtifact should be true when anomaly flags present');
  }
  if (!hasAnomaly && receipt.hasRestrictedArtifact) {
    errors.push('hasRestrictedArtifact should be false when no anomaly flags');
  }

  // Verify anomaly artifacts are marked REDACTED
  if (hasAnomaly) {
    if (receipt.stdoutPointer.redactionState !== 'REDACTED') {
      errors.push('stdout artifact should be REDACTED when anomaly detected');
    }
    if (receipt.stderrPointer.redactionState !== 'REDACTED') {
      errors.push('stderr artifact should be REDACTED when anomaly detected');
    }
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}
