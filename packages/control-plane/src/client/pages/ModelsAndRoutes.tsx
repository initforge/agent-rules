import React, { useEffect, useState, useRef } from 'react';

interface RouteCases {
  version?: number;
  cases?: unknown[];
  routes?: Record<string, string[]>;
  budgets?: Record<string, number>;
}

interface ModelPolicy {
  version?: number;
  capability_classes?: Record<string, string>;
  platforms?: Record<string, unknown>;
}

interface DiffResult {
  linesAdded: number;
  linesRemoved: number;
  hunks: unknown[];
  patch: string;
}

interface CardProps {
  title: string;
  children: React.ReactNode;
}

type LoadState = 'loading' | 'loaded' | 'error';

function Card({ title, children }: CardProps) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {children}
    </div>
  );
}

export default function ModelsAndRoutes() {
  const [modelPolicy, setModelPolicy] = useState<ModelPolicy | null>(null);
  const [routeCases, setRouteCases] = useState<RouteCases | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [message, setMessage] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    Promise.all([
      fetch('/api/config/file?path=automation/model-policy.json').then(r => { if (!r.ok) throw new Error('Failed to fetch model policy'); return r.json(); }),
      fetch('/api/config/file?path=automation/context-route-cases.json').then(r => { if (!r.ok) throw new Error('Failed to fetch route cases'); return r.json(); }),
    ]).then(([m, r]) => {
      if (!mountedRef.current) return;
      if (m.ok) setModelPolicy(m.data);
      if (r.ok) setRouteCases(r.data);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    });

    return () => { mountedRef.current = false; };
  }, []);

  async function handlePreview() {
    try {
      const data = JSON.parse(editContent);
      const res = await fetch('/api/mutation/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'model-policy', filePath: 'automation/model-policy.json', data }),
      });
      const r = await res.json();
      if (r.ok) setDiffResult(r.diff);
      else setMessage(`Preview error: ${r.error}`);
    } catch (e) {
      setMessage(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleApply() {
    try {
      const data = JSON.parse(editContent);
      const res = await fetch('/api/mutation/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'model-policy', filePath: 'automation/model-policy.json', data }),
      });
      const r = await res.json();
      if (r.ok) {
        setMessage(r.applied ? `Applied. Backup: ${r.backupPath}` : 'No changes.');
        setDiffResult(null);
        setModelPolicy(data);
      } else {
        setMessage(`Apply error: ${r.error}`);
      }
    } catch (e) {
      setMessage(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (loadState === 'loading') {
    return (
      <div>
        <h1 className="page-title">Models & Routes</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Models & Routes</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Models & Routes</h1>

      <div className="grid grid--wide mb-lg">
        <Card title={`Model Policy (v${modelPolicy?.version || '?'})`}>
          {modelPolicy?.capability_classes && (
            <div className="mb-sm">
              <div className="text-xs text-secondary mb-sm">Capability Classes</div>
              {Object.entries(modelPolicy.capability_classes).map(([k, v]) => (
                <div key={k} className="detail-row"><strong>{k}</strong>: {v}</div>
              ))}
            </div>
          )}
          {modelPolicy?.platforms && (
            <div>
              <div className="text-xs text-secondary mb-sm">Platform Mappings</div>
              {Object.entries(modelPolicy.platforms).map(([name, config]) => (
                <div key={name} className="detail-row">
                  <strong className="text-link text-capitalize">{name}</strong>
                  <pre className="code-block code-block--compact mt-sm text-xs">{JSON.stringify(config, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
          {!modelPolicy?.capability_classes && !modelPolicy?.platforms && (
            <div className="state-empty">No model policy data available</div>
          )}
        </Card>

        <Card title={`Context Route Cases (v${routeCases?.version || '?'})`}>
          <div className="text-xs text-secondary mb-sm">
            {routeCases?.cases?.length || 0} route cases defined
          </div>
          {routeCases?.routes && (
            <div>
              <div className="text-xs text-secondary mb-sm">Named Routes</div>
              {Object.entries(routeCases.routes).map(([name, files]) => (
                <div key={name} className="detail-row"><strong>{name}</strong>: {(files as string[]).length} files</div>
              ))}
            </div>
          )}
          {routeCases?.budgets && (
            <div className="mt-sm">
              <div className="text-xs text-secondary mb-sm">Token Budgets</div>
              {Object.entries(routeCases.budgets).map(([k, v]) => (
                <div key={k} className="detail-row">{k}: {v?.toLocaleString()}</div>
              ))}
            </div>
          )}
          {!routeCases && <div className="state-empty">No route cases loaded</div>}
        </Card>
      </div>

      <div className="card mb-md">
        <div className="card-header">
          <h3 className="card-title">Safe Edit: Model Policy</h3>
          <button onClick={() => setShowEditor(!showEditor)} className="btn btn--sm">
            {showEditor ? 'Hide' : 'Edit'}
          </button>
        </div>

        {message && (
          <div className={`message ${message.includes('error') ? 'message--error' : 'message--success'}`}>
            {message}
          </div>
        )}

        {showEditor && (
          <div>
            <div className="text-xs text-secondary mb-sm">Edit JSON directly (validates against schema):</div>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="editor"
              placeholder={JSON.stringify(modelPolicy, null, 2)}
            />
            <div className="flex-row mt-sm">
              <button onClick={handlePreview} className="btn">Preview Diff</button>
              <button onClick={handleApply} className="btn btn--success">Apply</button>
            </div>
          </div>
        )}

        {diffResult && (
          <div className="mt-md">
            <div className="text-xs text-secondary mb-sm">
              Diff: +{diffResult.linesAdded}/-{diffResult.linesRemoved} lines, {diffResult.hunks?.length || 0} hunks
            </div>
            <pre className="code-block code-block--scroll">{diffResult.patch?.slice(0, 2000)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
