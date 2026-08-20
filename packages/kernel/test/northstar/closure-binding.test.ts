import { describe, it, expect } from 'vitest';
import { assertEvidenceBinding, type EvidenceBindingManifest } from '../../src/northstar/closure-service.js';

function baseBinding(over: Partial<EvidenceBindingManifest> = {}): EvidenceBindingManifest {
  return {
    harness_release: { sha256: 'a'.repeat(40) },
    installation_projection: { projection_sha256: 'b'.repeat(64) },
    consumer_repository: { worktree_path: '/repo', git_head: 'c'.repeat(40) },
    consumer_candidate: { candidate_sha256: 'd'.repeat(40) },
    host_runtime: { host: 'opencode', validation_status: 'VALIDATED' },
    ...over,
  };
}

describe('P6 — five-identity evidence binding (adversarial replay rejection)', () => {
  it('accepts a correctly separated binding', () => {
    expect(() => assertEvidenceBinding(baseBinding())).not.toThrow();
  });

  it('rejects identity conflation: harness release equals consumer candidate', () => {
    const sha = 'a'.repeat(40);
    expect(() => assertEvidenceBinding(baseBinding({
      harness_release: { sha256: sha },
      consumer_candidate: { candidate_sha256: sha },
    }))).toThrow(/identity_conflation/);
  });

  it('rejects identity leak: harness release equals consumer HEAD', () => {
    const sha = 'a'.repeat(40);
    expect(() => assertEvidenceBinding(baseBinding({
      harness_release: { sha256: sha },
      consumer_repository: { worktree_path: '/repo', git_head: sha },
    }))).toThrow(/identity_leak/);
  });

  it('rejects an unvalidated/unknown host claiming VALIDATED', () => {
    expect(() => assertEvidenceBinding(baseBinding({
      host_runtime: { host: 'totally-unknown-host', validation_status: 'VALIDATED' },
    }))).toThrow(/not in supported hosts/);
  });
});
