import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StationFormDialog } from '@/components/StationForm'
import { ConfirmDialog } from '@/components/common'
import { renderWithProviders } from '@/test/utils'

const create = vi.fn()
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: { stations: { create: (...a: unknown[]) => create(...a), update: vi.fn() } } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('StationFormDialog', () => {
  it('validates inline and only submits a valid payload to the API', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    create.mockResolvedValue({ id: 9 })
    renderWithProviders(<StationFormDialog open onOpenChange={() => {}} station={null} onSaved={onSaved} />)
    const lat = screen.getByLabelText('Широта')
    await user.clear(lat)
    await user.type(lat, '95')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    expect(screen.getByText('-90 … 90')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    await user.clear(lat)
    await user.type(lat, '54.9')
    await user.type(screen.getByLabelText('Название'), 'Тестовая станция')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const body = create.mock.calls[0][0] as { name: string; latitude: number; thresholds: Record<string, number> }
    expect(body.name).toBe('Тестовая станция')
    expect(body.latitude).toBe(54.9)
    expect(body.thresholds.critical_level_cm).toBeGreaterThan(body.thresholds.warning_level_cm)
    expect(onSaved).toHaveBeenCalled()
  })
})

describe('ConfirmDialog', () => {
  it('runs the action only after explicit confirmation', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    renderWithProviders(<ConfirmDialog open onOpenChange={onOpenChange} title="Удалить станцию?" danger onConfirm={onConfirm} confirmLabel="Удалить" />)
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
