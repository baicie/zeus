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
 * @zeus-playground/web-components v${masterVersion}
 * (c) ${new Date().getFullYear()} baicie
 * Released under the MIT License.
 **/`

// Externalize workspace dependencies
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]

// Common replacement values
const replaceValues = {
  __DEV__: "!!(process.env.NODE_ENV !== 'production')",
  __VERSION__: JSON.stringify(masterVersion),
  __BROWSER__: 'true',
  __CJS__: 'false',
  __SSR__: 'false',
  __TEST__: 'false',
  __GLOBAL__: 'false',
  __ESM_BUNDLER__: 'true',
  __ESM_BROWSER__: 'true',
}

// ESM build (for bundlers)
const esmConfig: RolldownOptions = {
  input: resolve('src/main.ts'),
  external,
  output: {
    dir: resolve('dist'),
    format: 'esm',
    banner,
    entryFileNames: 'web-components.mjs',
    sourcemap: true,
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

// CJS build
const cjsConfig: RolldownOptions = {
  input: resolve('src/main.ts'),
  external,
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
    entryFileNames: 'web-components.cjs',
    exports: 'named',
    sourcemap: true,
    externalLiveBindings: false,
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

// IIFE build (for direct browser usage)
const iifeConfig: RolldownOptions = {
  input: resolve('src/main.ts'),
  external: [],
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        ...replaceValues,
        __GLOBAL__: 'true',
      },
    }),
  ],
  output: {
    dir: resolve('dist'),
    format: 'iife',
    banner,
    entryFileNames: 'web-components.global.js',
    name: 'ZeusWebComponents',
    sourcemap: true,
    globals: {
      '@zeus-js/core': 'ZeusCore',
      '@zeus-js/web-components': 'ZeusWebComponents',
    },
  },
  treeshake: {
    moduleSideEffects: false,
  },
}

export default [esmConfig, cjsConfig, iifeConfig]
