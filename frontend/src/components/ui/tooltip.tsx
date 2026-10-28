import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[1000] max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs leading-snug text-fg shadow-pop animate-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/** Small (i) icon with an explanatory tooltip, keyboard-focusable. */
export function InfoTip({ content, className }: { content: ReactNode; className?: string }) {
  return (
    <Tip content={content}>
      <button type="button" className={cn('inline-flex size-4 items-center justify-center rounded-full text-fg-subtle hover:text-fg', className)} aria-label={typeof content === 'string' ? content : 'Info'}>
        <Info className="size-3.5" aria-hidden />
      </button>
    </Tip>
  )
}
