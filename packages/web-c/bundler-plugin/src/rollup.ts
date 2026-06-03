import { createZeusBundlerPlugin } from './core'

import type { ZeusBundlerPluginOptions } from './types'
import type { Plugin, RollupOptions } from 'rollup'

export default function zeus(options: ZeusBundlerPluginOptions = {}): Plugin {
  return createZeusBundlerPlugin(options, {
    target: 'rollup',
  }) as Plugin
}

export { zeus }

export interface ZeusRollupConfigOptions extends Omit<
  RollupOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions

  plugins?: RollupOptions['plugins']
}

export function defineZeusRollupConfig(
  config: ZeusRollupConfigOptions = {},
): RollupOptions {
  const { zeus: zeusOptions, plugins, input, output, ...rest } = config

  return {
    input: input ?? 'src/index.ts',

    ...rest,

    plugins: [zeus(zeusOptions), ...normalizePlugins(plugins)],

    output: output ?? {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
    },
  }
}

function normalizePlugins(plugins: RollupOptions['plugins']): Plugin[] {
  if (!plugins) return []

  return Array.isArray(plugins)
    ? (plugins.filter(Boolean) as Plugin[])
    : ([plugins].filter(Boolean) as Plugin[])
}
