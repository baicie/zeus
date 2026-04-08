import { createRequire } from 'node:module'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { dts } from 'rollup-plugin-dts'
import { defineConfig } from 'rollup'
import { zeusRollupPlugin } from '@zeus-js/rollup-plugin-zeus'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]

export default defineConfig([
  {
    input: 'src/index.ts',
    external,
    plugins: [
      nodeResolve({ extensions: ['.mjs', '.js', '.json', '.ts', '.tsx'] }),
      commonjs(),
      zeusRollupPlugin({
        options: {
          moduleName: '@zeus-js/core',
          ssrModuleName: '@zeus-js/core',
        },
      }),
    ],
    output: [
      {
        file: 'dist/esm/index.mjs',
        format: 'es',
        sourcemap: true,
      },
      {
        file: 'dist/cjs/index.cjs',
        format: 'cjs',
        exports: 'named',
        sourcemap: true,
      },
    ],
  },
  {
    input: 'src/index.ts',
    external,
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: {
      file: 'dist/esm/index.d.mts',
      format: 'es',
    },
  },
])
