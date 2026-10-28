import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, MapPin, Pencil, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SegmentedControl } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable, type Column } from '@/components/ui/table'
import { AlertStatusBadge, ChartContainer, ConnectionDot, EmptyState, ErrorState, PageHeader, RiskBadge, RiskExplanation, SeverityBadge, StatusBadge, SyntheticBanner } from '@/components/common'
import { StationMap } from '@/components/StationMap'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { PARAM_COLORS } from '@/lib/chartColors'
import { StationFormDialog } from '@/components/StationForm'
import { AlertDialog } from '@/pages/Alerts'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useRefreshMs } from '@/lib/useRefresh'
import { useUrlState } from '@/lib/useUrlState'
import { downloadCsv, toCsv } from '@/lib/csv'
import { cn, fmtAgo, fmtDateTime, fmtNum } from '@/lib/utils'
import type { Alert } from '@/lib/types'

const RANGES: { key: TKey; minutes: number }[] = [{ key: 'range_15m', minutes: 15 }, { key: 'range_1h', minutes: 60 }, { key: 'range_6h', minutes: 360 }, { key: 'range_24h', minutes: 1440 }, { key: 'range_7d', minutes: 10080 }]
const CHART_PARAMS = ['water_level_cm', 'rainfall_mm_h', 'water_level_rate_cm_h', 'soil_moisture_pct'] as const
const DEFAULTS = { range: '60' }

