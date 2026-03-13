'use client'

export interface LineChartSeries {
  main: number[]
  btc?: number[]
  dates?: string[]
  sources?: { idx: number }[]
}

export default function LineChart({
  series, width = 640, height = 220, showBtc = true,
}: {
  series: LineChartSeries
  width?: number
  height?: number
  showBtc?: boolean
}) {
  const pad = { t: 16, r: 16, b: 32, l: 56 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  if (series.main.length < 2) return null

  const allVals = [...series.main, ...(showBtc && series.btc?.length ? series.btc : [])]
  const min = Math.min(...allVals), max = Math.max(...allVals), range = max - min || 1
  const X = (i: number) => (i / Math.max(series.main.length - 1, 1)) * W
  const Y = (v: number) => H - ((v - min) / range) * H
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const yTicks = Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4)
  const xStep = Math.max(Math.floor(series.main.length / 5), 1)
  const xTicks = Array.from({ length: 6 }, (_, i) => Math.min(i * xStep, series.main.length - 1))

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <g transform={`translate(${pad.l},${pad.t})`}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke="#1f2937" strokeWidth={1} />
            <text x={-8} y={Y(v) + 4} textAnchor="end" fontSize={10} fill="#6b7280">{v.toFixed(2)}</text>
          </g>
        ))}
        {min <= 1 && max >= 1 && (
          <line x1={0} y1={Y(1)} x2={W} y2={Y(1)} stroke="#374151" strokeWidth={1} strokeDasharray="4,3" />
        )}
        {showBtc && series.btc && series.btc.length > 1 && (
          <path d={path(series.btc)} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.6} strokeDasharray="5,3" />
        )}
        <path d={path(series.main)} fill="none" stroke="#10b981" strokeWidth={2} />
        {series.sources?.map((seg, i) => (
          <line key={i} x1={X(seg.idx)} y1={0} x2={X(seg.idx)} y2={H} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
        ))}
        {xTicks.map(i => (
          <text key={i} x={X(i)} y={H + 18} textAnchor="middle" fontSize={10} fill="#6b7280">
            {series.dates?.[i]?.slice(5) ?? ''}
          </text>
        ))}
      </g>
    </svg>
  )
}
