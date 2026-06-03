import type { RollupExternalOption } from './types'

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
