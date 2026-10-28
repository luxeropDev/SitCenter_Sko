import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { useI18n, type TKey } from '@/lib/i18n'
import type { Station, Thresholds } from '@/lib/types'
import { PARAMETERS } from '@/lib/utils'

const DEFAULT_TH: Thresholds = { baseline_level_cm: 120, warning_level_cm: 220, critical_level_cm: 300, critical_rise_rate_cm_h: 30, critical_rainfall_mm_h: 15, soil_dry_pct: 20, soil_saturated_pct: 85 }
const TH_KEYS: { key: keyof Thresholds; label: TKey }[] = [
  { key: 'baseline_level_cm', label: 'th_baseline' }, { key: 'warning_level_cm', label: 'th_warning' }, { key: 'critical_level_cm', label: 'th_critical' },
  { key: 'critical_rise_rate_cm_h', label: 'th_rise' }, { key: 'critical_rainfall_mm_h', label: 'th_rain' }, { key: 'soil_dry_pct', label: 'th_soil_dry' }, { key: 'soil_saturated_pct', label: 'th_soil_sat' },
]

interface FormState { name: string; code: string; description: string; latitude: string; longitude: string; source_type: string; scenario: string; status: string; interval_seconds: string; parameters: string[]; thresholds: Record<keyof Thresholds, string> }

function toForm(s?: Station | null): FormState {
  const th = { ...DEFAULT_TH, ...(s?.configuration?.thresholds ?? {}) }
  return {
    name: s?.name ?? '', code: s?.code ?? '', description: s?.description ?? '', latitude: s ? String(s.latitude) : '54.87', longitude: s ? String(s.longitude) : '69.16',
    source_type: s?.source_type ?? 'simulator', scenario: s?.scenario ?? 'NORMAL', status: s?.status ?? 'online', interval_seconds: String(s?.interval_seconds ?? 10),
    parameters: s?.parameters ?? [...PARAMETERS], thresholds: Object.fromEntries(Object.entries(th).map(([k, v]) => [k, String(v)])) as Record<keyof Thresholds, string>,
  }
}

function validate(f: FormState, t: (k: TKey) => string): Record<string, string> {
  const e: Record<string, string> = {}
  if (f.name.trim().length < 2 || f.name.length > 128) e.name = '2–128'
  if (f.description.length > 2000) e.description = '≤ 2000'
  const lat = Number(f.latitude), lon = Number(f.longitude)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) e.latitude = '-90 … 90'
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) e.longitude = '-180 … 180'
  const iv = Number(f.interval_seconds)
  if (!Number.isInteger(iv) || iv < 1 || iv > 3600) e.interval_seconds = '1 … 3600'
  if (!f.parameters.includes('water_level_cm')) e.parameters = t('params_required')
  const th = Object.fromEntries(Object.entries(f.thresholds).map(([k, v]) => [k, Number(v)])) as Record<keyof Thresholds, number>
  for (const [k, v] of Object.entries(th)) if (!Number.isFinite(v)) e[`th_${k}`] = 'NaN'
  if (!(th.baseline_level_cm < th.warning_level_cm && th.warning_level_cm < th.critical_level_cm)) e.th_critical_level_cm = 'baseline < warning < critical'
  if (th.critical_rise_rate_cm_h <= 0) e.th_critical_rise_rate_cm_h = '> 0'
  if (th.critical_rainfall_mm_h <= 0) e.th_critical_rainfall_mm_h = '> 0'
  if (!(th.soil_dry_pct >= 0 && th.soil_dry_pct < th.soil_saturated_pct && th.soil_saturated_pct <= 100)) e.th_soil_saturated_pct = '0 ≤ dry < saturated ≤ 100'
  if (f.code && !/^[A-Za-z0-9_-]{2,32}$/.test(f.code)) e.code = 'A-Z 0-9 _ -'
  return e
}

