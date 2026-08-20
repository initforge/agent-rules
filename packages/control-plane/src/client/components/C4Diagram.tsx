import React, { useMemo } from 'react'

export interface C4Element {
  name: string
  description: string
  kind?: string
  technology?: string
  status?: string
  tags?: string[]
  children?: C4Element[]
}

export interface C4Relationship {
  source: string
  target: string
  label: string
  technology?: string
}

export interface DimScore {
  id: string
  label: string
  score: number
  maxScore: number
  status: 'pass' | 'warn' | 'fail'
  description: string
}

interface C4DiagramProps {
  title: string
  elements: C4Element[]
  relationships?: C4Relationship[]
  selected?: string | null
  onSelect?: (name: string) => void
  level: 'context' | 'container' | 'component' | 'code'
}

function statusClass(status?: string): string {
  switch (status) {
    case 'active': return 'c4-node--active'
    case 'healthy': return 'c4-node--healthy'
    case 'warning': return 'c4-node--warning'
    case 'error': return 'c4-node--error'
    default: return 'c4-node--default'
  }
}

function kindIcon(kind?: string): string {
  switch (kind) {
    case 'Web Application': case 'Single-Page App': return '\u25A3'
    case 'Command-Line Tool': case 'CLI Command': return '\u25A8'
    case 'HTTP Endpoint': case 'Request Filter': return '\u25E8'
    case 'Service Module': case 'Module': return '\u25A0'
    case 'Data Access': case 'Database': return '\u25C9'
    case 'Library': return '\u25A6'
    case 'Runtime Adapter': return '\u25C7'
    case 'Component': return '\u25A2'
    default: return '\u25A1'
  }
}

