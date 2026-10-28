import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Activity, Database, Plus, Radio, Server, Shield, Sliders, Users, Lock, Unlock, Pencil, ScrollText, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, NativeSelect } from '@/components/ui/input'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { SwitchField } from '@/components/ui/switch'
import { DataTable, type Column } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InfoTip } from '@/components/ui/tooltip'
import { ConfirmDialog, ConnectionDot, EmptyState, ErrorState, FilterBar, PageHeader, Pagination, StatusBadge } from '@/components/common'
import { StationsTable } from '@/pages/Stations'
import { SimulatorPanel } from '@/pages/Simulator'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { usePolling } from '@/lib/usePolling'
import { useUrlState } from '@/lib/useUrlState'
import { cn, fmtAgo, fmtDateTime, fmtNum } from '@/lib/utils'
import type { AuditEntry, SystemHealth, SystemSettings, User } from '@/lib/types'

const TABS = ['stations', 'users', 'risk', 'simulator', 'health', 'audit'] as const
const TAB_ICONS = { stations: Radio, users: Users, risk: Sliders, simulator: Activity, health: Server, audit: ScrollText }

function UserDialog({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ username: user?.username ?? '', email: user?.email ?? '', full_name: user?.full_name ?? '', password: '', role: user?.role ?? 'observer', is_active: user?.is_active ?? true })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!user && !/^[a-zA-Z0-9_.-]{3,64}$/.test(form.username)) errs.username = t('val_username')
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(form.email)) errs.email = t('val_email')
    if ((!user && form.password.length < 8) || (form.password && form.password.length < 8)) errs.password = t('val_password')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (user) await api.admin.updateUser(user.id, { email: form.email, full_name: form.full_name, role: form.role, is_active: form.is_active, ...(form.password ? { password: form.password } : {}) })
      else await api.admin.createUser(form)
      toast.success(user ? t('user_updated_ok') : t('user_created_ok'))
      onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : String(err)) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent title={user ? `${t('edit')}: ${user.username}` : t('user_add')}>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <Field label={t('user_username')} htmlFor="u-name" error={errors.username}><Input id="u-name" value={form.username} disabled={!!user} onChange={(e) => setForm({ ...form, username: e.target.value })} invalid={!!errors.username} autoComplete="off" /></Field>
          <Field label={t('user_email')} htmlFor="u-email" error={errors.email}><Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} /></Field>
          <Field label={t('user_fullname')} htmlFor="u-full"><Input id="u-full" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label={user ? t('user_new_password') : t('user_password')} htmlFor="u-pass" error={errors.password}><Input id="u-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} /></Field>
          <Field label={t('user_role')} htmlFor="u-role"><NativeSelect id="u-role" className="w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}>{(['observer', 'operator', 'admin'] as const).map((r) => <option key={r} value={r}>{t((`role_${r}` as TKey))}</option>)}</NativeSelect></Field>
          <SwitchField label={t('user_active')} checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button type="submit" loading={busy}>{t('save')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UsersTab() {
  const { t } = useI18n()
  const { user: me } = useAuth()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const { data, error, loading, refresh } = usePolling((s) => api.admin.users({ page, page_size: 25, search: q || undefined }, s), 0, [page, q])
  const [editing, setEditing] = useState<User | null | undefined>(undefined)
  const [toggle, setToggle] = useState<User | null>(null)
  const cols: Column<User>[] = [
    { key: 'username', header: t('user_username'), mobile: 'title', cell: (u) => <><p className="font-medium">{u.username}</p><p className="text-[11px] text-fg-subtle">{u.full_name}</p></> },
    { key: 'email', header: t('user_email'), className: 'text-fg-muted', mobile: 'row', cell: (u) => u.email },
    { key: 'role', header: t('user_role'), mobile: 'meta', cell: (u) => <Badge variant={u.role === 'admin' ? 'high' : u.role === 'operator' ? 'accent' : 'default'}>{t((`role_${u.role}` as TKey))}</Badge> },
    { key: 'active', header: t('user_active'), mobile: 'row', cell: (u) => <Badge variant={u.is_active ? 'success' : 'unknown'}>{u.is_active ? t('user_active') : t('user_blocked')}</Badge> },
    { key: 'last', header: t('user_last_login'), className: 'tnum text-xs text-fg-muted', mobile: 'row', cell: (u) => fmtDateTime(u.last_login_at) },
  ]
  return (
    <div className="flex flex-col gap-3">
      <FilterBar trailing={<Button size="sm" onClick={() => setEditing(null)}><Plus />{t('user_add')}</Button>}>
        <div className="relative min-w-48 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden /><Input aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="pl-8" /></div>
      </FilterBar>
      <Card>
        {loading && !data ? <TableSkeleton /> : error && !data ? <div className="p-4"><ErrorState message={error.message} onRetry={refresh} /></div> : !data?.items.length ? <div className="p-4"><EmptyState title={t('empty')} /></div> : (
          <>
            <DataTable rows={data.items} columns={cols} rowKey={(u) => u.id} actions={(u) => (
              <div className="inline-flex gap-1">
                <Button variant="ghost" size="iconSm" aria-label={t('edit')} title={t('edit')} onClick={() => setEditing(u)}><Pencil /></Button>
                <Button variant="ghost" size="iconSm" aria-label={u.is_active ? t('user_block') : t('user_unblock')} title={u.is_active ? t('user_block') : t('user_unblock')} disabled={u.id === me?.id} onClick={() => setToggle(u)}>{u.is_active ? <Lock /> : <Unlock />}</Button>
              </div>
            )} />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {editing !== undefined ? <UserDialog key={editing?.id ?? 'new'} user={editing} onClose={() => setEditing(undefined)} onSaved={refresh} /> : null}
      {toggle ? <ConfirmDialog open onOpenChange={(o) => { if (!o) setToggle(null) }} danger={toggle.is_active} title={`${toggle.is_active ? t('user_block') : t('user_unblock')}: ${toggle.username}?`} onConfirm={async () => { try { await api.admin.updateUser(toggle.id, { is_active: !toggle.is_active }); toast.success(t('user_updated_ok')); refresh() } catch (e) { toast.error(e instanceof ApiError ? e.message : String(e)) } }} /> : null}
    </div>
  )
}

function RiskForm({ initial, onSaved }: { initial: SystemSettings; onSaved: (s: SystemSettings) => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState<SystemSettings>(() => structuredClone(initial))
  const [busy, setBusy] = useState(false)
  const num = (v: string) => (v === '' ? NaN : Number(v))
  const weightsOk = Object.values(form.risk.weights).every((w) => Number.isFinite(w) && w >= 0) && Object.values(form.risk.weights).some((w) => w > 0)
  const thOk = form.risk.thresholds.medium > 0 && form.risk.thresholds.medium < form.risk.thresholds.high && form.risk.thresholds.high <= 100
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await api.admin.updateSettings({ risk: { weights: form.risk.weights, thresholds: form.risk.thresholds, stale_after_seconds: form.risk.stale_after_seconds, soil_stale_after_seconds: form.risk.soil_stale_after_seconds, trend_window_points: form.risk.trend_window_points, trend_min_points: form.risk.trend_min_points }, alerts: form.alerts, ui_refresh_seconds: form.ui_refresh_seconds })
      setForm(structuredClone(res)); onSaved(res); toast.success(t('settings_saved'))
    } catch (err) { toast.error(err instanceof ApiError ? `${err.message}${Array.isArray(err.details) ? ': ' + err.details.join('; ') : ''}` : String(err)) } finally { setBusy(false) }
  }
  const WEIGHT_HINTS: Record<string, TKey> = { level: 'hint_w_level', rise_rate: 'hint_w_rise', rainfall: 'hint_w_rain', soil: 'hint_w_soil', trend: 'hint_w_trend' }
  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t('risk_weights')}</CardTitle><CardDescription className="font-mono">{t('settings_formula')}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(['level', 'rise_rate', 'rainfall', 'soil', 'trend'] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 text-[13px] font-medium text-fg-muted"><label htmlFor={`w-${k}`}>{t((`factor_${k}` as TKey))}</label><InfoTip content={t(WEIGHT_HINTS[k])} /></span>
              <Input id={`w-${k}`} inputMode="decimal" value={String(form.risk.weights[k] ?? '')} onChange={(e) => setForm({ ...form, risk: { ...form.risk, weights: { ...form.risk.weights, [k]: num(e.target.value) } } })} invalid={!Number.isFinite(form.risk.weights[k]) || form.risk.weights[k] < 0} />
            </div>
          ))}
          {!weightsOk ? <p className="text-xs text-risk-high sm:col-span-2" role="alert">{t('val_weights')}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t('risk_thresholds')}</CardTitle><CardDescription>{t('algorithm_version')}: {form.algorithm_version}{form.updated_at ? ` · ${t('updated')} ${fmtDateTime(form.updated_at)}` : ''}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label={t('risk_medium_threshold')} htmlFor="th-m"><Input id="th-m" inputMode="decimal" value={String(form.risk.thresholds.medium)} onChange={(e) => setForm({ ...form, risk: { ...form.risk, thresholds: { ...form.risk.thresholds, medium: num(e.target.value) } } })} invalid={!thOk} /></Field>
          <Field label={t('risk_high_threshold')} htmlFor="th-h"><Input id="th-h" inputMode="decimal" value={String(form.risk.thresholds.high)} onChange={(e) => setForm({ ...form, risk: { ...form.risk, thresholds: { ...form.risk.thresholds, high: num(e.target.value) } } })} invalid={!thOk} /></Field>
          {!thOk ? <p className="text-xs text-risk-high sm:col-span-2" role="alert">{t('val_thresholds')}</p> : null}
          <Field label={t('stale_after')} htmlFor="stale" hint="30 – 604800"><Input id="stale" inputMode="numeric" value={String(form.risk.stale_after_seconds)} onChange={(e) => setForm({ ...form, risk: { ...form.risk, stale_after_seconds: num(e.target.value) } })} /></Field>
          <Field label={t('soil_stale_after')} htmlFor="sstale"><Input id="sstale" inputMode="numeric" value={String(form.risk.soil_stale_after_seconds)} onChange={(e) => setForm({ ...form, risk: { ...form.risk, soil_stale_after_seconds: num(e.target.value) } })} /></Field>
          <Field label={t('trend_window')} htmlFor="tw" hint="3 – 500"><Input id="tw" inputMode="numeric" value={String(form.risk.trend_window_points)} onChange={(e) => setForm({ ...form, risk: { ...form.risk, trend_window_points: num(e.target.value) } })} /></Field>
          <Field label={t('trend_min')} htmlFor="tm" hint="2 – 100"><Input id="tm" inputMode="numeric" value={String(form.risk.trend_min_points)} onChange={(e) => setForm({ ...form, risk: { ...form.risk, trend_min_points: num(e.target.value) } })} /></Field>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>{t('nav_alerts')}</CardTitle><CardDescription>{t('alert_rules_hint')}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label={t('alert_suppression')} htmlFor="supp" hint="0 – 1440"><Input id="supp" inputMode="numeric" value={String(form.alerts.suppression_minutes)} onChange={(e) => setForm({ ...form, alerts: { ...form.alerts, suppression_minutes: num(e.target.value) } })} /></Field>
          <Field label={t('ui_refresh')} htmlFor="uir" hint="2 – 300"><Input id="uir" inputMode="numeric" value={String(form.ui_refresh_seconds)} onChange={(e) => setForm({ ...form, ui_refresh_seconds: num(e.target.value) })} /></Field>
          <SwitchField className="self-end" label={t('alert_on_medium')} checked={form.alerts.alert_on_medium} onCheckedChange={(v) => setForm({ ...form, alerts: { ...form.alerts, alert_on_medium: v } })} />
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-2 lg:col-span-2">
        {dirty ? <span className="mr-auto text-xs text-fg-subtle">{t('unsaved_changes')}</span> : null}
        <Button type="button" variant="secondary" disabled={!dirty} onClick={() => setForm(structuredClone(initial))}>{t('cancel')}</Button>
        <Button type="submit" loading={busy} disabled={!weightsOk || !thOk || !dirty}>{t('save')}</Button>
      </div>
    </form>
  )
}

