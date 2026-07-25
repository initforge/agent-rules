import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Get Supabase client. Singleton; returns null if env not set (mock mode).
 * Auth: PKCE + refresh token phù hợp SPA; tránh gọi createClient lặp lại (tốn bộ nhớ / duplicate listeners).
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (supabaseInstance !== null) return supabaseInstance;
  if (!url || !anonKey) return null;
  supabaseInstance = createClient<Database>(url, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'x-client-info': '5f-template-erp' },
    },
  });
  return supabaseInstance;
}

/**
 * Use getSupabase() in repositories; returns null when env is not set (mock mode).
 */
