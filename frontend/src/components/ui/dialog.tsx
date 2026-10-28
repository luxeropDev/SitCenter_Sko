import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, title, description, wide, ...props }: DialogPrimitive.DialogContentProps & { title: React.ReactNode; description?: React.ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-pop focus:outline-none animate-scale-in',
          wide ? 'max-w-3xl' : 'max-w-lg',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-fg-subtle">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="-mr-1 -mt-1 flex size-control-sm shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

/** Side sheet (right on desktop, bottom on phones). Built on the same Radix primitive for focus trapping & Escape. */
export function Drawer({ open, onOpenChange, title, description, children, side = 'right', className, footer }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; side?: 'right' | 'left' | 'bottom'; className?: string; footer?: React.ReactNode
}) {
  const pos = side === 'right'
    ? 'inset-y-0 right-0 h-dvh w-full max-w-md border-l data-[state=open]:animate-slide-in-right'
    : side === 'left'
      ? 'inset-y-0 left-0 h-dvh w-full max-w-md border-r data-[state=open]:animate-slide-in-left'
      : 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t'
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <DialogPrimitive.Content className={cn('fixed z-50 flex flex-col border-border bg-surface shadow-pop focus:outline-none', pos, className)}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-fg-subtle">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="-mr-1 -mt-1 flex size-control-sm shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-border px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
