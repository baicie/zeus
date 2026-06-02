import type { RegistryItem } from '../schema'

export const reactTabs: RegistryItem = {
  name: 'tabs',
  type: 'component',
  framework: 'react',
  description: 'Tabs component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/tabs.tsx',
      content: `import * as React from 'react'
import {
  ZTabs,
  ZTabList,
  ZTab,
  ZTabPanel,
} from '@zeus-ui/headless/react'

import { cn } from '@/lib/utils'

export const Tabs = ZTabs
export const TabsList = ZTabList
export const TabsTrigger = ZTab
export const TabsContent = ZTabPanel

export interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof ZTabs> {}

export const TabsRoot = React.forwardRef<
  React.ElementRef<typeof ZTabs>,
  TabsProps
>(function TabsRoot(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZTabs
      ref={ref}
      className={cn('flex flex-col', className)}
      {...props}
    />
  )
})
`,
    },
  ],
}
