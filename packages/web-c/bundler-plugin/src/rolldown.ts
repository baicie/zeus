import { createZeusBundlerPlugin } from './core'

import type { ZeusBundlerPluginOptions } from './types'
import type { Plugin, RolldownOptions } from 'rolldown'

export default function zeus(options: ZeusBundlerPluginOptions = {}): Plugin {
  return createZeusBundlerPlugin(options, {
    target: 'rolldown',
  }) as unknown as Plugin
}

export { zeus }

export interface ZeusRolldownConfigOptions extends Omit<
  RolldownOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions

  plugins?: RolldownOptions['plugins']
}

export function defineZeusRolldownConfig(
  config: ZeusRolldownConfigOptions = {},
): RolldownOptions {
  const { zeus: zeusOptions, plugins, input, output, ...rest } = config

  return {
    input: input ?? 'src/index.ts',

    ...rest,

    plugins: [zeus(zeusOptions), ...normalizePlugins(plugins)],

    output: output ?? {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
    },
  }
}

function normalizePlugins(plugins: RolldownOptions['plugins']): Plugin[] {
  if (!plugins) return []

  return Array.isArray(plugins)
    ? (plugins.filter(Boolean) as Plugin[])
    : ([plugins].filter(Boolean) as Plugin[])
}
