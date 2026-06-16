import { resolve } from 'node:path'

import { publish } from '@baicie/release'

const devtoolsPackages: Record<string, string> = {
  'create-zeus': 'packages/devtools/create-zeus',
  'vite-plugin': 'packages/devtools/vite-plugin',
}

publish({
  defaultPackage: 'create-zeus',
  getPkgDir: pkgName => {
    const rel =
      devtoolsPackages[pkgName] ??
      devtoolsPackages[pkgName.replace(/^@[^/]+\//, '')]
    return resolve(process.cwd(), rel ?? `packages/${pkgName}`)
  },
  provenance: true,
  packageManager: 'pnpm',
})
