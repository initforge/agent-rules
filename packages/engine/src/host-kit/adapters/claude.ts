/**
 * Host-kit adapter for Claude (Anthropic) platform.
 * Generates native Claude config/agent files.
 */

import type { HostKitAdapter, HostKitInput, HostKitConfig, GeneratedFile } from './types.js';
import { CLAUDE_MODEL_CATALOG } from './catalog.js';

export class ClaudeAdapter implements HostKitAdapter {
  readonly platform = 'claude' as const;
  readonly catalog = CLAUDE_MODEL_CATALOG;

  generateConfig(input: HostKitInput): HostKitConfig {
    const files: GeneratedFile[] = [];
    const model = input.modelId || 'claude-sonnet-4-20250514';

    files.push({
      path: '.claude/clause.json',
      content: this.generateConfigJson(input, model),
    });

    files.push({
      path: '.claude/agent.md',
      content: this.generateAgent(input, model),
    });

    return { platform: 'claude', model: model, files };
  }

  validateModelId(modelId: string): boolean {
    return this.catalog.validateModel(modelId);
  }

  validateProvider(provider: string): boolean {
    return this.catalog.validateProvider(provider);
  }

  private generateConfigJson(input: HostKitInput, model: string): string {
    const config: Record<string, unknown> = {
      model: model,
      options: {
        max_tokens: 8192,
        temperature: 0.7,
      },
      mcpServers: {},
    };

    return JSON.stringify(config, null, 2);
  }

  private generateAgent(input: HostKitInput, model: string): string {
    const lines: string[] = [
      '---',
      `model: ${model}`,
      '---',
    ];

    if (input.prompt?.system) {
      lines.push('', input.prompt.system);
    }

    if (input.prompt?.user) {
      lines.push('', input.prompt.user);
    }

    return lines.join('\n');
  }
}

export const claudeAdapter = new ClaudeAdapter();