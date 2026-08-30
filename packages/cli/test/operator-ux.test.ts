import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalStateRoot = process.env.AGENT_RULES_STATE_ROOT;
const originalHarnessHome = process.env.AGENT_RULES_HOME;
afterEach(() => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  if (originalStateRoot === undefined) delete process.env.AGENT_RULES_STATE_ROOT; else process.env.AGENT_RULES_STATE_ROOT = originalStateRoot;
  if (originalHarnessHome === undefined) delete process.env.AGENT_RULES_HOME; else process.env.AGENT_RULES_HOME = originalHarnessHome;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  vi.resetModules();
});

function temp(prefix: string): string { const root = fs.mkdtempSync(path.join(process.cwd(), `.${prefix}`)); roots.push(root); return root; }

function installFakeOmp(agentDir: string): void {
  const executable = path.join(agentDir, process.platform === 'win32' ? 'omp.cmd' : 'omp');
  fs.writeFileSync(executable, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
  if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
}

describe('operator UX', () => {
  it('installs an explicit profile, clears it on update, then rolls back the previous profile generation', async () => {
    const agentDir = temp('agent-rules-ux-omp-');
    const stateRoot = temp('agent-rules-ux-state-');
    installFakeOmp(agentDir);
    process.env.PI_CODING_AGENT_DIR = path.relative(process.cwd(), agentDir);
    process.env.AGENT_RULES_STATE_ROOT = stateRoot;
    process.env.AGENT_RULES_HOME = stateRoot;
    const { createInstallationCoordinator } = await import('../src/runtime/installation-coordinator.js');

    const installed = await createInstallationCoordinator({ enableMcp: false, profiles: ['5fedu'] }).install(['omp']);
    expect(installed.errors).toBeUndefined();
    expect(installed.readback?.omp.profiles).toEqual(['5fedu']);
    expect(fs.readFileSync(path.join(agentDir, 'AGENTS.md'), 'utf8')).toContain('Explicit profile: 5fedu');
    expect(fs.existsSync(path.join(agentDir, 'skills', '5fedu-module-parity', 'SKILL.md'))).toBe(true);

    const updated = await createInstallationCoordinator({ enableMcp: false, profiles: [] }).update(['omp']);
    expect(updated.errors).toBeUndefined();
    expect(updated.readback?.omp.profiles).toEqual([]);
    expect(fs.readFileSync(path.join(agentDir, 'AGENTS.md'), 'utf8')).not.toContain('Explicit profile: 5fedu');
    expect(fs.existsSync(path.join(agentDir, 'skills', '5fedu-module-parity'))).toBe(false);

    const rolledBack = await createInstallationCoordinator({ enableMcp: false }).rollback('omp');
    expect(rolledBack.errors).toBeUndefined();
    expect(rolledBack.readback?.omp.profiles).toEqual(['5fedu']);
    expect(fs.readFileSync(path.join(agentDir, 'AGENTS.md'), 'utf8')).toContain('Explicit profile: 5fedu');
    expect(fs.existsSync(path.join(agentDir, 'skills', '5fedu-module-parity', 'SKILL.md'))).toBe(true);
  }, 90_000);

  it('rejects update before install and rollback without a generation', async () => {
    const agentDir = temp('agent-rules-ux-empty-');
    const stateRoot = temp('agent-rules-ux-empty-state-');
    installFakeOmp(agentDir);
    process.env.PI_CODING_AGENT_DIR = path.relative(process.cwd(), agentDir);
    process.env.AGENT_RULES_STATE_ROOT = stateRoot;
    process.env.AGENT_RULES_HOME = stateRoot;
    const { createInstallationCoordinator } = await import('../src/runtime/installation-coordinator.js');
    const update = await createInstallationCoordinator({ enableMcp: false }).update(['omp']);
    expect(update.errors?.omp).toMatch(/not installed/i);
    const rollback = await createInstallationCoordinator({ enableMcp: false }).rollback('omp');
    expect(rollback.errors?.omp).toMatch(/no rollback generation/i);
  });

  it('rejects an unknown explicit profile before writing host bytes', async () => {
    const agentDir = temp('agent-rules-ux-profile-');
    const stateRoot = temp('agent-rules-ux-profile-state-');
    installFakeOmp(agentDir);
    process.env.PI_CODING_AGENT_DIR = path.relative(process.cwd(), agentDir);
    process.env.AGENT_RULES_STATE_ROOT = stateRoot;
    process.env.AGENT_RULES_HOME = stateRoot;
    const { createInstallationCoordinator } = await import('../src/runtime/installation-coordinator.js');
    const result = await createInstallationCoordinator({ enableMcp: false, profiles: ['does-not-exist'] }).install(['omp']);
    expect(result.errors?.omp).toMatch(/unknown profile/i);
    expect(fs.existsSync(path.join(agentDir, 'AGENTS.md'))).toBe(false);
  });
});
