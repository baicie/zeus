import { fileURLToPath, URL } from 'node:url'

import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'
import { defineConfig, type Plugin } from 'vite'

function zeusTsx(): Plugin {
  return {
    name: 'zeus-tsx',
    enforce: 'pre',
    async transform(code, id) {
      if (!/\.[tj]sx$/.test(id)) return null

      const result = await transformAsync(code, {
        filename: id,
        plugins: [zeusCompiler],
        parserOpts: {
          plugins: ['typescript', 'jsx'],
        },
        sourceType: 'module',
        configFile: false,
        babelrc: false,
      })

      return {
        code: result?.code ?? code,
        map: result?.map ?? null,
      }
    },
  }
}

export default defineConfig({
  plugins: [zeusTsx()],
  resolve: {
    alias: {
      '@zeus-js/runtime-dom': fileURLToPath(
        new URL(
          '../../packages/core/runtime-dom/src/index.ts',
          import.meta.url,
        ),
      ),
      '@zeus-js/zeus': fileURLToPath(
        new URL('../../packages/core/zeus/src/index.ts', import.meta.url),
      ),
    },
  },
  define: {
    __DEV__: 'true',
    __TEST__: 'false',
    __VERSION__: JSON.stringify('render-demo'),
  },
})
