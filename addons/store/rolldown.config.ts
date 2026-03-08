import replace from '@rollup/plugin-replace'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RolldownOptions } from 'rolldown'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

const pkg = require('./package.json')
const masterVersion = require('../../package.json').version

const resolve = (p: string) => path.resolve(__dirname, p)

const banner = `/**
 * @zeus-js/store v${masterVersion}
 * (c) ${new Date().getFullYear()} baicie
 * Released under the MIT License.
 **/`

// Externalize all workspace dependencies
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]

// Path aliases for workspace packages
const alias: Record<string, string> = {
  '@zeus-js/signal': resolve('../../packages/signal/src/index.ts'),
  '@zeus-js/shared': resolve('../../packages/shared/src/index.ts'),
  '@zeus-js/runtime-core': resolve('../../packages/runtime-core/src/index.ts'),
}

// Common plugins
const replaceValues = {
  __DEV__: "!!(process.env.NODE_ENV !== 'production')",
  __VERSION__: JSON.stringify(masterVersion),
  __BROWSER__: 'false',
  __CJS__: 'true',
  __SSR__: 'true',
  __TEST__: 'false',
}

// ESM build
const esmConfig: RolldownOptions = {
  input: resolve('src/index.ts'),
  external,
  resolve: { alias },
  output: {
    dir: resolve('dist'),
    format: 'esm',
    banner,
    entryFileNames: 'store.mjs',
    sourcemap: true,
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

// CJS build
const cjsConfig: RolldownOptions = {
  input: resolve('src/index.ts'),
  external,
  resolve: { alias },
  plugins: [
    replace({
      preventAssignment: true,
      values: replaceValues,
    }),
  ],
  output: {
    dir: resolve('dist'),
    format: 'cjs',
    banner,
    entryFileNames: 'store.cjs',
    exports: 'named',
    sourcemap: true,
    externalLiveBindings: false,
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

export default [esmConfig, cjsConfig]
