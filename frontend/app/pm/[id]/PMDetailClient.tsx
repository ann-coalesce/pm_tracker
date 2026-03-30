'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusBadge, { STATUS_META } from '../../components/StatusBadge'
import LineChart from '../../components/LineChart'
import UnderwaterChart from '../../components/UnderwaterChart'
import UpdateStatusModal from '../../components/UpdateStatusModal'
import PMFormModal from '../../components/PMFormModal'
import { getPM, getPMMetrics, getPMEquityCurve, getPMStatusLog, updatePMStatus, updatePM, getLeverageHistory, addLeverageHistory, getReturnSources, syncNav, deleteSelfReported, getBenchmarkEquityCurve } from '../../lib/api'
import type { PM, PMMetrics, PMMetricsResponse, EquityCurvePoint, BenchmarkPoint, PMStatusLog, PMStatus, PMUpdate, LeverageHistory, ReturnSource, SyncResult } from '../../lib/types'
import { BENCHMARK_COLORS } from '../../components/LineChart'

const BENCHMARKS: { key: string; apiSymbol: string; label: string }[] = [
  { key: 'BTC',   apiSymbol: 'BTCUSDT', label: 'BTC'   },
  { key: 'ETH',   apiSymbol: 'ETHUSDT', label: 'ETH'   },
  { key: 'SPX',   apiSymbol: 'SPX',     label: 'SPX'   },
  { key: 'CCI30', apiSymbol: 'CCI30',   label: 'CCI30' },
]

