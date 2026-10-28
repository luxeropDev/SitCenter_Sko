export type Role = 'observer' | 'operator' | 'admin'

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_at: string
  user: User
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface LatestValue {
  parameter: string
  value: number
  unit: string
  measured_at: string
  received_at: string
  age_seconds: number
  freshness: 'fresh' | 'aging' | 'stale'
}

export interface RiskSummary {
  risk_level: string
  score: number | null
  assessed_at: string | null
  explanation: Record<string, unknown> & { ru?: string; kk?: string }
}

export interface Thresholds {
  baseline_level_cm: number
  warning_level_cm: number
  critical_level_cm: number
  critical_rise_rate_cm_h: number
  critical_rainfall_mm_h: number
  soil_dry_pct: number
  soil_saturated_pct: number
}

export interface Station {
  id: number
  code: string
  name: string
  description: string
  latitude: number
  longitude: number
  source_type: 'simulator' | 'device'
  scenario: string
  status: 'online' | 'offline' | 'maintenance'
  parameters: string[]
  configuration: { thresholds?: Partial<Thresholds>; [k: string]: unknown }
  interval_seconds: number
  is_deleted: boolean
  created_at: string
  updated_at: string
  last_seen_at: string | null
  error_count: number
  last_error_at: string | null
  risk: RiskSummary | null
  latest: LatestValue[]
  active_alerts: number
  connection: 'connected' | 'delayed' | 'disconnected' | 'disabled' | 'unknown'
  latency_seconds: number | null
}

export interface Factor {
  key: string
  label: { ru: string; kk: string }
  value: number | null
  unit: string
  normalized: number | null
  weight: number
  contribution: number
  note: { ru: string; kk: string }
}

export interface Forecast {
  horizon_hours: number
  projected_level_cm: number
  lower_cm: number
  upper_cm: number
  method: string
  assumption: { ru: string; kk: string }
}

export interface RiskCurrent {
  risk_level: string
  score: number | null
  contributing_factors: Factor[]
  data_quality: { status: string; missing_parameters: string[]; freshness_seconds: number | null; stale_after_seconds: number; components_used?: string[] }
  explanation: { ru: string; kk: string }
  trend: { available: boolean; direction: string; slope_cm_h: number | null; consistency: number | null; accelerating: boolean; points: number }
  forecasts: Forecast[]
  algorithm_version: string
  disclaimer: { ru: string; kk: string }
}

export interface RiskResponse {
  station_id: number
  current: RiskCurrent
  thresholds: Thresholds
  stored: { assessed_at: string; risk_level: string; score: number | null } | null
  level_changes: { at: string; from: string | null; to: string; score: number | null }[]
  history: { assessed_at: string; risk_level: string; score: number | null }[]
}

export interface Alert {
  id: number
  station_id: number
  station_name: string | null
  station_code: string | null
  created_at: string
  updated_at: string
  severity: 'low' | 'medium' | 'high'
  event_type: string
  title: string
  description: string
  trigger_factors: { score?: number; risk_level?: string; factors?: Factor[]; explanation?: { ru: string; kk: string }; synthetic?: boolean; escalations?: { at: string; from: string; to: string; score: number }[] }
  status: 'new' | 'acknowledged' | 'resolved'
  acknowledged_by: number | null
  acknowledged_by_name: string | null
  acknowledged_at: string | null
  resolved_by: number | null
  resolved_by_name: string | null
  resolved_at: string | null
  resolution_note: string
  escalation_count: number
}

export interface SeriesPoint { t: string; v: number }
export interface TelemetrySeries {
  station_id: number
  parameter: string
  unit: string
  from_time: string
  to_time: string
  bucket_seconds: number | null
  points: SeriesPoint[]
  count_raw: number
}

export type MultiPoint = { t: string } & Record<string, number | string>

