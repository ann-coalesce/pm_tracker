'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusBadge, { STATUS_META } from './components/StatusBadge'
import Sparkline from './components/Sparkline'
import CapacityBar from './components/CapacityBar'
import PMFormModal from './components/PMFormModal'
import { getPMs, createPM, updatePM } from './lib/api'
import type { PM, PMCreate, PMUpdate } from './lib/types'

const COLUMN_GROUPS = [
  { key: 'strategy',     label: 'Strategy',           default: true  },
  { key: 'metrics',      label: 'Metrics',            default: true  },
  { key: 'track_record', label: 'Track Record',       default: false },
  { key: 'fund_info',    label: 'Fund Info',          default: true  },
  { key: 'legal',        label: 'Legal & Compliance', default: false },
]

const fmt  = (n: number | null, d = 1) => n == null ? '—' : n.toFixed(d) + '%'
const fmtN = (n: number | null, d = 2) => n == null ? '—' : n.toFixed(d)
const fmtM = (n: number | null) => n == null ? '—' : `${n}M`

// Compute display row from PM (metrics in decimal → multiply by 100 for %)
interface PMRow extends PM {
  _lev: number
  // actual
  _ann_return: number | null
  _sharpe: number | null
  _sortino: number | null
  _calmar: number | null
  _ann_vol: number | null
  _ann_dvol: number | null
  _max_dd: number | null
  _cur_dd: number | null
  // std (leverage-normalised)
  _std_ann_return: number | null
  _std_sharpe: number | null
  _std_sortino: number | null
  _std_calmar: number | null
  _std_ann_vol: number | null
  _std_ann_dvol: number | null
  _std_max_dd: number | null
  // track record
  _tr_start: string | null
  _tr_end: string | null
  _tr_days: number | null
  _spark: number[]
}

function toRow(pm: PM): PMRow {
  const m = pm.metrics
  return {
    ...pm,
    _lev:            pm.leverage_target ?? 1,
    _ann_return:     m?.cagr != null ? m.cagr * 100 : null,
    _sharpe:         m?.sharpe_ratio ?? null,
    _sortino:        m?.sortino_ratio ?? null,
    _calmar:         m?.calmar_ratio ?? null,
    _ann_vol:        m?.ann_volatility != null ? m.ann_volatility * 100 : null,
    _ann_dvol:       m?.ann_downside_volatility != null ? m.ann_downside_volatility * 100 : null,
    _max_dd:         m?.max_drawdown != null ? m.max_drawdown * 100 : null,
    _cur_dd:         m?.current_drawdown != null ? m.current_drawdown * 100 : null,
    _std_ann_return: m?.std_cagr != null ? m.std_cagr * 100 : null,
    _std_sharpe:     m?.std_sharpe_ratio ?? null,
    _std_sortino:    m?.std_sortino_ratio ?? null,
    _std_calmar:     m?.std_calmar_ratio ?? null,
    _std_ann_vol:    m?.std_ann_volatility != null ? m.std_ann_volatility * 100 : null,
    _std_ann_dvol:   m?.std_ann_downside_volatility != null ? m.std_ann_downside_volatility * 100 : null,
    _std_max_dd:     m?.std_max_drawdown != null ? m.std_max_drawdown * 100 : null,
    _tr_start:       m?.track_record_start ?? null,
    _tr_end:         m?.track_record_end ?? null,
    _tr_days:        m?.track_record_days ?? null,
    _spark:          pm.sparkline?.map(p => p.nav) ?? [],
  }
}

// Key to sortable value
function rowVal(row: PMRow, col: string, metricMode: string): number | string | null {
  const std = metricMode === 'std'
  switch (col) {
    case 'name':             return row.name
    case 'status':           return row.status
    case 'exposure_profile': return row.exposure_profile
    case 'trading_horizon':  return row.trading_horizon
    case 'strategy_type':    return row.strategy_type
    case 'leverage':         return row._lev
    case 'ann_return':       return std ? row._std_ann_return : row._ann_return
    case 'sharpe':           return std ? row._std_sharpe     : row._sharpe
    case 'sortino':          return std ? row._std_sortino    : row._sortino
    case 'calmar':           return std ? row._std_calmar     : row._calmar
    case 'ann_vol':          return std ? row._std_ann_vol    : row._ann_vol
    case 'ann_dvol':         return std ? row._std_ann_dvol   : row._ann_dvol
    case 'max_dd':           return row._max_dd
    case 'tr_start':         return row._tr_start
    case 'tr_end':           return row._tr_end
    case 'tr_days':          return row._tr_days
    case 'current_aum':      return row.current_aum
    case 'max_capacity':     return row.max_capacity
    case 'gp_commitment':    return row.gp_commitment
    case 'jurisdiction':     return row.jurisdiction
    case 'entity_name':      return row.entity_name
    default:                 return null
  }
}

