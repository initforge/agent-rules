import React, { useEffect, useState } from 'react';

export default function RunsAndEvaluations() {
  const [runs, setRuns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/runs?limit=20').then(r => r.json()),
      fetch('/api/runs/telemetry?limit=20').then(r => r.json()),
    ]).then(([r, e]) => {
      if (r.ok) setRuns(r.data);
      setRunsLoading(false);
      if (e.ok) setEvents(e.data);
      setEventsLoading(false);
    }).catch(() => { setRunsLoading(false); setEventsLoading(false); });
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Runs & Evaluations</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Run History">
          {runsLoading ? (
            <div style={{ color: '#8b949e', fontSize: 12 }}>Loading...</div>
          ) : runs.length === 0 ? (
            <div style={{ color: '#8b949e', fontSize: 12 }}>No run history yet. Runs are recorded as they execute.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>Run ID</th>
                  <th style={{ padding: '4px 6px' }}>Platform</th>
                  <th style={{ padding: '4px 6px' }}>Model</th>
                  <th style={{ padding: '4px 6px' }}>Outcome</th>
                  <th style={{ padding: '4px 6px' }}>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '4px 6px', color: '#e1e4e8' }}>{r.run_id?.slice(0, 20)}</td>
                    <td style={{ padding: '4px 6px', color: '#58a6ff' }}>{r.platform || '-'}</td>
                    <td style={{ padding: '4px 6px', color: '#d2a8ff' }}>{r.model || '-'}</td>
                    <td style={{ padding: '4px 6px', color: r.outcome === 'PASS' ? '#3fb950' : r.outcome === 'FAIL' ? '#f85149' : '#8b949e' }}>{r.outcome || '-'}</td>
                    <td style={{ padding: '4px 6px', color: '#8b949e' }}>{r.input_tokens ? `${(r.input_tokens / 1000).toFixed(0)}k` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Telemetry Events">
          {eventsLoading ? (
            <div style={{ color: '#8b949e', fontSize: 12 }}>Loading...</div>
          ) : events.length === 0 ? (
            <div style={{ color: '#8b949e', fontSize: 12 }}>No telemetry events yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>Type</th>
                  <th style={{ padding: '4px 6px' }}>Platform</th>
                  <th style={{ padding: '4px 6px' }}>Outcome</th>
                  <th style={{ padding: '4px 6px' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '4px 6px', color: '#e1e4e8' }}>{e.event_type}</td>
                    <td style={{ padding: '4px 6px', color: '#58a6ff' }}>{e.platform || '-'}</td>
                    <td style={{ padding: '4px 6px', color: e.outcome === 'PASS' ? '#3fb950' : e.outcome === 'FAIL' ? '#f85149' : '#8b949e' }}>{e.outcome || '-'}</td>
                    <td style={{ padding: '4px 6px', color: '#8b949e' }}>{e.ts?.slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Evaluation Configuration">
        <div style={{ fontSize: 12, color: '#e1e4e8', lineHeight: 1.6 }}>
          <p><strong>Evidence Profiles:</strong> Multiple profiles defined in automation/evidence-profiles.json (static-change, implementation-runtime, behavior-safety, ui-parity, api-contract, access-control, etc.)</p>
          <p><strong>Benchmark Cases:</strong> Defined in automation/benchmarks/agent-quality-benchmark.json (deterministic + live evaluators)</p>
          <p><strong>Telemetry Schema:</strong> automation/benchmarks/telemetry.schema.json (OpenTelemetry GenAI aligned)</p>
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
