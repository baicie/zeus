import type {
  ZeusBundlerPluginOptions,
  ZeusComponentHostConfig,
  ZeusComponentPlugin,
} from './types'

export function componentHost(
  config: ZeusComponentHostConfig,
): ZeusBundlerPluginOptions {
  return {
    root: config.root,
    components: config.components,
    compiler: config.compiler,
    diagnostics: config.diagnostics,
    output: config.output,
    plugins: config.plugins,
  }
}

export function resolveComponentPlugins(
  options: ZeusBundlerPluginOptions,
): ZeusComponentPlugin[] {
  return options.plugins ?? options.outputs ?? []
}
