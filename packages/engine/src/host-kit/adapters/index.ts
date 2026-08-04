/**
 * Host-kit adapter registry and generation entry point.
 * Routes generation requests to the correct platform adapter and validates
 * model IDs against the adapter-owned catalog.
 */

import type { HostPlatform, HostKitAdapter, HostKitInput, HostKitConfig, PromptRequest, ModelCatalog, GeneratedFile, ProviderCatalog } from './types.js';
import { OpenCodeAdapter, opencodeAdapter } from './opencode.js';
import { ClaudeAdapter, claudeAdapter } from './claude.js';
import { CodexAdapter, codexAdapter } from './codex.js';
import { CursorAdapter, cursorAdapter } from './cursor.js';
import { GrokAdapter, grokAdapter } from './grok.js';

const ADAPTERS: Record<HostPlatform, HostKitAdapter> = {
  opencode: opencodeAdapter,
  claude: claudeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  grok: grokAdapter,
};

export function getAdapter(platform: HostPlatform): HostKitAdapter | null {
  return ADAPTERS[platform] ?? null;
}

export function listPlatforms(): HostPlatform[] {
  return Object.keys(ADAPTERS) as HostPlatform[];
}

/**
 * Generate platform-specific config/agent files for the given platform.
 * Validates modelId and provider against the adapter-owned catalog.
 * Throws if modelId or provider is not in the catalog (negative validation).
 */
export function generateHostKit(input: HostKitInput): HostKitConfig {
  const adapter = ADAPTERS[input.platform];
  if (!adapter) {
    throw new Error(`Unsupported platform: ${input.platform}`);
  }

  if (input.modelId && !adapter.validateModelId(input.modelId)) {
    throw new Error(
      `Invalid model ID "${input.modelId}" for platform "${input.platform}" — not in adapter catalog. ` +
      `Catalog providers: ${adapter.catalog.listProviders().join(', ')}`
    );
  }

  if (input.provider && !adapter.validateProvider(input.provider)) {
    throw new Error(
      `Invalid provider "${input.provider}" for platform "${input.platform}" — not in adapter catalog. ` +
      `Catalog providers: ${adapter.catalog.listProviders().join(', ')}`
    );
  }

  if (input.prompt?.modelId && !adapter.validateModelId(input.prompt.modelId)) {
    throw new Error(
      `Invalid prompt model ID "${input.prompt.modelId}" for platform "${input.platform}" — rejected by catalog.`
    );
  }

  if (input.prompt?.provider && !adapter.validateProvider(input.prompt.provider)) {
    throw new Error(
      `Invalid prompt provider "${input.prompt.provider}" for platform "${input.platform}" — rejected by catalog.`
    );
  }

  return adapter.generateConfig(input);
}

/**
 * Extract model ID from a prompt. Prompts may specify modelId directly.
 * Returns the first valid model ID found, or null.
 */
export function extractModelId(prompt: PromptRequest, platform: HostPlatform): string | null {
  const adapter = ADAPTERS[platform];
  if (!adapter) return null;

  if (prompt.modelId && adapter.validateModelId(prompt.modelId)) {
    return prompt.modelId;
  }

  return null;
}

/**
 * Validate that a prompt's model ID and provider are supported on the target platform.
 * Negative tests use this function to verify invalid IDs are rejected.
 */
export function validatePromptModelId(prompt: PromptRequest, platform: HostPlatform): { valid: boolean; modelId: string | null; provider: string | null; reason?: string } {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    return { valid: false, modelId: null, provider: null, reason: `Unsupported platform: ${platform}` };
  }

  const modelId = prompt.modelId ?? null;
  const provider = prompt.provider ?? null;

  // Check for empty strings explicitly—empty string is a given but invalid value
  if (modelId === '' || (modelId !== null && !adapter.validateModelId(modelId))) {
    return { valid: false, modelId, provider, reason: `Model ID "${modelId}" not in ${platform} catalog` };
  }

  if (provider === '' || (provider !== null && !adapter.validateProvider(provider))) {
    return { valid: false, modelId, provider, reason: `Provider "${provider}" not in ${platform} catalog` };
  }

  return { valid: true, modelId, provider };
}

/**
 * Get the adapter-owned model catalog for a platform.
 */
export function getCatalog(platform: HostPlatform): ModelCatalog | null {
  const adapter = ADAPTERS[platform];
  return adapter ? adapter.catalog : null;
}

export {
  OpenCodeAdapter,
  ClaudeAdapter,
  CodexAdapter,
  CursorAdapter,
  GrokAdapter,
  opencodeAdapter,
  claudeAdapter,
  codexAdapter,
  cursorAdapter,
  grokAdapter,
};

export type {
  HostPlatform,
  HostKitAdapter,
  HostKitInput,
  HostKitConfig,
  PromptRequest,
  GeneratedFile,
  ModelCatalog,
  ProviderCatalog,
};
