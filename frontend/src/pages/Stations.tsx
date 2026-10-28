import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, MoreHorizontal, Pencil, Plus, Power, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input, NativeSelect } from '@/components/ui/input'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown'
import { TableSkeleton } from '@/components/ui/skeleton'
import { DataTable, type Column } from '@/components/ui/table'
import { ConfirmDialog, ConnectionDot, EmptyState, ErrorState, FilterBar, PageHeader, Pagination, RiskBadge, StatusBadge, SyntheticBanner } from '@/components/common'
import { StationFormDialog } from '@/components/StationForm'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useRefreshMs } from '@/lib/useRefresh'
import { useUrlState } from '@/lib/useUrlState'
import { downloadCsv, toCsv } from '@/lib/csv'
import { fmtAgo, fmtDateTime, fmtNum } from '@/lib/utils'
import type { Station } from '@/lib/types'

const DEFAULTS = { q: '', status: '', source: '', sort: 'name', order: 'asc', page: '1', deleted: '' }

export function StationsTable({ admin, onCountChange }: { admin: boolean; onCountChange?: (n: number) => void }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const refreshMs = useRefreshMs()
  const [f, setF, resetF] = useUrlState(DEFAULTS)
  const page = Math.max(1, Number(f.page) || 1)
  const order = f.order === 'desc' ? 'desc' : 'asc'
  const pageSize = 20
  const query = useMemo(() => ({ search: f.q || undefined, status: f.status || undefined, source_type: f.source || undefined, sort: f.sort, order, page, page_size: pageSize, include_deleted: admin && f.deleted === '1' }), [f.q, f.status, f.source, f.sort, order, page, admin, f.deleted])
  const { data, error, loading, refresh } = usePolling((s) => api.stations.list(query, s), refreshMs, [query])
  const [editing, setEditing] = useState<Station | null | undefined>(undefined) // undefined=closed, null=create
  const [confirm, setConfirm] = useState<{ station: Station; mode: 'disable' | 'delete' } | null>(null)
  const [hard, setHard] = useState(false)
  if (onCountChange && data) onCountChange(data.total)

  const toggleSort = (col: string) => { if (f.sort === col) setF({ order: order === 'asc' ? 'desc' : 'asc' }); else setF({ sort: col, order: 'asc' }) }

  const exportCsv = () => {
    const items = data?.items ?? []
    const rows = items.map((s) => [s.id, s.code, s.name, s.status, s.source_type, s.scenario, s.latitude, s.longitude, s.interval_seconds, s.risk?.risk_level ?? '', s.risk?.score ?? '', s.connection, s.last_seen_at ?? '', s.active_alerts])
    downloadCsv(`stations-${new Date().toISOString().slice(0, 19)}.csv`, toCsv(['id', 'code', 'name', 'status', 'source_type', 'scenario', 'latitude', 'longitude', 'interval_seconds', 'risk_level', 'score', 'connection', 'last_seen_at', 'active_alerts'], rows))
    toast.success(t('export_done', { n: rows.length }))
  }

  const doConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.mode === 'disable') {
        await api.stations.update(confirm.station.id, { status: 'offline' })
        toast.success(t('station_disabled_ok'))
      } else {
        const r = await api.stations.remove(confirm.station.id, hard)
        toast.success(r.message)
      }
      refresh()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : String(e)) }
  }

  const columns: Column<Station>[] = [
    { key: 'name', header: t('station_name'), sortable: true, mobile: 'title', cell: (s) => <><Link to={`/stations/${s.id}`} className="font-medium text-fg hover:text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{s.name}</Link><p className="text-[11px] text-fg-subtle">{s.code}{s.is_deleted ? ` · ${t('station_deleted')}` : ''}</p></> },
    { key: 'status', header: t('station_status'), sortable: true, mobile: 'row', cell: (s) => <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><StatusBadge status={s.status} /><ConnectionDot connection={s.connection} latency={s.latency_seconds} /></div> },
    { key: 'risk', header: t('risk_index'), mobile: 'meta', cell: (s) => <RiskBadge level={s.risk?.risk_level} score={s.risk?.score} /> },
    { key: 'wl', header: t('param_water_level_cm'), className: 'tnum', mobile: 'row', cell: (s) => { const wl = s.latest.find((v) => v.parameter === 'water_level_cm'); return wl ? `${fmtNum(wl.value, 1)} ${wl.unit}` : '—' } },
    { key: 'source', header: t('station_source'), className: 'text-fg-muted', mobile: 'hidden', cell: (s) => t((`source_${s.source_type}` as TKey)) },
    { key: 'scenario', header: t('station_scenario'), className: 'text-fg-muted', mobile: 'row', cell: (s) => t((`scenario_${s.scenario}` as TKey)) },
    { key: 'last_seen_at', header: t('station_last_seen'), sortable: true, className: 'tnum text-fg-muted whitespace-nowrap', mobile: 'row', cell: (s) => <span title={fmtDateTime(s.last_seen_at)}>{fmtAgo(s.last_seen_at, lang)}</span> },
  ]

  const activeCount = [f.status, f.source, f.deleted].filter(Boolean).length
  return (
    <div className="flex flex-col gap-3">
      <FilterBar activeCount={activeCount} onReset={resetF} trailing={<>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data?.items.length}><Download />{t('export_csv')}</Button>
        {admin ? <Button size="sm" onClick={() => setEditing(null)}><Plus />{t('station_add')}</Button> : null}
      </>}>
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input aria-label={t('search')} placeholder={t('search')} value={f.q} onChange={(e) => setF({ q: e.target.value, page: '1' })} className="pl-8" />
        </div>
        <NativeSelect aria-label={t('station_status')} value={f.status} onChange={(e) => setF({ status: e.target.value, page: '1' })}>
          <option value="">{t('station_status')}: {t('all')}</option><option value="online">{t('status_online')}</option><option value="offline">{t('status_offline')}</option><option value="maintenance">{t('status_maintenance')}</option>
        </NativeSelect>
        <NativeSelect aria-label={t('station_source')} value={f.source} onChange={(e) => setF({ source: e.target.value, page: '1' })}>
          <option value="">{t('station_source')}: {t('all')}</option><option value="simulator">{t('source_simulator')}</option><option value="device">{t('source_device')}</option>
        </NativeSelect>
        {admin ? <Checkbox label={t('station_show_deleted')} checked={f.deleted === '1'} onChange={(e) => setF({ deleted: e.target.checked ? '1' : '', page: '1' })} /> : null}
      </FilterBar>
      <Card>
        {loading && !data ? <TableSkeleton /> : error && !data ? <div className="p-4"><ErrorState message={error.message} onRetry={refresh} /></div> : !data?.items.length ? (
          <div className="p-4"><EmptyState title={t('stations_empty')} text={activeCount || f.q ? t('empty_filtered') : t('stations_empty_text')} action={activeCount || f.q ? <Button variant="secondary" size="sm" onClick={resetF}>{t('filters_reset')}</Button> : admin ? <Button size="sm" onClick={() => setEditing(null)}><Plus />{t('station_add')}</Button> : undefined} /></div>
        ) : (
          <>
            <DataTable
              rows={data.items} columns={columns} rowKey={(s) => s.id} sort={f.sort} order={order} onSort={toggleSort}
              onRowClick={(s) => navigate(`/stations/${s.id}`)} rowClassName={(s) => (s.is_deleted ? 'opacity-60' : undefined)}
              actions={(s) => (
                <Dropdown>
                  <DropdownTrigger asChild><Button variant="ghost" size="iconSm" aria-label={t('actions')}><MoreHorizontal /></Button></DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem onSelect={() => navigate(`/stations/${s.id}`)}>{t('station_details')}</DropdownItem>
                    {admin ? (
                      <>
                        <DropdownItem onSelect={() => setEditing(s)}><Pencil />{t('station_edit')}</DropdownItem>
                        <DropdownSeparator />
                        {s.is_deleted ? <DropdownItem onSelect={() => api.stations.restore(s.id).then(() => { toast.success(t('station_restored_ok')); refresh() }).catch((e) => toast.error(e instanceof ApiError ? e.message : String(e)))}><RotateCcw />{t('station_restore')}</DropdownItem> : (
                          <>
                            {s.status !== 'offline' ? <DropdownItem onSelect={() => setConfirm({ station: s, mode: 'disable' })}><Power />{t('station_disable')}</DropdownItem> : null}
                            <DropdownItem danger onSelect={() => { setHard(false); setConfirm({ station: s, mode: 'delete' }) }}><Trash2 />{t('station_delete')}</DropdownItem>
                          </>
                        )}
                      </>
                    ) : null}
                  </DropdownContent>
                </Dropdown>
              )}
            />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </Card>
      {editing !== undefined ? <StationFormDialog key={editing?.id ?? 'new'} open onOpenChange={(o) => { if (!o) setEditing(undefined) }} station={editing} onSaved={() => refresh()} /> : null}
      {confirm ? (
        <ConfirmDialog
          open onOpenChange={(o) => { if (!o) setConfirm(null) }} danger={confirm.mode === 'delete'}
          title={confirm.mode === 'delete' ? t('station_delete_confirm', { name: confirm.station.name }) : t('station_disable_confirm', { name: confirm.station.name })}
          description={confirm.mode === 'delete' ? t('station_delete_soft') : undefined}
          confirmLabel={confirm.mode === 'delete' ? (hard ? t('delete') : t('station_disable')) : t('station_disable')}
          onConfirm={doConfirm}
        >
          {confirm.mode === 'delete' ? (
            <label className="flex items-start gap-2 rounded-md border border-risk-high/30 bg-risk-high-soft/40 p-3 text-xs">
              <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} className="mt-0.5 accent-(--risk-high)" />
              <span>{t('station_delete_hard')}</span>
            </label>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

export default function Stations() {
  const { t } = useI18n()
  const { hasRole } = useAuth()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('stations_title')} subtitle={t('stations_subtitle')} actions={<SyntheticBanner compact />} />
      <StationsTable admin={hasRole('admin')} />
    </div>
  )
}
