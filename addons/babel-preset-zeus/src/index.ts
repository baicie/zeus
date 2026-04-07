import type { ConfigAPI, PluginItem } from '@babel/core'
import presetTs from '@babel/preset-typescript'
import zeusJSXPlugin from '@zeus-js/compiler'
import type { CompilerOptions } from '@zeus-js/compiler'

export default function zeusPreset(
  _api: ConfigAPI,
  options: CompilerOptions = {},
): { presets: PluginItem[]; plugins: PluginItem[] } {
  return {
    presets: [
      [
        presetTs,
        {
          allExtensions: true,
          isTSX: true,
          onlyRemoveTypeImports: true,
        },
      ],
    ],
    plugins: [[zeusJSXPlugin, options]],
  }
}
