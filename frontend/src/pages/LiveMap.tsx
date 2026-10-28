import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Locate, MapPin, Search, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Drawer } from '@/components/ui/dialog'
import { ConnectionDot, EmptyState, ErrorState, FilterBar, PageHeader, RiskBadge, RiskExplanation, StatusBadge, SyntheticBanner } from '@/components/common'
import { Legend, StationMap } from '@/components/StationMap'
import { api } from '@/lib/api'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useRefreshMs } from '@/lib/useRefresh'
import { useUrlState } from '@/lib/useUrlState'
import { cn, fmtAgo, fmtDateTime, fmtNum, riskOrder, riskTone } from '@/lib/utils'
import type { Station } from '@/lib/types'

const DEFAULTS = { q: '', risk: '', type: '', status: '', station: '' }

function StationPanel({ station, onClose }: { station: Station; onClose: () => void }) {
  const { t, lang } = useI18n()
  const refreshMs = useRefreshMs()
  const risk = usePolling((s) => api.stations.risk(station.id, s), refreshMs, [station.id])
  const cur = risk.data?.current
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{station.name}</h3>
          <p className="text-xs text-fg-subtle">{station.code} · {t((`source_${station.source_type}` as TKey))} · <span className="tnum">{fmtNum(station.latitude, 4)}, {fmtNum(station.longitude, 4)}</span></p>
        </div>
        <IconButton label={t('close')} size="sm" onClick={onClose}><X /></IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={station.status} /><ConnectionDot connection={station.connection} latency={station.latency_seconds} /><span className="text-xs text-fg-subtle">{t('station_last_seen')}: {fmtAgo(station.last_seen_at, lang)}</span></div>
      {station.latest.length ? (
        <dl className="grid grid-cols-2 gap-2">
          {station.latest.map((v) => (
            <div key={v.parameter} className="rounded-md border border-border bg-surface-2/50 px-3 py-2">
              <dt className="text-[11px] text-fg-subtle">{t((`param_${v.parameter}` as TKey))}</dt>
              <dd className="text-lg font-semibold tnum">{fmtNum(v.value, 1)} <span className="text-xs font-normal text-fg-muted">{v.unit}</span></dd>
              <dd className={cn('text-[11px]', v.freshness === 'fresh' ? 'text-risk-low' : v.freshness === 'aging' ? 'text-risk-medium' : 'text-risk-high')}>{t((`fresh_${v.freshness}` as TKey))} · {fmtDateTime(v.measured_at, { timeStyle: 'short', dateStyle: undefined })}</dd>
            </div>
          ))}
        </dl>
      ) : <EmptyState title={t('empty')} compact />}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t('map_reasons')}</p>
        {risk.loading && !cur ? <Skeleton className="h-32" /> : cur ? <RiskExplanation level={cur.risk_level} score={cur.score} explanation={cur.explanation} factors={cur.contributing_factors} trend={cur.trend} forecasts={cur.forecasts} quality={cur.data_quality} assessedAt={risk.data?.stored?.assessed_at} version={cur.algorithm_version} /> : <EmptyState title={t('explain_none')} compact />}
      </div>
      <Button asChild className="w-full"><Link to={`/stations/${station.id}`}>{t('map_open_station')}<ArrowRight /></Link></Button>
    </div>
  )
}

