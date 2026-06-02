import * as React from 'react'

import { cn } from '@/lib/utils'

export interface TabsProps extends React.ComponentPropsWithoutRef<'div'> {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { defaultValue, value, onValueChange, className, children, ...props },
  ref,
) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '')
  const currentValue = value ?? internalValue

  const handleChange = React.useCallback(
    (v: string) => {
      if (value === undefined) setInternalValue(v)
      onValueChange?.(v)
    },
    [value, onValueChange],
  )

  return (
    <div ref={ref} className={className} data-value={currentValue} {...props}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{
              value?: string
              onChange?: (v: string) => void
            }>,
            {
              value: currentValue,
              onChange: handleChange,
            },
          )
        }
        return child
      })}
    </div>
  )
})

export interface TabsListProps extends React.ComponentPropsWithoutRef<'div'> {}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  function TabsList({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-lg p-1',
          className,
        )}
        {...props}
      />
    )
  },
)

export interface TabsTriggerProps extends React.ComponentPropsWithoutRef<'button'> {
  value: string
}

export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  TabsTriggerProps
>(function TabsTrigger({ className, value, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-[hsl(var(--z-background))] data-[state=active]:text-[hsl(var(--z-foreground))]',
        'data-[state=inactive]:text-[hsl(var(--z-muted-foreground))]',
        className,
      )}
      {...props}
    />
  )
})

export interface TabsPanelProps extends React.ComponentPropsWithoutRef<'div'> {
  value: string
}

export const TabsPanel = React.forwardRef<HTMLDivElement, TabsPanelProps>(
  function TabsPanel({ className, value, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'mt-2 ring-offset-background focus-visible:outline-none',
          className,
        )}
        {...props}
      />
    )
  },
)

export const TabsContent = TabsPanel
