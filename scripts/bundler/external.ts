export function createExternalMatcher(
  packageIds: ReadonlyArray<string>,
): (id: string) => boolean {
  const roots = [...new Set(packageIds)]

  return id => roots.some(root => id === root || id.startsWith(`${root}/`))
}
