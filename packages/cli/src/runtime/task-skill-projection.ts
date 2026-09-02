import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getNativeContract } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import { hashSkillFolder, loadSkillRegistry, type SkillRegistryEntry } from '@initforge/agent-rules-kernel/northstar/skill-registry.js';
import type { SkillProjectionState } from '@initforge/agent-rules-kernel/northstar/task-state.js';
import { resolveRuntimeAssetsRoot } from './locator.js';

export interface TaskProjectionResult {
  readonly projection: SkillProjectionState | null;
  readonly selected: string[];
  readonly projected: string[];
  readonly rollback: () => void;
  readonly commit: () => void;
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

function projectionRoot(repositoryRoot: string, host: string): string | null {
  const contract = getNativeContract(host);
  const raw = contract?.paths.repositorySkillPath;
  if (!raw) return null;
  const relative = raw.replace(/[\\/]?<skill>[\\/]?SKILL\.md$/i, '').replace(/[\\/]?<skill>$/i, '');
  const target = path.resolve(repositoryRoot, relative);
  if (!target.startsWith(`${path.resolve(repositoryRoot)}${path.sep}`)) throw new Error(`repository skill target escapes root: ${raw}`);
  return target;
}

function dependencyClosure(entries: Map<string, SkillRegistryEntry>, requested: readonly string[]): SkillRegistryEntry[] {
  const selected = new Map<string, SkillRegistryEntry>();
  const visit = (id: string, trail: readonly string[] = []): void => {
    if (trail.includes(id)) throw new Error(`skill dependency cycle: ${[...trail, id].join(' -> ')}`);
    if (selected.has(id)) return;
    const entry = entries.get(id);
    if (!entry || entry.lifecycle !== 'active') throw new Error(`selected skill is missing or inactive: ${id}`);
    for (const other of selected.values()) {
      if ((entry.conflicts ?? []).includes(other.id) || (other.conflicts ?? []).includes(entry.id)) throw new Error(`selected skill conflict: ${entry.id}, ${other.id}`);
      if (entry.exclusive_group && entry.exclusive_group === other.exclusive_group) throw new Error(`selected skill exclusive-group conflict (${entry.exclusive_group}): ${entry.id}, ${other.id}`);
    }
    selected.set(id, entry);
    for (const dependency of entry.requires ?? []) visit(dependency, [...trail, id]);
  };
  for (const id of requested) visit(id);
  return [...selected.values()];
}

export function replaceTaskSkillProjection(repositoryRoot: string, host: string, requested: readonly string[], previous: SkillProjectionState | null): TaskProjectionResult {
  const assets = resolveRuntimeAssetsRoot();
  const registry = loadSkillRegistry(assets);
  const entries = new Map(registry.skills.map((entry) => [entry.id, entry]));
  const closure = dependencyClosure(entries, requested);
  const selected = closure.map((entry) => entry.id);
  const explicit = closure.filter((entry) => entry.activation === 'explicit-only');
  const previousOwnedCount = Object.keys(previous?.owned_hashes ?? {}).length;
  const previousReusedCount = previous?.reused_skill_ids?.length ?? 0;
  if (explicit.length === 0 && previousOwnedCount === 0 && previousReusedCount === 0) {
    return { projection: null, selected, projected: [], rollback: () => undefined, commit: () => undefined };
  }
  const targetRoot = projectionRoot(repositoryRoot, host);
  if (!targetRoot) {
    return {
      projection: explicit.length === 0 ? null : { host, target_root: '', catalog_hash: sha256(JSON.stringify(selected)), status: 'UNSUPPORTED' },
      selected,
      projected: [],
      rollback: () => undefined,
      commit: () => undefined,
    };
  }

  const previousOwned = previous?.host === host && path.resolve(previous.target_root) === targetRoot ? { ...(previous.owned_hashes ?? {}) } : {};
  const desired = new Map<string, { source: string; hash: string }>();
  for (const entry of explicit) {
    const source = path.join(assets, 'skills', entry.id);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) throw new Error(`canonical explicit skill folder is missing: ${entry.id}`);
    desired.set(entry.id, { source, hash: hashSkillFolder(source) });
  }

