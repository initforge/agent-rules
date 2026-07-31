import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CANONICAL_RECONCILIATION_IDS, verifyEvidencePacket } from '../src/evidence-packet.js';

function makePacket() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const receipt = { receiptId: 'independent-1', content: 'external verifier result' };
  const signed = { ...receipt, contentSha256: createHash('sha256').update(JSON.stringify(receipt.content)).digest('hex') };
  const bytes = Buffer.from(JSON.stringify(receipt));
  return { packet: { schema: 'worker-secondary/evidence-packet/v1', headCommit: 'a'.repeat(40), effectivePlanIdentity: 'b'.repeat(64), requestedModel: 'qwencoder/glm-5.2', resolvedModel: 'qwencoder/glm-5.2', epoch: Date.now(), reconciliationIds: [...CANONICAL_RECONCILIATION_IDS], receipt: { ...signed, signature: sign(null, bytes, privateKey).toString('base64'), publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') } }, privateKey,
  };
}

describe('worker-secondary evidence packet', () => {
  it('accepts independently authenticated content', () => {
    const { packet } = makePacket();
    expect(verifyEvidencePacket(packet, 'a'.repeat(40))).toMatchObject({ verified: true });
  });
  it.each([
    ['forged HEAD', (p: any) => { p.headCommit = 'c'.repeat(40); }],
    ['tampered receipt', (p: any) => { p.receipt.content = 'tampered'; }],
    ['wrong model', (p: any) => { p.resolvedModel = 'other'; }],
    ['noncanonical IDs', (p: any) => { p.reconciliationIds[0] = 'REQ-999'; }],
  ])('fails closed for %s', (_name, mutate) => {
    const { packet } = makePacket(); mutate(packet);
    expect(verifyEvidencePacket(packet, 'a'.repeat(40)).status).toBe('UNVERIFIED');
  });
  it('fails closed without authentication', () => {
    const { packet } = makePacket(); delete (packet as any).receipt.signature;
    expect(verifyEvidencePacket(packet, 'a'.repeat(40)).reason).toContain('UNVERIFIED');
  });
});
