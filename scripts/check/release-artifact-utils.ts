export function findMissingRequiredPaths(
  packedFiles: readonly string[],
  requiredPaths: readonly string[],
  options: { requireBinaries?: boolean } = {},
): string[] {
  const packed = packedFiles.map(normalizePath)
  return requiredPaths.filter(requiredPath => {
    const normalized = normalizePath(requiredPath)
    if (!options.requireBinaries && normalized.endsWith('.node')) return false
    return !packed.some(
      file => file === normalized || file.startsWith(`${normalized}/`),
    )
  })
}

/**
 * Copyright line of the installed @vue/reactivity and @vue/shared LICENSE.
 * See docs/adr/reactivity-upstream-ledger.md for the provenance audit.
 */
export const VUE_COPYRIGHT = 'Copyright (c) 2018-present, Yuxi (Evan) You'

/**
 * Release packages whose published files contain code derived from
 * @vue/reactivity or @vue/shared, either in their own source (signal, shared)
 * or by inlining signal/shared into browser builds (runtime-dom, router, zeus).
 */
export const vueDerivedPackages: ReadonlySet<string> = new Set([
  '@zeus-js/shared',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/router',
  '@zeus-js/zeus',
])

export function findVueLicenseProblems(
  packedFiles: readonly string[],
  licenseText: string | undefined,
): string[] {
  const problems: string[] = []
  if (!packedFiles.some(file => normalizePath(file) === 'LICENSE')) {
    problems.push('LICENSE is not present in the npm tarball')
  }
  if (!licenseText?.includes(VUE_COPYRIGHT)) {
    problems.push('LICENSE does not retain the upstream Vue copyright notice')
  }
  return problems
}

export function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}
