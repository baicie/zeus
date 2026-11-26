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
  /*
   * The browser compiler host. It was `private: true` because it used to ship
   * inside the Playground's own build; that assumption ended when the
   * Playground moved to `zeus-ecosystem`, which may only install published
   * packages. Same situation as `@zeus-js/devtools-consumer` above.
   */
  '@zeus-js/compiler-wasm',
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
  /*
   * The tag is the bare name, not the npm name.
   *
   * `@zeus-js/devtools-consumer@0.1.1-beta.15` does not match any trigger in
   * `devtools-release.yml`, whose patterns are `create-zeus@*`,
   * `vite-plugin@*` and `devtools-consumer@*`. A tag nothing matches is a tag
   * that publishes nothing — and the dry run is what showed the mismatch:
   * `toTag` receives the npm name, and no one strips the scope.
   *
   * Every existing tag in this repository is already bare (`vite-plugin@0.0.5`),
   * so this matches what the release lines actually look like.
   */
  toTag: (pkg, version) => `${pkg.replace(/^@zeus-js\//, '')}@${version}`,
})
