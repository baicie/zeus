import type { DtsMode, ZeusBuildContext } from './types'

export function resolvePluginDts(
  value: DtsMode | undefined,
  ctx: ZeusBuildContext,
): boolean {
  if (value === true) return true
  if (value === false) return false

  return ctx.dts.enabled
}
