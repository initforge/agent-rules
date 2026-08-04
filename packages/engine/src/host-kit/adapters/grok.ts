/**
 * Host-kit adapter for Grok platform.
 * Generates native Grok config files.
 */

import type { HostKitAdapter, HostKitInput, HostKitConfig, GeneratedFile } from './types.js';
import { GROK_MODEL_CATALOG } from './catalog.js';

export class GrokAdapter implements HostKitAdapter {
  readonly platform = 'grok' as const;
  readonly catalog = GROK_MODEL_CATALOG;

  generateConfig(input: HostKitInput): HostKitConfig {
    const files: GeneratedFile[] = [];
    const model = input.modelId || 'grok-2';

    files.push({
      path: '.grok/config.json',
      content: this.generateConfigJson(input, model),
    });

    return { platform: 'grok', model: model, files };
  }

  validateModelId(modelId: string): boolean {
    return this.catalog.validateModel(modelId);
  }

  validateProvider(provider: string): boolean {
    return this.catalog.validateProvider(provider);
  }

  private generateConfigJson(input: HostKitInput, model: string): string {
    const config: Record<string, unknown> = {
      version: 1,
      model: model,
      provider: input.provider || 'xai',
    };

    return JSON.stringify(config, null, 2);
  }
}

export const grokAdapter = new GrokAdapter();