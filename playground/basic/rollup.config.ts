import { defineConfig } from 'rollup'
import esbuild from 'rollup-plugin-esbuild'
import dts from 'rollup-plugin-dts'
import { zeusRollupPlugin } from '@zeus/compiler'
import { outputPlugin } from '@zeus/output'

export default defineConfig([
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.mjs',
        format: 'es',
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
      },
    ],
    plugins: [
      zeusRollupPlugin(),
      esbuild(),
      outputPlugin({
        targets: [
          {
            type: 'react',
            outDir: 'dist/react',
          },
          {
            type: 'vue',
            outDir: 'dist/vue',
          },
        ],
        components: [],
      }),
    ],
    external: ['@zeus/core'],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
])
