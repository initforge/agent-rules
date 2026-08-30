import { getSupabase } from '@/lib/supabase/client';
import { isSupabase } from '@/lib/data/config';
import type { User } from '@/types';
import {
  loginSupabaseNotConfiguredMessage,
  mapSupabaseAuthError,
} from '@/lib/employee-auth/login-errors';
import { txt } from '@/lib/text';

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  fullName?: string;
}

export interface AuthSession {
  user: User;
}

export interface AuthService {
  signIn(credentials: SignInCredentials): Promise<{ user: User } | { error: string }>;
  signUp(credentials: SignUpCredentials): Promise<{ user?: User; error?: string }>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;
}

function mapSupabaseUserToAppUser(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }): User {
  const meta = supabaseUser.user_metadata ?? {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    full_name: (meta.full_name as string) ?? undefined,
    avatar_url: (meta.avatar_url as string) ?? undefined,
    role: 'user',
    created_at: new Date().toISOString(),
    id_phong_ban: (meta.id_phong_ban as string) ?? undefined,
    id_chuc_vu: (meta.id_chuc_vu as string[] | null) ?? undefined,
  };
}

const mockUser: User = {
  id: 'emp-000',
  email: 'admin@5fedu.com',
  full_name: 'Lê Minh Công',
  role: 'user',
  created_at: new Date().toISOString(),
  id_phong_ban: 'dep-7',
  id_chuc_vu: ['pos-1'],
};

const mockAuthService: AuthService = {
  async signIn({ email, password }) {
    await new Promise((r) => setTimeout(r, 800));
    if (password.length < 6) return { error: txt('page.login.passwordMin') };
    return {
      user: {
        ...mockUser,
        email,
        full_name: email === 'admin@5fedu.com' ? mockUser.full_name : email.split('@')[0],
      },
    };
  },

  async signUp() {
    await new Promise((r) => setTimeout(r, 1500));
    return {};
  },

  async signOut() {
    await new Promise((r) => setTimeout(r, 200));
  },

  async getSession() {
    return null; // Mock: no persistent session, caller uses store
  },

  onAuthStateChange() {
    return () => {};
  },
};

const supabaseAuthService: AuthService = {
  async signIn(credentials) {
    const supabase = getSupabase();
    if (!supabase) return { error: loginSupabaseNotConfiguredMessage() };
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) return { error: error.message };
    if (!data.user) return { error: txt('page.login.loginFailed') };
    return { user: mapSupabaseUserToAppUser(data.user) };
  },

  async signUp({ email, password, fullName }) {
    const supabase = getSupabase();
    if (!supabase) return { error: loginSupabaseNotConfiguredMessage() };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: mapSupabaseAuthError(error.message) };
    if (data.user)
      return { user: mapSupabaseUserToAppUser(data.user) };
    return {};
  },

  async signOut() {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  },

  async getSession() {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return { user: mapSupabaseUserToAppUser(session.user) };
  },

  onAuthStateChange(callback) {
    const supabase = getSupabase();
    if (!supabase) return () => {};
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) callback({ user: mapSupabaseUserToAppUser(session.user) });
      else callback(null);
    });
    return () => subscription.unsubscribe();
  },
};

export function getAuthService(): AuthService {
  return isSupabase() ? supabaseAuthService : mockAuthService;
}
