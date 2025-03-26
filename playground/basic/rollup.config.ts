import { defineConfig } from 'rollup'
import esbuild from 'rollup-plugin-esbuild'
import dts from 'rollup-plugin-dts'
import { zeusRollupPlugin } from '@zeus.js/compiler'

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
      esbuild({
        target: 'es2020',
        jsx: 'preserve',
        tsconfig: 'tsconfig.json',
      }),
    ],
    external: ['@zeus.js/core', 'reflect-metadata'],
  },
])
