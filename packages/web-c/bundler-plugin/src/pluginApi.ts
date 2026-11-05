import type { ZeusComponentPlugin, ZeusOutputFile } from './types'

/** The output plugin contract implemented by this `@zeus-js/bundler-plugin`. */
export const ZEUS_PLUGIN_API_VERSION = 1

export function assertPluginApiVersions(
  plugins: readonly ZeusComponentPlugin[],
): void {
  for (const plugin of plugins) {
    if (plugin.apiVersion !== ZEUS_PLUGIN_API_VERSION) {
      throw new Error(
        `[ZEUS_PLUGIN_API_VERSION] output plugin "${plugin.name}" targets plugin API ${String(plugin.apiVersion)}, but @zeus-js/bundler-plugin implements ${ZEUS_PLUGIN_API_VERSION}. Install versions of the plugin and @zeus-js/bundler-plugin that share an API version.`,
      )
    }
  }
}

/**
 * Records which plugin emits each output file, so two plugins can never
 * silently overwrite each other's file.
 */
export function createEmittedFileOwners(): (
  plugin: ZeusComponentPlugin,
  file: Pick<ZeusOutputFile, 'fileName'>,
) => void {
  const owners = new Map<string, string>()

  return (plugin, file) => {
    if (!file.fileName) return
    const owner = owners.get(file.fileName)
    if (owner !== undefined && owner !== plugin.name) {
      throw new Error(
        `[ZEUS_OUTPUT_CONFLICT] output plugins "${owner}" and "${plugin.name}" both emit "${file.fileName}".`,
      )
    }
    owners.set(file.fileName, plugin.name)
  }
}
