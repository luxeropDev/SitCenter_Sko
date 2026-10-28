import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type Column } from '@/components/ui/table'

type Row = { id: number; name: string; value: number }
const rows: Row[] = [{ id: 1, name: 'Alpha', value: 10 }, { id: 2, name: 'Beta', value: 20 }]
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, mobile: 'title', cell: (r) => r.name },
  { key: 'value', header: 'Value', mobile: 'row', cell: (r) => r.value },
]

describe('DataTable', () => {
  it('renders a semantic table and a card list for phones', () => {
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    // mobile list is rendered alongside (hidden by CSS on md+)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByText('Value')).toHaveLength(2)
  })

  it('supports keyboard row activation and sorting', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const onSort = vi.fn()
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={onRowClick} sort="name" order="asc" onSort={onSort} />)
    const table = screen.getByRole('table')
    const [, first] = within(table).getAllByRole('row')
    first.focus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
    expect(within(table).getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(within(table).getByRole('button', { name: /Name/ }))
    expect(onSort).toHaveBeenCalledWith('name')
  })
})
