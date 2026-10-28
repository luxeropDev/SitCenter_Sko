import type {
  Alert, AnalyticsOverview, AuditEntry, DashboardSummary, HealthInfo, Page, RiskResponse, SimulatorStatus, Station, SystemHealth, SystemSettings,
  TelemetrySeries, TokenResponse, User,
} from './types'

export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const TOKEN_KEY = 'urpaq.token'
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn)
  return () => { unauthorizedListeners.delete(fn) }
}

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch { /* ignore */ }
  },
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
  auth?: boolean
}

function buildQuery(q?: RequestOptions['query']): string {
  if (!q) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenStore.get()
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'Нет соединения с сервером')
  }
  if (res.status === 204) return undefined as T
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    const apiErr = new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? res.statusText, err?.details)
    if (res.status === 401 && opts.auth !== false && !path.startsWith('/auth/login')) unauthorizedListeners.forEach((fn) => fn())
    throw apiErr
  }
  return data as T
}

export const api = {
  health: () => request<HealthInfo>('/health', { auth: false }),
  events: (query?: RequestOptions['query'], signal?: AbortSignal) => request<AuditEntry[]>('/events/recent', { query, signal }),
  auth: {
    login: (username: string, password: string) => request<TokenResponse>('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
    me: () => request<User>('/auth/me'),
    logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  },
  dashboard: (signal?: AbortSignal) => request<DashboardSummary>('/dashboard/summary', { signal }),
  stations: {
    list: (query?: RequestOptions['query'], signal?: AbortSignal) => request<Page<Station>>('/stations', { query, signal }),
    get: (id: number, signal?: AbortSignal) => request<Station>(`/stations/${id}`, { signal }),
    create: (body: unknown) => request<Station>('/stations', { method: 'POST', body }),
    update: (id: number, body: unknown) => request<Station>(`/stations/${id}`, { method: 'PATCH', body }),
    remove: (id: number, hard = false) => request<{ message: string; details: Record<string, unknown> }>(`/stations/${id}`, { method: 'DELETE', query: { hard } }),
    restore: (id: number) => request<Station>(`/stations/${id}/restore`, { method: 'POST' }),
    telemetry: (id: number, query: RequestOptions['query'], signal?: AbortSignal) => request<TelemetrySeries>(`/stations/${id}/telemetry`, { query, signal }),
    risk: (id: number, signal?: AbortSignal) => request<RiskResponse>(`/stations/${id}/risk`, { signal }),
    alerts: (id: number, signal?: AbortSignal) => request<Alert[]>(`/stations/${id}/alerts`, { signal }),
  },
  telemetry: {
    latest: (signal?: AbortSignal) => request<{ items: unknown[] }>('/telemetry/latest', { signal }),
  },
  alerts: {
    list: (query?: RequestOptions['query'], signal?: AbortSignal) => request<Page<Alert>>('/alerts', { query, signal }),
    counts: (signal?: AbortSignal) => request<{ by_status: Record<string, number>; active_by_severity: Record<string, number> }>('/alerts/counts', { signal }),
    get: (id: number, signal?: AbortSignal) => request<Alert>(`/alerts/${id}`, { signal }),
    acknowledge: (id: number) => request<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
    resolve: (id: number, note: string) => request<Alert>(`/alerts/${id}/resolve`, { method: 'POST', body: { note } }),
  },
  analytics: (query: RequestOptions['query'], signal?: AbortSignal) => request<AnalyticsOverview>('/analytics/overview', { query, signal }),
  simulator: {
    status: (signal?: AbortSignal) => request<SimulatorStatus>('/simulator/status', { signal, auth: false }),
    start: (body: unknown) => request<SimulatorStatus>('/simulator/start', { method: 'POST', body }),
    pause: () => request<SimulatorStatus>('/simulator/pause', { method: 'POST' }),
    stop: () => request<SimulatorStatus>('/simulator/stop', { method: 'POST' }),
    reset: () => request<SimulatorStatus>('/simulator/reset', { method: 'POST' }),
    scenario: (body: unknown) => request<SimulatorStatus>('/simulator/scenario', { method: 'POST', body }),
    preview: (query: RequestOptions['query'], signal?: AbortSignal) => request<{ points: Record<string, number>[] }>('/simulator/preview', { query, signal }),
  },
  admin: {
    users: (query?: RequestOptions['query'], signal?: AbortSignal) => request<Page<User>>('/admin/users', { query, signal }),
    createUser: (body: unknown) => request<User>('/admin/users', { method: 'POST', body }),
    updateUser: (id: number, body: unknown) => request<User>(`/admin/users/${id}`, { method: 'PATCH', body }),
    settings: (signal?: AbortSignal) => request<SystemSettings>('/admin/settings', { signal }),
    updateSettings: (body: unknown) => request<SystemSettings>('/admin/settings', { method: 'PATCH', body }),
    health: (signal?: AbortSignal) => request<SystemHealth>('/admin/health', { signal }),
  },
  audit: (query?: RequestOptions['query'], signal?: AbortSignal) => request<Page<AuditEntry>>('/audit-log', { query, signal }),
}
