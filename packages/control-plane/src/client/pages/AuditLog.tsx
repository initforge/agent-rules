import React, { useEffect, useState, useRef } from 'react';

interface AuditEvent {
  id: number;
  ts: string;
  action: string;
  target_file: string;
  description: string | null;
  old_hash: string | null;
  new_hash: string | null;
  backup_path: string | null;
  user: string;
  status: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    fetch('/api/audit?limit=100')
      .then(r => { if (!r.ok) throw new Error('Failed to fetch audit log'); return r.json(); })
      .then(d => {
        if (!mountedRef.current) return;
        if (d.ok) setEvents(d.data);
        setLoadState('loaded');
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoadState('error');
      });

    return () => { mountedRef.current = false; };
  }, []);

  if (loadState === 'loading') {
    return (
      <div>
        <h1 className="page-title">Audit Log</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Audit Log</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Audit Log</h1>

      <div className="card">
        {events.length === 0 ? (
          <div className="state-empty">No audit events yet. Mutations will be recorded here.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Old Hash</th>
                  <th>New Hash</th>
                  <th>Backup</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td className="text-secondary">{e.ts?.slice(0, 19).replace('T', ' ')}</td>
                    <td className="text-link">{e.action}</td>
                    <td className="text-truncate" style={{ maxWidth: 200 }}>{e.target_file}</td>
                    <td className="text-xs text-mono text-secondary">{e.old_hash?.slice(0, 12) || '-'}</td>
                    <td className="text-xs text-mono text-secondary">{e.new_hash?.slice(0, 12) || '-'}</td>
                    <td className="text-xs text-secondary">{e.backup_path ? e.backup_path.split('\\').pop()?.split('/').pop() : '-'}</td>
                    <td className={e.status === 'committed' ? 'text-success' : 'text-danger'}>{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
