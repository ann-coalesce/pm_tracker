'use client'
import type { PMStatus } from '../lib/types'

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pipeline:   { label: 'Pipeline',   color: '#6b7280', bg: '#1f2937' },
  onboarding: { label: 'Onboarding', color: '#f59e0b', bg: '#292015' },
  active:     { label: 'Active',     color: '#10b981', bg: '#0d2318' },
  alumni:     { label: 'Alumni',     color: '#3b82f6', bg: '#1e2a3a' },
  inactive:   { label: 'Inactive',   color: '#4b5563', bg: '#1a1a1a' },
}

export default function StatusBadge({ status }: { status: PMStatus | string }) {
  const m = STATUS_META[status] ?? STATUS_META.pipeline
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 4,
      color: m.color, background: m.bg,
      border: `1px solid ${m.color}40`, whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  )
}
