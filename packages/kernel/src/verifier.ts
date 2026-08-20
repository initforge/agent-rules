import { createHash } from 'node:crypto';
import { isSha256, sha256Bytes, type Sha256 } from './contracts.js';
import type { WorkerReceipt } from './contracts.js';

export { type Sha256, isSha256, sha256Bytes };

export interface VerificationEvidence {
  readonly source: 'worker' | 'verifier' | 'external';
  readonly probeCommand: string;
  readonly probeExitCode: number;
  readonly evidenceUris: readonly string[];
  readonly evidenceHashes: readonly Sha256[];
  readonly rawOutput?: string;
}

export interface VerifierAdapter {
  detect(): Promise<{ available: boolean }>;
  verify(receipt: WorkerReceipt, evidence: VerificationEvidence): Promise<VerificationResult>;
}

export interface VerificationResult {
  passed: boolean;
  scope: 'focused' | 'package' | 'workspace' | 'certification';
  evidence: Record<string, string>;
  fingerprint: string;
  independent: boolean;
}

export class IndependentVerifier implements VerifierAdapter {
  async detect(): Promise<{ available: boolean }> {
    return { available: true };
  }

  async verify(receipt: WorkerReceipt, evidence: VerificationEvidence): Promise<VerificationResult> {
    if (!receipt) {
      throw new Error('receipt must not be null or undefined');
    }
    if (!evidence) {
      throw new Error('evidence must not be null or undefined');
    }

    if (evidence.source === 'worker' && evidence.probeExitCode === 0) {
      throw new Error('independent verifier must not accept worker self-reported PASS as evidence');
    }

    if (evidence.evidenceUris.length === 0) {
      throw new Error('evidence must contain at least one URI');
    }

    if (evidence.evidenceUris.length !== evidence.evidenceHashes.length) {
      throw new Error('evidence URIs and hashes are mismatched');
    }

    for (const hash of evidence.evidenceHashes) {
      if (!isSha256(hash)) {
        throw new Error(`evidence hash is not valid SHA-256: ${hash}`);
      }
    }

    const evidenceFingerprint = this.computeEvidenceFingerprint(evidence);

    const passed = evidence.probeExitCode === 0
      && evidence.evidenceUris.length > 0
      && evidence.evidenceHashes.length > 0;

    const scope = this.determineScope(receipt, evidence);

    return {
      passed,
      scope,
      evidence: {
        source: evidence.source,
        probeCommand: evidence.probeCommand,
        probeExitCode: String(evidence.probeExitCode),
        evidenceFingerprint,
        receiptDiffSha256: receipt.diffSha256 ?? 'none',
      },
      fingerprint: evidenceFingerprint,
      independent: true,
    };
  }

  private computeEvidenceFingerprint(evidence: VerificationEvidence): string {
    const pairs = evidence.evidenceUris
      .map((uri, index) => `${uri}:${evidence.evidenceHashes[index]}`)
      .sort()
      .join('|');
    return createHash('sha256').update(pairs).digest('hex');
  }

  private determineScope(
    _receipt: WorkerReceipt,
    _evidence: VerificationEvidence,
  ): 'focused' | 'package' | 'workspace' | 'certification' {
    return 'focused';
  }
}
