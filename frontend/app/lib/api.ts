import type {
  PM, PMCreate, PMUpdate, PMStatusUpdate,
  PMMetricsResponse, EquityCurvePoint, BenchmarkPoint, PMStatusLog, UploadResult, LeverageHistory,
  ReturnSource, SyncResult,
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
}): Promise<PMMetricsResponse> {
  const q = new URLSearchParams()
  if (params?.start_date) q.set('start_date', params.start_date)
  if (params?.end_date) q.set('end_date', params.end_date)
  const res = await fetch(`${BASE}/v1/pms/${id}/metrics?${q}`)
  return handleRes<PMMetricsResponse>(res)
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

export async function getReturnSources(pmId: string): Promise<ReturnSource[]> {
  const res = await fetch(`${BASE}/v1/pms/${pmId}/return-sources`)
  return handleRes<ReturnSource[]>(res)
}

export async function addReturnSource(
  pmId: string,
  data: { start_date: string; source_type: string; source_ref?: string; note?: string; end_date?: string },
): Promise<ReturnSource> {
  const res = await fetch(`${BASE}/v1/pms/${pmId}/return-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleRes<ReturnSource>(res)
}

export async function syncNav(pmId: string): Promise<SyncResult> {
  const res = await fetch(`${BASE}/v1/pms/${pmId}/sync-nav`, { method: 'POST' })
  return handleRes<SyncResult>(res)
}

export async function getLeverageHistory(pmId: string): Promise<LeverageHistory[]> {
  const res = await fetch(`${BASE}/v1/pms/${pmId}/leverage-history`)
  return handleRes<LeverageHistory[]>(res)
}

export async function addLeverageHistory(
  pmId: string,
  data: { start_date: string; leverage: number; note?: string },
): Promise<LeverageHistory> {
  const res = await fetch(`${BASE}/v1/pms/${pmId}/leverage-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleRes<LeverageHistory>(res)
}

export async function importPMs(file: File): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/v1/pms/import-csv`, { method: 'POST', body: fd })
  return handleRes<UploadResult>(res)
}

export async function uploadReturns(pmId: string, file: File, overwrite = false): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/v1/pms/${pmId}/returns/upload-csv?overwrite=${overwrite}`, {
    method: 'POST',
    body: fd,
  })
  return handleRes<UploadResult>(res)
}

export async function deleteSelfReported(pmId: string): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE}/v1/pms/${pmId}/returns/self-reported`, { method: 'DELETE' })
  return handleRes<{ deleted: number }>(res)
}

export async function getBenchmarkEquityCurve(
  symbol: string,
  params?: { start_date?: string; end_date?: string },
): Promise<BenchmarkPoint[]> {
  const q = new URLSearchParams()
  if (params?.start_date) q.set('start_date', params.start_date)
  if (params?.end_date) q.set('end_date', params.end_date)
  const res = await fetch(`${BASE}/v1/benchmarks/${symbol}/equity-curve?${q}`)
  return handleRes<BenchmarkPoint[]>(res)
}
