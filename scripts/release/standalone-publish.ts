import { resolve } from 'node:path'

import { publish } from '@baicie/release'

import { findWorkspacePackages } from '../shared/utils.ts'

/**
 * The packages with their own version line, published outside the fixed group.
 *
 * Resolved from the workspace rather than a path table: the six-domain move
 * changed where these live, and a table that has to be updated by hand is how
 * the native artifact copy broke. A missing entry is reported instead of
 * falling back to a path that silently does not exist.
 */
const standalonePackages = new Set(['create-zeus', '@zeus-js/vite-plugin'])

function packageDir(pkgName: string): string {
  const match = findWorkspacePackages().find(
    pkg => pkg.name === pkgName || pkg.name === `@zeus-js/${pkgName}`,
  )
  if (!match) {
    throw new Error(
      `${pkgName} is not a workspace package; standalone publishing cannot resolve its directory`,
    )
  }
  return resolve(match.dir)
}

publish({
  defaultPackage: 'create-zeus',
  getPkgDir: pkgName => {
    if (
      !standalonePackages.has(pkgName) &&
      !standalonePackages.has(`@zeus-js/${pkgName}`)
    ) {
      throw new Error(
        `${pkgName} is not published standalone; add it to standalonePackages with a reason`,
      )
    }
    return packageDir(pkgName)
  },
  provenance: true,
  packageManager: 'pnpm',
})
