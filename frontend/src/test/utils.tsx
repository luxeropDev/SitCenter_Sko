import { type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/lib/i18n'
import { ThemeProvider } from '@/lib/theme'
import type { User } from '@/lib/types'

export const operatorUser: User = { id: 2, username: 'operator', email: 'operator@test.local', full_name: 'Дежурный оператор', role: 'operator', is_active: true, created_at: '2026-01-01T00:00:00Z', last_login_at: null }
export const adminUser: User = { ...operatorUser, id: 1, username: 'admin', role: 'admin', full_name: 'Администратор' }

export function setMobile(mobile: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('min-width: 1024px') ? !mobile : false,
    media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList)
}

export function renderWithProviders(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>,
  )
}
