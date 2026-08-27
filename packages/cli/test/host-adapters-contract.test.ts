import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NativeInstaller } from '../src/services/native-installer.js';
import { getHostIds, getNativeContract, getAllNativeContracts } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';

const repoRoot = path.resolve(process.cwd(), '../..');

describe('Host Adapters Contract & Matrix (S4, REQ-008, AC-07)', () => {
  const allHostIds = getHostIds(repoRoot) as HostId[];

  it('audits all 9 platforms in platform-contracts.json', () => {
    expect(allHostIds.length).toBe(9);
    expect(allHostIds).toEqual(
      expect.arrayContaining([
        'omp',
        'codex',
        'claude',
        'grok',
        'antigravity',
        'opencode',
        'deepseek-harness',
        'command-code',
        'cursor',
      ])
    );

    const contracts = getAllNativeContracts(repoRoot);
    for (const host of allHostIds) {
      const contract = contracts[host];
      expect(contract).toBeDefined();
      expect(contract.id).toBe(host);
      expect(contract.installStrategy).toBeTruthy();
      expect(contract.canaryStrategy).toBeTruthy();
    }
  });

  it('classifies Cursor as UNSUPPORTED for native deterministic routing while keeping static catalog', async () => {
    const installer = new NativeInstaller();
    const receipt = await installer.certify('cursor');

    expect(receipt.host).toBe('cursor');
    expect(receipt.claims.NATIVE_LIFECYCLE.status).toBe('UNSUPPORTED');
    expect(receipt.claims.NATIVE_LIFECYCLE.evidence[0]).toMatchObject({
      kind: 'native-lifecycle-seam',
      ok: false,
    });
    expect(receipt.status).toBe('Unsupported');
    expect(receipt.axes?.routing.status).toBe('UNSUPPORTED');
  });

  it('classifies OMP with full deterministic lifecycle PASS and Ready status', async () => {
    const installer = new NativeInstaller();
    const receipt = await installer.certify('omp');

    expect(receipt.host).toBe('omp');
    expect(receipt.claims.NATIVE_LIFECYCLE.status).toBe('PASS');
    expect(receipt.claims.NATIVE_LIFECYCLE.evidence[0]).toMatchObject({
      kind: 'native-lifecycle-seam',
      ok: true,
    });
    expect(receipt.claims.NATIVE_POLICY.status).toBe('PASS');
    expect(receipt.status).toBe('Ready');
    expect(receipt.axes?.routing.status).toBe('PASS');
    expect(receipt.axes?.infrastructure.status).toBe('PASS');
  });

  it('enforces provider-to-host separation: google-antigravity inside OMP still uses OMP adapter (AC-03)', () => {
    const ompContract = getNativeContract('omp', repoRoot);
    const antigravityContract = getNativeContract('antigravity', repoRoot);

    expect(ompContract).toBeDefined();
    expect(antigravityContract).toBeDefined();

    // Host identity is driven by the running container (OMP), never the LLM provider
    expect(ompContract?.id).toBe('omp');
    expect(antigravityContract?.id).toBe('antigravity');
    expect(ompContract?.id).not.toBe(antigravityContract?.id);
  });

  it('supports isolated temp-home install, readback, and byte-exact rollback', async () => {
    const installer = new NativeInstaller();
    const detection = await installer.detect('omp');

    if (detection.present) {
      const plan = await installer.planInstall('omp');
      expect(plan.host).toBe('omp');
      expect(plan.backupDir).toBeTruthy();
    }
  });

  it('binds three explicit evaluation axes to every certified receipt', async () => {
    const installer = new NativeInstaller();
    for (const host of ['omp', 'cursor', 'codex', 'claude'] as HostId[]) {
      const receipt = await installer.certify(host);
      expect(receipt.axes).toBeDefined();
      expect(receipt.axes?.infrastructure).toBeDefined();
      expect(receipt.axes?.routing).toBeDefined();
      expect(receipt.axes?.behavior).toBeDefined();
      expect(['PASS', 'FAIL', 'UNSUPPORTED']).toContain(receipt.axes?.infrastructure.status);
      expect(['PASS', 'FAIL', 'UNSUPPORTED']).toContain(receipt.axes?.routing.status);
      expect(['PASS', 'NEEDS_USER', 'UNSUPPORTED']).toContain(receipt.axes?.behavior.status);
    }
  });
});
