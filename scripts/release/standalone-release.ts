import { resolve } from 'node:path'

import { release } from '@baicie/release'

import { findWorkspacePackages } from '../shared/utils.ts'

/**
 * The packages with their own version line, released outside the fixed group.
 *
 * Resolved from the workspace rather than a path table, for the same reason
 * `standalone-publish` is: a hand-maintained path table is what broke the
 * native artifact copy during the six-domain move.
 *
 * This list and the one in `standalone-publish.ts` must agree. They are two
 * halves of one decision — a package that can be versioned but not published,
 * or published but not versioned, is a package with a release path that does
 * not work. `standalone-packages.spec.ts` asserts they match.
 */
const standalonePackages = [
  'create-zeus',
  'vite-plugin',
  '@zeus-js/devtools-consumer',
]

function packageDir(pkgName: string): string {
  const match = findWorkspacePackages().find(
    pkg => pkg.name === pkgName || pkg.name === `@zeus-js/${pkgName}`,
  )
  if (!match) {
    throw new Error(
      `${pkgName} is not a workspace package; standalone release cannot resolve its directory`,
    )
  }
  return resolve(match.dir)
}

release({
  repo: 'baicie/zeus',
  packages: standalonePackages,
  linkedPackages: {},
  getPkgDir: packageDir,
  toTag: (pkg, version) => `${pkg}@${version}`,
})