export function StationFormDialog({ open, onOpenChange, station, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; station?: Station | null; onSaved: (s: Station) => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState<FormState>(() => toForm(station))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(form, t)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const body = {
        name: form.name.trim(), description: form.description, latitude: Number(form.latitude), longitude: Number(form.longitude), source_type: form.source_type, scenario: form.scenario,
        status: form.status, interval_seconds: Number(form.interval_seconds), parameters: form.parameters,
        thresholds: Object.fromEntries(Object.entries(form.thresholds).map(([k, v]) => [k, Number(v)])),
        ...(station ? {} : { code: form.code.trim() || undefined }),
      }
      const saved = station ? await api.stations.update(station.id, body) : await api.stations.create(body)
      toast.success(station ? t('station_updated_ok') : t('station_created_ok'))
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.message}${Array.isArray(err.details) ? ': ' + err.details.map((d: { msg?: string }) => d.msg).join('; ') : ''}` : String(err)
      toast.error(msg)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={station ? t('station_edit') : t('station_add')} wide>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('station_name')} htmlFor="st-name" error={errors.name}><Input id="st-name" value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} required /></Field>
            <Field label={t('station_code')} htmlFor="st-code" error={errors.code}><Input id="st-code" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!!station} placeholder="AUTO" invalid={!!errors.code} /></Field>
            <Field label={t('station_lat')} htmlFor="st-lat" error={errors.latitude}><Input id="st-lat" inputMode="decimal" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} invalid={!!errors.latitude} /></Field>
            <Field label={t('station_lon')} htmlFor="st-lon" error={errors.longitude}><Input id="st-lon" inputMode="decimal" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} invalid={!!errors.longitude} /></Field>
            <Field label={t('station_source')} htmlFor="st-src"><NativeSelect id="st-src" className="w-full" value={form.source_type} onChange={(e) => set('source_type', e.target.value)}><option value="simulator">{t('source_simulator')}</option><option value="device">{t('source_device')}</option></NativeSelect></Field>
            <Field label={t('station_scenario')} htmlFor="st-scn"><NativeSelect id="st-scn" className="w-full" value={form.scenario} onChange={(e) => set('scenario', e.target.value)}>{['NORMAL', 'RISING_WATER', 'RAPID_FLOOD'].map((s) => <option key={s} value={s}>{t((`scenario_${s}` as TKey))}</option>)}</NativeSelect></Field>
            <Field label={t('station_status')} htmlFor="st-status"><NativeSelect id="st-status" className="w-full" value={form.status} onChange={(e) => set('status', e.target.value)}><option value="online">{t('status_online')}</option><option value="offline">{t('status_offline')}</option><option value="maintenance">{t('status_maintenance')}</option></NativeSelect></Field>
            <Field label={t('station_interval')} htmlFor="st-int" error={errors.interval_seconds}><Input id="st-int" inputMode="numeric" value={form.interval_seconds} onChange={(e) => set('interval_seconds', e.target.value)} invalid={!!errors.interval_seconds} /></Field>
          </div>
          <Field label={t('station_description')} htmlFor="st-desc"><Textarea id="st-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} /></Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-fg-muted">{t('station_params')}</legend>
            <div className="flex flex-wrap gap-2">
              {PARAMETERS.map((p) => (
                <Checkbox key={p} className="rounded-md border border-border px-2.5 py-1.5 text-xs" label={t((`param_${p}` as TKey))} checked={form.parameters.includes(p)} onChange={(e) => set('parameters', e.target.checked ? [...form.parameters, p] : form.parameters.filter((x) => x !== p))} />
              ))}
            </div>
            {errors.parameters ? <p className="text-xs text-risk-high">{errors.parameters}</p> : null}
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-fg-muted">{t('station_thresholds')}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {TH_KEYS.map(({ key, label }) => (
                <Field key={key} label={t(label)} htmlFor={`th-${key}`} error={errors[`th_${key}`]}>
                  <Input id={`th-${key}`} inputMode="decimal" value={form.thresholds[key]} onChange={(e) => set('thresholds', { ...form.thresholds, [key]: e.target.value })} invalid={!!errors[`th_${key}`]} />
                </Field>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" loading={busy}>{t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
