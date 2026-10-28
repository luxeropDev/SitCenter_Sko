import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, onUnauthorized, tokenStore } from './api'
import type { Role, User } from './types'

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
  sessionExpired: boolean
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    let cancelled = false
    const token = tokenStore.get()
    if (!token) { setLoading(false); return }
    api.auth.me().then((u) => { if (!cancelled) setUser(u) }).catch(() => { tokenStore.set(null) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => onUnauthorized(() => {
    if (tokenStore.get()) {
      tokenStore.set(null)
      setUser(null)
      setSessionExpired(true)
    }
  }), [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.auth.login(username, password)
    tokenStore.set(res.access_token)
    setUser(res.user)
    setSessionExpired(false)
  }, [])

  const logout = useCallback(async () => {
    try { await api.auth.logout() } catch (e) { if (!(e instanceof ApiError)) throw e }
    tokenStore.set(null)
    setUser(null)
  }, [])

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])
  const value = useMemo(() => ({ user, loading, login, logout, hasRole, sessionExpired }), [user, loading, login, logout, hasRole, sessionExpired])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
