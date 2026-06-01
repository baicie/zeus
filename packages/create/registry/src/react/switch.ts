import type { RegistryItem } from '../schema'

export const reactSwitch: RegistryItem = {
  name: 'switch',
  type: 'component',
  framework: 'react',
  description: 'Switch component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/switch.tsx',
      content: `import * as React from 'react'
import { ZSwitch } from '@zeus-ui/headless/react'

import { cn } from '@/lib/utils'

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof ZSwitch> {}

export const Switch = React.forwardRef<
  React.ElementRef<typeof ZSwitch>,
  SwitchProps
>(function Switch(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZSwitch
      ref={ref}
      className={cn(
        [
          'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
          'data-[state=checked]:bg-[hsl(var(--z-primary))]',
          'data-[state=unchecked]:bg-[hsl(var(--z-input))]',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          '[&_[part=thumb]]:pointer-events-none [&_[part=thumb]]:block [&_[part=thumb]]:h-4 [&_[part=thumb]]:w-4',
          '[&_[part=thumb]]:rounded-full [&_[part=thumb]]:bg-[hsl(var(--z-background))] [&_[part=thumb]]:shadow',
          '[&_[part=thumb]]:transition-transform',
          'data-[state=checked]:[&_[part=thumb]]:translate-x-4',
          'data-[state=unchecked]:[&_[part=thumb]]:translate-x-0',
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
