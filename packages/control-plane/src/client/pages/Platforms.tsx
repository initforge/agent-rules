import React, { useEffect, useState, useRef } from 'react';

interface Agent {
  platform: string;
  file: string;
  path: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function Platforms() {
  const [platforms, setPlatforms] = useState<Record<string, unknown> | null>(null);
  const [capability, setCapability] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    Promise.all([
      fetch('/api/config/platforms').then(r => { if (!r.ok) throw new Error('Failed to fetch platforms'); return r.json(); }),
      fetch('/api/config/agents').then(r => { if (!r.ok) throw new Error('Failed to fetch agents'); return r.json(); }),
    ]).then(([p, a]) => {
      if (!mountedRef.current) return;
      if (p.ok) setPlatforms(p.data);
      if (a.ok) setAgents(a.data);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    });

    fetch('/api/config/file?path=guides/06-platform-capability.md')
      .then(r => { if (!r.ok) throw new Error('Failed to fetch capability'); return r.json(); })
      .then(d => { if (mountedRef.current && d.ok) setCapability(d.data); })
      .catch(() => {});

    return () => { mountedRef.current = false; };
  }, []);

  if (loadState === 'loading') {
    return (
      <div>
        <h1 className="page-title">Platforms</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Platforms</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Platforms</h1>

      {platforms && Object.keys(platforms).length > 0 ? (
        <div className="grid grid--wide mb-lg">
          {Object.entries(platforms).map(([name, config]) => (
            <div key={name} className="card">
              <h3 className="card-title text-capitalize" style={{ fontSize: 16, color: 'var(--text)', textTransform: 'capitalize', letterSpacing: 0, marginBottom: 12 }}>{name}</h3>
              <div className="text-xs text-secondary mb-sm">Runtime Config</div>
              <pre className="code-block">{JSON.stringify(config, null, 2)}</pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="state-empty mb-md">No platforms configured</div>
      )}

      <div className="card mb-lg">
        <h3 className="card-title">Agent Definitions</h3>
        {agents.length === 0 ? (
          <div className="state-empty">No agent definitions found</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Agent</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a, i) => (
                  <tr key={i}>
                    <td className="text-link">{a.platform}</td>
                    <td>{a.file?.replace('.md', '')}</td>
                    <td className="text-secondary">{a.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {capability && (
        <div className="card">
          <h3 className="card-title">Capability Matrix (from guides/06-platform-capability.md)</h3>
          <pre className="code-block code-block--scroll">{capability.slice(0, 4000)}{capability.length > 4000 ? '\n... (truncated)' : ''}</pre>
        </div>
      )}
    </div>
  );
}
