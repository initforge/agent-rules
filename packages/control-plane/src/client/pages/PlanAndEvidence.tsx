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

type LoadState = 'loading' | 'loaded' | 'error';

const PROOF_KINDS = [
  { kind: 'static-change', dims: ['outcome', 'regression'], requiredEvidence: ['source-assertion', 'unit-test', 'integration-test'] },
  { kind: 'implementation-runtime', dims: ['outcome', 'integration', 'regression'], requiredEvidence: ['unit-test', 'integration-test', 'component-test'] },
  { kind: 'behavior-safety', dims: ['outcome', 'scope', 'negative-constraint'], requiredEvidence: ['source-assertion', 'artifact-audit', 'transcript-review'] },
  { kind: 'ui-parity', dims: ['interaction', 'state', 'regression', 'visual', 'reference'], requiredEvidence: ['component-test', 'browser-test', 'integration-test'] },
  { kind: 'api-contract', dims: ['positive', 'invalid-error', 'regression'], requiredEvidence: ['integration-test', 'unit-test'] },
  { kind: 'access-control', dims: ['allowed', 'denied', 'isolation'], requiredEvidence: ['integration-test', 'security-test'] },
];

export default function PlanAndEvidence() {
  const [evidenceProfiles, setEvidenceProfiles] = useState<EvidenceProfile | null>(null);
  const [workLedgerSchema, setWorkLedgerSchema] = useState<JsonSchema | null>(null);
  const [traceSchema, setTraceSchema] = useState<JsonSchema | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

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
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    });

    return () => { mountedRef.current = false; };
  }, []);

  if (loadState === 'loading') {
    return (
      <div>
        <h1 className="page-title">Plan & Evidence</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Plan & Evidence</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  const profileEntries = evidenceProfiles?.profiles ? Object.entries(evidenceProfiles.profiles) : [];

  return (
    <div>
      <h1 className="page-title">Plan & Evidence</h1>

      <div className="grid grid--wide mb-lg">
        <div className="card">
          <h3 className="card-title">Evidence Profiles</h3>
          <div className="text-xs text-secondary mb-sm">
            {profileEntries.length > 0 ? `${profileEntries.length} profiles` : 'No profiles loaded'}
          </div>
          {profileEntries.length === 0 ? (
            <div className="state-empty">No evidence profiles defined</div>
          ) : (
            profileEntries.map(([name, profile]) => (
              <div key={name} className="detail-row">
                <strong className="text-link">{name}</strong>
                <div className="text-secondary text-xs mt-sm">
                  dimensions: {(profile.required_dimensions || []).join(', ')}
                </div>
                <div className="text-secondary text-xs">
                  evidence: {(profile.allowed_kinds || []).join(', ')}
                </div>
                {profile.runtime_evidence_required && (
                  <span className="text-accent text-xs mt-sm flex-row"><span className="dot dot--warning" />runtime evidence required</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Proof Requirements Map</h3>
          <div className="table-wrap">
            <table>
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
                    <td className="text-link">{p.kind}</td>
                    <td>{p.dims.join(', ')}</td>
                    <td className="text-secondary">{p.requiredEvidence.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid--wide">
        <div className="card">
          <h3 className="card-title">Work Ledger Schema (v{workLedgerSchema?.$defs ? '4' : '?'})</h3>
          {workLedgerSchema?.required ? (
            <div>
              <div className="text-xs text-secondary mb-sm">Required fields:</div>
              <div className="flex-row flex-wrap" style={{ gap: 4 }}>
                {workLedgerSchema.required.map((f: string) => (
                  <span key={f} className="tag">{f}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="state-empty">No schema data loaded</div>
          )}
          {workLedgerSchema?.$defs?.slice?.properties?.status?.enum && (
            <div className="mt-md">
              <div className="text-xs text-secondary mb-sm">Slice statuses:</div>
              <div className="text-xs">{(workLedgerSchema.$defs.slice.properties.status.enum || []).join(', ')}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Trace Schema (lane-based)</h3>
          {traceSchema?.properties?.lane?.enum ? (
            <div>
              <div className="text-xs text-secondary mb-sm">Lanes:</div>
              <div className="text-xs">{(traceSchema.properties.lane.enum || []).join(', ')}</div>
            </div>
          ) : (
            <div className="state-empty">No schema data loaded</div>
          )}
          {traceSchema?.properties?.status?.enum && (
            <div className="mt-md">
              <div className="text-xs text-secondary mb-sm">Status values:</div>
              <div className="text-xs">{(traceSchema.properties.status.enum || []).join(', ')}</div>
            </div>
          )}
          {traceSchema?.required && (
            <div className="mt-md">
              <div className="text-xs text-secondary mb-sm">Required fields:</div>
              <div className="flex-row flex-wrap" style={{ gap: 4 }}>
                {traceSchema.required.map((f: string) => (
                  <span key={f} className="tag">{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
