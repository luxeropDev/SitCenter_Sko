import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const controlBase = 'h-control w-full rounded-md border border-border bg-surface px-3 text-sm text-fg shadow-xs transition-[border-color,box-shadow] duration-(--duration-fast) placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <input ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, invalid && 'border-risk-high focus-visible:border-risk-high focus-visible:ring-risk-high/20', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, 'h-auto min-h-20 py-2', invalid && 'border-risk-high focus-visible:ring-risk-high/20', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-fg-muted', className)} {...props} />
}

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-risk-high" role="alert">{error}</p> : hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  )
}

/** Native select styled to match inputs (keyboard + mobile friendly). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ className, invalid, children, ...props }, ref) => (
  <span className={cn('relative inline-flex', className?.includes('w-full') && 'w-full')}>
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, 'w-auto cursor-pointer appearance-none pr-8', invalid && 'border-risk-high', className)} {...props}>{children}</select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
  </span>
))
NativeSelect.displayName = 'NativeSelect'
export const Select = NativeSelect

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: React.ReactNode }>(({ className, label, id, ...props }, ref) => {
  const gen = React.useId()
  const cid = id ?? gen
  return (
    <label htmlFor={cid} className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-fg', props.disabled && 'cursor-not-allowed opacity-50', className)}>
      <input ref={ref} id={cid} type="checkbox" className="size-4 shrink-0 cursor-pointer rounded-[5px] border-border-strong accent-(--accent)" {...props} />
      {label}
    </label>
  )
})
Checkbox.displayName = 'Checkbox'

/** iOS-like segmented control for small option sets (ranges, themes, languages). */
export function SegmentedControl<T extends string>({ value, onChange, options, label, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; label: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-[background-color,color,box-shadow] duration-(--duration-fast)',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg')}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}
