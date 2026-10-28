import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, Clock, Map as MapIcon, Radio, ShieldAlert, Activity, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { AlertStatusBadge, ChartContainer, ConnectionDot, EmptyState, ErrorState, PageHeader, RiskBadge, RiskExplanation, SeverityBadge, StatCard, SyntheticBanner } from '@/components/common'
import { StationMap } from '@/components/StationMap'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { SERIES_COLORS } from '@/lib/chartColors'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useRefreshMs } from '@/lib/useRefresh'
import { cn, fmtAgo, fmtDateTime, fmtTime, riskOrder } from '@/lib/utils'
import type { AuditEntry } from '@/lib/types'

function useRiskFlash(level?: string | null) {
  const prev = useRef(level)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (prev.current && level && (riskOrder[level] ?? 0) > (riskOrder[prev.current] ?? 0)) { setFlash(true); const id = setTimeout(() => setFlash(false), 1300); return () => clearTimeout(id) }
    prev.current = level
  }, [level])
  return flash
}

export function ActivityFeed({ events, loading, limit = 8 }: { events: AuditEntry[] | null; loading: boolean; limit?: number }) {
  const { t, lang } = useI18n()
  if (loading && !events) return <div className="flex flex-col gap-2 p-2"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
  if (!events?.length) return <EmptyState title={t('empty')} compact />
  return (
    <ol className="flex flex-col">
      {events.slice(0, limit).map((e) => {
        const label = t((`event_${e.action.replace('.', '_')}` as TKey))
        const tone = e.action.startsWith('alert.created') || e.action.startsWith('alert.escalated') ? 'high' : e.action.startsWith('alert.') ? 'accent' : e.action.startsWith('simulator.') ? 'medium' : 'default'
        const to = e.entity_type === 'alert' && e.entity_id ? `/alerts/${e.entity_id}` : e.entity_type === 'station' && e.entity_id ? `/stations/${e.entity_id}` : e.entity_type === 'simulator' ? '/simulator' : undefined
        const body = (
          <>
            <Badge variant={tone} className="mt-0.5 shrink-0">{label === `event_${e.action.replace('.', '_')}` ? e.action : label}</Badge>
            <span className="min-w-0 flex-1 text-xs">
              <span className="block truncate text-fg">{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ''}{e.details && typeof e.details.score === 'number' ? ` · ${t('score')} ${Math.round(e.details.score as number)}` : ''}{e.details && typeof e.details.scenario === 'string' ? ` · ${t((`scenario_${e.details.scenario}` as TKey))}` : ''}</span>
              <span className="block text-fg-subtle">{e.actor_name} · {fmtAgo(e.created_at, lang)}</span>
            </span>
          </>
        )
        return (
          <li key={e.id}>
            {to ? <Link to={to} className="flex items-start gap-2.5 rounded-md px-3 py-2 hover:bg-surface-2">{body}</Link> : <div className="flex items-start gap-2.5 px-3 py-2">{body}</div>}
          </li>
        )
      })}
    </ol>
  )
}

