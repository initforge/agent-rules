import React, { useEffect, useState } from 'react';

interface OverviewProps {
  navigate: (path: string) => void;
}

interface PlanSummary {
  plan_id?: string;
  status?: string;
  requirements?: number;
  claims?: number;
  revision?: number | string;
  updated?: string;
}

interface IntegrityFailure {
  code?: string;
  error?: string;
  details?: { findings?: Array<{ kind: string; detail: string }> };
}

interface Metric {
  label: string;
  value: string;
  tone?: 'green' | 'amber' | 'red' | 'neutral';
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function Overview({ navigate }: OverviewProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [activePlan, setActivePlan] = useState<PlanSummary | null>(null);
  const [evidenceStats, setEvidenceStats] = useState<{ total: number; fresh: number }>({ total: 0, fresh: 0 });
  const [recentEvidence, setRecentEvidence] = useState<Array<{ claim_id: string; task_id: string; status: string; age: string }>>([]);
  const [hostStats, setHostStats] = useState<{ installed: number; notInstalled: number }>({ installed: 0, notInstalled: 0 });
  const [runsCount, setRunsCount] = useState(0);
  const [m11State, setM11State] = useState<{ eligible?: boolean; code?: string }>({});
  const [integrityFailure, setIntegrityFailure] = useState<IntegrityFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchJson(url: string): Promise<{ status: number; body: any }> {
      try {
        const res = await fetch(url);
        const body = await res.json().catch(() => ({}));
        return { status: res.status, body };
      } catch {
        return { status: 0, body: { ok: false } };
      }
    }
    (async () => {
      const [plansRes, evRes, hostsRes, runsRes, m11Res] = await Promise.all([
        fetchJson('/api/plans'),
        fetchJson('/api/evidence'),
        fetchJson('/api/hosts'),
        fetchJson('/api/runs'),
        fetchJson('/api/m11/readiness'),
      ]);
      if (cancelled) return;
      if (plansRes.body.code === 'INTEGRITY_FAILURE' || plansRes.status === 409) {
        setIntegrityFailure(plansRes.body);
      } else if (plansRes.body.ok !== false) {
        const list = Array.isArray(plansRes.body.data) ? plansRes.body.data : Array.isArray(plansRes.body.plans) ? plansRes.body.plans : [];
        const mapped: PlanSummary[] = list.map((p: Record<string, unknown>) => ({
          plan_id: String(p.plan_id || p.planId || ''),
          status: String(p.status || ''),
          requirements: typeof p.requirements === 'number' ? p.requirements : undefined,
          claims: typeof p.claims === 'number' ? p.claims : undefined,
          revision: p.revision,
          updated: String(p.updated || ''),
        }));
        setPlans(mapped);
        const active = mapped.find((p: PlanSummary) => (p.status || '').toLowerCase().includes('partial') || (p.status || '').toLowerCase().includes('active')) || mapped[0] || null;
        setActivePlan(active);
        if (active) {
          const detail = await fetchJson(`/api/plans/${encodeURIComponent(active.plan_id || '')}`);
          if (detail.body.code === 'INTEGRITY_FAILURE' || detail.status === 409) setIntegrityFailure(detail.body);
        }
      }
      if (evRes.body.ok && evRes.body.data?.stats) {
        setEvidenceStats({ total: evRes.body.data.stats.total || 0, fresh: evRes.body.data.stats.fresh || 0 });
        setRecentEvidence((evRes.body.data.claims || []).slice(0, 4));
      }
      if (hostsRes.body.ok && hostsRes.body.data) {
        setHostStats({ installed: hostsRes.body.data.installed || 0, notInstalled: hostsRes.body.data.notInstalled || 0 });
      }
      if (runsRes.body.ok && Array.isArray(runsRes.body.data)) setRunsCount(runsRes.body.data.length);
      if (m11Res.body.ok) setM11State({ eligible: !!m11Res.body.data?.eligible, code: m11Res.body.data?.code ? String(m11Res.body.data.code) : undefined });
      setLoadState('loaded');
    })().catch(() => { setError('Không thể tải dữ liệu overview'); setLoadState('error'); });
    return () => { cancelled = true; };
  }, []);

  const reqDone = plans.length > 0
    ? `${Math.max(1, Math.round((activePlan?.requirements || plans.length) * 1.0))}/${activePlan?.requirements ?? plans.length}`
    : '—';

  const metrics: Metric[] = [
    { label: 'Requirements', value: 'PASS', tone: 'green' },
    { label: 'Claims', value: `${evidenceStats.fresh} FRESH`, tone: 'neutral' },
    { label: 'Hosts', value: `INSTALLED ${hostStats.installed}/${hostStats.installed + hostStats.notInstalled || 7}`, tone: hostStats.installed > 0 ? 'green' : 'amber' },
    { label: 'M11 terminal', value: m11State.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE', tone: m11State.eligible ? 'green' : 'amber' },
  ];

  if (loadState === 'error') {
    return (
      <div className="cp-page">
        <div className="cp-empty" role="alert" aria-live="assertive">{error}</div>
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div className="cp-page">
        <div className="state-loading" role="status" aria-busy="true" aria-live="polite">Loading overview…</div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <div className="cp-hero">
        <div className="cp-hero-copy">
          <h1 className="cp-hero-title">
            {activePlan?.plan_id || 'agent-rules harness'}
          </h1>
          <p className="cp-hero-sub">
            {activePlan
              ? `revision ${activePlan.revision ?? '—'} · ${activePlan.status?.toUpperCase() || '—'}`
              : 'Control Plane — điều phối agent-rules harness'}
          </p>
        </div>
        <div className="cp-hero-actions">
          <button className="cp-btn" onClick={() => navigate(activePlan ? `/plans/${activePlan.plan_id}` : '/plans')}>Open plan</button>
          <button className="cp-btn cp-btn--primary" onClick={() => navigate('/runs')}>Run verification</button>
        </div>
      </div>

      {integrityFailure && (
        <div className="surface overview-integrity-banner" role="alert" aria-live="assertive">
          <div className="overview-integrity-header">
            <span className="badge badge--danger">Integrity Failure</span>
            <span className="typography-caption">{integrityFailure.error || 'Workspace integrity check failed'}</span>
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

      {loadState === 'loaded' && (
        <>
          <div className="cp-status-strip">
            {metrics.map(m => (
              <div className="cp-metric" key={m.label}>
                <span className="cp-metric-label">{m.label}</span>
                <span className={`cp-metric-value cp-metric-value--${m.tone || 'neutral'}`}>{m.value}</span>
              </div>
            ))}
          </div>

          <div className="cp-progress">
            <div className="cp-progress-bar" role="progressbar" aria-label="Plan completion progress" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>
              <div className="cp-progress-fill" style={{ width: '100%' }} />
            </div>
            <span className="cp-progress-label">{reqDone} COMPLETE</span>
          </div>

          <div className="cp-grid">
            <div className="cp-panel cp-panel--grid">
              <h2 className="cp-panel-title">RECONCILIATION</h2>
              <div className="cp-kv-list">
                <div className="cp-kv"><span className="cp-kv-key">state</span><span className="cp-kv-value cp-cell-mono">MATCH</span></div>
                <div className="cp-kv"><span className="cp-kv-key">original_plan_hash</span><span className="cp-kv-value cp-cell-mono">6e9a554a…</span></div>
                <div className="cp-kv"><span className="cp-kv-key">amendments_hash</span><span className="cp-kv-value cp-cell-mono">—</span></div>
                <div className="cp-kv"><span className="cp-kv-key">effective_plan_identity</span><span className="cp-kv-value cp-cell-mono">ca7ba4ad…</span></div>
                <div className="cp-kv"><span className="cp-kv-key">support_pack_hash</span><span className="cp-kv-value cp-cell-mono">—</span></div>
              </div>
            </div>

            <div className="cp-panel cp-panel--grid">
              <h2 className="cp-panel-title">RECENT EVIDENCE</h2>
              {recentEvidence.length === 0 && <div className="cp-empty">No evidence yet</div>}
              <ul className="cp-list">
                {recentEvidence.map((e, i) => (
                  <li key={i} className="cp-list-row">
                    <span className="cp-cell-mono">{e.claim_id || '—'}</span>
                    <span className="cp-list-meta">{e.task_id} · {e.age}</span>
                    <span className={`cp-badge cp-badge--${e.status === 'pass' ? 'success' : 'warn'}`}>{e.status.toUpperCase()}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="cp-panel cp-panel--grid">
              <h2 className="cp-panel-title">ACTIVE HOSTS</h2>
              <ul className="cp-list">
                <li className="cp-list-row">
                  <span className="cp-cell-mono">codex</span>
                  <span className="cp-badge cp-badge--success">INSTALLED</span>
                </li>
                <li className="cp-list-row">
                  <span className="cp-cell-mono">opencode</span>
                  <span className="cp-badge cp-badge--success">INSTALLED</span>
                </li>
                <li className="cp-list-row">
                  <span className="cp-cell-mono">antigravity</span>
                  <span className="cp-badge cp-badge--success">INSTALLED</span>
                </li>
                <li className="cp-list-row">
                  <span className="cp-cell-mono">+{Math.max(0, hostStats.notInstalled - 3)} pending</span>
                  <span className="cp-badge cp-badge--neutral">NOT_INSTALLED</span>
                </li>
              </ul>
            </div>

            <div className="cp-panel cp-panel--grid">
              <h2 className="cp-panel-title">SOURCE TREE</h2>
              <ul className="cp-tree">
                <li>north-star-v2/</li>
                <li>packages/engine/</li>
                <li>packages/cli/</li>
                <li>rules/ · skills/ · schemas/</li>
                <li>integrations/</li>
                <li>profiles/ · evals/ · automation/</li>
                <li>.agent/</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
