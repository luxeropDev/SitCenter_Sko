import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'
interface ThemeCtx { theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void; toggle: () => void }
const Ctx = createContext<ThemeCtx | null>(null)
const KEY = 'urpaq.theme'

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem(KEY) as Theme) || 'system' } catch { return 'system' }
  })
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme))

  useEffect(() => {
    const apply = () => {
      const r = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme
      setResolved(r)
      document.documentElement.classList.toggle('dark', r === 'dark')
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  }, [])
  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme])
  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTheme outside ThemeProvider')
  return c
}
