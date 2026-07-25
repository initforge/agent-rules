import React, { useEffect, useState } from 'react';

export default function ModelsAndRoutes() {
  const [modelPolicy, setModelPolicy] = useState<any>(null);
  const [routeCases, setRouteCases] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [diffResult, setDiffResult] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/config/file?path=automation/model-policy.json').then(r => r.json()),
      fetch('/api/config/file?path=automation/context-route-cases.json').then(r => r.json()),
    ]).then(([m, r]) => {
      if (m.ok) setModelPolicy(m.data);
      if (r.ok) setRouteCases(r.data);
    }).catch(() => {});
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
    } catch (e) { setMessage(`Invalid JSON: ${e}`); }
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
      } else setMessage(`Apply error: ${r.error}`);
    } catch (e) { setMessage(`Invalid JSON: ${e}`); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Models & Routes</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Model Policy (v{modelPolicy?.version || '?'})">
          {modelPolicy?.capability_classes && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Capability Classes</div>
              {Object.entries(modelPolicy.capability_classes).map(([k, v]) => (
                <div key={k} style={{ fontSize: 12, color: '#e1e4e8', padding: '2px 0' }}>
                  <strong>{k}</strong>: {v as string}
                </div>
              ))}
            </div>
          )}
          {modelPolicy?.platforms && (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Platform Mappings</div>
              {Object.entries(modelPolicy.platforms).map(([name, config]: [string, any]) => (
                <div key={name} style={{ fontSize: 12, color: '#e1e4e8', padding: '4px 0', borderBottom: '1px solid #21262d' }}>
                  <strong style={{ color: '#58a6ff', textTransform: 'capitalize' }}>{name}</strong>
                  <pre style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>{JSON.stringify(config, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Context Route Cases (v{routeCases?.version || '?'})">
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8 }}>
            {routeCases?.cases?.length || 0} route cases defined
          </div>
          {routeCases?.routes && (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Named Routes</div>
              {Object.entries(routeCases.routes).map(([name, files]: [string, any]) => (
                <div key={name} style={{ fontSize: 11, padding: '2px 0', color: '#e1e4e8' }}>
                  <strong>{name}</strong>: {(files as string[]).length} files
                </div>
              ))}
            </div>
          )}
          {routeCases?.budgets && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Token Budgets</div>
              {Object.entries(routeCases.budgets).map(([k, v]) => (
                <div key={k} style={{ fontSize: 11, padding: '1px 0', color: '#e1e4e8' }}>
                  {k}: {v?.toLocaleString()}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 12 }}>
          Safe Edit: Model Policy
          <button onClick={() => setShowEditor(!showEditor)} style={{ marginLeft: 12, background: '#21262d', color: '#e1e4e8', border: '1px solid #30363d', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
            {showEditor ? 'Hide' : 'Edit'}
          </button>
        </h3>

        {message && (
          <div style={{ fontSize: 12, color: message.includes('error') ? '#f85149' : '#7ee787', marginBottom: 8, padding: 8, background: '#0d1117', borderRadius: 4 }}>
            {message}
          </div>
        )}

        {showEditor && (
          <div>
            <div style={{ marginBottom: 8, fontSize: 11, color: '#8b949e' }}>Edit JSON directly (validates against schema):</div>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              style={{ width: '100%', height: 200, background: '#0d1117', color: '#e1e4e8', border: '1px solid #30363d', borderRadius: 4, padding: 8, fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
              placeholder={JSON.stringify(modelPolicy, null, 2)}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button onClick={handlePreview} style={{ background: '#21262d', color: '#e1e4e8', border: '1px solid #30363d', borderRadius: 4, padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}>Preview Diff</button>
              <button onClick={handleApply} style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}>Apply</button>
            </div>
          </div>
        )}

        {diffResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>
              Diff: +{diffResult.linesAdded}/-{diffResult.linesRemoved} lines, {diffResult.hunks?.length || 0} hunks
            </div>
            <pre style={{ fontSize: 10, background: '#0d1117', padding: 8, borderRadius: 4, maxHeight: 300, overflow: 'auto', color: '#e1e4e8' }}>
              {diffResult.patch?.slice(0, 2000)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}
