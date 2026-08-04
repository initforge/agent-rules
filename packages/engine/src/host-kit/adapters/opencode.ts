/**
 * Host-kit adapter for OpenCode platform.
 * Generates native OpenCode config/agent files.
 */

import type { HostKitAdapter, HostKitInput, HostKitConfig, GeneratedFile } from './types.js';
import { OPENCODE_MODEL_CATALOG } from './catalog.js';

export class OpenCodeAdapter implements HostKitAdapter {
  readonly platform = 'opencode' as const;
  readonly catalog = OPENCODE_MODEL_CATALOG;

  generateConfig(input: HostKitInput): HostKitConfig {
    const files: GeneratedFile[] = [{
      path: '.opencode/agents/agent-rules-host.md',
      content: this.generateAgent(input),
    }];

    return {
      platform: 'opencode',
      model: input.modelId,
      provider: input.provider,
      files,
    };
  }

  validateModelId(modelId: string): boolean {
    return this.catalog.validateModel(modelId);
  }

  validateProvider(provider: string): boolean {
    return this.catalog.validateProvider(provider);
  }

  private generateAgent(input: HostKitInput): string {
    const frontmatter = [
      '---',
      'description: Harness-managed OpenCode role; provider configuration remains user-owned.',
      'mode: subagent',
    ];
    if (input.provider && input.modelId) {
      frontmatter.push(`model: ${input.provider}/${input.modelId}`);
    }
    frontmatter.push('---', '');
    const prompt = input.prompt?.system?.trim() ||
      'Follow the active agent-rules role, ownership, evidence, and verification contracts.';
    return `${frontmatter.join('\n')}${prompt}\n`;
  }
}

export const opencodeAdapter = new OpenCodeAdapter();
