'use client'
import { useState } from 'react'
import type { PM, PMStatus } from '../lib/types'
import { STATUS_META } from './StatusBadge'

interface Props {
  pm: PM
  onClose: () => void
  onSave: (toStatus: PMStatus, changedBy: string, reason: string) => Promise<void>
}

const VALID_STATUSES = Object.keys(STATUS_META) as PMStatus[]

export default function UpdateStatusModal({ pm, onClose, onSave }: Props) {
  const [toStatus, setToStatus] = useState<PMStatus>(pm.status)
  const [changedBy, setChangedBy] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inp: React.CSSProperties = {
    width: '100%', background: '#1f2937', border: '1px solid #374151',
    borderRadius: 6, padding: '8px 12px', color: '#f9fafb', fontSize: 13,
    boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }

  const handleSave = async () => {
    if (!changedBy.trim()) { setError('Changed by is required'); return }
    setSaving(true); setError(null)
    try {
      await onSave(toStatus, changedBy.trim(), reason.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0f172a', border: '1px solid #374151', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480 }}>
        <h2 style={{ color: '#f9fafb', fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>Update Status — {pm.name}</h2>

        {error && (
          <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>New Status</label>
          <select style={inp} value={toStatus} onChange={e => setToStatus(e.target.value as PMStatus)}>
            {VALID_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Changed By *</label>
          <input style={inp} value={changedBy} onChange={e => setChangedBy(e.target.value)} placeholder="Your name" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={lbl}>Reason</label>
          <textarea
            style={{ ...inp, height: 72, resize: 'vertical' }}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Optional reason for status change"
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ background: saving ? '#1e3a5f' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
            {saving ? 'Saving…' : 'Update Status'}
          </button>
          <button onClick={onClose}
            style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '8px 20px', fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
