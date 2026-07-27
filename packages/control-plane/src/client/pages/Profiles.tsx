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

interface ProfilesProps {
  segments: string[];
  navigate: (path: string) => void;
}

export default function Profiles({ segments, navigate }: ProfilesProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [profileManifest, setProfileManifest] = useState<ProfileManifest | null>(null);
  const [triggerAudit, setTriggerAudit] = useState<TriggerAudit[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'skills' | 'integrations' | 'profiles' | 'triggers'>('profiles');
  const mountedRef = useRef(true);

  const profileId = segments[1] || null;

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
      if (p.ok) setProfileManifest(c.data?.profileManifest);
      if (t.ok) setTriggerAudit(t.data);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    });
    return () => { mountedRef.current = false; };
  }, []);

  const profileEntries = profileManifest?.profiles ? Object.entries(profileManifest.profiles) : [];
  const profileTabs: { id: typeof activeTab; label: string }[] = [
    { id: 'profiles', label: 'Profiles' },
    { id: 'skills', label: 'Skills' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'triggers', label: 'Triggers' },
  ];

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Profiles</h1>
          <p className="typography-caption">Skills, integrations, profiles, and trigger audit</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Profiles</h1>
          <p className="typography-caption">Skills, integrations, profiles, and trigger audit</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Profiles</h1>
        <p className="typography-caption">Skills, integrations, profiles, and trigger audit</p>
      </div>

      <div className="profiles-tabs" role="tablist" aria-label="Profile sections">
        {profileTabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={`profiles-tab ${activeTab === t.id ? 'profiles-tab--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profiles' && (
        <div className="grid-layout grid-layout--auto">
          <div className="surface" style={{ padding: 16 }}>
            <h3 className="typography-title3" style={{ marginBottom: 8 }}>Profile Activation</h3>
            <span className="typography-caption" style={{ display: 'block', marginBottom: 12 }}>{profileEntries.length} profiles</span>
            {profileEntries.length === 0 ? (
              <div className="state-empty">No profiles defined</div>
            ) : (
              profileEntries.map(([id, p]) => (
                <div
                  key={id}
                  className={`profiles-item ${profileId === id ? 'profiles-item--active' : ''}`}
                  onClick={() => navigate(`/profiles/${id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/profiles/${id}`); }}
                >
                  <div className="flex-between">
                    <span className="typography-body" style={{ color: 'var(--color-text-link)' }}>{id}</span>
                    <span className={`badge ${p.enabledByDefault ? 'badge--success' : 'badge--default'}`}>
                      {p.enabledByDefault ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div className="typography-caption" style={{ marginTop: 4 }}>{p.displayName || p.name}</div>
                </div>
              ))
            )}
          </div>

          {profileId && profileManifest?.profiles?.[profileId] ? (
            <div className="surface" style={{ padding: 16 }}>
              <h3 className="typography-title3" style={{ marginBottom: 8 }}>Profile Detail: {profileId}</h3>
              <div className="detail-field">
                <span className="typography-caption">Name</span>
                <span className="typography-body">{profileManifest.profiles[profileId].displayName || profileManifest.profiles[profileId].name || profileId}</span>
              </div>
              <div className="detail-field">
                <span className="typography-caption">Status</span>
                <span className={`typography-body ${profileManifest.profiles[profileId].enabledByDefault ? 'text-success' : ''}`}>
                  {profileManifest.profiles[profileId].enabledByDefault ? 'Enabled by default' : 'Disabled by default'}
                </span>
              </div>
              <div className="state-empty" style={{ padding: '16px 0' }}>
                Profile dependency and context routing detail coming soon.
              </div>
            </div>
          ) : profileId && (
            <div className="state-empty" style={{ padding: '24px' }}>Profile &quot;{profileId}&quot; not found</div>
          )}
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 8 }}>Skills ({skills.length})</h3>
          {skills.length === 0 ? (
            <div className="state-empty">No skills defined</div>
          ) : (
            skills.map((s, i) => (
              <div key={i} className="detail-field">
                <span className="typography-body">{s.id}</span>
                <span className={`badge ${s.hasSkill ? 'badge--success' : 'badge--default'}`}>
                  {s.hasSkill ? 'SKILL.md' : 'no file'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="grid-layout grid-layout--auto">
          {integrations.length === 0 ? (
            <div className="surface" style={{ padding: 16 }}>
              <h3 className="typography-title3" style={{ marginBottom: 8 }}>Integrations</h3>
              <div className="state-empty">No integrations defined</div>
            </div>
          ) : (
            integrations.map(i => (
              <div key={i.id} className="surface" style={{ padding: 16 }}>
                <div className="flex-between" style={{ marginBottom: 8 }}>
                  <h3 className="typography-title3">{i.displayName || i.id}</h3>
                  <span className={`badge ${i.policy === 'required' ? 'badge--success' : i.policy === 'recommended' ? 'badge--accent' : 'badge--default'}`}>
                    {i.policy}
                  </span>
                </div>
                <div className="typography-caption">{i.kind}</div>
                {i.triggers && i.triggers.length > 0 && (
                  <div className="cluster cluster--xs" style={{ marginTop: 8 }}>
                    {i.triggers.map((t, ti) => <span key={ti} className="tag">{t}</span>)}
                  </div>
                )}
                {i.nativeHosts && i.nativeHosts.length > 0 && (
                  <div className="typography-caption" style={{ marginTop: 8 }}>
                    hosts: {i.nativeHosts.join(', ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'triggers' && (
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 8 }}>Trigger Audit ({triggerAudit.length} triggers)</h3>
          {triggerAudit.length === 0 ? (
            <div className="state-empty">No triggers defined</div>
          ) : (
            <div className="grid-layout grid-layout--wide" style={{ gap: 8 }}>
              {triggerAudit.slice(0, 30).map((t, i) => (
                <div key={i} className="trigger-card">
                  <div className="typography-body" style={{ marginBottom: 4 }}>&ldquo;{t.phrase}&rdquo;</div>
                  <div className="typography-caption">
                    {t.skill ? <span className="text-accent">&rarr; {t.skill}</span> : t.file ? <span className="text-accent">&rarr; {t.file?.split('/').pop()}</span> : 'no target'}
                  </div>
                  {t.keywords && <div className="typography-caption" style={{ marginTop: 4 }}>{t.keywords.join(', ')}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
