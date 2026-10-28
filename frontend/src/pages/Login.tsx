import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Waves, AlertTriangle, ShieldCheck, Activity, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { LanguageMenu, ThemeToggle } from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { useI18n, type TKey } from '@/lib/i18n'

const DEMO = [
  { role: 'admin', username: 'admin', password: 'Admin12345!', icon: ShieldCheck },
  { role: 'operator', username: 'operator', password: 'Operator12345!', icon: Activity },
  { role: 'observer', username: 'observer', password: 'Observer12345!', icon: Eye },
]
const showDemo = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false'

export default function Login() {
  const { user, login, sessionExpired } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const loc = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const from = (loc.state as { from?: string } | null)?.from ?? '/'
  if (user) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) { setError(t('login_required')); return }
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-end gap-1 px-4 py-3"><LanguageMenu /><ThemeToggle /></header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px] animate-in">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-raised"><Waves className="size-7" /></div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">{t('app_name')}</h1>
              <p className="text-sm text-fg-subtle">{t('app_tagline')}</p>
            </div>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-card" aria-labelledby="login-title" noValidate>
            <div>
              <h2 id="login-title" className="text-base font-semibold">{t('login_title')}</h2>
              <p className="text-[13px] text-fg-subtle">{t('login_subtitle')}</p>
            </div>
            {sessionExpired && !error ? <p className="rounded-md bg-risk-medium-soft px-3 py-2 text-xs text-risk-medium" role="status">{t('session_expired')}</p> : null}
            {error ? <p className="flex items-center gap-2 rounded-md bg-risk-high-soft px-3 py-2 text-xs text-risk-high" role="alert"><AlertTriangle className="size-3.5" />{error}</p> : null}
            <Field label={t('login_username')} htmlFor="username">
              <Input id="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label={t('login_password')} htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" size="lg" loading={busy} className="w-full">{t('login_submit')}</Button>
            {showDemo ? (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t('login_demo')}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {DEMO.map((d) => (
                    <button key={d.username} type="button" onClick={() => { setUsername(d.username); setPassword(d.password) }} className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-2 text-[11px] leading-tight text-fg-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent">
                      <d.icon className="size-4" aria-hidden /><span className="w-full truncate text-center">{t((`role_${d.role}` as TKey))}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-fg-subtle">{t('settings_demo_warning')}</p>
              </div>
            ) : null}
          </form>
          <p className="mt-4 text-center text-[11px] text-fg-subtle">{t('synthetic_note')}</p>
        </div>
      </main>
    </div>
  )
}