export const C4Diagram: React.FC<C4DiagramProps> = ({ title, elements, relationships, selected, onSelect, level }) => {
  const containerClass = `c4-diagram c4-diagram--${level}`

  if (elements.length === 0) {
    return (
      <div className={containerClass}>
        <div className="c4-diagram-header">
          <h2 className="typography-title2">{title}</h2>
        </div>
        <div className="state-empty">No {level} elements defined</div>
      </div>
    )
  }

  return (
    <div className={containerClass}>
      <div className="c4-diagram-header">
        <h2 className="typography-title2">{title}</h2>
        <span className="typography-caption">{elements.length} element{elements.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="c4-grid" role="list" aria-label={`${level} elements`}>
        {elements.map((el) => {
          const isSelected = selected === el.name
          return (
            <div
              key={el.name}
              className={`c4-node ${statusClass(el.status)} ${isSelected ? 'c4-node--selected' : ''}`}
              role="listitem"
              tabIndex={0}
              aria-selected={isSelected}
              onClick={() => onSelect?.(el.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' && onSelect) onSelect(el.name) }}
            >
              <div className="c4-node-icon" aria-hidden="true">{kindIcon(el.kind)}</div>
              <div className="c4-node-body">
                <div className="c4-node-header">
                  <span className="c4-node-name">{el.name}</span>
                  {el.status && <span className={`c4-node-badge c4-node-badge--${el.status}`}>{el.status}</span>}
                </div>
                <div className="c4-node-desc">{el.description}</div>
                {el.technology && <div className="c4-node-tech">{el.technology}</div>}
                {el.tags && el.tags.length > 0 && (
                  <div className="c4-node-tags">
                    {el.tags.map(t => <span key={t} className="c4-tag">{t}</span>)}
                  </div>
                )}
                {el.children && el.children.length > 0 && (
                  <details className="c4-node-details">
                    <summary className="typography-caption">{el.children.length} child element{el.children.length !== 1 ? 's' : ''}</summary>
                    <div className="c4-node-children">
                      {el.children.map(child => (
                        <div key={child.name} className="c4-child-item">
                          <span className="c4-child-name">{child.name}</span>
                          <span className="c4-child-desc">{child.description}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {relationships && relationships.length > 0 && (
        <details className="c4-relationships-detail" open>
          <summary className="typography-title3">Relationships ({relationships.length})</summary>
          <div className="c4-relationships" role="list" aria-label="Relationships">
            {relationships.map((rel, i) => (
              <div key={i} className="c4-relation" role="listitem">
                <span className="c4-relation-source">{rel.source}</span>
                <span className="c4-relation-arrow" aria-hidden="true">\u2192</span>
                <span className="c4-relation-target">{rel.target}</span>
                <span className="c4-relation-label">{rel.label}</span>
                {rel.technology && <span className="c4-relation-tech">{rel.technology}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

interface C4DimScorecardProps {
  dimensions: DimScore[]
  milestones: Array<{ id: string; label: string; status: 'complete' | 'in-progress' | 'pending'; percent: number }>
  releases: Array<{ id: string; version: string; status: 'released' | 'planned'; date?: string }>
  health: string
}

function scoreColor(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  if (pct >= 80) return 'var(--color-success)'
  if (pct >= 50) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

export const C4DimScorecard: React.FC<C4DimScorecardProps> = ({ dimensions, milestones, releases, health }) => {
  const overall = useMemo(() => {
    if (dimensions.length === 0) return { score: 0, maxScore: 0, pct: 0 }
    const totalScore = dimensions.reduce((s, d) => s + d.score, 0)
    const totalMax = dimensions.reduce((s, d) => s + d.maxScore, 0)
    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0
    return { score: totalScore, maxScore: totalMax, pct }
  }, [dimensions])

  if (dimensions.length === 0 && milestones.length === 0 && releases.length === 0) {
    return <div className="state-empty">No assessment data available</div>
  }

  const passCount = dimensions.filter(d => d.status === 'pass').length
  const warnCount = dimensions.filter(d => d.status === 'warn').length
  const failCount = dimensions.filter(d => d.status === 'fail').length

  return (
    <div className="c4-dim-scorecard">
      <div className="c4-dim-header">
        <div>
          <h2 className="typography-title2">AM0015 Maturity Assessment</h2>
          <p className="typography-caption">18 agent-maturity dimensions across the harness</p>
        </div>
        <div className="c4-dim-overall" style={{ background: scoreColor(overall.score, overall.maxScore) }}>
          <span className="c4-dim-overall-pct">{overall.pct}%</span>
          <span className="c4-dim-overall-label">overall</span>
        </div>
      </div>

      <div className="c4-dim-summary" role="list" aria-label="Assessment summary">
        <div className="c4-dim-summary-item" role="listitem">
          <span className="c4-dim-summary-count">{passCount}</span>
          <span className="c4-dim-summary-label">Pass</span>
        </div>
        <div className="c4-dim-summary-item" role="listitem">
          <span className="c4-dim-summary-count">{warnCount}</span>
          <span className="c4-dim-summary-label">Warn</span>
        </div>
        <div className="c4-dim-summary-item" role="listitem">
          <span className="c4-dim-summary-count">{failCount}</span>
          <span className="c4-dim-summary-label">Fail</span>
        </div>
        <div className="c4-dim-summary-item" role="listitem">
          <span className="c4-dim-summary-count">{dimensions.length}</span>
          <span className="c4-dim-summary-label">Total</span>
        </div>
        <div className="c4-dim-summary-item" role="listitem">
          <span className={`c4-dim-summary-dot ${health === 'healthy' ? 'c4-dim-summary-dot--ok' : 'c4-dim-summary-dot--warn'}`} />
          <span className="c4-dim-summary-label">{health}</span>
        </div>
      </div>

      <div className="c4-dim-list" role="list" aria-label="18 assessment dimensions">
        {dimensions.map(d => {
          const pct = d.maxScore > 0 ? Math.round((d.score / d.maxScore) * 100) : 0
          return (
            <div key={d.id} className={`c4-dim-item c4-dim-item--${d.status}`} role="listitem">
              <div className="c4-dim-item-header">
                <span className="c4-dim-item-id">{d.id.toUpperCase()}</span>
                <span className="c4-dim-item-label">{d.label}</span>
                <span className={`c4-dim-item-status c4-dim-item-status--${d.status}`}>{d.status}</span>
              </div>
              <div className="c4-dim-item-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${d.label} score`}>
                <div className="c4-dim-item-fill" style={{ width: `${pct}%`, background: scoreColor(d.score, d.maxScore) }} />
              </div>
              <div className="c4-dim-item-footer">
                <span className="c4-dim-item-pct">{d.score}/{d.maxScore}</span>
                <span className="c4-dim-item-desc">{d.description}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="c4-dim-secondary">
        {milestones.length > 0 && (
          <div className="c4-milestones" role="list" aria-label="Milestones">
            <h3 className="typography-title3">Milestones</h3>
            {milestones.map(m => (
              <div key={m.id} className="c4-milestone" role="listitem">
                <div className="c4-milestone-header">
                  <span className="c4-milestone-label">{m.label}</span>
                  <span className={`c4-milestone-badge c4-milestone-badge--${m.status}`}>{m.status}</span>
                </div>
                <div className="c4-progress-bar" role="progressbar" aria-valuenow={m.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.label} progress`}>
                  <div className="c4-progress-fill" style={{ width: `${m.percent}%` }} />
                </div>
                <span className="c4-milestone-pct">{m.percent}%</span>
              </div>
            ))}
          </div>
        )}

        {releases.length > 0 && (
          <div className="c4-releases" role="list" aria-label="Releases">
            <h3 className="typography-title3">Releases</h3>
            {releases.map(r => (
              <div key={r.id} className="c4-release" role="listitem">
                <span className="c4-release-version">{r.version}</span>
                <span className={`c4-release-badge c4-release-badge--${r.status}`}>{r.status}</span>
                {r.date && <span className="c4-release-date">{r.date}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
