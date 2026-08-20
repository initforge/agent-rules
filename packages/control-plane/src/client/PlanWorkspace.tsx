import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';

interface EvidenceProfile {
  profiles?: Record<string, {
    required_dimensions?: string[];
    allowed_kinds?: string[];
    runtime_evidence_required?: boolean;
  }>;
}

interface IntegrityFinding {
  kind: string;
  detail: string;
}

interface IntegrityFailure {
  ok: false;
  code: 'INTEGRITY_FAILURE';
  error: string;
  details: {
    findings: IntegrityFinding[];
  };
}

interface PlanData {
  planId: string;
  originalSha256: string | null;
  effectiveSha256: string | null;
  amendments: Array<{ id: string; sha256: string }>;
  status: string;
  reconciliations: Array<Record<string, unknown>>;
  attestations: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
  shadowRevision: string | null;
  canonicalSource?: {
    schema?: string;
    requirementCount?: number;
    requirementStatusCounts?: Record<string, number>;
  };
  integrityFailure?: IntegrityFailure;
}

function normalizePlan(raw: Record<string, unknown>): PlanData {
  const identity = (raw.identity || {}) as Record<string, unknown>;
  return {
    planId: String(raw.planId || ''),
    originalSha256: typeof identity.originalSha256 === 'string' ? identity.originalSha256 : null,
    effectiveSha256: typeof identity.effectiveSha256 === 'string' ? identity.effectiveSha256 : null,
    amendments: Array.isArray(raw.amendments) ? raw.amendments.map((a) => {
      const amendment = a as Record<string, unknown>;
      return { id: String(amendment.amendmentId || ''), sha256: String(amendment.sha256 || '') };
    }) : [],
    status: String(raw.status || identity.status || ''),
    reconciliations: Array.isArray(raw.reconciliations) ? raw.reconciliations as Array<Record<string, unknown>> : [],
    attestations: Array.isArray(raw.attestations) ? raw.attestations as Array<Record<string, unknown>> : [],
    findings: Array.isArray(raw.orphanFindings) ? raw.orphanFindings as Array<Record<string, unknown>> : [],
    auditEvents: Array.isArray(raw.auditEvents) ? raw.auditEvents as Array<Record<string, unknown>> : [],
    shadowRevision: identity.shadowRevision == null ? null : String(identity.shadowRevision),
    canonicalSource: raw.canonicalSource as PlanData['canonicalSource'],
    integrityFailure: raw.integrityFailure as IntegrityFailure | undefined,
  };
}

type LoadState = 'loading' | 'loaded' | 'error' | 'stale' | 'offline';
type CoverageFilter = 'ALL' | 'MATCH' | 'PARTIAL' | 'MISSING' | 'DEVIATED' | 'EXTRA' | 'SUPERSEDED';
type PaneId = 'navigator' | 'canvas' | 'inspector';
type VisualMode = 'dag' | 'swimlane' | 'timeline';

const COVERAGE_FILTERS: CoverageFilter[] = ['ALL', 'MATCH', 'PARTIAL', 'MISSING', 'DEVIATED', 'EXTRA', 'SUPERSEDED'];

const COVERAGE_INFO: Record<CoverageFilter, { label: string; cssClass: string }> = {
  ALL: { label: 'All', cssClass: 'cpw-cov--all' },
  MATCH: { label: 'Match', cssClass: 'cpw-cov--match' },
  PARTIAL: { label: 'Partial', cssClass: 'cpw-cov--partial' },
  MISSING: { label: 'Missing', cssClass: 'cpw-cov--missing' },
  DEVIATED: { label: 'Deviated', cssClass: 'cpw-cov--deviated' },
  EXTRA: { label: 'Extra', cssClass: 'cpw-cov--extra' },
  SUPERSEDED: { label: 'Superseded', cssClass: 'cpw-cov--superseded' },
};

function hashShort(h: string | null | undefined): string {
  return h ? h.slice(0, 12) : '\u2014';
}

function formatTs(ts: string | undefined): string {
  if (!ts) return '\u2014';
  return ts.slice(0, 19).replace('T', ' ');
}

