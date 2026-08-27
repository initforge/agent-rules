import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

describe('agent-rules route-native CLI transport (REQ-005)', () => {
  it('reads NativeTurnRequest JSON from stdin and outputs RouteCapsule to stdout', () => {
    const input = JSON.stringify({
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'cli-test-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
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
    expect(capsule.status).toBe('PASS');
    expect(capsule.host).toBe('omp');
    expect(capsule.session_id).toBe('cli-test-001');
    expect(capsule.route_id).toMatch(/^RT-[0-9a-f]{24}$/);
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

  it('writes a RunStore receipt when --runs-root is provided', () => {
    const tmpRuns = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-cli-runs-'));
    try {
      const input = JSON.stringify({
        protocol_version: '2.0',
        host: 'omp',
        session_id: 'cli-test-receipt-001',
        turn_id: 'turn-001',
        cwd: repoRoot,
        prompt: 'Check database schema and migration invariants',
        host_facts: {},
      });

      const res = spawnSync(process.execPath, [cliEntry, 'route-native', '--stdin', '--runs-root', tmpRuns], {
        input,
        encoding: 'utf8',
      });

      expect(res.status).toBe(0);
      const capsule = JSON.parse(res.stdout);
      const receiptFile = path.join(tmpRuns, `route-${capsule.route_id}`, 'run.json');
      expect(fs.existsSync(receiptFile)).toBe(true);
      const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      expect(receipt.route_id).toBe(capsule.route_id);
    } finally {
      fs.rmSync(tmpRuns, { recursive: true, force: true });
    }
  });
});
