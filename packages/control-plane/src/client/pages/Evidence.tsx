import React, { useEffect, useState } from 'react';

interface EvidenceClaim {
  claim_id: string;
  task_id: string;
  plan_id: string;
  kind: string;
  status: 'pass' | 'fail' | 'stale' | 'missing' | 'pending';
  age: string;
  sha?: string;
  path?: string;
  summary?: string;
}

interface EvidenceData {
  stats: { total: number; fresh: number; stale: number; missing: number };
  claims: EvidenceClaim[];
}

interface EvidenceProps {
  navigate: (path: string) => void;
}

type Filter = 'all' | 'pass' | 'stale' | 'missing';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pass', label: 'PASS' },
  { id: 'stale', label: 'STALE' },
  { id: 'missing', label: 'MISSING' },
];

export default function Evidence({ navigate }: EvidenceProps) {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/evidence')
      .then(r => r.json())
      .then((d) => {
        if (d.ok) setData(d.data);
        else setError(d.error || 'Không thể tải evidence');
        setLoadState('loaded');
      })
      .catch(() => { setError('Không thể tải evidence'); setLoadState('error'); });
  }, []);

  const stats = data?.stats || { total: 0, fresh: 0, stale: 0, missing: 0 };
  const filtered = (data?.claims || []).filter(c => {
    if (filter === 'pass' && c.status !== 'pass') return false;
    if (filter === 'stale' && c.status !== 'stale' && c.status !== 'fail') return false;
    if (filter === 'missing' && c.status !== 'missing' && c.status !== 'pending') return false;
    if (search && !`${c.claim_id} ${c.task_id} ${c.plan_id} ${c.summary || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="cp-page">
      <div className="cp-hero">
        <div className="cp-hero-copy">
          <h1 className="cp-hero-title">Claim-matched proof with freshness and provenance</h1>
        </div>
      </div>

      <div className="cp-status-strip">
        <div className="cp-metric">
          <span className="cp-metric-label">Total evidence</span>
          <span className="cp-metric-value">{stats.total}</span>
        </div>
        <div className="cp-metric">
          <span className="cp-metric-label">Fresh</span>
          <span className="cp-metric-value cp-metric-value--green">{stats.fresh}</span>
        </div>
        <div className="cp-metric">
          <span className="cp-metric-label">Stale</span>
          <span className="cp-metric-value cp-metric-value--amber">{stats.stale}</span>
        </div>
        <div className="cp-metric">
          <span className="cp-metric-label">Missing</span>
          <span className="cp-metric-value cp-metric-value--red">{stats.missing}</span>
        </div>
      </div>

      <div className="cp-toolbar">
        <div className="cp-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`cp-filter ${filter === f.id ? 'cp-filter--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="cp-search">
          <span className="sr-only">Search evidence</span>
          <input type="search" placeholder="Search evidence…" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="cp-panel">
        {loadState === 'loading' && <div className="cp-loading">Loading evidence…</div>}
        {loadState === 'error' && <div className="cp-empty">{error}</div>}
        {loadState === 'loaded' && (
          <table className="cp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>CLAIM</th>
                <th>TASK</th>
                <th>KIND</th>
                <th>STATUS</th>
                <th>AGE</th>
                <th>SHA</th>
                <th>PATH</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={`${c.claim_id}-${i}`}>
                  <td className="cp-cell-mono">{c.claim_id || '—'}</td>
                  <td>{c.summary ? c.summary.slice(0, 60) : '—'}</td>
                  <td className="cp-cell-mono">{c.task_id || '—'}</td>
                  <td>{c.kind || '—'}</td>
                  <td>
                    <span className={`cp-badge cp-badge--${c.status === 'pass' ? 'success' : c.status === 'stale' || c.status === 'fail' ? 'warn' : 'danger'}`}>
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{c.age}</td>
                  <td className="cp-cell-mono">{c.sha || '—'}</td>
                  <td className="cp-cell-mono cp-cell-truncate" title={c.path}>{c.path || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="cp-empty">No evidence matches</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
