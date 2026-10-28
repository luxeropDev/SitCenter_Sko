import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useUrlState } from '@/lib/useUrlState'

const DEFAULTS = { status: '', page: '1' }

describe('useUrlState', () => {
  it('reads defaults, writes only non-default values to the URL and resets', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/alerts?status=new']}>{children}</MemoryRouter>
    const { result } = renderHook(() => ({ s: useUrlState(DEFAULTS), loc: useLocation() }), { wrapper })
    expect(result.current.s[0]).toEqual({ status: 'new', page: '1' })
    act(() => result.current.s[1]({ page: '3' }))
    expect(result.current.loc.search).toBe('?status=new&page=3')
    act(() => result.current.s[1]({ page: '1', status: '' }))
    expect(result.current.loc.search).toBe('')
    act(() => result.current.s[1]({ status: 'resolved' }))
    act(() => result.current.s[2]())
    expect(result.current.loc.search).toBe('')
    expect(result.current.s[0]).toEqual(DEFAULTS)
  })
})
