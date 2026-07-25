import React, { useEffect, useState } from 'react';

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

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit?limit=100').then(r => r.json()).then(d => {
      if (d.ok) setEvents(d.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Audit Log</h1>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
        {loading ? (
          <div style={{ color: '#8b949e', fontSize: 12 }}>Loading...</div>
        ) : events.length === 0 ? (
          <div style={{ color: '#8b949e', fontSize: 12 }}>No audit events yet. Mutations will be recorded here.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Timestamp</th>
                <th style={{ padding: '6px 8px' }}>Action</th>
                <th style={{ padding: '6px 8px' }}>Target</th>
                <th style={{ padding: '6px 8px' }}>Old Hash</th>
                <th style={{ padding: '6px 8px' }}>New Hash</th>
                <th style={{ padding: '6px 8px' }}>Backup</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '6px 8px', color: '#8b949e' }}>{e.ts?.slice(0, 19).replace('T', ' ')}</td>
                  <td style={{ padding: '6px 8px', color: '#58a6ff' }}>{e.action}</td>
                  <td style={{ padding: '6px 8px', color: '#e1e4e8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.target_file}</td>
                  <td style={{ padding: '6px 8px', color: '#8b949e', fontFamily: 'monospace', fontSize: 10 }}>{e.old_hash?.slice(0, 12) || '-'}</td>
                  <td style={{ padding: '6px 8px', color: '#8b949e', fontFamily: 'monospace', fontSize: 10 }}>{e.new_hash?.slice(0, 12) || '-'}</td>
                  <td style={{ padding: '6px 8px', color: '#8b949e', fontSize: 10 }}>{e.backup_path ? e.backup_path.split('\\').pop()?.split('/').pop() : '-'}</td>
                  <td style={{ padding: '6px 8px', color: e.status === 'committed' ? '#3fb950' : '#f85149' }}>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
