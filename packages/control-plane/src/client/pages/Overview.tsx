import React, { useEffect, useState, useRef, useCallback } from 'react';

interface FileStatusEntry { exists: boolean; size: number; }
interface DirStatusEntry { exists: boolean; entryCount: number; }

interface AttestationStaleness {
  stale?: boolean;
  unboundCount?: number;
  unboundProfiles?: string[];
  error?: string;
}

interface HealthData {
  ok?: boolean;
  status?: string;
  commit?: string;
  manifestHash?: string;
  ledgerStatus?: string;
  ledgerFiles?: number;
  attestationStaleness?: AttestationStaleness;
  fileStatus?: Record<string, FileStatusEntry>;
  dirStatus?: Record<string, DirStatusEntry>;
  uptime?: number;
  timestamp?: string;
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

interface PlanSummary {
  planId: string;
  status?: string;
  attestations?: Array<Record<string, unknown>>;
}

type LoadState = 'loading' | 'loaded' | 'error' | 'offline';

interface OverviewProps {
  navigate: (path: string) => void;
}

export default function Overview({ navigate }: OverviewProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(() => {
    let stale = false;
    const timer = setTimeout(() => { if (mountedRef.current && loadState === 'loading') stale = true; }, 5000);

    Promise.all([
      fetch('/api/health').then(r => { if (!r.ok) throw new Error('Health check failed'); return r.json(); }),
      fetch('/api/config/all').then(r => { if (!r.ok) throw new Error('Config fetch failed'); return r.json(); }),
      fetch('/api/plans').then(r => r.json()).catch(() => ({ plans: [] })),
    ]).then(([h, c, p]) => {
      if (!mountedRef.current) return;
      setHealth(h);
      if (c.ok) setConfig(c.data);
      if (p.plans && p.plans.length > 0) setPlans(p.plans);
      setLastUpdated(new Date().toISOString());
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      if (stale) setLoadState('offline');
      else { setError(err instanceof Error ? err.message : String(err)); setLoadState('error'); }
    }).finally(() => clearTimeout(timer));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const interval = setInterval(() => {
      if (mountedRef.current && loadState === 'loaded') {
        fetch('/api/health').then(r => r.json()).then(h => {
          if (mountedRef.current) {
            setHealth(h);
            setLastUpdated(new Date().toISOString());
            setLoadState('loaded');
          }
        }).catch(() => {});
      }
    }, 30000);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [fetchData]);

  const enabledProfiles = config?.profileManifest?.profiles
    ? Object.entries(config.profileManifest.profiles).filter(([, v]) => v.enabledByDefault)
    : [];
  const platforms = config?.modelPolicy?.platforms ? Object.keys(config.modelPolicy.platforms) : [];
  const fileStats = health?.fileStatus ? Object.values(health.fileStatus) : null;
  const filesFound = fileStats ? fileStats.filter(v => v.exists).length : 0;
  const filesTotal = fileStats ? fileStats.length : 0;
  const totalAttestations = plans.reduce((sum, p) => sum + (p.attestations?.length || 0), 0);
  const totalPlans = plans.length;
  const staleMinutes = lastUpdated ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60000) : null;

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
        <div className="page-header-row">
          <div>
            <h1 className="typography-title">Repository Overview</h1>
            <p className="typography-caption">System health, CI status, and configuration drift</p>
          </div>
          {staleMinutes !== null && (
            <span className="typography-caption" style={{ flexShrink: 0 }}>
              Updated {staleMinutes < 1 ? 'just now' : `${staleMinutes}m ago`}
            </span>
          )}
        </div>
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
            {staleMinutes !== null && staleMinutes > 5 && (
              <span className="badge badge--warning">Stale {staleMinutes}m</span>
            )}
          </div>
          <div className="overview-stat"><span className="typography-caption">Last Commit</span><span className="typography-mono">{health?.commit ? health.commit.slice(0, 7) : 'N/A'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Config Drift</span><span className="typography-body">{filesFound}/{filesTotal} files found</span></div>
          <div className="overview-progress-bar"><div className="overview-progress-fill" style={{ width: `${filesTotal > 0 ? (filesFound / filesTotal) * 100 : 0}%` }} /></div>
          <div className="overview-stat" style={{ marginTop: 8 }}>
            <span className="typography-caption">Data Freshness</span>
            <span className="typography-body">{staleMinutes !== null ? (staleMinutes < 1 ? 'Current' : `${staleMinutes}m old`) : '?'}</span>
          </div>
          {health?.attestationStaleness?.stale ? (
            <div className="overview-stat" style={{ marginTop: 4 }}>
              <span className="badge badge--warning">
                {health.attestationStaleness.unboundCount} unbound attestation{health.attestationStaleness.unboundCount !== 1 ? 's' : ''}
              </span>
            </div>
          ) : health?.ledgerFiles && health.ledgerFiles > 0 ? (
            <div className="overview-stat" style={{ marginTop: 4 }}>
              <span className="badge badge--success">All attestations bound</span>
            </div>
          ) : null}
          {health?.attestationStaleness?.unboundProfiles && health.attestationStaleness.unboundProfiles.length > 0 && (
            <div className="cluster cluster--xs" style={{ marginTop: 4 }}>
              {health.attestationStaleness.unboundProfiles.map((p: string) => (
                <span key={p} className="tag tag--warning">{p}</span>
              ))}
            </div>
          )}
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">Plan Summary</h3>
            <span className="typography-caption">{totalPlans} plan{totalPlans !== 1 ? 's' : ''}</span>
          </div>
          <div className="overview-stat"><span className="typography-caption">Active Plans</span><span className="typography-body">{totalPlans}</span></div>
          <div className="overview-stat"><span className="typography-caption">Total Attestations</span><span className="typography-body">{totalAttestations}</span></div>
          {totalPlans > 0 && (
            <div className="overview-stat">
              <span className="typography-caption">Latest</span>
              <span className="typography-mono">{plans[plans.length - 1]?.planId?.slice(0, 16) || '—'}</span>
            </div>
          )}
        </div>

        <div className="surface overview-card">
          <div className="overview-card-header">
            <h3 className="typography-title3">Ledger State</h3>
            {health?.attestationStaleness?.stale ? (
              <span className="badge badge--warning">Stale</span>
            ) : (
              <span className={`status-dot ${health?.ledgerFiles && health.ledgerFiles > 0 ? 'status-dot--success' : 'status-dot--accent'}`} />
            )}
          </div>
          <div className="overview-stat"><span className="typography-caption">Status</span><span className="typography-body">{health?.ledgerStatus || 'N/A'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Files</span><span className="typography-body">{health?.ledgerFiles || 0}</span></div>
          {health?.attestationStaleness?.stale && (
            <div className="overview-stat">
              <span className="badge badge--warning">Stale — attestations don't bind current HEAD</span>
            </div>
          )}
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
