import path from 'node:path'

import type { ZeusUiConfig } from './config'

export function resolveAliasPath(config: ZeusUiConfig, value: string): string {
  return path.resolve(process.cwd(), value)
}

export function transformTemplate(
  content: string,
  config: ZeusUiConfig,
): string {
  return content
    .split('@/components')
    .join(config.aliases.components)
    .split('@/components/ui')
    .join(config.aliases.ui)
    .split('@/lib')
    .join(config.aliases.lib)
    .split('@/styles')
    .join(config.aliases.styles)
}
