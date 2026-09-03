import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { validateSkillRegistry, validateSkillRegistryTree, parseSkillRegistry, loadSkillRegistry } from '../src/northstar/skill-registry.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const temporaryRoots: string[] = [];
afterEach(() => { for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const validEntry = {
  id: 'test-skill',
  origin: 'internal',
  role: 'process',
  activation: 'implicit',
  compatibility: {},
  lifecycle: 'active',
  trust_tier: 'owner-approved',
  trust_basis: 'test fixture',
  network: 'none',
  side_effects: [],
  update_policy: 'manual_review',
  failure_target: 'test failure target',
  removal_condition: 'test removal condition',
};

function document(entries: unknown[]): unknown {
  return { schema: 'agent-rules/skill-registry/v2', skills: entries };
}

describe('SkillRegistryV2 validator', () => {
  it('accepts a valid internal entry', () => {
    const result = validateSkillRegistry(document([validEntry]));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('activation accepts only implicit|explicit-only (roles are not activation)', () => {
    expect(validateSkillRegistry(document([{ ...validEntry, activation: 'implicit' }])).ok).toBe(true);
    expect(validateSkillRegistry(document([{ ...validEntry, activation: 'explicit-only' }])).ok).toBe(true);
    const bad = validateSkillRegistry(document([{ ...validEntry, activation: 'auditor' }]));
    expect(bad.ok).toBe(false);
    expect(bad.issues.some((i) => /activation/.test(i.message))).toBe(true);
    // auditor is a role, not an activation
    expect(validateSkillRegistry(document([{ ...validEntry, role: 'auditor' }])).ok).toBe(true);
    expect(validateSkillRegistry(document([{ ...validEntry, role: 'verifier' }])).ok).toBe(true);
    expect(validateSkillRegistry(document([{ ...validEntry, role: 'domain' }])).ok).toBe(true);
  });

  it('rejects duplicate ids and self-references', () => {
    const dup = validateSkillRegistry(document([validEntry, validEntry]));
    expect(dup.ok).toBe(false);
    expect(dup.issues.some((i) => /duplicate id/.test(i.message))).toBe(true);
    const self = validateSkillRegistry(document([{ ...validEntry, requires: ['test-skill'] }]));
    expect(self.ok).toBe(false);
    expect(self.issues.some((i) => /self-reference/.test(i.message))).toBe(true);
  });

  it('requires/supports/conflicts reference existing ids; conflicts symmetric', () => {
    const missing = validateSkillRegistry(document([{ ...validEntry, requires: ['ghost'] }]));
    expect(missing.ok).toBe(false);
    expect(missing.issues.some((i) => /references missing id/.test(i.message))).toBe(true);

    const asymmetric = validateSkillRegistry(document([
      { ...validEntry, conflicts: ['other'] },
      { ...validEntry, id: 'other' },
    ]));
    expect(asymmetric.ok).toBe(false);
    expect(asymmetric.issues.some((i) => /not symmetric/.test(i.message))).toBe(true);

    const symmetric = validateSkillRegistry(document([
      { ...validEntry, conflicts: ['other'] },
      { ...validEntry, id: 'other', conflicts: ['test-skill'] },
    ]));
    expect(symmetric.ok).toBe(true);
  });

  it('rejects requires dependency cycles', () => {
    const cyclic = validateSkillRegistry(document([
      { ...validEntry, requires: ['b'] },
      { ...validEntry, id: 'b', requires: ['test-skill'] },
    ]));
    expect(cyclic.ok).toBe(false);
    expect(cyclic.issues.some((i) => /cycle/.test(i.message))).toBe(true);
  });

  it('exclusive groups may contain all-upstream skills and share one role', () => {
    const upstream = {
      origin: 'upstream' as const, role: 'domain' as const, activation: 'explicit-only' as const,
      lifecycle: 'active' as const, trust_tier: 'pinned-upstream' as const, network: 'read' as const,
      trust_basis: 'fixture', side_effects: [] as string[], update_policy: 'manual_review' as const, compatibility: {},
      upstream: {
        repository: 'https://github.com/x/y', source_path: 'skills/a', commit: 'a'.repeat(40),
        tree: 'b'.repeat(40), license: 'MIT', license_evidence: 'registry/skills.yaml', content_hash: 'c'.repeat(64),
      },
    };
    const allUpstream = validateSkillRegistry(document([
      { ...upstream, id: 'a1', exclusive_group: 'g1' },
      { ...upstream, id: 'a2', exclusive_group: 'g1' },
    ]));
    expect(allUpstream.ok).toBe(true);
  });

  it('active upstream requires a complete pin; blocked upstream may omit license/tree/hash', () => {
    const activeBase = {
      origin: 'upstream' as const, role: 'domain' as const, activation: 'explicit-only' as const,
      lifecycle: 'active' as const, trust_tier: 'pinned-upstream' as const, network: 'read' as const,
      trust_basis: 'fixture', side_effects: [] as string[], update_policy: 'manual_review' as const, compatibility: {},
    };
    const incomplete = validateSkillRegistry(document([{ ...activeBase, id: 'x', upstream: { repository: 'https://github.com/x/y', source_path: 'skills/x' } }]));
    expect(incomplete.ok).toBe(false);
    expect(incomplete.issues.some((i) => /active upstream/.test(i.message))).toBe(true);

    const blocked = validateSkillRegistry(document([{
      ...activeBase, id: 'x', lifecycle: 'blocked', blocked_reason: 'license unresolved',
      upstream: { repository: 'https://github.com/x/y', source_path: 'skills/x' },
    }]));
    expect(blocked.ok).toBe(true);
  });

  it('lifecycle/ownership contradictions fail closed', () => {
    const retiredNoReason = validateSkillRegistry(document([{ ...validEntry, lifecycle: 'retired' }]));
    expect(retiredNoReason.ok).toBe(false);
    const blockedNoReason = validateSkillRegistry(document([{ ...validEntry, lifecycle: 'blocked' }]));
    expect(blockedNoReason.ok).toBe(false);
    const systemActive = validateSkillRegistry(document([{ ...validEntry, origin: 'system', lifecycle: 'active' }]));
    expect(systemActive.ok).toBe(false);
  });

  it('profile skills never appear in the global catalog', () => {
    const profile = validateSkillRegistry(document([{ ...validEntry, origin: 'profile' }]));
    expect(profile.ok).toBe(false);
    expect(profile.issues.some((i) => /profile skills must not appear/.test(i.message))).toBe(true);
  });

  it('loads and parses the canonical registry', () => {
    const registry = loadSkillRegistry(repoRoot);
    expect(registry.schema).toBe('agent-rules/skill-registry/v2');
    expect(registry.skills.length).toBeGreaterThan(0);
    // canonical active skills are present in the registry file
    for (const canonicalId of ['frontend-design', 'react-native-best-practices', 'expo-overview', 'terraform-style-guide', 'impeccable', 'prisma-client-api', 'supabase-postgres-best-practices', 'sharp-edges', 'react-best-practices']) {
      expect(registry.skills.some((s) => s.id === canonicalId), `${canonicalId} must have a v2 record`).toBe(true);
    }
  });
});

describe('registry tree validation', () => {
  function tempRegistry(entries: unknown[]): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-regtree-'));
    temporaryRoots.push(root);
    fs.mkdirSync(path.join(root, 'registry'), { recursive: true });
    fs.mkdirSync(path.join(root, 'skills', 'active-one'), { recursive: true });
    fs.writeFileSync(path.join(root, 'registry', 'skills.yaml'), YAML.stringify(document(entries), { lineWidth: 0 }));
    return root;
  }

  it('active internal/upstream must match canonical folder + frontmatter name', () => {
    const root = tempRegistry([{ ...validEntry, id: 'active-one' }]);
    fs.writeFileSync(path.join(root, 'skills', 'active-one', 'SKILL.md'), '---\nname: active-one\ndescription: d\n---\n# one\n');
    const check = validateSkillRegistryTree(parseSkillRegistry(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8')), root);
    expect(check.ok).toBe(true);

    fs.writeFileSync(path.join(root, 'skills', 'active-one', 'SKILL.md'), '---\nname: wrong\ndescription: d\n---\n# one\n');
    const mismatch = validateSkillRegistryTree(parseSkillRegistry(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8')), root);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.issues.some((i) => /frontmatter name/.test(i.message))).toBe(true);
  });

  it('system skills must not be materialized under skills/', () => {
    const root = tempRegistry([{ ...validEntry, id: 'sys-one', origin: 'system', lifecycle: 'blocked', blocked_reason: 'n/a' }]);
    fs.mkdirSync(path.join(root, 'skills', 'sys-one'), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', 'sys-one', 'SKILL.md'), '---\nname: sys-one\n---\n');
    const check = validateSkillRegistryTree(parseSkillRegistry(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8')), root);
    expect(check.ok).toBe(false);
  });

  it('rejects a folder whose upstream content hash drifts from the pin', () => {
    const root = tempRegistry([{
      ...validEntry, id: 'up-one', origin: 'upstream', role: 'domain', activation: 'explicit-only',
      trust_tier: 'pinned-upstream', network: 'read', lifecycle: 'active',
      upstream: {
        repository: 'https://github.com/x/y', source_path: 'skills/up-one', commit: 'a'.repeat(40), tree: 'b'.repeat(40),
        license: 'MIT', license_evidence: 'registry/skills.yaml', content_hash: 'f'.repeat(64),
      },
    }]);
    fs.mkdirSync(path.join(root, 'skills', 'up-one'), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', 'up-one', 'SKILL.md'), '---\nname: up-one\ndescription: d\n---\n# up\n');
    const check = validateSkillRegistryTree(parseSkillRegistry(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8')), root);
    expect(check.ok).toBe(false);
  });
});
