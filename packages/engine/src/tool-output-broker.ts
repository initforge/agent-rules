import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createArtifactPointer, type ArtifactPointer, type TrustClass, type RedactionState } from './artifact-pointer.js';
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
  readonly rawContentSha256: Sha256;
  readonly retrievedAt: string;
}

export interface ToolOutputOptions {
  readonly maxExcerptBytes?: number;
  readonly trustClass?: TrustClass;
  readonly redactionState?: RedactionState;
  readonly candidateEpoch?: number;
  readonly claimScope?: readonly string[];
  readonly baseDir?: string;
}

const DEFAULT_MAX_EXCERPT = 512;
const ANOMALY_PATTERNS = [
  /(?:password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+/i,
  /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/i,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
  /(?:aws|gcp|azure)[_-]?(?:secret|key|token)\s*[:=]\s*\S+/i,
  /(?:npm|pip|maven|gradle)\s+(?:token|key|auth)\s*[:=]\s*\S+/i,
  /(?:bearer|authorization)\s*[:=]\s*\S+/i,
];

// ── Content-addressed artifact helpers ──────────────────

function computeSha256(content: string): Sha256 {
  return sha256Bytes(new TextEncoder().encode(content));
}

function safeId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function detectAnomalies(content: string): string[] {
  const flags: string[] = [];
  for (const pattern of ANOMALY_PATTERNS) {
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
  if (Buffer.byteLength(content, 'utf-8') <= maxBytes) {
    return content;
  }
  return content.slice(0, maxBytes);
}

// ── ToolOutputBroker ──────────────────────────────────────

export interface ToolOutputResult {
  readonly receipt: ToolOutputReceipt;
  readonly stdoutContent: string;
  readonly stderrContent: string;
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

  // Write stdout to content-addressed artifact
  const stdoutPointer = createArtifactPointer(
    `tool://${command}`,
    stdoutContent,
    candidateEpoch,
    claimScope,
    {
      mediaType: 'text/plain',
      trustClass,
      redactionState,
      chunkIndex: 0,
      artifactId: `${toolOutputId}-stdout`,
    },
  );
  writeArtifactToDisk(stdoutPointer, stdoutContent, baseDir);

  // Write stderr to content-addressed artifact
  const stderrPointer = createArtifactPointer(
    `tool://${command}:stderr`,
    stderrContent,
    candidateEpoch,
    claimScope,
    {
      mediaType: 'text/plain',
      trustClass,
      redactionState,
      chunkIndex: 0,
      artifactId: `${toolOutputId}-stderr`,
    },
  );
  writeArtifactToDisk(stderrPointer, stderrContent, baseDir);

  // Compute bounded excerpts (never expose full raw content to main)
  const stdoutExcerpt = extractExcerpt(stdoutContent, maxExcerptBytes);
  const stderrExcerpt = extractExcerpt(stderrContent, maxExcerptBytes);

  // Detect anomalies in raw content (secrets, control sequences, etc.)
  const anomalyFlags = detectAnomalies(stdoutContent + stderrContent);

  // Compute raw content hash for integrity (raw stays out of main context)
  const rawContentSha256 = computeSha256(stdoutContent + '\x00---STDERR---\x00' + stderrContent);

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
    rawContentSha256,
    retrievedAt,
  });

  return { receipt, stdoutContent, stderrContent };
}

function writeArtifactToDisk(pointer: ArtifactPointer, content: string, baseDir: string): void {
  const artifactBase = path.resolve(baseDir, '.agent/artifacts');
  const artifactDir = path.resolve(artifactBase, pointer.artifactId.slice(0, 2));
  fs.mkdirSync(artifactDir, { recursive: true });
  const filePath = path.join(artifactDir, `${pointer.artifactId}.content`);
  fs.writeFileSync(filePath, content, 'utf-8');
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
    rawContentSha256: receipt.rawContentSha256,
  };
}
