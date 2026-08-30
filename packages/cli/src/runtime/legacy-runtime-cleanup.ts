import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';

export interface LegacyCleanupResult {
  removed: string[];
  preserved: string[];
  needsUser: string[];
}

const callbackPattern = /agent-rules-lifecycle|lifecycle-hook\.js|agent-rules-runtime|route-native/i;

function emptyResult(): LegacyCleanupResult {
  return { removed: [], preserved: [], needsUser: [] };
}

function commandOf(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const command = (value as Record<string, unknown>).command;
  return typeof command === 'string' ? command : '';
}

function atomicJson(file: string, value: unknown): void {
  const temporary = `${file}.agent-rules-static-tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function removeGroupedCallbacks(file: string, result: LegacyCleanupResult): void {
  if (!fs.existsSync(file)) return;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks)) return;
  const hooks = { ...(parsed.hooks as Record<string, unknown>) };
  let changed = false;
  for (const [event, groupsValue] of Object.entries(hooks)) {
    if (!Array.isArray(groupsValue)) continue;
    const groups = groupsValue.flatMap((group): unknown[] => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return [group];
      const record = group as Record<string, unknown>;
      if (callbackPattern.test(commandOf(record))) {
        changed = true;
        return [];
      }
      if (!Array.isArray(record.hooks)) return [group];
      const kept = record.hooks.filter((entry) => !callbackPattern.test(commandOf(entry)));
      if (kept.length === record.hooks.length) return [group];
      changed = true;
      return kept.length > 0 ? [{ ...record, hooks: kept }] : [];
    });
    if (groups.length > 0) hooks[event] = groups;
    else delete hooks[event];
  }
  if (!changed) return;
  parsed.hooks = hooks;
  atomicJson(file, parsed);
  result.removed.push(`${file}#agent-rules-callbacks`);
}

function removeCursorCallbacks(file: string, result: LegacyCleanupResult): void {
  if (!fs.existsSync(file)) return;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks)) return;
  const hooks = { ...(parsed.hooks as Record<string, unknown>) };
  let changed = false;
  for (const event of ['beforeSubmitPrompt', 'stop']) {
    const entries = hooks[event];
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry) => !callbackPattern.test(commandOf(entry)));
    if (kept.length === entries.length) continue;
    changed = true;
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  if (!changed) return;
  parsed.hooks = hooks;
  atomicJson(file, parsed);
  result.removed.push(`${file}#agent-rules-callbacks`);
}

function removeMarkedFile(file: string, marker: string, result: LegacyCleanupResult): void {
  if (!fs.existsSync(file)) return;
  const body = fs.readFileSync(file, 'utf8');
  if (!body.includes(marker)) {
    result.preserved.push(file);
    return;
  }
  fs.rmSync(file, { force: true });
  result.removed.push(file);
}

function runtimeOwned(root: string): boolean {
  const receipt = path.join(root, 'agent-rules-runtime-receipt.json');
  if (!fs.existsSync(receipt)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(receipt, 'utf8')) as { schema?: unknown };
    return parsed.schema === 'agent-rules/runtime-receipt';
  } catch {
    return false;
  }
}

function removeOwnedRuntime(root: string, result: LegacyCleanupResult): void {
  if (!fs.existsSync(root)) return;
  if (!runtimeOwned(root)) {
    result.needsUser.push(`legacy runtime ownership is ambiguous: ${root}`);
    return;
  }
  fs.rmSync(root, { recursive: true, force: true });
  result.removed.push(root);
}

export function cleanupHostRuntimeCallbacks(host: HostId, home: string): LegacyCleanupResult {
  const result = emptyResult();
  if (host === 'codex') removeGroupedCallbacks(path.join(home, 'hooks.json'), result);
  if (host === 'claude') removeGroupedCallbacks(path.join(home, 'settings.json'), result);
  if (host === 'cursor') removeCursorCallbacks(path.join(home, 'hooks.json'), result);
  if (host === 'opencode') removeMarkedFile(path.join(home, 'plugins', 'agent-rules.ts'), 'agent-rules:managed:opencode', result);
  if (host === 'omp') removeMarkedFile(path.join(home, 'extensions', 'agent-rules.ts'), 'agent-rules:managed:omp', result);
  removeOwnedRuntime(path.join(home, 'agent-rules-runtime'), result);
  removeOwnedRuntime(path.join(home, '.agent-rules-runtime.rollback'), result);
  return result;
}

export function cleanupCentralExecutableRuntime(stateRoot = path.join(os.homedir(), '.agent-rules')): LegacyCleanupResult {
  const result = emptyResult();
  const runtime = path.join(stateRoot, 'runtime');
  if (!fs.existsSync(runtime)) return result;
  const receipts = [path.join(runtime, 'current', 'runtime-receipt.json'), path.join(runtime, 'rollback', 'runtime-receipt.json')];
  const existing = receipts.filter((file) => fs.existsSync(file));
  const owned = existing.length > 0 && existing.every((file) => {
    try {
      return (JSON.parse(fs.readFileSync(file, 'utf8')) as { schema?: unknown }).schema === 'agent-rules/stable-lifecycle-runtime/v1';
    } catch { return false; }
  });
  if (!owned) {
    result.needsUser.push(`central executable runtime ownership is ambiguous: ${runtime}`);
    return result;
  }
  fs.rmSync(runtime, { recursive: true, force: true });
  result.removed.push(runtime);
  return result;
}
