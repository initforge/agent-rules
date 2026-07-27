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

type LoadState = 'loading' | 'loaded' | 'error';

interface ConfigurationProps {
  segments: string[];
  navigate: (path: string) => void;
}

type ConfigSection = 'general' | 'model-policy' | 'routes' | 'triggers';

export default function Configuration({ segments, navigate }: ConfigurationProps) {
  const [modelPolicy, setModelPolicy] = useState<ModelPolicy | null>(null);
  const [routeCases, setRouteCases] = useState<RouteCases | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [message, setMessage] = useState('');
  const mountedRef = useRef(true);

  const section = (segments[1] as ConfigSection) || 'general';
  const SECTIONS: { id: ConfigSection; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'model-policy', label: 'Model Policy' },
    { id: 'routes', label: 'Routes' },
    { id: 'triggers', label: 'Triggers' },
  ];

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
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Configuration</h1>
          <p className="typography-caption">Model policies, routing rules, and trigger configuration</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Configuration</h1>
          <p className="typography-caption">Model policies, routing rules, and trigger configuration</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Configuration</h1>
        <p className="typography-caption">Model policies, routing rules, and trigger configuration</p>
      </div>

      <div className="config-tabs" role="tablist" aria-label="Configuration sections">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => navigate(`/configuration/${s.id}`)}
            className={`config-tab ${section === s.id ? 'config-tab--active' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'general' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 12 }}>General Configuration</h3>
          <p className="typography-caption">Manifest, budgets, and global settings</p>
          <div className="state-empty" style={{ padding: '24px 0' }}>
            General configuration overview. Navigate to specific sections for detailed editing.
          </div>
        </div>
      )}

      {section === 'model-policy' && (
        <div className="grid-layout grid-layout--auto">
          <div className="surface" style={{ padding: 16 }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h3 className="typography-title3">Model Policy (v{modelPolicy?.version || '?'})</h3>
              <button onClick={() => setShowEditor(!showEditor)} className="btn btn--sm">
                {showEditor ? 'Hide Editor' : 'Edit'}
              </button>
            </div>

            {modelPolicy?.capability_classes && (
              <div style={{ marginBottom: 16 }}>
                <span className="typography-caption" style={{ display: 'block', marginBottom: 8 }}>Capability Classes</span>
                {Object.entries(modelPolicy.capability_classes).map(([k, v]) => (
                  <div key={k} className="detail-field"><span className="typography-caption">{k}</span><span className="typography-body">{v}</span></div>
                ))}
              </div>
            )}

            {modelPolicy?.platforms && (
              <div>
                <span className="typography-caption" style={{ display: 'block', marginBottom: 8 }}>Platform Mappings</span>
                {Object.entries(modelPolicy.platforms).map(([name, config]) => (
                  <div key={name} className="detail-field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span className="typography-body" style={{ color: 'var(--color-text-link)', textTransform: 'capitalize' }}>{name}</span>
                    <pre className="code-block code-block--compact">{JSON.stringify(config, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface" style={{ padding: 16 }}>
            <h3 className="typography-title3" style={{ marginBottom: 12 }}>Context Route Cases (v{routeCases?.version || '?'})</h3>
            <span className="typography-caption" style={{ display: 'block', marginBottom: 8 }}>
              {(routeCases?.cases?.length || 0)} route cases defined
            </span>
            {routeCases?.routes && (
              <div style={{ marginBottom: 12 }}>
                <span className="typography-caption" style={{ display: 'block', marginBottom: 8 }}>Named Routes</span>
                {Object.entries(routeCases.routes).map(([name, files]) => (
                  <div key={name} className="detail-field"><span className="typography-body">{name}</span><span className="typography-caption">{(files as string[]).length} files</span></div>
                ))}
              </div>
            )}
            {routeCases?.budgets && (
              <div>
                <span className="typography-caption" style={{ display: 'block', marginBottom: 8 }}>Token Budgets</span>
                {Object.entries(routeCases.budgets).map(([k, v]) => (
                  <div key={k} className="detail-field"><span className="typography-caption">{k}</span><span className="typography-body">{v?.toLocaleString()}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(section === 'model-policy' && showEditor) && (
        <div className="surface" style={{ marginTop: 12, padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 8 }}>Safe Editor</h3>

          {message && (
            <div className={`message ${message.includes('error') ? 'message--error' : 'message--success'}`}>
              {message}
            </div>
          )}

          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="editor"
            placeholder={JSON.stringify(modelPolicy, null, 2)}
          />
          <div className="cluster cluster--sm" style={{ marginTop: 8 }}>
            <button onClick={handlePreview} className="btn">Preview Diff</button>
            <button onClick={handleApply} className="btn btn--primary">Apply</button>
          </div>

          {diffResult && (
            <div style={{ marginTop: 12 }}>
              <span className="typography-caption" style={{ display: 'block', marginBottom: 8 }}>
                Diff: +{diffResult.linesAdded}/-{diffResult.linesRemoved} lines, {diffResult.hunks?.length || 0} hunks
              </span>
              <pre className="code-block code-block--scroll">{diffResult.patch?.slice(0, 3000)}</pre>
            </div>
          )}
        </div>
      )}

      {section === 'routes' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 12 }}>Route Configuration</h3>
          <p className="typography-caption">Context routing rules and case definitions</p>
          <div className="state-empty" style={{ padding: '24px 0' }}>
            Route configuration editing coming soon. View current routes in Model Policy section.
          </div>
        </div>
      )}

      {section === 'triggers' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 12 }}>Trigger Configuration</h3>
          <p className="typography-caption">Audit triggers and automation rules from trigger-audit.json</p>
          <div className="state-empty" style={{ padding: '24px 0' }}>
            Trigger configuration editing coming soon.
          </div>
        </div>
      )}
    </div>
  );
}
