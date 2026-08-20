/**
 * P2/P3 — new host adapters detect their real binaries and fail closed when a
 * native guard / permission layer cannot be proven. These are static/binary
 * probes: DSH is developer preview and Command Code requires auth, so no live
 * PASS is claimed here.
 */
import { describe, it, expect } from 'vitest';
import { deepseekHarnessAdapter, dumpConfigFingerprint } from '../deepseek-harness/adapter.js';
import { commandCodeAdapter } from '../command-code/adapter.js';

describe('P2 — DeepSeek Harness adapter', () => {
  it('detects the dsh binary when installed and reports absence honestly', async () => {
    const detection = await deepseekHarnessAdapter.detect();
    // The host may or may not be installed; the adapter must never crash and
    // must report a consistent installed flag.
    expect(typeof detection.installed).toBe('boolean');
  });

  it('inspects the composed profile projection without fabricating a fingerprint', async () => {
    const projection = await deepseekHarnessAdapter.inspectProjection();
    expect(projection.profile).toBe('web');
    expect(projection.config_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('runSupervised blocks when the dsh binary is absent (never silent allow)', async () => {
    const original = process.env.PATH;
    process.env.PATH = '';
    try {
      const receipt = await deepseekHarnessAdapter.runSupervised({ profile: 'web', prompt: 'test' });
      expect(receipt.ok).toBe(false);
      expect(receipt.result).toMatch(/not found/);
    } finally {
      process.env.PATH = original;
    }
  });
});

describe('P3 — Command Code adapter', () => {
  it('detects cmdc/command-code on PATH and never treats cmd.exe as Command Code', async () => {
    const detection = await commandCodeAdapter.detect();
    expect(typeof detection.installed).toBe('boolean');
    if (detection.installed) {
      // On Windows the binary must resolve to cmdc or command-code, never the
      // system shell.
      expect(detection.binary).toMatch(/^(command-code|cmdc)$/);
      expect(detection.path?.toLowerCase()).not.toContain('system32\\cmd.exe');
    }
  });

  it('never runs a supervised session without a proven native permission layer', async () => {
    const facts = await commandCodeAdapter.inspectCapabilities();
    const receipt = await commandCodeAdapter.runSupervised({ prompt: 'test' });
    // On a host without command-code installed, the honest result is "not
    // found" (never a fake PASS). When the binary exists but the permission
    // layer is unproven, the adapter must refuse with BLOCKED.
    if (receipt.result.includes('not found on PATH')) {
      expect(receipt.ok).toBe(false);
    } else if (!facts.permission_layer_proven) {
      expect(receipt.ok).toBe(false);
      expect(receipt.result).toMatch(/BLOCKED/);
    } else {
      expect(typeof receipt.ok).toBe('boolean');
    }
  });
});
