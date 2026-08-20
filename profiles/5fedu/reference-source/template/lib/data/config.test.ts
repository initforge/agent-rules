import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveDataSource defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses supabase in dev when Supabase env is set and VITE_DATA_SOURCE is unset', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_DATA_SOURCE', '');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    const { isSupabase } = await import('./config');
    expect(isSupabase()).toBe(true);
  });

  it('uses mock in dev when Supabase env is missing', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_DATA_SOURCE', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { isMock, isSupabase } = await import('./config');
    expect(isMock()).toBe(true);
    expect(isSupabase()).toBe(false);
  });

  it('uses supabase in production when VITE_DATA_SOURCE is unset', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_DATA_SOURCE', '');
    const { isMock, isSupabase } = await import('./config');
    expect(isMock()).toBe(false);
    expect(isSupabase()).toBe(true);
  });

  it('honours explicit VITE_DATA_SOURCE=mock in production', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_DATA_SOURCE', 'mock');
    const { isMock } = await import('./config');
    expect(isMock()).toBe(true);
  });
});
