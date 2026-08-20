import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { C4Diagram, C4DimScorecard, type C4Element, type C4Relationship, type DimScore } from '../components/C4Diagram'

type LoadState = 'loading' | 'loaded' | 'error' | 'stale' | 'offline' | 'empty'
type C4Tab = 'scorecard' | 'context' | 'container' | 'component' | 'code'

interface C4PageProps {
  navigate: (path: string) => void
}

export default function C4Page({ navigate }: C4PageProps) {
  const [tab, setTab] = useState<C4Tab>('scorecard')
  const [contextData, setContextData] = useState<{ systems: C4Element[]; externalSystems: C4Element[]; relationships: C4Relationship[] } | null>(null)
  const [containers, setContainers] = useState<C4Element[]>([])
  const [allComponents, setAllComponents] = useState<C4Element[]>([])
  const [codeItems, setCodeItems] = useState<C4Element[]>([])
  const [healthStatus, setHealthStatus] = useState<string>('unknown')
  const [selected, setSelected] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [dimensions, setDimensions] = useState<DimScore[]>([])
  const [overall, setOverall] = useState<{ score: number; maxScore: number; pct: number }>({ score: 0, maxScore: 0, pct: 0 })
  const mountedRef = useRef(true)

  const fetchC4 = useCallback(() => {
    let staleTimer: ReturnType<typeof setTimeout>
    const timer = setTimeout(() => {
      if (mountedRef.current && loadState === 'loading') {
        setLoadState('stale')
      }
    }, 8000)

    const healthPromise = fetch('/api/c4/health').then(r => r.json()).catch(() => ({ ok: false, status: 'unreachable' }))
    const scorecardPromise = fetch('/api/c4/scorecard').then(r => r.json()).catch(() => null)

    Promise.all([
      fetch('/api/c4/context').then(r => { if (!r.ok) throw new Error('Failed context'); return r.json() }).catch(() => null),
      fetch('/api/c4/containers').then(r => { if (!r.ok) throw new Error('Failed containers'); return r.json() }).catch(() => null),
      fetch('/api/c4/components').then(r => { if (!r.ok) throw new Error('Failed components'); return r.json() }).catch(() => null),
      fetch('/api/c4/code').then(r => { if (!r.ok) throw new Error('Failed code'); return r.json() }).catch(() => null),
      healthPromise,
      scorecardPromise,
    ]).then(([ctx, con, comp, code, health, sc]) => {
      if (!mountedRef.current) return
      clearTimeout(timer)

      setHealthStatus(health?.status || 'unknown')

      if (sc?.ok && sc?.data?.dimensions) {
        setDimensions(sc.data.dimensions.map((d: Record<string, unknown>) => ({
          id: d.id as string,
          label: d.label as string,
          score: (d.score as number) || 0,
          maxScore: (d.maxScore as number) || 0,
          status: (d.status as DimScore['status']) || 'fail',
          description: d.description as string,
        })))
        setOverall(sc.data.overall || { score: 0, maxScore: 0, pct: 0 })
      } else {
        setDimensions([])
        setOverall({ score: 0, maxScore: 0, pct: 0 })
      }

      const systems: C4Element[] = (ctx?.data?.systems || []).map((s: Record<string, unknown>) => ({
        name: s.name as string, description: s.description as string, status: (s.status as string) || 'active',
      }))
      const externalSystems: C4Element[] = (ctx?.data?.externalSystems || []).map((s: Record<string, unknown>) => ({
        name: s.name as string, description: s.description as string, status: (s.status as string) || 'active',
      }))
      const allSystems = [...systems, ...externalSystems]

      const containerEls: C4Element[] = (con?.data || []).map((c: Record<string, unknown>) => ({
        name: c.name as string,
        description: c.description as string,
        kind: c.kind as string,
        technology: c.technology as string,
        status: (c.status as string) || 'active',
        children: ((c as { components?: Array<Record<string, unknown>> }).components || []).map((comp: Record<string, unknown>) => ({
          name: comp.name as string,
          description: comp.description as string,
          kind: comp.kind as string,
          technology: comp.technology as string,
          status: (comp.status as string) || 'active',
          tags: comp.tags as string[],
        })),
      }))

      const componentEls: C4Element[] = (comp?.data || []).map((c: Record<string, unknown>) => ({
        name: c.name as string,
        description: c.description as string,
        kind: c.kind as string,
        status: (c.status as string) || 'active',
        tags: (c as { container?: string }).container ? [(c as { container: string }).container] : undefined,
      }))

      const codeEls: C4Element[] = (code?.data || []).map((c: Record<string, unknown>) => ({
        name: c.name as string,
        description: c.description as string,
        kind: c.kind as string,
        status: (c.status as string) || 'active',
        technology: c.file as string,
      }))

      const hasData = ctx || con || comp || code
      if (!hasData && health?.status !== 'healthy') {
        setLoadState('empty')
        return
      }

      setContextData({ systems: allSystems, externalSystems: [], relationships: ctx?.data?.relationships || [] })
      setContainers(containerEls)
      setAllComponents(componentEls)
      setCodeItems(codeEls)
      setLoadState('loaded')
    }).catch(() => {
      if (!mountedRef.current) return
      clearTimeout(timer)
      setLoadState('offline')
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchC4()
    return () => { mountedRef.current = false }
  }, [fetchC4])

  const handleSelect = useCallback((name: string) => {
    setSelected(prev => prev === name ? null : name)
  }, [])

  const handleRefresh = useCallback(() => {
    setLoadState('loading')
    setError('')
    fetchC4()
  }, [fetchC4])

  const milestones = useMemo(() => [
    { id: 'm1', label: 'Context Routing', status: 'complete' as const, percent: 100 },
    { id: 'm2', label: 'Plan Identity', status: 'complete' as const, percent: 100 },
    { id: 'm3', label: 'Evidence Binding', status: 'complete' as const, percent: 100 },
    { id: 'm4', label: 'C4 Visualization', status: 'in-progress' as const, percent: 85 },
    { id: 'm5', label: 'Multi-Platform', status: 'in-progress' as const, percent: 60 },
    { id: 'm6', label: 'Release v2.0', status: 'in-progress' as const, percent: 45 },
  ], [])

  const releases = useMemo(() => [
    { id: 'r1', version: 'v0.1.0', status: 'released' as const, date: '2026-06' },
    { id: 'r2', version: 'v0.2.0', status: 'released' as const, date: '2026-07' },
    { id: 'r3', version: 'v2.0.0', status: 'planned' as const },
  ], [])

  const TABS: { id: C4Tab; label: string }[] = [
    { id: 'scorecard', label: 'Scorecard' },
    { id: 'context', label: 'Context' },
    { id: 'container', label: 'Containers' },
    { id: 'component', label: 'Components' },
    { id: 'code', label: 'Code' },
  ]

  if (loadState === 'loading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="typography-title">AM0015 Scorecard</h1>
          <p className="typography-caption">Agent Maturity Assessment — 18 dimensions</p>
        </div>
        <div className="state-loading"><div className="spinner" /> Loading assessment data...</div>
      </div>
    )
  }

  if (loadState === 'stale') {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="typography-title">AM0015 Scorecard</h1>
              <p className="typography-caption">Agent Maturity Assessment — 18 dimensions</p>
            </div>
            <button onClick={handleRefresh} className="btn" aria-label="Retry loading">Retry</button>
          </div>
        </div>
        <div className="state-stale">Request taking longer than expected. Data may be incomplete.</div>
        <C4DimScorecard dimensions={dimensions} milestones={milestones} releases={releases} health={healthStatus} />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="typography-title">AM0015 Scorecard</h1>
              <p className="typography-caption">Agent Maturity Assessment — 18 dimensions</p>
            </div>
            <button onClick={handleRefresh} className="btn" aria-label="Retry loading">Retry</button>
          </div>
        </div>
        <div className="state-error">{error}</div>
      </div>
    )
  }

  if (loadState === 'offline') {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="typography-title">AM0015 Scorecard</h1>
              <p className="typography-caption">Agent Maturity Assessment — 18 dimensions</p>
            </div>
            <button onClick={handleRefresh} className="btn" aria-label="Retry connecting">Reconnect</button>
          </div>
        </div>
        <div className="state-offline">Server unreachable. Check that the control plane is running.</div>
        <C4DimScorecard dimensions={dimensions} milestones={milestones} releases={releases} health={healthStatus} />
      </div>
    )
  }

  if (loadState === 'empty') {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="typography-title">AM0015 Scorecard</h1>
              <p className="typography-caption">Agent Maturity Assessment — 18 dimensions</p>
            </div>
            <button onClick={handleRefresh} className="btn" aria-label="Refresh">Refresh</button>
          </div>
        </div>
        <div className="state-empty">No architecture data available. The C4 API may be unresponsive.</div>
        <C4DimScorecard dimensions={dimensions} milestones={milestones} releases={releases} health={healthStatus} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="typography-title">AM0015 Scorecard</h1>
            <p className="typography-caption">Agent Maturity Assessment — 18 dimensions | C4 Architecture Visualization</p>
          </div>
          <div className="cluster cluster--sm">
            <span className={`status-dot ${healthStatus === 'healthy' ? 'status-dot--success' : 'status-dot--accent'}`} />
            <span className="typography-caption">{healthStatus}</span>
            <button onClick={handleRefresh} className="btn btn--ghost btn--sm" aria-label="Refresh data">Refresh</button>
          </div>
        </div>
      </div>

      <div className="c4-tabs" role="tablist" aria-label="C4 view levels">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setSelected(null) }}
            className={`c4-tab ${tab === t.id ? 'c4-tab--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scorecard' && (
        <div className="c4-tab-content" role="tabpanel" aria-label="Scorecard view">
          <C4DimScorecard dimensions={dimensions} milestones={milestones} releases={releases} health={healthStatus} />
        </div>
      )}

      {tab === 'context' && (
        <div className="c4-tab-content" role="tabpanel" aria-label="Context view">
          {contextData ? (
            <C4Diagram
              title="System Context"
              elements={contextData.systems}
              relationships={contextData.relationships}
              selected={selected}
              onSelect={handleSelect}
              level="context"
            />
          ) : (
            <div className="state-empty">No context data available</div>
          )}
        </div>
      )}

      {tab === 'container' && (
        <div className="c4-tab-content" role="tabpanel" aria-label="Container view">
          <C4Diagram
            title="Containers"
            elements={containers}
            selected={selected}
            onSelect={handleSelect}
            level="container"
          />
        </div>
      )}

      {tab === 'component' && (
        <div className="c4-tab-content" role="tabpanel" aria-label="Component view">
          <C4Diagram
            title="Components"
            elements={allComponents}
            selected={selected}
            onSelect={handleSelect}
            level="component"
          />
        </div>
      )}

      {tab === 'code' && (
        <div className="c4-tab-content" role="tabpanel" aria-label="Code view">
          <C4Diagram
            title="Code Modules"
            elements={codeItems}
            selected={selected}
            onSelect={handleSelect}
            level="code"
          />
        </div>
      )}
    </div>
  )
}
