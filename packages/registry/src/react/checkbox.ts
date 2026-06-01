import type { RegistryItem } from '../schema'

export const reactCheckbox: RegistryItem = {
  name: 'checkbox',
  type: 'component',
  framework: 'react',
  description: 'Checkbox component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/checkbox.tsx',
      content: `import * as React from 'react'
import { ZCheckbox } from '@zeus-ui/headless/react'

import { cn } from '@/lib/utils'

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof ZCheckbox> {}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof ZCheckbox>,
  CheckboxProps
>(function Checkbox(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZCheckbox
      ref={ref}
      className={cn(
        [
          'h-4 w-4 shrink-0 rounded-sm border border-[hsl(var(--z-primary))]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
          'data-[state=checked]:bg-[hsl(var(--z-primary))] data-[state=checked]:text-[hsl(var(--z-primary-foreground))]',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        ].join(' '),
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