export default function LiveMap() {
  const { t } = useI18n()
  const refreshMs = useRefreshMs()
  const { data, error, loading, refresh } = usePolling((s) => api.stations.list({ page_size: 200 }, s), refreshMs)
  const [f, setF, resetF] = useUrlState(DEFAULTS)
  const selectedId = f.station ? Number(f.station) : null
  const [focus, setFocus] = useState<number | null>(selectedId)
  const [mobilePanel, setMobilePanel] = useState(false)

  const filtered = useMemo(() => {
    const items = data?.items ?? []
    const ql = f.q.trim().toLowerCase()
    return items
      .filter((s) => (!ql || s.name.toLowerCase().includes(ql) || s.code.toLowerCase().includes(ql)) && (!f.risk || riskTone(s.risk?.risk_level) === f.risk) && (!f.type || s.source_type === f.type) && (!f.status || s.status === f.status))
      .sort((a, b) => (riskOrder[b.risk?.risk_level ?? ''] ?? 0) - (riskOrder[a.risk?.risk_level ?? ''] ?? 0) || a.name.localeCompare(b.name))
  }, [data, f])
  const selected = useMemo(() => (data?.items ?? []).find((s) => s.id === selectedId) ?? null, [data, selectedId])
  const activeCount = [f.risk, f.type, f.status].filter(Boolean).length

  const select = (id: number) => { setF({ station: String(id) }); setFocus(id); if (!window.matchMedia('(min-width: 1024px)').matches) setMobilePanel(true) }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('map_title')} subtitle={t('map_subtitle')} actions={<><SyntheticBanner compact /><Button variant="secondary" size="sm" onClick={() => { setF({ station: '' }); setFocus(null) }}><Locate />{t('map_fit_all')}</Button></>} />
      <FilterBar activeCount={activeCount} onReset={() => { resetF(); setFocus(null) }} trailing={<span className="text-xs text-fg-subtle">{filtered.length} / {data?.items.length ?? 0}</span>}>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input aria-label={t('map_search')} placeholder={t('map_search')} value={f.q} onChange={(e) => setF({ q: e.target.value })} className="pl-8" />
        </div>
        <NativeSelect aria-label={t('map_filter_risk')} value={f.risk} onChange={(e) => setF({ risk: e.target.value })}>
          <option value="">{t('map_filter_risk')}: {t('map_all')}</option>
          <option value="high">{t('risk_high')}</option><option value="medium">{t('risk_medium')}</option><option value="low">{t('risk_low')}</option><option value="unknown">{t('risk_unknown')}</option>
        </NativeSelect>
        <NativeSelect aria-label={t('map_filter_type')} value={f.type} onChange={(e) => setF({ type: e.target.value })}>
          <option value="">{t('map_filter_type')}: {t('map_all')}</option><option value="simulator">{t('source_simulator')}</option><option value="device">{t('source_device')}</option>
        </NativeSelect>
        <NativeSelect aria-label={t('map_filter_status')} value={f.status} onChange={(e) => setF({ status: e.target.value })}>
          <option value="">{t('map_filter_status')}: {t('map_all')}</option><option value="online">{t('status_online')}</option><option value="offline">{t('status_offline')}</option><option value="maintenance">{t('status_maintenance')}</option>
        </NativeSelect>
      </FilterBar>
      {error && !data ? <ErrorState message={error.message} onRetry={refresh} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {loading && !data ? <Skeleton className="h-[60vh]" /> : <StationMap stations={filtered} height="clamp(360px, calc(100dvh - 300px), 820px)" focusId={focus} selectedId={selectedId} onSelect={select} />}
        <div className="hidden flex-col gap-3 lg:flex">
          {selected ? (
            <Card><CardContent className="p-4"><StationPanel station={selected} onClose={() => { setF({ station: '' }); setFocus(null) }} /></CardContent></Card>
          ) : (
            <Card className="flex max-h-[calc(100dvh-300px)] flex-col">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><MapPin className="size-4 text-fg-subtle" />{t('nav_stations')}</CardTitle></CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {filtered.length === 0 ? <EmptyState title={t('empty')} compact /> : (
                  <ul className="flex flex-col gap-0.5">
                    {filtered.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => select(s.id)} onMouseEnter={() => setFocus(s.id)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-surface-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{s.name}</p>
                            <p className="text-[11px] text-fg-subtle">{s.code} · {t((`status_${s.status}` as TKey))}</p>
                          </div>
                          <RiskBadge level={s.risk?.risk_level} score={s.risk?.score} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <Legend className="sm:hidden" />
      </div>
      <Drawer open={mobilePanel && !!selected} onOpenChange={(o) => { setMobilePanel(o); if (!o) setF({ station: '' }) }} title={selected?.name ?? ''} side="bottom">
        {selected ? <StationPanel station={selected} onClose={() => { setMobilePanel(false); setF({ station: '' }) }} /> : null}
      </Drawer>
    </div>
  )
}
