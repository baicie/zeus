import { createZeusBundlerPlugin } from './core'
import { collectPluginExternals, mergeExternal } from './external'

import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'
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
  const {
    zeus: zeusOptions = {},
    plugins,
    input,
    output,
    external,
    ...rest
  } = config
  const pluginExternals = collectPluginExternals(zeusOptions, {
    includeZeusLibraryExternals: true,
  })

  return {
    input: input ?? 'src/index.ts',

    ...rest,

    external: pluginExternals.length
      ? mergeExternal(
          external as RollupExternalOption | undefined,
          pluginExternals,
        )
      : external,

    plugins: [zeus(zeusOptions), ...normalizePlugins(plugins)],

    output: output ?? {
      dir: 'dist',
      format: 'es',
      chunkFileNames: 'chunks/[name]-[hash].js',
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
