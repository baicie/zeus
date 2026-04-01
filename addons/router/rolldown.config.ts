import replace from '@rollup/plugin-replace'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RolldownOptions } from 'rolldown'
import { rolldownPlugin } from '@zeus-js/build-tools/rolldown'
import { dts } from 'rolldown-plugin-dts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

const pkg = require('./package.json')
const masterVersion = require('../../package.json').version

const resolve = (p: string) => path.resolve(__dirname, p)

const banner = `/**
 * @zeus-js/router v${masterVersion}
 * (c) ${new Date().getFullYear()} baicie
 * Released under the MIT License.
 **/`

// Externalize all workspace dependencies
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]

// Path aliases for workspace packages
const alias: Record<string, string> = {}

// ESM build
const esmConfig: RolldownOptions = {
  input: 'src/index.ts',
  external,
  resolve: { alias },
  plugins: [
    dts({
      tsconfig: './tsconfig.json',
    }),
    rolldownPlugin(),
  ],
  output: {
    dir: './dist/esm',
    entryFileNames: '[name].mjs',
    chunkFileNames: 'chunk/[name]-[hash].mjs',
    format: 'esm',
    sourcemap: true,
    banner,
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

// CJS build
const cjsConfig: RolldownOptions = {
  input: 'src/index.ts',
  external,
  resolve: { alias },
  plugins: [rolldownPlugin()],
  output: {
    dir: './dist/cjs',
    entryFileNames: '[name].cjs',
    chunkFileNames: 'chunk/[name]-[hash].cjs',
    format: 'cjs',
    sourcemap: true,
    exports: 'named',
    banner,
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

export default [esmConfig, cjsConfig]
