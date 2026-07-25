import React, { useState, useEffect } from 'react';
import Overview from './pages/Overview';
import Platforms from './pages/Platforms';
import ModelsAndRoutes from './pages/ModelsAndRoutes';
import WorkflowGraph from './pages/WorkflowGraph';
import SkillsIntegrationsProfiles from './pages/SkillsIntegrationsProfiles';
import RunsAndEvaluations from './pages/RunsAndEvaluations';
import PlanAndEvidence from './pages/PlanAndEvidence';
import AuditLog from './pages/AuditLog';

type Page = 'overview' | 'platforms' | 'models-routes' | 'workflow' | 'skills' | 'runs' | 'plan' | 'audit';

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

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [health, setHealth] = useState<{ commit?: string; status?: string }>({});

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => setHealth(d)).catch(() => {});
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 260, background: '#161b22', borderRight: '1px solid #30363d', padding: '16px 0' }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #30363d', marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>Control Plane</h2>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
            {health.commit ? `#${health.commit.slice(0, 7)}` : ''} <span style={{ color: health.status === 'healthy' ? '#3fb950' : '#f85149' }}>●</span>
          </div>
        </div>
        {NAV.map(n => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 16px',
              background: page === n.id ? '#1f2937' : 'transparent',
              color: page === n.id ? '#f0f6fc' : '#8b949e',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: page === n.id ? 600 : 400,
            }}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        {pages[page]}
      </main>
    </div>
  );
}
