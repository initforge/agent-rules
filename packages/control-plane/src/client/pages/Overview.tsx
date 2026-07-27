import React, { useEffect, useState, useRef } from 'react';

interface FileStatusEntry { exists: boolean; size: number; }
interface DirStatusEntry { exists: boolean; entryCount: number; }

interface HealthData {
  ok?: boolean;
  status?: string;
  commit?: string;
  manifestHash?: string;
  fileStatus?: Record<string, FileStatusEntry>;
  dirStatus?: Record<string, DirStatusEntry>;
  uptime?: number;
  system?: {
    nodeVersion?: string;
    platform?: string;
    cpus?: number;
    memory?: { rss?: number; heapUsed?: number; };
    loadAvg?: number[];
  };
}

interface ManifestData { version?: number; load_order?: string[]; budgets?: Record<string, number>; }
interface ProfileManifest { version?: number; profiles?: Record<string, { enabledByDefault?: boolean; name?: string; displayName?: string }>; }
interface ModelPolicy { version?: number; platforms?: Record<string, unknown>; }
interface ConfigData { manifest?: ManifestData; profileManifest?: ProfileManifest; modelPolicy?: ModelPolicy; }

type LoadState = 'loading' | 'loaded' | 'error' | 'offline';

interface OverviewProps {
  navigate: (path: string) => void;
}

export default function Overview({ navigate }: OverviewProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let stale = false;
    const timer = setTimeout(() => { if (mountedRef.current && loadState === 'loading') stale = true; }, 5000);

    Promise.all([
      fetch('/api/health').then(r => { if (!r.ok) throw new Error('Health check failed'); return r.json(); }),
      fetch('/api/config/all').then(r => { if (!r.ok) throw new Error('Config fetch failed'); return r.json(); }),
    ]).then(([h, c]) => {
      if (!mountedRef.current) return;
      if (h.ok) setHealth(h);
      if (c.ok) setConfig(c.data);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      if (stale) setLoadState('offline');
      else { setError(err instanceof Error ? err.message : String(err)); setLoadState('error'); }
    }).finally(() => clearTimeout(timer));

    return () => { mountedRef.current = false; clearTimeout(timer); };
  }, []);

  const enabledProfiles = config?.profileManifest?.profiles
    ? Object.entries(config.profileManifest.profiles).filter(([, v]) => v.enabledByDefault)
    : [];
  const platforms = config?.modelPolicy?.platforms ? Object.keys(config.modelPolicy.platforms) : [];
  const fileStats = health?.fileStatus ? Object.values(health.fileStatus) : null;
  const filesFound = fileStats ? fileStats.filter(v => v.exists).length : 0;
  const filesTotal = fileStats ? fileStats.length : 0;

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Repository Overview</h1>
          <p className="typography-caption">System health, CI status, and configuration drift</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Repository Overview</h1>
          <p className="typography-caption">System health, CI status, and configuration drift</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  if (loadState === 'offline') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Repository Overview</h1>
          <p className="typography-caption">System health, CI status, and configuration drift</p>
        </div>
        <div className="state-offline">Server unreachable. Showing cached data if available.</div>
        {health && <div className="state-stale">Data may be stale — last known status: {health.status}</div>}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Repository Overview</h1>
        <p className="typography-caption">System health, CI status, and configuration drift</p>
      </div>

      <div className="overview-grid">
        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">Repository Health</h3>
            <span className={`status-dot ${health?.status === 'healthy' ? 'status-dot--success' : 'status-dot--danger'}`} />
          </div>
          <div className="overview-stat"><span className="typography-caption">Status</span><span className="typography-body">{health?.status || 'unknown'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Commit</span><span className="typography-mono">{health?.commit ? health.commit.slice(0, 7) : 'unknown'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Manifest</span><span className="typography-mono">{health?.manifestHash || 'unknown'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Uptime</span><span className="typography-body">{health?.uptime ? `${Math.floor(health.uptime / 60)}m` : '?'}</span></div>
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">CI Readiness</h3>
          </div>
          <div className="overview-stat"><span className="typography-caption">Last Commit</span><span className="typography-mono">{health?.commit ? health.commit.slice(0, 7) : 'N/A'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Config Drift</span><span className="typography-body">{filesFound}/{filesTotal} files found</span></div>
          <div className="overview-progress-bar"><div className="overview-progress-fill" style={{ width: `${filesTotal > 0 ? (filesFound / filesTotal) * 100 : 0}%` }} /></div>
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">Platform Health</h3>
          </div>
          {platforms.length === 0 ? (
            <div className="state-empty">No platforms configured</div>
          ) : (
            platforms.map(p => (
              <div key={p} className="overview-platform-row">
                <span className="status-dot status-dot--success" />
                <span className="typography-body">{p}</span>
              </div>
            ))
          )}
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">Enabled Profiles</h3>
            <span className="typography-caption">{enabledProfiles.length}</span>
          </div>
          {enabledProfiles.length === 0 ? (
            <div className="state-empty">No profiles enabled by default</div>
          ) : (
            enabledProfiles.map(([id]) => (
              <div key={id} className="overview-platform-row">
                <span className="status-dot status-dot--success" />
                <span className="typography-body">{id}</span>
              </div>
            ))
          )}
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">System Resources</h3>
          </div>
          <div className="overview-stat"><span className="typography-caption">Node</span><span className="typography-mono">{health?.system?.nodeVersion || '?'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Platform</span><span className="typography-body">{health?.system?.platform || '?'}</span></div>
          <div className="overview-stat"><span className="typography-caption">CPUs</span><span className="typography-body">{health?.system?.cpus || '?'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Heap</span><span className="typography-body">{health?.system?.memory?.heapUsed ? `${health.system.memory.heapUsed}MB` : '?'}</span></div>
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">Config Sources</h3>
          </div>
          {config?.manifest?.load_order ? (
            config.manifest.load_order.map((r, i) => (
              <div key={i} className="overview-platform-row">
                <span className="typography-code" style={{ fontSize: 11, width: 24 }}>#{i}</span>
                <span className="typography-body">{r}</span>
              </div>
            ))
          ) : (
            <div className="state-empty">No load order defined</div>
          )}
        </div>
      </div>

      {config?.manifest?.budgets && (
        <div className="surface" style={{ marginTop: 16, padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 12 }}>Token Budgets</h3>
          <div className="overview-budgets">
            {Object.entries(config.manifest.budgets).map(([k, v]) => (
              <div key={k} className="overview-budget-item">
                <span className="typography-caption">{k}</span>
                <span className="typography-body">{v?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
