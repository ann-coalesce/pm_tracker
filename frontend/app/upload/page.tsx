'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import StatusBadge from '../components/StatusBadge'
import { getPMs, uploadReturns, importPMs } from '../lib/api'
import type { PM, UploadResult } from '../lib/types'

export default function UploadPage() {
  const [tab, setTab] = useState<'returns' | 'import'>('returns')

  // ── Upload Returns state ──────────────────────────────────────
  const [step, setStep] = useState(1)
  const [pms, setPms] = useState<PM[]>([])
  const [pmsLoading, setPmsLoading] = useState(true)
  const [sel, setSel] = useState<PM | null>(null)
  const [src, setSrc] = useState('self_reported')
  const [sd, setSd] = useState('')
  const [ed, setEd] = useState('')
  const [drag, setDrag] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ type: 'ok' | 'error'; data: UploadResult } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Import PMs state ─────────────────────────────────────────
  const [impDrag, setImpDrag] = useState(false)
  const [impUploading, setImpUploading] = useState(false)
  const [impResult, setImpResult] = useState<UploadResult | null>(null)
  const [impError, setImpError] = useState<string | null>(null)
  const impFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getPMs()
      .then(data => { setPms(data.filter(p => p.status !== 'inactive')); setPmsLoading(false) })
      .catch(() => setPmsLoading(false))
  }, [])

  const inp: React.CSSProperties = {
    background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
    padding: '8px 12px', color: '#f9fafb', fontSize: 13,
  }

  // ── Returns upload handlers ───────────────────────────────────
  const doUpload = async (file: File) => {
    if (!sel) return
    setResult(null); setUploadError(null); setUploading(true)
    try {
      const res = await uploadReturns(sel.id, file)
      setResult({ type: res.errors.length > 0 ? 'error' : 'ok', data: res })
      setStep(3)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) doUpload(file)
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) doUpload(file)
  }

  // ── Import PMs handlers ───────────────────────────────────────
  const doImport = async (file: File) => {
    setImpResult(null); setImpError(null); setImpUploading(true)
    try {
      const res = await importPMs(file)
      setImpResult(res)
    } catch (e) {
      setImpError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImpUploading(false)
    }
  }
  const handleImpDrop = (e: React.DragEvent) => {
    e.preventDefault(); setImpDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) doImport(file)
  }
  const handleImpFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) doImport(file)
  }

  const tabSt = (t: 'returns' | 'import'): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, border: 'none', borderRadius: 6, cursor: 'pointer',
    background: tab === t ? '#1f2937' : 'transparent',
    color: tab === t ? '#f9fafb' : '#9ca3af',
  })

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52 }}>
        <Link href="/" style={{ color: '#3b82f6', fontWeight: 700, fontSize: 16, letterSpacing: -0.5, textDecoration: 'none' }}>PM Tracker</Link>
        <div style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
          <Link href="/" style={{ background: 'transparent', color: '#9ca3af', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>Dashboard</Link>
          <button style={{ background: '#1f2937', color: '#f9fafb', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>Upload Returns</button>
        </div>
        <div style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>A</div>
      </div>

      <div style={{ padding: '20px 24px 0' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f9fafb', margin: 0 }}>Upload</h1>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 720 }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, background: '#111827', borderRadius: 8, padding: 4, marginBottom: 28, width: 'fit-content', border: '1px solid #1f2937' }}>
            <button style={tabSt('returns')} onClick={() => setTab('returns')}>Upload Returns</button>
            <button style={tabSt('import')} onClick={() => setTab('import')}>Import PMs</button>
          </div>

          {/* ── UPLOAD RETURNS TAB ───────────────────────────── */}
          {tab === 'returns' && (
            <div>
              <h2 style={{ color: '#f9fafb', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Upload Daily Returns</h2>

              {/* Stepper */}
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 32 }}>
                {['Select PM', 'Configure & Upload', 'Preview', 'Done'].map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                        background: step > i + 1 ? '#10b981' : step === i + 1 ? '#3b82f6' : '#1f2937',
                        color: step >= i + 1 ? '#fff' : '#6b7280',
                        border: `2px solid ${step === i + 1 ? '#3b82f6' : step > i + 1 ? '#10b981' : '#374151'}`,
                      }}>
                        {step > i + 1 ? '✓' : i + 1}
                      </div>
                      <span style={{ fontSize: 11, color: step === i + 1 ? '#f9fafb' : '#6b7280', whiteSpace: 'nowrap' }}>{s}</span>
                    </div>
                    {i < 3 && <div style={{ width: 52, height: 2, background: step > i + 1 ? '#10b981' : '#374151', margin: '0 4px', marginBottom: 18 }} />}
                  </div>
                ))}
              </div>

              {/* Step 1 */}
              {step === 1 && (
                <div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>Select which PM this data belongs to:</div>
                  {pmsLoading ? (
                    <div style={{ color: '#6b7280', fontSize: 13 }}>Loading PMs…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                      {pms.map(pm => (
                        <div key={pm.id} onClick={() => setSel(pm)}
                          style={{
                            padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${sel?.id === pm.id ? '#3b82f6' : '#374151'}`,
                            background: sel?.id === pm.id ? '#1e2a3a' : '#111827',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}>
                          <div>
                            <span style={{ color: '#fbbf24', fontWeight: 500 }}>{pm.name}</span>
                            <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 12 }}>{pm.strategy_type || '—'}</span>
                          </div>
                          <StatusBadge status={pm.status} />
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => sel && setStep(2)} disabled={!sel}
                    style={{ background: sel ? '#3b82f6' : '#1f2937', color: sel ? '#fff' : '#6b7280', border: 'none', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: sel ? 'pointer' : 'not-allowed' }}>
                    Next →
                  </button>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && sel && (
                <div>
                  <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>PM:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 500 }}>{sel.name}</span>
                    <StatusBadge status={sel.status} />
                    {sel.leverage_target && <span style={{ color: '#6b7280', fontSize: 12 }}>Leverage: {sel.leverage_target}x</span>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>Source Type</label>
                      <select style={{ ...inp, width: '100%' }} value={src} onChange={e => setSrc(e.target.value)}>
                        <option value="self_reported">Self Reported</option>
                        <option value="internal_nav">Internal NAV</option>
                        <option value="exchange_api">Exchange API</option>
                      </select>
                      {src === 'internal_nav' && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>For historical internal data</div>}
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>Start Date *</label>
                      <input type="date" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={sd} onChange={e => setSd(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>End Date</label>
                      <input type="date" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={ed} onChange={e => setEd(e.target.value)} />
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Leave blank = ongoing</div>
                    </div>
                  </div>

                  <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 6, padding: 12, marginBottom: 20 }}>
                    <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Expected CSV format</div>
                    <code style={{ color: '#94a3b8', fontSize: 12, display: 'block', lineHeight: 1.8 }}>
                      date,return_pct<br />
                      2024-01-02,0.0152<br />
                      2024-01-03,-0.0083<br />
                      2024-01-04,0.0000 ← no-trade day
                    </code>
                    <div style={{ color: '#6b7280', fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                      • Decimal format (0.0152 = 1.52%)<br />
                      • Every calendar day required — no gaps<br />
                      • No-trade days: include row with return_pct = 0
                    </div>
                  </div>

                  {uploadError && (
                    <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
                      ❌ {uploadError}
                    </div>
                  )}

                  <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />
                  <div
                    onDragOver={e => { e.preventDefault(); setDrag(true) }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={handleDrop}
                    onClick={() => !uploading && fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${drag ? '#3b82f6' : '#374151'}`, borderRadius: 8, padding: 40, textAlign: 'center',
                      cursor: uploading ? 'not-allowed' : 'pointer', background: drag ? '#1e2a3a' : '#0f172a', marginBottom: 20,
                      opacity: uploading ? 0.6 : 1,
                    }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                    <div style={{ color: '#f9fafb', fontSize: 14, fontWeight: 500 }}>{uploading ? 'Uploading…' : 'Drop CSV file here'}</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{uploading ? 'Please wait' : 'or click to browse'}</div>
                  </div>

                  <button onClick={() => setStep(1)}
                    style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer' }}>
                    ← Back
                  </button>
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && result && (
                result.type === 'error' ? (
                  <div>
                    <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: 20, marginBottom: 16 }}>
                      <div style={{ color: '#ef4444', fontWeight: 600, fontSize: 15, marginBottom: 8 }}>❌ Upload completed with errors</div>
                      <div style={{ color: '#d1d5db', fontSize: 13, marginBottom: result.data.errors.length > 0 ? 12 : 0 }}>
                        {result.data.inserted} inserted · {result.data.skipped} skipped
                      </div>
                      {result.data.errors.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {result.data.errors.map((e, i) => (
                            <span key={i} style={{ background: '#3a1f1f', border: '1px solid #ef444440', borderRadius: 4, padding: '3px 10px', fontSize: 12, color: '#fca5a5' }}>{e}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {result.data.warnings.length > 0 && (
                      <div style={{ background: '#292015', border: '1px solid #f59e0b40', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                        <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>⚠ Warnings</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {result.data.warnings.map((w, i) => (
                            <span key={i} style={{ fontSize: 12, color: '#fde68a' }}>{w}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={() => { setStep(2); setResult(null); setUploadError(null) }}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer' }}>
                      ← Re-upload
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                      {[
                        ['Inserted', result.data.inserted, '#10b981'],
                        ['Skipped',  result.data.skipped,  '#6b7280'],
                        ['Warnings', result.data.warnings.length, result.data.warnings.length > 0 ? '#f59e0b' : '#6b7280'],
                      ].map(([l, v, c]) => (
                        <div key={String(l)} style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{l}</div>
                          <div style={{ fontSize: 20, color: String(c), fontWeight: 600 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {result.data.warnings.length > 0 && (
                      <div style={{ background: '#292015', border: '1px solid #f59e0b40', borderRadius: 8, padding: 12, marginBottom: 20 }}>
                        <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>⚠ Warnings</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {result.data.warnings.map((w, i) => (
                            <span key={i} style={{ fontSize: 12, color: '#fde68a' }}>{w}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => setStep(4)}
                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
                        Confirm ✓
                      </button>
                      <button onClick={() => { setStep(2); setResult(null) }}
                        style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer' }}>
                        ← Back
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Step 4 */}
              {step === 4 && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                  <div style={{ color: '#f9fafb', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Import Successful</div>
                  <div style={{ color: '#9ca3af', fontSize: 14, marginBottom: 32 }}>
                    {result?.data.inserted} rows imported for{' '}
                    <span style={{ color: '#fbbf24' }}>{sel?.name}</span>
                    {(result?.data.warnings.length ?? 0) > 0 && (
                      <span style={{ color: '#f59e0b' }}> · {result!.data.warnings.length} warnings</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <Link href="/"
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                      Back to PM List
                    </Link>
                    <button onClick={() => { setStep(1); setSel(null); setResult(null) }}
                      style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer' }}>
                      Upload Another
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── IMPORT PMs TAB ───────────────────────────────── */}
          {tab === 'import' && (
            <div>
              <h2 style={{ color: '#f9fafb', fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Import PMs from CSV</h2>
              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
                Batch-create PMs from a CSV file. Existing PMs (matched by name) will be skipped.
              </p>

              {/* Format reference */}
              <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 6, padding: 14, marginBottom: 20 }}>
                <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Expected CSV columns (header row required, order flexible)</div>
                <code style={{ color: '#94a3b8', fontSize: 11, display: 'block', lineHeight: 2 }}>
                  name, status, exposure_profile, trading_horizon, strategy_type,<br />
                  leverage_target, max_capacity, current_aum, gp_commitment,<br />
                  exchanges, contact_name, contact_email, contact_telegram, notes
                </code>
                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 8, lineHeight: 1.7 }}>
                  • <strong style={{ color: '#9ca3af' }}>name</strong> is required — rows without name are skipped<br />
                  • <strong style={{ color: '#9ca3af' }}>exchanges</strong>: comma-separated within the cell (e.g. &quot;Binance,OKX&quot;)<br />
                  • <strong style={{ color: '#9ca3af' }}>status</strong>: pipeline / onboarding / active / alumni / inactive — defaults to pipeline<br />
                  • First leverage history entry is auto-created (start_date = today)
                </div>
              </div>

              {/* Result */}
              {impResult ? (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    {[
                      ['Inserted', impResult.inserted, '#10b981'],
                      ['Skipped',  impResult.skipped,  '#6b7280'],
                      ['Warnings', impResult.warnings.length, impResult.warnings.length > 0 ? '#f59e0b' : '#6b7280'],
                      ['Errors',   impResult.errors.length,   impResult.errors.length > 0   ? '#ef4444' : '#6b7280'],
                    ].map(([l, v, c]) => (
                      <div key={String(l)} style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{l}</div>
                        <div style={{ fontSize: 20, color: String(c), fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {impResult.warnings.length > 0 && (
                    <div style={{ background: '#292015', border: '1px solid #f59e0b40', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>⚠ Warnings</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {impResult.warnings.map((w, i) => (
                          <span key={i} style={{ fontSize: 12, color: '#fde68a' }}>{w}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {impResult.errors.length > 0 && (
                    <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ color: '#ef4444', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>❌ Errors (rows skipped)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {impResult.errors.map((e, i) => (
                          <span key={i} style={{ fontSize: 12, color: '#fca5a5' }}>{e}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12 }}>
                    <Link href="/"
                      style={{ background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer', textDecoration: 'none', fontWeight: 500 }}>
                      Back to PM List
                    </Link>
                    <button onClick={() => { setImpResult(null); setImpError(null) }}
                      style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, padding: '9px 24px', fontSize: 14, cursor: 'pointer' }}>
                      Import Another
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {impError && (
                    <div style={{ background: '#2a1515', border: '1px solid #ef444460', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
                      ❌ {impError}
                    </div>
                  )}

                  <input ref={impFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImpFileSelect} />
                  <div
                    onDragOver={e => { e.preventDefault(); setImpDrag(true) }}
                    onDragLeave={() => setImpDrag(false)}
                    onDrop={handleImpDrop}
                    onClick={() => !impUploading && impFileRef.current?.click()}
                    style={{
                      border: `2px dashed ${impDrag ? '#3b82f6' : '#374151'}`, borderRadius: 8, padding: 48, textAlign: 'center',
                      cursor: impUploading ? 'not-allowed' : 'pointer', background: impDrag ? '#1e2a3a' : '#0f172a',
                      opacity: impUploading ? 0.6 : 1,
                    }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                    <div style={{ color: '#f9fafb', fontSize: 14, fontWeight: 500 }}>{impUploading ? 'Importing…' : 'Drop PM CSV file here'}</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{impUploading ? 'Please wait' : 'or click to browse'}</div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
