/**
 * Host-kit adapter for Codex platform.
 * Generates native Codex AGENTS.md + config files.
 */

import type { HostKitAdapter, HostKitInput, HostKitConfig, GeneratedFile } from './types.js';
import { CODEX_MODEL_CATALOG } from './catalog.js';

export class CodexAdapter implements HostKitAdapter {
  readonly platform = 'codex' as const;
  readonly catalog = CODEX_MODEL_CATALOG;

  generateConfig(input: HostKitInput): HostKitConfig {
    const files: GeneratedFile[] = [];
    const model = input.modelId || 'gpt-4o';

    files.push({
      path: 'AGENTS.md',
      content: this.generateAgentsMd(input, model),
    });

    if (input.prompt?.system) {
      files.push({
        path: '.codex/instructions.md',
        content: input.prompt.system,
      });
    }

    files.push({
      path: '.codex/config.toml',
      content: this.generateConfigToml(input, model),
    });

    return { platform: 'codex', model: model, files };
  }

  validateModelId(modelId: string): boolean {
    return this.catalog.validateModel(modelId);
  }

  validateProvider(provider: string): boolean {
    return this.catalog.validateProvider(provider);
  }

  private generateAgentsMd(input: HostKitInput, model: string): string {
    const lines: string[] = [
      '# AGENTS.md',
      '',
      '## Model',
      '',
      model,
      '',
      '## Instructions',
      '',
    ];

    if (input.prompt?.system) {
      lines.push(input.prompt.system);
    } else {
      lines.push('No additional instructions provided.');
    }

    return lines.join('\n');
  }

  private generateConfigToml(input: HostKitInput, model: string): string {
    return [
      `[model]`,
      `name = "${model}"`,
      '',
      `[provider]`,
    ].concat(input.provider ? [`name = "${input.provider}"`] : ['name = "openai"'])
      .join('\n');
  }
}

export const codexAdapter = new CodexAdapter();