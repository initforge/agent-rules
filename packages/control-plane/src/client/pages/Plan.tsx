import React, { useEffect, useState, useRef } from 'react';

interface EvidenceProfile {
  profiles?: Record<string, {
    required_dimensions?: string[];
    allowed_kinds?: string[];
    runtime_evidence_required?: boolean;
  }>;
}

interface JsonSchema {
  required?: string[];
  properties?: Record<string, { enum?: string[] }>;
  $defs?: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
}

type LoadState = 'loading' | 'loaded' | 'error' | 'stale' | 'offline';

const PROOF_KINDS = [
  { kind: 'static-change', dims: ['outcome', 'regression'], requiredEvidence: ['source-assertion', 'unit-test', 'integration-test'] },
  { kind: 'implementation-runtime', dims: ['outcome', 'integration', 'regression'], requiredEvidence: ['unit-test', 'integration-test', 'component-test'] },
  { kind: 'behavior-safety', dims: ['outcome', 'scope', 'negative-constraint'], requiredEvidence: ['source-assertion', 'artifact-audit', 'transcript-review'] },
  { kind: 'ui-parity', dims: ['interaction', 'state', 'regression', 'visual', 'reference'], requiredEvidence: ['component-test', 'browser-test', 'integration-test'] },
  { kind: 'api-contract', dims: ['positive', 'invalid-error', 'regression'], requiredEvidence: ['integration-test', 'unit-test'] },
  { kind: 'access-control', dims: ['allowed', 'denied', 'isolation'], requiredEvidence: ['integration-test', 'security-test'] },
] as const;

type CoverageFilter = 'ALL' | 'MATCH' | 'PARTIAL' | 'MISSING' | 'DEVIATED' | 'EXTRA' | 'SUPERSEDED';

interface PlanProps {
  navigate: (path: string) => void;
}

