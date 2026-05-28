import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import replace from '@rollup/plugin-replace'
import pico from 'picocolors'
import polyfillNode from 'rollup-plugin-polyfill-node'

import { entries } from './aliases'
import { inlineEnums } from './inline-enums'

import type { MarkRequired, PackageFormat } from './utils'
import type { Plugin, RolldownOptions } from 'rolldown'

type OutputOptions = MarkRequired<
  import('rolldown').OutputOptions,
  'file' | 'format'
>

if (!process.env.TARGET) {
  throw new Error('TARGET package must be specified via --environment flag.')
}

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const masterVersion = require('../package.json').version

const packagesDir = path.resolve(__dirname, '..', 'packages')
const packageDir = path.resolve(packagesDir, process.env.TARGET)

const resolve = (p: string) => path.resolve(packageDir, p)
const pkg = require(resolve('package.json'))
const packageOptions = pkg.buildOptions || {}
const name = path.basename(packageDir)

const banner = `/**
* ${name} v${masterVersion}
* (c) ${new Date().getFullYear()} baicie
* Released under the MIT License.
**/`

const [enumPlugin, enumDefines] = inlineEnums()

const outputConfigs: Record<PackageFormat, OutputOptions> = {
  'esm-bundler': {
    file: resolve(`dist/${name}.esm-bundler.js`),
    format: 'es',
  },
  'esm-browser': {
    file: resolve(`dist/${name}.esm-browser.js`),
    format: 'es',
  },
  cjs: {
    file: resolve(`dist/${name}.cjs.js`),
    format: 'cjs',
  },
  global: {
    file: resolve(`dist/${name}.global.js`),
    format: 'iife',
  },
  // runtime-only builds, for main "zeus" package only
  'esm-bundler-runtime': {
    file: resolve(`dist/${name}.runtime.esm-bundler.js`),
    format: 'es',
  },
  'esm-browser-runtime': {
    file: resolve(`dist/${name}.runtime.esm-browser.js`),
    format: 'es',
  },
  'global-runtime': {
    file: resolve(`dist/${name}.runtime.global.js`),
    format: 'iife',
  },
}

const defaultFormats: ReadonlyArray<PackageFormat> = ['esm-bundler', 'cjs']
const inlineFormats =
  process.env.FORMATS && decodeURIComponent(process.env.FORMATS).split(',')
const packageFormats: ReadonlyArray<PackageFormat> =
  inlineFormats || packageOptions.formats || defaultFormats

const packageConfigs: RolldownOptions[] = process.env.PROD_ONLY
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
    if (/^(global|esm-browser)(-runtime)?/.test(format)) {
      packageConfigs.push(createMinifiedConfig(format))
    }
  })
}
export default packageConfigs

function createConfig(
  format: PackageFormat,
  output: OutputOptions,
  plugins: Plugin[] = [],
): RolldownOptions {
  if (!output) {
    console.log(pico.yellow(`invalid format: "${format}"`))
    process.exit(1)
  }

  const isProductionBuild =
    process.env.__DEV__ === 'false' || /\.prod\.js$/.test(output.file)
  const isBundlerESMBuild = /esm-bundler/.test(format)
  const isBrowserESMBuild = /esm-browser/.test(format)
  const isServerRenderer = name === 'server-renderer'
  const isCJSBuild = format === 'cjs'
  const isGlobalBuild = /global/.test(format)
  const isBrowserBuild =
    (isGlobalBuild || isBrowserESMBuild || isBundlerESMBuild) &&
    !packageOptions.enableNonBrowserBranches

  output.banner = banner

  output.exports = 'named'
  if (isCJSBuild) {
    output.esModule = true
  }
  output.sourcemap = !!process.env.SOURCE_MAP
  output.externalLiveBindings = false

  if (isGlobalBuild) {
    output.name = packageOptions.name
  }

  let entryFile = `src/index.ts`

  function resolveDefine() {
    const replacements: Record<string, string> = {
      __COMMIT__: `"${process.env.COMMIT}"`,
      __VERSION__: `"${masterVersion}"`,
      __TEST__: `false`,
      // If the build is expected to run directly in the browser (global / esm builds)
      __BROWSER__: String(isBrowserBuild),
      __GLOBAL__: String(isGlobalBuild),
      __ESM_BUNDLER__: String(isBundlerESMBuild),
      __ESM_BROWSER__: String(isBrowserESMBuild),
      // is targeting Node (SSR)?
      __CJS__: String(isCJSBuild),
      // need SSR-specific branches?
      __SSR__: String(!isGlobalBuild),
    }

    if (!isBundlerESMBuild) {
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

  function resolveReplace() {
    const replacements = { ...enumDefines }

    if (isProductionBuild && isBrowserBuild) {
      Object.assign(replacements, {
        // 'context.onError(': `/*@__PURE__*/ context.onError(`,
        // 'emitError(': `/*@__PURE__*/ emitError(`,
        // 'createCompilerError(': `/*@__PURE__*/ createCompilerError(`,
        // 'createDOMCompilerError(': `/*@__PURE__*/ createDOMCompilerError(`,
      })
    }

    if (isBundlerESMBuild) {
      Object.assign(replacements, {
        // preserve to be handled by bundlers
        __DEV__: `!!(process.env.NODE_ENV !== 'production')`,
      })
    }

    if (Object.keys(replacements).length) {
      return [replace({ values: replacements, preventAssignment: true })]
    } else {
      return []
    }
  }

  function resolveExternal() {
    const treeShakenDeps = [
      'source-map-js',
      '@babel/parser',
      'estree-walker',
      'entities/decode',
    ]

    if (isGlobalBuild || isBrowserESMBuild) {
      if (!packageOptions.enableNonBrowserBranches) {
        // normal browser builds - non-browser only imports are tree-shaken,
        // they are only listed here to suppress warnings.
        return treeShakenDeps
      }
    } else {
      // Node / esm-bundler builds.
      // externalize all direct deps.
      return [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        ...['path', 'url', 'stream'],
        // somehow these throw warnings for runtime-* package builds
        ...treeShakenDeps,
      ]
    }
  }

  function resolveNodePlugins() {
    if (pkg.name === '@zeus-js/compiler-sfc') {
      // compiler-sfc bundles forked consolidate.js which dynamically
      // requires a ton of template engines which should be ignored.
      return []
    }

    const nodePlugins =
      (format === 'cjs' && Object.keys(pkg.devDependencies || {}).length) ||
      packageOptions.enableNonBrowserBranches
        ? [...(format === 'cjs' ? [] : [polyfillNode()])]
        : []

    return nodePlugins
  }

  return {
    input: resolve(entryFile),
    external: resolveExternal(),
    resolve: {
      alias: entries,
    },
    plugins: [
      enumPlugin,
      ...resolveReplace(),
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
    transform: {
      define: resolveDefine(),
      target: isServerRenderer || isCJSBuild ? 'es2019' : 'es2016',
    },
  }
}

function createProductionConfig(format: PackageFormat) {
  return createConfig(format, {
    file: resolve(`dist/${name}.${format}.prod.js`),
    format: outputConfigs[format].format,
  })
}

function createMinifiedConfig(format: PackageFormat) {
  return createConfig(format, {
    file: outputConfigs[format].file.replace(/\.js$/, '.prod.js'),
    format: outputConfigs[format].format,
    minify: true,
  })
}
