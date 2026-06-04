import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'

export function collectPluginExternals(
  options: ZeusBundlerPluginOptions,
): string[] {
  const set = new Set<string>()

  for (const plugin of options.plugins ?? []) {
    for (const dep of plugin.external ?? []) {
      set.add(dep)
    }
  }

  return Array.from(set)
}

export function mergeExternal(
  userExternal: RollupExternalOption | undefined,
  pluginExternal: string[],
): RollupExternalOption {
  if (!userExternal) {
    return pluginExternal
  }

  if (typeof userExternal === 'function') {
    return (source, importer, isResolved) => {
      return (
        pluginExternal.includes(source) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (userExternal as any)(source, importer, isResolved)
      )
    }
  }

  return [
    ...(Array.isArray(userExternal) ? userExternal : [userExternal]),
    ...pluginExternal,
  ]
}
