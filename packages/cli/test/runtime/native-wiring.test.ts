import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveDependency } from '../../src/runtime/dependency-resolver.js';
import { cleanupOperationalState, writeCurrentOperationalState } from '../../src/runtime/state-lifecycle.js';
import { cleanupCentralExecutableRuntime, cleanupHostRuntimeCallbacks } from '../../src/runtime/legacy-runtime-cleanup.js';
import { installCommandCodeMod, readCommandCodeNative } from '../../src/services/command-code-native.js';
import { projectSkillsToGlobal, restoreSkillProjectionBackup, uninstallOwnedGlobalProjections } from '../../src/runtime/composed-installer.js';

const roots: string[] = [];
function tempRoot(prefix: string): string { const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('static dependency and state wiring', () => {
  it('fails closed on stale dependency overrides used by operator commands', () => {
    const root = tempRoot('agent-rules-resolver-');
    const binary = path.join(root, 'node.exe'); fs.writeFileSync(binary, 'fixture');
    expect(resolveDependency({ name: 'node', env: {}, platform: 'win32', packageCandidates: [binary] })).toEqual({ command: path.resolve(binary), source: 'package-runtime' });
    expect(() => resolveDependency({ name: 'node', env: { AGENT_RULES_NODE: path.join(root, 'missing.exe') }, envVar: 'AGENT_RULES_NODE', platform: 'win32' })).toThrow(/missing or non-executable/);
  });

  it('keeps only current operational snapshots', () => {
    const root = tempRoot('agent-rules-state-');
    writeCurrentOperationalState('installation.json', { current: 1 }, root);
    writeCurrentOperationalState('installation.json', { current: 2 }, root);
    const receipts = path.join(root, 'receipts'); fs.mkdirSync(receipts); fs.writeFileSync(path.join(receipts, 'old.json'), JSON.stringify({ schema: 'agent-rules/installation-receipt/v1' }));
    expect(cleanupOperationalState(root).needsUser).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'current', 'installation.json'), 'utf8'))).toEqual({ current: 2 });
    expect(fs.existsSync(receipts)).toBe(false);
  });

  it('restores skill bytes after a later static transaction failure', async () => {
    const root = tempRoot('agent-rules-skill-'); const source = path.join(root, 'source'); const target = path.join(root, 'target'); const state = path.join(root, 'state'); const rollback = path.join(root, 'rollback');
    fs.mkdirSync(path.join(source, 'sample'), { recursive: true }); fs.writeFileSync(path.join(source, 'sample', 'SKILL.md'), 'old');
    await projectSkillsToGlobal(source, 'codex', { targetRoots: [target], harnessHome: state });
    fs.writeFileSync(path.join(source, 'sample', 'SKILL.md'), 'new');
    await projectSkillsToGlobal(source, 'codex', { targetRoots: [target], harnessHome: state, rollbackRoot: rollback });
    expect(await restoreSkillProjectionBackup(rollback)).toBe(true);
    expect(fs.readFileSync(path.join(target, 'sample', 'SKILL.md'), 'utf8')).toBe('old');
  });

  it('retains a user-modified owned skill during uninstall', async () => {
    const root = tempRoot('agent-rules-skill-user-'); const source = path.join(root, 'source'); const target = path.join(root, 'target'); const state = path.join(root, 'state');
    fs.mkdirSync(path.join(source, 'sample'), { recursive: true }); fs.writeFileSync(path.join(source, 'sample', 'SKILL.md'), 'managed');
    await projectSkillsToGlobal(source, 'codex', { targetRoots: [target], harnessHome: state });
    fs.writeFileSync(path.join(target, 'sample', 'SKILL.md'), 'user changed');
    expect((await uninstallOwnedGlobalProjections('codex', state)).retained).toEqual([path.join(target, 'sample')]);
  });
});

