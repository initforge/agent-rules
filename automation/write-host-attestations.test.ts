import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CERTIFICATION_REQUIRED_HOSTS,
  HOST_ATTESTATION_EVIDENCE_ROLES,
  hostAttestationEvidenceRef,
  hostAttestationEvidenceSubjectSha256,
  type HostAttestation,
  type HostAttestationEvidenceRole,
} from '../packages/engine/src/contracts.js';
import type { CollectedModelEvidence, ModelEvidenceProvenance } from './host-attestation.js';
import { writeHostAttestations } from './write-host-attestations.js';

const headCommit = 'a'.repeat(64);
const contractSetSha256 = 'b'.repeat(64);
const now = new Date('2026-07-30T12:00:00.000Z');
const encoder = new TextEncoder();

const provenance: ModelEvidenceProvenance = {
  sourceUri: 'session://certification-42',
  producerIdentity: 'host-session',
  timestamp: now.toISOString(),
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function modelHash(role: 'requestedModel' | 'resolvedModel' | 'observedModel', value: string, raw: Uint8Array): string {
  return sha256(concat(
    encoder.encode(`role:${role}`),
    encoder.encode(`value:${value}`),
    raw,
    encoder.encode(`source:${provenance.sourceUri}`),
    encoder.encode(`producer:${provenance.producerIdentity}`),
    encoder.encode(`ts:${provenance.timestamp}`),
  ));
}

function hostEvidence(host: string): CollectedModelEvidence {
  const record = (field: 'requested' | 'resolved' | 'observed') => {
    const value = `${host}-${field}-model`;
    return {
      value,
      rawEvidenceBytes: encoder.encode(`host:${host},role:${field},model:${value}`),
      provenance,
    };
  };
  return { requested: record('requested'), resolved: record('resolved'), observed: record('observed') };
}

function attestation(host: typeof CERTIFICATION_REQUIRED_HOSTS[number], modelEvidence: CollectedModelEvidence): HostAttestation {
  const fields = {
    host,
    hostVersion: '1.2.3',
    commitSha: headCommit,
    capabilityStatus: 'HOST_NATIVE' as const,
    capabilityIds: [`${host}:model`],
    contractSetSha256,
    requestedModel: modelEvidence.requested.value,
    resolvedModel: modelEvidence.resolved.value,
    observedModel: modelEvidence.observed.value,
    nativeRunnerIdentity: `/native/${host}|immutable`,
    issuedAt: '2026-07-30T11:30:00.000Z',
    expiresAt: '2026-07-30T12:30:00.000Z',
  };
  const contentHashes = new Map<HostAttestationEvidenceRole, string>([
    ['version', 'c'.repeat(64)],
    ['capabilities', 'd'.repeat(64)],
    ['requestedModel', modelHash('requestedModel', modelEvidence.requested.value, modelEvidence.requested.rawEvidenceBytes)],
    ['resolvedModel', modelHash('resolvedModel', modelEvidence.resolved.value, modelEvidence.resolved.rawEvidenceBytes)],
    ['observedModel', modelHash('observedModel', modelEvidence.observed.value, modelEvidence.observed.rawEvidenceBytes)],
  ]);
  const subject = fields as HostAttestation;
  return {
    ...fields,
    evidenceRefs: HOST_ATTESTATION_EVIDENCE_ROLES.map((role) => {
      const evidenceSha256 = contentHashes.get(role)!;
      return {
        role,
        host,
        commitSha: headCommit,
        evidenceSha256,
        evidenceRef: hostAttestationEvidenceRef(host, headCommit, role, evidenceSha256),
        subjectSha256: hostAttestationEvidenceSubjectSha256(role, subject),
        observedAt: now.toISOString(),
      };
    }),
  };
}

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'write-host-attestations-'));
  const ledgerPath = path.join(directory, 'ledger.json');
  const evidenceDirectory = path.join(directory, 'evidence');
  await writeFile(ledgerPath, JSON.stringify({ unrelated: { preserve: true }, attestations: [], nested: ['untouched'] }, null, 2));
  const modelEvidence = Object.fromEntries(CERTIFICATION_REQUIRED_HOSTS.map((host) => [host, hostEvidence(host)]));
  const attestations = CERTIFICATION_REQUIRED_HOSTS.map((host) => attestation(host, modelEvidence[host]));
  return { directory, ledgerPath, evidenceDirectory, modelEvidence, attestations };
}

function cleanState() {
  return async () => ({ headCommit, dirty: false });
}

