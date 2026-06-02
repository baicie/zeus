import * as React from 'react'

import { cn } from '@/lib/utils'

export const Dialog = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(function Dialog({ className, ...props }, ref) {
  return (
    <div ref={ref} className={cn('fixed inset-0 z-50', className)} {...props} />
  )
})

export const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function DialogTrigger({ className, ...props }, ref) {
  return <button ref={ref} className={className} {...props} />
})

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(function DialogContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'fixed inset-0 z-50',
        'data-[state=closed]:hidden',
        '[&_[part=overlay]]:fixed [&_[part=overlay]]:inset-0',
        '[&_[part=overlay]]:bg-black/50',
        '[&_[part=panel]]:fixed [&_[part=panel]]:left-1/2 [&_[part=panel]]:top-1/2',
        '[&_[part=panel]]:w-full [&_[part=panel]]:max-w-lg',
        '[&_[part=panel]]:-translate-x-1/2 [&_[part=panel]]:-translate-y-1/2',
        '[&_[part=panel]]:rounded-lg [&_[part=panel]]:border [&_[part=panel]]:border-[hsl(var(--z-border))]',
        '[&_[part=panel]]:bg-[hsl(var(--z-background))] [&_[part=panel]]:p-6',
        '[&_[part=panel]]:text-[hsl(var(--z-foreground))] [&_[part=panel]]:shadow-lg',
        className,
      )}
      {...props}
    />
  )
})

export const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(function DialogHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        className,
      )}
      {...props}
    />
  )
})

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<'h2'>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <h2
      ref={ref}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className,
      )}
      {...props}
    />
  )
})

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<'p'>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn('text-sm text-[hsl(var(--z-muted-foreground))]', className)}
      {...props}
    />
  )
})
