import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPlatformCapabilityDiagnostics, SUPPORTED_PLATFORMS } from './platform-capability-diagnostics.js';

function withAuthorityFixture<T>(run: (root: string) => T): T {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-diagnostics-'));
  try {
    fs.mkdirSync(path.join(root, '.agent', 'ledger'), { recursive: true });
    const ledgerPath = path.join(root, '.agent', 'ledger', 'fixture.json');
    fs.writeFileSync(ledgerPath, '{"status":"ACTIVE","execution_state":"IN_PROGRESS"}\n');
    fs.writeFileSync(path.join(root, '.agent', 'current.json'), JSON.stringify({
      schema: 'artifact/execution-contract',
      version: 1,
      kind: 'current-pointer',
      generation: 1,
      plan_id: 'fixture-plan',
      canonical_ledger: { path: '.agent/ledger/fixture.json', observed_revision: 1 },
      atomicity: { protocol: 'generation-compare-and-swap', commit_target: '.agent/current.json' },
    }));
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('platform capability diagnostics', () => {
  it('records the current platform and explicit unavailable cells without inferring native PASS', () => {
    const receipt = withAuthorityFixture((root) => collectPlatformCapabilityDiagnostics(root, 'linux'));
    expect(receipt.schema).toBe('harness/platform-capability-diagnostics/v1');
    expect(receipt.platforms.map(item => item.platform)).toEqual([...SUPPORTED_PLATFORMS]);
    expect(receipt.platforms.find(item => item.platform === 'linux')).toMatchObject({
      state: 'OBSERVED',
      scope: 'host-identity-only',
    });
    expect(receipt.platforms.filter(item => item.platform !== 'linux').every(item => item.state === 'UNAVAILABLE')).toBe(true);
    expect(receipt.platforms.flatMap(item => Object.values(item.checks)).some(check => check.state === 'BLOCKED')).toBe(false);
    expect(receipt.note).toContain('not a PASS');
    expect(receipt.provenance.planId).toBeTruthy();
    expect(receipt.provenance.ledgerSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalizes native platform aliases while preserving the observed raw platform', () => {
    const receipt = withAuthorityFixture((root) => collectPlatformCapabilityDiagnostics(root, 'darwin'));
    expect(receipt.currentPlatform).toBe('macos');
    expect(receipt.platforms.find(item => item.platform === 'macos')).toMatchObject({ state: 'OBSERVED', observedPlatform: 'darwin' });
  });

  it('rejects an unknown platform instead of manufacturing an unavailable matrix', () => {
    expect(() => collectPlatformCapabilityDiagnostics(process.cwd(), 'plan9')).toThrow(/unsupported host platform/);
  });
});
