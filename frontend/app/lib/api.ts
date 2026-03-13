import type {
  PM, PMCreate, PMUpdate, PMStatusUpdate,
  PMMetrics, EquityCurvePoint, PMStatusLog, UploadResult,
} from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function getPMs(params?: {
  status?: string
  include_sparkline?: boolean
}): Promise<PM[]> {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.include_sparkline !== undefined)
    q.set('include_sparkline', String(params.include_sparkline))
  const res = await fetch(`${BASE}/v1/pms?${q}`)
  return handleRes<PM[]>(res)
}

export async function getPM(id: string): Promise<PM> {
  const res = await fetch(`${BASE}/v1/pms/${id}`)
  return handleRes<PM>(res)
}

export async function createPM(data: PMCreate): Promise<PM> {
  const res = await fetch(`${BASE}/v1/pms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleRes<PM>(res)
}

export async function updatePM(id: string, data: PMUpdate): Promise<PM> {
  const res = await fetch(`${BASE}/v1/pms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleRes<PM>(res)
}

export async function updatePMStatus(id: string, data: PMStatusUpdate): Promise<PM> {
  const res = await fetch(`${BASE}/v1/pms/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleRes<PM>(res)
}

export async function getPMMetrics(id: string, params?: {
  start_date?: string
  end_date?: string
}): Promise<PMMetrics> {
  const q = new URLSearchParams()
  if (params?.start_date) q.set('start_date', params.start_date)
  if (params?.end_date) q.set('end_date', params.end_date)
  const res = await fetch(`${BASE}/v1/pms/${id}/metrics?${q}`)
  return handleRes<PMMetrics>(res)
}

export async function getPMEquityCurve(id: string, params?: {
  start_date?: string
  end_date?: string
}): Promise<EquityCurvePoint[]> {
  const q = new URLSearchParams()
  if (params?.start_date) q.set('start_date', params.start_date)
  if (params?.end_date) q.set('end_date', params.end_date)
  const res = await fetch(`${BASE}/v1/pms/${id}/equity-curve?${q}`)
  return handleRes<EquityCurvePoint[]>(res)
}

export async function getPMStatusLog(id: string): Promise<PMStatusLog[]> {
  const res = await fetch(`${BASE}/v1/pms/${id}/status-log`)
  return handleRes<PMStatusLog[]>(res)
}

export async function uploadReturns(pmId: string, file: File): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/v1/pms/${pmId}/returns/upload-csv`, {
    method: 'POST',
    body: fd,
  })
  return handleRes<UploadResult>(res)
}
