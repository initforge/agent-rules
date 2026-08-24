import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  detectOpenCodeDialect,
  formatOpenCodeV1McpEntry,
  formatOpenCodeV2McpEntry,
  formatOpenCodeConfig,
  reconcileOpenCodeConfigFile,
} from '../src/runner/opencode-config.js';

describe('OpenCode Config Serializer (Kernel)', () => {
  it('detects dialect from version/schema strings', () => {
    expect(detectOpenCodeDialect('1.18.19')).toBe('v1');
    expect(detectOpenCodeDialect('https://opencode.ai/config.json')).toBe('v1');
    expect(detectOpenCodeDialect('https://opencode.ai/config.v2.json')).toBe('v2');
    expect(detectOpenCodeDialect('2.0.0')).toBe('v2');
    expect(detectOpenCodeDialect('v2')).toBe('v2');
    expect(detectOpenCodeDialect(undefined)).toBe('v1');
  });

  it('formats v1 MCP entries with local type, argv array, and enabled: true', () => {
    const entry = formatOpenCodeV1McpEntry({
      command: 'node',
      args: ['server.js', '--flag'],
      env: { FOO: 'bar' },
    });
    expect(entry).toEqual({
      type: 'local',
      command: ['node', 'server.js', '--flag'],
      enabled: true,
      environment: { FOO: 'bar' },
    });
  });

  it('formats v2 MCP entries with servers structure and disabled: false', () => {
    const entry = formatOpenCodeV2McpEntry({
      command: ['node', 'server.js'],
      disabled: false,
    });
    expect(entry).toEqual({
      type: 'local',
      command: ['node', 'server.js'],
      disabled: false,
    });
  });

  it('preserves unrelated keys and cleans up invalid mcpServers in v1', () => {
    const existing = {
      $schema: 'https://opencode.ai/config.json',
      theme: 'dark',
      agent: { custom: true },
      mcpServers: { old: { type: 'stdio' } },
      mcp: {
        existing: {
          type: 'local',
          command: ['existing-cmd'],
          enabled: true,
        },
      },
    };

    const formatted = formatOpenCodeConfig({
      dialect: 'v1',
      existingConfig: existing,
      mcpServers: {
        'new-tool': {
          command: 'npx',
          args: ['-y', 'tool'],
        },
      },
    });

    expect(formatted.$schema).toBe('https://opencode.ai/config.json');
    expect(formatted.theme).toBe('dark');
    expect(formatted.agent).toEqual({ custom: true });
    expect(formatted.mcpServers).toBeUndefined();
    expect((formatted.mcp as Record<string, unknown>).existing).toEqual({
      type: 'local',
      command: ['existing-cmd'],
      enabled: true,
    });
    expect((formatted.mcp as Record<string, unknown>)['new-tool']).toEqual({
      type: 'local',
      command: ['npx', '-y', 'tool'],
      enabled: true,
    });
  });

  it('reconciles files idempotently and creates timestamped backup on change', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-config-test-'));
    const configPath = path.join(tmpDir, 'opencode.json');

    const initial = {
      theme: 'light',
      mcp: {
        'old-server': {
          type: 'stdio',
          command: 'old.exe',
          args: [],
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(initial, null, 2), 'utf8');

    const firstRun = reconcileOpenCodeConfigFile(
      configPath,
      {
        'my-server': { command: 'node', args: ['run.js'] },
      },
      { backup: true, backupDir: path.join(tmpDir, 'backups') }
    );

    expect(firstRun.updated).toBe(true);
    expect(firstRun.backupPath).toBeDefined();
    expect(fs.existsSync(firstRun.backupPath!)).toBe(true);

    const secondRun = reconcileOpenCodeConfigFile(
      configPath,
      {
        'my-server': { command: 'node', args: ['run.js'] },
      },
      { backup: true, backupDir: path.join(tmpDir, 'backups') }
    );

    expect(secondRun.updated).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
