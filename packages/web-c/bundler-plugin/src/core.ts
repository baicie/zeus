import fs from 'node:fs'
import path from 'node:path'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import fg from 'fast-glob'

import { createComponentTransformFilter } from './componentTransformFilter'
import {
  resolveComponentExclude,
  resolveComponentInclude,
  resolveTransformExclude,
  resolveTransformInclude,
} from './defaults'
import { formatDiagnostic, hasErrorDiagnostics } from './diagnostics'
import { resolveDts } from './dts'
import { cleanUrl, isTypeScriptLike } from './filter'
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

  let shouldCompileZeus = (_id: string) => false
  let ctx: ZeusBuildContext | undefined
  let root = process.cwd()

  const virtualModules = new VirtualModuleRegistry()

  return {
    name: resolvePluginName(target),

    async buildStart(this: PluginContext) {
      virtualModules.clear()

      root = resolveRoot(options.root)

      const componentInclude = resolveComponentInclude(
        options.components?.include,
      )
      const componentExclude = resolveComponentExclude(
        options.components?.exclude,
      )
      const transformInclude = resolveTransformInclude(
        options.transform?.include,
      )
      const transformExclude = resolveTransformExclude(
        options.transform?.exclude,
      )

      shouldCompileZeus = createComponentTransformFilter({
        root,
        include: transformInclude,
        exclude: transformExclude,
      })

      const dts = await resolveDts({
        root,
        mode: options.dts,
        include: componentInclude,
        exclude: componentExclude,
      })

      const manifestResult = await createManifest(
        root,
        componentInclude,
        componentExclude,
      )

      for (const file of await collectWatchFiles(
        root,
        componentInclude,
        componentExclude,
      )) {
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
      const shouldRunZeus = shouldCompileZeus(id)
      const shouldStripTs =
        resolveTranspile(options.transpile, target) && isTypeScriptLike(id)

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
    extensions: string[] | false | undefined
  },
): string | null {
  if (!importer) return null

  const source = cleanUrl(id)
  const from = cleanUrl(importer)

  if (source.startsWith('\0') || from.startsWith('\0')) return null
  if (!source.startsWith('.') && !isAbsoluteImportPath(source)) return null
  if (options.extensions === false) return null

  const extensions = options.extensions ?? [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ]

  const base = isAbsoluteImportPath(source)
    ? source
    : path.resolve(path.dirname(from), source)

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

export function isAbsoluteImportPath(id: string): boolean {
  return path.isAbsolute(id) || /^[a-zA-Z]:[\\/]/.test(id)
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
