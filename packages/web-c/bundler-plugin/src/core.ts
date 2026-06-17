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
import { collectPluginExternals, mergeExternal } from './external'
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
  RollupExternalOption,
} from './types'
import type {
  InputOptions,
  PluginContext,
  NormalizedOutputOptions,
  OutputBundle,
  OutputOptions,
  Plugin as RollupPlugin,
  SourceMapInput,
} from 'rollup'

export type ZeusBundlerTarget = 'vite' | 'rollup' | 'rolldown'

export interface CreateZeusBundlerPluginOptions {
  target: ZeusBundlerTarget
}

export function createZeusBundlerPlugin(
  options: ZeusBundlerPluginOptions = {},
  createOptions: CreateZeusBundlerPluginOptions,
): RollupPlugin {
  const target = createOptions.target

  let shouldCompileZeus = (_id: string) => false
  let ctx: ZeusBuildContext | undefined
  let root = process.cwd()
  const cleanedOutputDirs = new Set<string>()

  const virtualModules = new VirtualModuleRegistry()

  return {
    name: resolvePluginName(target),

    options(inputOptions: InputOptions) {
      if (target === 'vite') {
        return null
      }

      const pluginExternals = collectPluginExternals(options, {
        includeZeusLibraryExternals: true,
      })
      const shouldSetRolldownTarget = target === 'rolldown'

      if (!pluginExternals.length && !shouldSetRolldownTarget) {
        return null
      }

      const nextOptions: Record<string, unknown> = {
        ...inputOptions,
      }

      if (pluginExternals.length) {
        nextOptions.external = mergeExternal(
          inputOptions.external as RollupExternalOption | undefined,
          pluginExternals,
        )
      }

      if (shouldSetRolldownTarget) {
        const transform =
          (inputOptions as { transform?: Record<string, unknown> }).transform ??
          {}

        nextOptions.transform = {
          target: 'es2016',
          ...transform,
        }
      }

      return nextOptions
    },

    outputOptions(outputOptions: OutputOptions) {
      if (target === 'vite') {
        return null
      }

      cleanOutputDir(outputOptions, {
        root: resolveRoot(options.root),
        enabled: options.clean !== false,
        cleanedOutputDirs,
      })

      if (outputOptions.chunkFileNames) {
        return null
      }

      return {
        ...outputOptions,
        chunkFileNames: 'chunks/[name]-[hash].js',
      }
    },

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
        componentInclude,
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
          moduleSideEffects: 'no-treeshake' as const,
        }
      }

      // Resolve virtual entry imports for lazy mode (e.g. ./z-button.entry -> zeus:wc:entry:z-button)
      const cleanImporter = importer?.replace(/^\x00/, '')
      if (
        cleanImporter?.startsWith('zeus:') &&
        (id.startsWith('./') || id.startsWith('../'))
      ) {
        const virtualEntryId = resolveVirtualEntryImport(id, cleanImporter)
        if (virtualEntryId && virtualModules.has(virtualEntryId)) {
          return {
            id: '\0' + virtualEntryId,
            moduleSideEffects: 'no-treeshake' as const,
          }
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

      const result = await transformZeus({
        id,
        code,
        compiler: shouldRunZeus ? options.compiler : false,
        sourcemap: true,
        transpile: shouldStripTs,
      })

      if (!result) return null
      return result as unknown as { code: string; map: SourceMapInput | null }
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

function cleanOutputDir(
  outputOptions: OutputOptions,
  options: {
    root: string
    enabled: boolean
    cleanedOutputDirs: Set<string>
  },
): void {
  if (!options.enabled) return

  const outputDir = resolveOutputDir(outputOptions, options.root)
  if (!outputDir || !isSafeCleanTarget(outputDir, options.root)) {
    return
  }

  if (options.cleanedOutputDirs.has(outputDir)) {
    return
  }

  options.cleanedOutputDirs.add(outputDir)
  fs.rmSync(outputDir, { recursive: true, force: true })
}

function resolveOutputDir(
  outputOptions: OutputOptions,
  root: string,
): string | undefined {
  const dir = outputOptions.dir

  if (typeof dir === 'string' && dir.length > 0) {
    return path.resolve(root, dir)
  }

  const file = outputOptions.file

  if (typeof file === 'string' && file.length > 0) {
    return path.dirname(path.resolve(root, file))
  }

  return path.resolve(root, 'dist')
}

function isSafeCleanTarget(outputDir: string, root: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedOutputDir = path.resolve(outputDir)

  if (resolvedOutputDir === resolvedRoot) {
    return false
  }

  const relative = path.relative(resolvedRoot, resolvedOutputDir)

  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  )
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

  // Do not consume query/hash imports. Other plugins may own their semantics,
  // such as ?raw, ?url, or framework-specific queries.
  if (cleanUrl(id) !== id) return null

  const source = cleanUrl(id)
  const from = cleanUrl(importer)

  if (source.startsWith('\0') || from.startsWith('\0')) return null

  // Only resolve relative or absolute filesystem imports.
  if (!source.startsWith('.') && !isAbsoluteImportPath(source)) return null

  // This resolver is intentionally extensionless-only.
  // Imports that already contain an extension should be handled by Rollup
  // itself or by another resource-specific plugin.
  if (path.extname(source)) return null

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
    // Keep support for truly extensionless files.
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

function resolveVirtualEntryImport(
  id: string,
  importer: string,
): string | null {
  // importer = "zeus:wc:components.manifest" (virtual id)
  // id = "./z-button.entry" or "../z-button.entry"
  // Map relative import from manifest to virtual entry module by:
  // 1. Extract virtual prefix from importer (e.g. "zeus:wc:")
  // 2. Extract base name from id (e.g. "z-button")
  // 3. Map to zeus:wc:entry:z-button

  const cleanId = id.replace(/\.js$/, '').replace(/^\.\//, '')
  const tagName = cleanId.replace(/\.entry$/, '')
  const lastColon = importer.lastIndexOf(':')
  if (lastColon <= 0) return null
  const virtualPrefix = importer.slice(0, lastColon + 1)

  return `${virtualPrefix}entry:${tagName}`
}
