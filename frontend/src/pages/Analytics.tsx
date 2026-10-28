import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, NativeSelect, SegmentedControl } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable, type Column } from '@/components/ui/table'
import { AlertStatusBadge, ChartContainer, EmptyState, ErrorState, FilterBar, PageHeader, SeverityBadge, SyntheticBanner } from '@/components/common'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { SERIES_COLORS } from '@/lib/chartColors'
import { api } from '@/lib/api'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useUrlState } from '@/lib/useUrlState'
import { downloadCsv, toCsv } from '@/lib/csv'
import { cn, fmtDateTime, fmtNum } from '@/lib/utils'
import type { AnalyticsOverview, PeriodStats } from '@/lib/types'

const RANGES: { key: TKey; minutes: number }[] = [{ key: 'range_1h', minutes: 60 }, { key: 'range_6h', minutes: 360 }, { key: 'range_24h', minutes: 1440 }, { key: 'range_7d', minutes: 10080 }]
const PARAMS = ['water_level_cm', 'water_level_rate_cm_h', 'rainfall_mm_h', 'soil_moisture_pct'] as const
const DEFAULTS = { range: '1440', station: '', scenario: '', compare: '' }

function Delta({ cur, prev, invert }: { cur: number | null | undefined; prev: number | null | undefined; invert?: boolean }) {
  const { t } = useI18n()
  if (cur == null || prev == null) return <span className="text-xs text-fg-subtle">{t('compare_na')}</span>
  const d = cur - prev
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus
  const bad = invert ? d < 0 : d > 0
  return <span className={cn('inline-flex items-center gap-0.5 text-xs tnum', d === 0 ? 'text-fg-subtle' : bad ? 'text-risk-high' : 'text-risk-low')}><Icon className="size-3.5" aria-hidden />{d > 0 ? '+' : ''}{fmtNum(d, 1)} <span className="text-fg-subtle">({t('prev_period')}: {fmtNum(prev, 1)})</span></span>
}

function CompareRow({ cur, prev }: { cur: PeriodStats; prev: PeriodStats }) {
  const { t } = useI18n()
  const items = [
    { label: t('compare_alerts'), c: cur.alerts_total, p: prev.alerts_total },
    { label: t('compare_alerts_high'), c: cur.alerts_high, p: prev.alerts_high },
    { label: t('max_score'), c: cur.max_score, p: prev.max_score },
    { label: t('avg_score'), c: cur.avg_score, p: prev.avg_score },
    { label: t('analytics_points'), c: cur.telemetry_count, p: prev.telemetry_count, invert: true },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((it) => <Card key={it.label} className="px-4 py-3"><p className="text-[11px] text-fg-subtle">{it.label}</p><p className="text-xl font-semibold tnum">{it.c == null ? '—' : fmtNum(it.c, 1)}</p><Delta cur={it.c} prev={it.p} invert={it.invert} /></Card>)}
    </div>
  )
}

