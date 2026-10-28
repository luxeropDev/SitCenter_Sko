import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-border bg-surface-2 text-fg-muted',
      accent: 'border-transparent bg-accent-soft text-accent',
      success: 'border-transparent bg-success-soft text-success',
      low: 'border-transparent bg-risk-low-soft text-risk-low',
      medium: 'border-transparent bg-risk-medium-soft text-risk-medium',
      high: 'border-transparent bg-risk-high-soft text-risk-high',
      unknown: 'border-transparent bg-risk-unknown-soft text-risk-unknown',
      outline: 'border-border-strong text-fg-muted bg-transparent',
    },
    size: { sm: '', md: 'px-2.5 py-1 text-xs' },
  },
  defaultVariants: { variant: 'default', size: 'sm' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

/** Colored dot + label. Never relies on color alone: the label is always rendered. */
export function StatusIndicator({ tone, label, pulse, className }: { tone: 'low' | 'medium' | 'high' | 'unknown' | 'accent' | 'success'; label: React.ReactNode; pulse?: boolean; className?: string }) {
  const color = { low: 'bg-risk-low text-risk-low', medium: 'bg-risk-medium text-risk-medium', high: 'bg-risk-high text-risk-high', unknown: 'bg-risk-unknown text-risk-unknown', accent: 'bg-accent text-accent', success: 'bg-success text-success' }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-fg-muted', className)}>
      <span className={cn('inline-block size-2 shrink-0 rounded-full', color, pulse && 'live-dot')} aria-hidden />
      <span>{label}</span>
    </span>
  )
}
