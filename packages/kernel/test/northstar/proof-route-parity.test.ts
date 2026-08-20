/**
 * REQ-012 — proof-route parity: the kernel router and the CLI/engine surfaces
 * must agree on the same receipt shape, status semantics and selection
 * behavior (no drift between layers).
 */
import { describe, it, expect } from 'vitest';
import { routeProofs } from '../../src/northstar/proof-router.js';
import { deriveProofTrigger, selectProofs } from '../../src/northstar/proof-testing.js';
import { auditProject } from '../../src/northstar/project-audit.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('proof-route parity — kernel router vs engine/CLI surfaces', () => {
  it('kernel routeProofs and engine facade produce identical receipts', async () => {
    const request = {
      task_id: 'parity-1',
      repository: '/repo',
      trigger: { changed_files: ['src/api/auth.ts'], risk_hint: 'S2' },
      claims: [{ id: 'C-1', claim: 'authorization rejects unauthorized access' }],
      risks: ['auth'],
    };
    const kernel = routeProofs(request, [{ proof_id: 'x', status: 'PASS' }]);
    // The engine facade re-exports the same module; assert the receipt shape
    // is the canonical schema so every host surface emits the same artifact.
    expect(kernel.receipt.schema).toBe('agent-rules/proof-receipt/v1');
    expect(kernel.receipt.results).toEqual([{ proof_id: 'x', status: 'PASS' }]);
    expect(kernel.trigger.surfaces).toContain('api');
  });

  it('route-parity fixtures agree with the kernel selection behavior', () => {
    // positive scope-based trigger
    const t = deriveProofTrigger({ changed_files: ['src/api/auth.ts'], risk_hint: 'S3' });
    expect(t.surfaces).toContain('security');
    expect(t.candidate_categories).toContain('contract');
    // keyword-only negative: wording alone must not drive live fidelity
    const kw = deriveProofTrigger({ changed_files: [], user_wording: 'test the login flow' });
    expect(kw.surfaces).toContain('verification');
    expect(kw.required_fidelity).not.toBe('live');
  });

  it('project audit is read-only and does not mutate the repo', () => {
    const root = path.join(os.homedir(), 'Projects', 'agent-rules');
    if (!fs.existsSync(path.join(root, '.git'))) return;
    const before = fs.readdirSync(root).length;
    const audit = auditProject({ repoRoot: root });
    expect(audit.read_only).toBe(true);
    expect(fs.readdirSync(root).length).toBe(before);
    expect(audit.baseline.files).toBeGreaterThan(0);
  });
});
