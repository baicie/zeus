import { resolve } from 'node:path'

import { publish } from '@baicie/release'

publish({
  defaultPackage: '@baicie/create-zeus',
  getPkgDir: pkgName => {
    const map: Record<string, string> = {
      '@baicie/create-zeus': 'packages/devtools/create-zeus',
      '@baicie/vite-plugin': 'packages/devtools/vite-plugin',
      'create-zeus': 'packages/devtools/create-zeus',
      'vite-plugin': 'packages/devtools/vite-plugin',
    }
    return resolve(process.cwd(), map[pkgName] ?? `packages/${pkgName}`)
  },
  provenance: true,
  packageManager: 'pnpm',
})
