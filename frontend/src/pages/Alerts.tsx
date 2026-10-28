import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, Check, CheckCheck, Download, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Drawer } from '@/components/ui/dialog'
import { Field, Input, NativeSelect } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { DataTable, type Column } from '@/components/ui/table'
import { AlertStatusBadge, EmptyState, ErrorState, FactorBars, FilterBar, PageHeader, Pagination, SeverityBadge, StatCard, SyntheticBanner } from '@/components/common'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useRefreshMs } from '@/lib/useRefresh'
import { useUrlState } from '@/lib/useUrlState'
import { downloadCsv, toCsv } from '@/lib/csv'
import { fmtAgo, fmtDateTime, fmtNum } from '@/lib/utils'
import type { Alert } from '@/lib/types'
import { AlertTriangle, Activity, CheckCircle2 } from 'lucide-react'

export function AlertDialog({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged?: () => void }) {
  const { t, pick, lang } = useI18n()
  const { hasRole } = useAuth()
  const [alert, setAlert] = useState<Alert | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteErr, setNoteErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null)
  useEffect(() => {
    let live = true
    api.alerts.get(id).then((a) => { if (live) setAlert(a) }).catch((e) => { if (live) setError(e instanceof ApiError ? e.message : String(e)) })
    return () => { live = false }
  }, [id])
  const canAct = hasRole('operator', 'admin')
  const act = async (kind: 'ack' | 'resolve') => {
    if (kind === 'resolve' && note.trim().length < 3) { setNoteErr(t('alert_note_required')); return }
    setNoteErr(null)
    setBusy(kind)
    try {
      const a = kind === 'ack' ? await api.alerts.acknowledge(id) : await api.alerts.resolve(id, note.trim())
      setAlert(a)
      toast.success(kind === 'ack' ? t('alert_ack_ok') : t('alert_resolve_ok'))
      onChanged?.()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : String(e)) } finally { setBusy(null) }
  }
  const timeline = alert ? [
    { at: alert.created_at, label: t('event_alert_created'), by: 'system' },
    ...(alert.trigger_factors?.escalations ?? []).map((e) => ({ at: e.at, label: `${t('event_alert_escalated')}: ${e.from} → ${e.to} (${fmtNum(e.score, 0)})`, by: 'system' })),
    ...(alert.acknowledged_at ? [{ at: alert.acknowledged_at, label: t('event_alert_acknowledged'), by: alert.acknowledged_by_name ?? '' }] : []),
    ...(alert.resolved_at ? [{ at: alert.resolved_at, label: t('event_alert_resolved'), by: alert.resolved_by_name ?? '' }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at)) : []
  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose() }} title={alert?.title ?? t('alert_details')} description={alert ? `#${alert.id} · ${fmtDateTime(alert.created_at)} · ${fmtAgo(alert.created_at, lang)}` : undefined}
      footer={canAct && alert && alert.status !== 'resolved' ? (
        <div className="flex flex-col gap-3">
          <Field label={t('alert_resolution_note')} htmlFor="res-note" error={noteErr ?? undefined} hint={t('alert_note_hint')}><Textarea id="res-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} invalid={!!noteErr} /></Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {alert.status === 'new' ? <Button variant="secondary" loading={busy === 'ack'} onClick={() => act('ack')}><Check />{t('alert_ack')}</Button> : null}
            <Button loading={busy === 'resolve'} onClick={() => act('resolve')}><CheckCheck />{t('alert_resolve')}</Button>
          </div>
        </div>
      ) : undefined}>
      {error ? <ErrorState message={error} /> : !alert ? <div className="flex flex-col gap-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-20" /><Skeleton className="h-32" /></div> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} /><AlertStatusBadge status={alert.status} />
            {alert.trigger_factors?.score !== undefined ? <span className="text-xs text-fg-muted">{t('score')}: <b className="tnum">{fmtNum(alert.trigger_factors.score, 0)}</b></span> : null}
            {alert.escalation_count ? <span className="text-xs text-fg-muted">{t('alert_escalations')}: {alert.escalation_count}</span> : null}
            {alert.trigger_factors?.synthetic ? <SyntheticBanner compact /> : null}
          </div>
          <p className="text-sm leading-relaxed text-fg">{pick(alert.trigger_factors?.explanation) ?? alert.description}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div><dt className="text-fg-subtle">{t('alert_station')}</dt><dd><Link to={`/stations/${alert.station_id}`} className="font-medium text-accent hover:underline">{alert.station_name ?? alert.station_id}</Link></dd></div>
            <div><dt className="text-fg-subtle">{t('alert_created')}</dt><dd className="tnum">{fmtDateTime(alert.created_at)}</dd></div>
            <div><dt className="text-fg-subtle">{t('alert_acknowledged')}</dt><dd className="tnum">{alert.acknowledged_at ? `${fmtDateTime(alert.acknowledged_at)} · ${alert.acknowledged_by_name ?? ''}` : '—'}</dd></div>
            <div><dt className="text-fg-subtle">{t('alert_resolved')}</dt><dd className="tnum">{alert.resolved_at ? `${fmtDateTime(alert.resolved_at)} · ${alert.resolved_by_name ?? ''}` : '—'}</dd></div>
          </dl>
          {alert.resolution_note ? <p className="rounded-md bg-surface-2 px-3 py-2 text-xs"><span className="text-fg-subtle">{t('alert_resolution_note')}:</span> {alert.resolution_note}</p> : null}
          {alert.trigger_factors?.factors?.length ? <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t('factors')}</p><FactorBars factors={alert.trigger_factors.factors} /></div> : null}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t('alert_timeline')}</p>
            <ol className="relative ml-1.5 flex flex-col gap-3 border-l border-border pl-4 text-xs">
              {timeline.map((e, i) => (
                <li key={i} className="relative"><span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden /><p className="font-medium text-fg">{e.label}</p><p className="tnum text-fg-subtle">{fmtDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}</p></li>
              ))}
            </ol>
          </div>
          {!canAct && alert.status !== 'resolved' ? <p className="text-xs text-fg-subtle">{t('alert_no_permission')}</p> : null}
        </div>
      )}
    </Drawer>
  )
}

