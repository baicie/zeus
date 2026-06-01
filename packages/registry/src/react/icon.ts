import type { RegistryItem } from '../schema'

export const reactIcon: RegistryItem = {
  name: 'icon',
  type: 'component',
  framework: 'react',
  description: 'Icon component built on @zeus-ui/headless.',

  dependencies: [{ name: '@zeus-ui/headless' }],

  files: [
    {
      path: 'src/components/ui/icon.tsx',
      content: `import * as React from 'react'
import {
  CheckIcon,
  XIcon,
} from '@zeus-ui/headless/icons/react'

export type {
  IconProps,
} from '@zeus-ui/headless/icons/react'
`,
    },
  ],
}
