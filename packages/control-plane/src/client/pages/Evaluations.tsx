import React from 'react';

interface EvaluationsProps {
  navigate: (path: string) => void;
}

export default function Evaluations({ navigate }: EvaluationsProps) {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="typography-title">Evaluations</h1>
        <p className="typography-caption">Benchmark results, quality metrics, and conformance checks</p>
      </div>

      <div className="grid-layout grid-layout--auto">
        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 8 }}>Quality Benchmarks</h3>
          <p className="typography-caption">Deterministic and live evaluators from agent-quality-benchmark.json</p>
          <div className="state-empty" style={{ padding: '16px 0' }}>Benchmark data loading...</div>
        </div>

        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 8 }}>Conformance</h3>
          <p className="typography-caption">Evidence profile conformance checks and verification results</p>
          <div className="state-empty" style={{ padding: '16px 0' }}>No conformance results yet</div>
        </div>

        <div className="surface" style={{ padding: 16 }}>
          <h3 className="typography-title3" style={{ marginBottom: 8 }}>Telemetry</h3>
          <p className="typography-caption">OpenTelemetry GenAI-aligned event stream</p>
          <div className="state-empty" style={{ padding: '16px 0' }}>No telemetry summary available</div>
        </div>
      </div>

      <div className="surface" style={{ marginTop: 16, padding: 16 }}>
        <h3 className="typography-title3" style={{ marginBottom: 12 }}>Recent Evaluation Results</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Benchmark</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}><div className="state-empty">No evaluation results recorded yet</div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
