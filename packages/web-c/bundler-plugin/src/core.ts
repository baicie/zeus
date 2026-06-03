import fs from 'node:fs'
import path from 'node:path'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import fg from 'fast-glob'

import { createComponentTransformFilter } from './componentTransformFilter'
import { resolveComponentExclude, resolveComponentInclude } from './defaults'
import { formatDiagnostic, hasErrorDiagnostics } from './diagnostics'
import { resolveDts } from './dts'
import { createOutputRegistry } from './outputRegistry'
import { transformZeus } from './transform'
import { VirtualModuleRegistry } from './virtual'

import type {
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputBundle,
  ZeusOutputFile,
  ZeusVirtualModule,
} from './types'
import type {
  PluginContext,
  NormalizedOutputOptions,
  OutputBundle,
} from 'rollup'

export type ZeusBundlerTarget = 'vite' | 'rollup' | 'rolldown'

export interface CreateZeusBundlerPluginOptions {
  target: ZeusBundlerTarget
}

export function createZeusBundlerPlugin(
  options: ZeusBundlerPluginOptions = {},
  createOptions: CreateZeusBundlerPluginOptions,
) {
  const target = createOptions.target

  let shouldTransform = (_id: string) => false
  let ctx: ZeusBuildContext | undefined
  let root = process.cwd()

  const virtualModules = new VirtualModuleRegistry()

  return {
    name: resolvePluginName(target),

    async buildStart(this: PluginContext) {
      virtualModules.clear()

      root = resolveRoot(options.root)

      const include = resolveComponentInclude(options.components?.include)
      const exclude = resolveComponentExclude(options.components?.exclude)

      shouldTransform = createComponentTransformFilter({
        root,
        include,
        exclude,
      })

      const dts = await resolveDts({
        root,
        mode: options.dts,
        include,
        exclude,
      })

      const manifestResult = await createManifest(root, include, exclude)

      for (const file of await collectWatchFiles(root, include, exclude)) {
        this.addWatchFile(file)
      }

      const diagnostics = manifestResult.diagnostics

      for (const diagnostic of diagnostics) {
        const message = formatDiagnostic(diagnostic)

        if (diagnostic.level === 'error') {
          this.error(message)
        } else if (options.diagnostics !== false) {
          this.warn(message)
        }
      }

      if (hasErrorDiagnostics(diagnostics)) {
        this.error('[zeus] component analyzer failed.')
      }

      if (options.diagnostics === 'verbose') {
        this.warn(
          `[zeus] dts ${dts.enabled ? 'enabled' : 'disabled'}: ${
            dts.reason.join(', ') || 'no signal'
          }`,
        )
      }

      ctx = {
        root,
        manifest: manifestResult.manifest,
        diagnostics,
        dts,
        outputs: createOutputRegistry(),
        emitFile: this.emitFile.bind(this) as (file: unknown) => string | void,
        warn: this.warn.bind(this),
        error: this.error.bind(this),
        addWatchFile: this.addWatchFile.bind(this),
        meta: {
          watchMode: this.meta.watchMode,
        },
      }

      const plugins = options.plugins ?? []

      for (const plugin of plugins) {
        await plugin.setup?.(ctx!)
      }

      for (const plugin of plugins) {
        await plugin.buildStart?.(ctx!)
      }

      for (const plugin of plugins) {
        const modules = await plugin.virtualModules?.(ctx!)

        if (!modules) continue

        for (const mod of modules) {
          virtualModules.set(mod.id, mod.code, mod.fileName)
        }

        emitVirtualEntries(modules, this)
      }
    },

    resolveId(id: string, importer?: string) {
      const resolvedVirtual = virtualModules.resolve(id, importer)

      if (resolvedVirtual) {
        return {
          id: resolvedVirtual,
          moduleSideEffects: 'no-treeshake',
        }
      }

      if (target === 'rollup') {
        const resolvedTs = resolveTsLikeImport(id, importer, {
          root,
          extensions: options.resolveExtensions,
        })

        if (resolvedTs) {
          return resolvedTs
        }
      }

      return null
    },

    load(id: string) {
      return virtualModules.load(id)
    },

    async transform(code: string, id: string) {
      const shouldRunZeus = shouldTransform(id)
      const shouldStripTs =
        target === 'rollup' &&
        resolveTranspile(options.transpile, target) &&
        /\.[cm]?tsx?$/.test(id)

      if (!shouldRunZeus && !shouldStripTs) {
        return null
      }

      return await transformZeus({
        id,
        code,
        compiler: shouldRunZeus ? options.compiler : false,
        sourcemap: true,
        transpile: shouldStripTs,
      })
    },

    async generateBundle(
      this: PluginContext,
      _: NormalizedOutputOptions,
      bundle: OutputBundle,
    ) {
      if (!ctx) return

      const plugins = options.plugins ?? []

      for (const plugin of plugins) {
        const files = await plugin.generateBundle?.(
          ctx,
          bundle as unknown as ZeusOutputBundle,
        )

        if (!files) continue

        for (const file of files) {
          emitOutputFile(this, file)
        }
      }
    },
  } satisfies object
}

