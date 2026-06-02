import type { RegistryItem } from '../schema'

export const reactDialog: RegistryItem = {
  name: 'dialog',
  type: 'component',
  framework: 'react',
  description: 'Dialog components built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/dialog.tsx',
      content: `import * as React from 'react'
import {
  ZDialog,
  ZDialogContent,
  ZDialogDescription,
  ZDialogTitle,
  ZDialogTrigger,
} from '@zeus-ui/headless/react'

import { cn } from '@/lib/utils'

export const Dialog = ZDialog
export const DialogTrigger = ZDialogTrigger

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof ZDialogContent>,
  React.ComponentPropsWithoutRef<typeof ZDialogContent>
>(function DialogContent(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZDialogContent
      ref={ref}
      className={cn(
        [
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
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
})

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof ZDialogTitle>,
  React.ComponentPropsWithoutRef<typeof ZDialogTitle>
>(function DialogTitle(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZDialogTitle
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
  React.ElementRef<typeof ZDialogDescription>,
  React.ComponentPropsWithoutRef<typeof ZDialogDescription>
>(function DialogDescription(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZDialogDescription
      ref={ref}
      className={cn(
        'text-sm text-[hsl(var(--z-muted-foreground))]',
        className,
      )}
      {...props}
    />
  )
})
`,
    },
  ],
}