export default function PMListPage() {
  const router = useRouter()
  const [pms, setPms] = useState<PM[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState(1)
  const [hovered, setHovered] = useState<string | null>(null)
  const [metricMode, setMetricMode] = useState('actual')
  const [visGroups, setVisGroups] = useState(() =>
    Object.fromEntries(COLUMN_GROUPS.map(g => [g.key, g.default]))
  )
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingPM, setEditingPM] = useState<PM | null>(null)

  const load = () => {
    setLoading(true); setError(null)
    getPMs({ include_sparkline: true })
      .then(data => { setPms(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }
  useEffect(load, [])

  const toggleGroup = (k: string) => setVisGroups(v => ({ ...v, [k]: !v[k] }))
  const sort = (col: string) => {
    if (sortCol === col) setSortDir(d => -d)
    else { setSortCol(col); setSortDir(-1) }
  }

  const rows = useMemo(() => {
    const mapped = pms.map(toRow)
    return mapped
      .filter(p => filterStatus === 'all' || p.status === filterStatus)
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const av = rowVal(a, sortCol, metricMode)
        const bv = rowVal(b, sortCol, metricMode)
        if (av == null) return 1; if (bv == null) return -1
        return av > bv ? sortDir : -sortDir
      })
  }, [pms, filterStatus, search, sortCol, sortDir, metricMode])

  const th = (col: string, align: React.CSSProperties['textAlign'] = 'left'): React.CSSProperties => ({
    padding: '7px 10px', textAlign: align, fontSize: 11, color: '#9ca3af', fontWeight: 500,
    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
    borderBottom: '1px solid #374151',
    background: sortCol === col ? '#1a2234' : 'transparent',
  })
  const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({ padding: '9px 10px', ...extra })
  const gh = (color = '#374151'): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 10, color, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1,
    background: '#0d1424', borderBottom: '1px solid #1f2937',
  })

  const handleSave = async (data: PMCreate | PMUpdate) => {
    if (modal === 'add') {
      await createPM(data as PMCreate)
    } else if (editingPM) {
      await updatePM(editingPM.id, data as PMUpdate)
    }
    load()
  }

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52 }}>
        <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: 16, letterSpacing: -0.5, cursor: 'pointer' }}>PM Tracker</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
          <button style={{ background: '#1f2937', color: '#f9fafb', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>Dashboard</button>
          <Link href="/upload" style={{ background: 'transparent', color: '#9ca3af', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>Upload Returns</Link>
        </div>
        <div style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>A</div>
      </div>

      <div style={{ padding: '20px 24px 0' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f9fafb', margin: 0 }}>All PMs</h1>
      </div>

      <div style={{ padding: 24 }}>
        {/* Error */}
        {error && (
          <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            ❌ Failed to load PMs: {error}
          </div>
        )}

        {/* Toolbar row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="Search PM..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 12px', color: '#f9fafb', fontSize: 13, width: 180 }} />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {['all', ...Object.keys(STATUS_META)].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{
                  fontSize: 11, padding: '4px 9px', borderRadius: 4, border: '1px solid', cursor: 'pointer',
                  borderColor: filterStatus === s ? '#3b82f6' : '#374151',
                  background: filterStatus === s ? '#1e2a3a' : 'transparent',
                  color: filterStatus === s ? '#3b82f6' : '#9ca3af',
                }}>
                {s === 'all' ? 'All' : STATUS_META[s].label}
              </button>
            ))}
          </div>
          <button onClick={() => { setEditingPM(null); setModal('add') }}
            style={{ marginLeft: 'auto', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
            + Add PM
          </button>
        </div>

        {/* Toolbar row 2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Metrics:</span>
            <div style={{ display: 'flex', background: '#1f2937', borderRadius: 6, padding: 2 }}>
              {[['actual', 'Actual'], ['std', 'Standardized (1x)']].map(([v, l]) => (
                <button key={v} onClick={() => setMetricMode(v)}
                  style={{ padding: '3px 10px', fontSize: 11, border: 'none', borderRadius: 5, cursor: 'pointer', background: metricMode === v ? '#374151' : 'transparent', color: metricMode === v ? '#f9fafb' : '#6b7280' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Columns:</span>
            {COLUMN_GROUPS.map(g => (
              <button key={g.key} onClick={() => toggleGroup(g.key)}
                style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 4, border: '1px solid', cursor: 'pointer',
                  borderColor: visGroups[g.key] ? '#6366f1' : '#374151',
                  background: visGroups[g.key] ? '#1e1f3b' : 'transparent',
                  color: visGroups[g.key] ? '#a5b4fc' : '#6b7280',
                }}>
                {visGroups[g.key] ? '✓ ' : ''}{g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #374151' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th colSpan={3} style={gh('#9ca3af')}>Identity</th>
                {visGroups.strategy     && <th colSpan={3} style={gh('#818cf8')}>Strategy</th>}
                {visGroups.metrics      && <th colSpan={8} style={gh('#34d399')}>Metrics {metricMode === 'std' && <span style={{ color: '#6b7280', fontWeight: 400 }}>(1x)</span>}</th>}
                {visGroups.track_record && <th colSpan={3} style={gh('#60a5fa')}>Track Record</th>}
                {visGroups.fund_info    && <th colSpan={5} style={gh('#fb923c')}>Fund Info</th>}
                {visGroups.legal        && <th colSpan={2} style={gh('#c084fc')}>Legal &amp; Compliance</th>}
                <th style={gh()} />
              </tr>
              <tr>
                <th style={th('name')} onClick={() => sort('name')}>Name{sortCol === 'name' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                <th style={th('status')}>Status</th>
                <th style={th('spark')}>Chart</th>
                {visGroups.strategy && <>
                  <th style={th('exposure_profile')} onClick={() => sort('exposure_profile')}>Exposure{sortCol === 'exposure_profile' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                  <th style={th('trading_horizon')} onClick={() => sort('trading_horizon')}>Horizon{sortCol === 'trading_horizon' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                  <th style={th('strategy_type')} onClick={() => sort('strategy_type')}>Type{sortCol === 'strategy_type' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                </>}
                {visGroups.metrics && <>
                  <th style={th('leverage', 'right')} onClick={() => sort('leverage')}>Lev</th>
                  <th style={th('ann_return', 'right')} onClick={() => sort('ann_return')}>Ann. Ret{sortCol === 'ann_return' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                  <th style={th('sharpe', 'right')} onClick={() => sort('sharpe')}>Sharpe{sortCol === 'sharpe' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                  <th style={th('sortino', 'right')} onClick={() => sort('sortino')}>Sortino</th>
                  <th style={th('calmar', 'right')} onClick={() => sort('calmar')}>Calmar</th>
                  <th style={th('ann_vol', 'right')} onClick={() => sort('ann_vol')}>Ann. Vol</th>
                  <th style={th('ann_dvol', 'right')} onClick={() => sort('ann_dvol')}>D.Vol</th>
                  <th style={th('max_dd', 'right')} onClick={() => sort('max_dd')}>Max DD{sortCol === 'max_dd' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                </>}
                {visGroups.track_record && <>
                  <th style={th('tr_start')} onClick={() => sort('tr_start')}>Start</th>
                  <th style={th('tr_end')}>End</th>
                  <th style={th('tr_days', 'right')} onClick={() => sort('tr_days')}>Days</th>
                </>}
                {visGroups.fund_info && <>
                  <th style={th('current_aum', 'right')} onClick={() => sort('current_aum')}>AUM</th>
                  <th style={th('max_capacity', 'right')} onClick={() => sort('max_capacity')}>Capacity</th>
                  <th style={th('utilization')}>Cap. Used</th>
                  <th style={th('gp_commitment', 'right')} onClick={() => sort('gp_commitment')}>GP Commit.</th>
                  <th style={th('exchanges')}>Exchanges</th>
                </>}
                {visGroups.legal && <>
                  <th style={th('jurisdiction')} onClick={() => sort('jurisdiction')}>Jurisdiction{sortCol === 'jurisdiction' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                  <th style={th('entity_name')} onClick={() => sort('entity_name')}>Entity Name{sortCol === 'entity_name' ? (sortDir > 0 ? '↑' : '↓') : ''}</th>
                </>}
                <th style={th('actions')} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1a2234', background: i % 2 === 0 ? '#111827' : '#0d1424' }}>
                    <td colSpan={20} style={{ padding: '11px 10px' }}>
                      <div style={{ height: 14, background: '#1f2937', borderRadius: 4, animation: 'pulse 1.5s infinite', width: `${60 + Math.random() * 30}%` }} />
                    </td>
                  </tr>
                ))
              ) : rows.map((row, i) => {
                const std = metricMode === 'std'
                const rowBg = hovered === row.id ? '#1f2937' : i % 2 === 0 ? '#111827' : '#0d1424'
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #1a2234', background: rowBg }}
                    onMouseEnter={() => setHovered(row.id)} onMouseLeave={() => setHovered(null)}>
                    <td style={td()}>
                      <span onClick={() => router.push(`/pm/${row.id}`)}
                        style={{ color: '#fbbf24', fontWeight: 600, cursor: 'pointer', textDecoration: hovered === row.id ? 'underline' : 'none', whiteSpace: 'nowrap' }}>
                        {row.name}
                      </span>
                    </td>
                    <td style={td()}><StatusBadge status={row.status} /></td>
                    <td style={td({ padding: '5px 10px' })}><Sparkline data={row._spark} /></td>
                    {visGroups.strategy && <>
                      <td style={td({ color: '#d1d5db' })}>{row.exposure_profile || '—'}</td>
                      <td style={td({ color: '#d1d5db' })}>{row.trading_horizon || '—'}</td>
                      <td style={td({ color: '#d1d5db' })}>{row.strategy_type || '—'}</td>
                    </>}
                    {visGroups.metrics && <>
                      <td style={td({ color: '#9ca3af', textAlign: 'right' })}>{row._lev}x</td>
                      <td style={td({ color: ((std ? row._std_ann_return : row._ann_return) ?? 0) >= 0 ? '#10b981' : '#ef4444', textAlign: 'right', fontWeight: 500 })}>{fmt(std ? row._std_ann_return : row._ann_return)}</td>
                      <td style={td({ color: '#3b82f6', textAlign: 'right' })}>{fmtN(std ? row._std_sharpe  : row._sharpe)}</td>
                      <td style={td({ color: '#6366f1', textAlign: 'right' })}>{fmtN(std ? row._std_sortino : row._sortino)}</td>
                      <td style={td({ color: '#8b5cf6', textAlign: 'right' })}>{fmtN(std ? row._std_calmar  : row._calmar)}</td>
                      <td style={td({ color: '#f59e0b', textAlign: 'right' })}>{fmt(std ? row._std_ann_vol  : row._ann_vol)}</td>
                      <td style={td({ color: '#f59e0b', textAlign: 'right', opacity: 0.75 })}>{fmt(std ? row._std_ann_dvol : row._ann_dvol)}</td>
                      <td style={td({ color: '#ef4444', textAlign: 'right' })}>{fmt(std ? row._std_max_dd   : row._max_dd)}</td>
                    </>}
                    {visGroups.track_record && <>
                      <td style={td({ color: '#9ca3af', fontSize: 11 })}>{row._tr_start || '—'}</td>
                      <td style={td({ color: '#9ca3af', fontSize: 11 })}>{row._tr_end || '—'}</td>
                      <td style={td({ color: '#d1d5db', textAlign: 'right' })}>{row._tr_days ?? '—'}</td>
                    </>}
                    {visGroups.fund_info && <>
                      <td style={td({ color: '#d1d5db', textAlign: 'right' })}>{fmtM(row.current_aum)}</td>
                      <td style={td({ color: '#6b7280', textAlign: 'right' })}>{fmtM(row.max_capacity)}</td>
                      <td style={td({ minWidth: 90 })}><CapacityBar aum={row.current_aum} max={row.max_capacity} /></td>
                      <td style={td({ color: '#d1d5db', textAlign: 'right' })}>{fmtM(row.gp_commitment)}</td>
                      <td style={td({ fontSize: 11, color: '#9ca3af' })}>{(row.exchanges ?? []).join(', ') || '—'}</td>
                    </>}
                    {visGroups.legal && <>
                      <td style={td({ color: '#d1d5db' })}>{row.jurisdiction || '—'}</td>
                      <td style={td({ color: '#d1d5db' })}>{row.entity_name || '—'}</td>
                    </>}
                    <td style={td()}>
                      <button onClick={() => { setEditingPM(row); setModal('edit') }}
                        style={{ background: 'none', border: '1px solid #374151', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#374151'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                        ✏️
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{loading ? '…' : `${rows.length} PMs`}</div>
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <PMFormModal
          pm={modal === 'edit' ? editingPM : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
