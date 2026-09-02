import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { loadRuntimeCandidateManifest } from '../src/runtime/installation-coordinator.js';
import { resolveRuntimeAssetsRoot } from '../src/runtime/locator.js';

describe('portable static candidate', () => {
  it('contains rules, complete skills, profiles, integration registry and platform contracts', () => {
    const root = resolveRuntimeAssetsRoot();
    const manifest = loadRuntimeCandidateManifest();
    for (const required of [
      'rules/manifest.yaml', 'registry/skills.yaml', 'skills/frontend-design/SKILL.md', 'profiles/5fedu/profile.yaml',
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

  it('packages no retired wrapper or unresolved provenance as a selectable skill', () => {
    const repoRoot = path.resolve(process.cwd(), '../..');
    const registry = YAML.parse(fs.readFileSync(path.join(repoRoot, 'registry', 'skills.yaml'), 'utf8')) as { schema: string; skills: Array<{ id: string; origin: string; lifecycle: string; upstream?: { repository?: string; commit?: string; tree?: string; license?: string; content_hash?: string } }> };
    const manifest = loadRuntimeCandidateManifest();
    expect(registry.schema).toBe('agent-rules/skill-registry/v2');
    expect(manifest.asset_hashes).not.toHaveProperty('references/external-skills/registry.json');
    for (const entry of registry.skills) {
      if (entry.lifecycle === 'retired' || entry.lifecycle === 'deprecated' || entry.lifecycle === 'blocked') {
        expect(manifest.asset_hashes).not.toHaveProperty(`skills/${entry.id}/SKILL.md`, `${entry.id} (${entry.lifecycle}) must not be packaged as a selectable skill`);
      }
      if (entry.origin === 'upstream' && entry.lifecycle === 'active') {
        expect(entry.upstream?.repository).toMatch(/^https:\/\//);
        expect(entry.upstream?.commit).toMatch(/^[a-f0-9]{40}$/i);
        expect(entry.upstream?.tree).toMatch(/^[a-f0-9]{40}$/i);
        expect(entry.upstream?.license).toBeTruthy();
        expect(entry.upstream?.content_hash).toMatch(/^[a-f0-9]{64}$/);
      }
      if (entry.lifecycle === 'active' && ['internal', 'upstream'].includes(entry.origin)) {
        expect(manifest.asset_hashes).toHaveProperty(`skills/${entry.id}/SKILL.md`);
      }
    }
  });
});
