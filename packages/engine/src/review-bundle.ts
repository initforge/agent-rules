import { createHash } from 'node:crypto';
import { isSha256 } from './contracts.js';

export const REVIEW_BUNDLE_SCHEMA = 'harness/review-bundle/v1' as const;
export const DEFAULT_REVIEW_BUNDLE_MAX_BYTES = 64 * 1024;

export interface ReviewBundleAssignment {
  readonly assignmentId: string;
  readonly taskId: string;
  readonly state: string;
  readonly workerIdentity?: string;
  readonly diffSha256?: string;
  readonly reviewStatus: 'APPROVED' | 'REJECTED' | 'NOT_REVIEWED';
}

export interface ReviewBundleProof {
  readonly claimId: string;
  readonly command: string;
  readonly exitCode: number;
  readonly sha256: string;
  readonly uri: string;
}

export interface ReviewBundleRisk {
  readonly code: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly summary: string;
}

export interface ReviewBundle {
  readonly schema: typeof REVIEW_BUNDLE_SCHEMA;
  readonly version: 1;
  readonly runId: string;
  readonly planId: string;
  readonly effectivePlanSha256: string;
  readonly candidateEpochSha256: string;
  readonly ledgerRevision: number;
  readonly objective: string;
  readonly outcome: 'PASS' | 'PARTIAL' | 'BLOCKED';
  readonly assignments: readonly ReviewBundleAssignment[];
  readonly proofs: readonly ReviewBundleProof[];
  readonly risks: readonly ReviewBundleRisk[];
  readonly integrationReceiptSha256?: string;
  readonly watchdogEnforcement: 'ENFORCED' | 'UNAVAILABLE';
  readonly projectionRebuilt: boolean;
  readonly generatedAt: string;
  readonly bundleSha256: string;
}

export type ReviewBundleInput = Omit<ReviewBundle, 'schema' | 'version' | 'bundleSha256'> & {
  readonly maxBytes?: number;
};

export class ReviewBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewBundleError';
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireSha(value: string | undefined, label: string): void {
  if (value !== undefined && !isSha256(value)) throw new ReviewBundleError(`${label} must be a SHA-256`);
}

/** Create deterministic, pointer-only review evidence; raw logs are deliberately absent. */
export function createReviewBundle(input: ReviewBundleInput): ReviewBundle {
  const { maxBytes = DEFAULT_REVIEW_BUNDLE_MAX_BYTES, ...content } = input;
  if (!content.runId || !content.planId || !content.objective) throw new ReviewBundleError('runId, planId and objective are required');
  requireSha(content.effectivePlanSha256, 'effectivePlanSha256');
  requireSha(content.candidateEpochSha256, 'candidateEpochSha256');
  requireSha(content.integrationReceiptSha256, 'integrationReceiptSha256');
  if (!Number.isSafeInteger(content.ledgerRevision) || content.ledgerRevision < 0) throw new ReviewBundleError('ledgerRevision is invalid');

  const assignments = [...content.assignments]
    .map((entry) => ({ ...entry }))
    .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId));
  for (const assignment of assignments) requireSha(assignment.diffSha256, `assignment ${assignment.assignmentId} diffSha256`);

  const proofs = [...content.proofs]
    .map((proof) => ({ ...proof }))
    .sort((left, right) => left.claimId.localeCompare(right.claimId) || left.uri.localeCompare(right.uri));
  for (const proof of proofs) {
    if (!proof.claimId || !proof.command || !proof.uri || !Number.isInteger(proof.exitCode)) {
      throw new ReviewBundleError('proof entries require claimId, command, uri and integer exitCode');
    }
    requireSha(proof.sha256, `proof ${proof.claimId} sha256`);
  }

  const risks = [...content.risks]
    .map((risk) => ({ ...risk }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const withoutHash = {
    schema: REVIEW_BUNDLE_SCHEMA,
    version: 1 as const,
    ...content,
    assignments,
    proofs,
    risks,
  };
  const bundleSha256 = sha256(canonicalize(withoutHash));
  const bundle: ReviewBundle = { ...withoutHash, bundleSha256 };
  const bytes = Buffer.byteLength(canonicalize(bundle), 'utf8');
  if (bytes > maxBytes) throw new ReviewBundleError(`review bundle exceeds ${maxBytes} bytes (${bytes})`);
  return bundle;
}

export function renderReviewBundleMarkdown(bundle: ReviewBundle): string {
  const lines = [
    `# Review bundle: ${bundle.runId}`,
    '',
    `Outcome: ${bundle.outcome}`,
    `Plan: ${bundle.planId} @ revision ${bundle.ledgerRevision}`,
    `Bundle SHA-256: ${bundle.bundleSha256}`,
    `Watchdog: ${bundle.watchdogEnforcement}`,
    '',
    '## Assignments',
    '',
    ...bundle.assignments.map((entry) => `- ${entry.assignmentId} (${entry.taskId}): ${entry.state}; review=${entry.reviewStatus}`),
    '',
    '## Proofs',
    '',
    ...bundle.proofs.map((proof) => `- ${proof.claimId}: exit ${proof.exitCode}; ${proof.uri}; sha256=${proof.sha256}`),
    '',
    '## Risks',
    '',
    ...(bundle.risks.length > 0
      ? bundle.risks.map((risk) => `- [${risk.severity}] ${risk.code}: ${risk.summary}`)
      : ['- None recorded.']),
  ];
  return `${lines.join('\n')}\n`;
}