function RiskTab() {
  const { t } = useI18n()
  const { data, error, loading, refresh } = usePolling((s) => api.admin.settings(s), 0)
  const [saved, setSaved] = useState<SystemSettings | null>(null)
  if (loading && !data) return <Skeleton className="h-72" />
  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />
  const initial = saved ?? data
  if (!initial) return null
  return <><p className="mb-3 text-xs text-fg-subtle">{t('risk_settings_effect')}</p><RiskForm key={initial.updated_at ?? 'init'} initial={initial} onSaved={(s) => { setSaved(s); refresh() }} /></>
}

function HealthStat({ icon: Icon, title, ok, lines }: { icon: typeof Server; title: string; ok: boolean; lines: string[] }) {
  return (
    <Card><CardContent className="flex items-start gap-3 p-4">
      <div className={cn('flex size-10 items-center justify-center rounded-lg', ok ? 'bg-risk-low-soft text-risk-low' : 'bg-risk-high-soft text-risk-high')}><Icon className="size-5" /></div>
      <div className="min-w-0 text-xs"><p className="text-sm font-semibold">{title}</p>{lines.map((l, i) => <p key={i} className="truncate text-fg-muted">{l}</p>)}</div>
    </CardContent></Card>
  )
}

function HealthTab() {
  const { t, lang } = useI18n()
  const { data, error, loading, refresh } = usePolling((s) => api.admin.health(s), 5000)
  if (loading && !data) return <Skeleton className="h-72" />
  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />
  if (!data) return null
  const cols: Column<SystemHealth['sources'][number]>[] = [
    { key: 'name', header: t('station_name'), mobile: 'title', cell: (s) => <><p className="font-medium">{s.name}</p><p className="text-[11px] text-fg-subtle">{s.code} · {t((`source_${s.source_type}` as TKey))}</p></> },
    { key: 'status', header: t('station_status'), mobile: 'meta', cell: (s) => <StatusBadge status={s.status} /> },
    { key: 'conn', header: t('conn_connected'), mobile: 'row', cell: (s) => <ConnectionDot connection={s.connection} /> },
    { key: 'lat', header: t('health_latency'), className: 'tnum text-xs', mobile: 'row', cell: (s) => s.latency_seconds != null ? `${fmtNum(s.latency_seconds, 0)} ${t('seconds_short')}` : '—' },
    { key: 'seen', header: t('station_last_seen'), className: 'tnum text-xs text-fg-muted', mobile: 'row', cell: (s) => fmtAgo(s.last_seen_at, lang) },
    { key: 'err', header: t('sim_errors'), className: 'tnum text-xs', mobile: 'row', cell: (s) => <span className={cn(s.error_count && 'text-risk-medium')}>{s.error_count}{s.last_error_at ? ` · ${fmtDateTime(s.last_error_at)}` : ''}</span> },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthStat icon={Server} title={t('health_api')} ok={data.api.status === 'ok'} lines={[`v${data.api.version} · ${data.api.env}`, fmtDateTime(data.api.time)]} />
        <HealthStat icon={Database} title={t('health_db')} ok={data.database.status === 'ok'} lines={[data.database.driver, `${t('health_rows')}: ${data.database.telemetry_rows}`, `${t('nav_alerts')}: ${data.database.alerts}`]} />
        <HealthStat icon={Activity} title={t('health_sim')} ok={data.simulator.state !== 'running' || data.simulator.driver_alive} lines={[`${data.simulator.mode} · ${t((`sim_${data.simulator.state}` as TKey))} · ${data.simulator.driver}`, data.simulator.last_event_at ? fmtDateTime(data.simulator.last_event_at) : '—', data.simulator.last_error ? data.simulator.last_error : `${t('sim_errors')}: ${data.simulator.error_count}`]} />
      </div>
      <Card>
        <CardHeader><CardTitle>{t('health_sources')}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0"><DataTable rows={data.sources} columns={cols} rowKey={(s) => s.station_id} /></CardContent>
      </Card>
    </div>
  )
}

