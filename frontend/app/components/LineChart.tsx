'use client'

export interface LineChartSeries {
  main: number[]
  btc?: number[]
  dates?: string[]
  sources?: { idx: number; label?: string }[]
}

function buildXTicks(
  dates: string[],
  timeRange: string,
): { idx: number; label: string }[] {
  if (dates.length < 2) return []
  const n = dates.length
  const parsed = dates.map(d => new Date(d + 'T00:00:00Z'))
  const start = parsed[0]
  const end = parsed[n - 1]

  const anchors: Date[] = []

  if (timeRange === '3M' || timeRange === '6M') {
    const stepDays = timeRange === '3M' ? 7 : 14
    // Start from first Monday on or after start
    const anchor = new Date(start)
    const dow = anchor.getUTCDay()
    anchor.setUTCDate(anchor.getUTCDate() + (dow === 1 ? 0 : (8 - dow) % 7))
    while (anchor <= end) {
      anchors.push(new Date(anchor))
      anchor.setUTCDate(anchor.getUTCDate() + stepDays)
    }
  } else if (timeRange === '1Y') {
    // First of each month
    const anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    if (anchor < start) anchor.setUTCMonth(anchor.getUTCMonth() + 1)
    while (anchor <= end) {
      anchors.push(new Date(anchor))
      anchor.setUTCMonth(anchor.getUTCMonth() + 1)
    }
  } else {
    // All: quarter starts Jan/Apr/Jul/Oct
    for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
      for (const m of [0, 3, 6, 9]) {
        const d = new Date(Date.UTC(y, m, 1))
        if (d >= start && d <= end) anchors.push(d)
      }
    }
  }

  const ticks: { idx: number; label: string }[] = []
  let prevYear = ''

  for (const anchor of anchors) {
    let idx = parsed.findIndex(d => d >= anchor)
    if (idx < 0) idx = n - 1
    if (ticks.length > 0 && ticks[ticks.length - 1].idx === idx) continue

    const dateStr = dates[idx]
    const year = dateStr.slice(0, 4)
    const month = dateStr.slice(5, 7)
    const day = dateStr.slice(8, 10)
    const yearChanged = prevYear !== '' && year !== prevYear

    let label: string
    if (timeRange === '3M' || timeRange === '6M') {
      label = (prevYear === '' || yearChanged) ? `${year.slice(2)}-${month}-${day}` : `${month}-${day}`
    } else if (timeRange === '1Y') {
      label = `${year}-${month}`
    } else {
      const q = Math.floor((parseInt(month) - 1) / 3) + 1
      label = `${year}-Q${q}`
    }

    prevYear = year
    ticks.push({ idx, label })
  }

  // Cap at 8 labels to avoid crowding
  if (ticks.length > 8) {
    const step = Math.ceil(ticks.length / 8)
    return ticks.filter((_, i) => i % step === 0)
  }
  return ticks
}

export default function LineChart({
  series, width = 640, height = 220, showBtc = true, timeRange = 'all',
}: {
  series: LineChartSeries
  width?: number
  height?: number
  showBtc?: boolean
  timeRange?: string
}) {
  const pad = { t: 16, r: 16, b: 32, l: 56 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  if (series.main.length < 2) return null

  const allVals = [...series.main, ...(showBtc && series.btc?.length ? series.btc : [])]
  const dataMin = Math.min(...allVals), dataMax = Math.max(...allVals)

  // Y axis: multiples of 0.5, 1.0 always included, padded above
  const STEP = 0.5
  const yAxisMin = Math.max(0, Math.floor(dataMin / STEP) * STEP)
  const yAxisMax = (Math.ceil(dataMax / STEP) + 1) * STEP
  const range = yAxisMax - yAxisMin || 1

  const X = (i: number) => (i / Math.max(series.main.length - 1, 1)) * W
  const Y = (v: number) => H - ((v - yAxisMin) / range) * H
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')

  // Build ticks at every 0.5, then thin if too many
  let yTicks: number[] = []
  for (let v = yAxisMin; v <= yAxisMax + 1e-9; v = Math.round((v + STEP) * 1000) / 1000) {
    yTicks.push(v)
  }
  // Thin to max 8 ticks by skipping every other (always keep 1.0)
  while (yTicks.length > 8) {
    const next: number[] = []
    for (let i = 0; i < yTicks.length; i++) {
      if (yTicks[i] === 1 || i % 2 === 0) next.push(yTicks[i])
    }
    yTicks = next
  }

  const xTicks = series.dates ? buildXTicks(series.dates, timeRange) : []

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <g transform={`translate(${pad.l},${pad.t})`}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke="#1f2937" strokeWidth={1} />
            <text x={-8} y={Y(v) + 4} textAnchor="end" fontSize={10} fill="#6b7280">{v.toFixed(1)}</text>
          </g>
        ))}
        {yAxisMin <= 1 && yAxisMax >= 1 && (
          <line x1={0} y1={Y(1)} x2={W} y2={Y(1)} stroke="#374151" strokeWidth={1} strokeDasharray="4,3" />
        )}
        {showBtc && series.btc && series.btc.length > 1 && (
          <path d={path(series.btc)} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.6} strokeDasharray="5,3" />
        )}
        <path d={path(series.main)} fill="none" stroke="#10b981" strokeWidth={2} />
        {series.sources?.map((seg, i) => (
          <g key={i}>
            {seg.label && <title>{seg.label}</title>}
            <line x1={X(seg.idx)} y1={0} x2={X(seg.idx)} y2={H} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
          </g>
        ))}
        {xTicks.map(({ idx, label }) => (
          <text key={idx} x={X(idx)} y={H + 18} textAnchor="middle" fontSize={10} fill="#6b7280">
            {label}
          </text>
        ))}
      </g>
    </svg>
  )
}
