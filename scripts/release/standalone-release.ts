import { resolve } from 'node:path'

import { release } from '@baicie/release'

const devtoolsPackages = ['create-zeus', 'vite-plugin']

const pkgDirMap: Record<string, string> = {
  'create-zeus': 'packages/devtools/create-zeus',
  'vite-plugin': 'packages/devtools/vite-plugin',
}

release({
  repo: 'baicie/zeus',
  packages: devtoolsPackages,
  linkedPackages: {},
  getPkgDir: pkgName =>
    resolve(process.cwd(), pkgDirMap[pkgName] ?? `packages/${pkgName}`),
  toTag: (pkg, version) => `${pkg}@${version}`,
})
