
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useIsMaxWidth } from '@/hooks/use-media-query';
import { txt } from '@/lib/text';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import {
  User as UserIcon, Sparkles, LogOut, Key,
  PanelLeftClose, PanelLeft, ChevronDown,
  Eye, EyeOff, Lock
} from 'lucide-react';
import { NotificationBell } from '@/components/notification';
import { useAuthStore, useUIStore } from '@/store/useStore';
import type { User } from '@/types';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import { cn, getAvatarUrl } from '@/lib/utils';
import Combobox, { type Option } from '@/components/ui/Combobox';
import { hslToHex, PRIMARY_COLOR_MAP } from '@/lib/theme-utils';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import MobileBottomNav from './MobileBottomNav';
import { CommandPalette } from './CommandPalette';
import { useFilteredSidebarMenu } from '@/hooks/use-filtered-sidebar-menu';
import { useCurrentUserDisplay } from '@/hooks/use-current-user-display';
import { getAuthService } from '@/lib/supabase/auth';
import { toast } from 'sonner';
import {
  changePassword,
  resolveUserAuthEmail,
  resolveUserLoginName,
} from '@/lib/employee-auth/change-password';

/** Sidebar width: expanded 240px (gọn), collapsed 64px (4rem, 8px grid) */
const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 64;

/** Avatar + nhãn tên/chức vụ trên topbar — subscribe query NV/chức vụ, tránh re-render cả Layout. */
const LayoutHeaderUserTriggerContent: React.FC<{
  user: User | null;
}> = ({ user }) => {
  const { displayName, positionName, avatarName, avatarUrl } = useCurrentUserDisplay(user);

  return (
    <>
      <div className="relative shrink-0">
        <img
          src={avatarUrl || getAvatarUrl(avatarName)}
          alt="Avatar"
          className="h-7 w-7 rounded-lg ring-1 ring-border shadow-sm object-cover"
        />
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-[1.5px] border-card rounded-full" />
      </div>
      <div className="hidden md:block text-left min-w-0 max-w-[11rem]">
        <p className="text-xs font-semibold text-foreground leading-tight truncate">{displayName}</p>
        {positionName ? (
          <p className="text-[11px] font-normal text-muted-foreground leading-tight truncate">
            {positionName}
          </p>
        ) : null}
      </div>
    </>
  );
};

