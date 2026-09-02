import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { catalogFor, proofOutcomeHealthStatus } from '../../src/runtime/health-coordinator.js';
import type { GlobalOwnershipManifest } from '../../src/runtime/composed-installer.js';

const sourceRoot = path.resolve(import.meta.dirname, '../../../..');

describe('proof outcome health', () => {
  it('does not report reducer-only proof behavior as live healthy', () => {
    expect(proofOutcomeHealthStatus(false)).toBe('BROKEN');
    expect(proofOutcomeHealthStatus(true)).toBe('DEGRADED');
  });

  it('separates canonical, global base, task projection, collisions and host-owned extras', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-health-catalog-'));
    const globalRoot = path.join(root, 'global-skills');
    const taskRoot = path.join(root, 'repository');
    const taskSkillRoot = path.join(taskRoot, '.agents', 'skills');
    fs.mkdirSync(globalRoot, { recursive: true });
    const registry = YAML.parse(fs.readFileSync(path.join(sourceRoot, 'registry', 'skills.yaml'), 'utf8')) as { skills: Array<{ id: string; lifecycle: string; activation: string }> };
    const implicit = registry.skills.filter((entry) => entry.lifecycle === 'active' && entry.activation === 'implicit').map((entry) => entry.id);
    const profileId = '5fedu-project';
    for (const id of implicit) fs.cpSync(path.join(sourceRoot, 'skills', id), path.join(globalRoot, id), { recursive: true });
    fs.cpSync(path.join(sourceRoot, 'profiles', '5fedu', 'skills', profileId), path.join(globalRoot, profileId), { recursive: true });
    fs.mkdirSync(path.join(globalRoot, 'host-native'), { recursive: true });
    fs.writeFileSync(path.join(globalRoot, 'host-native', 'SKILL.md'), '---\nname: host-native\ndescription: host owned\n---\n');
    fs.mkdirSync(taskSkillRoot, { recursive: true });
    fs.cpSync(path.join(sourceRoot, 'skills', 'skill-source-governance'), path.join(taskSkillRoot, 'skill-source-governance'), { recursive: true });
    fs.mkdirSync(path.join(taskRoot, '.agent', 'current'), { recursive: true });
    fs.writeFileSync(path.join(taskRoot, '.agent', 'current', 'state.json'), JSON.stringify({
      selected_skill_ids: ['verification-router', 'skill-source-governance'],
      projected_skill_ids: ['skill-source-governance'],
      skill_projection: { host: 'codex', target_root: taskSkillRoot, status: 'ACTIVE', reused_skill_ids: [] },
    }));
    const projections = Object.fromEntries([...implicit, profileId].map((id) => [`cursor:${id}`, { platform: 'cursor', path: path.join(globalRoot, id), kind: 'skill' as const, sha256: 'a'.repeat(64) }]));
    const ownership: GlobalOwnershipManifest = { schema: 'agent-rules/global-ownership-manifest/v1', version: 1, updatedAt: new Date().toISOString(), candidateSha256: 'b'.repeat(64), projections };
    const catalog = await catalogFor('codex', sourceRoot, taskRoot, undefined, { globalSkillRoot: globalRoot, ownershipManifest: ownership });
    expect(catalog.canonical_library_valid).toBe(true);
    expect(catalog.global_base_valid).toBe(true);
    expect(catalog.global_agent_rules_owned_ids).toEqual(expect.arrayContaining(implicit));
    expect(catalog.global_profile_ids).toEqual([profileId]);
    expect(catalog.host_native_or_user_owned_ids).toEqual(['host-native']);
    expect(catalog.user_owned_collision_ids).toEqual([]);
    expect(catalog.task_observed_ids).toEqual(['skill-source-governance']);
    expect(catalog.task_projection_valid).toBe(true);
    expect(catalog.task_selected_addition_chars).toBeGreaterThan(0);
    expect(catalog.agent_rules_effective_chars).toBe(catalog.base_discovery_chars + catalog.profile_addition_chars + catalog.task_selected_addition_chars);
    expect(catalog.host_observed_total_chars).toBeGreaterThan(catalog.agent_rules_effective_chars);

    const collisionOwnership: GlobalOwnershipManifest = { ...ownership, projections: Object.fromEntries(Object.entries(projections).filter(([, projection]) => path.basename(projection.path) !== 'docs-style')) };
    const collision = await catalogFor('codex', sourceRoot, taskRoot, undefined, { globalSkillRoot: globalRoot, ownershipManifest: collisionOwnership });
    expect(collision.global_base_valid).toBe(false);
    expect(collision.user_owned_collision_ids).toContain('docs-style');
  });
});
