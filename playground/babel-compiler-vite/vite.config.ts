import { transformAsync } from '@babel/core'
import presetTs from '@babel/preset-typescript'
import zeusJSXPlugin from '../../packages/compiler/src/plugin.ts'
import { type Plugin, defineConfig } from 'vite'

function zeusJSXPluginCompat(api: unknown, options?: Record<string, unknown>) {
  const plugin = zeusJSXPlugin(api, options) as {
    inherits?: unknown
  }
  if (
    plugin.inherits &&
    typeof plugin.inherits !== 'function' &&
    typeof (plugin.inherits as { default?: unknown }).default === 'function'
  ) {
    plugin.inherits = (plugin.inherits as { default: unknown }).default
  }
  return plugin
}

function zeusBabelPlugin(): Plugin {
  return {
    name: 'zeus-babel-compiler-playground',
    enforce: 'pre',
    async transform(code, id) {
      const filepath = id.split('?')[0]
      if (!/\.[jt]sx$/.test(filepath)) {
        return null
      }

      const result = await transformAsync(code, {
        filename: filepath,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        presets: [
          [
            presetTs,
            { allExtensions: true, isTSX: true, onlyRemoveTypeImports: true },
          ],
        ],
        plugins: [
          [
            zeusJSXPluginCompat,
            { moduleName: '@zeus-js/core', ssrModuleName: '@zeus-js/core' },
          ],
        ],
      })

      if (!result || !result.code) {
        return null
      }

      return {
        code: result.code,
        map: result.map || null,
      }
    },
  }
}

export default defineConfig({
  plugins: [zeusBabelPlugin()],
  build: {
    minify: false,
  },
})
