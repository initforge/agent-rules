import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getMediaConfig defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to cloudinary when VITE_MEDIA_PROVIDER is unset', async () => {
    vi.stubEnv('VITE_MEDIA_PROVIDER', '');
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
    vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', 'unsigned');
    const { getMediaConfig } = await import('./config');
    expect(getMediaConfig().provider).toBe('cloudinary');
  });

  it('allows local opt-out via VITE_MEDIA_PROVIDER=local', async () => {
    vi.stubEnv('VITE_MEDIA_PROVIDER', 'local');
    const { getMediaConfig } = await import('./config');
    expect(getMediaConfig().provider).toBe('local');
  });
});
