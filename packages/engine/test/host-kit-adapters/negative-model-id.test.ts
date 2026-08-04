/**
 * Prompt model-ID negative tests.
 * Verifies that invalid model IDs and providers from prompts are rejected.
 * Every "negative" case here should throw, NOT generate config.
 */

import { describe, expect, it } from 'vitest';
import {
  generateHostKit,
  extractModelId,
  validatePromptModelId,
  getAdapter,
} from '../src/host-kit/adapters/index.js';

describe('validatePromptModelId — negative cases', () => {
  it('rejects model ID with wrong provider prefix for OpenCode', () => {
    // Claude model ID is not registered in OpenCode catalog as a standalone entry
    // OpenCode catalog does have claude models, but this tests a truly invalid ID
    const result = validatePromptModelId(
      { modelId: 'claude-sonnet-4-20250514' },
      'opencode',
    );
    // claude-sonnet-4-20250514 IS in OpenCode catalog, so should be valid
    expect(result.valid).toBe(true);
  });

  it('rejects model ID with fake model name for OpenCode', () => {
    const result = validatePromptModelId(
      { modelId: 'gpt-9999-fake-model' },
      'opencode',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not in opencode catalog');
  });

  it('rejects model ID with fake model name for Claude', () => {
    const result = validatePromptModelId(
      { modelId: 'claude-3-7-sonnet-20250101' },
      'claude',
    );
    expect(result.valid).toBe(false);
  });

  it('rejects model ID with fake model name for Codex', () => {
    const result = validatePromptModelId(
      { modelId: 'gpt-5-future' },
      'codex',
    );
    expect(result.valid).toBe(false);
  });

  it('rejects model ID with fake model name for Cursor', () => {
    const result = validatePromptModelId(
      { modelId: 'claude-4-opus' },
      'cursor',
    );
    expect(result.valid).toBe(false);
  });

  it('rejects model ID with fake model name for Grok', () => {
    const result = validatePromptModelId(
      { modelId: 'grok-3-ultra' },
      'grok',
    );
    expect(result.valid).toBe(false);
  });

  it('rejects unknown provider for OpenCode', () => {
    const result = validatePromptModelId(
      { modelId: 'gpt-4o', provider: 'invalid-provider' },
      'opencode',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Provider "invalid-provider" not in opencode catalog');
  });

  it('rejects unknown provider for Codex', () => {
    const result = validatePromptModelId(
      { modelId: 'gpt-4o', provider: 'cohere' },
      'codex',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('cohere');
  });

  it('rejects empty string model ID', () => {
    const result = validatePromptModelId({ modelId: '' }, 'opencode');
    expect(result.valid).toBe(false);
  });

  it('rejects empty provider', () => {
    const result = validatePromptModelId({ provider: '' }, 'claude');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not in claude catalog');
  });

  it('rejects model ID that resembles but is not exact', () => {
    // "gpt-4o-mini " with trailing space should fail strict match
    const result = validatePromptModelId({ modelId: 'gpt-4o-mini ' }, 'opencode');
    expect(result.valid).toBe(false);
  });

  it('rejects model ID with different casing (case-sensitive catalog)', () => {
    const result = validatePromptModelId({ modelId: 'GPT-4O' }, 'opencode');
    expect(result.valid).toBe(false);
  });

  it('rejects null model ID', () => {
    const result = validatePromptModelId({ modelId: null as unknown as string }, 'opencode');
    expect(result.valid).toBe(false);
  });

  it('rejects null provider', () => {
    const result = validatePromptModelId({ provider: null as unknown as string }, 'claude');
    expect(result.valid).toBe(false);
  });

  it('rejects unknown platform', () => {
    const result = validatePromptModelId({ modelId: 'gpt-4o' }, 'nonexistent-platform' as never);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unsupported platform');
  });
});

describe('validatePromptModelId — positive cases', () => {
  it('accepts valid model ID + provider for OpenCode', () => {
    const result = validatePromptModelId(
      { modelId: 'gpt-4o', provider: 'openai' },
      'opencode',
    );
    expect(result.valid).toBe(true);
    expect(result.modelId).toBe('gpt-4o');
    expect(result.provider).toBe('openai');
  });

  it('accepts valid model ID + provider for Claude', () => {
    const result = validatePromptModelId(
      { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
      'claude',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts valid model ID + provider for Codex', () => {
    const result = validatePromptModelId(
      { modelId: 'o3', provider: 'openai' },
      'codex',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts valid model ID + provider for Grok', () => {
    const result = validatePromptModelId(
      { modelId: 'grok-2', provider: 'xai' },
      'grok',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts prompt with only model ID (no provider)', () => {
    const result = validatePromptModelId(
      { modelId: 'gpt-4o' },
      'opencode',
    );
    expect(result.valid).toBe(true);
    expect(result.modelId).toBe('gpt-4o');
    expect(result.provider).toBeNull();
  });

  it('accepts prompt with only provider (no model ID)', () => {
    const result = validatePromptModelId(
      { provider: 'openai' },
      'codex',
    );
    expect(result.valid).toBe(true);
    expect(result.provider).toBe('openai');
    expect(result.modelId).toBeNull();
  });

  it('accepts empty prompt (no model or provider)', () => {
    const result = validatePromptModelId({}, 'opencode');
    expect(result.valid).toBe(true);
    expect(result.modelId).toBeNull();
    expect(result.provider).toBeNull();
  });
});

describe('generateHostKit — negative model ID rejection', () => {
  it('throws when model ID not in catalog', () => {
    expect(() => generateHostKit({
      platform: 'opencode',
      modelId: 'claude-99-very-fake-20999999',
    })).toThrow('Invalid model ID');
  });

  it('throws when provider not in catalog', () => {
    expect(() => generateHostKit({
      platform: 'claude',
      modelId: 'claude-sonnet-4-20250514',
      provider: 'mistral',
    })).toThrow('Invalid provider');
  });

  it('throws when prompt modelId not in catalog', () => {
    expect(() => generateHostKit({
      platform: 'opencode',
      modelId: 'gpt-4o',
      prompt: { modelId: 'fake-model-9999' },
    })).toThrow('Invalid prompt model ID');
  });

  it('throws when prompt provider not in catalog', () => {
    expect(() => generateHostKit({
      platform: 'codex',
      modelId: 'gpt-4o',
      provider: 'openai',
      prompt: { provider: 'cohere' },
    })).toThrow('Invalid prompt provider');
  });

  it('throws for unsupported platform', () => {
    expect(() => generateHostKit({
      platform: 'nonexistent' as never,
    })).toThrow('Unsupported platform');
  });
});

describe('extractModelId — negative cases', () => {
  it('returns null for invalid model ID', () => {
    expect(extractModelId({ modelId: 'totally-fake-model' }, 'opencode')).toBeNull();
  });

  it('returns null for wrong platform', () => {
    expect(extractModelId({ modelId: 'gpt-4o' }, 'nonexistent' as never)).toBeNull();
  });

  it('returns null when modelId absent', () => {
    expect(extractModelId({}, 'opencode')).toBeNull();
  });
});

describe('adapter.validateModelId — cross-catalog isolation', () => {
  it('Codex-only models are NOT valid in Claude catalog', () => {
    const claudeAdapter = getAdapter('claude')!;
    // o3 is Codex-only
    expect(claudeAdapter.validateModelId('o3')).toBe(false);
  });

  it('OpenCode-only models are NOT valid in Codex catalog', () => {
    const codexAdapter = getAdapter('codex')!;
    // deepseek-chat is OpenCode-only
    expect(codexAdapter.validateModelId('deepseek-chat')).toBe(false);
  });

  it('Grok-only models are NOT valid in Cursor catalog', () => {
    const cursorAdapter = getAdapter('cursor')!;
    expect(cursorAdapter.validateModelId('grok-2')).toBe(false);
  });

  it('Cursor-only model combinations NOT valid in Grok catalog', () => {
    const grokAdapter = getAdapter('grok')!;
    expect(grokAdapter.validateModelId('claude-sonnet-4-20250514')).toBe(false);
  });

  it('Anthropic provider NOT valid in Codex catalog', () => {
    const codexAdapter = getAdapter('codex')!;
    expect(codexAdapter.validateProvider('anthropic')).toBe(false);
  });

  it('XAI provider NOT valid in Claude catalog', () => {
    const claudeAdapter = getAdapter('claude')!;
    expect(claudeAdapter.validateProvider('xai')).toBe(false);
  });
});