export default function Overview() {
  const { t, lang } = useI18n()
  const { hasRole } = useAuth()
  const refreshMs = useRefreshMs()
  const { data, error, loading, refresh, lastSuccess } = usePolling((s) => api.dashboard(s), refreshMs)
  const events = usePolling((s) => api.events({ limit: 12 }, s), refreshMs)
  const [selected, setSelected] = useState<number | null>(null)
  const flash = useRiskFlash(data?.focus?.risk_level)

  const stationSeries = useMemo(() => (data?.stations ?? []).filter((s) => !s.is_deleted).map((s, i) => ({ key: `s${s.id}`, name: s.name, color: SERIES_COLORS[i % SERIES_COLORS.length] })), [data?.stations])
  const stationsByRisk = useMemo(() => [...(data?.stations ?? [])].sort((a, b) => (riskOrder[b.risk?.risk_level ?? ''] ?? 0) - (riskOrder[a.risk?.risk_level ?? ''] ?? 0) || (b.risk?.score ?? 0) - (a.risk?.score ?? 0)), [data?.stations])
  const rainRate = useMemo(() => mergeSeries(data?.series.rainfall_mm_h ?? [], data?.series.water_level_rate_cm_h ?? [], stationSeries.map((s) => s.key)), [data?.series, stationSeries])

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-5" aria-busy>
        <Skeleton className="h-9 w-80" /><Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px]" />)}</div>
        <div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-[440px] xl:col-span-2" /><Skeleton className="h-[440px]" /></div>
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    )
  }
  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />
  if (!data) return null

  const c = data.counts
  const fr = data.freshness
  const freshTone = fr.stale + fr.none > 0 ? 'high' : fr.aging > 0 ? 'medium' : 'low'
  const sim = data.simulator
  const simLive = sim.state === 'running' && sim.driver_alive

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('overview_title')}
        subtitle={<>{t('overview_subtitle')} <span className="tnum text-fg-muted">· {t('last_update')} {fmtTime(data.last_update_at)}{lastSuccess ? ` (${t('ui_polled')} ${fmtTime(lastSuccess.toISOString())})` : ''}</span></>}
        eyebrow={<><Badge variant={simLive ? 'low' : 'default'}><Activity className="size-3" />{t('sim_title')}: {t((`sim_${sim.state}` as TKey))}{simLive ? ` · ${t((`scenario_${sim.scenario}` as TKey))}` : ''}</Badge><SyntheticBanner compact /></>}
        actions={<>
          {hasRole('operator', 'admin') && !simLive ? <Button variant="secondary" asChild><Link to="/simulator"><Play />{t('overview_start_demo')}</Link></Button> : null}
          <Button asChild><Link to="/map"><MapIcon />{t('go_to_map')}</Link></Button>
        </>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('kpi_section')}>
        <StatCard icon={Radio} label={t('kpi_active_stations')} value={c.stations_active} sub={`${t('kpi_of_total', { n: c.stations_total })}${c.stations_offline ? ` · ${t('kpi_no_data', { n: c.stations_offline })}` : ''}`} tone="accent" to="/stations?status=online" />
        <StatCard icon={ShieldAlert} label={t('kpi_high_risk')} value={c.risk_high} sub={`${t('kpi_medium')}: ${c.risk_medium} · ${t('kpi_low')}: ${c.risk_low}${c.risk_unknown ? ` · ${t('risk_unknown').toLowerCase()}: ${c.risk_unknown}` : ''}`} tone={c.risk_high > 0 ? 'high' : c.risk_medium > 0 ? 'medium' : 'low'} to="/map?risk=high" />
        <StatCard icon={Bell} label={t('kpi_open_alerts')} value={c.open_incidents} sub={`${t('kpi_with_alerts')}: ${c.stations_with_alerts}`} tone={c.open_incidents > 0 ? 'medium' : 'low'} to="/alerts?status=new" />
        <StatCard icon={Clock} label={t('kpi_freshness')} value={`${fr.fresh}/${fr.fresh + fr.aging + fr.stale + fr.none}`} sub={`${t('fresh_fresh')}: ${fr.fresh} · ${t('fresh_aging')}: ${fr.aging} · ${t('fresh_stale')}: ${fr.stale + fr.none}`} tone={freshTone} to="/stations?sort=last_seen_at&order=desc" hint={t('kpi_freshness_hint', { s: Math.round(data.stale_after_seconds / 60) })} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>{t('map_title')}</CardTitle><CardDescription>{t('map_subtitle')}</CardDescription></div>
            <Link to="/map" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">{t('view_all')}<ArrowRight className="size-3.5" /></Link>
          </CardHeader>
          <CardContent><StationMap stations={data.stations} height="clamp(320px, 48vh, 520px)" selectedId={selected} onSelect={setSelected} /></CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex-1">
            <CardHeader><CardTitle>{t('top_risk')}</CardTitle></CardHeader>
            <CardContent className="px-2 pb-2">
              <ul className="flex flex-col">
                {stationsByRisk.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link to={`/stations/${s.id}`} onMouseEnter={() => setSelected(s.id)} className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2', selected === s.id && 'bg-surface-2')}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <ConnectionDot connection={s.connection} latency={s.latency_seconds} />
                      </div>
                      <RiskBadge level={s.risk?.risk_level} score={s.risk?.score} />
                      <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className={cn('flex-1', flash && 'animate-risk-flash')}>
            <CardHeader>
              <CardTitle>{t('risk_explanation')}</CardTitle>
              {data.focus ? <CardDescription><Link to={`/stations/${data.focus.station_id}`} className="text-accent hover:underline">{data.focus.station_name}</Link></CardDescription> : null}
            </CardHeader>
            <CardContent>
              {data.focus ? (
                <RiskExplanation level={data.focus.risk_level} score={data.focus.score} explanation={data.focus.explanation} factors={data.focus.contributing_factors} trend={data.focus.explanation.trend} forecasts={data.focus.explanation.forecasts} quality={data.focus.data_quality} assessedAt={data.focus.assessed_at} version={data.focus.algorithm_version} />
              ) : <EmptyState title={t('explain_none')} compact />}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartContainer title={t('chart_water_level_60')} description={`cm · ${stationSeries.length} ${t('nav_stations').toLowerCase()}`}>
          <TimeSeriesChart data={data.series.water_level_cm ?? []} series={stationSeries} unit="cm" height={260} />
        </ChartContainer>
        <ChartContainer title={t('chart_rain_rate')} description={`mm/h (${t('line_solid')}) · cm/h (${t('line_dashed')})`}>
          <TimeSeriesChart
            data={rainRate}
            series={[...stationSeries.map((s) => ({ key: `${s.key}_rain`, name: `${s.name} · mm/h`, color: s.color, unit: 'mm/h' })), ...stationSeries.map((s) => ({ key: `${s.key}_rate`, name: `${s.name} · cm/h`, color: s.color, dashed: true, yAxisId: 'right' as const, unit: 'cm/h' }))]}
            unit="mm/h" unitRight="cm/h" height={260}
          />
        </ChartContainer>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>{t('recent_alerts')}</CardTitle><Link to="/alerts" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">{t('view_all')}<ArrowRight className="size-3.5" /></Link></CardHeader>
          <CardContent className="px-2 pb-2">
            {data.recent_alerts.length === 0 ? <EmptyState title={t('alerts_none')} text={t('alerts_none_text')} compact /> : (
              <ul className="flex flex-col">
                {data.recent_alerts.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link to={`/alerts/${a.id}`} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2">
                      <SeverityBadge severity={a.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.station_name}</p>
                        <p className="text-[11px] text-fg-subtle tnum">{fmtDateTime(a.created_at)} · {fmtAgo(a.created_at, lang)}</p>
                      </div>
                      <AlertStatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('activity_feed')}</CardTitle><CardDescription>{t('activity_feed_hint')}</CardDescription></CardHeader>
          <CardContent className="px-2 pb-2"><ActivityFeed events={events.data} loading={events.loading} /></CardContent>
        </Card>
      </section>
    </div>
  )
}

function mergeSeries(a: { t: string; [k: string]: unknown }[], b: { t: string; [k: string]: unknown }[], keys: string[]) {
  const map = new Map<string, Record<string, unknown>>()
  for (const p of a) { const row = map.get(p.t) ?? { t: p.t }; for (const k of keys) if (p[k] !== undefined) row[`${k}_rain`] = p[k]; map.set(p.t, row) }
  for (const p of b) { const row = map.get(p.t) ?? { t: p.t }; for (const k of keys) if (p[k] !== undefined) row[`${k}_rate`] = p[k]; map.set(p.t, row) }
  return [...map.values()].sort((x, y) => String(x.t).localeCompare(String(y.t)))
}
