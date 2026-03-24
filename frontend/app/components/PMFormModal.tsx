'use client'
import { useState } from 'react'
import type { PM, PMCreate, PMUpdate } from '../lib/types'
import { STATUS_META } from './StatusBadge'

const EXCHANGES = ['Binance', 'OKX', 'Bybit', 'Bitget', 'Gate']

interface Props {
  pm: PM | null  // null = create mode
  onClose: () => void
  onSave: (data: PMCreate | PMUpdate) => Promise<void>
}

export default function PMFormModal({ pm, onClose, onSave }: Props) {
  const isEdit = !!pm
  const [form, setForm] = useState({
    name: pm?.name ?? '',
    status: pm?.status ?? 'pipeline',
    exposure_profile: pm?.exposure_profile ?? '',
    trading_horizon: pm?.trading_horizon ?? '',
    strategy_type: pm?.strategy_type ?? '',
    leverage_target: pm?.leverage_target != null ? String(pm.leverage_target) : '1.0',
    max_capacity: pm?.max_capacity != null ? String(pm.max_capacity) : '',
    current_aum: pm?.current_aum != null ? String(pm.current_aum) : '0',
    gp_commitment: pm?.gp_commitment != null ? String(pm.gp_commitment) : '',
    exchanges: pm?.exchanges ?? [] as string[],
    contact_name: pm?.contact_name ?? '',
    contact_email: pm?.contact_email ?? '',
    contact_telegram: pm?.contact_telegram ?? '',
    nav_table_key: pm?.nav_table_key ?? '',
    jurisdiction: pm?.jurisdiction ?? '',
    entity_name: pm?.entity_name ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const toggleEx = (ex: string) =>
    set('exchanges', form.exchanges.includes(ex)
      ? form.exchanges.filter(e => e !== ex)
      : [...form.exchanges, ex])

  const inp: React.CSSProperties = {
    width: '100%', background: '#1f2937', border: '1px solid #374151',
    borderRadius: 6, padding: '8px 12px', color: '#f9fafb', fontSize: 13,
    boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }
  const sec = (t: string) => (
    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1f2937', paddingBottom: 8 }}>{t}</div>
  )
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    try {
      const payload: PMCreate = {
        name: form.name.trim(),
        ...(isEdit ? {} : { status: form.status as PM['status'] }),
        exposure_profile: form.exposure_profile || undefined,
        trading_horizon: form.trading_horizon || undefined,
        strategy_type: form.strategy_type || undefined,
        leverage_target: form.leverage_target ? Number(form.leverage_target) : undefined,
        max_capacity: form.max_capacity ? Number(form.max_capacity) : undefined,
        current_aum: form.current_aum ? Number(form.current_aum) : 0,
        gp_commitment: form.gp_commitment ? Number(form.gp_commitment) : undefined,
        exchanges: form.exchanges.length > 0 ? form.exchanges : undefined,
        contact_name: form.contact_name.trim() || undefined,
        contact_email: form.contact_email.trim() || undefined,
        contact_telegram: form.contact_telegram.trim() || undefined,
        nav_table_key: form.nav_table_key.trim() || undefined,
        jurisdiction: form.jurisdiction.trim() || undefined,
        entity_name: form.entity_name.trim() || undefined,
      }
      await onSave(payload)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#0f172a', border: '1px solid #374151', borderRadius: 12, padding: 28, width: '100%', maxWidth: 720 }}>
        <h2 style={{ color: '#f9fafb', fontSize: 18, fontWeight: 600, marginBottom: 28, margin: '0 0 28px' }}>
          {isEdit ? `Edit: ${pm!.name}` : 'Add New PM'}
        </h2>

        {error && (
          <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: '10px 14px', marginBottom: 20, color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 28 }}>{sec('Basic Info')}
          <div style={grid}>
            <div>
              <label style={lbl}>Name *</label>
              <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Settle Wu" />
            </div>
            {!isEdit && (
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>{sec('Strategy')}
          <div style={grid}>
            <div>
              <label style={lbl}>Exposure Profile</label>
              <select style={inp} value={form.exposure_profile} onChange={e => set('exposure_profile', e.target.value)}>
                {['', 'Directional', 'Market Neutral', 'Beta Neutral', 'Delta Neutral'].map(s => <option key={s} value={s}>{s || 'Select...'}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Trading Horizon</label>
              <select style={inp} value={form.trading_horizon} onChange={e => set('trading_horizon', e.target.value)}>
                {['', 'HFT', 'MFT', 'MFT (1H)', 'MFT (6H)', 'Multi-Horizon'].map(s => <option key={s} value={s}>{s || 'Select...'}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Strategy Type</label>
              <select style={inp} value={form.strategy_type} onChange={e => set('strategy_type', e.target.value)}>
                {['', 'CTA', 'Funding Arbitrage', 'Statistical Arbitrage', 'Discretionary', 'Other'].map(s => <option key={s} value={s}>{s || 'Select...'}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>{sec('Fund Info')}
          <div style={grid}>
            <div>
              <label style={lbl}>Leverage Target</label>
              <input style={inp} type="number" step="0.1" min="0.1" value={form.leverage_target} onChange={e => set('leverage_target', e.target.value)} />
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Std return = actual ÷ leverage</div>
            </div>
            <div>
              <label style={lbl}>Max Capacity (USDT M)</label>
              <input style={inp} type="number" value={form.max_capacity} onChange={e => set('max_capacity', e.target.value)} placeholder="e.g. 100" />
            </div>
            <div>
              <label style={lbl}>Current AUM (USDT M)</label>
              <input style={inp} type="number" value={form.current_aum} onChange={e => set('current_aum', e.target.value)} placeholder="e.g. 10" />
            </div>
            <div>
              <label style={lbl}>GP Commitment (USDT M)</label>
              <input style={inp} type="number" value={form.gp_commitment} onChange={e => set('gp_commitment', e.target.value)} placeholder="e.g. 2" />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={lbl}>Exchanges</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXCHANGES.map(ex => (
                <button key={ex} type="button" onClick={() => toggleEx(ex)}
                  style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, border: '1px solid', cursor: 'pointer',
                    borderColor: form.exchanges.includes(ex) ? '#3b82f6' : '#374151',
                    background: form.exchanges.includes(ex) ? '#1e2a3a' : 'transparent',
                    color: form.exchanges.includes(ex) ? '#60a5fa' : '#9ca3af',
                  }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>{sec('Contact')}
          <div style={grid}>
            <div>
              <label style={lbl}>Name</label>
              <input style={inp} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="e.g. John Smith" />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input style={inp} type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="e.g. john@example.com" />
            </div>
            <div>
              <label style={lbl}>Telegram</label>
              <input style={inp} value={form.contact_telegram} onChange={e => set('contact_telegram', e.target.value)} placeholder="e.g. @johnsmith" />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>{sec('Data Source')}
          <div>
            <label style={lbl}>Internal NAV Table Key</label>
            <input style={inp} value={form.nav_table_key} onChange={e => set('nav_table_key', e.target.value)} placeholder="e.g. sp1-sma-settlewu" />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Leave blank for self-reported only.</div>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>{sec('Legal & Compliance')}
          <div style={grid}>
            <div>
              <label style={lbl}>Entity Name</label>
              <input style={inp} value={form.entity_name} onChange={e => set('entity_name', e.target.value)} placeholder="e.g. Acme Capital Ltd." />
            </div>
            <div>
              <label style={lbl}>Jurisdiction</label>
              <input style={inp} value={form.jurisdiction} onChange={e => set('jurisdiction', e.target.value)} placeholder="e.g. Cayman Islands" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ background: saving ? '#1e3a5f' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create PM'}
          </button>
          <button onClick={onClose}
            style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
