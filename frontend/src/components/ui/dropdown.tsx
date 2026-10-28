import * as React from 'react'
import * as DM from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const Dropdown = DM.Root
export const DropdownTrigger = DM.Trigger
export function DropdownContent({ className, ...props }: DM.DropdownMenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={6} align="end" collisionPadding={8} className={cn('z-[1000] min-w-48 rounded-lg border border-border bg-surface p-1 shadow-pop animate-scale-in', className)} {...props} />
    </DM.Portal>
  )
}
export const DropdownItem = React.forwardRef<React.ComponentRef<typeof DM.Item>, React.ComponentPropsWithoutRef<typeof DM.Item> & { danger?: boolean }>(({ className, danger, ...props }, ref) => (
  <DM.Item ref={ref} className={cn('flex h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-subtle', danger && 'text-risk-high [&_svg]:text-risk-high', className)} {...props} />
))
DropdownItem.displayName = 'DropdownItem'
export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />
}
export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="truncate px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{children}</DM.Label>
}