export interface DashboardSummary {
  generated_at: string
  system_status: string
  synthetic_data: boolean
  last_update_at: string | null
  counts: { stations_total: number; stations_active: number; stations_with_alerts: number; open_incidents: number; stations_offline: number; risk_high: number; risk_medium: number; risk_low: number; risk_unknown: number }
  stations: Station[]
  series: Record<string, MultiPoint[]>
  series_from: string
  recent_alerts: { id: number; station_id: number; station_name: string; severity: string; status: string; title: string; created_at: string; acknowledged_by_name: string | null }[]
  top_risk: { station_id: number; name: string; code: string; risk_level: string; score: number | null; connection: string }[]
  focus: { station_id: number; station_name: string; risk_level: string; score: number | null; explanation: { ru: string; kk: string; trend?: RiskCurrent['trend']; forecasts?: Forecast[] }; contributing_factors: Factor[]; data_quality: RiskCurrent['data_quality']; assessed_at: string; algorithm_version: string } | null
  freshness: { fresh: number; aging: number; stale: number; none: number }
  stale_after_seconds: number
  simulator: { state: string; scenario: string; driver: string; driver_alive: boolean; last_event_at: string | null; sent_count: number; interval_seconds: number }
  risk_thresholds: { medium: number; high: number }
}

export interface PeriodStats { from_time: string; to_time: string; alerts_total: number; alerts_high: number; max_score: number | null; avg_score: number | null; telemetry_count: number }

export interface HealthInfo { status: string; database: string; time: string; app: string; version: string; algorithm_version: string; env: string; simulator_mode: string; synthetic_data: boolean }

export interface AnalyticsOverview {
  from_time: string
  to_time: string
  bucket_seconds: number
  stations: { id: number; name: string; code: string; scenario: string }[]
  alerts_by_severity: Record<string, number>
  alerts_by_status: Record<string, number>
  risk_timeline: MultiPoint[]
  telemetry_series: Record<string, MultiPoint[]>
  units?: Record<string, string>
  top_stations: { station_id: number; name: string; max_score: number; avg_score: number }[]
  incident_history: { id: number; station_id: number; station_name: string; severity: string; status: string; title: string; created_at: string; acknowledged_at: string | null; resolved_at: string | null; resolved_by_name: string | null; escalation_count: number; duration_minutes: number | null }[]
  telemetry_count: number
  current_period?: PeriodStats | null
  previous_period?: PeriodStats | null
}

export interface SimulatorStatus {
  state: 'running' | 'paused' | 'stopped'
  scenario: string
  scenarios: string[]
  interval_seconds: number
  intensity: number
  time_acceleration: number
  seed: number
  tick: number
  sim_elapsed_seconds: number
  sent_count: number
  error_count: number
  last_event_at: string | null
  last_error: string
  driver: string
  driver_alive: boolean
  driver_heartbeat_at: string | null
  stations: { id: number; code: string; name: string; scenario: string; status: string; interval_seconds: number }[]
  synthetic: boolean
  mode: string
  updated_at: string
}

export interface SystemSettings {
  risk: { weights: Record<string, number>; thresholds: { medium: number; high: number }; stale_after_seconds: number; soil_stale_after_seconds: number; trend_window_points: number; trend_min_points: number; forecast_horizons_hours: number[] }
  alerts: { suppression_minutes: number; alert_on_medium: boolean; auto_resolve_after_minutes: number }
  ui_refresh_seconds: number
  updated_at: string | null
  algorithm_version: string
}

export interface AuditEntry {
  id: number
  actor_id: number | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
  details: Record<string, unknown>
}

export interface SystemHealth {
  api: { status: string; version: string; env: string; time: string }
  database: { status: string; driver: string; telemetry_rows: number; alerts: number }
  simulator: { mode: string; state: string; driver: string; driver_alive: boolean; last_event_at: string | null; error_count: number; last_error: string }
  sources: { station_id: number; code: string; name: string; status: string; connection: string; latency_seconds: number | null; last_seen_at: string | null; error_count: number; last_error_at: string | null; source_type: string }[]
}
