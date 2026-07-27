import React, { useEffect, useState } from 'react';

interface Agent {
  platform: string;
  file: string;
  path: string;
}

const ROLES = ['coordinator', 'architect', 'worker', 'reviewer', 'verifier'];

export default function WorkflowGraph() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [manifest, setManifest] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/config/agents').then(r => r.json()),
      fetch('/api/config/all').then(r => r.json()),
    ]).then(([a, c]) => {
      if (a.ok) setAgents(a.data);
      if (c.ok) setManifest(c.data.manifest);
    }).catch(() => {});
  }, []);

  const agentMap: Record<string, Agent[]> = {};
  for (const a of agents) {
    const role = ROLES.find(r => a.file?.toLowerCase().includes(r)) || 'other';
    if (!agentMap[role]) agentMap[role] = [];
    agentMap[role].push(a);
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Workflow Graph</h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {ROLES.map(role => (
          <div key={role} style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
            padding: 16,
            minWidth: 180,
            flex: 1,
          }}>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{role}</div>
            {(agentMap[role] || []).length === 0 ? (
              <div style={{ fontSize: 12, color: '#8b949e' }}>No agents defined</div>
            ) : (
              agentMap[role].map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: '#e1e4e8', padding: '4px 0', borderBottom: '1px solid #21262d' }}>
                  <div style={{ color: '#58a6ff' }}>{a.file?.replace('.md', '')}</div>
                  <div style={{ fontSize: 10, color: '#8b949e' }}>{a.platform}</div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 12 }}>Dependency & Active Status</h3>
        <div style={{ fontSize: 12, color: '#e1e4e8', lineHeight: 1.6 }}>
          <p><strong>Coordinator</strong> → routes tasks to Architect, Workers, and Reviewer/Verifier chain.</p>
          <p><strong>Architect</strong> → produces plan artifacts consumed by Workers.</p>
          <p><strong>Workers</strong> → execute assigned slices, output receipts.</p>
          <p><strong>Reviewer</strong> → reviews evidence, produces findings.</p>
          <p><strong>Verifier</strong> → final gate before acceptance.</p>
        </div>

        {manifest?.load_order && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Context Load Order (from manifest.yaml):</div>
            {manifest.load_order.map((r: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: '#8b949e', width: 20 }}>#{i}</span>
                <span style={{ color: '#e1e4e8' }}>{r}</span>
                <span style={{ color: '#3fb950', fontSize: 10 }}>● active</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
