import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'

export type ZeusExternalEntry = string | RegExp

const ZEUS_LIBRARY_EXTERNALS: ZeusExternalEntry[] = [/^@zeus-js\//]

export function collectPluginExternals(
  options: ZeusBundlerPluginOptions,
  collectOptions: { includeZeusLibraryExternals?: boolean } = {},
): ZeusExternalEntry[] {
  const entries: ZeusExternalEntry[] = []

  if (collectOptions.includeZeusLibraryExternals) {
    entries.push(...ZEUS_LIBRARY_EXTERNALS)
  }

  for (const plugin of options.plugins ?? []) {
    for (const dep of plugin.external ?? []) {
      entries.push(dep)
    }
  }

  return uniqueExternalEntries(entries)
}

export function mergeExternal(
  userExternal: RollupExternalOption | undefined,
  pluginExternal: ZeusExternalEntry[],
): RollupExternalOption {
  if (!userExternal) {
    return pluginExternal
  }

  if (typeof userExternal === 'function') {
    return (source, importer, isResolved) => {
      return (
        matchesExternal(source, pluginExternal) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (userExternal as any)(source, importer, isResolved)
      )
    }
  }

  return uniqueExternalEntries([
    ...(Array.isArray(userExternal) ? userExternal : [userExternal]),
    ...pluginExternal,
  ])
}

function matchesExternal(
  source: string,
  entries: ZeusExternalEntry[],
): boolean {
  return entries.some(entry => {
    return typeof entry === 'string' ? entry === source : entry.test(source)
  })
}

function uniqueExternalEntries(
  entries: ZeusExternalEntry[],
): ZeusExternalEntry[] {
  const seen = new Set<string>()
  const result: ZeusExternalEntry[] = []

  for (const entry of entries) {
    const key =
      typeof entry === 'string'
        ? `s:${entry}`
        : `r:${entry.source}/${entry.flags}`

    if (seen.has(key)) continue

    seen.add(key)
    result.push(entry)
  }

  return result
}
