import React, { useEffect, useState } from 'react';

interface PlanRow {
  planId: string;
  status?: string;
  requirements?: number;
  claims?: number;
  revision?: string;
  updated?: string;
}

interface PlansResponse {
  ok: boolean;
  data?: Array<Record<string, unknown>>;
  total?: number;
}

interface PlansProps {
  navigate: (path: string) => void;
}

type Filter = 'all' | 'active' | 'completed' | 'partial';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'partial', label: 'Partial' },
];

export default function Plans({ navigate }: PlansProps) {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then((d: PlansResponse) => {
        if (d.ok && Array.isArray(d.data)) {
          setRows(d.data.map((item: Record<string, unknown>) => ({
            planId: String(item.plan_id || item.planId || item.id || ''),
            status: String(item.status || ''),
            requirements: typeof item.requirements === 'number' ? item.requirements : undefined,
            claims: typeof item.claims === 'number' ? item.claims : undefined,
            revision: String(item.revision || item.rev || ''),
            updated: String(item.updated || ''),
          })));
        }
        setLoadState('loaded');
      })
      .catch(() => { setError('Không thể tải danh sách plans'); setLoadState('error'); });
  }, []);

  const filtered = rows.filter(row => {
    if (filter !== 'all') {
      const status = (row.status || '').toLowerCase();
      if (filter === 'partial' && !status.includes('partial')) return false;
      if (filter === 'active' && !status.includes('active') && !status.includes('running')) return false;
      if (filter === 'completed' && !status.includes('complete')) return false;
    }
    if (search && !row.planId.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="cp-page">
      <div className="cp-hero">
        <div className="cp-hero-copy">
          <h1 className="cp-hero-title">All harness plans and their lifecycle state</h1>
        </div>
        <div className="cp-hero-actions">
          <button className="cp-btn cp-btn--primary" onClick={() => navigate('/plans')}>New plan</button>
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
          <span className="sr-only">Search plans</span>
          <input
            type="search"
            placeholder="Search plans…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="cp-panel">
        {loadState === 'loading' && <div className="cp-loading">Loading plans…</div>}
        {loadState === 'error' && <div className="cp-empty">{error}</div>}
        {loadState === 'loaded' && (
          <table className="cp-table">
            <thead>
              <tr>
                <th>PLAN ID</th>
                <th>STATUS</th>
                <th>REQ</th>
                <th>CLAIMS</th>
                <th>REV</th>
                <th>UPDATED</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.planId}>
                  <td className="cp-cell-mono">{row.planId || '—'}</td>
                  <td>
                    <span className={`cp-badge cp-badge--${(row.status || '').toLowerCase().includes('complete') ? 'success' : 'warn'}`}>
                      {(row.status || '—').toUpperCase()}
                    </span>
                  </td>
                  <td>{row.requirements != null ? `${row.requirements} reqs` : '—'}</td>
                  <td>{row.claims != null ? `${row.claims} claims` : '—'}</td>
                  <td className="cp-cell-mono">{row.revision || '—'}</td>
                  <td>{row.updated || '—'}</td>
                  <td>
                    <a
                      className="cp-link"
                      href={`/plans/${row.planId}`}
                      onClick={e => { e.preventDefault(); navigate(`/plans/${row.planId}`); }}
                    >
                      Open →
                    </a>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="cp-empty">No plans match</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
