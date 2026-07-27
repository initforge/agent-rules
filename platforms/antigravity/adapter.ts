export interface PlatformAdapter {
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;
  render(context: unknown): Promise<string>;
  stage(context: unknown): Promise<string>;
  activate(): Promise<{ ok: boolean }>;
  probe(): Promise<{ ok: boolean; detail: string }>;
  update(): Promise<{ ok: boolean }>;
  uninstall(): Promise<{ ok: boolean }>;
  rollback(version: string): Promise<{ ok: boolean }>;
}

const NOT_INSTALLED_NOT_REQUIRED = 'NOT_INSTALLED_NOT_REQUIRED';

export const antigravityAdapter: PlatformAdapter = {
  async detect() {
    return { installed: false };
  },

  async render(_context: unknown): Promise<string> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },

  async stage(_context: unknown): Promise<string> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },

  async activate(): Promise<{ ok: boolean }> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },

  async probe(): Promise<{ ok: boolean; detail: string }> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },

  async update(): Promise<{ ok: boolean }> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },

  async uninstall(): Promise<{ ok: boolean }> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },

  async rollback(_version: string): Promise<{ ok: boolean }> {
    throw new Error(NOT_INSTALLED_NOT_REQUIRED);
  },
};
