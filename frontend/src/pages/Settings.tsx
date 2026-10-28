import { useState } from 'react'
import { toast } from 'sonner'
import { Monitor, Moon, Sun, Info, Cpu, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, SegmentedControl } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/common'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getRefreshMs, setRefreshSeconds } from '@/lib/connection'
import { useI18n, type TKey } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { usePolling } from '@/lib/usePolling'
import { fmtDateTime } from '@/lib/utils'

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const [refresh, setRefresh] = useState(String(getRefreshMs() / 1000))
  const [refreshErr, setRefreshErr] = useState<string | null>(null)
  const health = usePolling(() => api.health(), 0)
  const uiVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev'

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('settings_title')} subtitle={t('settings_subtitle')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('settings_theme')}</CardTitle><CardDescription>{t('settings_theme_hint')}</CardDescription></CardHeader>
          <CardContent>
            <SegmentedControl label={t('settings_theme')} value={theme} onChange={setTheme} options={[{ value: 'light', label: t('theme_light'), icon: <Sun className="size-4" /> }, { value: 'dark', label: t('theme_dark'), icon: <Moon className="size-4" /> }, { value: 'system', label: t('theme_system'), icon: <Monitor className="size-4" /> }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('settings_lang')}</CardTitle><CardDescription>{t('settings_lang_hint')}</CardDescription></CardHeader>
          <CardContent>
            <SegmentedControl label={t('settings_lang')} value={lang} onChange={setLang} options={[{ value: 'ru', label: 'Русский' }, { value: 'kk', label: 'Қазақша' }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('settings_refresh')}</CardTitle><CardDescription>{t('settings_refresh_hint')}</CardDescription></CardHeader>
          <CardContent>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const v = Number(refresh); if (Number.isFinite(v) && v >= 2 && v <= 300) { setRefreshErr(null); setRefreshSeconds(v); toast.success(t('saved')) } else setRefreshErr('2 – 300') }} noValidate>
              <Field label={t('ui_refresh')} htmlFor="refresh" hint="2 – 300" error={refreshErr ?? undefined}><Input id="refresh" inputMode="numeric" value={refresh} onChange={(e) => setRefresh(e.target.value)} className="w-32" invalid={!!refreshErr} /></Field>
              <Button type="submit" variant="secondary" className={refreshErr ? 'mb-6' : 'mb-5'}>{t('save')}</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('settings_profile')}</CardTitle></CardHeader>
          <CardContent>
            {user ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                <dt className="text-fg-subtle">{t('user_username')}</dt><dd className="font-medium">{user.username}</dd>
                <dt className="text-fg-subtle">{t('user_fullname')}</dt><dd>{user.full_name || '—'}</dd>
                <dt className="text-fg-subtle">{t('user_email')}</dt><dd>{user.email}</dd>
                <dt className="text-fg-subtle">{t('user_role')}</dt><dd><Badge variant={user.role === 'admin' ? 'high' : user.role === 'operator' ? 'accent' : 'default'}>{t((`role_${user.role}` as TKey))}</Badge></dd>
                <dt className="text-fg-subtle">{t('user_last_login')}</dt><dd className="tnum">{fmtDateTime(user.last_login_at)}</dd>
              </dl>
            ) : null}
            <p className="mt-3 text-xs text-fg-subtle">{t('settings_profile_hint')}</p>
            <p className="mt-2 rounded-md border border-risk-medium/40 bg-risk-medium-soft/50 px-3 py-2 text-xs text-fg-muted">{t('settings_demo_warning')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="size-4 text-fg-subtle" />{t('settings_algorithm')}</CardTitle><CardDescription>{t('settings_algorithm_hint')}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="font-mono text-xs text-fg-muted">{t('settings_formula')}</p>
            <p className="text-xs text-fg-subtle">{t('settings_algorithm_text')}</p>
            <p className="text-xs"><span className="text-fg-subtle">{t('algorithm_version')}:</span> <b className="tnum">{health.data?.algorithm_version ?? '—'}</b></p>
            <p className="text-[11px] italic text-fg-subtle">{t('heuristic_disclaimer')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Info className="size-4 text-fg-subtle" />{t('settings_about')}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-fg-subtle">{t('settings_ui_version')}</dt><dd className="tnum">{uiVersion}</dd>
              <dt className="text-fg-subtle">{t('settings_api_version')}</dt><dd className="tnum">{health.data?.version ?? '—'} · {health.data?.env ?? ''}</dd>
              <dt className="text-fg-subtle"><Database className="mr-1 inline size-3.5" />{t('health_db')}</dt><dd>{health.data ? (health.data.database === 'ok' ? t('status_ok') : t('status_error')) : '—'}</dd>
              <dt className="text-fg-subtle">{t('health_sim')}</dt><dd>{health.data?.simulator_mode ?? '—'}</dd>
            </dl>
            <p className="mt-3 text-xs text-fg-subtle">{t('synthetic_note')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
