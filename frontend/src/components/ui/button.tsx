import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-(--duration-fast) ease-(--ease-standard) select-none cursor-pointer disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg shadow-xs hover:bg-accent-hover',
        secondary: 'bg-surface border border-border text-fg shadow-xs hover:bg-surface-2',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-2',
        danger: 'bg-risk-high text-white shadow-xs hover:bg-risk-high/90',
        soft: 'bg-accent-soft text-accent hover:bg-accent-soft/80',
        link: 'text-accent underline-offset-4 hover:underline h-auto px-0',
      },
      size: {
        default: 'h-control px-4',
        sm: 'h-control-sm px-3 text-[13px]',
        lg: 'h-control-lg px-5 text-[15px] rounded-lg',
        icon: 'size-control',
        iconSm: 'size-control-sm [&_svg]:size-4',
        iconLg: 'size-control-lg [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
  if (asChild) {
    return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>{children}</Slot>
  }
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  )
})
Button.displayName = 'Button'

/** Icon-only button: requires an accessible label. */
export const IconButton = React.forwardRef<HTMLButtonElement, Omit<ButtonProps, 'size'> & { label: string; size?: 'sm' | 'md' | 'lg' }>(({ label, size = 'md', variant = 'ghost', ...props }, ref) => (
  <Button ref={ref} variant={variant} size={size === 'sm' ? 'iconSm' : size === 'lg' ? 'iconLg' : 'icon'} aria-label={label} title={label} {...props} />
))
IconButton.displayName = 'IconButton'

export { buttonVariants }
