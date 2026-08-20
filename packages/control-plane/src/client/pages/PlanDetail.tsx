import React, { useEffect, useState } from 'react';

interface RequirementRow {
  id: string;
  statement: string;
  status?: string;
  evidence?: string;
}

interface PlanDetailData {
  plan_id?: string;
  name?: string;
  status?: string;
  revision?: number;
  effective?: string;
  shadow?: number;
  requirements?: Array<Record<string, unknown>>;
  claims?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  amendments?: Array<Record<string, unknown>>;
  batches?: Array<Record<string, unknown>>;
}

interface PlanDetailProps {
  planId: string;
  navigate: (path: string) => void;
}

type Tab = 'requirements' | 'claims' | 'tasks' | 'amendments' | 'batches';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'claims', label: 'Claims' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'amendments', label: 'Amendments' },
  { id: 'batches', label: 'Batches' },
];

export default function PlanDetail({ planId, navigate }: PlanDetailProps) {
  const [data, setData] = useState<PlanDetailData | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('requirements');

  useEffect(() => {
    fetch(`/api/plans/${encodeURIComponent(planId)}`)
      .then(r => r.json())
      .then((d) => {
        if (d.ok) setData(d.data || d.plan || d);
        else setError(d.error || 'Plan không khả dụng');
        setLoadState('loaded');
      })
      .catch(() => { setError('Không thể tải plan'); setLoadState('error'); });
  }, [planId]);

  const requirements: RequirementRow[] = (data?.requirements || []).map((r, i) => ({
    id: String(r.id || r.requirement_id || `REQ-${String(i + 1).padStart(3, '0')}`),
    statement: String(r.statement || r.text || r.title || ''),
    status: String(r.status || ''),
    evidence: String(r.evidence || r.evidence_path || ''),
  }));

  return (
    <div className="cp-page">
      <div className="cp-hero">
        <div className="cp-hero-copy">
          <h1 className="cp-hero-title">{data?.name || data?.plan_id || planId}</h1>
          <p className="cp-hero-sub">
            {data ? `revision ${data.revision ?? '—'} · effective ${(data.effective || '—').slice(0, 8)} · shadow ${data.shadow ?? '—'} · ${data.requirements?.length ?? '—'} reqs · ${data.claims?.length ?? '—'} claims` : ''}
          </p>
        </div>
        <div className="cp-hero-actions">
          <button className="cp-btn" onClick={() => navigate('/plans')}>← Plans</button>
          <button className="cp-btn cp-btn--primary" onClick={() => navigate(`/plan?planId=${planId}`)}>Reconcile</button>
        </div>
      </div>

      <div className="cp-tabs" role="tablist" aria-label="Plan sections">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`cp-tab ${tab === t.id ? 'cp-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="cp-panel">
        {loadState === 'loading' && <div className="cp-loading">Loading plan…</div>}
        {loadState === 'error' && <div className="cp-empty">{error}</div>}
        {loadState === 'loaded' && tab === 'requirements' && (
          <table className="cp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>STATEMENT</th>
                <th>STATUS</th>
                <th>EVIDENCE</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map(row => (
                <tr key={row.id}>
                  <td className="cp-cell-mono">{row.id}</td>
                  <td>{row.statement || '—'}</td>
                  <td>
                    <span className={`cp-badge cp-badge--${(row.status || '').toLowerCase().includes('complete') ? 'success' : (row.status || '').toLowerCase().includes('partial') ? 'warn' : 'neutral'}`}>
                      {(row.status || '—').toUpperCase()}
                    </span>
                  </td>
                  <td className="cp-cell-mono">{row.evidence || '—'}</td>
                </tr>
              ))}
              {requirements.length === 0 && <tr><td colSpan={4} className="cp-empty">No requirements in this plan</td></tr>}
            </tbody>
          </table>
        )}
        {loadState === 'loaded' && tab !== 'requirements' && (
          <div className="cp-empty">
            {tab === 'claims' ? 'Claims được liên kết từ evidence của plan (xem Evidence page).' :
             tab === 'tasks' ? 'Tasks theo từng phase của plan.' :
             tab === 'amendments' ? 'Amendments và lịch sử thay đổi requirements.' :
             'Batches được thực thi qua durable runner.'}
          </div>
        )}
      </div>
    </div>
  );
}
