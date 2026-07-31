import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

export const CANONICAL_RECONCILIATION_IDS = Object.freeze(
  Array.from({ length: 15 }, (_, i) => `REQ-${String(i + 1).padStart(3, '0')}`),
);

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function receiptBytes(receipt: Record<string, unknown>): Buffer {
  const { contentSha256, signature, publicKey, ...signed } = receipt;
  return Buffer.from(JSON.stringify(signed));
}
function contentBytes(receipt: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify(receipt.content));
}

export interface EvidencePacketResult {
  verified: boolean;
  status: 'VERIFIED' | 'UNVERIFIED';
  reason: string;
}

/** Independent packet check. Missing authentication is never a pass. */
export function verifyEvidencePacket(packet: unknown, expectedHead: string, now = Date.now()): EvidencePacketResult {
  if (!packet || typeof packet !== 'object') return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: evidence packet missing' };
  const p = packet as Record<string, any>;
  if (p.schema !== 'worker-secondary/evidence-packet/v1') return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: unsupported evidence packet schema' };
  if (!COMMIT.test(expectedHead) || p.headCommit !== expectedHead) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: packet HEAD mismatch' };
  if (!SHA256.test(p.effectivePlanIdentity || '')) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: effective identity missing' };
  if (p.requestedModel !== 'qwencoder/glm-5.2' || p.resolvedModel !== p.requestedModel) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: requested/resolved model mismatch' };
  if (!Number.isSafeInteger(p.epoch) || p.epoch > now || now - p.epoch > 24 * 60 * 60 * 1000) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: epoch is stale or future-dated' };
  if (JSON.stringify(p.reconciliationIds) !== JSON.stringify(CANONICAL_RECONCILIATION_IDS)) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: reconciliation IDs are not the exact canonical 15' };
  const receipt = p.receipt;
  if (!receipt || typeof receipt !== 'object' || !SHA256.test(receipt.contentSha256 || '') || !receipt.signature || !receipt.publicKey) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: authenticated receipt/signature missing' };
  const bytes = receiptBytes(receipt);
  if (createHash('sha256').update(contentBytes(receipt)).digest('hex') !== receipt.contentSha256) return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: receipt content hash mismatch' };
  try {
    const key = createPublicKey({ key: Buffer.from(receipt.publicKey, 'base64'), format: 'der', type: 'spki' });
    const valid = verifySignature(null, bytes, key, Buffer.from(receipt.signature, 'base64'));
    return valid ? { verified: true, status: 'VERIFIED', reason: 'authenticated content-addressed receipt verified' } : { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: receipt signature invalid' };
  } catch {
    return { verified: false, status: 'UNVERIFIED', reason: 'UNVERIFIED: receipt signature invalid' };
  }
}
