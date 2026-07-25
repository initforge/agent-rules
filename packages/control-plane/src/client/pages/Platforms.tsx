import React, { useEffect, useState } from 'react';

export default function Platforms() {
  const [platforms, setPlatforms] = useState<Record<string, any> | null>(null);
  const [capability, setCapability] = useState('');
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/config/platforms').then(r => r.json()),
      fetch('/api/config/agents').then(r => r.json()),
    ]).then(([p, a]) => {
      if (p.ok) setPlatforms(p.data);
      if (a.ok) setAgents(a.data);
    }).catch(() => {});

    fetch('/api/config/file?path=guides/06-platform-capability.md')
      .then(r => r.json()).then(d => { if (d.ok) setCapability(d.data); }).catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Platforms</h1>

      {platforms && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16, marginBottom: 24 }}>
          {Object.entries(platforms).map(([name, config]: [string, any]) => (
            <div key={name} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f0f6fc', marginBottom: 12, textTransform: 'capitalize' }}>{name}</h3>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>Runtime Config</div>
              <pre style={{ fontSize: 11, color: '#e1e4e8', background: '#0d1117', padding: 8, borderRadius: 4, overflow: 'auto' }}>
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 12 }}>Agent Definitions</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Platform</th>
              <th style={{ padding: '6px 8px' }}>Agent</th>
              <th style={{ padding: '6px 8px' }}>Path</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '6px 8px', color: '#58a6ff' }}>{a.platform}</td>
                <td style={{ padding: '6px 8px', color: '#e1e4e8' }}>{a.file?.replace('.md', '')}</td>
                <td style={{ padding: '6px 8px', color: '#8b949e' }}>{a.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {capability && (
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 12 }}>Capability Matrix (from guides/06-platform-capability.md)</h3>
          <pre style={{ fontSize: 11, color: '#e1e4e8', background: '#0d1117', padding: 12, borderRadius: 4, overflow: 'auto', maxHeight: 500 }}>
            {capability.slice(0, 4000)}{capability.length > 4000 ? '\n... (truncated)' : ''}
          </pre>
        </div>
      )}
    </div>
  );
}
