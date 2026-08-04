/**
 * Tests for host-kit adapter catalog validation.
 * Verifies adapter-owned model/provider catalogs.
 */

import { describe, expect, it } from 'vitest';
import {
  OPENCODE_MODEL_CATALOG,
  CLAUDE_MODEL_CATALOG,
  CODEX_MODEL_CATALOG,
  CURSOR_MODEL_CATALOG,
  GROK_MODEL_CATALOG,
  catalogFor,
} from '../src/host-kit/adapters/catalog.js';

describe('OpenCode model catalog', () => {
  it('validates known OpenCode models', () => {
    expect(OPENCODE_MODEL_CATALOG.validateModel('gpt-4o')).toBe(true);
    expect(OPENCODE_MODEL_CATALOG.validateModel('claude-sonnet-4-20250514')).toBe(true);
    expect(OPENCODE_MODEL_CATALOG.validateModel('gemini-2.5-pro-preview-06-05')).toBe(true);
  });

  it('rejects unknown OpenCode models', () => {
    expect(OPENCODE_MODEL_CATALOG.validateModel('unknown-model')).toBe(false);
    expect(OPENCODE_MODEL_CATALOG.validateModel('invalid')).toBe(false);
  });

  it('lists providers correctly', () => {
    const providers = OPENCODE_MODEL_CATALOG.listProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('google');
  });

  it('lists models correctly', () => {
    const models = OPENCODE_MODEL_CATALOG.listModels();
    expect(models).toContain('gpt-4o');
    expect(models).toContain('claude-sonnet-4-20250514');
    expect(models.length).toBeGreaterThan(0);
  });

  it('validates providers', () => {
    expect(OPENCODE_MODEL_CATALOG.validateProvider('openai')).toBe(true);
    expect(OPENCODE_MODEL_CATALOG.validateProvider('anthropic')).toBe(true);
    expect(OPENCODE_MODEL_CATALOG.validateProvider('unknown')).toBe(false);
  });
});

describe('Claude model catalog', () => {
  it('validates known Claude models', () => {
    expect(CLAUDE_MODEL_CATALOG.validateModel('claude-sonnet-4-20250514')).toBe(true);
    expect(CLAUDE_MODEL_CATALOG.validateModel('claude-3-5-sonnet-20241022')).toBe(true);
  });

  it('has provider anthropic primary', () => {
    expect(CLAUDE_MODEL_CATALOG.validateProvider('anthropic')).toBe(true);
    expect(CLAUDE_MODEL_CATALOG.validateProvider('anthropic')).toBe(true);
  });
});

describe('Codex model catalog', () => {
  it('validates o-series models', () => {
    expect(CODEX_MODEL_CATALOG.validateModel('o3')).toBe(true);
    expect(CODEX_MODEL_CATALOG.validateModel('o3-mini')).toBe(true);
    expect(CODEX_MODEL_CATALOG.validateModel('o4-mini')).toBe(true);
    expect(CODEX_MODEL_CATALOG.validateModel('o1')).toBe(true);
  });

  it('validates azure provider', () => {
    expect(CODEX_MODEL_CATALOG.validateProvider('azure')).toBe(true);
  });
});

describe('Cursor model catalog', () => {
  it('validates Cursor-specific models', () => {
    expect(CURSOR_MODEL_CATALOG.validateModel('gpt-4o')).toBe(true);
    expect(CURSOR_MODEL_CATALOG.validateModel('claude-sonnet-4-20250514')).toBe(true);
  });
});

describe('Grok model catalog', () => {
  it('validates Grok models', () => {
    expect(GROK_MODEL_CATALOG.validateModel('grok-2')).toBe(true);
    expect(GROK_MODEL_CATALOG.validateModel('grok-2-mini')).toBe(true);
    expect(GROK_MODEL_CATALOG.validateModel('grok-1')).toBe(true);
  });

  it('validates xai provider', () => {
    expect(GROK_MODEL_CATALOG.validateProvider('xai')).toBe(true);
  });
});

describe('catalogFor', () => {
  it('returns correct catalog for known platforms', () => {
    expect(catalogFor('opencode')).toBe(OPENCODE_MODEL_CATALOG);
    expect(catalogFor('claude')).toBe(CLAUDE_MODEL_CATALOG);
    expect(catalogFor('codex')).toBe(CODEX_MODEL_CATALOG);
    expect(catalogFor('cursor')).toBe(CURSOR_MODEL_CATALOG);
    expect(catalogFor('grok')).toBe(GROK_MODEL_CATALOG);
  });

  it('returns null for unknown platform', () => {
    expect(catalogFor('unknown')).toBeNull();
  });
});

describe('Model catalog edge cases', () => {
  it('rejects empty model ID', () => {
    expect(OPENCODE_MODEL_CATALOG.validateModel('')).toBe(false);
    expect(OPENCODE_MODEL_CATALOG.validateModel(null)).toBe(false);
    expect(OPENCODE_MODEL_CATALOG.validateModel(undefined)).toBe(false);
  });

  it('rejects empty provider', () => {
    expect(OPENCODE_MODEL_CATALOG.validateProvider('')).toBe(false);
    expect(OPENCODE_MODEL_CATALOG.validateProvider(null)).toBe(false);
    expect(OPENCODE_MODEL_CATALOG.validateProvider(undefined)).toBe(false);
  });
});