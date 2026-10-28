import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, Pause, Play, RotateCcw, Square, Zap, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, NativeSelect } from '@/components/ui/input'
import { Badge, StatusIndicator } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ErrorState, PageHeader, RiskBadge, SyntheticBanner } from '@/components/common'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { SERIES_COLORS } from '@/lib/chartColors'
import { ActivityFeed } from '@/pages/Overview'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useRefreshMs } from '@/lib/useRefresh'
import { cn, fmtAgo, fmtDateTime, fmtNum } from '@/lib/utils'
import type { SimulatorStatus } from '@/lib/types'

const SCENARIOS = ['NORMAL', 'RISING_WATER', 'RAPID_FLOOD'] as const
type Params = { scenario: string; intensity: string; interval: string; accel: string; seed: string }

function validate(p: Params) {
  const e: Partial<Record<keyof Params, string>> = {}
  const n = (v: string) => Number(v)
  if (!(n(p.intensity) >= 0.1 && n(p.intensity) <= 3)) e.intensity = '0.1 – 3'
  if (!(n(p.interval) >= 0.5 && n(p.interval) <= 600)) e.interval = '0.5 – 600'
  if (!(n(p.accel) >= 0.1 && n(p.accel) <= 60)) e.accel = '0.1 – 60'
  if (!(Number.isInteger(n(p.seed)) && n(p.seed) >= 0)) e.seed = '≥ 0'
  return e
}

function Controls({ data, refresh, canControl }: { data: SimulatorStatus; refresh: () => void; canControl: boolean }) {
  const { t } = useI18n()
  const [p, setP] = useState<Params>(() => ({ scenario: data.scenario, intensity: String(data.intensity), interval: String(data.interval_seconds), accel: String(data.time_acceleration), seed: String(data.seed) }))
  const [busy, setBusy] = useState<string | null>(null)
  const errors = validate(p)
  const valid = Object.keys(errors).length === 0
  const body = useMemo(() => ({ scenario: p.scenario, intensity: Number(p.intensity), interval_seconds: Number(p.interval), time_acceleration: Number(p.accel), seed: Number(p.seed) }), [p])
  const [previewNow] = useState(() => Date.now())
  const preview = usePolling((s) => api.simulator.preview({ scenario: p.scenario, intensity: valid ? body.intensity : 1, seed: valid ? body.seed : 42, minutes: 120 }, s), 0, [p.scenario, valid ? body.intensity : 1, valid ? body.seed : 42])
  const previewData = useMemo(() => (preview.data?.points ?? []).map((pt) => ({ t: new Date(previewNow + pt.t_sec * 1000).toISOString(), level: pt.water_level_cm, rain: pt.rainfall_mm_h })), [preview.data, previewNow])

  const run = async (name: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(name)
    try { await fn(); if (ok) toast.success(ok); refresh() } catch (e) { toast.error(e instanceof ApiError ? e.message : String(e)) } finally { setBusy(null) }
  }
  const set = (k: keyof Params, v: string) => setP((s) => ({ ...s, [k]: v }))

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('sim_scenario')}>
        {SCENARIOS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={p.scenario === s} onClick={() => set('scenario', s)} disabled={!canControl} className={cn('rounded-lg border p-3.5 text-left transition-[border-color,background-color] duration-(--duration-fast) disabled:opacity-60', p.scenario === s ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}>
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Zap className={cn('size-4', s === 'RAPID_FLOOD' ? 'text-risk-high' : s === 'RISING_WATER' ? 'text-risk-medium' : 'text-risk-low')} aria-hidden />{t((`scenario_${s}` as TKey))}</p>
            <p className="mt-1 text-xs text-fg-subtle">{t((`scenario_desc_${s}` as TKey))}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t('sim_intensity')} htmlFor="sim-int" hint="0.1 – 3" error={errors.intensity}><Input id="sim-int" inputMode="decimal" value={p.intensity} onChange={(e) => set('intensity', e.target.value)} disabled={!canControl} invalid={!!errors.intensity} /></Field>
        <Field label={t('sim_interval')} htmlFor="sim-iv" hint="0.5 – 600" error={errors.interval}><Input id="sim-iv" inputMode="decimal" value={p.interval} onChange={(e) => set('interval', e.target.value)} disabled={!canControl} invalid={!!errors.interval} /></Field>
        <Field label={t('sim_accel')} htmlFor="sim-acc" hint="0.1 – 60" error={errors.accel}><Input id="sim-acc" inputMode="decimal" value={p.accel} onChange={(e) => set('accel', e.target.value)} disabled={!canControl} invalid={!!errors.accel} /></Field>
        <Field label={t('sim_seed')} htmlFor="sim-seed" hint={t('sim_seed_hint')} error={errors.seed}><Input id="sim-seed" inputMode="numeric" value={p.seed} onChange={(e) => set('seed', e.target.value)} disabled={!canControl} invalid={!!errors.seed} /></Field>
      </div>
      {canControl ? (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" loading={busy === 'start'} disabled={(data.state === 'running') || !valid} onClick={() => run('start', () => api.simulator.start(body), t('sim_started_ok'))}><Play />{data.state === 'paused' ? t('sim_resume') : t('sim_start')}</Button>
          <Button size="lg" variant="secondary" loading={busy === 'pause'} disabled={data.state !== 'running'} onClick={() => run('pause', () => api.simulator.pause(), t('sim_paused_ok'))}><Pause />{t('sim_pause')}</Button>
          <Button size="lg" variant="secondary" loading={busy === 'stop'} disabled={data.state === 'stopped'} onClick={() => run('stop', () => api.simulator.stop(), t('sim_stopped_ok'))}><Square />{t('sim_stop')}</Button>
          <Button size="lg" variant="outline" loading={busy === 'reset'} onClick={() => run('reset', () => api.simulator.reset(), t('sim_reset_ok'))}><RotateCcw />{t('sim_reset')}</Button>
          <Button size="lg" variant="soft" className="sm:ml-auto" loading={busy === 'scenario'} disabled={!valid} onClick={() => run('scenario', () => api.simulator.scenario(body), t('sim_scenario_ok'))}>{t('sim_apply')} · {t('sim_apply_all')}</Button>
        </div>
      ) : <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-subtle">{t('sim_no_permission')}</p>}
      <div>
        <p className="mb-1 text-xs font-medium text-fg-muted">{t('sim_preview')}</p>
        <TimeSeriesChart data={previewData} series={[{ key: 'level', name: t('param_water_level_cm'), color: SERIES_COLORS[0], unit: 'cm' }, { key: 'rain', name: t('param_rainfall_mm_h'), color: SERIES_COLORS[5], dashed: true, yAxisId: 'right', unit: 'mm/h' }]} unit="cm" unitRight="mm/h" height={200} />
      </div>
    </div>
  )
}