function coverageForProfile(
  name: string,
  planData: PlanData | null,
): CoverageFilter {
  if (planData?.canonicalSource?.schema === 'harness/north-star-ledger') {
    const row = planData.reconciliations.find((candidate) => String(candidate.requirementId || '') === name);
    const status = String(row?.canonicalStatus || row?.status || 'MISSING');
    if (status === 'MATCH') return 'MATCH';
    if (status === 'PARTIAL') return 'PARTIAL';
    return 'MISSING';
  }
  if (!planData?.attestations) return 'MISSING';
  const bound = planData.attestations.some(
    (a: Record<string, unknown>) => a.profile === name && a.status === 'BOUND',
  );
  if (bound) return 'MATCH';
  const anyAtt = planData.attestations.some(
    (a: Record<string, unknown>) => a.profile === name,
  );
  return anyAtt ? 'PARTIAL' : 'MISSING';
}

interface CoverageDotProps {
  status: CoverageFilter;
  size?: number;
}

const CoverageDot: React.FC<CoverageDotProps> = ({ status, size = 8 }) => {
  const info = COVERAGE_INFO[status];
  return (
    <span
      className={`cpw-dot ${info.cssClass}`}
      style={{ width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}
    />
  );
};

const PlanIdentityHeader: React.FC<{ planData: PlanData | null; reconciling: boolean }> = ({ planData, reconciling }) => {
  if (!planData) return null;
  const staleStatus = planData.status === 'RECONCILED' || planData.status === 'COMPLETED';
  const statusBadge = staleStatus ? 'cpw-badge--success' : 'cpw-badge--warning';

  return (
    <div className="cpw-identity">
      <div className="cpw-identity-top">
        <div className="cpw-identity-titles">
          <h1 className="typography-title">Plan Workspace</h1>
          <span className="cpw-identity-id typography-mono">{planData.planId}</span>
        </div>
        <div className="cluster cluster--sm">
          <span className={`cpw-badge ${statusBadge}`}>
            {staleStatus ? 'Reconciled' : planData.status || 'In Progress'}
          </span>
          {planData.attestations && (
            <span className="cpw-badge cpw-badge--default">
              {planData.attestations.filter((a: Record<string, unknown>) => a.status === 'BOUND').length}
              /{planData.attestations.length} bound
            </span>
          )}
          {planData.findings && planData.findings.length > 0 && (
            <span className="cpw-badge cpw-badge--danger">
              {planData.findings.length} open
            </span>
          )}
        </div>
      </div>
      <div className="cpw-identity-hashes">
        <div className="cpw-hash-item">
          <span className="cpw-hash-label">Original</span>
          <span className="cpw-hash-value typography-mono">{hashShort(planData.originalSha256)}</span>
          {planData.originalSha256 && <span className="cpw-badge cpw-badge--accent cpw-badge--sm">immutable</span>}
        </div>
        <div className="cpw-hash-sep" aria-hidden="true" />
        <div className="cpw-hash-item">
          <span className="cpw-hash-label">Effective</span>
          <span className="cpw-hash-value typography-mono">{hashShort(planData.effectiveSha256)}</span>
        </div>
        {planData.shadowRevision && (
          <>
            <div className="cpw-hash-sep" aria-hidden="true" />
            <div className="cpw-hash-item">
              <span className="cpw-hash-label">Shadow</span>
              <span className="cpw-hash-value typography-mono">{hashShort(planData.shadowRevision)}</span>
            </div>
          </>
        )}
        {reconciling && (
          <div className="cpw-hash-item">
            <span className="cpw-badge cpw-badge--warning cpw-badge--sm">reconciling</span>
          </div>
        )}
      </div>
    </div>
  );
};

const ArtifactLineage: React.FC<{ planData: PlanData | null }> = ({ planData }) => {
  if (!planData) return null;
  const items = [
    { label: 'Original', hash: planData.originalSha256, isOriginal: true },
    ...(planData.amendments || []).map((a) => ({
      label: a.id,
      hash: a.sha256,
      isOriginal: false,
    })),
    { label: 'Effective Plan', hash: planData.effectiveSha256, isOriginal: false },
  ];

  return (
    <div className="cpw-lineage">
      <div className="cpw-lineage-scroll" role="list" aria-label="Artifact lineage">
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="cpw-lineage-connector" aria-hidden="true" />}
            <div className={`cpw-lineage-node ${item.isOriginal ? 'cpw-lineage-node--original' : ''}`} role="listitem">
              <div className="cpw-lineage-node-dot" aria-hidden="true" />
              <div className="cpw-lineage-node-body">
                <span className="cpw-lineage-node-label typography-caption">{item.label}</span>
                <span className="cpw-lineage-node-hash typography-mono">{hashShort(item.hash)}</span>
              </div>
              {item.isOriginal && <span className="cpw-badge cpw-badge--accent cpw-badge--sm">original</span>}
            </div>
          </React.Fragment>
        ))}
      </div>
      <details className="cpw-lineage-table-detail">
        <summary className="typography-caption cpw-lineage-table-toggle">Table view</summary>
        <table className="cpw-lineage-table">
          <thead>
            <tr>
              <th>Artifact</th>
              <th>Hash</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className="cpw-lineage-td-label">{item.label}</td>
                <td className="typography-mono">{hashShort(item.hash)}</td>
                <td>{item.isOriginal ? <span className="cpw-badge cpw-badge--accent cpw-badge--sm">original</span> : <span className="cpw-badge cpw-badge--default cpw-badge--sm">derived</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

interface ProfileTreeProps {
  profiles: [string, NonNullable<EvidenceProfile['profiles']>[string]][];
  coverageFilter: CoverageFilter;
  selectedProfile: string | null;
  onSelect: (name: string | null) => void;
  planData: PlanData | null;
}

const ProfileTree: React.FC<ProfileTreeProps> = ({ profiles, coverageFilter, selectedProfile, onSelect, planData }) => {
  const filtered = useMemo(() => {
    if (coverageFilter === 'ALL') return profiles;
    return profiles.filter(([name]) => {
      const cov = coverageForProfile(name, planData);
      return cov === coverageFilter;
    });
  }, [profiles, coverageFilter, planData]);

  if (filtered.length === 0) {
    return <div className="state-empty">No requirements match filter</div>;
  }

  return (
    <div className="cpw-tree" role="tree" aria-label="Requirements">
      {filtered.map(([name, profile]) => {
        const cov = coverageForProfile(name, planData);
        const isSelected = selectedProfile === name;
        return (
          <div
            key={name}
            className={`cpw-tree-item ${isSelected ? 'cpw-tree-item--selected' : ''}`}
            onClick={() => onSelect(name)}
            role="treeitem"
            aria-selected={isSelected}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(name); }}
          >
            <div className="cpw-tree-item-row">
              <CoverageDot status={cov} />
              <span className="cpw-tree-item-name">{name}</span>
              <span className={`cpw-badge cpw-badge--sm ${cov === 'MATCH' ? 'cpw-badge--success' : cov === 'PARTIAL' ? 'cpw-badge--warning' : 'cpw-badge--default'}`}>
                {cov}
              </span>
            </div>
            <div className="cpw-tree-item-dims typography-caption">
              {(profile.required_dimensions || []).join(', ') || '\u2014'}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ReconciliationMatrix: React.FC<{
  profiles: [string, NonNullable<EvidenceProfile['profiles']>[string]][];
  planData: PlanData | null;
  onSelect: (name: string) => void;
}> = ({ profiles, planData, onSelect }) => {
  if (profiles.length === 0) {
    return <div className="state-empty">No reconciliation data</div>;
  }

  return (
    <div className="cpw-matrix" role="region" aria-label="Reconciliation matrix">
      <div className="cpw-matrix-table-wrap">
        <table className="cpw-matrix-table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Coverage</th>
              <th>Evidence Kinds</th>
              <th>Attestations</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(([name, profile]) => {
              const cov = coverageForProfile(name, planData);
              const bound = planData?.attestations?.filter(
                (a: Record<string, unknown>) => a.profile === name && a.status === 'BOUND',
              ).length || 0;
              const total = planData?.attestations?.filter(
                (a: Record<string, unknown>) => a.profile === name,
              ).length || 0;
              const kinds = profile.allowed_kinds || [];

              return (
                <tr
                  key={name}
                  className="cpw-matrix-row"
                  onClick={() => onSelect(name)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSelect(name); }}
                >
                  <td className="cpw-matrix-cell-name">
                    <span className="cpw-matrix-cell-name-inner">
                      <CoverageDot status={cov} size={6} />
                      {name}
                    </span>
                  </td>
                  <td>
                    <span className={`cpw-badge cpw-badge--sm ${cov === 'MATCH' ? 'cpw-badge--success' : cov === 'PARTIAL' ? 'cpw-badge--warning' : 'cpw-badge--default'}`}>
                      {cov}
                    </span>
                  </td>
                  <td>
                    <span className="cpw-matrix-kinds">
                      {kinds.slice(0, 3).map((k) => (
                        <span key={k} className="cpw-tag">{k}</span>
                      ))}
                      {kinds.length > 3 && <span className="cpw-tag cpw-tag--more">+{kinds.length - 3}</span>}
                    </span>
                  </td>
                  <td className="typography-caption">{total > 0 ? `${bound}/${total} bound` : '\u2014'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const VisualExecution: React.FC<{
  planData: PlanData | null;
  mode: VisualMode;
  onModeChange: (m: VisualMode) => void;
}> = ({ planData, mode, onModeChange }) => {
  const events = planData?.auditEvents?.slice(0, 20) || [];
  const findings = planData?.findings || [];

  if (mode === 'timeline') {
    return (
      <div className="cpw-visual" role="region" aria-label="Execution timeline">
        <div className="cpw-visual-toolbar">
          <span className="typography-title3">Timeline</span>
          <div className="cluster cluster--xs">
            {(['dag', 'swimlane', 'timeline'] as VisualMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`cpw-visual-mode-btn ${mode === m ? 'cpw-visual-mode-btn--active' : ''}`}
                aria-pressed={mode === m}
              >
                {m === 'dag' ? 'DAG' : m === 'swimlane' ? 'Swimlane' : 'Timeline'}
              </button>
            ))}
          </div>
        </div>
        {events.length === 0 && findings.length === 0 ? (
          <div className="state-empty">No execution events recorded</div>
        ) : (
          <div className="cpw-timeline" role="list" aria-label="Execution events">
            {events.map((ev: Record<string, unknown>, i: number) => (
              <div key={i} className="cpw-timeline-item" role="listitem">
                <div className="cpw-timeline-dot" aria-hidden="true" />
                {i < events.length - 1 && <div className="cpw-timeline-line" aria-hidden="true" />}
                <div className="cpw-timeline-body">
                  <span className="cpw-timeline-type typography-caption">
                    {String(ev.event_type || ev.action || 'event')}
                  </span>
                  {ev.platform ? <span className="cpw-tag">{String(ev.platform)}</span> : null}
                  <span className="cpw-timeline-ts typography-caption">
                    {formatTs(String(ev.ts))}
                  </span>
                </div>
              </div>
            ))}
            {findings.length > 0 && (
              <div className="cpw-timeline-findings">
                <span className="cpw-badge cpw-badge--danger cpw-badge--sm">{findings.length} finding{findings.length !== 1 ? 's' : ''} open</span>
                <div className="cpw-timeline-findings-list">
                  {findings.slice(0, 5).map((f: Record<string, unknown>, i: number) => (
                    <div key={i} className="typography-caption">
                      {String(f.description || f.id || `Finding #${i + 1}`)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <details className="cpw-lineage-table-detail">
          <summary className="typography-caption cpw-lineage-table-toggle">Table view</summary>
          <table className="cpw-lineage-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Timestamp</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={3}><div className="state-empty">No events</div></td></tr>
              ) : (
                events.map((ev: Record<string, unknown>, i: number) => (
                  <tr key={i}>
                    <td className="typography-mono">{String(ev.event_type || ev.action || '-')}</td>
                    <td className="typography-caption">{formatTs(String(ev.ts))}</td>
                    <td className="typography-caption">{ev.platform ? String(ev.platform) : ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </details>
      </div>
    );
  }

  const reconcilRows = planData?.reconciliations?.slice(-5).reverse() || [];

  return (
    <div className="cpw-visual" role="region" aria-label={mode === 'dag' ? 'Dependency DAG' : 'Swimlane view'}>
      <div className="cpw-visual-toolbar">
        <span className="typography-title3">{mode === 'dag' ? 'Dependency DAG' : 'Swimlane'}</span>
        <div className="cluster cluster--xs">
          {(['dag', 'swimlane', 'timeline'] as VisualMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`cpw-visual-mode-btn ${mode === m ? 'cpw-visual-mode-btn--active' : ''}`}
              aria-pressed={mode === m}
            >
              {m === 'dag' ? 'DAG' : m === 'swimlane' ? 'Swimlane' : 'Timeline'}
            </button>
          ))}
        </div>
      </div>
      {reconcilRows.length === 0 ? (
        <div className="state-empty">No {mode === 'dag' ? 'dependency' : 'swimlane'} data available</div>
      ) : (
        <div className="cpw-dag-fallback" role="region" aria-label={`${mode === 'dag' ? 'DAG' : 'Swimlane'} structured view`}>
          {reconcilRows.map((r: Record<string, unknown>, i: number) => (
            <div key={i} className="surface cpw-dag-node">
              <div className="cpw-dag-node-header">
                <span className="typography-title3 typography-code">{String(r.planId || r.id || `#${i + 1}`).slice(0, 16)}</span>
                <span className={`cpw-badge cpw-badge--sm ${r.status === 'RECONCILED' ? 'cpw-badge--success' : 'cpw-badge--default'}`}>
                  {String(r.status || 'N/A')}
                </span>
              </div>
              <div className="cpw-dag-node-meta typography-caption">
                {r.timestamp ? formatTs(String(r.timestamp)) : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      <details className="cpw-lineage-table-detail">
        <summary className="typography-caption cpw-lineage-table-toggle">Table view</summary>
        <table className="cpw-lineage-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {reconcilRows.length === 0 ? (
              <tr><td colSpan={3}><div className="state-empty">No data</div></td></tr>
            ) : (
              reconcilRows.map((r: Record<string, unknown>, i: number) => (
                <tr key={i}>
                  <td className="typography-mono">{String(r.planId || r.id || `#${i + 1}`).slice(0, 16)}</td>
                  <td><span className={`cpw-badge cpw-badge--sm ${r.status === 'RECONCILED' ? 'cpw-badge--success' : 'cpw-badge--default'}`}>{String(r.status || 'N/A')}</span></td>
                  <td className="typography-caption">{r.timestamp ? formatTs(String(r.timestamp)) : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
};

const RepairHistory: React.FC<{ planData: PlanData | null }> = ({ planData }) => {
  const findings = planData?.findings || [];
  if (findings.length === 0) {
    return (
      <div className="cpw-repair-empty">
        <span className="cpw-badge cpw-badge--success cpw-badge--sm">No open findings</span>
        <span className="typography-caption">All requirements have clean verification status</span>
      </div>
    );
  }

  return (
    <div className="cpw-repair" role="region" aria-label="Repair history">
      <span className="typography-title3">Repair History</span>
      <div className="cpw-repair-list">
        {findings.map((f: Record<string, unknown>, i: number) => (
          <div key={i} className="surface cpw-repair-item">
            <div className="cpw-repair-item-hdr">
              <span className="cpw-badge cpw-badge--danger cpw-badge--sm">Finding</span>
              <span className="typography-mono">{hashShort(String(f.id || ''))}</span>
            </div>
            <div className="typography-caption cpw-repair-item-desc">
              {String(f.description || f.message || 'Unknown finding')}
            </div>
            {f.profile ? (
              <div className="cpw-repair-item-meta">
                <span className="cpw-tag">{String(f.profile)}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const IntegrityBanner: React.FC<{ failure: IntegrityFailure | null; planData: PlanData | null }> = ({ failure, planData }) => {
  if (!failure) return null;

  const findings = failure.details?.findings || [];
  const integrityFindings = planData?.integrityFailure?.details?.findings || findings;

  return (
    <div className="surface cpw-integrity-banner" role="alert" aria-live="assertive">
      <div className="cpw-integrity-banner-header">
        <span className="cpw-badge cpw-badge--danger cpw-badge--sm">Integrity Failure</span>
        <span className="typography-caption">Workspace integrity check failed — evidence may not be reliable</span>
      </div>
      <div className="cpw-integrity-banner-findings">
        {integrityFindings.length > 0 ? (
          <ul className="cpw-integrity-findings-list">
            {integrityFindings.slice(0, 10).map((f, i) => (
              <li key={i} className="cpw-integrity-finding-item">
                <span className="cpw-badge cpw-badge--danger cpw-badge--xs">{f.kind}</span>
                <span className="typography-caption">{f.detail}</span>
              </li>
            ))}
            {integrityFindings.length > 10 && (
              <li className="typography-caption cpw-integrity-more">
                +{integrityFindings.length - 10} more findings
              </li>
            )}
          </ul>
        ) : (
          <span className="typography-caption">{failure.error}</span>
        )}
      </div>
    </div>
  );
};

const EvidenceInspector: React.FC<{
  selectedProfile: string | null;
  evidenceProfiles: EvidenceProfile | null;
  profileEntries: [string, NonNullable<EvidenceProfile['profiles']>[string]][];
  planData: PlanData | null;
}> = ({ selectedProfile, evidenceProfiles, profileEntries, planData }) => {
  if (!selectedProfile) {
    return (
      <div className="cpw-inspector-empty">
        <div className="cpw-inspector-empty-icon" aria-hidden="true" />
        <p className="typography-body">Select a requirement to inspect</p>
        <p className="typography-caption">Evidence, attestations, and verification details will appear here</p>
      </div>
    );
  }

  const profile = evidenceProfiles?.profiles?.[selectedProfile] || profileEntries.find(([name]) => name === selectedProfile)?.[1];
  if (!profile) {
    return (
      <div className="cpw-inspector-empty">
        <p className="typography-body">Profile not found</p>
        <p className="typography-caption">No evidence profile data for &quot;{selectedProfile}&quot;</p>
      </div>
    );
  }

  const profileAtts = (planData?.attestations || []).filter(
    (a: Record<string, unknown>) => a.profile === selectedProfile,
  );

  return (
    <div className="cpw-inspector">
      <div className="surface cpw-inspector-section">
        <h2 className="typography-title2">{selectedProfile}</h2>
        <div className="cpw-inspector-fields">
          <div className="cpw-inspector-field">
            <span className="typography-caption">Required Dimensions</span>
            <span className="typography-body">{(profile.required_dimensions || []).join(', ') || '\u2014'}</span>
          </div>
          <div className="cpw-inspector-field">
            <span className="typography-caption">Allowed Evidence Kinds</span>
            <div className="cluster cluster--xs">
              {(profile.allowed_kinds || []).map((k) => (
                <span key={k} className="cpw-tag">{k}</span>
              ))}
              {(!profile.allowed_kinds || profile.allowed_kinds.length === 0) && (
                <span className="typography-caption">\u2014</span>
              )}
            </div>
          </div>
          {profile.runtime_evidence_required && (
            <div className="cpw-inspector-field">
              <span className="cpw-badge cpw-badge--warning cpw-badge--sm">Runtime evidence required</span>
            </div>
          )}
        </div>
      </div>

      <div className="surface cpw-inspector-section">
        <h3 className="typography-title3">Attestations ({profileAtts.length})</h3>
        {profileAtts.length === 0 ? (
          <div className="state-empty" style={{ padding: '12px 0' }}>No attestations recorded</div>
        ) : (
          <div className="cpw-attestation-list">
            {profileAtts.map((a: Record<string, unknown>, i: number) => (
              <div key={i} className="cpw-attestation-item">
                <div className="cpw-attestation-row">
                  <span className={`cpw-badge cpw-badge--sm ${a.status === 'BOUND' ? 'cpw-badge--success' : 'cpw-badge--default'}`}>
                    {String(a.status || 'UNKNOWN')}
                  </span>
                  {a.host ? <span className="cpw-tag">{String(a.host)}</span> : null}
                </div>
                {a.timestamp ? <span className="typography-caption">{formatTs(String(a.timestamp))}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface cpw-inspector-section">
        <h3 className="typography-title3">Evidence Receipts</h3>
        <div className="state-empty" style={{ padding: '12px 0' }}>
          Evidence receipts not yet available for drill-down
        </div>
      </div>
    </div>
  );
};

interface PlanWorkspaceProps {
  navigate: (path: string) => void;
}

export default function PlanWorkspace({ navigate }: PlanWorkspaceProps) {
  const [evidenceProfiles, setEvidenceProfiles] = useState<EvidenceProfile | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [plans, setPlans] = useState<Array<{ planId: string }>>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [integrityFailure, setIntegrityFailure] = useState<IntegrityFailure | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('ALL');
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<PaneId>('canvas');
  const [visualMode, setVisualMode] = useState<VisualMode>('timeline');
  const [reconciling, setReconciling] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let stale = false;
    const timer = setTimeout(() => {
      if (mountedRef.current && loadState === 'loading') stale = true;
    }, 5000);

    Promise.all([
      fetch('/api/config/file?path=automation/evidence-profiles.json').then((r) => {
        if (!r.ok) throw new Error('Failed to fetch evidence profiles');
        return r.json();
      }),
      fetch('/api/plans').then((r) => {
        if (!r.ok) throw new Error('Failed to fetch plans');
        return r.json();
      }),
    ])
      .then(([e, p]) => {
        if (!mountedRef.current) return;
        if (e.ok) setEvidenceProfiles(e.data);
        const listed: Array<{ planId?: string; plan_id?: string }> = Array.isArray(p.data) ? p.data : [];
        if (listed.length > 0) {
          setPlans(listed.map((item) => ({ planId: String(item.planId ?? item.plan_id ?? '') })));
          // Prefer the plan named in the URL when present; otherwise select
          // the first listed plan (canonical/current plans sort first).
          const urlMatch = typeof window !== 'undefined' ? window.location.pathname.match(/\/plan\/([^/]+)/) : null;
          const urlPlanId = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
          const target = listed.find((plan) => plan.planId === urlPlanId) ?? listed[0];
          const firstPlanId = target.planId;
          return fetch(`/api/plans/${firstPlanId}`)
            .then(async (r) => {
              const data = await r.json();
              if (!r.ok) {
                if (r.status === 409 && data.code === 'INTEGRITY_FAILURE') {
                  const failure: IntegrityFailure = data;
                  if (mountedRef.current) setIntegrityFailure(failure);
                  // Still show the plan data with integrity failure flag
                  const planWithFailure = normalizePlan(data);
                  planWithFailure.integrityFailure = failure;
                  if (mountedRef.current) {
                    setPlanData(planWithFailure);
                    setLoadState('loaded');
                  }
                  return;
                }
                throw new Error(`Failed to fetch plan (${r.status}): ${data.error || 'Unknown error'}`);
              }
              return data;
            })
            .then((pd) => {
              if (pd && mountedRef.current) {
                const planWithFailure = normalizePlan(pd);
                if (pd.status === 'RECONCILING') setReconciling(true);
                setPlanData(planWithFailure);
              }
            });
        }
        return undefined;
      })
      .then(() => {
        if (mountedRef.current) setLoadState('loaded');
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        if (stale) {
          setLoadState('offline');
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setLoadState('error');
        }
      })
      .finally(() => clearTimeout(timer));

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []);

  const profileEntries = useMemo(() => {
    if (!evidenceProfiles?.profiles) return [];
    return Object.entries(evidenceProfiles.profiles);
  }, [evidenceProfiles]);

  const handleSelectProfile = useCallback((name: string | null) => {
    setSelectedProfile(name);
    if (window.innerWidth <= 1024) {
      setActivePane('inspector');
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedProfile(null);
  }, []);

  if (loadState === 'loading') {
    return (
      <div className="page" aria-busy="true" aria-live="polite">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption">Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-loading" role="status"><div className="spinner" /> Loading plan data...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page" role="alert" aria-live="assertive">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption"> Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-error">{error}</div>
        {integrityFailure && (
          <IntegrityBanner failure={integrityFailure} planData={null} />
        )}
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
        {planData ? (
          <>
            <div className="state-stale">Server unreachable. Showing last known data.</div>
            <_WorkspaceBody
              planData={planData}
              evidenceProfiles={evidenceProfiles}
              profileEntries={profileEntries}
              coverageFilter={coverageFilter}
              setCoverageFilter={setCoverageFilter}
              selectedProfile={selectedProfile}
              onSelectProfile={handleSelectProfile}
              onClearSelection={handleClearSelection}
              activePane={activePane}
              setActivePane={setActivePane}
              visualMode={visualMode}
              setVisualMode={setVisualMode}
              reconciling={reconciling}
            />
          </>
        ) : (
          <div className="state-offline">Server unreachable. No cached data available.</div>
        )}
      </div>
    );
  }

  if (!planData && plans.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption">Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-empty">No plans found in ledger</div>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="page" aria-busy="true" aria-live="polite">
        <div className="page-header">
          <h1 className="typography-title">Plan Workspace</h1>
          <p className="typography-caption"> Requirement evidence tracking and reconciliation</p>
        </div>
        <div className="state-loading" role="status"><div className="spinner" /> Loading plan detail...</div>
        {integrityFailure && (
          <IntegrityBanner failure={integrityFailure} planData={null} />
        )}
      </div>
    );
  }

  return (
    <div className="page cpw-page">
      <IntegrityBanner failure={integrityFailure} planData={planData} />
      <PlanIdentityHeader planData={planData} reconciling={reconciling} />

      <_WorkspaceBody
        planData={planData}
        evidenceProfiles={evidenceProfiles}
        profileEntries={profileEntries}
        coverageFilter={coverageFilter}
        setCoverageFilter={setCoverageFilter}
        selectedProfile={selectedProfile}
        onSelectProfile={handleSelectProfile}
        onClearSelection={handleClearSelection}
        activePane={activePane}
        setActivePane={setActivePane}
        visualMode={visualMode}
        setVisualMode={setVisualMode}
        reconciling={reconciling}
      />
    </div>
  );
}

interface WorkspaceBodyProps {
  planData: PlanData;
  evidenceProfiles: EvidenceProfile | null;
  profileEntries: [string, NonNullable<EvidenceProfile['profiles']>[string]][];
  coverageFilter: CoverageFilter;
  setCoverageFilter: (f: CoverageFilter) => void;
  selectedProfile: string | null;
  onSelectProfile: (name: string | null) => void;
  onClearSelection: () => void;
  activePane: PaneId;
  setActivePane: (p: PaneId) => void;
  visualMode: VisualMode;
  setVisualMode: (m: VisualMode) => void;
  reconciling: boolean;
}

const _WorkspaceBody: React.FC<WorkspaceBodyProps> = ({
  planData,
  evidenceProfiles,
  profileEntries,
  coverageFilter,
  setCoverageFilter,
  selectedProfile,
  onSelectProfile,
  onClearSelection,
  activePane,
  setActivePane,
  visualMode,
  setVisualMode,
  reconciling,
}) => {
  const paneClasses = (pane: PaneId) =>
    `cpw-pane cpw-pane--${pane} ${activePane === pane ? 'cpw-pane--active' : ''}`;

  const effectiveProfileEntries = useMemo(() => {
    if (planData.canonicalSource?.schema !== 'harness/north-star-ledger') return profileEntries;
    return planData.reconciliations
      .filter((row) => typeof row.requirementId === 'string')
      .map((row) => [String(row.requirementId), {
        required_dimensions: [String(row.statement || '')],
        allowed_kinds: [],
      }] as [string, NonNullable<EvidenceProfile['profiles']>[string]]);
  }, [planData, profileEntries]);
  const canonicalMissingCount = planData.reconciliations.filter((row) => String(row.canonicalStatus || row.status || '') === 'MISSING').length;

  return (
    <>
      <div className="cpw-mobile-tabs" role="tablist" aria-label="Workspace panes">
        {(['navigator', 'canvas', 'inspector'] as PaneId[]).map((pane) => (
          <button
            key={pane}
            role="tab"
            aria-selected={activePane === pane}
            onClick={() => setActivePane(pane)}
            className={`cpw-mobile-tab ${activePane === pane ? 'cpw-mobile-tab--active' : ''}`}
          >
            {pane === 'navigator' ? 'Requirements' : pane === 'canvas' ? 'Execution' : 'Inspector'}
          </button>
        ))}
      </div>

      <div className="cpw-workspace">
        <div className={paneClasses('navigator')} role="region" aria-label="Requirement navigator">
          <div className="cpw-pane-header">
            <span className="typography-title3">Requirements</span>
            <span className="typography-caption">{effectiveProfileEntries.length}</span>
          </div>

          <ArtifactLineage planData={planData} />

          <div className="cpw-filter-bar">
            <div className="cluster cluster--xs" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {COVERAGE_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setCoverageFilter(f)}
                  className={`cpw-filter-chip ${coverageFilter === f ? 'cpw-filter-chip--active' : ''}`}
                >
                  <CoverageDot status={f} size={6} />
                  {COVERAGE_INFO[f].label}
                </button>
              ))}
            </div>
            <span className="typography-caption" aria-label="Canonical coverage summary">
              MISSING {canonicalMissingCount}
            </span>
          </div>

          <ProfileTree
            profiles={effectiveProfileEntries}
            coverageFilter={coverageFilter}
            selectedProfile={selectedProfile}
            onSelect={onSelectProfile}
            planData={planData}
          />

          <RepairHistory planData={planData} />
        </div>

        <div className={paneClasses('canvas')} role="region" aria-label="Execution canvas">
          <ReconciliationMatrix
            profiles={effectiveProfileEntries}
            planData={planData}
            onSelect={onSelectProfile}
          />

          <VisualExecution
            planData={planData}
            mode={visualMode}
            onModeChange={setVisualMode}
          />
        </div>

        <div className={paneClasses('inspector')} role="region" aria-label="Contextual inspector">
          <div className="cpw-pane-header">
            <span className="typography-title3">Inspector</span>
            {selectedProfile && (
              <button onClick={onClearSelection} className="btn btn--ghost btn--sm">
                Clear
              </button>
            )}
          </div>
          <div className="cpw-inspector-scroll">
            <EvidenceInspector
              selectedProfile={selectedProfile}
              evidenceProfiles={evidenceProfiles}
              profileEntries={effectiveProfileEntries}
              planData={planData}
            />
          </div>
        </div>
      </div>
    </>
  );
};
