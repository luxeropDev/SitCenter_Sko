import * as React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border [&_tr]:bg-surface-2/50', className)} {...props} />
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none', className)} {...props} />
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-fg-subtle whitespace-nowrap', className)} {...props} />
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />
}

/** Sortable column header button. */
export function SortTH({ col, sort, order, onSort, children, className }: { col: string; sort: string; order: 'asc' | 'desc'; onSort: (col: string) => void; children: React.ReactNode; className?: string }) {
  const active = sort === col
  const Icon = active ? (order === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TH className={className} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(col)} className={cn('inline-flex items-center gap-1 rounded hover:text-fg', active && 'text-fg')}>
        {children}<Icon className="size-3" aria-hidden />
      </button>
    </TH>
  )
}

/**
 * DataTable: renders a real table on ≥ md and stacked cards on phones.
 * `columns[i].mobile` controls whether the cell shows in card mode.
 */
export interface Column<T> { key: string; header: React.ReactNode; cell: (row: T) => React.ReactNode; className?: string; sortable?: boolean; mobile?: 'title' | 'meta' | 'row' | 'hidden'; align?: 'left' | 'right' }
export function DataTable<T>({ rows, columns, rowKey, onRowClick, sort, order, onSort, rowClassName, actions }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; sort?: string; order?: 'asc' | 'desc'; onSort?: (c: string) => void; rowClassName?: (r: T) => string | undefined; actions?: (r: T) => React.ReactNode
}) {
  const clickable = !!onRowClick
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              {columns.map((c) => c.sortable && onSort && sort !== undefined && order ? (
                <SortTH key={c.key} col={c.key} sort={sort} order={order} onSort={onSort} className={cn(c.align === 'right' && 'text-right', c.className)}>{c.header}</SortTH>
              ) : <TH key={c.key} className={cn(c.align === 'right' && 'text-right', c.className)}>{c.header}</TH>)}
              {actions ? <TH className="w-12 text-right" /> : null}
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={rowKey(r)} className={cn(clickable && 'cursor-pointer', rowClassName?.(r))} onClick={clickable ? () => onRowClick(r) : undefined} tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r) } } : undefined}>
                {columns.map((c) => <TD key={c.key} className={cn(c.align === 'right' && 'text-right', c.className)}>{c.cell(r)}</TD>)}
                {actions ? <TD className="text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{actions(r)}</TD> : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <ul className="flex flex-col divide-y divide-border md:hidden">
        {rows.map((r) => {
          const title = columns.filter((c) => c.mobile === 'title')
          const meta = columns.filter((c) => c.mobile === 'meta')
          const rest = columns.filter((c) => !c.mobile || c.mobile === 'row')
          return (
            <li key={rowKey(r)} className={cn('flex flex-col gap-2 px-4 py-3', clickable && 'cursor-pointer active:bg-surface-2/60', rowClassName?.(r))} onClick={clickable ? () => onRowClick(r) : undefined}
              role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">{title.map((c) => <div key={c.key}>{c.cell(r)}</div>)}</div>
                <div className="flex shrink-0 items-center gap-2">{meta.map((c) => <span key={c.key}>{c.cell(r)}</span>)}{actions ? <span onClick={(e) => e.stopPropagation()}>{actions(r)}</span> : null}</div>
              </div>
              {rest.length ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {rest.map((c) => <React.Fragment key={c.key}><dt className="text-fg-subtle">{c.header}</dt><dd className="min-w-0 truncate text-right text-fg">{c.cell(r)}</dd></React.Fragment>)}
                </dl>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