export default function Analytics() {
  const { t } = useI18n()
  const [f, setF, resetF] = useUrlState(DEFAULTS)
  const rangeMin = RANGES.some((r) => String(r.minutes) === f.range) ? Number(f.range) : 1440
  const compare = f.compare === '1'
  // The window end is captured when the filter set changes, not on every render.
  const query = useMemo(() => {
    const to = new Date()
    return { from: new Date(to.getTime() - rangeMin * 60000).toISOString(), to: to.toISOString(), station_id: f.station || undefined, scenario: f.scenario || undefined, compare: compare || undefined }
  }, [rangeMin, f.station, f.scenario, compare])
  const { data, error, loading, refresh } = usePolling((s) => api.analytics(query, s), 30000, [query])
  const allStations = usePolling((s) => api.stations.list({ page_size: 200 }, s), 60000)

  const series = useMemo(() => (data?.stations ?? []).map((s, i) => ({ key: `s${s.id}`, name: s.name, color: SERIES_COLORS[i % SERIES_COLORS.length] })), [data])
  const sevData = useMemo(() => ['high', 'medium', 'low'].map((k) => ({ name: t((`risk_${k}` as TKey)), key: k, value: data?.alerts_by_severity[k] ?? 0 })), [data, t])

  const exportCsv = () => {
    if (!data) return
    const rows: (string | number)[][] = []
    for (const [p, pts] of Object.entries(data.telemetry_series)) for (const pt of pts) for (const s of data.stations) if (pt[`s${s.id}`] !== undefined) rows.push([s.code, p, pt.t, pt[`s${s.id}`] as number])
    downloadCsv(`analytics-${rangeMin}m.csv`, toCsv(['station', 'parameter', 'bucket_start', 'avg_value'], rows))
    toast.success(t('export_done', { n: rows.length }))
  }

  const incidentCols: Column<AnalyticsOverview['incident_history'][number]>[] = [
    { key: 'sev', header: t('alert_severity'), mobile: 'meta', cell: (a) => <SeverityBadge severity={a.severity} /> },
    { key: 'st', header: t('alert_station'), mobile: 'title', cell: (a) => <Link to={`/alerts/${a.id}`} className="font-medium hover:text-accent hover:underline">{a.station_name}</Link> },
    { key: 'created', header: t('alert_created'), className: 'tnum text-xs text-fg-muted', mobile: 'row', cell: (a) => fmtDateTime(a.created_at) },
    { key: 'dur', header: t('duration'), className: 'tnum text-xs', mobile: 'row', cell: (a) => a.duration_minutes !== null ? `${fmtNum(a.duration_minutes, 0)} ${t('minutes_short')}` : '—' },
    { key: 'status', header: t('alert_status'), mobile: 'row', cell: (a) => <AlertStatusBadge status={a.status} /> },
  ]
  const activeCount = [f.station, f.scenario].filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('analytics_title')} subtitle={t('analytics_subtitle')} actions={<SyntheticBanner compact />} />
      <FilterBar activeCount={activeCount} onReset={resetF} trailing={<Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data?.telemetry_count}><Download />{t('export_csv')}</Button>}>
        <SegmentedControl label={t('range_label')} value={String(rangeMin)} onChange={(v) => setF({ range: v })} options={RANGES.map((r) => ({ value: String(r.minutes), label: t(r.key) }))} />
        <NativeSelect aria-label={t('analytics_filter_station')} value={f.station} onChange={(e) => setF({ station: e.target.value })}><option value="">{t('analytics_filter_station')}: {t('all')}</option>{allStations.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        <NativeSelect aria-label={t('analytics_filter_scenario')} value={f.scenario} onChange={(e) => setF({ scenario: e.target.value })}><option value="">{t('analytics_filter_scenario')}: {t('all')}</option>{['NORMAL', 'RISING_WATER', 'RAPID_FLOOD'].map((s) => <option key={s} value={s}>{t((`scenario_${s}` as TKey))}</option>)}</NativeSelect>
        <Checkbox label={t('analytics_compare')} checked={compare} onChange={(e) => setF({ compare: e.target.checked ? '1' : '' })} />
      </FilterBar>
      {loading && !data ? <div className="grid gap-4 lg:grid-cols-2" aria-busy><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : error && !data ? <ErrorState message={error.message} onRetry={refresh} /> : data ? (
        <>
          {compare && data.current_period && data.previous_period ? <CompareRow cur={data.current_period} prev={data.previous_period} /> : null}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartContainer title={t('analytics_alerts_by_sev')} description={`${Object.values(data.alerts_by_severity).reduce((a, b) => a + b, 0)} · ${Object.entries(data.alerts_by_status).map(([k, v]) => `${t((`alert_${k}` as TKey))}: ${v}`).join(' · ') || t('none')}`}>
              {sevData.every((d) => d.value === 0) ? <EmptyState title={t('alerts_none')} compact /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sevData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }} />
                    <Bar dataKey="value" name={t('nav_alerts')} radius={[6, 6, 0, 0]} isAnimationActive={false}>{sevData.map((d) => <Cell key={d.key} fill={d.key === 'high' ? 'var(--risk-high)' : d.key === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)'} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartContainer>
            <ChartContainer className="lg:col-span-2" title={t('analytics_risk_timeline')} description={`0–100 · ${t('bucket')} ${data.bucket_seconds}s`}>
              <TimeSeriesChart data={data.risk_timeline} series={series} height={200} yDomain={[0, 100]} refLines={[{ y: 65, label: t('risk_high'), color: 'var(--risk-high)' }, { y: 35, label: t('risk_medium'), color: 'var(--risk-medium)' }]} />
            </ChartContainer>
          </div>
          <ChartContainer title={t('analytics_series')} description={`${data.telemetry_count} ${t('analytics_points')} · ${t('bucket')} ${data.bucket_seconds}s`}>
            <div className="grid gap-5 px-2 pt-2 lg:grid-cols-2">
              {PARAMS.map((p) => (
                <div key={p}><p className="mb-1 text-xs font-medium text-fg-muted">{t((`param_${p}` as TKey))} · {data.units?.[p]}</p><TimeSeriesChart data={data.telemetry_series[p] ?? []} series={series.map((s) => ({ ...s, unit: data.units?.[p] }))} unit={data.units?.[p]} height={200} /></div>
              ))}
            </div>
          </ChartContainer>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>{t('analytics_top')}</CardTitle></CardHeader>
              <CardContent className="px-2 pb-2">
                {!data.top_stations.length ? <EmptyState title={t('empty')} compact /> : (
                  <ol className="flex flex-col">
                    {data.top_stations.map((s, i) => (
                      <li key={s.station_id}><Link to={`/stations/${s.station_id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2"><span className="w-5 text-xs text-fg-subtle tnum">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span><span className="text-xs text-fg-subtle">{t('avg_score')} <b className="tnum text-fg">{fmtNum(s.avg_score, 0)}</b></span><span className="text-xs text-fg-subtle">{t('max_score')} <b className="tnum text-fg">{fmtNum(s.max_score, 0)}</b></span></Link></li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>{t('analytics_incidents')}</CardTitle></CardHeader>
              <CardContent className="px-0 pb-0">
                {!data.incident_history.length ? <div className="px-5 pb-5"><EmptyState title={t('alerts_none')} compact /></div> : <DataTable rows={data.incident_history} columns={incidentCols} rowKey={(a) => a.id} />}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}
