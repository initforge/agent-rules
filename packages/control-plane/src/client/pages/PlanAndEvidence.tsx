import React, { useEffect, useState } from 'react';

export default function PlanAndEvidence() {
  const [evidenceProfiles, setEvidenceProfiles] = useState<any>(null);
  const [workLedgerSchema, setWorkLedgerSchema] = useState<any>(null);
  const [traceSchema, setTraceSchema] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/config/file?path=automation/evidence-profiles.json').then(r => r.json()),
      fetch('/api/config/file?path=automation/work-ledger.schema.json').then(r => r.json()),
      fetch('/api/config/file?path=automation/trace-schema.json').then(r => r.json()),
    ]).then(([e, w, t]) => {
      if (e.ok) setEvidenceProfiles(e.data);
      if (w.ok) setWorkLedgerSchema(w.data);
      if (t.ok) setTraceSchema(t.data);
    }).catch(() => {});
  }, []);

  const proofKinds = [
    { kind: 'static-change', dims: ['outcome', 'regression'], requiredEvidence: ['source-assertion', 'unit-test', 'integration-test'] },
    { kind: 'implementation-runtime', dims: ['outcome', 'integration', 'regression'], requiredEvidence: ['unit-test', 'integration-test', 'component-test'] },
    { kind: 'behavior-safety', dims: ['outcome', 'scope', 'negative-constraint'], requiredEvidence: ['source-assertion', 'artifact-audit', 'transcript-review'] },
    { kind: 'ui-parity', dims: ['interaction', 'state', 'regression', 'visual', 'reference'], requiredEvidence: ['component-test', 'browser-test', 'integration-test'] },
    { kind: 'api-contract', dims: ['positive', 'invalid-error', 'regression'], requiredEvidence: ['integration-test', 'unit-test'] },
    { kind: 'access-control', dims: ['allowed', 'denied', 'isolation'], requiredEvidence: ['integration-test', 'security-test'] },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Plan & Evidence</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Evidence Profiles">
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8 }}>
            {evidenceProfiles?.profiles ? `${Object.keys(evidenceProfiles.profiles).length} profiles` : 'Loading...'}
          </div>
          {evidenceProfiles?.profiles && Object.entries(evidenceProfiles.profiles).map(([name, profile]: [string, any]) => (
            <div key={name} style={{ padding: '6px 0', borderBottom: '1px solid #21262d', fontSize: 11 }}>
              <strong style={{ color: '#58a6ff' }}>{name}</strong>
              <div style={{ color: '#8b949e', marginTop: 2 }}>
                dimensions: {(profile.required_dimensions || []).join(', ')}
              </div>
              <div style={{ color: '#8b949e' }}>
                evidence: {(profile.allowed_kinds || []).join(', ')}
              </div>
              {profile.runtime_evidence_required && (
                <span style={{ color: '#d2a8ff', fontSize: 10 }}>⚡ runtime evidence required</span>
              )}
            </div>
          ))}
        </Card>

        <Card title="Proof Requirements Map">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px' }}>Profile</th>
                <th style={{ padding: '4px 6px' }}>Required Dimensions</th>
                <th style={{ padding: '4px 6px' }}>Evidence Kinds</th>
              </tr>
            </thead>
            <tbody>
              {proofKinds.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '4px 6px', color: '#58a6ff' }}>{p.kind}</td>
                  <td style={{ padding: '4px 6px', color: '#e1e4e8' }}>{p.dims.join(', ')}</td>
                  <td style={{ padding: '4px 6px', color: '#8b949e' }}>{p.requiredEvidence.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
        <Card title="Work Ledger Schema (v{workLedgerSchema?.$defs ? '4' : '?'})">
          {workLedgerSchema?.required && (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Required fields:</div>
              <div style={{ fontSize: 10, color: '#e1e4e8', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {workLedgerSchema.required.map((f: string) => (
                  <span key={f} style={{ background: '#0d1117', padding: '1px 6px', borderRadius: 3 }}>{f}</span>
                ))}
              </div>
            </div>
          )}
          {workLedgerSchema?.$defs?.slice?.properties?.status && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Slice statuses:</div>
              <div style={{ fontSize: 10, color: '#e1e4e8' }}>
                {(workLedgerSchema.$defs.slice.properties.status.enum || []).join(', ')}
              </div>
            </div>
          )}
        </Card>

        <Card title="Trace Schema (lane-based)">
          {traceSchema?.properties?.lane && (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Lanes:</div>
              <div style={{ fontSize: 10, color: '#e1e4e8' }}>
                {(traceSchema.properties.lane.enum || []).join(', ')}
              </div>
            </div>
          )}
          {traceSchema?.properties?.status && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Status values:</div>
              <div style={{ fontSize: 10, color: '#e1e4e8' }}>
                {(traceSchema.properties.status.enum || []).join(', ')}
              </div>
            </div>
          )}
          {traceSchema?.required && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Required fields:</div>
              <div style={{ fontSize: 10, color: '#e1e4e8', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {traceSchema.required.map((f: string) => (
                  <span key={f} style={{ background: '#0d1117', padding: '1px 6px', borderRadius: 3 }}>{f}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
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
