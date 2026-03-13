'use client'

const fmtM = (n: number | null) => n == null ? '—' : `${n}M`

export default function CapacityBar({ aum, max }: { aum: number | null; max: number | null }) {
  if (!max) return <span style={{ color: '#6b7280', fontSize: 11 }}>—</span>
  const pct = Math.min(((aum ?? 0) / max) * 100, 100)
  const color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ width: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>
        <span>{fmtM(aum)}</span><span>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 4, background: '#374151', borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}