export function SimulatorPanel() {
  const { t, lang } = useI18n()
  const { hasRole } = useAuth()
  const canControl = hasRole('operator', 'admin')
  const refreshMs = useRefreshMs()
  const { data, error, loading, refresh } = usePolling((s) => api.simulator.status(s), 3000)
  const dash = usePolling((s) => api.dashboard(s), refreshMs)
  const events = usePolling((s) => api.events({ entity_type: 'simulator', limit: 15 }, s), refreshMs)
  const [busyStation, setBusyStation] = useState<number | null>(null)

  const stationSeries = useMemo(() => (dash.data?.stations ?? []).filter((s) => !s.is_deleted && s.source_type === 'simulator').map((s, i) => ({ key: `s${s.id}`, name: s.name, color: SERIES_COLORS[i % SERIES_COLORS.length], unit: 'cm' })), [dash.data?.stations])
  const topRisk = dash.data?.top_risk?.[0]

  if (loading && !data) return <div className="grid gap-4 lg:grid-cols-3" aria-busy><Skeleton className="h-80" /><Skeleton className="h-80 lg:col-span-2" /></div>
  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />
  if (!data) return null
  const alive = data.driver_alive
  const stateTone = data.state === 'running' ? (alive ? 'low' : 'medium') : data.state === 'paused' ? 'medium' : 'unknown'
  const modeOff = data.mode === 'off'

  const setStationScenario = async (id: number, v: string) => {
    setBusyStation(id)
    try { await api.simulator.scenario({ scenario: v, station_ids: [id] }); toast.success(t('sim_scenario_ok')); refresh() } catch (e) { toast.error(e instanceof ApiError ? e.message : String(e)) } finally { setBusyStation(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      {modeOff ? <div className="rounded-md border border-risk-medium/40 bg-risk-medium-soft px-3 py-2 text-xs text-risk-medium" role="alert">{t('sim_mode_off')}</div> : null}
      {data.state === 'running' && !alive ? <div className="rounded-md border border-risk-medium/40 bg-risk-medium-soft px-3 py-2 text-xs text-risk-medium" role="alert">{t('sim_driver_dead_hint')}</div> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t('sim_state')}</CardTitle><CardDescription>{t('sim_driver')}: {data.driver} · {data.mode}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={stateTone} size="md">{t((`sim_${data.state}` as TKey))}</Badge>
              <Badge variant="accent" size="md">{t((`scenario_${data.scenario}` as TKey))}</Badge>
              <StatusIndicator tone={alive ? 'low' : 'high'} label={alive ? t('sim_driver_alive') : t('sim_driver_dead')} pulse={alive && data.state === 'running'} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-fg-subtle">{t('sim_tick')}</dt><dd className="tnum font-medium">{data.tick}</dd>
              <dt className="text-fg-subtle">{t('sim_sent')}</dt><dd className="tnum font-medium">{data.sent_count}</dd>
              <dt className="text-fg-subtle">{t('sim_last_event')}</dt><dd className="tnum text-xs">{data.last_event_at ? <span title={fmtDateTime(data.last_event_at)}>{fmtAgo(data.last_event_at, lang)}</span> : '—'}</dd>
              <dt className="text-fg-subtle">{t('sim_model_time')}</dt><dd className="tnum">×{data.time_acceleration} · {fmtNum(data.sim_elapsed_seconds / 60, 0)} {t('minutes_short')}</dd>
              <dt className="text-fg-subtle">{t('sim_interval')}</dt><dd className="tnum">{data.interval_seconds} {t('seconds_short')}</dd>
              <dt className="text-fg-subtle">{t('sim_errors')}</dt><dd className={cn('tnum', data.error_count && 'text-risk-high')}>{data.error_count}</dd>
            </dl>
            {data.last_error ? <p className="rounded-md bg-risk-high-soft/50 px-2.5 py-1.5 text-[11px] text-risk-high">{data.last_error.slice(0, 160)}</p> : null}
            {topRisk ? (
              <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t('sim_current_risk')}</p>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{topRisk.name}</span><RiskBadge level={topRisk.risk_level} score={topRisk.score} /></div>
                <Button variant="link" size="sm" asChild className="mt-1 h-auto"><Link to={`/stations/${topRisk.station_id}`}>{t('sim_to_station')}<ArrowRight className="size-3.5" /></Link></Button>
              </div>
            ) : null}
            <SyntheticBanner />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t('sim_scenario')}</CardTitle><CardDescription>{t('demo_hint')}</CardDescription></CardHeader>
          <CardContent><Controls key={`${data.scenario}-${data.seed}`} data={data} refresh={refresh} canControl={canControl && !modeOff} /></CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartContainer className="lg:col-span-2" title={t('sim_live_chart')} description={`${t('chart_water_level_60')} · ${t('sim_live_chart_hint')}`}>
          {dash.loading && !dash.data ? <Skeleton className="h-56" /> : <TimeSeriesChart data={dash.data?.series.water_level_cm ?? []} series={stationSeries} unit="cm" height={240} emptyText={t('sim_no_live_data')} />}
        </ChartContainer>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-fg-subtle" />{t('sim_journal')}</CardTitle><CardDescription>{t('sim_journal_hint')}</CardDescription></CardHeader>
          <CardContent className="px-2 pb-2"><ActivityFeed events={events.data} loading={events.loading} limit={10} /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('sim_station_scenarios')}</CardTitle><CardDescription>{t('sim_station_scenarios_hint')}</CardDescription></CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.stations.map((s) => (
              <li key={s.id} className={cn('flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm', s.status !== 'online' && 'opacity-60')}>
                <div className="min-w-0 flex-1"><Link to={`/stations/${s.id}`} className="block truncate font-medium hover:text-accent">{s.name}</Link><p className="text-[11px] text-fg-subtle">{s.code} · {t((`status_${s.status}` as TKey))}{s.status !== 'online' ? ` · ${t('sim_station_skipped')}` : ''}</p></div>
                <NativeSelect aria-label={s.name} className="h-control-sm text-xs" value={s.scenario} disabled={!canControl || busyStation === s.id || modeOff} onChange={(e) => void setStationScenario(s.id, e.target.value)}>
                  {SCENARIOS.map((sc) => <option key={sc} value={sc}>{t((`scenario_${sc}` as TKey))}</option>)}
                </NativeSelect>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Simulator() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('sim_title')} subtitle={t('sim_subtitle')} actions={<SyntheticBanner compact />} />
      <SimulatorPanel />
    </div>
  )
}
