'use client'

export default function UnderwaterChart({
  series, width = 640, height = 120,
}: { series: number[]; width?: number; height?: number }) {
  const pad = { t: 8, r: 16, b: 24, l: 56 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  if (series.length < 2) return null

  let peak = series[0]
  const dd = series.map(v => { peak = Math.max(peak, v); return (v - peak) / peak })
  const min = Math.min(...dd)
  if (min === 0) return null

  const X = (i: number) => (i / Math.max(series.length - 1, 1)) * W
  // Y=0 is top (0% drawdown), Y=H is bottom (max drawdown)
  const Y = (v: number) => (v / min) * H
  const linePts = dd.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const fillD = linePts + ` L${X(dd.length - 1).toFixed(1)},0 L0,0 Z`

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <g transform={`translate(${pad.l},${pad.t})`}>
        {[0, min / 2, min].map((v, i) => (
          <g key={i}>
            <line x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke="#1f2937" strokeWidth={1} />
            <text x={-8} y={Y(v) + 4} textAnchor="end" fontSize={10} fill="#6b7280">
              {(v * 100).toFixed(1)}%
            </text>
          </g>
        ))}
        <path d={fillD} fill="#ef444430" stroke="none" />
        <path d={linePts} fill="none" stroke="#ef4444" strokeWidth={1.5} />
      </g>
    </svg>
  )
}
