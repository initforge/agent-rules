import React, { useEffect, useState, useRef, useCallback } from 'react';

interface FileStatusEntry { exists: boolean; size: number; }
interface DirStatusEntry { exists: boolean; entryCount: number; }

interface AttestationStaleness {
  stale?: boolean;
  unboundCount?: number;
  unboundProfiles?: string[];
  error?: string;
}

interface IntegrityFinding {
  kind: string;
  detail: string;
}

interface IntegrityFailure {
  ok: false;
  code: 'INTEGRITY_FAILURE';
  error: string;
  details: {
    findings: IntegrityFinding[];
  };
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

interface CiStatus {
  state: 'verified' | 'stale' | 'unverified' | 'unknown';
  totalPlans: number;
  boundAttestations: number;
  totalAttestations: number;
  lastPlanStatus: string;
}

type LoadState = 'loading' | 'loaded' | 'error' | 'offline';

interface OverviewProps {
  navigate: (path: string) => void;
}

export default function Overview({ navigate }: OverviewProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [ciStatus, setCiStatus] = useState<CiStatus>({ state: 'unknown', totalPlans: 0, boundAttestations: 0, totalAttestations: 0, lastPlanStatus: '' });
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [integrityFailure, setIntegrityFailure] = useState<IntegrityFailure | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(() => {
    let stale = false;
    const timer = setTimeout(() => { if (mountedRef.current && loadState === 'loading') stale = true; }, 5000);

    const planListRes = fetch('/api/plans').then(async r => {
      const data = await r.json();
      if (!r.ok && r.status === 409 && data.code === 'INTEGRITY_FAILURE') {
        if (mountedRef.current) setIntegrityFailure(data);
        return { plans: [] };
      }
      if (!r.ok) {
        throw new Error('Failed to fetch plans');
      }
      return data;
    }).catch(() => ({ plans: [] }));

    Promise.all([
      fetch('/api/health').then(r => { if (!r.ok) throw new Error('Health check failed'); return r.json(); }),
      fetch('/api/config/all').then(r => { if (!r.ok) throw new Error('Config fetch failed'); return r.json(); }),
      planListRes,
    ]).then(([h, c, p]) => {
      if (!mountedRef.current) return null;
      setHealth(h);
      if (c.ok) setConfig(c.data);
      if (p.plans && p.plans.length > 0) {
        setPlans(p.plans);
        const lastPlanId = p.plans[p.plans.length - 1].planId;
        return fetch(`/api/plans/${lastPlanId}`).then(async r => {
          const pd = await r.json();
          if (!r.ok && r.status === 409 && pd.code === 'INTEGRITY_FAILURE') {
            if (mountedRef.current) setIntegrityFailure(pd);
            setCiStatus({ state: 'unverified', totalPlans: p.plans.length, boundAttestations: 0, totalAttestations: 0, lastPlanStatus: 'INTEGRITY_FAILURE' });
            setLastUpdated(new Date().toISOString());
            setLoadState('loaded');
            return null;
          }
          if (!r.ok) {
            throw new Error(`Failed to fetch plan (${r.status})`);
          }
          return pd;
        }).then(pd => {
          if (!mountedRef.current || !pd) return;
          const planAttestations: Array<Record<string, unknown>> = pd.attestations || [];
          const boundCount = planAttestations.filter((a: Record<string, unknown>) => a.status === 'BOUND').length;
          if (planAttestations.length === 0) {
            setCiStatus({ state: 'unverified', totalPlans: p.plans.length, boundAttestations: 0, totalAttestations: 0, lastPlanStatus: pd.status });
          } else if (boundCount < planAttestations.length) {
            setCiStatus({ state: 'stale', totalPlans: p.plans.length, boundAttestations: boundCount, totalAttestations: planAttestations.length, lastPlanStatus: pd.status });
          } else {
            setCiStatus({ state: 'verified', totalPlans: p.plans.length, boundAttestations: boundCount, totalAttestations: planAttestations.length, lastPlanStatus: pd.status });
          }
          setLastUpdated(new Date().toISOString());
          setLoadState('loaded');
        });
      } else {
        setCiStatus({ state: 'unverified', totalPlans: 0, boundAttestations: 0, totalAttestations: 0, lastPlanStatus: '' });
        setLastUpdated(new Date().toISOString());
        setLoadState('loaded');
      }
      return null;
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
      <div className="page" aria-busy="true" aria-live="polite">
        <div className="page-header">
          <h1 className="typography-title">Repository Overview</h1>
          <p className="typography-caption">System health, CI status, and configuration drift</p>
        </div>
        <div className="state-loading" role="status"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page" role="alert" aria-live="assertive">
        <div className="page-header">
          <h1 className="typography-title">Repository Overview</h1>
          <p className="typography-caption">System health, CI status, and configuration drift</p>
        </div>
        <div className="state-error">{error}</div>
        {integrityFailure && (
          <div className="surface overview-integrity-banner" role="alert" aria-live="assertive">
            <div className="overview-integrity-header">
              <span className="badge badge--danger">Integrity Failure</span>
              <span className="typography-caption">Workspace integrity check failed</span>
            </div>
            <ul className="overview-integrity-findings">
              {(integrityFailure.details?.findings || []).slice(0, 5).map((f, i) => (
                <li key={i} className="typography-caption">
                  <span className="badge badge--danger badge--sm">{f.kind}</span> {f.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
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
        {integrityFailure && (
          <div className="surface overview-integrity-banner" role="alert" aria-live="assertive">
            <div className="overview-integrity-header">
              <span className="badge badge--danger">Integrity Failure</span>
              <span className="typography-caption">Cached data may be unreliable due to integrity check failure</span>
            </div>
          </div>
        )}
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

      {integrityFailure && (
        <div className="surface overview-integrity-banner" role="alert" aria-live="assertive">
          <div className="overview-integrity-header">
            <span className="badge badge--danger">Integrity Failure</span>
            <span className="typography-caption">Workspace integrity check failed — evidence may not be reliable</span>
          </div>
          <ul className="overview-integrity-findings">
            {(integrityFailure.details?.findings || []).slice(0, 5).map((f, i) => (
              <li key={i} className="typography-caption">
                <span className="badge badge--danger badge--sm">{f.kind}</span> {f.detail}
              </li>
            ))}
            {(integrityFailure.details?.findings || []).length > 5 && (
              <li className="typography-caption">+{(integrityFailure.details?.findings || []).length - 5} more findings</li>
            )}
          </ul>
        </div>
      )}

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
            {ciStatus.state === 'verified' && <span className="badge badge--success">Verified</span>}
            {ciStatus.state === 'stale' && <span className="badge badge--warning">Stale</span>}
            {ciStatus.state === 'unverified' && <span className="badge badge--default">Unverified</span>}
          </div>
          <div className="overview-stat"><span className="typography-caption">Status</span><span className="typography-body">{ciStatus.state === 'verified' ? 'All attestations bound' : ciStatus.state === 'stale' ? `${ciStatus.totalAttestations - ciStatus.boundAttestations} unbound attestations` : ciStatus.state === 'unverified' ? 'No attestations recorded' : 'Unknown'}</span></div>
          <div className="overview-stat"><span className="typography-caption">Plans</span><span className="typography-body">{ciStatus.totalPlans}</span></div>
          <div className="overview-stat"><span className="typography-caption">Attestations</span><span className="typography-body">{ciStatus.boundAttestations}/{ciStatus.totalAttestations} bound</span></div>
          {ciStatus.lastPlanStatus && (
            <div className="overview-stat"><span className="typography-caption">Latest Plan</span><span className="typography-body">{ciStatus.lastPlanStatus}</span></div>
          )}
          {staleMinutes !== null && staleMinutes > 5 && (
            <div className="overview-stat" style={{ marginTop: 4 }}>
              <span className="badge badge--warning">Data {staleMinutes}m old</span>
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
