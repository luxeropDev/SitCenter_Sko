import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api } from './api'
import { usePolling } from './usePolling'

interface Conn { online: boolean; lastSuccess: Date | null; checking: boolean; simulatorMode?: string }
const Ctx = createContext<Conn>({ online: true, lastSuccess: null, checking: true })

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { data, error, lastSuccess, loading } = usePolling(() => api.health(), 15000)
  const value = useMemo<Conn>(() => ({ online: !error && !!data, lastSuccess, checking: loading, simulatorMode: data?.simulator_mode }), [data, error, lastSuccess, loading])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConnection() {
  return useContext(Ctx)
}

const REFRESH_KEY = 'urpaq.refresh'
export function getRefreshMs(): number {
  try {
    const v = Number(localStorage.getItem(REFRESH_KEY))
    if (v >= 2 && v <= 300) return v * 1000
  } catch { /* ignore */ }
  return 10000
}
export function setRefreshSeconds(s: number) {
  try { localStorage.setItem(REFRESH_KEY, String(s)) } catch { /* ignore */ }
  window.dispatchEvent(new Event('urpaq-refresh-changed'))
}
