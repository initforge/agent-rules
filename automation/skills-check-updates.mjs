#!/usr/bin/env node
/**
 * skills-check-updates.mjs — read-only update check for pinned upstream skills.
 *
 * For each active upstream skill in registry/skills.yaml, verifies that the
 * local folder content hash still matches the pinned content hash, and (when
 * network is allowed) reports whether the pinned commit is still the latest
 * reachable review. This tool is strictly read-only: it never mutates the
 * registry, a skill folder, or the canonical tree.
 *
 * Usage:
 *   npm run skills:check-updates [--offline] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { hashSkillFolder } from '../packages/kernel/dist/northstar/skill-registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const json = args.includes('--json');

const registryFile = path.join(root, 'registry', 'skills.yaml');
const result = { schema: 'agent-rules/skills-check-updates/v1', ok: true, entries: [], notes: [] };

if (!fs.existsSync(registryFile)) {
  result.ok = false;
  result.notes.push('registry/skills.yaml is missing');
} else {
  const doc = YAML.parse(fs.readFileSync(registryFile, 'utf8'));
  const activeUpstream = (doc.skills ?? []).filter((s) => s.origin === 'upstream' && s.lifecycle === 'active');
  for (const entry of activeUpstream) {
    const folder = path.join(root, 'skills', entry.id);
    let localHash = null;
    let folderOk = false;
    try {
      localHash = hashSkillFolder(folder);
      folderOk = true;
    } catch {
      localHash = null;
      folderOk = false;
    }
    const pinned = entry.upstream?.content_hash ?? null;
    const matches = folderOk && localHash === pinned;
    if (!matches) {
      result.ok = false;
      result.entries.push({ id: entry.id, status: 'DRIFT', pinned, local: localHash });
    } else {
      result.entries.push({ id: entry.id, status: 'MATCH', pinned, local: localHash });
    }
  }
  if (!offline) {
    for (const entry of activeUpstream) {
      const row = result.entries.find((item) => item.id === entry.id);
      if (!row || row.status === 'DRIFT') continue;
      try {
        const repo = new URL(entry.upstream.repository).pathname.replace(/^\/+/, '').replace(/\.git$/, '');
        const response = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-rules-skills-update-check' },
          redirect: 'manual',
          signal: AbortSignal.timeout(30_000),
        });
        if (response.status >= 300 && response.status < 400) throw new Error(`redirect rejected (${response.status})`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const latest = (await response.json())?.[0]?.sha;
        if (typeof latest !== 'string') throw new Error('latest commit missing');
        row.latest = latest;
        row.status = latest === entry.upstream.commit ? 'MATCH' : 'UPDATE_AVAILABLE';
      } catch (error) {
        row.status = 'UNREACHABLE';
        row.error = error instanceof Error ? error.message : String(error);
      }
    }
  }
}

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  for (const entry of result.entries) console.log(`${entry.status} ${entry.id}${entry.status === 'DRIFT' ? ` (pinned ${(entry.pinned ?? '').slice(0, 12)}, local ${(entry.local ?? 'missing').slice(0, 12)})` : ''}`);
  for (const note of result.notes) console.log(`note: ${note}`);
}
process.exit(result.ok ? 0 : 2);
