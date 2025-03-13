// @ts-check
import alias from '@rollup/plugin-alias'
import commonJS from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import { minify as minifySwc } from '@swc/core'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pico from 'picocolors'
import esbuild from 'rollup-plugin-esbuild'
import polyfillNode from 'rollup-plugin-polyfill-node'
import { entries } from './scripts/aliases.js'

/**
 * @template T
 * @template {keyof T} K
 * @typedef { Omit<T, K> & Required<Pick<T, K>> } MarkRequired
 */
/** @typedef {'cjs' | 'esm'} PackageFormat */
/** @typedef {MarkRequired<import('rollup').OutputOptions, 'file' | 'format'>} OutputOptions */

if (!process.env.TARGET) {
  throw new Error('TARGET package must be specified via --environment flag.')
}

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const masterVersion = require('./package.json').version

const packagesDir = path.resolve(__dirname, 'packages')
const packageDir = path.resolve(packagesDir, process.env.TARGET)

const resolve = (/** @type {string} */ p) => path.resolve(packageDir, p)
const pkg = require(resolve('package.json'))
const packageOptions = pkg.buildOptions || {}
const name = path.basename(packageDir)

const banner = `/**
* ${name} v${masterVersion}
* (c) ${new Date().getFullYear()} baicie
* Released under the MIT License.
**/`

/** @type {Record<PackageFormat, OutputOptions>} */
const outputConfigs = {
  esm: {
    file: resolve(`dist/${name}.esm.js`),
    format: 'es',
  },
  cjs: {
    file: resolve(`dist/${name}.cjs.js`),
    format: 'cjs',
  },
}

/** @type {ReadonlyArray<PackageFormat>} */
const defaultFormats = ['esm', 'cjs']
/** @type {ReadonlyArray<PackageFormat>} */
const inlineFormats = /** @type {any} */ (
  process.env.FORMATS && process.env.FORMATS.split(',')
)
/** @type {ReadonlyArray<PackageFormat>} */
const packageFormats = inlineFormats || packageOptions.formats || defaultFormats
const packageConfigs = process.env.PROD_ONLY
  ? []
  : packageFormats.map(format => createConfig(format, outputConfigs[format]))

if (process.env.NODE_ENV === 'production') {
  packageFormats.forEach(format => {
    if (packageOptions.prod === false) {
      return
    }
    if (format === 'cjs') {
      packageConfigs.push(createProductionConfig(format))
    }
    if (format === 'esm') {
      packageConfigs.push(createMinifiedConfig(format))
    }
  })
}

export default packageConfigs

/**
 *
 * @param {PackageFormat} format
 * @param {OutputOptions} output
 * @param {ReadonlyArray<import('rollup').Plugin>} plugins
 * @returns {import('rollup').RollupOptions}
 */
