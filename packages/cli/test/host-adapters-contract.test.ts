import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NativeInstaller } from '../src/services/native-installer.js';
import { getHostIds, getNativeContract, getAllNativeContracts, getHostSupport } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';

const repoRoot = path.resolve(process.cwd(), '../..');

describe('static host projector contracts', () => {
  const allHostIds = getHostIds(repoRoot) as HostId[];

  it('defines shallow static contracts for all nine hosts', () => {
    expect(allHostIds).toHaveLength(9);
    const contracts = getAllNativeContracts(repoRoot);
    for (const host of allHostIds) {
      const contract = contracts[host];
      expect(contract.id).toBe(host);
      expect(contract.paths.instructionPath).toBeTruthy();
      expect(contract.paths.skillPath).toBeTruthy();
      expect(contract.paths.mcpPath).toBeTruthy();
      expect(contract.mergeStrategy).toBeTruthy();
      expect(contract.readbackStrategy).toBeTruthy();
      expect(getHostSupport(host, repoRoot)?.components.lifecycle).toEqual({ surface: 'none', mode: 'unsupported' });
    }
  });

  it('keeps host identity separate from the selected model provider', () => {
    expect(getNativeContract('omp', repoRoot)?.id).toBe('omp');
    expect(getNativeContract('antigravity', repoRoot)?.id).toBe('antigravity');
  });

  it('installs OMP static AGENTS and skills without extension or runtime directories and rolls back byte-equally', async () => {
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const previousHarnessHome = process.env.AGENT_RULES_HOME;
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-static-install-'));
    const harnessHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-static-home-'));
    const fakeOmp = path.join(agentDir, process.platform === 'win32' ? 'omp.cmd' : 'omp');
    fs.writeFileSync(fakeOmp, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
    if (process.platform !== 'win32') fs.chmodSync(fakeOmp, 0o755);
    process.env.PI_CODING_AGENT_DIR = agentDir; process.env.AGENT_RULES_HOME = harnessHome;
    try {
      const installer = new NativeInstaller();
      const first = await installer.planInstall('omp');
      await installer.install('omp', { backupDir: first.backupDir });
      expect(fs.readFileSync(path.join(agentDir, 'AGENTS.md'), 'utf8')).toContain('agent-rules:managed:omp');
      expect(fs.existsSync(path.join(agentDir, 'skills'))).toBe(true);
      expect(fs.existsSync(path.join(agentDir, 'extensions', 'agent-rules.ts'))).toBe(false);
      expect(fs.existsSync(path.join(agentDir, 'agent-rules-runtime'))).toBe(false);
      const before = fs.readFileSync(path.join(agentDir, 'AGENTS.md'));
      const second = await installer.planInstall('omp');
      await installer.install('omp', { backupDir: second.backupDir });
      expect((await installer.rollback('omp', second.backupDir)).byteEqual).toBe(true);
      expect(fs.readFileSync(path.join(agentDir, 'AGENTS.md')).equals(before)).toBe(true);
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      if (previousHarnessHome === undefined) delete process.env.AGENT_RULES_HOME; else process.env.AGENT_RULES_HOME = previousHarnessHome;
      fs.rmSync(agentDir, { recursive: true, force: true }); fs.rmSync(harnessHome, { recursive: true, force: true });
    }
  }, 60_000);

  it('certifies static infrastructure and model-mediated intake without router binding', async () => {
    const installer = new NativeInstaller();
    for (const host of ['omp', 'cursor', 'codex', 'claude'] as HostId[]) {
      const receipt = await installer.certify(host);
      expect(receipt.axes?.routing.mode).toBe(receipt.claims.HOST_PRESENT.status === 'PASS' ? 'STATIC_NATIVE' : 'UNSUPPORTED');
      expect(receipt.axes?.routing.intake).toBe(receipt.claims.HOST_PRESENT.status === 'PASS' ? 'MODEL_MEDIATED' : 'NOT_APPLICABLE');
      expect(receipt.claims).not.toHaveProperty('NATIVE_LIFECYCLE');
    }
  }, 30_000);
});
