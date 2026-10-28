import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<React.ComponentRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn('peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-(--duration-base) data-[state=checked]:bg-success data-[state=unchecked]:bg-border-strong disabled:cursor-not-allowed disabled:opacity-50', className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-raised transition-transform duration-(--duration-base) ease-(--ease-standard) data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

export function SwitchField({ label, hint, className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { label: React.ReactNode; hint?: React.ReactNode }) {
  const id = React.useId()
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-center justify-between gap-4 rounded-md py-1.5', className)}>
      <span className="flex flex-col"><span className="text-sm text-fg">{label}</span>{hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}</span>
      <Switch id={id} {...props} />
    </label>
  )
}
