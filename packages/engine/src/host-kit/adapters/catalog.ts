/**
 * Adapter-owned model catalog: provider → model-id[] mapping.
 * Each platform adapter owns its own catalog; cross-adapter no shared state.
 * Catalog entries are deliberately minimal (canonical known model IDs only).
 * ponytail: validation is case-sensitive strict match against catalog.
 */

import type { ModelCatalog, ProviderCatalog } from './types.js';

const OPENCODE_CATALOG: ProviderCatalog = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  google: ['gemini-2.5-pro-preview-06-05', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  meta: ['llama-3.3-70b-instruct', 'llama-3.1-8b-instruct'],
};

const CLAUDE_CATALOG: ProviderCatalog = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4'],
  google: ['gemini-2.5-pro-preview-06-05', 'gemini-2.0-flash', 'gemini-1.5-pro'],
};

const CODEX_CATALOG: ProviderCatalog = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'o3', 'o3-mini', 'o4-mini', 'o1', 'o1-mini'],
  azure: ['gpt-4o', 'gpt-4-turbo'],
};

const CURSOR_CATALOG: ProviderCatalog = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro'],
};

const GROK_CATALOG: ProviderCatalog = {
  xai: ['grok-2', 'grok-2-mini', 'grok-1', 'grok-1.5'],
};

function makeCatalog(providerMap: ProviderCatalog): ModelCatalog {
  return {
    providers: providerMap,
    validateModel(modelId: string): boolean {
      if (!modelId || typeof modelId !== 'string') return false;
      for (const models of Object.values(this.providers)) {
        if (models.includes(modelId)) return true;
      }
      return false;
    },
    validateProvider(provider: string): boolean {
      if (!provider || typeof provider !== 'string') return false;
      return Object.prototype.hasOwnProperty.call(this.providers, provider);
    },
    listModels(): string[] {
      return [...new Set(Object.values(this.providers).flat())];
    },
    listProviders(): string[] {
      return Object.keys(this.providers);
    },
  };
}

export const OPENCODE_MODEL_CATALOG: ModelCatalog = makeCatalog(OPENCODE_CATALOG);
export const CLAUDE_MODEL_CATALOG: ModelCatalog = makeCatalog(CLAUDE_CATALOG);
export const CODEX_MODEL_CATALOG: ModelCatalog = makeCatalog(CODEX_CATALOG);
export const CURSOR_MODEL_CATALOG: ModelCatalog = makeCatalog(CURSOR_CATALOG);
export const GROK_MODEL_CATALOG: ModelCatalog = makeCatalog(GROK_CATALOG);

export function catalogFor(platform: string): ModelCatalog | null {
  switch (platform) {
    case 'opencode': return OPENCODE_MODEL_CATALOG;
    case 'claude': return CLAUDE_MODEL_CATALOG;
    case 'codex': return CODEX_MODEL_CATALOG;
    case 'cursor': return CURSOR_MODEL_CATALOG;
    case 'grok': return GROK_MODEL_CATALOG;
    default: return null;
  }
}