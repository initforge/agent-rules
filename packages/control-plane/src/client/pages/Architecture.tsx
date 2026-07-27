import React, { useEffect, useState, useRef } from 'react';

interface Agent {
  platform: string;
  file: string;
  path: string;
}

interface ManifestData {
  load_order?: string[];
}

type LoadState = 'loading' | 'loaded' | 'error';

const ROLES = ['coordinator', 'architect', 'worker', 'reviewer', 'verifier'];

interface ArchitectureProps {
  segments: string[];
  navigate: (path: string) => void;
}

type ArchView = 'dag' | 'subsystems' | 'routes';

export default function Architecture({ segments, navigate }: ArchitectureProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  const view = (segments[1] as ArchView) || 'dag';
  const VIEWS: { id: ArchView; label: string }[] = [
    { id: 'dag', label: 'Dependency DAG' },
    { id: 'subsystems', label: 'Subsystems' },
    { id: 'routes', label: 'Routing' },
  ];

  useEffect(() => {
    mountedRef.current = true;
    Promise.all([
      fetch('/api/config/agents').then(r => { if (!r.ok) throw new Error('Failed to fetch agents'); return r.json(); }),
      fetch('/api/config/all').then(r => { if (!r.ok) throw new Error('Failed to fetch config'); return r.json(); }),
    ]).then(([a, c]) => {
      if (!mountedRef.current) return;
      if (a.ok) setAgents(a.data);
      if (c.ok) setManifest(c.data.manifest);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    });
    return () => { mountedRef.current = false; };
  }, []);

  const agentMap: Record<string, Agent[]> = {};
  for (const a of agents) {
    const role = ROLES.find(r => a.file?.toLowerCase().includes(r)) || 'other';
    if (!agentMap[role]) agentMap[role] = [];
    agentMap[role].push(a);
  }

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Architecture</h1>
          <p className="typography-caption">Subsystem dependency graph, model routing, and agent roles</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Architecture</h1>
          <p className="typography-caption">Subsystem dependency graph, model routing, and agent roles</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Architecture</h1>
        <p className="typography-caption">Subsystem dependency graph, model routing, and agent roles</p>
      </div>

      <div className="arch-tabs" role="tablist" aria-label="Architecture views">
        {VIEWS.map(v => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => navigate(`/architecture/${v.id}`)}
            className={`arch-tab ${view === v.id ? 'arch-tab--active' : ''}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'dag' && (
        <div className="arch-dag">
          <div className="cluster cluster--md" style={{ alignItems: 'stretch' }}>
            {ROLES.map(role => (
              <div key={role} className="surface arch-role-card">
                <div className="arch-role-header">
                  <span className="typography-title3" style={{ textTransform: 'capitalize' }}>{role}</span>
                  <span className="typography-caption">{(agentMap[role] || []).length} agents</span>
                </div>
                {(agentMap[role] || []).length === 0 ? (
                  <div className="typography-caption">No agents defined</div>
                ) : (
                  agentMap[role].map((a, i) => (
                    <div key={i} className="arch-agent-item">
                      <div className="typography-body" style={{ color: 'var(--color-text-link)' }}>{a.file?.replace('.md', '')}</div>
                      <div className="typography-caption">{a.platform}</div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>

          <div className="surface arch-flow" style={{ marginTop: 16, padding: 16 }}>
            <h3 className="typography-title3" style={{ marginBottom: 12 }}>Execution Flow</h3>
            <div className="arch-flow-steps">
              <div className="arch-flow-step"><span className="arch-flow-arrow">Coordinator</span> <span className="arch-flow-dash">&rarr;</span> routes tasks</div>
              <div className="arch-flow-step"><span className="arch-flow-arrow">Architect</span> <span className="arch-flow-dash">&rarr;</span> produces plan artifacts</div>
              <div className="arch-flow-step"><span className="arch-flow-arrow">Workers</span> <span className="arch-flow-dash">&rarr;</span> execute slices, output receipts</div>
              <div className="arch-flow-step"><span className="arch-flow-arrow">Reviewer</span> <span className="arch-flow-dash">&rarr;</span> reviews evidence</div>
              <div className="arch-flow-step"><span className="arch-flow-arrow">Verifier</span> <span className="arch-flow-dash">&rarr;</span> final gate</div>
            </div>
          </div>
        </div>
      )}

      {view === 'subsystems' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 12 }}>Subsystem Registry</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Owner</th>
                  <th>Purpose</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { path: 'rules/', owner: 'harness-maintainer', purpose: 'Global context', status: 'active' },
                  { path: 'skills/', owner: 'harness-maintainer', purpose: 'Capability workflows', status: 'active' },
                  { path: 'integrations/', owner: 'harness-maintainer', purpose: 'Tool registry', status: 'active' },
                  { path: 'platforms/', owner: 'harness-maintainer', purpose: 'Runtime adapters', status: 'active' },
                  { path: 'profiles/', owner: 'profile-owner', purpose: 'Org overlays', status: 'active' },
                  { path: 'packages/cli/', owner: 'harness-maintainer', purpose: 'CLI', status: 'active' },
                  { path: 'packages/control-plane/', owner: 'harness-maintainer', purpose: 'Dashboard + API', status: 'active' },
                ].map((s, i) => (
                  <tr key={i}>
                    <td className="typography-mono">{s.path}</td>
                    <td className="typography-body">{s.owner}</td>
                    <td className="typography-caption">{s.purpose}</td>
                    <td><span className="badge badge--success">{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {manifest?.load_order && (
            <div style={{ marginTop: 16 }}>
              <h4 className="typography-title3" style={{ marginBottom: 8 }}>Context Load Order</h4>
              {manifest.load_order.map((r, i) => (
                <div key={i} className="arch-flow-step" style={{ padding: '6px 0' }}>
                  <span className="typography-mono" style={{ color: 'var(--color-text-secondary)', width: 24 }}>#{i}</span>
                  <span className="typography-body">{r}</span>
                  <span className="badge badge--success" style={{ marginLeft: 8 }}>active</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'routes' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 12 }}>Model Routing</h3>
          <p className="typography-caption" style={{ marginBottom: 16 }}>Requested &rarr; Resolved &rarr; Observed model routing paths</p>
          <div className="state-empty" style={{ padding: '24px 0' }}>Routing data not available. Configure model policies in Configuration.</div>
        </div>
      )}
    </div>
  );
}
