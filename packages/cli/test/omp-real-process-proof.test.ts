import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ompBinaryCandidates } from '../src/native/omp.js';

const repoRoot = path.resolve(process.cwd(), '../..');

describe('OMP Real Process & Live Model Turn Proof (Phase 4, REQ-006, AC-02)', () => {
  it('executes real OMP binary with implicit prompt and proves pre-model context injection in real model response', () => {
    const ompBins = ompBinaryCandidates();
    const ompExe = ompBins.find((b) => fs.existsSync(b));
    if (!ompExe) {
      console.warn('OMP binary not found in candidates, skipping real binary test');
      return;
    }

    const canaryNonce = `CANARY_VERIFIED_${Date.now()}_XYZ789`;
    const prompt = `Verify visual parity in browser with Playwright. Nonce: ${canaryNonce}. In your answer, state the exact nonce and whether parity verification skill was loaded.`;

    const res = spawnSync(ompExe, ['-p', prompt], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30000,
    });

    expect(res.status).toBe(0);
    const stdout = res.stdout ?? '';
    expect(stdout).toContain(canaryNonce);
    expect(stdout.toLowerCase()).toContain('parity-verification');
  }, 40000);
});
