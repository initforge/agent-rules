import React, { useEffect, useRef, useState } from 'react';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

interface HealthData {
  ok?: boolean;
  status?: string;
  commit?: string;
}

interface LayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  health: HealthData;
  healthError: boolean;
  children: React.ReactNode;
  inspector?: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '⊞', path: '/overview' },
  { id: 'plan', label: 'Plan Workspace', icon: '⊟', path: '/plan' },
  { id: 'runs', label: 'Runs', icon: '⊡', path: '/runs' },
  { id: 'evaluations', label: 'Evaluations', icon: '⊠', path: '/evaluations' },
  { id: 'architecture', label: 'Architecture', icon: '⊡', path: '/architecture/dag' },
  { id: 'configuration', label: 'Configuration', icon: '⊞', path: '/configuration/general' },
  { id: 'profiles', label: 'Profiles', icon: '⊡', path: '/profiles' },
  { id: 'audit', label: 'Audit Log', icon: '⊡', path: '/audit' },
];

function matchNavItem(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const base = segments[0] || 'overview';
  if (base === 'overview' || base === 'plan' || base === 'audit' || base === 'evaluations') return base;
  if (base === 'runs') return 'runs';
  if (base === 'architecture') return 'architecture';
  if (base === 'configuration') return 'configuration';
  if (base === 'profiles') return 'profiles';
  return 'overview';
}

export default function Layout({ currentPath, onNavigate, health, healthError, children, inspector }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLAnchorElement>(null);
  const activeId = matchNavItem(currentPath);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cp-theme', next);
    setDark(next === 'dark');
  }

  const sidebar = (
    <nav
      ref={sidebarRef}
      className={`layout-sidebar ${mobileMenuOpen ? 'layout-sidebar--open' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="layout-sidebar-header">
        <div className="layout-sidebar-brand">
          <span className="layout-sidebar-icon">⊡</span>
          <span className="layout-sidebar-title">Control Plane</span>
        </div>
        <div className="layout-sidebar-status">
          {healthError ? (
            <span className="status-indicator status-indicator--offline">
              <span className="status-dot status-dot--danger" /> offline
            </span>
          ) : (
            <span className={`status-indicator ${health.status === 'healthy' ? '' : 'status-indicator--warn'}`}>
              <span className={`status-dot ${health.status === 'healthy' ? 'status-dot--success' : 'status-dot--warning'}`} />
              {health.status || '?'}
              {health.commit ? <span className="status-commit" style={{color: dark ? '#e6edf3' : '#585860'}}>#{health.commit.slice(0, 7)}</span> : null}
            </span>
          )}
        </div>
      </div>

      <div className="layout-sidebar-nav" tabIndex={0}>
        {NAV_ITEMS.map(item => (
          <a
            key={item.id}
            href={item.path}
            onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(item.path); } }}
            className={`layout-nav-item ${activeId === item.id ? 'layout-nav-item--active' : ''}`}
            aria-current={activeId === item.id ? 'page' : undefined}
          >
            <span className="layout-nav-icon">{item.icon}</span>
            <span className="layout-nav-label">{item.label}</span>
          </a>
        ))}
      </div>

      <div className="layout-sidebar-footer">
        <span className="layout-sidebar-version">v0.1.0</span>
        <a
          ref={toggleRef}
          onClick={toggleTheme}
          className="theme-toggle-btn"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '\u2600' : '\uD83C\uDF19'}
        </a>
      </div>
    </nav>
  );

  return (
    <div className="layout-root">
      {sidebar}

      <div className="layout-mobile-header">
        <a
          ref={toggleRef}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="layout-mobile-toggle"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="sidebar-navigation"
        >
          <span className={`layout-hamburger ${mobileMenuOpen ? 'layout-hamburger--open' : ''}`}>
            <span /><span /><span />
          </span>
        </a>
        <span className="layout-mobile-title">Control Plane</span>
        <a
          onClick={toggleTheme}
          className="theme-toggle-btn theme-toggle-btn--mobile"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '\u2600' : '\uD83C\uDF19'}
        </a>
      </div>

      {mobileMenuOpen && (
        <div
          className="layout-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="layout-content" role="main" tabIndex={0}>
        {children}
      </main>

      {inspector && (
        <aside className="layout-inspector" role="complementary" aria-label="Contextual inspector">
          {inspector}
        </aside>
      )}
    </div>
  );
}