const fmt  = (n: number | null, d = 1) => n == null ? '—' : (n * 100).toFixed(d) + '%'
const fmtR = (n: number | null, d = 2) => n == null ? '—' : n.toFixed(d)
const fmtM = (n: number | null) => n == null ? '—' : `${n}M`


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
  const [inceptionMetrics, setInceptionMetrics] = useState<PMMetrics | null>(null)
  const [curve, setCurve] = useState<EquityCurvePoint[]>([])
  const [statusLog, setStatusLog] = useState<PMStatusLog[]>([])
  const [leverageHistory, setLeverageHistory] = useState<LeverageHistory[]>([])
  const [returnSources, setReturnSources] = useState<ReturnSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [returnType, setReturnType] = useState('actual')
  const [timeRange, setTimeRange] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [activeBenchmarks, setActiveBenchmarks] = useState<Set<string>>(new Set())
  const [benchmarkCurves, setBenchmarkCurves] = useState<Record<string, BenchmarkPoint[]>>({})

  const toggleBenchmark = (key: string) => {
    setActiveBenchmarks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const [deleteModal, setDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [levFormOpen, setLevFormOpen] = useState(false)
  const [levForm, setLevForm] = useState({ start_date: '', leverage: '', note: '' })
  const [levSaving, setLevSaving] = useState(false)
  const [levError, setLevError] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState(false)
  const [editModal, setEditModal] = useState(false)

  const loadLevHistory = () => {
    if (!id) return
    getLeverageHistory(id).then(setLeverageHistory).catch(() => {})
  }

  const getMetricsParams = (range: string) => {
    const days: Record<string, number> = { '3M': 90, '6M': 180, '1Y': 365 }
    const n = days[range]
    if (!n) return {}
    const d = new Date(); d.setDate(d.getDate() - n)
    return { start_date: d.toISOString().slice(0, 10) }
  }

  const applyMetricsResp = (resp: PMMetricsResponse) => {
    setMetrics(resp.metrics)
    setInceptionMetrics(resp.inception_metrics)
  }

  const load = () => {
    if (!id) return
    setLoading(true); setError(null)
    Promise.all([getPM(id), getPMMetrics(id, getMetricsParams(timeRange)), getPMEquityCurve(id), getPMStatusLog(id), getLeverageHistory(id), getReturnSources(id)])
      .then(([pmData, metricsResp, curveData, logData, levData, srcData]) => {
        setPm(pmData); applyMetricsResp(metricsResp); setCurve(curveData); setStatusLog(logData)
        setLeverageHistory(levData as LeverageHistory[])
        setReturnSources(srcData as ReturnSource[])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }
  useEffect(load, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch metrics when time range changes
  useEffect(() => {
    if (!id) return
    getPMMetrics(id, getMetricsParams(timeRange)).then(applyMetricsResp).catch(() => {})
  }, [timeRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const slicedCurve = useMemo(() => {
    if (!curve.length) return curve
    const days: Record<string, number> = { '3M': 90, '6M': 180, '1Y': 365 }
    const n = days[timeRange]
    const sliced = n
      ? (() => { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - n); return curve.filter(p => new Date(p.date) >= cutoff) })()
      : curve
    if (!sliced.length) return sliced
    // Rebase so the first visible point = 1.0 for both actual and std
    const baseNav = sliced[0].nav
    const baseStd = sliced[0].std_nav || 1
    return sliced.map(p => ({ ...p, nav: p.nav / baseNav, std_nav: p.std_nav / baseStd }))
  }, [curve, timeRange])

  const sourceMarkers = useMemo(() => {
    if (returnSources.length <= 1) return []
    return returnSources.slice(1).flatMap(src => {
      const idx = slicedCurve.findIndex(p => p.date >= src.start_date)
      if (idx < 0) return []
      return [{ idx, label: `Source: ${src.source_type}, from ${src.start_date}` }]
    })
  }, [returnSources, slicedCurve])

  // Fetch benchmark curves for active benchmarks, aligned to PM's first visible date
  useEffect(() => {
    if (!id || !slicedCurve.length) return
    const startDate = slicedCurve[0].date
    for (const b of BENCHMARKS) {
      if (activeBenchmarks.has(b.key)) {
        getBenchmarkEquityCurve(b.apiSymbol, { start_date: startDate })
          .then(data => setBenchmarkCurves(prev => ({ ...prev, [b.key]: data })))
          .catch(() => setBenchmarkCurves(prev => ({ ...prev, [b.key]: [] })))
      } else {
        setBenchmarkCurves(prev => { const { [b.key]: _removed, ...rest } = prev; void _removed; return rest })
      }
    }
  }, [activeBenchmarks, slicedCurve, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const benchmarkAligned = useMemo(() => {
    const result: Record<string, number[]> = {}
    if (!slicedCurve.length) return result
    for (const b of BENCHMARKS) {
      const bCurve = benchmarkCurves[b.key]
      if (!activeBenchmarks.has(b.key) || !bCurve?.length) continue
      const bMap = new Map(bCurve.map(p => [p.date, p.nav]))
      const base = bCurve[0].nav || 1
      let last = 1.0
      result[b.key] = slicedCurve.map(p => {
        const nav = bMap.get(p.date)
        if (nav !== undefined) last = nav / base
        return last
      })
    }
    return result
  }, [activeBenchmarks, benchmarkCurves, slicedCurve])

  const series = useMemo(() => ({
    main: slicedCurve.map(p => returnType === 'std' ? p.std_nav : p.nav),
    dates: slicedCurve.map(p => p.date),
    sources: sourceMarkers,
    benchmarks: benchmarkAligned,
  }), [slicedCurve, returnType, sourceMarkers, benchmarkAligned])

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

  const isStd = returnType === 'std'
  const annReturn    = isStd ? (metrics?.std_cagr ?? null)                    : (metrics?.cagr ?? null)
  const sharpe       = isStd ? (metrics?.std_sharpe_ratio ?? null)             : (metrics?.sharpe_ratio ?? null)
  const sortino      = isStd ? (metrics?.std_sortino_ratio ?? null)            : (metrics?.sortino_ratio ?? null)
  const calmar       = isStd ? (metrics?.std_calmar_ratio ?? null)             : (metrics?.calmar_ratio ?? null)
  const annVol       = isStd ? (metrics?.std_ann_volatility ?? null)           : (metrics?.ann_volatility ?? null)
  const annDVol      = isStd ? (metrics?.std_ann_downside_volatility ?? null)  : (metrics?.ann_downside_volatility ?? null)
  const maxDD        = isStd ? (metrics?.std_max_drawdown ?? null)             : (metrics?.max_drawdown ?? null)
  const currentDD    = isStd ? (metrics?.std_current_drawdown ?? null)         : (metrics?.current_drawdown ?? null)

  const incAnnReturn = isStd ? (inceptionMetrics?.std_cagr ?? null)                   : (inceptionMetrics?.cagr ?? null)
  const incSharpe    = isStd ? (inceptionMetrics?.std_sharpe_ratio ?? null)            : (inceptionMetrics?.sharpe_ratio ?? null)
  const incSortino   = isStd ? (inceptionMetrics?.std_sortino_ratio ?? null)           : (inceptionMetrics?.sortino_ratio ?? null)
  const incCalmar    = isStd ? (inceptionMetrics?.std_calmar_ratio ?? null)            : (inceptionMetrics?.calmar_ratio ?? null)
  const incAnnVol    = isStd ? (inceptionMetrics?.std_ann_volatility ?? null)          : (inceptionMetrics?.ann_volatility ?? null)
  const incAnnDVol   = isStd ? (inceptionMetrics?.std_ann_downside_volatility ?? null) : (inceptionMetrics?.ann_downside_volatility ?? null)
  const incMaxDD     = isStd ? (inceptionMetrics?.std_max_drawdown ?? null)            : (inceptionMetrics?.max_drawdown ?? null)
  const incCurrentDD = isStd ? (inceptionMetrics?.std_current_drawdown ?? null)        : (inceptionMetrics?.current_drawdown ?? null)

  const metricCards = [
    { label: 'Ann. Return', value: fmt(annReturn),  color: (annReturn ?? 0) >= 0 ? '#10b981' : '#ef4444', inception: fmt(incAnnReturn) },
    { label: 'Sharpe',      value: fmtR(sharpe),    color: '#3b82f6',  inception: fmtR(incSharpe) },
    { label: 'Sortino',     value: fmtR(sortino),   color: '#6366f1',  inception: fmtR(incSortino) },
    { label: 'Calmar',      value: fmtR(calmar),    color: '#8b5cf6',  inception: fmtR(incCalmar) },
    { label: 'Ann. Vol',    value: fmt(annVol),      color: '#f59e0b',  inception: fmt(incAnnVol) },
    { label: 'Ann. D.Vol',  value: fmt(annDVol),     color: '#f59e0b',  inception: fmt(incAnnDVol) },
    { label: 'Max DD',      value: fmt(maxDD),       color: '#ef4444',  inception: fmt(incMaxDD) },
    { label: 'Current DD',  value: fmt(currentDD),   color: (currentDD ?? 0) < 0 ? '#ef4444' : '#6b7280', inception: fmt(incCurrentDD) },
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
            {[['overview', 'Overview'], ['info', 'Info & Contact'], ['leverage', 'Leverage History'], ['log', 'Status Log']].map(([t, l]) => (
              <button key={t} style={tabSt(t)} onClick={() => setActiveTab(t)}>{l}</button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                Metrics: {timeRange === 'all' ? 'Since Inception' : `Last ${timeRange}`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {metricCards.map(m => (
                  <div key={m.label} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
                    {timeRange !== 'all' && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>inception: {m.inception}</div>
                    )}
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
                {BENCHMARKS.map(b => {
                  const on = activeBenchmarks.has(b.key)
                  const color = BENCHMARK_COLORS[b.key]
                  return (
                    <button key={b.key} onClick={() => toggleBenchmark(b.key)}
                      style={{
                        padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${on ? color : '#374151'}`,
                        background: on ? `${color}22` : 'transparent',
                        color: on ? color : '#9ca3af',
                      }}>
                      {b.label}
                    </button>
                  )
                })}
                {pm.nav_table_key && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {syncResult && !syncError && (
                      <span style={{ fontSize: 11, color: '#10b981' }}>
                        Synced: +{syncResult.inserted} inserted, {syncResult.updated} updated
                      </span>
                    )}
                    {syncError && (
                      <span style={{ fontSize: 11, color: '#ef4444' }}>{syncError}</span>
                    )}
                    <button
                      disabled={syncing}
                      onClick={async () => {
                        setSyncing(true); setSyncResult(null); setSyncError(null)
                        try {
                          const result = await syncNav(id)
                          setSyncResult(result)
                          load()
                        } catch (e) {
                          setSyncError(e instanceof Error ? e.message : 'Sync failed')
                        } finally {
                          setSyncing(false)
                        }
                      }}
                      style={{ background: syncing ? '#1e3a5f' : '#1e2a3a', border: '1px solid #3b82f6', color: syncing ? '#6b7280' : '#60a5fa', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: syncing ? 'not-allowed' : 'pointer' }}>
                      {syncing ? 'Syncing…' : '⟳ Sync from NAV'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '14px 8px 8px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 16, marginBottom: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af' }}>
                    <svg width="20" height="10" style={{ display: 'block' }}><line x1="0" y1="5" x2="20" y2="5" stroke="#10b981" strokeWidth="2" /></svg>
                    {returnType === 'actual' ? 'Actual' : 'Std'}
                  </span>
                  {returnSources.length > 1 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af' }}>
                      <svg width="20" height="10" style={{ display: 'block' }}><line x1="0" y1="5" x2="20" y2="5" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.8" /></svg>
                      Source change
                    </span>
                  )}
                  {BENCHMARKS.map(b => activeBenchmarks.has(b.key) && benchmarkAligned[b.key] && (
                    <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af' }}>
                      <svg width="20" height="10" style={{ display: 'block' }}><line x1="0" y1="5" x2="20" y2="5" stroke={BENCHMARK_COLORS[b.key]} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.8" /></svg>
                      {b.label}
                    </span>
                  ))}
                </div>
                {series.main.length >= 2
                  ? <LineChart series={series} timeRange={timeRange} />
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

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Return Source Timeline</div>
                  {returnSources.some(s => s.source_type === 'self_reported') && (
                    <button onClick={() => { setDeleteModal(true); setDeleteError(null) }}
                      style={{ fontSize: 11, color: '#ef4444', background: 'transparent', border: '1px solid #ef444460', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>
                      Clear Self-reported
                    </button>
                  )}
                </div>
                {returnSources.length === 0
                  ? <div style={{ color: '#6b7280', fontSize: 13 }}>No return sources configured.</div>
                  : (
                    <div style={{ position: 'relative', paddingLeft: 20 }}>
                      <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: '#1f2937', borderRadius: 2 }} />
                      {returnSources.map((src, i) => {
                        const dotColor = src.source_type === 'self_reported' ? '#3b82f6'
                          : src.source_type === 'internal_nav' ? '#10b981'
                          : '#6b7280'
                        const label = src.source_type === 'self_reported' ? 'Self Reported'
                          : src.source_type === 'internal_nav' ? 'Internal NAV'
                          : src.source_type === 'gap_filled' ? 'Gap Filled'
                          : src.source_type
                        const dateRange = `${src.start_date} → ${src.end_date ?? 'present'}`
                        return (
                          <div key={src.id} style={{ position: 'relative', marginBottom: i < returnSources.length - 1 ? 20 : 0 }}>
                            <div style={{ position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%', background: dotColor, border: '2px solid #111827' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#d1d5db' }}>{label}</span>
                              {src.source_ref && (
                                <code style={{ fontSize: 11, color: '#fbbf24', background: '#0f172a', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>{src.source_ref}</code>
                              )}
                              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>{dateRange}</span>
                            </div>
                            {src.source_type === 'gap_filled'
                              ? <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Auto-filled with return = 0 for missing dates</div>
                              : src.note && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{src.note}</div>
                            }
                          </div>
                        )
                      })}
                    </div>
                  )
                }
              </div>
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
                {secT('Strategy & Fund')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    ['Exposure Profile', pm.exposure_profile],
                    ['Trading Horizon',  pm.trading_horizon],
                    ['Strategy Type',    pm.strategy_type],
                    ['Leverage',         (() => { const cur = leverageHistory.find(h => h.end_date == null); return cur ? `${cur.leverage}x (from leverage history)` : null })()],
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
                  {secT('Legal & Compliance')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {([
                      ['Jurisdiction', pm.jurisdiction],
                      ['Entity Name',  pm.entity_name],
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {([
                      ['Name',     pm.contact_name],
                      ['Email',    pm.contact_email],
                      ['Telegram', pm.contact_telegram],
                    ] as [string, string | null][]).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#6b7280' }}>{k}</span>
                        <span style={{ color: '#d1d5db' }}>{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Leverage History Tab */}
          {activeTab === 'leverage' && (
            <div>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1f2937' }}>
                      {['Start Date', 'End Date', 'Leverage', 'Note'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leverageHistory.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '20px 14px', color: '#6b7280', fontSize: 13 }}>No leverage history yet.</td></tr>
                    ) : leverageHistory.map((row, i) => {
                      const isCurrent = row.end_date === null
                      return (
                        <tr key={row.id} style={{ borderBottom: i < leverageHistory.length - 1 ? '1px solid #1f2937' : 'none', background: i % 2 === 0 ? '#111827' : '#0d1424' }}>
                          <td style={{ padding: '10px 14px', color: '#d1d5db' }}>{row.start_date}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {isCurrent
                              ? <span style={{ color: '#10b981', fontWeight: 500 }}>present</span>
                              : <span style={{ color: '#9ca3af' }}>{row.end_date}</span>
                            }
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontWeight: 700, color: '#f9fafb' }}>{Number(row.leverage).toFixed(1)}x</span>
                            {isCurrent && (
                              <span style={{ marginLeft: 8, fontSize: 11, color: '#10b981', background: '#10b98120', border: '1px solid #10b98140', borderRadius: 4, padding: '2px 7px' }}>current</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#6b7280' }}>—</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {!levFormOpen ? (
                <button
                  onClick={() => { setLevFormOpen(true); setLevError(null); setLevForm({ start_date: '', leverage: '', note: '' }) }}
                  style={{ width: '100%', padding: '10px', fontSize: 13, color: '#9ca3af', background: 'transparent', border: '1px dashed #374151', borderRadius: 8, cursor: 'pointer' }}>
                  + Add Leverage Change
                </button>
              ) : (
                <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb', marginBottom: 16 }}>New Leverage Period</div>

                  {levError && (
                    <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 6, padding: '8px 12px', marginBottom: 14, color: '#ef4444', fontSize: 12 }}>{levError}</div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>Start Date *</label>
                      <input type="date" value={levForm.start_date} onChange={e => setLevForm(f => ({ ...f, start_date: e.target.value }))}
                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '7px 10px', color: '#f9fafb', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>New Leverage *</label>
                      <input type="number" step="0.1" min="0.1" placeholder="e.g. 3.0" value={levForm.leverage} onChange={e => setLevForm(f => ({ ...f, leverage: e.target.value }))}
                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '7px 10px', color: '#f9fafb', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>Note</label>
                      <input type="text" placeholder="e.g. Increased after strong Q1" value={levForm.note} onChange={e => setLevForm(f => ({ ...f, note: e.target.value }))}
                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '7px 10px', color: '#f9fafb', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: '#9ca3af', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '9px 12px', marginBottom: 16 }}>
                    ⚠️ Adding a new leverage period will automatically close the current period and trigger a backfill of <code style={{ fontFamily: 'monospace', background: '#0f172a', padding: '1px 5px', borderRadius: 3, color: '#fbbf24' }}>std_return</code> for affected dates.
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={async () => {
                        if (!levForm.start_date || !levForm.leverage) { setLevError('Start date and leverage are required'); return }
                        setLevSaving(true); setLevError(null)
                        try {
                          await addLeverageHistory(id, {
                            start_date: levForm.start_date,
                            leverage: Number(levForm.leverage),
                            ...(levForm.note.trim() ? { note: levForm.note.trim() } : {}),
                          })
                          setLevFormOpen(false)
                          loadLevHistory()
                        } catch (e) {
                          setLevError(e instanceof Error ? e.message : 'Save failed')
                        } finally {
                          setLevSaving(false)
                        }
                      }}
                      disabled={levSaving}
                      style={{ background: levSaving ? '#1e3a5f' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, cursor: levSaving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
                      {levSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setLevFormOpen(false); setLevError(null) }}
                      style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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

      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#0f172a', border: '1px solid #374151', borderRadius: 12, padding: 28, width: '100%', maxWidth: 420 }}>
            <h3 style={{ color: '#f9fafb', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Clear Self-reported Data</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
              Are you sure you want to delete all self-reported return data? This action cannot be undone.
            </p>
            {deleteError && (
              <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 6, padding: '8px 12px', marginBottom: 16, color: '#ef4444', fontSize: 12 }}>{deleteError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true); setDeleteError(null)
                  try {
                    await deleteSelfReported(id)
                    setDeleteModal(false)
                    load()
                  } catch (e) {
                    setDeleteError(e instanceof Error ? e.message : 'Delete failed')
                  } finally {
                    setDeleting(false)
                  }
                }}
                style={{ background: deleting ? '#4a1515' : '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
                {deleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
              <button onClick={() => setDeleteModal(false)}
                style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
