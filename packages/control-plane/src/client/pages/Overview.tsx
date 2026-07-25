import React, { useEffect, useState } from 'react';

interface HealthData {
  commit?: string;
  manifestHash?: string;
  status?: string;
  fileStatus?: Record<string, { exists: boolean; size: number }>;
  dirStatus?: Record<string, { exists: boolean; entryCount: number }>;
}

interface ConfigData {
  manifest?: { version?: number; load_order?: string[]; budgets?: Record<string, number> };
  registry?: { version?: number; integrations?: unknown[]; profiles?: Record<string, unknown> };
  profileManifest?: { version?: number; profiles?: Record<string, { enabledByDefault?: boolean; name?: string; displayName?: string }> };
  modelPolicy?: { version?: number; platforms?: Record<string, unknown> };
}

export default function Overview() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(r => r.json()),
      fetch('/api/config/all').then(r => r.json()),
    ]).then(([h, c]) => {
      if (h.ok) setHealth(h);
      if (c.ok) setConfig(c.data);
    }).catch(e => setError(String(e)));
  }, []);

  const enabledProfiles = config?.profileManifest?.profiles
    ? Object.entries(config.profileManifest.profiles).filter(([, v]) => v.enabledByDefault)
    : [];

  const platforms = config?.modelPolicy?.platforms ? Object.keys(config.modelPolicy.platforms) : [];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Repository Overview</h1>
      {error && <div style={{ color: '#f85149', marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Repository Health">
          <Stat label="Status" value={health?.status || 'unknown'} />
          <Stat label="Commit" value={health?.commit ? health.commit.slice(0, 7) : 'unknown'} />
          <Stat label="Manifest Hash" value={health?.manifestHash || 'unknown'} />
        </Card>

        <Card title="CI Status">
          <Stat label="Last Commit" value={health?.commit ? health.commit.slice(0, 7) : 'N/A'} />
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>
            CI imported from available data (git log)
          </div>
        </Card>

        <Card title="Sync Drift">
          <Stat label="Config Files Found" value={Object.values(health?.fileStatus || {}).filter(v => v.exists).length + '/' + Object.values(health?.fileStatus || {}).length} />
          <Stat label="Directories" value={Object.keys(health?.dirStatus || {}).length} />
        </Card>

        <Card title="Enabled Profiles">
          {enabledProfiles.length === 0
            ? <div style={{ color: '#8b949e', fontSize: 13 }}>No profiles enabled by default</div>
            : enabledProfiles.map(([id]) => (
                <div key={id} style={{ fontSize: 13, padding: '2px 0', color: '#7ee787' }}>● {id}</div>
              ))}
        </Card>

        <Card title="Platform Health">
          {platforms.length === 0
            ? <div style={{ color: '#8b949e', fontSize: 13 }}>No platforms configured</div>
            : platforms.map(p => (
                <div key={p} style={{ fontSize: 13, padding: '2px 0', color: '#58a6ff' }}>● {p}</div>
              ))}
        </Card>

        <Card title="Config Sources">
          {config?.manifest?.load_order && (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Load Order:</div>
              {config.manifest.load_order.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#e1e4e8', padding: '1px 0' }}>{r}</div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {config?.manifest?.budgets && (
        <Card title="Token Budgets">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {Object.entries(config.manifest.budgets).map(([k, v]) => (
              <div key={k}>
                <span style={{ fontSize: 11, color: '#8b949e' }}>{k}</span>
                <div style={{ fontSize: 13, color: '#e1e4e8' }}>{v?.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #21262d' }}>
      <span style={{ fontSize: 12, color: '#8b949e' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#e1e4e8', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
