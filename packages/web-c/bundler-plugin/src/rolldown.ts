import { createZeusBundlerPlugin } from './core'
import { collectPluginExternals, mergeExternal } from './external'

import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'
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
  const {
    zeus: zeusOptions = {},
    plugins,
    input,
    output,
    external,
    transform,
    ...rest
  } = config
  const pluginExternals = collectPluginExternals(zeusOptions, {
    includeZeusLibraryExternals: true,
  })

  return {
    input: input ?? 'src/index.ts',

    ...rest,

    external: pluginExternals.length
      ? (mergeExternal(
          external as RollupExternalOption | undefined,
          pluginExternals,
        ) as RolldownOptions['external'])
      : external,

    plugins: [zeus(zeusOptions), ...normalizePlugins(plugins)],

    transform: {
      target: 'es2016',
      ...transform,
    },

    output: output ?? {
      dir: 'dist',
      format: 'esm',
      chunkFileNames: 'chunks/[name]-[hash].js',
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
