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

interface AuditProps {
  segments: string[];
  navigate: (path: string) => void;
}

export default function Audit({ segments, navigate }: AuditProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const mountedRef = useRef(true);

  const eventId = segments[1] || null;

  useEffect(() => {
    mountedRef.current = true;
    fetch('/api/audit?limit=200')
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

  const actions = [...new Set(events.map(e => e.action))].sort();
  const filteredEvents = events.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return e.target_file.toLowerCase().includes(q) ||
        (e.description?.toLowerCase().includes(q) || false);
    }
    return true;
  });
  const selectedEvent = events.find(e => e.id === Number(eventId));

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Audit Log</h1>
          <p className="typography-caption">Mutation history, backups, and evidence receipts</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Audit Log</h1>
          <p className="typography-caption">Mutation history, backups, and evidence receipts</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Audit Log</h1>
        <p className="typography-caption">Mutation history, backups, and evidence receipts</p>
      </div>

      <div className="audit-toolbar">
        <div className="audit-filters">
          <input
            type="text"
            placeholder="Search by file or description..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="audit-search"
            aria-label="Filter audit events"
          />
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="audit-select"
            aria-label="Filter by action type"
          >
            <option value="">All actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <span className="typography-caption">{filteredEvents.length} events</span>
      </div>

      <div className="audit-layout">
        <div className="surface audit-list">
          {filteredEvents.length === 0 ? (
            <div className="state-empty" style={{ padding: '24px 0' }}>
              {events.length === 0 ? 'No audit events yet. Mutations will be recorded here.' : 'No events match filter'}
            </div>
          ) : (
            filteredEvents.map(e => (
              <button
                key={e.id}
                onClick={() => navigate(`/audit/${e.id}`)}
                className={`audit-event-item ${eventId === String(e.id) ? 'audit-event-item--selected' : ''}`}
              >
                <div className="audit-event-item-row">
                  <span className={`badge ${e.status === 'committed' ? 'badge--success' : 'badge--danger'}`} style={{ fontSize: 10 }}>
                    {e.status}
                  </span>
                  <span className="typography-mono" style={{ fontSize: 11, color: 'var(--color-text-link)' }}>{e.action}</span>
                </div>
                <div className="audit-event-item-row">
                  <span className="typography-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.target_file}
                  </span>
                </div>
                <div className="audit-event-item-row">
                  <span className="typography-caption" style={{ fontSize: 10 }}>
                    {e.ts?.slice(0, 19).replace('T', ' ')}
                  </span>
                  <span className="typography-caption" style={{ fontSize: 10 }}>{e.user}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {selectedEvent ? (
          <div className="surface audit-detail">
            <h3 className="typography-title3" style={{ marginBottom: 12 }}>Event Detail</h3>
            <div className="stack stack--xs">
              <div className="detail-field"><span className="typography-caption">Event ID</span><span className="typography-mono">{selectedEvent.id}</span></div>
              <div className="detail-field"><span className="typography-caption">Action</span><span className="typography-body" style={{ color: 'var(--color-text-link)' }}>{selectedEvent.action}</span></div>
              <div className="detail-field"><span className="typography-caption">Target</span><span className="typography-mono">{selectedEvent.target_file}</span></div>
              <div className="detail-field"><span className="typography-caption">Description</span><span className="typography-body">{selectedEvent.description || '-'}</span></div>
              <div className="detail-field"><span className="typography-caption">User</span><span className="typography-body">{selectedEvent.user}</span></div>
              <div className="detail-field"><span className="typography-caption">Timestamp</span><span className="typography-body">{selectedEvent.ts?.slice(0, 19).replace('T', ' ')}</span></div>
              <div className="detail-field"><span className="typography-caption">Status</span><span className={`typography-body ${selectedEvent.status === 'committed' ? 'text-success' : 'text-danger'}`}>{selectedEvent.status}</span></div>
              <div className="detail-field"><span className="typography-caption">Old Hash</span><span className="typography-mono" style={{ fontSize: 11 }}>{selectedEvent.old_hash?.slice(0, 16) || '-'}</span></div>
              <div className="detail-field"><span className="typography-caption">New Hash</span><span className="typography-mono" style={{ fontSize: 11 }}>{selectedEvent.new_hash?.slice(0, 16) || '-'}</span></div>
              <div className="detail-field"><span className="typography-caption">Backup</span><span className="typography-mono" style={{ fontSize: 11 }}>{selectedEvent.backup_path ? selectedEvent.backup_path.split('/').pop() : '-'}</span></div>
            </div>
          </div>
        ) : (
          <div className="surface audit-detail audit-detail--empty">
            <div style={{ textAlign: 'center' }}>
              <div className="typography-title3" style={{ marginBottom: 8 }}>Select an Event</div>
              <p className="typography-caption">Choose an audit event to view details, hashes, and evidence receipts</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
