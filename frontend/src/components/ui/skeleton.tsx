import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-5', className)} aria-hidden>
      <Skeleton className="mb-3 h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className={cn('mb-2 h-3', i % 2 ? 'w-3/4' : 'w-full')} />)}
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9" />)}
    </div>
  )
}

/** Translucent overlay shown while a region refreshes but still has data. */
export function LoadingOverlay({ active, label }: { active: boolean; label?: string }) {
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-surface/60 backdrop-blur-[1px]" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-fg-muted shadow-raised"><Loader2 className="size-3.5 animate-spin" />{label}</span>
    </div>
  )
}
