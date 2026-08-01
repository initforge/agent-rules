import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import PlanWorkspace from './PlanWorkspace';
import Runs from './pages/Runs';
import Evaluations from './pages/Evaluations';
import Architecture from './pages/Architecture';
import Configuration from './pages/Configuration';
import Profiles from './pages/Profiles';
import Audit from './pages/Audit';
import C4Page from './pages/C4';
import M11Views from './pages/M11Views';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/ErrorBoundary';

interface HealthData {
  ok?: boolean;
  status?: string;
  commit?: string;
}

function parseRoute(path: string) {
  const segments = path.split('/').filter(Boolean);
  const base = segments[0] || 'overview';
  return { base, segments };
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [health, setHealth] = useState<HealthData>({});
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    function handleLocationChange() {
      setCurrentPath(window.location.pathname);
    }
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(d))
      .catch(() => setHealthError(true));
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  }, []);

  const { base, segments } = parseRoute(currentPath);

  function renderPage(): React.ReactNode {
    switch (base) {
      case 'overview':
        return <Overview navigate={navigate} />;
      case 'plan':
        return <ErrorBoundary><PlanWorkspace navigate={navigate} /></ErrorBoundary>;
      case 'runs':
        return <Runs segments={segments} navigate={navigate} />;
      case 'evaluations':
        return <Evaluations navigate={navigate} />;
      case 'architecture':
        return <Architecture segments={segments} navigate={navigate} />;
      case 'configuration':
        return <Configuration segments={segments} navigate={navigate} />;
      case 'profiles':
        return <Profiles segments={segments} navigate={navigate} />;
      case 'audit':
        return <Audit segments={segments} navigate={navigate} />;
      case 'c4':
        return <ErrorBoundary><C4Page navigate={navigate} /></ErrorBoundary>;
      case 'm11':
        return <ErrorBoundary><M11Views segments={segments} navigate={navigate} /></ErrorBoundary>;
      default:
        return <NotFound path={currentPath} navigate={navigate} />;
    }
  }

  return (
    <Layout
      currentPath={currentPath}
      onNavigate={navigate}
      health={health}
      healthError={healthError}
    >
      {renderPage()}
    </Layout>
  );
}
