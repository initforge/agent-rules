import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppFontFamily } from '@/lib/theme/fonts';
import { AuthState, User } from '@/types';
import { usePermissionGrantStore } from './usePermissionGrantStore';

const AUTH_REMEMBER_KEY = 'auth-remember';

/** Storage cho auth: nếu "Ghi nhớ đăng nhập" bật thì dùng localStorage, tắt thì dùng sessionStorage (đóng tab là thoát). Không có key thì mặc định dùng localStorage. */
function getAuthStorage(): { getItem: (name: string) => string | null; setItem: (name: string, value: string) => void; removeItem: (name: string) => void } | null {
  const remembered = typeof window !== 'undefined' && localStorage.getItem(AUTH_REMEMBER_KEY) !== 'false';
  const storage = typeof window !== 'undefined' ? (remembered ? localStorage : sessionStorage) : null;
  if (!storage) return null;
  return {
    getItem: (name: string) => storage.getItem(name),
    setItem: (name: string, value: string) => { storage.setItem(name, value); },
    removeItem: (name: string) => {
      localStorage.removeItem(name);
      sessionStorage.removeItem(name);
    },
  };
}

/** Storage adapter cho zustand persist: phải trả về object { state, version }, lưu dạng JSON. */
function createAuthPersistStorage() {
  const base = getAuthStorage();
  if (!base) return null;
  return {
    getItem: (name: string) => {
      const raw = base.getItem(name);
      return raw ? JSON.parse(raw) : null;
    },
    setItem: (name: string, value: { state: unknown; version: number }) => {
      base.setItem(name, JSON.stringify(value));
    },
    removeItem: (name: string) => base.removeItem(name),
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,
  login: (user: User) => set({ user, isAuthenticated: true }),
  patchUser: (patch: Partial<User>) =>
    set((state) =>
      state.user ? { user: { ...state.user, ...patch } } : state,
    ),
  logout: () => {
        usePermissionGrantStore.getState().clearMatrix();
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      version: 2,
      storage: createAuthPersistStorage() ?? undefined,
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ _hasHydrated: true });
      },
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as AuthState;
        const state = persisted as AuthState;
        if (version < 1) {
          if (state.user?.id === '123' || state.user?.email === 'demo@example.com') {
            state.user = {
              id: 'emp-000',
              email: 'admin@5fedu.com',
              full_name: 'Lê Minh Công',
              role: 'admin',
              created_at: new Date().toISOString(),
              id_phong_ban: 'dep-7',
            };
            state.isAuthenticated = true;
          }
        }
        if (version < 2 && state.user?.id === 'user-123') {
          state.user = {
            ...state.user,
            id: 'emp-000',
            id_phong_ban: 'dep-7',
            role: 'admin',
          };
        }
        return state;
      },
    }
  )
);

interface CompanyInfo {
  appName: string;
  appDescription: string; // New field for short description
  appLogo: string | null; // Base64 string or URL
  companyName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

interface ThemeState {
  primaryColor: 'blue' | 'violet' | 'emerald' | 'rose' | 'amber' | 'orange' | 'cyan' | 'slate';
  fontFamily: AppFontFamily;
  fontSize: 'small' | 'medium' | 'large';
  colorScheme: 'light' | 'dark' | 'system';
  timezone: string;
  setTheme: (settings: Partial<Omit<ThemeState, 'setTheme'>>) => void;
}

interface UIState extends ThemeState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  // Branding & Company Info
  companyInfo: CompanyInfo;
  setCompanyInfo: (info: Partial<CompanyInfo>) => void;
  // User Preferences
  skipRedirectConfirmation: boolean;
  setSkipRedirectConfirmation: (skip: boolean) => void;
}

/** Allowed font families – used for migration from old settings. */
const ALLOWED_FONTS = new Set<AppFontFamily>([
  'Inter',
  'Be Vietnam Pro',
  'Lexend',
  'Nunito',
  'Source Sans 3',
  'Merriweather',
]);

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      // Default Theme Settings
      primaryColor: 'blue',
      fontFamily: 'Inter',
      fontSize: 'medium',
      colorScheme: 'light',
      timezone: 'Asia/Ho_Chi_Minh',
      setTheme: (settings) => {
        set((state) => ({ ...state, ...settings }));
      },

      // Default Company Info (dữ liệu mặc định cho module Thông tin công ty)
      companyInfo: {
        appName: '5F template',
        appDescription: 'Ứng dụng mẫu quản lý ERP',
        appLogo: null,
        companyName: '5F template',
        taxId: '0101234567',
        address: 'Số 1 Đường Mẫu, Quận 1, TP. Hồ Chí Minh',
        phone: '028 1234 5678',
        email: 'contact@company.vn',
        website: 'www.company.vn'
      },
      setCompanyInfo: (info) => set((state) => ({
        companyInfo: { ...state.companyInfo, ...info }
      })),

      // User Preferences
      skipRedirectConfirmation: false,
      setSkipRedirectConfirmation: (skip) => set({ skipRedirectConfirmation: skip }),
    }),
    {
      name: 'ui-storage', // Persist UI settings including branding
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as UIState;
        const state = persisted as Record<string, unknown> & Partial<ThemeState>;
        // v0 → v1: fonts list reduced
        if (
          version === 0 &&
          state.fontFamily &&
          typeof state.fontFamily === 'string' &&
          !ALLOWED_FONTS.has(state.fontFamily as ThemeState['fontFamily'])
        ) {
          state.fontFamily = 'Inter';
        }
        // v1 → v2: chỉ còn tiếng Việt — bỏ language khỏi state đã lưu
        if (version < 2) {
          delete state.language;
        }
        return persisted as UIState;
      },
    }
  )
);