const LayoutMobileUserMenuHeader: React.FC<{
  user: User | null;
}> = ({ user }) => {
  const { displayName, positionName } = useCurrentUserDisplay(user);
  const subtitle = user?.ten_dang_nhap ?? user?.email ?? '';

  return (
    <div className="px-3 py-2.5 border-b border-border md:hidden">
      <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
      {positionName ? (
        <p className="text-xs text-primary font-medium mt-0.5 truncate">{positionName}</p>
      ) : null}
      {subtitle ? (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
      ) : null}
    </div>
  );
};

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const logout = useAuthStore((s) => s.logout);
  const { sidebarOpen, toggleSidebar, companyInfo, primaryColor, setTheme } = useUIStore(
    useShallow((s) => ({
      sidebarOpen: s.sidebarOpen,
      toggleSidebar: s.toggleSidebar,
      companyInfo: s.companyInfo,
      primaryColor: s.primaryColor,
      setTheme: s.setTheme,
    })),
  );
  const location = useLocation();
  const navigate = useNavigate();

  useScrollRestoration('main-content');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [changePasswordShow, setChangePasswordShow] = useState({ current: false, new: false, confirm: false });
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [sidebarTooltip, setSidebarTooltip] = useState<{ name: string; top: number; left: number } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  /** Remount CommandPalette mỗi lần mở — reset query/active không cần effect trong con. */
  const [commandPaletteKey, setCommandPaletteKey] = useState(0);
  /** URL that last failed to load — reset automatically when `appLogo` changes */
  const [logoLoadFailedForUrl, setLogoLoadFailedForUrl] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(location.pathname);
  const isMobile = useIsMaxWidth(768);

  const themeColorOptions = useMemo(
    () =>
      [
        { name: 'blue' as const, label: txt('settings.colorBlue') },
        { name: 'violet' as const, label: txt('settings.colorViolet') },
        { name: 'emerald' as const, label: txt('settings.colorEmerald') },
        { name: 'rose' as const, label: txt('settings.colorRose') },
        { name: 'amber' as const, label: txt('settings.colorAmber') },
        { name: 'orange' as const, label: txt('settings.colorOrange') },
        { name: 'cyan' as const, label: txt('settings.colorCyan') },
        { name: 'slate' as const, label: txt('settings.colorSlate') },
      ] as const,
    [],
  );

  const themeColorComboboxOptions: Option[] = useMemo(
    () => themeColorOptions.map((c) => ({ value: c.name, label: c.label })),
    [themeColorOptions],
  );

  const themeSwatchHex = (name: string) =>
    hslToHex(PRIMARY_COLOR_MAP[name] ?? PRIMARY_COLOR_MAP.blue);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      if (el?.closest?.('[data-combobox-dropdown]')) return;
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Cmd/Ctrl+B toggles sidebar; Cmd/Ctrl+K opens command palette */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((wasOpen) => {
          if (!wasOpen) setCommandPaletteKey((k) => k + 1);
          return !wasOpen;
        });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  /** On mobile, close sidebar when route changes (e.g. NavLink or header Link to /ho-so) */
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      if (isMobile && sidebarOpen) toggleSidebar();
    }
  }, [location.pathname, isMobile, sidebarOpen, toggleSidebar]);

  const handleLogout = async () => {
    await getAuthService().signOut();
    logout();
    setShowLogoutDialog(false);
    setIsUserMenuOpen(false);
    navigate('/dang-nhap');
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);
    const { current, new: newPw, confirm } = changePasswordForm;
    if (!current.trim()) {
      setChangePasswordError(txt('nav.changePassword.errorCurrentRequired'));
      return;
    }
    if (newPw.length < 6) {
      setChangePasswordError(txt('nav.changePassword.errorNewMin'));
      return;
    }
    if (newPw !== confirm) {
      setChangePasswordError(txt('nav.changePassword.errorConfirmMismatch'));
      return;
    }
    if (current === newPw) {
      setChangePasswordError(txt('nav.changePassword.errorSameAsCurrent'));
      return;
    }
    const loginName = user ? resolveUserLoginName(user) : '';
    if (!loginName) {
      setChangePasswordError('Chưa có tên đăng nhập');
      return;
    }
    setChangePasswordSubmitting(true);
    const result = await changePassword({
      loginName,
      authEmail: user ? resolveUserAuthEmail(user) : undefined,
      currentPassword: current,
      newPassword: newPw,
    });
    setChangePasswordSubmitting(false);
    if (!result.ok) {
      setChangePasswordError(result.error);
      return;
    }
    if (user?.must_change_password) {
      patchUser({ must_change_password: false });
    }
    setShowChangePasswordModal(false);
    setChangePasswordForm({ current: '', new: '', confirm: '' });
    toast.success(txt('nav.changePassword.success'));
  };

  const sidebarMenu = useFilteredSidebarMenu();

  const navItems = useMemo(
    () => sidebarMenu.map(({ path, nameKey, icon }) => ({ name: txt(nameKey), icon, path })),
    [sidebarMenu],
  );

  const sidebarTransition = { duration: 0.15, ease: "circOut" };

  return (
    <div className="flex h-[100dvh] bg-background font-sans text-foreground selection:bg-primary/20 selection:text-primary overflow-x-hidden min-h-0">
      {/* Skip-to-content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-medium"
      >
        {txt('nav.skipToMain')}
      </a>

      {/* Mobile Backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={toggleSidebar}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSidebar(); } }}
            role="button"
            tabIndex={0}
            aria-label={txt('nav.closeOverlay')}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* ===== SIDEBAR ===== */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED }}
        transition={sidebarTransition}
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-card border-r border-border/40 flex flex-col overflow-hidden md:relative",
          isMobile && !sidebarOpen ? "-translate-x-full" : "translate-x-0"
        )}
      >
        {/* Logo Section */}
        <div className="flex h-12 md:h-14 items-center px-3 shrink-0 overflow-hidden border-b border-border/50">
          <div className="flex items-center gap-3 min-w-[200px]">
            {companyInfo.appLogo && logoLoadFailedForUrl !== companyInfo.appLogo ? (
              // onError is load fallback, not a pointer/keyboard interaction
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- image load error handler
              <img
                src={companyInfo.appLogo}
                alt="App Logo"
                className="h-8 w-8 rounded-lg object-contain shadow-sm shrink-0 bg-card border border-border/50"
                onError={() => setLogoLoadFailedForUrl(companyInfo.appLogo ?? '')}
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary shadow-sm flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-white" />
              </div>
            )}
            <motion.div
              animate={{ opacity: sidebarOpen ? 1 : 0, x: sidebarOpen ? 0 : -10 }}
              transition={sidebarTransition}
              className="min-w-0"
            >
              <h2 className="text-xs font-bold text-foreground leading-tight truncate">{companyInfo.appName}</h2>
              <p className="text-xs text-muted-foreground truncate leading-tight">{companyInfo.appDescription || txt('nav.defaultAppDescription')}</p>
            </motion.div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 min-h-0 flex flex-col py-3 relative">
          <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
            <nav className="px-2 space-y-1" aria-label={txt('nav.mainNav')}>
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  aria-label={item.name}
                  title={item.name}
                  onClick={() => {
                    if (isMobile && sidebarOpen) toggleSidebar();
                  }}
                  onMouseEnter={(e) => {
                    if (!sidebarOpen) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setSidebarTooltip({ name: item.name, top: rect.top + rect.height / 2, left: rect.right });
                    }
                  }}
                  onMouseLeave={() => setSidebarTooltip(null)}
                  className={({ isActive }) => cn(
                    "group flex items-center gap-3 rounded-lg transition-colors relative min-h-[44px] h-11",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    isActive
                      ? 'bg-primary/5 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="navIndicator"
                          className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r-full z-10"
                          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                        />
                      )}

                      <div className="w-[60px] md:w-[56px] flex justify-center shrink-0">
                        <div className={cn(
                          "flex items-center justify-center rounded-lg transition-colors duration-200",
                          isActive
                            ? "w-8 h-8 bg-primary text-white shadow-sm"
                            : "w-8 h-8 bg-transparent text-inherit group-hover:bg-card group-hover:shadow-sm"
                        )}>
                          <item.icon size={16} className={cn("transition-[stroke-width]", isActive ? "stroke-[2.5px]" : "stroke-[1.8px]")} />
                        </div>
                      </div>

                      <motion.span
                        animate={{ opacity: sidebarOpen ? 1 : 0, x: sidebarOpen ? 0 : -5 }}
                        transition={sidebarTransition}
                        className={cn(
                          "text-sm font-medium transition-colors whitespace-nowrap",
                          isActive ? "text-primary font-bold" : "text-inherit",
                          !sidebarOpen && "pointer-events-none"
                        )}
                      >
                        {item.name}
                      </motion.span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          {/* Fade hint when nav is scrollable */}
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none shrink-0" aria-hidden />
        </div>
      </motion.aside>

      {/* Sidebar collapsed tooltip — rendered via portal to escape overflow-hidden */}
      {sidebarTooltip && !sidebarOpen && createPortal(
        <div
          className="fixed z-[9999] px-2.5 py-1 bg-popover text-popover-foreground text-xs font-medium rounded-lg shadow-md border border-border/60 whitespace-nowrap pointer-events-none"
          style={{ top: sidebarTooltip.top, left: sidebarTooltip.left + 8, transform: 'translateY(-50%)' }}
        >
          {sidebarTooltip.name}
        </div>,
        document.body
      )}

      {/* ===== MAIN CONTENT ===== */}
      <main id="main-content" className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overscroll-contain no-scrollbar bg-muted/30 relative">

        {/* ===== HEADER TOP BAR ===== */}
        <header className="h-12 md:h-14 shrink-0 border-b border-border/50 bg-card sticky top-0 z-40 px-3 md:px-5 flex items-center justify-between gap-3 safe-area-top">

          {/* Left: Toggle + Breadcrumbs */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <button
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? txt('nav.collapseSidebar') : txt('nav.expandSidebar')}
              className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center rounded-lg bg-muted/60 border border-border/80 text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/20 transition-[colors,transform] active:scale-90 shrink-0"
            >
              {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
            </button>

            <div className="flex-1 min-w-0">
              <Breadcrumbs />
            </div>
          </div>

          {/* Right: Notification + User */}
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <NotificationBell />

            {/* User Profile Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-label={txt('nav.userMenu')}
                aria-expanded={isUserMenuOpen}
                className="min-h-[44px] flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors group"
              >
                <LayoutHeaderUserTriggerContent user={user} />
                <ChevronDown size={12} className={cn("text-muted-foreground/50 hidden md:block transition-transform shrink-0", isUserMenuOpen ? "rotate-180" : "")} />
              </button>

              <AnimatePresence>
                {isUserMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-card rounded-xl shadow-xl border border-border overflow-hidden z-50 p-1.5"
                  >
                    <LayoutMobileUserMenuHeader user={user} />
                    <div className="space-y-0.5">
                      <Link to="/ho-so" onClick={() => setIsUserMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary rounded-lg transition-colors group">
                        <UserIcon size={15} className="text-muted-foreground group-hover:text-primary transition-colors" /> {txt('nav.profile')}
                      </Link>
                      <div className="px-2 py-2 border-y border-border/60 my-0.5">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                          {txt('settings.primaryColor')}
                        </p>
                        <Combobox
                          options={themeColorComboboxOptions}
                          value={primaryColor}
                          onChange={(v) => {
                            if (v === '') return;
                            setTheme({ primaryColor: v as typeof primaryColor });
                          }}
                          searchable={false}
                          clearable={false}
                          dropdownInPortal
                          placeholder={txt('settings.primaryColor')}
                          triggerClassName="h-9 text-xs py-0"
                          renderValue={(opt) => (
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-4 w-4 rounded-full shrink-0 border border-border/80 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                                style={{ backgroundColor: themeSwatchHex(String(opt.value)) }}
                                aria-hidden
                              />
                              <span className="truncate">{opt.label}</span>
                            </span>
                          )}
                          renderOption={(opt) => (
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="h-5 w-5 rounded-full shrink-0 border border-border/80 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                                style={{ backgroundColor: themeSwatchHex(String(opt.value)) }}
                                aria-hidden
                              />
                              <span className="truncate">{opt.label}</span>
                            </span>
                          )}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setIsUserMenuOpen(false); setShowChangePasswordModal(true); setChangePasswordError(null); setChangePasswordForm({ current: '', new: '', confirm: '' }); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary rounded-lg transition-colors group text-left"
                      >
                        <Key size={15} className="text-muted-foreground group-hover:text-primary transition-colors" /> {txt('nav.changePasswordLabel')}
                      </button>
                      <div className="h-px bg-border my-1 mx-2" />
                      <button
                        onClick={() => setShowLogoutDialog(true)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors group"
                      >
                        <LogOut size={15} className="text-rose-300 group-hover:text-rose-500 transition-colors" /> {txt('nav.logout')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content Area - flex chain để trang con (list/detail) có chiều cao xác định, footer sát mép dưới */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col p-1.5 md:p-2 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div key={location.pathname} className="flex-1 min-h-0 flex flex-col">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom nav: Back | Trang chủ | Notification (chỉ mobile) */}
      <MobileBottomNav />

      {/* Logout Confirmation Dialog */}
      <AnimatePresence>
        {showLogoutDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowLogoutDialog(false)}
              className="absolute inset-0 bg-black/40"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-card rounded-xl p-6 max-w-sm w-full shadow-2xl border border-border/40 text-center"
            >
              <div className="h-12 w-12 bg-rose-50 dark:bg-rose-950/50 text-rose-500 dark:text-rose-400 rounded-xl flex items-center justify-center mx-auto mb-4">
                <LogOut size={24} />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">{txt('nav.logoutConfirmTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{txt('nav.logoutConfirmMessage')}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-lg h-9 text-sm font-medium" onClick={() => setShowLogoutDialog(false)}>{txt('nav.logoutCancel')}</Button>
                <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg h-9 text-sm font-medium shadow-sm" onClick={handleLogout}>{txt('nav.logout')}</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showChangePasswordModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !changePasswordSubmitting && setShowChangePasswordModal(false)}
              className="absolute inset-0 bg-black/40 dark:bg-black/60"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-card rounded-xl shadow-2xl border border-border/40 w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 pb-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h2 id="change-password-title" className="text-lg font-bold text-foreground">{txt('nav.changePassword.title')}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{txt('nav.changePassword.description')}</p>
                  </div>
                </div>
                <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                  {changePasswordError && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                      {changePasswordError}
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">{txt('nav.changePassword.currentPassword')}</label>
                    <div className="relative">
                      <input
                        type={changePasswordShow.current ? 'text' : 'password'}
                        value={changePasswordForm.current}
                        onChange={(e) => setChangePasswordForm((f) => ({ ...f, current: e.target.value }))}
                        placeholder="••••••••"
                        className={cn(
                          'flex h-10 w-full rounded-lg border bg-background pl-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 border-input'
                        )}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setChangePasswordShow((s) => ({ ...s, current: !s.current }))}
                        aria-label={changePasswordShow.current ? txt('nav.changePassword.hidePassword') : txt('nav.changePassword.showPassword')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                      >
                        {changePasswordShow.current ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">{txt('nav.changePassword.newPassword')}</label>
                    <div className="relative">
                      <input
                        type={changePasswordShow.new ? 'text' : 'password'}
                        value={changePasswordForm.new}
                        onChange={(e) => setChangePasswordForm((f) => ({ ...f, new: e.target.value }))}
                        placeholder="••••••••"
                        className="flex h-10 w-full rounded-lg border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setChangePasswordShow((s) => ({ ...s, new: !s.new }))}
                        aria-label={changePasswordShow.new ? txt('nav.changePassword.hidePassword') : txt('nav.changePassword.showPassword')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                      >
                        {changePasswordShow.new ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{txt('nav.changePassword.newPasswordHint')}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">{txt('nav.changePassword.confirmPassword')}</label>
                    <div className="relative">
                      <input
                        type={changePasswordShow.confirm ? 'text' : 'password'}
                        value={changePasswordForm.confirm}
                        onChange={(e) => setChangePasswordForm((f) => ({ ...f, confirm: e.target.value }))}
                        placeholder="••••••••"
                        className="flex h-10 w-full rounded-lg border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setChangePasswordShow((s) => ({ ...s, confirm: !s.confirm }))}
                        aria-label={changePasswordShow.confirm ? txt('nav.changePassword.hidePassword') : txt('nav.changePassword.showPassword')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                      >
                        {changePasswordShow.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-lg h-10 text-sm font-medium"
                      onClick={() => setShowChangePasswordModal(false)}
                      disabled={changePasswordSubmitting}
                    >
                      {txt('common.cancel')}
                    </Button>
                    <Button type="submit" className="flex-1 rounded-lg h-10 text-sm font-medium" isLoading={changePasswordSubmitting} disabled={changePasswordSubmitting}>
                      {txt('nav.changePassword.submit')}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CommandPalette
        key={commandPaletteKey}
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
};

export default Layout;
