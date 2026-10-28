import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { adminUser, operatorUser, renderWithProviders, setMobile } from '@/test/utils'

const authState = { user: operatorUser }
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: authState.user, loading: false, login: vi.fn(), logout: vi.fn(), hasRole: (...r: string[]) => r.includes(authState.user.role), sessionExpired: false }) }))
vi.mock('@/lib/connection', () => ({ useConnection: () => ({ online: true, lastSuccess: new Date('2026-10-28T10:00:00Z'), checking: false }) }))
vi.mock('@/lib/useLive', () => ({ useLive: () => false }))
vi.mock('@/lib/api', () => ({ api: { stations: { list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1, pages: 1 }) }, alerts: { list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1, pages: 1 }) } } }))

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<h1>Home page</h1>} />
        <Route path="alerts" element={<h1>Alerts page</h1>} />
      </Route>
    </Routes>
  )
}

describe('AppShell navigation', () => {
  beforeEach(() => { authState.user = operatorUser })

  it('renders every nav item for the role and hides admin-only items', () => {
    setMobile(false)
    renderWithProviders(<App />)
    const nav = screen.getAllByRole('navigation', { name: 'Основная навигация' })[0]
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Обзор', 'Карта мониторинга', 'Станции', 'Предупреждения', 'Аналитика', 'Симулятор', 'Настройки'])
  })

  it('shows Администрирование for admins', () => {
    authState.user = adminUser
    setMobile(false)
    renderWithProviders(<App />)
    expect(screen.getAllByRole('link', { name: 'Администрирование' }).length).toBeGreaterThan(0)
  })

  it('hamburger opens the mobile drawer, Escape closes it and returns focus', async () => {
    setMobile(true)
    const user = userEvent.setup()
    renderWithProviders(<App />)
    const burger = screen.getByRole('button', { name: 'Открыть меню' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(burger)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('link', { name: 'Предупреждения' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(burger)
  })

  it('closes the drawer after navigating and marks the active route', async () => {
    setMobile(true)
    const user = userEvent.setup()
    renderWithProviders(<App />)
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Предупреждения' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Alerts page' })).toBeInTheDocument()
    const active = screen.getAllByRole('link', { name: 'Предупреждения' }).find((a) => a.getAttribute('aria-current') === 'page')
    expect(active).toBeTruthy()
  })

  it('collapses the desktop sidebar and persists the choice', async () => {
    setMobile(false)
    const user = userEvent.setup()
    renderWithProviders(<App />)
    const toggle = screen.getAllByRole('button', { name: 'Свернуть панель' })[0]
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(localStorage.getItem('urpaq.sidebar')).toBe('collapsed')
    expect(screen.getAllByRole('button', { name: 'Развернуть панель' }).length).toBeGreaterThan(0)
  })

  it('opens the command palette with Ctrl+K but not while typing in an input', async () => {
    setMobile(false)
    const user = userEvent.setup()
    renderWithProviders(<App />)
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument())
    // "/" inside a text field must not hijack typing
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await user.keyboard('/')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(input.value).toBe('/')
  })
})
