import * as React from 'react'
import { ZButton } from '@zeus-ui/headless/react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
    'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--z-ring))]',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&[data-disabled]]:pointer-events-none [&[data-disabled]]:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-[hsl(var(--z-primary))] text-[hsl(var(--z-primary-foreground))] shadow hover:opacity-90',
        destructive:
          'bg-[hsl(var(--z-destructive))] text-[hsl(var(--z-destructive-foreground))] shadow-sm hover:opacity-90',
        outline:
          'border border-[hsl(var(--z-input))] bg-transparent shadow-sm hover:bg-[hsl(var(--z-muted))]',
        secondary:
          'bg-[hsl(var(--z-secondary))] text-[hsl(var(--z-secondary-foreground))] shadow-sm hover:opacity-90',
        ghost:
          'hover:bg-[hsl(var(--z-muted))] hover:text-[hsl(var(--z-foreground))]',
        link: 'text-[hsl(var(--z-primary))] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-9 px-4 py-2',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends
    Omit<React.ComponentPropsWithoutRef<typeof ZButton>, 'variant' | 'size'>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<
  React.ElementRef<typeof ZButton>,
  ButtonProps
>(function Button({ className, variant, size, ...props }, ref) {
  return (
    <ZButton
      ref={ref}
      variant={variant ?? 'default'}
      size={size ?? 'md'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})

export { buttonVariants }