const DEFAULTS = { status: '', severity: '', station: '', q: '', from: '', to: '', sort: 'created_at', order: 'desc', page: '1' }

export default function Alerts() {
  const { t, lang } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const refreshMs = useRefreshMs()
  const [f, setF, resetF] = useUrlState(DEFAULTS)
  const page = Math.max(1, Number(f.page) || 1)
  const order = f.order === 'asc' ? 'asc' : 'desc'
  const query = useMemo(() => ({ status: f.status || undefined, severity: f.severity || undefined, station_id: f.station || undefined, search: f.q || undefined, from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(f.to).toISOString() : undefined, sort: f.sort, order, page, page_size: 25 }), [f.status, f.severity, f.station, f.q, f.from, f.to, f.sort, order, page])
  const { data, error, loading, refresh } = usePolling((s) => api.alerts.list(query, s), refreshMs, [query])
  const counts = usePolling((s) => api.alerts.counts(s), refreshMs)
  const stations = usePolling((s) => api.stations.list({ page_size: 200, include_deleted: true }, s), 60000)

  const exportCsv = () => {
    const rows = (data?.items ?? []).map((a) => [a.id, a.station_code ?? '', a.station_name ?? '', a.severity, a.status, a.title, a.trigger_factors?.score ?? '', a.created_at, a.acknowledged_at ?? '', a.acknowledged_by_name ?? '', a.resolved_at ?? '', a.resolved_by_name ?? '', a.resolution_note, a.escalation_count])
    downloadCsv(`alerts-${new Date().toISOString().slice(0, 19)}.csv`, toCsv(['id', 'station_code', 'station', 'severity', 'status', 'title', 'score', 'created_at', 'acknowledged_at', 'acknowledged_by', 'resolved_at', 'resolved_by', 'resolution_note', 'escalations'], rows))
    toast.success(t('export_done', { n: rows.length }))
  }
  const quickAck = async (a: Alert) => { try { await api.alerts.acknowledge(a.id); toast.success(t('alert_ack_ok')); refresh(); counts.refresh() } catch (e) { toast.error(e instanceof ApiError ? e.message : String(e)) } }
  const toggleSort = (col: string) => { if (f.sort === col) setF({ order: order === 'asc' ? 'desc' : 'asc' }); else setF({ sort: col, order: 'desc' }) }

  const c = counts.data
  const activeCount = [f.status, f.severity, f.station, f.from, f.to].filter(Boolean).length
  const columns: Column<Alert>[] = [
    { key: 'severity', header: t('alert_severity'), sortable: true, mobile: 'meta', cell: (a) => <SeverityBadge severity={a.severity} /> },
    { key: 'title', header: t('alert_title'), className: 'max-w-xs', mobile: 'title', cell: (a) => <><p className="truncate font-medium">{a.title}</p>{a.escalation_count ? <p className="text-[11px] text-fg-subtle">{t('alert_escalations')}: {a.escalation_count}</p> : null}</> },
    { key: 'station', header: t('alert_station'), className: 'text-fg-muted', mobile: 'row', cell: (a) => a.station_name },
    { key: 'score', header: t('score'), className: 'tnum', mobile: 'row', cell: (a) => fmtNum(a.trigger_factors?.score ?? null, 0) },
    { key: 'created_at', header: t('alert_created'), sortable: true, className: 'tnum text-xs text-fg-muted whitespace-nowrap', mobile: 'row', cell: (a) => <span title={fmtDateTime(a.created_at)}>{fmtAgo(a.created_at, lang)}</span> },
    { key: 'status', header: t('alert_status'), sortable: true, mobile: 'row', cell: (a) => <AlertStatusBadge status={a.status} /> },
    { key: 'by', header: t('alert_by'), className: 'text-xs text-fg-muted', mobile: 'hidden', cell: (a) => a.resolved_by_name ?? a.acknowledged_by_name ?? '—' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('alerts_title')} subtitle={t('alerts_subtitle')} actions={<SyntheticBanner compact />} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={AlertTriangle} label={t('alert_new')} value={c?.by_status.new ?? 0} tone={(c?.by_status.new ?? 0) > 0 ? 'high' : 'low'} to="/alerts?status=new" loading={!c} />
        <StatCard icon={Activity} label={t('alert_acknowledged')} value={c?.by_status.acknowledged ?? 0} tone="accent" to="/alerts?status=acknowledged" loading={!c} />
        <StatCard icon={CheckCircle2} label={t('alert_resolved')} value={c?.by_status.resolved ?? 0} tone="neutral" to="/alerts?status=resolved" loading={!c} />
        <StatCard icon={Bell} label={`${t('counts_active')} · ${t('risk_high')}`} value={c?.active_by_severity.high ?? 0} tone={(c?.active_by_severity.high ?? 0) > 0 ? 'high' : 'low'} to="/alerts?severity=high&status=new" loading={!c} />
      </div>
      <FilterBar activeCount={activeCount} onReset={resetF} trailing={<Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data?.items.length}><Download />{t('export_csv')}</Button>}>
        <div className="relative min-w-44 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input aria-label={t('search')} placeholder={t('search')} value={f.q} onChange={(e) => setF({ q: e.target.value, page: '1' })} className="pl-8" />
        </div>
        <NativeSelect aria-label={t('alert_filter_status')} value={f.status} onChange={(e) => setF({ status: e.target.value, page: '1' })}><option value="">{t('alert_filter_status')}: {t('all')}</option><option value="new">{t('alert_new')}</option><option value="acknowledged">{t('alert_acknowledged')}</option><option value="resolved">{t('alert_resolved')}</option></NativeSelect>
        <NativeSelect aria-label={t('alert_filter_severity')} value={f.severity} onChange={(e) => setF({ severity: e.target.value, page: '1' })}><option value="">{t('alert_filter_severity')}: {t('all')}</option><option value="high">{t('risk_high')}</option><option value="medium">{t('risk_medium')}</option><option value="low">{t('risk_low')}</option></NativeSelect>
        <NativeSelect aria-label={t('alert_filter_station')} value={f.station} onChange={(e) => setF({ station: e.target.value, page: '1' })}><option value="">{t('alert_filter_station')}: {t('all')}</option>{stations.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        <Input type="datetime-local" aria-label={t('alert_filter_from')} value={f.from} onChange={(e) => setF({ from: e.target.value, page: '1' })} className="w-auto" />
        <Input type="datetime-local" aria-label={t('alert_filter_to')} value={f.to} onChange={(e) => setF({ to: e.target.value, page: '1' })} className="w-auto" />
      </FilterBar>
      <Card>
        {loading && !data ? <TableSkeleton /> : error && !data ? <div className="p-4"><ErrorState message={error.message} onRetry={refresh} /></div> : !data?.items.length ? (
          <div className="p-4"><EmptyState title={t('alerts_none')} text={activeCount || f.q ? t('empty_filtered') : t('alerts_none_text')} icon={<Bell className="size-5" />} action={activeCount || f.q ? <Button variant="secondary" size="sm" onClick={resetF}>{t('filters_reset')}</Button> : undefined} /></div>
        ) : (
          <>
            <DataTable rows={data.items} columns={columns} rowKey={(a) => a.id} sort={f.sort} order={order} onSort={toggleSort} onRowClick={(a) => navigate(`/alerts/${a.id}${window.location.search}`)}
              rowClassName={(a) => (a.status === 'new' && a.severity === 'high' ? 'bg-risk-high-soft/25' : undefined)}
              actions={(a) => hasRole('operator', 'admin') && a.status === 'new' ? <Button variant="ghost" size="sm" onClick={() => quickAck(a)}><Check />{t('alert_ack')}</Button> : null} />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </Card>
      {id ? <AlertDialog id={Number(id)} onClose={() => navigate(`/alerts${window.location.search}`)} onChanged={() => { refresh(); counts.refresh() }} /> : null}
    </div>
  )
}