const AUDIT_DEFAULTS = { page: '1', action: '', entity: '', actor: '' }
function AuditTab() {
  const { t } = useI18n()
  const [f, setF, resetF] = useUrlState(AUDIT_DEFAULTS)
  const page = Math.max(1, Number(f.page) || 1)
  const { data, error, loading, refresh } = usePolling((s) => api.audit({ page, page_size: 50, action: f.action || undefined, entity_type: f.entity || undefined, actor: f.actor || undefined }, s), 15000, [page, f.action, f.entity, f.actor])
  const cols: Column<AuditEntry>[] = [
    { key: 'time', header: t('audit_time'), className: 'tnum text-xs text-fg-muted whitespace-nowrap', mobile: 'row', cell: (e) => fmtDateTime(e.created_at) },
    { key: 'actor', header: t('audit_actor'), className: 'font-medium', mobile: 'title', cell: (e) => e.actor_name },
    { key: 'action', header: t('audit_action'), mobile: 'meta', cell: (e) => <Badge variant="outline" className="font-mono">{e.action}</Badge> },
    { key: 'entity', header: t('audit_entity'), className: 'text-xs text-fg-muted', mobile: 'row', cell: (e) => `${e.entity_type}${e.entity_id ? ` #${e.entity_id}` : ''}` },
    { key: 'details', header: t('audit_details'), className: 'max-w-md truncate font-mono text-[11px] text-fg-subtle', mobile: 'hidden', cell: (e) => <span title={JSON.stringify(e.details)}>{JSON.stringify(e.details)}</span> },
  ]
  const active = [f.action, f.entity, f.actor].filter(Boolean).length
  return (
    <div className="flex flex-col gap-3">
      <FilterBar activeCount={active} onReset={resetF}>
        <Input aria-label={t('audit_action')} placeholder={t('audit_action')} value={f.action} onChange={(e) => setF({ action: e.target.value, page: '1' })} className="w-44" />
        <NativeSelect aria-label={t('audit_entity')} value={f.entity} onChange={(e) => setF({ entity: e.target.value, page: '1' })}><option value="">{t('audit_entity')}: {t('all')}</option>{['alert', 'station', 'user', 'settings', 'simulator'].map((e) => <option key={e} value={e}>{e}</option>)}</NativeSelect>
        <Input aria-label={t('audit_actor')} placeholder={t('audit_actor')} value={f.actor} onChange={(e) => setF({ actor: e.target.value, page: '1' })} className="w-40" />
      </FilterBar>
      <Card>
        {loading && !data ? <TableSkeleton /> : error && !data ? <div className="p-4"><ErrorState message={error.message} onRetry={refresh} /></div> : !data?.items.length ? <div className="p-4"><EmptyState title={t('empty')} /></div> : (
          <><DataTable rows={data.items} columns={cols} rowKey={(e) => e.id} /><Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setF({ page: String(p) })} /></>
        )}
      </Card>
    </div>
  )
}

export default function Admin() {
  const { t } = useI18n()
  const { tab } = useParams()
  const navigate = useNavigate()
  const active = (TABS as readonly string[]).includes(tab ?? '') ? (tab as string) : 'stations'
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('admin_title')} subtitle={t('admin_subtitle')} actions={<Badge variant="high" size="md"><Shield className="size-3" />{t('role_admin')}</Badge>} />
      <Tabs value={active} onValueChange={(v) => navigate(`/admin/${v}`)}>
        <TabsList>
          {TABS.map((k) => { const Icon = TAB_ICONS[k]; return <TabsTrigger key={k} value={k}><Icon className="size-4" />{t((`tab_${k}` as TKey))}</TabsTrigger> })}
        </TabsList>
        <TabsContent value="stations"><StationsTable admin /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="risk"><RiskTab /></TabsContent>
        <TabsContent value="simulator"><SimulatorPanel /></TabsContent>
        <TabsContent value="health"><HealthTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  )
}
