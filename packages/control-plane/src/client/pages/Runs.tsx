import React, { useEffect, useState, useRef } from 'react';

interface Run {
  run_id?: string;
  platform?: string;
  model?: string;
  outcome?: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  ts?: string;
}

interface TelemetryEvent {
  event_type?: string;
  platform?: string;
  outcome?: string;
  ts?: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

type Tab = 'summary' | 'workflow' | 'evidence' | 'timeline' | 'plan';

interface RunsProps {
  segments: string[];
  navigate: (path: string) => void;
}

export default function Runs({ segments, navigate }: RunsProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const mountedRef = useRef(true);

  const runId = segments[1] || null;
  const tab = (segments[2] as Tab) || 'summary';

  useEffect(() => {
    if (runId) setSelectedRun(runId);
    if (tab) setActiveTab(tab);
  }, [runId, tab]);

  useEffect(() => {
    mountedRef.current = true;

    Promise.all([
      fetch('/api/runs?limit=50').then(r => { if (!r.ok) throw new Error('Failed to fetch runs'); return r.json(); }),
      fetch('/api/runs/telemetry?limit=50').then(r => { if (!r.ok) throw new Error('Failed to fetch telemetry'); return r.json(); }),
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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'plan', label: 'Plan' },
  ];

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Runs</h1>
          <p className="typography-caption">Run history, telemetry, and evaluation results</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">Runs</h1>
          <p className="typography-caption">Run history, telemetry, and evaluation results</p>
        </div>
        <div className="state-error">{error}</div>
      </div>
    );
  }

  const selectedRunData = runs.find(r => r.run_id === selectedRun);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Runs</h1>
        <p className="typography-caption">Run history, telemetry, and evaluation results</p>
      </div>

      <div className="runs-layout">
        <div className="surface runs-list">
          <div className="runs-list-header">
            <h2 className="typography-title3">Run History</h2>
            <span className="typography-caption">{runs.length} runs</span>
          </div>
          {runs.length === 0 ? (
            <div className="state-empty" style={{ padding: '24px 0' }}>No run history yet</div>
          ) : (
            <div className="runs-list-items">
              {runs.map((r, i) => (
                <button
                  key={i}
                  onClick={() => navigate(`/runs/${r.run_id}/${activeTab}`)}
                  className={`runs-list-item ${selectedRun === r.run_id ? 'runs-list-item--selected' : ''}`}
                >
                  <div className="runs-list-item-row">
                    <span className="typography-mono" style={{ fontSize: 11 }}>{r.run_id?.slice(0, 16)}</span>
                    <span className={`badge ${r.outcome === 'PASS' ? 'badge--success' : r.outcome === 'FAIL' ? 'badge--danger' : 'badge--default'}`}>
                      {r.outcome || '?'}
                    </span>
                  </div>
                  <div className="runs-list-item-row">
                    <span className="typography-caption">{r.platform || '-'}</span>
                    <span className="typography-caption">{r.model ? r.model.slice(0, 20) : '-'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="runs-detail">
          {selectedRunData ? (
            <div className="surface" style={{ padding: 0 }}>
              <div className="runs-detail-tabs" role="tablist">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={activeTab === t.id}
                    onClick={() => {
                      setActiveTab(t.id);
                      navigate(`/runs/${selectedRun}/${t.id}`);
                    }}
                    className={`runs-tab ${activeTab === t.id ? 'runs-tab--active' : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="runs-detail-content" role="tabpanel">
                {activeTab === 'summary' && (
                  <div className="stack stack--sm">
                    <div className="detail-field"><span className="typography-caption">Run ID</span><span className="typography-mono">{selectedRunData.run_id}</span></div>
                    <div className="detail-field"><span className="typography-caption">Platform</span><span className="typography-body">{selectedRunData.platform || '-'}</span></div>
                    <div className="detail-field"><span className="typography-caption">Model</span><span className="typography-body">{selectedRunData.model || '-'}</span></div>
                    <div className="detail-field"><span className="typography-caption">Outcome</span><span className={`typography-body ${selectedRunData.outcome === 'PASS' ? 'text-success' : selectedRunData.outcome === 'FAIL' ? 'text-danger' : ''}`}>{selectedRunData.outcome || '-'}</span></div>
                    <div className="detail-field"><span className="typography-caption">Input Tokens</span><span className="typography-body">{selectedRunData.input_tokens?.toLocaleString() || '-'}</span></div>
                    <div className="detail-field"><span className="typography-caption">Output Tokens</span><span className="typography-body">{selectedRunData.output_tokens?.toLocaleString() || '-'}</span></div>
                    <div className="detail-field"><span className="typography-caption">Duration</span><span className="typography-body">{selectedRunData.duration_ms ? `${(selectedRunData.duration_ms / 1000).toFixed(1)}s` : '-'}</span></div>
                  </div>
                )}
                {activeTab === 'workflow' && (
                  <div className="state-empty" style={{ padding: '24px 0' }}>Workflow detail not available</div>
                )}
                {activeTab === 'evidence' && (
                  <div className="state-empty" style={{ padding: '24px 0' }}>No evidence recorded for this run</div>
                )}
                {activeTab === 'timeline' && (
                  <div className="state-empty" style={{ padding: '24px 0' }}>Timeline data not available</div>
                )}
                {activeTab === 'plan' && (
                  <div className="state-empty" style={{ padding: '24px 0' }}>No plan associated with this run</div>
                )}
              </div>
            </div>
          ) : (
            <div className="surface" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={{ textAlign: 'center' }}>
                <div className="typography-title3" style={{ marginBottom: 8 }}>Select a Run</div>
                <p className="typography-caption">Choose a run from the list to view details</p>
              </div>
            </div>
          )}

          <div className="surface" style={{ marginTop: 12, padding: 16 }}>
            <h3 className="typography-title3" style={{ marginBottom: 12 }}>Evaluation Configuration</h3>
            <p className="typography-body" style={{ lineHeight: 1.6 }}>
              Evidence profiles defined in <span className="typography-mono">automation/evidence-profiles.json</span>.
              Benchmark cases in <span className="typography-mono">evals/fixtures/agent-quality-benchmark.json</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="surface" style={{ marginTop: 16, padding: 16 }}>
        <h3 className="typography-title3" style={{ marginBottom: 12 }}>Telemetry Events</h3>
        {events.length === 0 ? (
          <div className="state-empty">No telemetry events yet</div>
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
                    <td><span className="typography-body">{e.event_type}</span></td>
                    <td><span className="typography-mono" style={{ color: 'var(--color-text-link)' }}>{e.platform || '-'}</span></td>
                    <td><span className={`typography-body ${e.outcome === 'PASS' ? 'text-success' : e.outcome === 'FAIL' ? 'text-danger' : ''}`}>{e.outcome || '-'}</span></td>
                    <td><span className="typography-caption">{e.ts?.slice(0, 19).replace('T', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
