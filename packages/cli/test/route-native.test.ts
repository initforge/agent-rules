import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

describe('agent-rules route-native CLI transport (REQ-005)', () => {
  it('reads NativeTurnRequest JSON from stdin and outputs RouteCapsule to stdout', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-route-'));
    const input = JSON.stringify({
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'cli-test-001',
      turn_id: 'turn-001',
      cwd: workspace,
      repo_root: repoRoot,
      prompt: 'Verify visual parity in the browser',
      host_facts: { client: 'interactive' },
    });

    const res = spawnSync(process.execPath, [cliEntry, 'route-native', '--stdin'], {
      input,
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    const capsule = JSON.parse(res.stdout);
    expect(capsule.schema).toBe('agent-rules/route-capsule');
    expect(['READY', 'PLAN_REQUIRED']).toContain(capsule.status);
    expect(capsule.host).toBe('omp');
    expect(capsule.session_id).toBe('cli-test-001');
    expect(capsule.route_id).toMatch(/^RT-[0-9a-f]{24}$/);
    expect(fs.existsSync(path.join(workspace, '.agent'))).toBe(false);
    expect(fs.readdirSync(workspace)).toEqual([]);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('fails with exit code 1 when --stdin flag is omitted', () => {
    const res = spawnSync(process.execPath, [cliEntry, 'route-native'], {
      input: '{}',
      encoding: 'utf8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--stdin transport is supported');
    expect(res.stdout).toBe('');
  });

  it('fails with exit code 1 on empty stdin', () => {
    const res = spawnSync(process.execPath, [cliEntry, 'route-native', '--stdin'], {
      input: '   ',
      encoding: 'utf8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('empty input on stdin');
    expect(res.stdout).toBe('');
  });

  it('fails with exit code 1 on invalid JSON', () => {
    const res = spawnSync(process.execPath, [cliEntry, 'route-native', '--stdin'], {
      input: 'this is not valid json',
      encoding: 'utf8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('invalid JSON on stdin');
    expect(res.stdout).toBe('');
  });

  it('rejects the retired route persistence option', () => {
    const res = spawnSync(process.execPath, [cliEntry, 'route-native', '--stdin', '--runs-root', 'retired'], {
      input: '{}',
      encoding: 'utf8',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('unknown option');
  });
});
