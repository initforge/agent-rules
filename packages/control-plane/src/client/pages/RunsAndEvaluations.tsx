import React, { useEffect, useState, useRef } from 'react';

interface Run {
  run_id?: string;
  platform?: string;
  model?: string;
  outcome?: string;
  input_tokens?: number;
}

interface TelemetryEvent {
  event_type?: string;
  platform?: string;
  outcome?: string;
  ts?: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function RunsAndEvaluations() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    Promise.all([
      fetch('/api/runs?limit=20').then(r => { if (!r.ok) throw new Error('Failed to fetch runs'); return r.json(); }),
      fetch('/api/runs/telemetry?limit=20').then(r => { if (!r.ok) throw new Error('Failed to fetch telemetry'); return r.json(); }),
    ]).then(([r, e]) => {
      if (!mountedRef.current) return;
      if (r.ok) setRuns(r.data);
      if (e.ok) setEvents(e.data);
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
        <h1 className="page-title">Runs & Evaluations</h1>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <h1 className="page-title">Runs & Evaluations</h1>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Runs & Evaluations</h1>

      <div className="grid grid--wide mb-lg">
        <div className="card">
          <h3 className="card-title">Run History</h3>
          {runs.length === 0 ? (
            <div className="state-empty">No run history yet. Runs are recorded as they execute.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Platform</th>
                    <th>Model</th>
                    <th>Outcome</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i}>
                      <td className="text-mono">{r.run_id?.slice(0, 20)}</td>
                      <td className="text-link">{r.platform || '-'}</td>
                      <td className="text-accent">{r.model || '-'}</td>
                      <td className={r.outcome === 'PASS' ? 'text-success' : r.outcome === 'FAIL' ? 'text-danger' : 'text-secondary'}>
                        {r.outcome || '-'}
                      </td>
                      <td className="text-secondary">{r.input_tokens ? `${(r.input_tokens / 1000).toFixed(0)}k` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Telemetry Events</h3>
          {events.length === 0 ? (
            <div className="state-empty">No telemetry events yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Platform</th>
                    <th>Outcome</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td>{e.event_type}</td>
                      <td className="text-link">{e.platform || '-'}</td>
                      <td className={e.outcome === 'PASS' ? 'text-success' : e.outcome === 'FAIL' ? 'text-danger' : 'text-secondary'}>
                        {e.outcome || '-'}
                      </td>
                      <td className="text-secondary">{e.ts?.slice(0, 19).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Evaluation Configuration</h3>
        <div className="text-sm" style={{ lineHeight: 1.6 }}>
          <p><strong>Evidence Profiles:</strong> Multiple profiles defined in automation/evidence-profiles.json (static-change, implementation-runtime, behavior-safety, ui-parity, api-contract, access-control, etc.)</p>
          <p><strong>Benchmark Cases:</strong> Defined in evals/fixtures/agent-quality-benchmark.json (deterministic + live evaluators)</p>
          <p><strong>Telemetry Schema:</strong> evals/fixtures/telemetry.schema.json (OpenTelemetry GenAI aligned)</p>
        </div>
      </div>
    </div>
  );
}
