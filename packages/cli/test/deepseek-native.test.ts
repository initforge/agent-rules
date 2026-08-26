import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverDshProfiles, inspectDshNativeDump } from '../src/services/deepseek-native.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('DeepSeek Harness native projection', () => {
  it('discovers valid profiles without hard-coding web/headless', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-'));
    roots.push(home);
    fs.mkdirSync(path.join(home, 'profiles', 'custom'), { recursive: true });
    fs.writeFileSync(path.join(home, 'profiles', 'custom', 'package.json'), '{}\n');
    fs.mkdirSync(path.join(home, 'profiles', 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(home, 'profiles', 'ignored'), { recursive: true });
    expect(discoverDshProfiles(home)).toEqual(['custom']);
  });

  it('accepts final Cordis rows only when instructions, skills and MCP clients are active', () => {
    const rows = [
      '- id: agent-instructions\n  name: instructions',
      '- id: skill\n  name: skill',
      '- id: skill-filesystem\n  name: skill-filesystem',
      '- id: tool-skill\n  name: tool-skill',
      ...['one', 'two'].map((name) => [
        `- id: agent-rules-dsh-mcp-${name}`,
        '  name: "@deepseek-ai/dsh-mcp-client"',
        '  config:',
        `    serverName: "${name}"`,
        '    transport: "stdio"',
        '    command: "node"',
        '    args: []',
      ].join('\n')),
    ].join('\n');
    expect(inspectDshNativeDump(rows, ['one', 'two'])).toEqual({
      instructionEnabled: true,
      skillsEnabled: true,
      mcpServerNames: ['one', 'two'],
      mcpRowsValid: true,
    });
    expect(inspectDshNativeDump(rows.replace('  disabled: true', ''), ['one', 'missing']).mcpRowsValid).toBe(false);
  });
});
