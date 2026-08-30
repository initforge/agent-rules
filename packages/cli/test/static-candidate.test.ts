import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRuntimeCandidateManifest } from '../src/runtime/installation-coordinator.js';
import { resolveRuntimeAssetsRoot } from '../src/runtime/locator.js';

describe('portable static candidate', () => {
  it('contains rules, complete skills, profiles, integration registry and platform contracts', () => {
    const root = resolveRuntimeAssetsRoot();
    const manifest = loadRuntimeCandidateManifest();
    for (const required of [
      'rules/manifest.yaml', 'skills/finish-to-completion/SKILL.md', 'profiles/5fedu/profile.yaml',
      'integrations/registry.json', 'platforms/platform-contracts.json',
    ]) {
      expect(manifest.asset_hashes).toHaveProperty(required);
      expect(fs.existsSync(path.join(root, ...required.split('/')))).toBe(true);
    }
  });

  it('contains no production runtime callback artifact', () => {
    const manifest = loadRuntimeCandidateManifest();
    const forbidden = /stable-lifecycle|lifecycle-hook|agent-rules-lifecycle|agent-rules-runtime\/northstar|plugins\/agent-rules\.ts|agent-rules-extension\.ts/i;
    expect(Object.keys(manifest.asset_hashes).filter((file) => forbidden.test(file))).toEqual([]);
  });
});
