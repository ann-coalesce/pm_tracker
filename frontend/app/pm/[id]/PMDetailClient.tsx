'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusBadge, { STATUS_META } from '../../components/StatusBadge'
import LineChart from '../../components/LineChart'
import UnderwaterChart from '../../components/UnderwaterChart'
import UpdateStatusModal from '../../components/UpdateStatusModal'
import PMFormModal from '../../components/PMFormModal'
import { getPM, getPMMetrics, getPMEquityCurve, getPMStatusLog, updatePMStatus, updatePM } from '../../lib/api'
import type { PM, PMMetrics, EquityCurvePoint, PMStatusLog, PMStatus, PMUpdate } from '../../lib/types'

const fmt  = (n: number | null, d = 1) => n == null ? '—' : (n * 100).toFixed(d) + '%'
const fmtR = (n: number | null, d = 2) => n == null ? '—' : n.toFixed(d)
const fmtM = (n: number | null) => n == null ? '—' : `${n}M`

function standardizeCurve(navs: number[], leverage: number): number[] {
  if (leverage <= 1) return navs
  const result = [1]
  for (let i = 1; i < navs.length; i++) {
    const dr = (navs[i] - navs[i - 1]) / navs[i - 1]
    result.push(result[result.length - 1] * (1 + dr / leverage))
  }
  return result
}

