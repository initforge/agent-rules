import React, { useEffect, useState, useRef } from 'react';

interface FileStatusEntry {
  exists: boolean;
  size: number;
}

interface DirStatusEntry {
  exists: boolean;
  entryCount: number;
}

interface HealthData {
  ok?: boolean;
  status?: string;
  commit?: string;
  manifestHash?: string;
  fileStatus?: Record<string, FileStatusEntry>;
  dirStatus?: Record<string, DirStatusEntry>;
}

interface ManifestData {
  version?: number;
  load_order?: string[];
  budgets?: Record<string, number>;
}

interface ProfileManifestProfile {
  enabledByDefault?: boolean;
  name?: string;
  displayName?: string;
}

interface ProfileManifest {
  version?: number;
  profiles?: Record<string, ProfileManifestProfile>;
}

interface ModelPolicy {
  version?: number;
  platforms?: Record<string, unknown>;
}

interface ConfigData {
  manifest?: ManifestData;
  registry?: { version?: number; integrations?: unknown[]; profiles?: Record<string, unknown> };
  profileManifest?: ProfileManifest;
  modelPolicy?: ModelPolicy;
}

type LoadState = 'loading' | 'loaded' | 'error' | 'offline';

export default function Overview() {
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

  const enabledProfiles: [string, ProfileManifestProfile][] = config?.profileManifest?.profiles
    ? Object.entries(config.profileManifest.profiles).filter(([, v]) => v.enabledByDefault)
    : [];

  const platforms: string[] = config?.modelPolicy?.platforms ? Object.keys(config.modelPolicy.platforms) : [];

  if (loadState === 'loading') {
    return (
      <div>
        <h1 className="page-title">Repository Overview</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Repository Overview</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  if (loadState === 'offline') {
    return (
      <div>
        <h1 className="page-title">Repository Overview</h1>
        <div className="state-offline">Server unreachable. Showing cached data if available.</div>
        {health && (
          <div className="state-stale">Data may be stale — last known status: {health.status}</div>
        )}
      </div>
    );
  }

  const fileStats = health?.fileStatus ? Object.values(health.fileStatus) : null;
  const filesFound = fileStats ? fileStats.filter(v => v.exists).length : 0;
  const filesTotal = fileStats ? fileStats.length : 0;
  const dirCount = health?.dirStatus ? Object.keys(health.dirStatus).length : 0;

  return (
    <div>
      <h1 className="page-title">Repository Overview</h1>

      {error && <div className="state-error">{error}</div>}

      <div className="grid">
        <div className="card">
          <h3 className="card-title">Repository Health</h3>
          <div className="stat-row"><span className="stat-label">Status</span><span className="stat-value">{health?.status || 'unknown'}</span></div>
          <div className="stat-row"><span className="stat-label">Commit</span><span className="stat-value">{health?.commit ? health.commit.slice(0, 7) : 'unknown'}</span></div>
          <div className="stat-row"><span className="stat-label">Manifest Hash</span><span className="stat-value">{health?.manifestHash || 'unknown'}</span></div>
        </div>

        <div className="card">
          <h3 className="card-title">CI Status</h3>
          <div className="stat-row"><span className="stat-label">Last Commit</span><span className="stat-value">{health?.commit ? health.commit.slice(0, 7) : 'N/A'}</span></div>
          <div className="text-xs text-secondary mt-sm">CI imported from available data (git log)</div>
        </div>

        <div className="card">
          <h3 className="card-title">Sync Drift</h3>
          <div className="stat-row"><span className="stat-label">Config Files Found</span><span className="stat-value">{filesFound}/{filesTotal}</span></div>
          <div className="stat-row"><span className="stat-label">Directories</span><span className="stat-value">{dirCount}</span></div>
        </div>

        <div className="card">
          <h3 className="card-title">Enabled Profiles</h3>
          {enabledProfiles.length === 0 ? (
            <div className="state-empty">No profiles enabled by default</div>
          ) : (
            enabledProfiles.map(([id]) => (
              <div key={id} className="list-item--compact"><span className="dot dot--success" />{id}</div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Platform Health</h3>
          {platforms.length === 0 ? (
            <div className="state-empty">No platforms configured</div>
          ) : (
            platforms.map(p => (
              <div key={p} className="list-item--compact"><span className="dot dot--accent" />{p}</div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Config Sources</h3>
          {config?.manifest?.load_order ? (
            <div>
              <div className="text-xs text-secondary mb-sm">Load Order:</div>
              {config.manifest.load_order.map((r, i) => (
                <div key={i} className="detail-row">{r}</div>
              ))}
            </div>
          ) : (
            <div className="state-empty">No load order defined</div>
          )}
        </div>
      </div>

      {config?.manifest?.budgets && (
        <div className="card mb-md">
          <h3 className="card-title">Token Budgets</h3>
          <div className="grid grid--narrow" style={{ gap: 8 }}>
            {Object.entries(config.manifest.budgets).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs text-secondary">{k}</div>
                <div className="text-sm">{v?.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
