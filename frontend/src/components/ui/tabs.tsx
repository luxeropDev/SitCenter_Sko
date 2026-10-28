import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('inline-flex h-control max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1 text-fg-muted', className)} {...props} />
))
TabsList.displayName = 'TabsList'
export const TabsTrigger = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-(--duration-fast) hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-xs', className)}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'
export const TabsContent = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
))
TabsContent.displayName = 'TabsContent'
