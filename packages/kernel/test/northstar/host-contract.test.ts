import { describe, it, expect } from 'vitest';
import {
  hostCapabilityAttestationV2,
  HOST_CONTRACT_METADATA,
  isContractStale,
  DEFAULT_SECRET_REDACTION,
} from '../../src/northstar/host-capabilities.js';

describe('P4 — host capability contract provenance (REQ-014)', () => {
  it('every host contract carries doc version, access date and official source URL', () => {
    for (const host of Object.keys(HOST_CONTRACT_METADATA) as Array<keyof typeof HOST_CONTRACT_METADATA>) {
      const meta = HOST_CONTRACT_METADATA[host];
      expect(meta.doc_version.length).toBeGreaterThan(0);
      expect(meta.source_url.startsWith('http')).toBe(true);
      expect(meta.max_age_days).toBeGreaterThan(0);
    }
  });

  it('attestation embeds contract metadata and the secret-redaction policy', () => {
    const a = hostCapabilityAttestationV2('opencode', { ok: false, error: 'no probe' });
    expect(a.contract_metadata.source_url).toContain('opencode');
    expect(a.secret_redaction).toEqual(DEFAULT_SECRET_REDACTION);
    expect(a.secret_redaction.env_files).toBe(true);
  });

  it('a contract older than its max age is stale and cannot certify live', () => {
    const meta = { ...HOST_CONTRACT_METADATA.codex, doc_accessed_at: '2000-01-01' };
    expect(isContractStale(meta, new Date('2026-08-20'))).toBe(true);
    expect(isContractStale(HOST_CONTRACT_METADATA.codex, new Date('2026-08-20'))).toBe(false);
  });
});