export default function Plan({ navigate }: PlanProps) {
  const [evidenceProfiles, setEvidenceProfiles] = useState<EvidenceProfile | null>(null);
  const [workLedgerSchema, setWorkLedgerSchema] = useState<JsonSchema | null>(null);
  const [traceSchema, setTraceSchema] = useState<JsonSchema | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [activePane, setActivePane] = useState<'navigator' | 'canvas' | 'inspector'>('canvas');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('ALL');
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    mountedRef.current = true;
    let stale = false;
    timerRef.current = setTimeout(() => {
      if (mountedRef.current && loadState === 'loading') stale = true;
    }, 5000);

    Promise.all([
      fetch('/api/config/file?path=automation/evidence-profiles.json').then(r => { if (!r.ok) throw new Error('Failed to fetch evidence profiles'); return r.json(); }),
      fetch('/api/config/file?path=automation/work-ledger.schema.json').then(r => { if (!r.ok) throw new Error('Failed to fetch work ledger schema'); return r.json(); }),
      fetch('/api/config/file?path=automation/trace-schema.json').then(r => { if (!r.ok) throw new Error('Failed to fetch trace schema'); return r.json(); }),
    ]).then(([e, w, t]) => {
      if (!mountedRef.current) return;
      if (e.ok) setEvidenceProfiles(e.data);
      if (w.ok) setWorkLedgerSchema(w.data);
      if (t.ok) setTraceSchema(t.data);
      setLoadState('loaded');
    }).catch(err => {
      if (!mountedRef.current) return;
      if (stale) setLoadState('offline');
      else { setError(err instanceof Error ? err.message : String(err)); setLoadState('error'); }
    }).finally(() => clearTimeout(timerRef.current));

    return () => { mountedRef.current = false; clearTimeout(timerRef.current); };
  }, []);

  const COVERAGE_FILTERS: CoverageFilter[] = ['ALL', 'MATCH', 'PARTIAL', 'MISSING', 'DEVIATED', 'EXTRA', 'SUPERSEDED'];
  const profileEntries = evidenceProfiles?.profiles ? Object.entries(evidenceProfiles.profiles) : [];

  function getPaneClass(pane: typeof activePane) {
    return `plan-pane plan-pane--${pane} ${activePane === pane ? 'plan-pane--active' : ''}`;
  }

  const coverageIndicator = (status: CoverageFilter) => {
    const colors: Record<CoverageFilter, string> = {
      ALL: 'var(--color-text-secondary)',
      MATCH: 'var(--color-success)',
      PARTIAL: 'var(--color-warning)',
      MISSING: 'var(--color-danger)',
      DEVIATED: 'var(--color-danger)',
      EXTRA: 'var(--color-accent)',
      SUPERSEDED: 'var(--color-text-tertiary)',
    };
    return (
      <span className="coverage-dot" style={{ background: colors[status], display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6 }} />
    );
  };

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption">Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading plan data...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption">Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  if (loadState === 'offline') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption">Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-offline">Server unreachable. Showing cached data if available.</div>
      </div>
    );
  }

  return (
    <div className="page plan-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="typography-title">Plan Workspace</h1>
            <p className="typography-caption">Plan ID: <span className="typography-mono">am-0005-redesign</span></p>
          </div>
          <div className="cluster cluster--sm">
            <span className="badge badge--immutable">
              <span className="badge-icon">⊡</span> Immutable Original
            </span>
            <span className="badge badge--success">Reconciled</span>
          </div>
        </div>
        <div className="plan-hashes">
          <div className="typography-code" style={{ fontSize: 11 }}>Original: a1b2c3d4e5f6</div>
          <div className="typography-code" style={{ fontSize: 11 }}>Effective: f6e5d4c3b2a1</div>
          <div className="typography-code" style={{ fontSize: 11 }}>Baseline: main@{' '}
            <span className="typography-mono">abc1234</span>
          </div>
          <div className="typography-code" style={{ fontSize: 11 }}>Final HEAD: <span className="typography-mono">def5678</span></div>
        </div>
      </div>

      <div className="plan-mobile-tabs" role="tablist" aria-label="Plan panes">
        {(['navigator' as const, 'canvas' as const, 'inspector' as const]).map(pane => (
          <button
            key={pane}
            role="tab"
            aria-selected={activePane === pane}
            onClick={() => setActivePane(pane)}
            className={`plan-mobile-tab ${activePane === pane ? 'plan-mobile-tab--active' : ''}`}
          >
            {pane === 'navigator' ? 'Navigator' : pane === 'canvas' ? 'Canvas' : 'Inspector'}
          </button>
        ))}
      </div>

      <div className="plan-three-pane">
        <div className={getPaneClass('navigator')} role="region" aria-label="Plan navigator">
          <div className="plan-pane-header">
            <h2 className="typography-title3">Requirements</h2>
            <span className="typography-caption">{profileEntries.length} profiles</span>
          </div>

          <div className="plan-filter-bar">
            <div className="cluster cluster--xs" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {COVERAGE_FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setCoverageFilter(f)}
                  className={`filter-chip ${coverageFilter === f ? 'filter-chip--active' : ''}`}
                >
                  {coverageIndicator(f)}
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="plan-tree" role="tree">
            {profileEntries.length === 0 ? (
              <div className="state-empty">No requirements loaded</div>
            ) : (
              profileEntries
                .filter(([name]) => coverageFilter === 'ALL' || (coverageFilter === 'MATCH' && name.includes('proof')))
                .map(([name, profile]) => (
                  <div
                    key={name}
                    className={`plan-tree-item ${selectedProfile === name ? 'plan-tree-item--selected' : ''}`}
                    onClick={() => setSelectedProfile(name)}
                    role="treeitem"
                    aria-selected={selectedProfile === name}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setSelectedProfile(name); }}
                  >
                    <div className="plan-tree-item-header">
                      <span className="coverage-dot" style={{ background: 'var(--color-success)', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8 }} />
                      <span className="plan-tree-item-name">{name}</span>
                      <span className="badge badge--success">MATCH</span>
                    </div>
                    <div className="plan-tree-item-dims typography-caption">
                      {(profile.required_dimensions || []).join(', ')}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className={getPaneClass('canvas')} role="region" aria-label="Execution canvas">
          <div className="plan-pane-header">
            <h2 className="typography-title3">Reconciliation Matrix</h2>
            <div className="cluster cluster--sm">
              <span className="typography-caption">{profileEntries.length} requirements</span>
            </div>
          </div>

          <div className="reconciliation-matrix">
            <div className="reconciliation-table-wrap">
              <table className="reconciliation-table">
                <thead>
                  <tr>
                    <th>Requirement</th>
                    <th>Implementation</th>
                    <th>Evidence</th>
                    <th>Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  {profileEntries.length === 0 ? (
                    <tr>
                      <td colSpan={4}><div className="state-empty">No reconciliation data</div></td>
                    </tr>
                  ) : (
                    profileEntries.map(([name, profile]) => (
                      <tr
                        key={name}
                        className="reconciliation-row"
                        onClick={() => setSelectedProfile(name)}
                      >
                        <td className="reconciliation-cell-name">
                          <span className="coverage-dot" style={{ background: 'var(--color-success)', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8 }} />
                          {name}
                        </td>
                        <td>
                          <span className="badge badge--success">Verified</span>
                        </td>
                        <td>
                          <div className="cluster cluster--xs">
                            {(profile.allowed_kinds || []).slice(0, 2).map(k => (
                              <span key={k} className="badge badge--accent">{k}</span>
                            ))}
                            {(profile.allowed_kinds || []).length > 2 && (
                              <span className="badge badge--default">+{profile.allowed_kinds!.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="typography-caption">Pending</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="plan-section">
            <h3 className="typography-title3">Proof Requirements Map</h3>
            <div className="reconciliation-table-wrap" style={{ marginTop: 8 }}>
              <table className="reconciliation-table">
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th>Required Dimensions</th>
                    <th>Evidence Kinds</th>
                  </tr>
                </thead>
                <tbody>
                  {PROOF_KINDS.map((p, i) => (
                    <tr key={i}>
                      <td className="typography-mono" style={{ color: 'var(--color-text-link)' }}>{p.kind}</td>
                      <td><span className="typography-caption">{p.dims.join(', ')}</span></td>
                      <td><span className="typography-caption">{p.requiredEvidence.join(', ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={getPaneClass('inspector')} role="region" aria-label="Contextual inspector">
          <div className="plan-pane-header">
            <h2 className="typography-title3">Inspector</h2>
            {selectedProfile && (
              <button
                onClick={() => setSelectedProfile(null)}
                className="btn btn--ghost btn--sm"
                aria-label="Clear selection"
              >
                Clear
              </button>
            )}
          </div>

          {selectedProfile && evidenceProfiles?.profiles?.[selectedProfile] ? (
            <div className="inspector-content">
              <div className="surface inspector-section">
                <h3 className="typography-title3">{selectedProfile}</h3>
                <div className="stack stack--sm" style={{ marginTop: 12 }}>
                  <div className="inspector-field">
                    <span className="typography-caption">Required Dimensions</span>
                    <span className="typography-body">{(evidenceProfiles.profiles[selectedProfile].required_dimensions || []).join(', ') || 'None'}</span>
                  </div>
                  <div className="inspector-field">
                    <span className="typography-caption">Allowed Evidence Kinds</span>
                    <span className="typography-body">{(evidenceProfiles.profiles[selectedProfile].allowed_kinds || []).join(', ') || 'None'}</span>
                  </div>
                  {evidenceProfiles.profiles[selectedProfile].runtime_evidence_required && (
                    <div className="inspector-field">
                      <span className="badge badge--warning">Runtime evidence required</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="surface inspector-section">
                <h3 className="typography-title3">Evidence Receipts</h3>
                <div className="state-empty" style={{ padding: '12px 0' }}>
                  No evidence receipts recorded for this profile
                </div>
              </div>

              <div className="surface inspector-section">
                <h3 className="typography-title3">Verification</h3>
                <div className="state-empty" style={{ padding: '12px 0' }}>
                  No verification results yet
                </div>
              </div>
            </div>
          ) : (
            <div className="inspector-empty">
              <div className="inspector-empty-icon">⊡</div>
              <p className="typography-body">Select a requirement to inspect</p>
              <p className="typography-caption">Evidence, receipts, and verification details will appear here</p>
            </div>
          )}

          {!selectedProfile && (
            <div className="surface inspector-section">
              <h3 className="typography-title3">Work Ledger Schema</h3>
              {workLedgerSchema?.required ? (
                <div className="stack stack--xs" style={{ marginTop: 8 }}>
                  <span className="typography-caption">Required fields:</span>
                  <div className="cluster cluster--xs">
                    {workLedgerSchema.required.map((f: string) => (
                      <span key={f} className="tag">{f}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="typography-caption" style={{ marginTop: 8 }}>No schema data</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
