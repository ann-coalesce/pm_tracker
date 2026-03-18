export type PMStatus = 'pipeline' | 'onboarding' | 'active' | 'alumni' | 'inactive'

export interface SyncResult {
  inserted: number
  updated: number
  skipped: number
  warnings: string[]
}

export interface PM {
  id: string
  name: string
  status: PMStatus
  strategy_type: string | null
  style: string | null
  exposure_profile: string | null
  trading_horizon: string | null
  exchanges: string[] | null
  leverage_target: number | null
  max_capacity: number | null
  current_aum: number
  gp_commitment: number | null
  contact_name: string | null
  contact_email: string | null
  contact_telegram: string | null
  nav_table_key: string | null
  created_at: string
  updated_at: string | null
  sparkline?: { date: string; nav: number }[]
  metrics?: PMMetrics | null
}

export interface PMMetrics {
  total_return: number | null
  cagr: number | null
  ann_volatility: number | null
  ann_downside_volatility: number | null
  sharpe_ratio: number | null
  sortino_ratio: number | null
  calmar_ratio: number | null
  max_drawdown: number | null
  max_drawdown_duration_days: number | null
  current_drawdown: number | null
  win_rate: number | null
  avg_win: number | null
  avg_loss: number | null
  track_record_days: number | null
  track_record_start: string | null
  track_record_end: string | null
  // leverage-normalised (std) metrics
  std_total_return: number | null
  std_cagr: number | null
  std_ann_volatility: number | null
  std_ann_downside_volatility: number | null
  std_sharpe_ratio: number | null
  std_sortino_ratio: number | null
  std_calmar_ratio: number | null
  std_max_drawdown: number | null
  std_max_drawdown_duration_days: number | null
  std_current_drawdown: number | null
}

export interface EquityCurvePoint {
  date: string
  nav: number
  std_nav: number
}

export interface PMStatusLog {
  id: string
  pm_id: string
  from_status: string | null
  to_status: string
  changed_by: string
  changed_at: string
  reason: string | null
}

export interface ReturnSource {
  id: string
  pm_id: string
  start_date: string
  end_date: string | null
  source_type: 'self_reported' | 'internal_nav' | 'exchange_api'
  source_ref: string | null
  note: string | null
}

export interface LeverageHistory {
  id: string
  pm_id: string
  start_date: string
  end_date: string | null
  leverage: number
  created_at: string | null
}

export interface UploadResult {
  inserted: number
  skipped: number
  warnings: string[]
  errors: string[]
}

export interface PMCreate {
  name: string
  status?: PMStatus
  strategy_type?: string
  style?: string
  exposure_profile?: string
  trading_horizon?: string
  leverage_target?: number
  max_capacity?: number
  current_aum?: number
  gp_commitment?: number
  exchanges?: string[]
  contact_name?: string
  contact_email?: string
  contact_telegram?: string
  nav_table_key?: string
}

export type PMUpdate = Partial<PMCreate>

export interface PMStatusUpdate {
  to_status: PMStatus
  changed_by: string
  reason?: string
}
