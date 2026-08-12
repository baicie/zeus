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

export function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}