export default function PMDetailClient() {
  const router = useRouter()
  const [id, setId] = useState<string>('')

  useEffect(() => {
    // useParams() returns '_' in static export fallback pages.
    // Read the real ID directly from the browser URL instead.
    const parts = window.location.pathname.replace(/\/+$/, '').split('/')
    setId(parts[parts.length - 1])
  }, [])

  const [pm, setPm] = useState<PM | null>(null)
  const [metrics, setMetrics] = useState<PMMetrics | null>(null)
  const [curve, setCurve] = useState<EquityCurvePoint[]>([])
  const [statusLog, setStatusLog] = useState<PMStatusLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [returnType, setReturnType] = useState('actual')
  const [timeRange, setTimeRange] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [statusModal, setStatusModal] = useState(false)
  const [editModal, setEditModal] = useState(false)

  const load = () => {
    if (!id) return
    setLoading(true); setError(null)
    Promise.all([getPM(id), getPMMetrics(id), getPMEquityCurve(id), getPMStatusLog(id)])
      .then(([pmData, metricsData, curveData, logData]) => {
        setPm(pmData); setMetrics(metricsData); setCurve(curveData); setStatusLog(logData)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }
  useEffect(load, [id])

  const slicedCurve = useMemo(() => {
    if (!curve.length) return curve
    const days: Record<string, number> = { '3M': 90, '6M': 180, '1Y': 365, all: Infinity }
    const n = days[timeRange] ?? Infinity
    if (n === Infinity) return curve
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - n)
    return curve.filter(p => new Date(p.date) >= cutoff)
  }, [curve, timeRange])

  const series = useMemo(() => {
    const navs = slicedCurve.map(p => p.nav)
    const lev = pm?.leverage_target ?? 1
    return {
      main: returnType === 'std' ? standardizeCurve(navs, lev) : navs,
      dates: slicedCurve.map(p => p.date),
    }
  }, [slicedCurve, returnType, pm])

  if (loading) return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>
    </div>
  )

  if (error || !pm) return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13 }}>
        ❌ {error || 'PM not found'}
      </div>
      <button onClick={() => router.push('/')} style={{ marginTop: 16, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13, padding: 0 }}>← Back</button>
    </div>
  )

  const metricCards = [
    { label: 'Ann. Return', value: fmt(metrics?.cagr ?? null),                   color: (metrics?.cagr ?? 0) >= 0 ? '#10b981' : '#ef4444' },
    { label: 'Sharpe',      value: fmtR(metrics?.sharpe_ratio ?? null),           color: '#3b82f6' },
    { label: 'Sortino',     value: fmtR(metrics?.sortino_ratio ?? null),          color: '#6366f1' },
    { label: 'Calmar',      value: fmtR(metrics?.calmar_ratio ?? null),           color: '#8b5cf6' },
    { label: 'Ann. Vol',    value: fmt(metrics?.ann_volatility ?? null),          color: '#f59e0b' },
    { label: 'Ann. D.Vol',  value: fmt(metrics?.ann_downside_volatility ?? null), color: '#f59e0b' },
    { label: 'Max DD',      value: fmt(metrics?.max_drawdown ?? null),            color: '#ef4444' },
    { label: 'Current DD',  value: fmt(metrics?.current_drawdown ?? null),        color: (metrics?.current_drawdown ?? 0) < 0 ? '#ef4444' : '#6b7280' },
  ]

  const tabSt = (t: string): React.CSSProperties => ({
    padding: '7px 14px', fontSize: 13, cursor: 'pointer', border: 'none', borderRadius: 6,
    background: activeTab === t ? '#1f2937' : 'transparent',
    color: activeTab === t ? '#f9fafb' : '#9ca3af',
  })
  const secT = (t: string) => (
    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, borderBottom: '1px solid #1f2937', paddingBottom: 8 }}>{t}</div>
  )

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52 }}>
        <Link href="/" style={{ color: '#3b82f6', fontWeight: 700, fontSize: 16, letterSpacing: -0.5, textDecoration: 'none' }}>PM Tracker</Link>
        <div style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
          <Link href="/" style={{ background: 'transparent', color: '#9ca3af', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>Dashboard</Link>
          <Link href="/upload" style={{ background: 'transparent', color: '#9ca3af', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>Upload Returns</Link>
        </div>
        <div style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>A</div>
      </div>

      <div style={{ padding: '20px 24px 0' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f9fafb', margin: 0 }}>{pm.name}</h1>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 900 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13, padding: 0 }}>← Back</button>
            <h2 style={{ color: '#f9fafb', fontSize: 20, fontWeight: 700, margin: 0 }}>{pm.name}</h2>
            <StatusBadge status={pm.status} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {[pm.exposure_profile, pm.trading_horizon, pm.strategy_type].filter(Boolean).join(' · ')}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={() => setStatusModal(true)}
                style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                ⇄ Status
              </button>
              <button onClick={() => setEditModal(true)}
                style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                ✏️ Edit
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1f2937', paddingBottom: 4 }}>
            {[['overview', 'Overview'], ['info', 'Info & Contact'], ['log', 'Status Log']].map(([t, l]) => (
              <button key={t} style={tabSt(t)} onClick={() => setActiveTab(t)}>{l}</button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {metricCards.map(m => (
                  <div key={m.label} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#1f2937', borderRadius: 6, padding: 2 }}>
                  {[['actual', 'Actual'], ['std', 'Standardized (1x)']].map(([v, l]) => (
                    <button key={v} onClick={() => setReturnType(v)}
                      style={{ padding: '4px 10px', fontSize: 12, border: 'none', borderRadius: 5, cursor: 'pointer', background: returnType === v ? '#374151' : 'transparent', color: returnType === v ? '#f9fafb' : '#6b7280' }}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', background: '#1f2937', borderRadius: 6, padding: 2 }}>
                  {['3M', '6M', '1Y', 'all'].map(r => (
                    <button key={r} onClick={() => setTimeRange(r)}
                      style={{ padding: '4px 8px', fontSize: 12, border: 'none', borderRadius: 5, cursor: 'pointer', background: timeRange === r ? '#374151' : 'transparent', color: timeRange === r ? '#f9fafb' : '#6b7280' }}>
                      {r === 'all' ? 'All' : r}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '14px 8px 8px', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', paddingLeft: 16, marginBottom: 6 }}>
                  <span style={{ color: '#10b981' }}>── {returnType === 'actual' ? 'Actual' : 'Std'}</span>
                </div>
                {series.main.length >= 2
                  ? <LineChart series={series} showBtc={false} />
                  : <div style={{ color: '#6b7280', fontSize: 13, padding: '20px 16px', textAlign: 'center' }}>No return data available</div>
                }
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 8px 4px', marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', paddingLeft: 16, marginBottom: 4 }}>Underwater / Drawdown</div>
                {series.main.length >= 2
                  ? <UnderwaterChart series={series.main} />
                  : <div style={{ color: '#6b7280', fontSize: 13, padding: '12px 16px', textAlign: 'center' }}>—</div>
                }
              </div>

              {metrics && (
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
                  {secT('Additional Metrics')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    {[
                      ['Win Rate',     metrics.win_rate != null  ? (metrics.win_rate * 100).toFixed(1) + '%' : '—'],
                      ['Avg Win',      metrics.avg_win != null   ? (metrics.avg_win * 100).toFixed(2) + '%' : '—'],
                      ['Avg Loss',     metrics.avg_loss != null  ? (metrics.avg_loss * 100).toFixed(2) + '%' : '—'],
                      ['Track Record', metrics.track_record_days != null ? `${metrics.track_record_days}d` : '—'],
                      ['Start',        metrics.track_record_start ?? '—'],
                      ['End',          metrics.track_record_end ?? 'present'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 13, color: '#d1d5db' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
                {secT('Strategy & Fund')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    ['Exposure Profile', pm.exposure_profile],
                    ['Trading Horizon',  pm.trading_horizon],
                    ['Strategy Type',    pm.strategy_type],
                    ['Leverage',         pm.leverage_target != null ? `${pm.leverage_target}x` : null],
                    ['Max Capacity',     fmtM(pm.max_capacity)],
                    ['Current AUM',      fmtM(pm.current_aum)],
                    ['GP Commitment',    fmtM(pm.gp_commitment)],
                    ['Exchanges',        (pm.exchanges ?? []).join(', ') || null],
                    ['Track Record',     metrics
                      ? `${metrics.track_record_start ?? '?'} → ${metrics.track_record_end ?? 'present'} (${metrics.track_record_days ?? '?'}d)`
                      : null],
                  ] as [string, string | null][]).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#6b7280' }}>{k}</span>
                      <span style={{ color: '#d1d5db' }}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
                {secT('Contact')}
                {pm.contact_info
                  ? <p style={{ fontSize: 13, color: '#d1d5db', margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{pm.contact_info}</p>
                  : <span style={{ fontSize: 13, color: '#6b7280' }}>—</span>
                }
                {pm.description && (
                  <div style={{ marginTop: 20 }}>
                    {secT('Notes')}
                    <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{pm.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Log Tab */}
          {activeTab === 'log' && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
              {secT('Status History')}
              {statusLog.length === 0
                ? <div style={{ color: '#6b7280', fontSize: 13 }}>No status changes yet.</div>
                : (
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: '#1f2937', borderRadius: 2 }} />
                    {statusLog.map((log, i) => {
                      const m = STATUS_META[log.to_status] ?? STATUS_META.pipeline
                      return (
                        <div key={log.id} style={{ position: 'relative', marginBottom: i < statusLog.length - 1 ? 24 : 0 }}>
                          <div style={{ position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%', background: m.color, border: '2px solid #111827' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <StatusBadge status={log.to_status} />
                            {log.from_status && <span style={{ fontSize: 11, color: '#6b7280' }}>← {STATUS_META[log.from_status]?.label ?? log.from_status}</span>}
                            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
                              {log.changed_at?.slice(0, 10)} · {log.changed_by}
                            </span>
                          </div>
                          {log.reason && <div style={{ fontSize: 12, color: '#9ca3af' }}>{log.reason}</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </div>
          )}
        </div>
      </div>

      {statusModal && (
        <UpdateStatusModal
          pm={pm}
          onClose={() => setStatusModal(false)}
          onSave={async (toStatus, changedBy, reason) => {
            await updatePMStatus(pm.id, { to_status: toStatus as PMStatus, changed_by: changedBy, reason: reason || undefined })
            load()
          }}
        />
      )}

      {editModal && (
        <PMFormModal
          pm={pm}
          onClose={() => setEditModal(false)}
          onSave={async (data) => {
            await updatePM(pm.id, data as PMUpdate)
            load()
          }}
        />
      )}
    </div>
  )
}
