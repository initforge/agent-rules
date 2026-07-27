import React, { useEffect, useState, useRef } from 'react';

interface Skill {
  id: string;
  hasSkill?: boolean;
}

interface Integration {
  id: string;
  displayName?: string;
  kind?: string;
  policy?: string;
  triggers?: string[];
  nativeHosts?: string[];
}

interface ProfileManifest {
  version?: number;
  profiles?: Record<string, { enabledByDefault?: boolean; name?: string; displayName?: string }>;
}

interface TriggerAudit {
  phrase?: string;
  skill?: string;
  file?: string;
  keywords?: string[];
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function SkillsIntegrationsProfiles() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [profiles, setProfiles] = useState<Record<string, unknown>[]>([]);
  const [profileManifest, setProfileManifest] = useState<ProfileManifest | null>(null);
  const [triggerAudit, setTriggerAudit] = useState<TriggerAudit[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    Promise.all([
      fetch('/api/config/skills').then(r => { if (!r.ok) throw new Error('Failed to fetch skills'); return r.json(); }),
      fetch('/api/config/file?path=integrations/registry.json').then(r => { if (!r.ok) throw new Error('Failed to fetch registry'); return r.json(); }),
      fetch('/api/config/profiles').then(r => { if (!r.ok) throw new Error('Failed to fetch profiles'); return r.json(); }),
      fetch('/api/config/file?path=automation/trigger-audit.json').then(r => { if (!r.ok) throw new Error('Failed to fetch triggers'); return r.json(); }),
      fetch('/api/config/all').then(r => { if (!r.ok) throw new Error('Failed to fetch all config'); return r.json(); }),
    ]).then(([s, i, p, t, c]) => {
      if (!mountedRef.current) return;
      if (s.ok) setSkills(s.data);
      if (i.ok) setIntegrations(i.data?.integrations || []);
      if (p.ok) setProfiles(p.data);
      if (t.ok) setTriggerAudit(t.data);
      if (c.ok) setProfileManifest(c.data.profileManifest);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    });

    return () => { mountedRef.current = false; };
  }, []);

  if (loadState === 'loading') {
    return (
      <div>
        <h1 className="page-title">Skills, Integrations & Profiles</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Skills, Integrations & Profiles</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  const profileEntries = profileManifest?.profiles ? Object.entries(profileManifest.profiles) : [];

  return (
    <div>
      <h1 className="page-title">Skills, Integrations & Profiles</h1>

      <div className="grid grid--wide mb-lg">
        <div className="card">
          <h3 className="card-title">Skills ({skills.length})</h3>
          {skills.length === 0 ? (
            <div className="state-empty">No skills defined</div>
          ) : (
            skills.map((s, i) => (
              <div key={i} className="list-item flex-between">
                <span>{s.id}</span>
                <span className={`text-xs ${s.hasSkill ? 'text-success' : 'text-secondary'}`}>
                  {s.hasSkill ? '\u25CF SKILL.md' : '\u25CB no skill file'}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Integrations ({integrations.length})</h3>
          {integrations.length === 0 ? (
            <div className="state-empty">No integrations defined</div>
          ) : (
            integrations.map(i => (
              <div key={i.id} className="list-item">
                <div className="flex-between mb-sm">
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{i.displayName || i.id}</span>
                  <span className={`badge ${i.policy === 'required' ? 'badge--success' : i.policy === 'recommended' ? 'badge--accent' : 'badge--default'}`}>
                    {i.policy}
                  </span>
                </div>
                <div className="text-xs text-secondary">{i.kind} &middot; triggers: {(i.triggers || []).join(', ').slice(0, 60)}</div>
                <div className="text-xs text-secondary">{i.nativeHosts?.length ? `hosts: ${i.nativeHosts.join(', ')}` : 'no native hosts'}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Profiles ({profileEntries.length})</h3>
          {profileEntries.length === 0 ? (
            <div className="state-empty">No profiles defined</div>
          ) : (
            profileEntries.map(([id, p]) => (
              <div key={id} className="list-item">
                <div className="flex-between">
                  <span className="text-link">{id}</span>
                  <span className={`text-xs ${p.enabledByDefault ? 'text-success' : 'text-secondary'}`}>
                    {p.enabledByDefault ? 'enabled by default' : 'disabled by default'}
                  </span>
                </div>
                <div className="text-xs text-secondary mt-sm">{p.displayName || p.name}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Trigger Audit ({triggerAudit.length} triggers)</h3>
        {triggerAudit.length === 0 ? (
          <div className="state-empty">No triggers defined</div>
        ) : (
          <div className="grid grid--wide" style={{ gap: 8 }}>
            {triggerAudit.slice(0, 30).map((t, i) => (
              <div key={i} className="trigger-card">
                <div className="mb-sm">&ldquo;{t.phrase}&rdquo;</div>
                <div className={t.skill ? 'text-success' : 'text-accent'}>
                  {t.skill ? `\u2192 ${t.skill}` : t.file ? `\u2192 ${t.file?.split('/').pop()}` : 'no target'}
                </div>
                {t.keywords && <div className="text-xs text-secondary mt-sm">{t.keywords.join(', ')}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
