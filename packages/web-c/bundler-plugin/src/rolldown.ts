import { createZeusBundlerPlugin } from './core'

import type { ZeusBundlerPluginOptions } from './types'
import type { Plugin } from 'rollup'

export default function zeus(options: ZeusBundlerPluginOptions = {}): Plugin {
  return createZeusBundlerPlugin(options, {
    target: 'rolldown',
  }) as Plugin
}

export { zeus }

export interface ZeusRolldownConfigOptions extends Omit<
  import('rolldown').RolldownOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions

  plugins?: import('rolldown').RolldownOptions['plugins']
}

export function defineZeusRolldownConfig(
  config: ZeusRolldownConfigOptions = {},
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
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