function resolvePluginName(target: ZeusBundlerTarget): string {
  if (target === 'vite') return 'vite-plugin-zeus'
  if (target === 'rolldown') return 'rolldown-plugin-zeus'
  return 'rollup-plugin-zeus'
}

function resolveTranspile(
  value: ZeusBundlerPluginOptions['transpile'],
  target: ZeusBundlerTarget,
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  return target === 'rollup'
}

function resolveRoot(root: string | (() => string) | undefined): string {
  if (typeof root === 'function') {
    return path.resolve(root())
  }

  return path.resolve(root ?? process.cwd())
}

async function createManifest(
  root: string,
  include: string[],
  exclude: string[],
) {
  if (!include.length) {
    return {
      manifest: {
        version: 1 as const,
        components: [],
      },
      diagnostics: [],
    }
  }

  return await analyzeComponents({
    root,
    include,
    exclude,
  })
}

async function collectWatchFiles(
  root: string,
  include: string[],
  exclude: string[],
): Promise<string[]> {
  if (!include.length) return []

  return await fg(include, {
    cwd: root,
    absolute: true,
    ignore: exclude,
  })
}

function resolveTsLikeImport(
  id: string,
  importer: string | undefined,
  options: {
    root: string
    extensions: string[] | false | undefined
  },
): string | null {
  if (!importer) return null
  if (id.startsWith('\0') || importer.startsWith('\0')) return null
  if (!id.startsWith('.') && !id.startsWith('/')) return null
  if (options.extensions === false) return null

  const extensions = options.extensions ?? [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ]

  const base = id.startsWith('/')
    ? path.resolve(options.root, `.${id}`)
    : path.resolve(path.dirname(importer), id)

  const candidates = [
    base,
    ...extensions.map(ext => `${base}${ext}`),
    ...extensions.map(ext => path.join(base, `index${ext}`)),
  ]

  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file
    }
  }

  return null
}

function emitOutputFile(
  pluginContext: PluginContext,
  file: ZeusOutputFile,
): void {
  if (file.type === 'asset') {
    pluginContext.emitFile({
      type: 'asset',
      fileName: file.fileName,
      source: file.source,
    })
    return
  }

  pluginContext.emitFile({
    type: 'chunk',
    id: file.id,
    fileName: file.fileName,
  })
}

function emitVirtualEntries(
  modules: ZeusVirtualModule[],
  pluginContext: PluginContext,
): void {
  for (const mod of modules) {
    if (!mod.fileName) continue

    pluginContext.emitFile({
      type: 'chunk',
      id: mod.id,
      fileName: mod.fileName,
      preserveSignature: 'strict',
    })
  }
}
