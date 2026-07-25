/**
 * Data source: production build defaults to Supabase; dev defaults to mock.
 * Override: VITE_DATA_SOURCE=mock | supabase
 * Auto: có VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY → supabase (dev & prod)
 */
export type DataSource = 'mock' | 'supabase';

function hasSupabaseEnv(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url?.trim() && key?.trim());
}

function resolveDataSource(): DataSource {
  const raw = import.meta.env.VITE_DATA_SOURCE as string | undefined;
  if (raw === 'mock' || raw === 'supabase') return raw;
  if (hasSupabaseEnv()) return 'supabase';
  return import.meta.env.PROD ? 'supabase' : 'mock';
}

const DATA_SOURCE = resolveDataSource();

export function getDataSource(): DataSource {
  return DATA_SOURCE === 'supabase' ? 'supabase' : 'mock';
}

export function isSupabase(): boolean {
  return getDataSource() === 'supabase';
}

export function isMock(): boolean {
  return getDataSource() === 'mock';
}
