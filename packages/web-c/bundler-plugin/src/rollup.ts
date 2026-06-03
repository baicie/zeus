import { createZeusBundlerPlugin } from './core'

import type { ZeusBundlerPluginOptions } from './types'
import type { Plugin } from 'rollup'

export default function zeus(options: ZeusBundlerPluginOptions = {}): Plugin {
  return createZeusBundlerPlugin(options, {
    target: 'rollup',
  }) as Plugin
}

export { zeus }

export interface ZeusRollupConfigOptions extends Omit<
  import('rollup').RollupOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions

  plugins?: import('rollup').RollupOptions['plugins']
}

export function defineZeusRollupConfig(
  config: ZeusRollupConfigOptions = {},
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
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

function normalizePlugins(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: any,
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any[] {
  if (!plugins) return []

  return Array.isArray(plugins)
    ? plugins.filter(Boolean)
    : [plugins].filter(Boolean)
}
