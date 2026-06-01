import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = (variant: string, size: string) =>
  cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
    'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--z-ring))]',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&[data-disabled]]:pointer-events-none [&[data-disabled]]:opacity-50',
    variant === 'default' &&
      'bg-[hsl(var(--z-primary))] text-[hsl(var(--z-primary-foreground))] shadow hover:opacity-90',
    variant === 'destructive' &&
      'bg-[hsl(var(--z-destructive))] text-[hsl(var(--z-destructive-foreground))] shadow-sm hover:opacity-90',
    variant === 'outline' &&
      'border border-[hsl(var(--z-input))] bg-transparent shadow-sm hover:bg-[hsl(var(--z-muted))]',
    variant === 'secondary' &&
      'bg-[hsl(var(--z-secondary))] text-[hsl(var(--z-secondary-foreground))] shadow-sm hover:opacity-90',
    variant === 'ghost' &&
      'hover:bg-[hsl(var(--z-muted))] hover:text-[hsl(var(--z-foreground))]',
    variant === 'link' &&
      'text-[hsl(var(--z-primary))] underline-offset-4 hover:underline',
    size === 'sm' && 'h-8 rounded-md px-3 text-xs',
    size === 'md' && 'h-9 px-4 py-2',
    size === 'lg' && 'h-10 rounded-md px-8',
    size === 'icon' && 'h-9 w-9',
  )

export interface ButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  variant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'secondary'
    | 'destructive'
    | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = 'default', size = 'md', ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants(variant, size), className)}
        {...props}
      />
    )
  },
)
