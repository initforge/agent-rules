/**
 * Host-kit adapter types for platform-specific config/agent file generation.
 * Each adapter owns its catalog of valid models/providers.
 */

export type HostPlatform = 'opencode' | 'claude' | 'codex' | 'cursor' | 'grok';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface HostKitConfig {
  platform: HostPlatform;
  model?: string;
  provider?: string;
  files: GeneratedFile[];
}

export interface HostKitAdapter {
  readonly platform: HostPlatform;
  readonly catalog: ModelCatalog;
  generateConfig(input: HostKitInput): HostKitConfig;
  validateModelId(modelId: string): boolean;
  validateProvider(provider: string): boolean;
}

export interface HostKitInput {
  platform: HostPlatform;
  modelId?: string;
  provider?: string;
  prompt?: PromptRequest;
  basePath?: string;
}

export interface PromptRequest {
  system?: string;
  user?: string;
  modelId?: string;
  provider?: string;
  custom?: Record<string, unknown>;
}

export interface ModelCatalog {
  providers: ProviderCatalog;
  validateModel(modelId: string): boolean;
  validateProvider(provider: string): boolean;
  listModels(): string[];
  listProviders(): string[];
}

export interface ProviderCatalog {
  [provider: string]: string[];
}