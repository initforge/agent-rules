import React, { useEffect, useRef, useState } from 'react';

interface NavItem {
  id: string;
  label: string;
  badge?: string;
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
  { id: 'overview', label: 'Overview', path: '/overview' },
  { id: 'plans', label: 'Plans', badge: '3', path: '/plans' },
  { id: 'runs', label: 'Runs', badge: '8', path: '/runs' },
  { id: 'evidence', label: 'Evidence', badge: '47', path: '/evidence' },
  { id: 'hosts', label: 'Hosts', badge: '7', path: '/hosts' },
  { id: 'm11', label: 'M11', path: '/m11/readiness' },
  { id: 'audit', label: 'Audit', badge: '2', path: '/audit' },
  { id: 'architecture', label: 'Architecture', path: '/architecture/dag' },
  { id: 'configuration', label: 'Configuration', path: '/configuration/general' },
  { id: 'settings', label: 'Settings', path: '/configuration/general' },
];

const NAV_IDS = new Set(['overview', 'plans', 'runs', 'evidence', 'hosts', 'm11', 'audit', 'architecture', 'configuration', 'settings']);

function matchNavItem(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const base = segments[0] || 'overview';
  if (base === 'plan' || base === 'plans') return 'plans';
  if (base === 'evaluations' || base === 'profiles' || base === 'c4') return base;
  if (base === 'configuration') return 'configuration';
  return NAV_IDS.has(base) ? base : 'overview';
}

function crumbFor(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const map: Record<string, string> = {
    overview: 'Overview',
    plans: 'Plans',
    plan: 'Plans',
    runs: 'Runs',
    evidence: 'Evidence',
    hosts: 'Hosts',
    m11: 'M11',
    audit: 'Audit',
    architecture: 'Architecture',
    configuration: 'Configuration',
    evaluations: 'Evaluations',
    profiles: 'Profiles',
    c4: 'Architecture',
    settings: 'Settings',
  };
  const base = segments[0] || 'overview';
  return map[base] || 'Overview';
}

export default function Layout({ currentPath, onNavigate, health, healthError, children, inspector }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const activeId = matchNavItem(currentPath);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        hamburgerRef.current?.focus();
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

  return (
    <div className="layout-root">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <nav
        ref={sidebarRef}
        id="sidebar-navigation"
        className={`layout-sidebar ${mobileMenuOpen ? 'layout-sidebar--open' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="cp-sidebar-brand">
          <span className="cp-brand-mark" aria-hidden="true">⊡</span>
          <span className="cp-brand-text">
            <span className="cp-brand-name">agent-rules</span>
            <span className="cp-brand-sub">CONTROL PLANE</span>
          </span>
        </div>

        <div className="cp-sidebar-nav" tabIndex={0}>
          {NAV_ITEMS.map(item => (
            <a
              key={item.id}
              href={item.path}
              onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(item.path); } }}
              className={`cp-nav-item ${activeId === item.id ? 'cp-nav-item--active' : ''}`}
              aria-current={activeId === item.id ? 'page' : undefined}
            >
              <span className="cp-nav-label">{item.label}</span>
              {item.badge && <span className="cp-nav-badge">{item.badge}</span>}
            </a>
          ))}
        </div>

        <div className="cp-sidebar-foot">
          <div className="cp-m11-mini" role="status" aria-label="M11 status">
            <span className="cp-m11-dot" aria-hidden="true" />
            <span className="cp-m11-copy">
              <span className="cp-m11-title">M11 pending</span>
              <span className="cp-m11-sub">awaiting hosted CI</span>
            </span>
          </div>
          <div className="cp-user-card">
            <span className="cp-avatar" aria-hidden="true">LX</span>
            <span className="cp-user-copy">
              <span className="cp-user-name">Linh Nguyen</span>
              <span className="cp-user-role">operator</span>
            </span>
          </div>
        </div>
      </nav>

      <div className="layout-mobile-header">
        <button
          ref={hamburgerRef}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="layout-mobile-toggle"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="sidebar-navigation"
        >
          <span className={`layout-hamburger ${mobileMenuOpen ? 'layout-hamburger--open' : ''}`}>
            <span /><span /><span />
          </span>
        </button>
        <span className="layout-mobile-title">Control Plane</span>
        <button
          onClick={toggleTheme}
          className="theme-toggle-btn theme-toggle-btn--mobile"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '☀' : '☾'}
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          className="layout-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <main id="main-content" className="layout-content" role="main" tabIndex={0}>
        <div className="cp-topbar">
          <span className="cp-crumb">Control Plane / {crumbFor(currentPath)}</span>
          <span className="cp-actions">
            <span className={`cp-badge cp-badge--warn ${healthError ? 'cp-badge--danger' : ''}`}>
              {healthError ? 'OFFLINE' : 'HARNESS · PARTIAL'}
            </span>
            <button
              ref={toggleRef}
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? '☀' : '☾'}
            </button>
          </span>
        </div>
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