  const reused: string[] = [];
  const collisions: string[] = [];
  for (const [id, item] of desired) {
    const target = path.join(targetRoot, id);
    if (!fs.existsSync(target)) continue;
    const actual = hashSkillFolder(target);
    if (previousOwned[id] && actual === previousOwned[id]) continue;
    if (actual === item.hash) reused.push(id);
    else collisions.push(`${id} @ ${target}`);
  }
  for (const [id, oldHash] of Object.entries(previousOwned)) {
    if (desired.has(id)) continue;
    const target = path.join(targetRoot, id);
    if (fs.existsSync(target) && hashSkillFolder(target) !== oldHash) collisions.push(`owned task skill was modified: ${id} @ ${target}`);
  }
  if (collisions.length) throw new Error(`NEEDS_USER: task skill projection collision: ${collisions.join('; ')}`);

  const transaction = path.join(repositoryRoot, 'tmp', `task-skill-projection-${process.pid}-${Date.now()}`);
  const staged = path.join(transaction, 'staged');
  const backup = path.join(transaction, 'backup');
  fs.mkdirSync(staged, { recursive: true });
  for (const [id, item] of desired) if (!reused.includes(id)) fs.cpSync(item.source, path.join(staged, id), { recursive: true, force: false, errorOnExist: true });
  const touched = new Set([...Object.keys(previousOwned), ...desired.keys()]);
  for (const id of touched) {
    const target = path.join(targetRoot, id);
    if (fs.existsSync(target) && !reused.includes(id)) fs.cpSync(target, path.join(backup, id), { recursive: true, force: false, errorOnExist: true });
  }
  const restore = (): void => {
    for (const id of touched) {
      if (reused.includes(id)) continue;
      const target = path.join(targetRoot, id);
      fs.rmSync(target, { recursive: true, force: true });
      const prior = path.join(backup, id);
      if (fs.existsSync(prior)) fs.cpSync(prior, target, { recursive: true, force: false, errorOnExist: true });
    }
    fs.rmSync(transaction, { recursive: true, force: true });
  };
  try {
    if (desired.size > 0) fs.mkdirSync(targetRoot, { recursive: true });
    for (const [id] of Object.entries(previousOwned)) if (!desired.has(id)) fs.rmSync(path.join(targetRoot, id), { recursive: true, force: true });
    for (const [id] of desired) {
      if (reused.includes(id)) continue;
      const target = path.join(targetRoot, id);
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(path.join(staged, id), target, { recursive: true, force: false, errorOnExist: true });
    }
    const ownedHashes: Record<string, string> = {};
    for (const [id, item] of desired) if (!reused.includes(id)) ownedHashes[id] = item.hash;
    const projection: SkillProjectionState | null = desired.size === 0 ? null : {
      host,
      target_root: targetRoot,
      catalog_hash: sha256(JSON.stringify(selected.map((id) => ({ id, hash: desired.get(id)?.hash ?? 'implicit', path: desired.has(id) ? path.join(targetRoot, id).replace(/\\/g, '/') : null })))),
      status: 'ACTIVE',
      owned_hashes: ownedHashes,
      reused_skill_ids: reused,
    };
    const commit = (): void => {
      fs.rmSync(transaction, { recursive: true, force: true });
      if (projection !== null || !fs.existsSync(targetRoot) || fs.readdirSync(targetRoot).length > 0) return;
      fs.rmSync(targetRoot, { recursive: true, force: true });
      const parent = path.dirname(targetRoot);
      if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmSync(parent, { recursive: true, force: true });
    };
    return { projection, selected, projected: Object.keys(ownedHashes), rollback: restore, commit };
  } catch (error) {
    restore();
    throw error;
  }
}

export function removeTaskSkillProjection(projection: SkillProjectionState | null): void {
  if (!projection || projection.status === 'UNSUPPORTED') return;
  const root = path.resolve(projection.target_root);
  for (const [id, expected] of Object.entries(projection.owned_hashes ?? {})) {
    const target = path.resolve(root, id);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`task skill removal escapes target root: ${id}`);
    if (!fs.existsSync(target)) continue;
    if (hashSkillFolder(target) !== expected) throw new Error(`NEEDS_USER: task-selected skill was modified: ${id}`);
    fs.rmSync(target, { recursive: true, force: true });
  }
}
