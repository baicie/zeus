import fs from 'node:fs'
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

import { dts } from 'rolldown-plugin-dts'

import type { BuildOptions, Plugin } from 'rolldown'
import { build } from 'rolldown'
import { CopyAddonPlugin } from './copy-addon-plugin'

const __dirname = nodePath.join(fileURLToPath(import.meta.url), '..')

const buildMeta = (function makeBuildMeta() {
  type TargetBrowserPkg = 'browser-pkg'

  type TargetZeusjsPkg = 'zeusjs-pkg'

  type TargetZeusjsPkgWasi = 'zeusjs-pkg-wasi'

  const target: TargetBrowserPkg | TargetZeusjsPkg | TargetZeusjsPkgWasi =
    (function determineTarget() {
      switch (process.env.TARGET) {
        case undefined:
        case 'zeusjs':
          return 'zeusjs-pkg'
        case 'browser':
          return 'browser-pkg'
        case 'zeusjs-wasi':
          return 'zeusjs-pkg-wasi'
        default:
          console.warn(
            `Unknown target: ${process.env.TARGET}, defaulting to 'zeusjs-pkg'`,
          )
          return 'zeusjs-pkg'
      }
    })()

  const pkgRoot =
    target === 'browser-pkg'
      ? nodePath.resolve(__dirname, '../browser')
      : __dirname

  return {
    isCI: !!process.env.CI,
    isReleasingPkgInCI: !!process.env.RELEASING,
    target,
    pkgRoot,
    buildOutputDir: nodePath.resolve(pkgRoot, 'dist'),
    pkgJson: JSON.parse(
      fs.readFileSync(nodePath.resolve(pkgRoot, 'package.json'), 'utf-8'),
    ),
    desireWasmFiles: target === 'browser-pkg' || target === 'zeusjs-pkg-wasi',
  }
})()

const bindingFile = nodePath.resolve('src/binding.cjs')
const bindingFileWasi = nodePath.resolve('src/zeusjs-binding.wasi.cjs')
const bindingFileWasiBrowser = nodePath.resolve(
  'src/zeusjs-binding.wasi-browser.js',
)

const configs: BuildOptions[] = [
  withShared({
    plugins: [patchBindingJs(), dts()],
    output: {
      dir: buildMeta.buildOutputDir,
      format: 'esm',
      entryFileNames: `[name].mjs`,
      chunkFileNames: `shared/[name]-[hash].mjs`,
    },
  }),
]

if (buildMeta.target === 'browser-pkg') {
  let init = withShared({
    browserBuild: true,
    output: {
      dir: buildMeta.buildOutputDir,
      format: 'esm',
      entryFileNames: '[name].browser.mjs',
    },
  })
  init.transform ??= {}
  init.transform.define = {
    ...init.transform.define,
    'process.env.ZEUSJS_TEST': 'false',
  }
  configs.push(init)
}

;(async () => {
  // clean up unused files that may be left from previous builds
  fs.rmSync(buildMeta.buildOutputDir, { recursive: true, force: true })
  fs.mkdirSync(buildMeta.buildOutputDir, { recursive: true })

  for (const config of configs) {
    await build(config)
  }
})()

function withShared({
  browserBuild: isBrowserBuild,
  ...options
}: { browserBuild?: boolean } & BuildOptions): BuildOptions {
  return {
    input: {
      index: './src/index',
    },
    platform: isBrowserBuild ? 'browser' : 'node',
    resolve: {
      extensions: ['.js', '.cjs', '.mjs', '.ts'],
    },
    external: [
      /@zeusjs\/binding-.*/,
      /zeusjs-binding\.wasi\.cjs/,
      ...Object.keys(buildMeta.pkgJson.dependencies ?? {}),
    ],
    // Do not move this line up or down, it's here for a reason
    ...options,
    plugins: [
      buildMeta.desireWasmFiles && resolveWasiBinding(isBrowserBuild),
      CopyAddonPlugin({
        isCI: buildMeta.isCI,
        isReleasingPkgInCI: buildMeta.isReleasingPkgInCI,
        desireWasmFiles: buildMeta.desireWasmFiles,
      }),
      isBrowserBuild && removeBuiltModules(),
      options.plugins,
    ],
    treeshake: true,
    transform: {
      target: 'node22',
      decorator: {
        legacy: true,
      },
      define: {
        'import.meta.browserBuild': String(isBrowserBuild),
      },
    },
  }
}

function resolveWasiBinding(isBrowserBuild?: boolean): Plugin {
  return {
    name: 'resolve-wasi-binding',
    resolveId: {
      filter: { id: /\bbinding\b/ },
      async handler(id, importer, options) {
        const resolution = await this.resolve(id, importer, options)

        if (resolution?.id === bindingFile) {
          const id = isBrowserBuild ? bindingFileWasiBrowser : bindingFileWasi
          return { id, external: 'relative' }
        }

        return resolution
      },
    },
  }
}

function removeBuiltModules(): Plugin {
  return {
    name: 'remove-built-modules',
    resolveId: {
      filter: { id: /^node:/ },
      handler(id, importer) {
        if (id === 'node:path') {
          return this.resolve('pathe')
        }
        if (
          id === 'node:os' ||
          id === 'node:worker_threads' ||
          id === 'node:url' ||
          id === 'node:fs/promises' ||
          id === 'node:fs' ||
          id === 'node:util'
        ) {
          // conditional import
          return { id, external: true, moduleSideEffects: false }
        }
        throw new Error(`Unresolved module: ${id} from ${importer}`)
      },
    },
  }
}

function patchBindingJs(): Plugin {
  return {
    name: 'patch-binding-js',
    transform: {
      filter: {
        id: 'src/binding.cjs',
      },
      handler(code) {
        return (
          code
            // inject binding auto download fallback for webcontainer
            .replace(
              '\nif (!nativeBinding) {',
              s =>
                `
if (!nativeBinding && globalThis.process?.versions?.["webcontainer"]) {
  try {
    nativeBinding = require('./webcontainer-fallback.cjs');
  } catch (err) {
    loadErrors.push(err)
  }
}
` + s,
            )
        )
      },
    },
  }
}
