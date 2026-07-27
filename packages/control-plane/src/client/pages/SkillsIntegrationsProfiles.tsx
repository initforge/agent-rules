import React, { useEffect, useState } from 'react';

export default function SkillsIntegrationsProfiles() {
  const [skills, setSkills] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profileManifest, setProfileManifest] = useState<any>(null);
  const [triggerAudit, setTriggerAudit] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/config/skills').then(r => r.json()),
      fetch('/api/config/file?path=integrations/registry.json').then(r => r.json()),
      fetch('/api/config/profiles').then(r => r.json()),
      fetch('/api/config/file?path=automation/trigger-audit.json').then(r => r.json()),
      fetch('/api/config/all').then(r => r.json()),
    ]).then(([s, i, p, t, c]) => {
      if (s.ok) setSkills(s.data);
      if (i.ok) setIntegrations(i.data?.integrations || []);
      if (p.ok) setProfiles(p.data);
      if (t.ok) setTriggerAudit(t.data);
      if (c.ok) setProfileManifest(c.data.profileManifest);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Skills, Integrations & Profiles</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title={`Skills (${skills.length})`}>
          {skills.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #21262d', fontSize: 12 }}>
              <span style={{ color: '#e1e4e8' }}>{s.id}</span>
              <span style={{ color: s.hasSkill ? '#3fb950' : '#8b949e' }}>{s.hasSkill ? '● SKILL.md' : '○ no skill file'}</span>
            </div>
          ))}
        </Card>

        <Card title={`Integrations (${integrations.length})`}>
          {integrations.map((i: any) => (
            <div key={i.id} style={{ padding: '8px 0', borderBottom: '1px solid #21262d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#f0f6fc', fontWeight: 500 }}>{i.displayName || i.id}</span>
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: i.policy === 'required' ? '#238636' : i.policy === 'recommended' ? '#1f6feb' : '#21262d',
                  color: '#fff',
                }}>
                  {i.policy}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#8b949e' }}>
                {i.kind} · triggers: {(i.triggers || []).join(', ').slice(0, 60)}
              </div>
              <div style={{ fontSize: 10, color: '#8b949e' }}>
                {i.nativeHosts?.length ? `hosts: ${i.nativeHosts.join(', ')}` : 'no native hosts'}
              </div>
            </div>
          ))}
        </Card>

        <Card title={`Profiles (${Object.keys(profileManifest?.profiles || {}).length})`}>
          {profileManifest?.profiles && Object.entries(profileManifest.profiles).map(([id, p]: [string, any]) => (
            <div key={id} style={{ padding: '8px 0', borderBottom: '1px solid #21262d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#58a6ff' }}>{id}</span>
                <span style={{ color: p.enabledByDefault ? '#3fb950' : '#8b949e' }}>
                  {p.enabledByDefault ? 'enabled by default' : 'disabled by default'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{p.displayName || p.name}</div>
            </div>
          ))}
        </Card>
      </div>

      <Card title={`Trigger Audit (${triggerAudit.length} triggers)`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
          {triggerAudit.slice(0, 30).map((t: any, i: number) => (
            <div key={i} style={{ background: '#0d1117', padding: '8px 10px', borderRadius: 4, fontSize: 11 }}>
              <div style={{ color: '#e1e4e8', marginBottom: 2 }}>"{t.phrase}"</div>
              <div style={{ color: t.skill ? '#7ee787' : '#d2a8ff' }}>
                {t.skill ? `→ ${t.skill}` : t.file ? `→ ${t.file?.split('/').pop()}` : 'no target'}
              </div>
              {t.keywords && <div style={{ color: '#8b949e', fontSize: 10, marginTop: 2 }}>{t.keywords.join(', ')}</div>}
            </div>
          ))}
        </div>
      </Card>
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
