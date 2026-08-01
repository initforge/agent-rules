import React, { useEffect, useState, useCallback } from 'react';

type ViewId = 'readiness' | 'dag' | 'conflicts' | 'worktrees' | 'agents' | 'resources' | 'topology' | 'parity' | 'waits' | 'gates';

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'dag', label: 'DAG / Critical Path' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'agents', label: 'Agent Pool' },
  { id: 'resources', label: 'Resources' },
  { id: 'topology', label: 'Topology' },
  { id: 'parity', label: 'Parity' },
  { id: 'waits', label: 'Waits / Retries' },
  { id: 'gates', label: 'Terminal Gates' },
];

function isViewId(v: string): v is ViewId {
  return VIEWS.some(x => x.id === v);
}

type LoadState = 'loading' | 'loaded' | 'error';

function useView<T>(view: ViewId): { data: T | null; state: LoadState; error: string } {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    setState('loading');
    fetch(`/api/m11/${view}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!stale) { setData(d.ok ? d : null); setState('loaded'); } })
      .catch(e => { if (!stale) { setError(e instanceof Error ? e.message : String(e)); setState('error'); } });
    return () => { stale = true; };
  }, [view]);

  return { data, state, error };
}

function stateBadge(status: string): string {
  const s = String(status || 'UNKNOWN').toUpperCase();
  if (s === 'MATCH' || s === 'PASS' || s === 'OBSERVED' || s === 'EXISTS' || s === 'COMPLETE' || s === 'AUTONOMOUS_READY' || s === 'TERMINAL_GATE_PASS') return 'cpw-badge--success';
  if (s === 'PARTIAL' || s === 'BOUNDED_READY' || s === 'IN_PROGRESS' || s === 'WAITING_EXTERNAL' || s === 'WAITING_AUTHORITY' || s === 'WAITING_RESOURCE' || s === 'RETRY_SCHEDULED') return 'cpw-badge--warning';
  if (s === 'GAP' || s === 'MISSING' || s === 'NEEDS_REMEDIATION' || s === 'NOT_PASS' || s === 'OWNER_DECISION_REQUIRED' || s === 'FAIL' || s === 'HISTORICAL_STALE_FOR_M11') return 'cpw-badge--danger';
  return 'cpw-badge--default';
}

function Badge({ status, children }: { status: string; children?: React.ReactNode }) {
  return <span className={`cpw-badge cpw-badge--sm ${stateBadge(status)}`}>{children ?? status}</span>;
}

interface FieldProps { label: string; value: React.ReactNode }
const Field: React.FC<FieldProps> = ({ label, value }) => (
  <div className="m11-field">
    <span className="typography-caption">{label}</span>
    <span className="typography-body">{value ?? '\u2014'}</span>
  </div>
);

interface TableProps { caption: string; headers: string[]; rows: React.ReactNode[][] }
const DataTable: React.FC<TableProps> = ({ caption, headers, rows }) => (
  <div className="m11-table-wrap">
    <table className="m11-table">
      <caption className="m11-caption">{caption}</caption>
      <thead>
        <tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0
          ? <tr><td className="state-empty" colSpan={headers.length}>No data</td></tr>
          : rows.map((cells, i) => <tr key={i}>{cells.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

function ViewShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="m11-view" aria-label={title}>
      <div className="m11-view-head">
        <div>
          <h2 className="typography-title2">{title}</h2>
          <p className="typography-caption">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return <div className="state-loading"><div className="spinner" /> Loading view...</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="state-error">{message}</div>;
}

/* ---------------------------------- readiness -------------------------------- */

function ReadinessView({ data }: { data: Record<string, unknown> }) {
  const coverage = (data.coverage || {}) as Record<string, unknown>;
  const byStatus = (coverage.byStatus || {}) as Record<string, number>;
  const reqs = (coverage.requirements || []) as Array<Record<string, unknown>>;
  const envelope = (data.authorityEnvelope || {}) as Record<string, unknown>;
  const decisions = (data.decisionMatrix || {}) as Record<string, unknown>;
  const ledger = (data.ledger || {}) as Record<string, unknown>;

  const total = coverage.total as number;
  const match = byStatus.MATCH ?? 0;
  const partial = byStatus.PARTIAL ?? 0;
  const gap = byStatus.GAP ?? 0;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <ViewShell title="Plan Readiness" subtitle="Readiness derives from the ledger and verification graph — never from configuration.">
      <div className="m11-stats" role="list" aria-label="Readiness summary">
        <div className="surface m11-stat" role="listitem">
          <span className="typography-caption">Readiness state</span>
          <span className="m11-stat-value"><Badge status={String(data.readinessState)}>{String(data.readinessState)}</Badge></span>
          <span className="typography-caption">declared: {String(data.declaredReadiness)}</span>
        </div>
        <div className="surface m11-stat" role="listitem">
          <span className="typography-caption">Evidence-grounded green</span>
          <span className="m11-stat-value"><Badge status={data.evidenceGreen ? 'PASS' : 'NOT_PASS'}>{data.evidenceGreen ? 'green' : 'not green'}</Badge></span>
          <span className="typography-caption">all requirements MATCH, no findings, fresh review</span>
        </div>
        <div className="surface m11-stat" role="listitem">
          <span className="typography-caption">Ledger state</span>
          <span className="m11-stat-value"><Badge status={String(ledger.executionState)}>{String(ledger.executionState)}</Badge></span>
          <span className="typography-caption">terminal marker: {String(ledger.terminalMarkerStatus) || '\u2014'}</span>
        </div>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Requirement coverage ({total})</h3>
        <div className="m11-bar" aria-hidden="true">
          <span className="m11-bar-seg m11-bar--match" style={{ width: `${pct(match)}%` }} />
          <span className="m11-bar-seg m11-bar--partial" style={{ width: `${pct(partial)}%` }} />
          <span className="m11-bar-seg m11-bar--gap" style={{ width: `${pct(gap)}%` }} />
        </div>
        <div className="cluster cluster--xs" role="list" aria-label="Coverage counts">
          <span className="cpw-tag" role="listitem">MATCH {match}</span>
          <span className="cpw-tag" role="listitem">PARTIAL {partial}</span>
          <span className="cpw-tag cpw-tag--danger" role="listitem">GAP {gap}</span>
        </div>
      </div>

      <div className="surface m11-section">
        <DataTable
          caption="Requirements"
          headers={['ID', 'Status', 'Cluster', 'Source']}
          rows={reqs.map(r => [
            <span className="typography-mono" key="id">{String(r.requirementId)}</span>,
            <Badge status={String(r.status)} key="st" />,
            <span className="typography-mono" key="cl">{String(r.cluster || '\u2014')}</span>,
            <span className="typography-caption" key="src">{String(r.source || '\u2014')}</span>,
          ])}
        />
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Authority envelope</h3>
        <div className="m11-fields">
          <Field label="Allowed" value={(envelope.allowed as string[] ?? []).join(', ')} />
          <Field label="Owner-only" value={(envelope.owner_only as string[] ?? []).join(', ')} />
        </div>
        <h3 className="typography-title3">Decision matrix</h3>
        <DataTable
          caption="Reversible defaults"
          headers={['Action', 'Default', 'Rollback']}
          rows={((decisions.reversible_defaults as Array<Record<string, unknown>>) ?? []).map(d => [
            <span className="typography-mono" key="a">{String(d.action)}</span>,
            <span key="d">{String(d.default)}</span>,
            <span className="typography-caption" key="r">{String(d.rollback || '\u2014')}</span>,
          ])}
        />
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Readiness reasons</h3>
        <ul className="m11-list" aria-label="Readiness reasons">
          {(data.readinessReasons as string[] ?? []).map((r, i) => <li key={i} className="typography-caption">{r}</li>)}
        </ul>
      </div>
    </ViewShell>
  );
}

/* ------------------------------------ dag ------------------------------------ */

function DagView({ data }: { data: Record<string, unknown> }) {
  const stages = (data.stages || []) as Array<Record<string, unknown>>;
  const edges = (data.edges || []) as Array<Record<string, unknown>>;
  const critical = (data.criticalPath || []) as string[];
  const ready = (data.readyAntichain || []) as string[];
  const recoverable = (data.recoverableStates || []) as Array<Record<string, unknown>>;
  const counts = (data.edgeCounts || {}) as Record<string, number>;

  const pathIdx = new Map(critical.map((id, i) => [id, i]));
  const readySet = new Set(ready);

  return (
    <ViewShell title="Execution Graph" subtitle="Typed cross-stage dependencies, critical path, and the conflict-free ready antichain.">
      <div className="m11-stages" role="list" aria-label="Stages">
        {stages.map(s => {
          const isCritical = pathIdx.has(String(s.id));
          const isReady = readySet.has(String(s.id));
          return (
            <div key={String(s.id)} className={`m11-stage ${isCritical ? 'm11-stage--critical' : ''} ${isReady ? 'm11-stage--ready' : ''}`} role="listitem">
              <div className="m11-stage-top">
                <span className="typography-mono">{String(s.id)}</span>
                <Badge status={String(s.state)}>{String(s.state)}</Badge>
              </div>
              <div className="m11-stage-name typography-body">{String(s.name)}</div>
              <div className="m11-stage-meta">
                {isCritical && <span className="cpw-tag">critical path</span>}
                {isReady && <span className="cpw-tag">ready</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Edges ({edges.length})</h3>
        <div className="cluster cluster--xs" aria-label="Edge type counts">
          {Object.entries(counts).map(([t, n]) => <span key={t} className="cpw-tag">{t} {n}</span>)}
        </div>
        <DataTable
          caption="Edges"
          headers={['From', 'Type', 'To']}
          rows={edges.map(e => [
            <span className="typography-mono" key="f">{String(e.from)}</span>,
            <Badge status={String(e.type)} key="t">{String(e.type)}</Badge>,
            <span className="typography-mono" key="t2">{String(e.to)}</span>,
          ])}
        />
        <div className="m11-fields">
          <Field label="Scheduling" value={String(data.scheduling || '\u2014')} />
          <Field label="Critical path" value={critical.join(' \u2192 ')} />
          <Field label="Ready antichain" value={ready.join(', ') || '\u2014'} />
          <Field label="BLOCKED reserved for" value={String(data.blockedReservedFor || '\u2014')} />
        </div>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Recoverable states</h3>
        <DataTable
          caption="Recoverable states"
          headers={['State', 'Wake', 'Deadline', 'Fallback']}
          rows={recoverable.map(s => [
            <Badge status={String(s.state)} key="s" />,
            <span className="typography-caption" key="w">{String(s.wake || '\u2014')}</span>,
            <span className="typography-caption" key="d">{String(s.deadline || '\u2014')}</span>,
            <span className="typography-caption" key="f">{String(s.fallback || '\u2014')}</span>,
          ])}
        />
      </div>
    </ViewShell>
  );
}

/* --------------------------------- conflicts -------------------------------- */

function ConflictsView({ data }: { data: Record<string, unknown> }) {
  const domains = (data.domains || []) as Array<Record<string, unknown>>;
  const ownership = (data.ownership || []) as Array<Record<string, unknown>>;
  const leases = (data.liveLeases || {}) as Record<string, unknown>;

  return (
    <ViewShell title="Conflict Graph" subtitle="Conflict domains, leased resources, and observed ownership.">
      <div className="m11-cards" role="list" aria-label="Conflict domains">
        {domains.map(d => (
          <div key={String(d.id)} className="surface m11-card" role="listitem">
            <h3 className="typography-title3 typography-mono">{String(d.id)}</h3>
            <p className="typography-caption">Conflicts</p>
            <ul className="m11-list">
              {(d.conflicts as string[] ?? []).map((c, i) => <li key={i} className="typography-caption">{c}</li>)}
            </ul>
            <p className="typography-caption">Leases</p>
            <div className="cluster cluster--xs">
              {(d.leases as string[] ?? []).map((l, i) => <span key={i} className="cpw-tag">{l}</span>)}
            </div>
          </div>
        ))}
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Ownership</h3>
        <DataTable
          caption="Path ownership"
          headers={['Owner', 'Paths']}
          rows={ownership.map(o => [
            <span className="typography-mono" key="o">{String(o.owner)}</span>,
            <span className="typography-caption" key="p">{(o.paths as string[] ?? []).join(', ')}</span>,
          ])}
        />
        <h3 className="typography-title3">Observed leases</h3>
        <div className="m11-fields">
          <Field label="Worktrees" value={(leases.worktrees as string[] ?? []).length} />
          <Field label="Branches" value={(leases.branches as string[] ?? []).length} />
        </div>
      </div>
    </ViewShell>
  );
}

/* --------------------------------- worktrees -------------------------------- */

function WorktreesView({ data }: { data: Record<string, unknown> }) {
  const wts = (data.worktrees || []) as Array<Record<string, unknown>>;
  const branches = (data.branches || []) as string[];
  const train = (data.integrationTrain || {}) as Record<string, unknown>;
  const epoch = (train.baseEpoch || {}) as Record<string, unknown>;

  return (
    <ViewShell title="Worktrees & Integration Train" subtitle="Observed git worktrees and the rolling integration train.">
      <div className="surface m11-section">
        <h3 className="typography-title3">Worktrees ({wts.length})</h3>
        <DataTable
          caption="Worktrees"
          headers={['Path', 'Branch', 'Head', 'Dirty', 'Untracked']}
          rows={wts.map(w => [
            <span className="typography-mono" key="p">{String(w.path)}</span>,
            <span className="typography-mono" key="b">{String(w.branch ?? 'detached')}</span>,
            <span className="typography-mono" key="h">{String(w.head).slice(0, 12)}</span>,
            <Badge status={w.dirty ? 'NEEDS_REMEDIATION' : 'PASS'} key="d">{w.dirty ? 'dirty' : 'clean'}</Badge>,
            <span key="u">{Number(w.untracked ?? 0)}</span>,
          ])}
        />
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Integration train</h3>
        <div className="m11-fields">
          <Field label="Base epoch revision" value={String(epoch.revision ?? '\u2014')} />
          <Field label="Effective identity" value={<span className="typography-mono">{String(epoch.effective_identity ?? '\u2014')}</span>} />
          <Field label="Base head" value={<span className="typography-mono">{String(epoch.head_commit ?? '\u2014')}</span>} />
          <Field label="Merge order" value={String(train.mergeOrder || '\u2014')} />
          <Field label="Receipts" value={((train.receipts as unknown[] ?? [])).length} />
        </div>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Branches ({branches.length})</h3>
        <div className="cluster cluster--xs">
          {branches.map(b => <span key={b} className="cpw-tag">{b}</span>)}
          {branches.length === 0 && <span className="typography-caption">none observed</span>}
        </div>
      </div>
    </ViewShell>
  );
}

/* ----------------------------------- agents --------------------------------- */

function AgentsView({ data }: { data: Record<string, unknown> }) {
  const hosts = (data.hosts || []) as Array<Record<string, unknown>>;
  const receipts = (data.receipts || []) as Array<Record<string, unknown>>;
  const diagnostics = (data.diagnostics || null) as Record<string, unknown> | null;

  return (
    <ViewShell title="Native Agent Pool" subtitle="A view of recorded receipts, attestations, and diagnostics. Status is never derived from configuration.">
      <div className="m11-attention" role="note">
        <span className="typography-caption">{String(data.policy || '')}</span>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Hosts ({hosts.length})</h3>
        <DataTable
          caption="Agent host status"
          headers={['Host', 'State', 'Reason', 'Receipts']}
          rows={hosts.map(h => [
            <span className="typography-mono" key="h">{String(h.host)}</span>,
            <Badge status={String(h.state)} key="s">{String(h.state)}</Badge>,
            <span className="typography-caption" key="r">{String(h.reason)}</span>,
            <span key="n">{Number(h.receipts ?? 0)}</span>,
          ])}
        />
      </div>

      {diagnostics && (
        <div className="surface m11-section">
          <h3 className="typography-title3">Host certification diagnostics</h3>
          <div className="m11-fields">
            <Field label="File" value={String(diagnostics.file || '\u2014')} />
            <Field label="Status" value={<Badge status={String(diagnostics.status || 'UNKNOWN')}>{String(diagnostics.status || 'UNKNOWN')}</Badge>} />
          </div>
        </div>
      )}

      <div className="surface m11-section">
        <h3 className="typography-title3">Recorded receipts ({receipts.length})</h3>
        <DataTable
          caption="Receipts"
          headers={['File', 'Receipt ID', 'Host', 'Observed model', 'Provider']}
          rows={receipts.slice(0, 50).map(r => {
            const author = (r.author || {}) as Record<string, unknown>;
            const routing = (r.routing || {}) as Record<string, unknown>;
            return [
              <span className="typography-mono" key="f">{String(r.file || '\u2014')}</span>,
              <span className="typography-mono" key="i">{String(r.receipt_id || '\u2014')}</span>,
              <span className="typography-mono" key="h">{String(author.host || routing.host || '\u2014')}</span>,
              <span className="typography-mono" key="m">{String(routing.observed_model || author.model_id || '\u2014')}</span>,
              <span className="typography-mono" key="p">{String(routing.provider || author.provider || '\u2014')}</span>,
            ];
          })}
        />
      </div>
    </ViewShell>
  );
}

/* --------------------------------- resources -------------------------------- */

function ResourcesView({ data }: { data: Record<string, unknown> }) {
  const ceilings = (data.governorCeilings || {}) as Record<string, unknown>;
  const host = (data.hostCapability || {}) as Record<string, unknown>;
  const limits = (data.measuredLimits || {}) as Record<string, unknown>;
  const defaults = (data.defaults || {}) as Record<string, unknown>;
  const snapshots = (data.runtimeSnapshots || []) as Array<Record<string, unknown>>;

  const ceilRows = [
    ['Total native children', ceilings.total_native_children],
    ['Writers', ceilings.writers],
    ['Reviewers / auditors', ceilings.reviewers_auditors],
    ['Integration owner', ceilings.integration_owner],
    ['Browser heavy (default / burst)', ceilings.browser_heavy ? `${String((ceilings.browser_heavy as Record<string, unknown>).default)} / ${String((ceilings.browser_heavy as Record<string, unknown>).burst)}` : '\u2014'],
    ['Full build / test', ceilings.full_build_test],
    ['Full Compose topology', ceilings.full_compose_topology],
  ];

  return (
    <ViewShell title="Resource Governor" subtitle="Governor ceilings from the resource budget and any observed runtime snapshots.">
      <div className="m11-cards" role="list" aria-label="Governor ceilings">
        {ceilRows.map(([label, value]) => (
          <div key={String(label)} className="surface m11-card m11-card--stat" role="listitem">
            <span className="typography-caption">{String(label)}</span>
            <span className="m11-stat-value">{String(value ?? '\u2014')}</span>
          </div>
        ))}
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Host capability</h3>
        <div className="m11-fields">
          <Field label="CPU count" value={String(host.cpu_count ?? '\u2014')} />
          <Field label="Total memory" value={String(host.total_mem_mb ?? '\u2014')} />
          <Field label="Tools" value={(host.tools as string[] ?? []).join(', ')} />
          <Field label="External CI green" value={String(host.external_ci_green ?? '\u2014')} />
          <Field label="Measured runnable by RAM" value={String(limits.runnable_children_by_ram ?? '\u2014')} />
          <Field label="Measured ceiling" value={String(limits.ceiling ?? '\u2014')} />
        </div>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Governor defaults</h3>
        <ul className="m11-list">
          {Object.entries(defaults).map(([k, v]) => (
            <li key={k} className="typography-caption"><strong>{k}</strong>: {String(v)}</li>
          ))}
        </ul>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Runtime governor snapshots ({snapshots.length})</h3>
        {snapshots.length === 0
          ? <span className="typography-caption">No runtime governor snapshot files found yet.</span>
          : <ul className="m11-list">{snapshots.map((s, i) => <li key={i} className="typography-caption typography-mono">{String(s.file)}</li>)}</ul>}
      </div>
    </ViewShell>
  );
}

/* ---------------------------------- topology --------------------------------- */

function TopologyView({ data }: { data: Record<string, unknown> }) {
  const services = (data.services || []) as Array<Record<string, unknown>>;
  const ports = (data.ports || []) as Array<Record<string, unknown>>;
  const databases = (data.databases || []) as Array<Record<string, unknown>>;
  const queues = (data.queues || []) as Array<Record<string, unknown>>;
  const migrations = (data.migrations || []) as Array<Record<string, unknown>>;
  const journeys = (data.journeys || []) as Array<Record<string, unknown>>;
  const ingress = (data.ingress || {}) as Record<string, unknown>;
  const health = (data.health || {}) as Record<string, unknown>;

  return (
    <ViewShell title="System Topology" subtitle="Services, ports, ingress, persistence, and journeys with honest GAP markers.">
      <div className="surface m11-section">
        <h3 className="typography-title3">Services</h3>
        <DataTable
          caption="Services"
          headers={['ID', 'Kind', 'Status', 'Path / Note']}
          rows={services.map(s => [
            <span className="typography-mono" key="i">{String(s.id)}</span>,
            <span className="typography-caption" key="k">{String(s.kind)}</span>,
            <Badge status={String(s.status)} key="s">{String(s.status)}</Badge>,
            <span className="typography-caption" key="p">{String(s.path || s.note || '\u2014')}</span>,
          ])}
        />
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Ports & ingress</h3>
        <DataTable
          caption="Ports"
          headers={['Service', 'Host', 'Port']}
          rows={ports.map(p => [
            <span className="typography-mono" key="s">{String(p.service)}</span>,
            <span className="typography-mono" key="h">{String(p.host)}</span>,
            <span className="typography-mono" key="p">{String(p.port)}</span>,
          ])}
        />
        <div className="m11-fields">
          <Field label="Public ingress" value={<Badge status={String(ingress.public_ingress || 'GAP')}>{String(ingress.public_ingress || 'GAP')}</Badge>} />
        </div>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Persistence, queues, migrations</h3>
        <DataTable
          caption="Databases"
          headers={['ID', 'Kind', 'Status', 'Path']}
          rows={databases.map(d => [
            <span className="typography-mono" key="i">{String(d.id)}</span>,
            <span className="typography-caption" key="k">{String(d.kind)}</span>,
            <Badge status={String(d.status)} key="s">{String(d.status)}</Badge>,
            <span className="typography-mono" key="p">{String(d.path || '\u2014')}</span>,
          ])}
        />
        <DataTable
          caption="Queues"
          headers={['ID', 'Status', 'Note']}
          rows={queues.map(q => [
            <span className="typography-mono" key="i">{String(q.id)}</span>,
            <Badge status={String(q.status)} key="s">{String(q.status)}</Badge>,
            <span className="typography-caption" key="n">{String(q.note || '\u2014')}</span>,
          ])}
        />
        <DataTable
          caption="Migrations"
          headers={['ID', 'Status']}
          rows={migrations.map(m => [
            <span className="typography-mono" key="i">{String(m.id)}</span>,
            <Badge status={String(m.status)} key="s">{String(m.status)}</Badge>,
          ])}
        />
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Health & journeys</h3>
        <div className="m11-fields">
          <Field label="Health probe" value={String(health.probe || '\u2014')} />
          <Field label="Health status" value={<Badge status={String(health.status || 'UNKNOWN')}>{String(health.status || 'UNKNOWN')}</Badge>} />
        </div>
        <DataTable
          caption="Journeys"
          headers={['ID', 'Status', 'Steps']}
          rows={journeys.map(j => [
            <span className="typography-mono" key="i">{String(j.id)}</span>,
            <Badge status={String(j.status)} key="s">{String(j.status)}</Badge>,
            <span className="typography-caption" key="st">{String((j.steps as string[] ?? []).join(' \u2192 ') || '\u2014')}</span>,
          ])}
        />
      </div>
    </ViewShell>
  );
}

/* ----------------------------------- parity ---------------------------------- */

function ParityView({ data }: { data: Record<string, unknown> }) {
  const runs = (data.runs || []) as Array<Record<string, unknown>>;
  const present = Boolean(data.present);

  return (
    <ViewShell title="Browser Parity" subtitle="C7 paired reference/target verification results from recorded run outputs.">
      {!present ? (
        <div className="surface m11-section m11-empty">
          <h3 className="typography-title3">No parity runs recorded</h3>
          <p className="typography-body">{String(data.note || '')}</p>
          <p className="typography-caption">C7 (browser parity and visual verification) is GAP in the execution graph; this view reports honestly.</p>
        </div>
      ) : (
        <div className="surface m11-section">
          <h3 className="typography-title3">Parity runs ({runs.length})</h3>
          <DataTable
            caption="Parity runs"
            headers={['File', 'Pair ID', 'Verdict']}
            rows={runs.map(r => [
              <span className="typography-mono" key="f">{String(r.file || '\u2014')}</span>,
              <span className="typography-mono" key="p">{String(r.pairId || r.pair_id || '\u2014')}</span>,
              <Badge status={String(r.verdict || 'UNKNOWN')} key="v">{String(r.verdict || 'UNKNOWN')}</Badge>,
            ])}
          />
        </div>
      )}
    </ViewShell>
  );
}

/* ----------------------------------- waits ----------------------------------- */

function WaitsView({ data }: { data: Record<string, unknown> }) {
  const tasks = (data.tasks || []) as Array<Record<string, unknown>>;
  const byState = (data.byState || []) as Array<{ state: string; count: number }>;

  return (
    <ViewShell title="Waits & Retries" subtitle="Nonterminal waiting tasks with wake conditions, deadlines, and fallbacks.">
      <div className="m11-stats" role="list" aria-label="Waiting state counts">
        {byState.map(s => (
          <div key={s.state} className="surface m11-stat" role="listitem">
            <span className="typography-caption">{s.state}</span>
            <span className="m11-stat-value">{s.count}</span>
          </div>
        ))}
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Waiting tasks ({tasks.length})</h3>
        <DataTable
          caption="Waiting tasks"
          headers={['ID', 'State', 'Subject', 'Wake', 'Deadline', 'Fallback']}
          rows={tasks.map(t => [
            <span className="typography-mono" key="i">{String(t.id)}</span>,
            <Badge status={String(t.state)} key="s">{String(t.state)}</Badge>,
            <span className="typography-caption" key="su">{String(t.subject || '\u2014')}</span>,
            <span className="typography-caption" key="w">{String(t.wake || '\u2014')}</span>,
            <span className="typography-caption" key="d">{String(t.deadline || '\u2014')}</span>,
            <span className="typography-caption" key="f">{String(t.fallback || '\u2014')}</span>,
          ])}
        />
      </div>
    </ViewShell>
  );
}

/* ----------------------------------- gates ----------------------------------- */

function GatesView({ data }: { data: Record<string, unknown> }) {
  const gates = (data.gates || []) as Array<Record<string, unknown>>;
  const summary = (data.summary || {}) as Record<string, unknown>;

  return (
    <ViewShell title="Terminal Gates" subtitle="M11 terminal gate checklist derived from the ledger and evidence — never green without evidence.">
      <div className="m11-stats" role="list" aria-label="Terminal verdict">
        <div className="surface m11-stat" role="listitem">
          <span className="typography-caption">Verdict</span>
          <span className="m11-stat-value"><Badge status={String(data.verdict)}>{String(data.verdict)}</Badge></span>
          <span className="typography-caption">terminal gate pass requires all {String(summary.total)} gates</span>
        </div>
        <div className="surface m11-stat" role="listitem">
          <span className="typography-caption">Execution state</span>
          <span className="m11-stat-value"><Badge status={String(data.executionState)}>{String(data.executionState)}</Badge></span>
          <span className="typography-caption">terminal marker status: {String(data.terminalMarkerStatus) || '\u2014'}</span>
        </div>
        <div className="surface m11-stat" role="listitem">
          <span className="typography-caption">Gates passed</span>
          <span className="m11-stat-value">{String(summary.pass)} / {String(summary.total)}</span>
          <span className="typography-caption">ledger HEAD {String(data.headCommit || '').slice(0, 12)} vs running {String(data.currentHead || '').slice(0, 12)}</span>
        </div>
      </div>

      <div className="surface m11-section">
        <h3 className="typography-title3">Gate checklist</h3>
        <DataTable
          caption="Terminal gate checklist"
          headers={['Gate', 'Status', 'Evidence']}
          rows={gates.map(g => [
            <span className="typography-mono" key="i">{String(g.id)}</span>,
            <Badge status={String(g.status)} key="s">{String(g.status)}</Badge>,
            <span className="typography-caption" key="d">{String(g.detail || '\u2014')}</span>,
          ])}
        />
      </div>
    </ViewShell>
  );
}

/* ----------------------------------- page ------------------------------------ */

function ViewBody({ view, data }: { view: ViewId; data: Record<string, unknown> }) {
  switch (view) {
    case 'readiness': return <ReadinessView data={data} />;
    case 'dag': return <DagView data={data} />;
    case 'conflicts': return <ConflictsView data={data} />;
    case 'worktrees': return <WorktreesView data={data} />;
    case 'agents': return <AgentsView data={data} />;
    case 'resources': return <ResourcesView data={data} />;
    case 'topology': return <TopologyView data={data} />;
    case 'parity': return <ParityView data={data} />;
    case 'waits': return <WaitsView data={data} />;
    case 'gates': return <GatesView data={data} />;
    default: return <ErrorState message="Unknown view" />;
  }
}

interface M11ViewsProps {
  segments: string[];
  navigate: (path: string) => void;
}

export default function M11Views({ segments, navigate }: M11ViewsProps) {
  const initial = segments[1] && isViewId(segments[1]) ? segments[1] : 'readiness';
  const [view, setView] = useState<ViewId>(initial);
  const { data, state, error } = useView<Record<string, unknown>>(view);

  const selectView = useCallback((v: ViewId) => {
    setView(v);
    navigate(`/m11/${v}`);
  }, [navigate]);

  // WAI-ARIA roving tabindex: Arrow keys / Home / End move focus and selection.
  const onTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % VIEWS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + VIEWS.length) % VIEWS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = VIEWS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const v = VIEWS[next].id;
    selectView(v);
    document.getElementById(`m11-tab-${v}`)?.focus();
  }, [selectView]);

  return (
    <div className="page m11-page">
      <div className="page-header">
        <div>
          <h1 className="typography-title">M11 Views</h1>
          <p className="typography-caption">
            Observational views of plan readiness, execution, resources, and terminal truth.
            Control Plane is local-only and cannot start, stop, or cancel runs.
          </p>
        </div>
      </div>

      <div className="m11-tabs" role="tablist" aria-label="M11 views">
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            role="tab"
            id={`m11-tab-${v.id}`}
            tabIndex={view === v.id ? 0 : -1}
            aria-selected={view === v.id}
            aria-controls={`m11-panel-${v.id}`}
            onClick={() => selectView(v.id)}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            className={`m11-tab ${view === v.id ? 'm11-tab--active' : ''}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="m11-panel" id={`m11-panel-${view}`} role="tabpanel" aria-labelledby={`m11-tab-${view}`}>
        {state === 'loading' && <Loading />}
        {state === 'error' && <ErrorState message={error} />}
        {state === 'loaded' && data && <ViewBody view={view} data={data} />}
      </div>
    </div>
  );
}
