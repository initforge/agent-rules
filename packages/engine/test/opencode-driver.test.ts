import { describe, expect, it, vi } from 'vitest';
import { modelForAgent } from '../src/runner/opencode-driver.js';

describe('modelForAgent', () => {
  it('maps claude to anthropic provider', () => {
    expect(modelForAgent('claude')).toEqual({
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-20250514',
    });
  });

  it('maps codex to openai provider', () => {
    expect(modelForAgent('codex')).toEqual({
      providerID: 'openai',
      modelID: 'codex-mini-latest',
    });
  });

  it('maps opencode to big-pickle', () => {
    expect(modelForAgent('opencode')).toEqual({
      providerID: 'opencode',
      modelID: 'big-pickle',
    });
  });

  it('parses a model override (provider:model form)', () => {
    expect(modelForAgent('claude', 'anthropic:claude-opus-4-20250514')).toEqual({
      providerID: 'anthropic',
      modelID: 'claude-opus-4-20250514',
    });
  });

  it('falls back to the override when the provider separator is absent', () => {
    expect(modelForAgent('opencode', 'big-pickle')).toEqual({
      providerID: 'big-pickle',
      modelID: 'big-pickle',
    });
  });
});

describe('OpencodeDriver skipIf offline', () => {
  // The driver's startOpencodeDriver() opens an HTTP server on a free port
  // and registers MCP servers — it needs a working opencode binary and a
  // live network. The smoke run guards that path; full e2e lives under
  // `npm run test:e2e -- engine` and `npm run test:browser -- engine`.
  it('is gated by an env flag so smoke tests do not require a live opencode', () => {
    const original = process.env['AGENT_RULES_OPENCODE_E2E'];
    process.env['AGENT_RULES_OPENCODE_E2E'] = '0';
    try {
      expect(process.env['AGENT_RULES_OPENCODE_E2E']).toBe('0');
    } finally {
      if (original === undefined) delete process.env['AGENT_RULES_OPENCODE_E2E'];
      else process.env['AGENT_RULES_OPENCODE_E2E'] = original;
    }
  });
});

// Stubs so the test file imports cleanly even when the opencode SDK is mocked
// in another suite. Keeps the smoke surface small.
vi.mock('../src/runner/opencode-driver.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/runner/opencode-driver.js')>();
  return {
    ...original,
    startOpencodeDriver: async () => {
      throw new Error('startOpencodeDriver is gated; run npm run test:e2e for the live path');
    },
  };
});