describe('legacy callback retirement', () => {
  it('removes only agent-rules Codex hook groups and preserves audit-on-edit', () => {
    const home = tempRoot('agent-rules-codex-hooks-'); const file = path.join(home, 'hooks.json');
    fs.writeFileSync(file, JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'audit-on-edit.sh' }] }], SessionStart: [{ hooks: [{ type: 'command', command: 'C:/x/agent-rules-lifecycle.cmd --host codex' }] }], Stop: [{ hooks: [{ type: 'command', command: 'node lifecycle-hook.js' }] }] } }));
    const result = cleanupHostRuntimeCallbacks('codex', home); const body = fs.readFileSync(file, 'utf8');
    expect(result.removed).toHaveLength(1); expect(body).toContain('audit-on-edit.sh'); expect(body).not.toMatch(/agent-rules-lifecycle|lifecycle-hook/);
  });

  it('removes only agent-rules Cursor callbacks', () => {
    const home = tempRoot('agent-rules-cursor-hooks-'); const file = path.join(home, 'hooks.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, hooks: { beforeSubmitPrompt: [{ command: 'agent-rules-lifecycle.cmd --host cursor' }, { command: 'user-hook.cmd' }], stop: [{ command: 'node lifecycle-hook.js' }] } }));
    cleanupHostRuntimeCallbacks('cursor', home); const body = fs.readFileSync(file, 'utf8');
    expect(body).toContain('user-hook.cmd'); expect(body).not.toMatch(/agent-rules-lifecycle|lifecycle-hook/);
  });

  it('removes ownership-proven OpenCode and OMP routing artifacts while preserving unowned files', () => {
    const open = tempRoot('agent-rules-open-'); const plugin = path.join(open, 'plugins', 'agent-rules.ts'); fs.mkdirSync(path.dirname(plugin), { recursive: true }); fs.writeFileSync(plugin, '// agent-rules:managed:opencode');
    cleanupHostRuntimeCallbacks('opencode', open); expect(fs.existsSync(plugin)).toBe(false);
    const omp = tempRoot('agent-rules-omp-'); const extension = path.join(omp, 'extensions', 'agent-rules.ts'); fs.mkdirSync(path.dirname(extension), { recursive: true }); fs.writeFileSync(extension, '// user extension');
    const result = cleanupHostRuntimeCallbacks('omp', omp); expect(fs.existsSync(extension)).toBe(true); expect(result.preserved).toEqual([extension]);
  });

  it('removes only receipt-owned executable runtimes', () => {
    const state = tempRoot('agent-rules-runtime-state-'); const current = path.join(state, 'runtime', 'current'); fs.mkdirSync(current, { recursive: true });
    fs.writeFileSync(path.join(current, 'runtime-receipt.json'), JSON.stringify({ schema: 'agent-rules/stable-lifecycle-runtime/v1' }));
    expect(cleanupCentralExecutableRuntime(state).removed).toEqual([path.join(state, 'runtime')]);
    const home = tempRoot('agent-rules-host-runtime-'); const runtime = path.join(home, 'agent-rules-runtime'); fs.mkdirSync(runtime); fs.writeFileSync(path.join(runtime, 'agent-rules-runtime-receipt.json'), JSON.stringify({ schema: 'agent-rules/runtime-receipt' }));
    expect(cleanupHostRuntimeCallbacks('grok', home).removed).toContain(runtime);
  });

  it('renders a self-contained Command Code mod with no callback fields', () => {
    const home = tempRoot('agent-rules-command-code-'); const repo = path.resolve(process.cwd(), '..', '..'); const mod = installCommandCodeMod(home, repo); const body = fs.readFileSync(mod, 'utf8');
    expect(readCommandCodeNative(home).modStatic).toBe(true);
    expect(body).not.toMatch(/NODE_RUNTIME|LIFECYCLE_ENTRYPOINT|spawnSync|lifecycle-hook|agent-rules-lifecycle|route-native/);
  });
});
