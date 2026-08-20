import React, { useEffect, useState } from 'react';

interface HostFact {
  id: string;
  display: string;
  installed: boolean;
  binaryOnPath?: boolean;
  configDir?: boolean;
  desktopProcess?: boolean;
  liveProbe?: boolean;
  candidate?: string | null;
  effective?: string | null;
}

interface HostsData {
  installed: number;
  notInstalled: number;
  hosts: HostFact[];
}

interface HostsProps {
  navigate: (path: string) => void;
}

export default function Hosts({ navigate }: HostsProps) {
  const [data, setData] = useState<HostsData | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    fetch('/api/hosts')
      .then(r => r.json())
      .then((d) => {
        if (d.ok) setData(d.data);
        else setError(d.error || 'Không thể tải hosts');
        setLoadState('loaded');
      })
      .catch(() => { setError('Không thể tải hosts'); setLoadState('error'); });
  }, []);

  function reconcileAll() {
    setReconciling(true);
    setTimeout(() => {
      fetch('/api/hosts')
        .then(r => r.json())
        .then((d) => { if (d.ok) setData(d.data); })
        .finally(() => setReconciling(false));
    }, 600);
  }

  const installed = data?.hosts?.filter(h => h.installed) || [];
  const notInstalled = data?.hosts?.filter(h => !h.installed) || [];

  return (
    <div className="cp-page">
      <div className="cp-hero">
        <div className="cp-hero-copy">
          <h1 className="cp-hero-title">
            {data ? `${data.installed} installed · ${data.notInstalled} not installed — live facts only` : 'Hosts'}
          </h1>
        </div>
        <div className="cp-hero-actions">
          <button className="cp-btn cp-btn--primary" onClick={reconcileAll} disabled={reconciling}>
            {reconciling ? 'Reconciling…' : 'Reconcile all'}
          </button>
        </div>
      </div>

      <div className="cp-panel">
        {loadState === 'loading' && <div className="cp-loading">Loading hosts…</div>}
        {loadState === 'error' && <div className="cp-empty">{error}</div>}
        {loadState === 'loaded' && data && (
          <table className="cp-table">
            <thead>
              <tr>
                <th>HOST</th>
                <th>STATUS</th>
                <th>INSTALL</th>
                <th>CANDIDATE</th>
                <th>EFFECTIVE</th>
              </tr>
            </thead>
            <tbody>
              {[...installed, ...notInstalled].map(h => (
                <tr key={h.id}>
                  <td className="cp-cell-mono">{h.id}</td>
                  <td>
                    <span className={`cp-badge cp-badge--${h.installed ? 'success' : 'neutral'}`}>
                      {h.installed ? 'INSTALLED' : 'NOT_INSTALLED'}
                    </span>
                  </td>
                  <td>
                    {h.installed ? (
                      <span className="cp-install-facts">
                        {h.binaryOnPath && <span className="cp-fact"><span className="cp-fact-check">✓</span> binary-on-path</span>}
                        {h.configDir && <span className="cp-fact"><span className="cp-fact-check">✓</span> config-dir</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="cp-cell-mono">{h.candidate || '—'}</td>
                  <td className="cp-cell-mono">{h.effective || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
