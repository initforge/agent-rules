/**
 * Host-kit adapter for Cursor platform.
 * Generates native Cursor config files.
 */

import type { HostKitAdapter, HostKitInput, HostKitConfig, GeneratedFile } from './types.js';
import { CURSOR_MODEL_CATALOG } from './catalog.js';

export class CursorAdapter implements HostKitAdapter {
  readonly platform = 'cursor' as const;
  readonly catalog = CURSOR_MODEL_CATALOG;

  generateConfig(input: HostKitInput): HostKitConfig {
    const files: GeneratedFile[] = [];
    const model = input.modelId || 'gpt-4o';

    files.push({
      path: '.cursor/config.json',
      content: this.generateConfigJson(input, model),
    });

    return { platform: 'cursor', model: model, files };
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
      llm: { model },
      contextEngineering: { mode: 'auto' },
    };

    return JSON.stringify(config, null, 2);
  }
}

export const cursorAdapter = new CursorAdapter();