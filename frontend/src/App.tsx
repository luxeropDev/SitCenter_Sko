import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ConnectionProvider } from '@/lib/connection'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { ThemeProvider, useTheme } from '@/lib/theme'
import type { Role } from '@/lib/types'

const Overview = lazy(() => import('@/pages/Overview'))
const LiveMap = lazy(() => import('@/pages/LiveMap'))
const Stations = lazy(() => import('@/pages/Stations'))
const StationDetails = lazy(() => import('@/pages/StationDetails'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Simulator = lazy(() => import('@/pages/Simulator'))
const Admin = lazy(() => import('@/pages/Admin'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const Login = lazy(() => import('@/pages/Login'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function PageFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-80" />
    </div>
  )
}

function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  const { t } = useI18n()
  if (loading) return <div className="flex min-h-dvh items-center justify-center text-sm text-fg-subtle">{t('loading')}</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Outlet />
}

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster theme={resolved} position="bottom-right" richColors closeButton toastOptions={{ style: { fontSize: 13 } }} />
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ConnectionProvider>
            <TooltipProvider>
              <BrowserRouter>
                <Suspense fallback={<div className="p-6"><PageFallback /></div>}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<RequireAuth />}>
                      <Route element={<AppShell />}>
                        <Route index element={<Overview />} />
                        <Route path="map" element={<LiveMap />} />
                        <Route path="stations" element={<Stations />} />
                        <Route path="stations/:id" element={<StationDetails />} />
                        <Route path="alerts" element={<Alerts />} />
                        <Route path="alerts/:id" element={<Alerts />} />
                        <Route path="analytics" element={<Analytics />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route element={<RequireAuth roles={['operator', 'admin']} />}>
                          <Route path="simulator" element={<Simulator />} />
                        </Route>
                        <Route element={<RequireAuth roles={['admin']} />}>
                          <Route path="admin" element={<Admin />} />
                          <Route path="admin/:tab" element={<Admin />} />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                      </Route>
                    </Route>
                  </Routes>
                </Suspense>
                <ThemedToaster />
              </BrowserRouter>
            </TooltipProvider>
          </ConnectionProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