export default function StationDetails() {
  const { id } = useParams()
  const sid = Number(id)
  const { t, lang, pick } = useI18n()
  const { hasRole } = useAuth()
  const refreshMs = useRefreshMs()
  const [f, setF] = useUrlState(DEFAULTS)
  const rangeMin = RANGES.some((r) => String(r.minutes) === f.range) ? Number(f.range) : 60
  const [edit, setEdit] = useState(false)
  const [openAlert, setOpenAlert] = useState<number | null>(null)

  const station = usePolling((s) => api.stations.get(sid, s), refreshMs, [sid])
  const risk = usePolling((s) => api.stations.risk(sid, s), refreshMs, [sid])
  const alerts = usePolling((s) => api.stations.alerts(sid, s), refreshMs, [sid])
  const rangeKey = `${sid}:${rangeMin}`
  const series = usePolling(async (s) => {
    const to = new Date()
    const from = new Date(to.getTime() - rangeMin * 60000)
    const bucket = rangeMin <= 60 ? undefined : rangeMin <= 360 ? 60 : rangeMin <= 1440 ? 300 : 1800
    const res = await Promise.all(CHART_PARAMS.map((p) => api.stations.telemetry(sid, { parameter: p, from: from.toISOString(), to: to.toISOString(), bucket_seconds: bucket }, s)))
    return Object.fromEntries(res.map((r) => [r.parameter, r]))
  }, refreshMs, [rangeKey])

  const thresholds = risk.data?.thresholds
  const refLines = useMemo(() => thresholds ? [
    { y: thresholds.critical_level_cm, label: t('threshold_critical'), color: 'var(--risk-high)' },
    { y: thresholds.warning_level_cm, label: t('threshold_warning'), color: 'var(--risk-medium)' },
    { y: thresholds.baseline_level_cm, label: t('threshold_baseline'), color: 'var(--fg-subtle)' },
  ] : undefined, [thresholds, t])

  if (station.loading && !station.data) return <div className="flex flex-col gap-4" aria-busy><Skeleton className="h-9 w-80" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-48 lg:col-span-2" /><Skeleton className="h-48" /></div><Skeleton className="h-80" /></div>
  if (station.error && !station.data) return <ErrorState message={station.error.message} onRetry={station.refresh} />
  const s = station.data
  if (!s) return null
  const cur = risk.data?.current

  const exportCsv = () => {
    const rows: (string | number)[][] = []
    for (const [p, ser] of Object.entries(series.data ?? {})) for (const pt of ser.points) rows.push([s.code, p, ser.unit, pt.t, pt.v])
    downloadCsv(`telemetry-${s.code}-${rangeMin}m.csv`, toCsv(['station', 'parameter', 'unit', 'measured_at', 'value'], rows))
    toast.success(t('export_done', { n: rows.length }))
  }

  const alertCols: Column<Alert>[] = [
    { key: 'sev', header: t('alert_severity'), mobile: 'meta', cell: (a) => <SeverityBadge severity={a.severity} /> },
    { key: 'title', header: t('alert_title'), mobile: 'title', cell: (a) => <span className="line-clamp-1 text-sm font-medium">{a.title}</span> },
    { key: 'created', header: t('alert_created'), className: 'tnum text-xs text-fg-muted whitespace-nowrap', mobile: 'row', cell: (a) => fmtDateTime(a.created_at) },
    { key: 'status', header: t('alert_status'), mobile: 'row', cell: (a) => <AlertStatusBadge status={a.status} /> },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        breadcrumbs={[{ label: t('nav_stations'), to: '/stations' }, { label: s.name }]}
        title={s.name}
        subtitle={`${s.code} · ${t((`source_${s.source_type}` as TKey))} · ${t((`scenario_${s.scenario}` as TKey))}${s.description ? ` · ${s.description}` : ''}`}
        eyebrow={<><RiskBadge level={cur?.risk_level ?? s.risk?.risk_level} score={cur?.score ?? s.risk?.score} size="md" /><StatusBadge status={s.status} /><ConnectionDot connection={s.connection} latency={s.latency_seconds} /></>}
        actions={<><SyntheticBanner compact /><Button variant="secondary" asChild><Link to={`/map?station=${s.id}`}><MapPin />{t('nav_map')}</Link></Button>{hasRole('admin') ? <Button variant="secondary" onClick={() => setEdit(true)}><Pencil />{t('station_edit')}</Button> : null}</>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t('details_current')}</CardTitle><CardDescription className="flex flex-wrap gap-x-3 gap-y-1 tnum"><span><MapPin className="mr-1 inline size-3.5" />{fmtNum(s.latitude, 4)}, {fmtNum(s.longitude, 4)}</span><span>{t('station_last_seen')}: {fmtDateTime(s.last_seen_at)} ({fmtAgo(s.last_seen_at, lang)})</span><span>{t('station_interval')}: {s.interval_seconds}</span>{s.error_count ? <span className="text-risk-medium">{t('sim_errors')}: {s.error_count}</span> : null}</CardDescription></CardHeader>
          <CardContent>
            {s.latest.length === 0 ? <EmptyState title={t('details_no_telemetry')} text={t('details_no_telemetry_text')} icon={<Radio className="size-5" />} /> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {s.latest.map((v) => (
                  <div key={v.parameter} className="rounded-lg border border-border bg-surface-2/50 p-3.5">
                    <p className="text-xs text-fg-subtle">{t((`param_${v.parameter}` as TKey))}</p>
                    <p className="mt-0.5 text-[22px] font-semibold leading-tight tnum">{fmtNum(v.value, 1)} <span className="text-sm font-normal text-fg-muted">{v.unit}</span></p>
                    <p className={cn('mt-1 text-[11px]', v.freshness === 'fresh' ? 'text-risk-low' : v.freshness === 'aging' ? 'text-risk-medium' : 'text-risk-high')}>{t((`fresh_${v.freshness}` as TKey))} · {fmtDateTime(v.measured_at, { timeStyle: 'medium', dateStyle: undefined })}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('risk_explanation')}</CardTitle></CardHeader>
          <CardContent>
            {risk.loading && !cur ? <Skeleton className="h-40" /> : risk.error && !cur ? <ErrorState message={risk.error.message} onRetry={risk.refresh} /> : cur ? <RiskExplanation level={cur.risk_level} score={cur.score} explanation={cur.explanation} factors={cur.contributing_factors} trend={cur.trend} forecasts={cur.forecasts} quality={cur.data_quality} assessedAt={risk.data?.stored?.assessed_at} version={cur.algorithm_version} /> : <EmptyState title={t('explain_none')} compact />}
          </CardContent>
        </Card>
      </div>

      <ChartContainer
        title={t('analytics_series')}
        description={series.data ? `${Object.values(series.data).reduce((a, r) => a + r.count_raw, 0)} ${t('analytics_points')}${series.data.water_level_cm?.bucket_seconds ? ` · ${t('bucket')} ${series.data.water_level_cm.bucket_seconds}s` : ''}` : ''}
        actions={<>
          <SegmentedControl label={t('range_label')} value={String(rangeMin)} onChange={(v) => setF({ range: v })} options={RANGES.map((r) => ({ value: String(r.minutes), label: t(r.key) }))} size="sm" />
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!series.data}><Download />{t('export_csv')}</Button>
        </>}
      >
        <div className="grid gap-5 px-2 pt-2 lg:grid-cols-2">
          {series.loading && !series.data ? <><Skeleton className="h-56" /><Skeleton className="h-56" /></> : series.error && !series.data ? <ErrorState message={series.error.message} onRetry={series.refresh} /> : CHART_PARAMS.map((p) => (
            <div key={p}>
              <p className="mb-1 text-xs font-medium text-fg-muted">{t((`param_${p}` as TKey))} · {series.data?.[p]?.unit}</p>
              <TimeSeriesChart data={series.data?.[p]?.points ?? []} series={[{ key: 'v', name: t((`param_${p}` as TKey)), color: PARAM_COLORS[p], unit: series.data?.[p]?.unit }]} unit={series.data?.[p]?.unit} height={220} refLines={p === 'water_level_cm' ? refLines : undefined} area={p === 'rainfall_mm_h'} />
            </div>
          ))}
        </div>
      </ChartContainer>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t('details_risk_history')}</CardTitle><CardDescription>{t('details_risk_history_hint')}</CardDescription></CardHeader>
          <CardContent>
            {risk.data?.history?.length ? <TimeSeriesChart data={risk.data.history.map((h) => ({ t: h.assessed_at, v: h.score ?? 0 }))} series={[{ key: 'v', name: t('score'), color: PARAM_COLORS.score }]} height={160} yDomain={[0, 100]} refLines={[{ y: 65, label: t('risk_high'), color: 'var(--risk-high)' }, { y: 35, label: t('risk_medium'), color: 'var(--risk-medium)' }]} /> : <EmptyState title={t('empty')} compact />}
            {risk.data?.level_changes?.length ? (
              <ul className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
                {[...risk.data.level_changes].reverse().slice(0, 12).map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-surface-2">
                    <span className="tnum text-fg-subtle">{fmtDateTime(c.at)}</span>
                    <span className="flex items-center gap-1"><RiskBadge level={c.from ?? 'unknown'} /><span className="text-fg-subtle">→</span><RiskBadge level={c.to} score={c.score} /></span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('details_alerts')}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            {!alerts.data?.length ? <div className="px-5 pb-5"><EmptyState title={t('alerts_none')} compact /></div> : <DataTable rows={alerts.data.slice(0, 10)} columns={alertCols} rowKey={(a) => a.id} onRowClick={(a) => setOpenAlert(a.id)} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('details_coords')}</CardTitle><CardDescription className="tnum">{fmtNum(s.latitude, 5)}, {fmtNum(s.longitude, 5)}</CardDescription></CardHeader>
          <CardContent><StationMap stations={[s]} height={220} showLegend={false} interactive={false} popups={false} /></CardContent>
        </Card>
      </div>
      <p className="text-[11px] text-fg-subtle">{pick(cur?.disclaimer) ?? t('heuristic_disclaimer')}</p>

      {edit ? <StationFormDialog open onOpenChange={setEdit} station={s} onSaved={() => { station.refresh(); risk.refresh() }} /> : null}
      {openAlert !== null ? <AlertDialog id={openAlert} onClose={() => setOpenAlert(null)} onChanged={() => alerts.refresh()} /> : null}
    </div>
  )
}
