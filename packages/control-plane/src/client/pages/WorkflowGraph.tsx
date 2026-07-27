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

export default function WorkflowGraph() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

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
      <div>
        <h1 className="page-title">Workflow Graph</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Workflow Graph</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Workflow Graph</h1>

      <div className="flex-row flex-wrap mb-lg" style={{ gap: 16, alignItems: 'stretch' }}>
        {ROLES.map(role => (
          <div key={role} className="card" style={{ minWidth: 180, flex: 1 }}>
            <div className="text-xs text-secondary" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{role}</div>
            {(agentMap[role] || []).length === 0 ? (
              <div className="text-xs text-secondary">No agents defined</div>
            ) : (
              agentMap[role].map((a, i) => (
                <div key={i} className="list-item--compact" style={{ borderBottom: '1px solid var(--border-secondary)', padding: '4px 0' }}>
                  <div className="text-link">{a.file?.replace('.md', '')}</div>
                  <div className="text-xs text-secondary">{a.platform}</div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <div className="card mb-lg">
        <h3 className="card-title">Dependency & Active Status</h3>
        <div className="text-sm" style={{ lineHeight: 1.6 }}>
          <p><strong>Coordinator</strong> &rarr; routes tasks to Architect, Workers, and Reviewer/Verifier chain.</p>
          <p><strong>Architect</strong> &rarr; produces plan artifacts consumed by Workers.</p>
          <p><strong>Workers</strong> &rarr; execute assigned slices, output receipts.</p>
          <p><strong>Reviewer</strong> &rarr; reviews evidence, produces findings.</p>
          <p><strong>Verifier</strong> &rarr; final gate before acceptance.</p>
        </div>

        {manifest?.load_order && (
          <div className="mt-md">
            <div className="text-xs text-secondary mb-sm">Context Load Order (from manifest.yaml):</div>
            {manifest.load_order.map((r: string, i: number) => (
              <div key={i} className="flex-row" style={{ padding: '4px 0', gap: 8 }}>
                <span className="text-secondary" style={{ width: 20 }}>#{i}</span>
                <span>{r}</span>
                <span className="text-success text-xs"><span className="dot dot--success" />active</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
