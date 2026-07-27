import React, { useState, useEffect, useCallback } from 'react';
import Overview from './pages/Overview';
import Platforms from './pages/Platforms';
import ModelsAndRoutes from './pages/ModelsAndRoutes';
import WorkflowGraph from './pages/WorkflowGraph';
import SkillsIntegrationsProfiles from './pages/SkillsIntegrationsProfiles';
import RunsAndEvaluations from './pages/RunsAndEvaluations';
import PlanAndEvidence from './pages/PlanAndEvidence';
import AuditLog from './pages/AuditLog';

type Page = 'overview' | 'platforms' | 'models-routes' | 'workflow' | 'skills' | 'runs' | 'plan' | 'audit';

interface HealthData {
  ok?: boolean;
  status?: string;
  commit?: string;
}

const NAV: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'models-routes', label: 'Models & Routes' },
  { id: 'workflow', label: 'Workflow Graph' },
  { id: 'skills', label: 'Skills / Integrations / Profiles' },
  { id: 'runs', label: 'Runs & Evaluations' },
  { id: 'plan', label: 'Plan & Evidence' },
  { id: 'audit', label: 'Audit Log' },
];

function getPageFromHash(): Page {
  const hash = window.location.hash.replace('#', '');
  const valid = NAV.find(n => n.id === hash);
  return valid ? valid.id : 'overview';
}

export default function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);
  const [health, setHealth] = useState<HealthData>({});
  const [healthError, setHealthError] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(d))
      .catch(() => setHealthError(true));
  }, []);

  const navigate = useCallback((id: Page) => {
    window.location.hash = id;
  }, []);

  const toggleTheme = useCallback(() => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cp-theme', next);
    setDark(next === 'dark');
  }, []);

  const pages: Record<Page, React.ReactNode> = {
    overview: <Overview />,
    platforms: <Platforms />,
    'models-routes': <ModelsAndRoutes />,
    workflow: <WorkflowGraph />,
    skills: <SkillsIntegrationsProfiles />,
    runs: <RunsAndEvaluations />,
    plan: <PlanAndEvidence />,
    audit: <AuditLog />,
  };

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="app-nav-header">
          <div className="app-nav-title">Control Plane</div>
          <div className="app-nav-status">
            {healthError ? (
              <span><span className="app-nav-status-dot app-nav-status-dot--unhealthy" /> offline</span>
            ) : (
              <>
                {health.commit ? `#${health.commit.slice(0, 7)}` : ''}
                <span className={`app-nav-status-dot ${health.status === 'healthy' ? 'app-nav-status-dot--healthy' : 'app-nav-status-dot--unhealthy'}`} />
                {health.status || '?'}
              </>
            )}
          </div>
        </div>
        <div className="app-nav-items">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={`app-nav-item${page === n.id ? ' app-nav-item--active' : ''}`}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="app-nav-footer">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {dark ? '\u2600' : '\uD83C\uDF19'}
          </button>
        </div>
      </nav>
      <main className="app-content">
        {pages[page]}
      </main>
    </div>
  );
}