function createConfig(format, output, plugins = []) {
  if (!output) {
    console.log(pico.yellow(`invalid format: "${format}"`))
    process.exit(1)
  }

  const isProductionBuild =
    process.env.__DEV__ === 'false' || /\.prod\.js$/.test(output.file)
  const isServerRenderer = name === 'server-renderer'
  const isCJSBuild = format === 'cjs'
  const isESMBuild = format === 'esm'
  const isGlobalBuild = /global/.test(format)
  const isBrowserBuild =
    isGlobalBuild && !packageOptions.enableNonBrowserBranches

  output.banner = banner

  output.exports = 'named'
  if (isCJSBuild) {
    output.esModule = true
  }
  output.sourcemap = !!process.env.SOURCE_MAP
  output.externalLiveBindings = false
  // https://github.com/rollup/rollup/pull/5380
  output.reexportProtoFromExternal = false

  if (isGlobalBuild) {
    output.name = packageOptions.name
  }

  let entryFile = `src/index.ts`

  function resolveDefine() {
    /** @type {Record<string, string>} */
    const replacements = {
      __COMMIT__: `"${process.env.COMMIT}"`,
      __VERSION__: `"${masterVersion}"`,
      // this is only used during Vue's internal tests
      __TEST__: `false`,
      // If the build is expected to run directly in the browser (global / esm builds)
      __ESM_: String(isESMBuild),
      // is targeting Node (SSR)?
      __CJS__: String(isCJSBuild),
      // need SSR-specific branches?
      // __SSR__: String(!isGlobalBuild),
    }

    if (!isESMBuild) {
      // hard coded dev/prod builds
      replacements.__DEV__ = String(!isProductionBuild)
    }

    // allow inline overrides like
    //__RUNTIME_COMPILE__=true pnpm build runtime-core
    Object.keys(replacements).forEach(key => {
      if (key in process.env) {
        const value = process.env[key]
        assert(typeof value === 'string')
        replacements[key] = value
      }
    })
    return replacements
  }

  // esbuild define is a bit strict and only allows literal json or identifiers
  // so we still need replace plugin in some cases
  function resolveReplace() {
    /** @type {Record<string, import('@rollup/plugin-replace').Replacement>} */
    const replacements = {}

    if (isProductionBuild && isBrowserBuild) {
      Object.assign(replacements, {
        'context.onError(': `/*@__PURE__*/ context.onError(`,
        'emitError(': `/*@__PURE__*/ emitError(`,
        'createCompilerError(': `/*@__PURE__*/ createCompilerError(`,
        'createDOMCompilerError(': `/*@__PURE__*/ createDOMCompilerError(`,
      })
    }

    if (isESMBuild) {
      Object.assign(replacements, {
        // preserve to be handled by bundlers
        __DEV__: `!!(process.env.NODE_ENV !== 'production')`,
      })
    }

    // for compiler-sfc browser build inlined deps
    if (isESMBuild) {
      Object.assign(replacements, {
        'process.env': '({})',
        'process.platform': '""',
        'process.stdout': 'null',
      })
    }

    if (Object.keys(replacements).length) {
      return [replace({ values: replacements, preventAssignment: true })]
    } else {
      return []
    }
  }

  function resolveExternal() {
    const treeShakenDeps = []

    if (isGlobalBuild) {
      if (!packageOptions.enableNonBrowserBranches) {
        return treeShakenDeps
      }
    } else {
      const res = [
        ...Object.keys(pkg.dependencies || {})?.filter(
          dep => !packageOptions.inline?.includes(dep)
        ),
        ...Object.keys(pkg.peerDependencies || {}),
        ...treeShakenDeps,
        ...(packageOptions.external || []),
      ]
      if (name.includes('core')) {
        console.log(res)
      }
      return res
    }
  }

  function resolveNodePlugins() {
    const nodePlugins =
      (format === 'cjs' && Object.keys(pkg.devDependencies || {}).length) ||
      packageOptions.enableNonBrowserBranches
        ? [
            commonJS({
              sourceMap: false,
            }),
            ...(format === 'cjs' ? [] : [polyfillNode()]),
            nodeResolve(),
          ]
        : []

    return nodePlugins
  }

  return {
    input: resolve(entryFile),
    external: resolveExternal(),
    plugins: [
      json({
        namedExports: false,
      }),
      alias({
        entries,
      }),
      nodeResolve(),
      ...resolveReplace(),
      esbuild({
        tsconfig: path.resolve(__dirname, 'tsconfig.json'),
        sourceMap: output.sourcemap,
        minify: false,
        target: isServerRenderer || isCJSBuild ? 'es2019' : 'es2016',
        define: resolveDefine(),
      }),
      ...resolveNodePlugins(),
      ...plugins,
    ],
    output,
    onwarn: (msg, warn) => {
      if (msg.code !== 'CIRCULAR_DEPENDENCY') {
        warn(msg)
      }
    },
    treeshake: {
      moduleSideEffects: false,
    },
  }
}

function createProductionConfig(/** @type {PackageFormat} */ format) {
  return createConfig(format, {
    file: resolve(`dist/${name}.${format}.prod.js`),
    format: outputConfigs[format].format,
  })
}

function createMinifiedConfig(/** @type {PackageFormat} */ format) {
  return createConfig(
    format,
    {
      file: outputConfigs[format].file.replace(/\.js$/, '.prod.js'),
      format: outputConfigs[format].format,
    },
    [
      {
        name: 'swc-minify',

        async renderChunk(contents, _, { format }) {
          const { code } = await minifySwc(contents, {
            module: format === 'es',
            format: {
              comments: false,
            },
            compress: {
              ecma: 2016,
              pure_getters: true,
            },
            safari10: true,
            mangle: true,
          })

          return { code: banner + code, map: null }
        },
      },
    ]
  )
}
