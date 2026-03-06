import replace from '@rollup/plugin-replace'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RolldownOptions } from 'rolldown'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

const pkg = require('./package.json')
const masterVersion = require('../../package.json').version
const name = 'router'

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
const alias: Record<string, string> = {
  '@zeus-js/signal': resolve('../../packages/signal/src/index.ts'),
  '@zeus-js/shared': resolve('../../packages/shared/src/index.ts'),
}

function createConfig(
  format: 'es' | 'cjs',
  outFile: string,
  prod = false,
): RolldownOptions {
  const isCJS = format === 'cjs'
  const isDev = !prod

  return {
    input: resolve('src/index.ts'),
    external,
    resolve: { alias },
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          __DEV__: isCJS
            ? isDev
              ? 'true'
              : "!!(process.env.NODE_ENV !== 'production')"
            : `!!(process.env.NODE_ENV !== 'production')`,
          __VERSION__: JSON.stringify(masterVersion),
          __BROWSER__: String(!isCJS),
          __CJS__: String(isCJS),
          __SSR__: String(isCJS),
          __TEST__: 'false',
        },
      }),
    ],
    output: {
      file: resolve(outFile),
      format,
      banner,
      exports: 'named',
      externalLiveBindings: false,
      ...(isCJS ? { esModule: true } : {}),
    },
    treeshake: {
      moduleSideEffects: false,
    },
  }
}

const configs: RolldownOptions[] = [
  // ESM for bundlers (e.g. Vite / webpack)
  createConfig('es', `dist/${name}.esm-bundler.js`),
  // CJS development build
  createConfig('cjs', `dist/${name}.cjs.js`),
  // CJS production build
  createConfig('cjs', `dist/${name}.cjs.prod.js`, true),
]

export default configs
