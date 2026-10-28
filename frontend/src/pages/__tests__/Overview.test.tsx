import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Overview from '@/pages/Overview'
import { ApiError } from '@/lib/api'
import { operatorUser, renderWithProviders } from '@/test/utils'
import type { DashboardSummary } from '@/lib/types'

vi.mock('@/components/StationMap', () => ({ StationMap: () => <div data-testid="map" /> }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: operatorUser, loading: false, hasRole: (...r: string[]) => r.includes('operator'), login: vi.fn(), logout: vi.fn(), sessionExpired: false }) }))
const dashboard = vi.fn()
const events = vi.fn().mockResolvedValue([])
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: { dashboard: (...a: unknown[]) => dashboard(...a), events: (...a: unknown[]) => events(...a) } }
})

const summary: DashboardSummary = {
  generated_at: '2026-10-28T10:00:00Z', system_status: 'ok', synthetic_data: true, last_update_at: '2026-10-28T09:59:00Z',
  counts: { stations_total: 7, stations_active: 6, stations_with_alerts: 2, open_incidents: 3, stations_offline: 1, risk_high: 1, risk_medium: 2, risk_low: 3, risk_unknown: 1 },
  stations: [], series: {}, series_from: '2026-10-28T09:00:00Z', recent_alerts: [], top_risk: [], focus: null,
  freshness: { fresh: 5, aging: 1, stale: 0, none: 1 }, stale_after_seconds: 900,
  simulator: { state: 'stopped', scenario: 'NORMAL', driver: 'embedded', driver_alive: true, last_event_at: null, sent_count: 0, interval_seconds: 5 },
  risk_thresholds: { medium: 35, high: 65 },
}

describe('Overview', () => {
  it('shows a skeleton, then real KPI values linking to filtered pages', async () => {
    dashboard.mockResolvedValue(summary)
    renderWithProviders(<Overview />)
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Центр мониторинга паводков' })).toBeInTheDocument()
    const active = screen.getByRole('link', { name: /Активные станции/ })
    expect(active).toHaveAttribute('href', '/stations?status=online')
    expect(active).toHaveTextContent('6')
    expect(screen.getByRole('link', { name: /Высокий риск/ })).toHaveAttribute('href', '/map?risk=high')
    expect(screen.getByRole('link', { name: /Открытые предупреждения/ })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /Свежесть данных/ })).toHaveTextContent('5/7')
    expect(screen.getByText('Предупреждений нет')).toBeInTheDocument()
  })

  it('shows an error state with a working retry button', async () => {
    dashboard.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Нет соединения с сервером')).mockResolvedValueOnce(summary)
    const user = userEvent.setup()
    renderWithProviders(<Overview />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения с сервером')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Центр мониторинга паводков' })).toBeInTheDocument())
    expect(dashboard).toHaveBeenCalledTimes(2)
  })
})