describe('writeHostAttestations', () => {
  it('atomically writes five validated attestations and content-addressed raw evidence without clobbering other ledger fields', async () => {
    const input = await fixture();
    const result = await writeHostAttestations({
      ...input,
      repositoryRoot: input.directory,
      headCommit,
      now,
      getRepositoryState: cleanState(),
    });

    const ledger = JSON.parse(await readFile(input.ledgerPath, 'utf8'));
    expect(ledger.unrelated).toEqual({ preserve: true });
    expect(ledger.nested).toEqual(['untouched']);
    expect(ledger.attestations).toEqual(input.attestations);
    expect(result.rawEvidencePaths).toHaveLength(15);
    expect(new Set(result.rawEvidencePaths).size).toBe(15);
    for (const evidencePath of result.rawEvidencePaths) {
      const raw = await readFile(evidencePath, 'utf8');
      const stored = JSON.parse(raw);
      expect(path.basename(evidencePath)).toBe(`${sha256(encoder.encode(raw))}.json`);
      expect(stored.schema).toBe('host-attestation-raw-model-evidence/v1');
      expect(Buffer.from(stored.rawEvidenceBase64, 'base64').length).toBeGreaterThan(0);
      expect(stored.provenance).toEqual(provenance);
    }
  });

  it('fails before any write for a dirty repository or a caller HEAD mismatch', async () => {
    const dirty = await fixture();
    const originalDirtyLedger = await readFile(dirty.ledgerPath);
    await expect(writeHostAttestations({
      ...dirty, repositoryRoot: dirty.directory, headCommit, now,
      getRepositoryState: async () => ({ headCommit, dirty: true }),
    })).rejects.toThrow('dirty repository');
    expect(await readFile(dirty.ledgerPath)).toEqual(originalDirtyLedger);

    const mismatch = await fixture();
    const originalMismatchLedger = await readFile(mismatch.ledgerPath);
    await expect(writeHostAttestations({
      ...mismatch, repositoryRoot: mismatch.directory, headCommit, now,
      getRepositoryState: async () => ({ headCommit: 'e'.repeat(64), dirty: false }),
    })).rejects.toThrow('does not match repository HEAD');
    expect(await readFile(mismatch.ledgerPath)).toEqual(originalMismatchLedger);
  });

  it('rejects stale, foreign, and duplicate attestation evidence before it can mutate the ledger', async () => {
    const stale = await fixture();
    stale.attestations[0] = { ...stale.attestations[0], expiresAt: '2026-07-30T11:00:00.000Z' };
    await expect(writeHostAttestations({ ...stale, repositoryRoot: stale.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('stale');

    const foreign = await fixture();
    foreign.attestations[0] = {
      ...foreign.attestations[0],
      evidenceRefs: foreign.attestations[0].evidenceRefs!.map((ref, index) => index === 0 ? { ...ref, host: 'claude' } : ref),
    };
    await expect(writeHostAttestations({ ...foreign, repositoryRoot: foreign.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('foreign');

    const duplicate = await fixture();
    duplicate.attestations[4] = duplicate.attestations[0];
    await expect(writeHostAttestations({ ...duplicate, repositoryRoot: duplicate.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('duplicate attestation');
  });

  it('rejects missing, fabricated, mismatched, and foreign raw model evidence without fabricating a model value', async () => {
    const missing = await fixture();
    delete missing.modelEvidence.codex;
    await expect(writeHostAttestations({ ...missing, repositoryRoot: missing.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('missing collected model evidence');

    const fabricated = await fixture();
    fabricated.modelEvidence.claude = {
      ...fabricated.modelEvidence.claude,
      requested: { ...fabricated.modelEvidence.claude.requested, value: 'invented-model' },
    };
    await expect(writeHostAttestations({ ...fabricated, repositoryRoot: fabricated.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('does not match the attestation');

    const mismatched = await fixture();
    mismatched.modelEvidence.grok = {
      ...mismatched.modelEvidence.grok,
      observed: { ...mismatched.modelEvidence.grok.observed, rawEvidenceBytes: encoder.encode('role:observed,model:not-the-attested-one') },
    };
    await expect(writeHostAttestations({ ...mismatched, repositoryRoot: mismatched.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('does not prove the attested model');

    const foreign = await fixture();
    (foreign.modelEvidence as Record<string, CollectedModelEvidence>).cursor = hostEvidence('cursor');
    await expect(writeHostAttestations({ ...foreign, repositoryRoot: foreign.directory, headCommit, now, getRepositoryState: cleanState() }))
      .rejects.toThrow('foreign host');
  });
});
