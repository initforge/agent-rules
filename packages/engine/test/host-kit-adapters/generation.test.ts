/**
 * Tests for host-kit adapter file generation.
 * Verifies native config/agent file generation per platform.
 */

import { describe, expect, it } from 'vitest';
import {
  generateHostKit,
  getAdapter,
  listPlatforms,
  getCatalog,
  OPENCODE_MODEL_CATALOG,
  CLAUDE_MODEL_CATALOG,
  CODEX_MODEL_CATALOG,
} from '../../src/host-kit/adapters/index.js';

describe('generateHostKit', () => {
  it('generates an OpenCode agent without owning user provider config', () => {
    const result = generateHostKit({
      platform: 'opencode',
      modelId: 'gpt-4o',
    });

    expect(result.platform).toBe('opencode');
    expect(result.model).toBe('gpt-4o');
    expect(result.files.map(f => f.path)).toContain('.opencode/agents/agent-rules-host.md');
    expect(result.files.map(f => f.path)).not.toContain('opencode.json');
    expect(result.files.map(f => f.path)).not.toContain('.opencode/config.json');
    expect(result.files.map(f => f.content).join('\n')).not.toContain('enabled_providers');
  });

  it('generates Claude config and agent files', () => {
    const result = generateHostKit({
      platform: 'claude',
      modelId: 'claude-sonnet-4-20250514',
    });

    expect(result.platform).toBe('claude');
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.files.map(f => f.path)).toContain('.claude/clause.json');
    expect(result.files.map(f => f.path)).toContain('.claude/agent.md');
  });

  it('generates Codex AGENTS.md and config files', () => {
    const result = generateHostKit({
      platform: 'codex',
      modelId: 'gpt-4o',
    });

    expect(result.platform).toBe('codex');
    expect(result.model).toBe('gpt-4o');
    expect(result.files.map(f => f.path)).toContain('AGENTS.md');
    expect(result.files.map(f => f.path)).toContain('.codex/config.toml');
  });

  it('generates Cursor config files', () => {
    const result = generateHostKit({
      platform: 'cursor',
      modelId: 'claude-sonnet-4-20250514',
    });

    expect(result.platform).toBe('cursor');
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.files.map(f => f.path)).toContain('.cursor/config.json');
  });

  it('generates Grok config files', () => {
    const result = generateHostKit({
      platform: 'grok',
      modelId: 'grok-2',
    });

    expect(result.platform).toBe('grok');
    expect(result.model).toBe('grok-2');
    expect(result.files.map(f => f.path)).toContain('.grok/config.json');
  });

  it('includes prompt system message in Claude agent.md', () => {
    const systemPrompt = 'You are a helpful assistant.';
    const result = generateHostKit({
      platform: 'claude',
      modelId: 'claude-sonnet-4-20250514',
      prompt: { system: systemPrompt },
    });

    const agentFile = result.files.find(f => f.path === '.claude/agent.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain(systemPrompt);
  });

  it('includes prompt system message in Codex AGENTS.md', () => {
    const systemPrompt = 'You are a code review assistant.';
    const result = generateHostKit({
      platform: 'codex',
      modelId: 'gpt-4o',
      prompt: { system: systemPrompt },
    });

    const agentsFile = result.files.find(f => f.path === 'AGENTS.md');
    expect(agentsFile).toBeDefined();
    expect(agentsFile!.content).toContain(systemPrompt);
  });

  it('uses provider/model only in agent frontmatter', () => {
    const result = generateHostKit({
      platform: 'opencode',
      modelId: 'gpt-4o',
      provider: 'openai',
    });

    const agentFile = result.files.find(f => f.path === '.opencode/agents/agent-rules-host.md');
    expect(agentFile?.content).toContain('model: openai/gpt-4o');
    expect(result.provider).toBe('openai');
  });

  it('inherits the user model when OpenCode model is unspecified', () => {
    const result = generateHostKit({ platform: 'opencode' });
    expect(result.model).toBeUndefined();
    expect(result.files[0].content).not.toContain('\nmodel:');

    const result2 = generateHostKit({ platform: 'claude' });
    expect(result2.model).toBe('claude-sonnet-4-20250514');

    const result3 = generateHostKit({ platform: 'codex' });
    expect(result3.model).toBe('gpt-4o');

    const result4 = generateHostKit({ platform: 'cursor' });
    expect(result4.model).toBe('gpt-4o');

    const result5 = generateHostKit({ platform: 'grok' });
    expect(result5.model).toBe('grok-2');
  });
});

describe('getAdapter', () => {
  it('returns correct adapter for known platforms', () => {
    const openCodeAdapter = getAdapter('opencode');
    expect(openCodeAdapter).toBeDefined();
    expect(openCodeAdapter!.platform).toBe('opencode');

    const claudeAdapter = getAdapter('claude');
    expect(claudeAdapter).toBeDefined();
    expect(claudeAdapter!.platform).toBe('claude');

    const codexAdapter = getAdapter('codex');
    expect(codexAdapter).toBeDefined();
    expect(codexAdapter!.platform).toBe('codex');
  });

  it('returns null for unknown platform', () => {
    expect(getAdapter('unknown' as never)).toBeNull();
  });
});

describe('listPlatforms', () => {
  it('lists all supported platforms', () => {
    const platforms = listPlatforms();
    expect(platforms).toContain('opencode');
    expect(platforms).toContain('claude');
    expect(platforms).toContain('codex');
    expect(platforms).toContain('cursor');
    expect(platforms).toContain('grok');
  });
});

describe('getCatalog', () => {
  it('returns correct catalog for each platform', () => {
    expect(getCatalog('opencode')).toBe(OPENCODE_MODEL_CATALOG);
    expect(getCatalog('claude')).toBe(CLAUDE_MODEL_CATALOG);
    expect(getCatalog('codex')).toBe(CODEX_MODEL_CATALOG);
  });

  it('returns null for unknown platform', () => {
    expect(getCatalog('unknown' as never)).toBeNull();
  });
});
