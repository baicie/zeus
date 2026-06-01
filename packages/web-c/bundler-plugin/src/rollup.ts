import path from 'node:path'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import fg from 'fast-glob'

import { formatDiagnostic, hasErrorDiagnostics } from './diagnostics'
import { createFilter } from './filter'
import { transformZeus } from './transform'
import { VirtualModuleRegistry } from './virtual'

import type {
  RootOption,
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputFile,
  ZeusVirtualModule,
} from './types'
import type { ComponentManifest } from '@zeus-js/component-analyzer'
import type { Plugin } from 'rollup'

export function createZeusPlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  const shouldTransform = createFilter(options)
  const virtualModules = new VirtualModuleRegistry()

  let ctx: ZeusBuildContext | undefined

  return {
    name: 'zeus-bundler-plugin',

    async buildStart() {
      virtualModules.clear()

      const root = resolveRoot(options.root)
      const manifestResult = await createManifest(root, options)

      for (const file of await collectWatchFiles(root, options)) {
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

      ctx = {
        root,
        manifest: manifestResult.manifest,
        diagnostics,
        emitFile: this.emitFile.bind(this),
        warn: this.warn.bind(this),
        error: this.error.bind(this),
        addWatchFile: this.addWatchFile.bind(this),
        meta: {
          watchMode: this.meta.watchMode,
        },
      }

      const outputs = options.outputs ?? []

      for (const output of outputs) {
        await output.buildStart?.(ctx)
      }

      for (const output of outputs) {
        const modules = await output.virtualModules?.(ctx)

        if (!modules) continue

        for (const mod of modules) {
          virtualModules.set(mod.id, mod.code, mod.fileName)
        }

        emitComponentEntries(modules, this)
      }
    },

    resolveId(id, importer) {
      if (ctx) {
        const resolved = resolveSourceFile(id, importer, ctx.root, ctx.manifest)
        if (resolved) {
          return resolved
        }
      }
      return virtualModules.resolve(id, importer)
    },

    load(id) {
      return virtualModules.load(id)
    },

    async transform(code, id) {
      if (!shouldTransform(id)) {
        return null
      }

      const result = await transformZeus({
        id,
        code,
        compiler: options.compiler,
        sourcemap: true,
      })

      if (!result) return null

      return result
    },

    async generateBundle(_, bundle) {
      if (!ctx) return

      const outputs = options.outputs ?? []

      for (const output of outputs) {
        const files = await output.generateBundle?.(ctx, bundle)

        if (!files) continue

        for (const file of files) {
          emitOutputFile(this, file)
        }
      }
    },
  }
}

async function createManifest(root: string, options: ZeusBundlerPluginOptions) {
  const include = options.components?.include ?? []
  const exclude = options.components?.exclude ?? []

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
  options: ZeusBundlerPluginOptions,
): Promise<string[]> {
  const include = options.components?.include ?? []

  if (!include.length) return []

  const files = await fg(include, {
    cwd: root,
    absolute: true,
    ignore: options.components?.exclude ?? ['node_modules/**', '**/dist/**'],
  })

  return files
}

function resolveRoot(root: RootOption | undefined): string {
  if (typeof root === 'function') {
    return path.resolve(root())
  }

  return path.resolve(root ?? process.cwd())
}

function emitOutputFile(
  plugin: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitFile: (file: any) => void
  },
  file: ZeusOutputFile,
): void {
  if (file.type === 'asset') {
    plugin.emitFile({
      type: 'asset',
      fileName: file.fileName,
      source: file.source,
    })
    return
  }

  plugin.emitFile({
    type: 'chunk',
    id: file.id,
    fileName: file.fileName,
  })
}

function emitComponentEntries(
  modules: ZeusVirtualModule[],
  pluginContext: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitFile: (file: any) => void
  },
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

function resolveSourceFile(
  id: string,
  importer: string | undefined,
  root: string,
  manifest: ComponentManifest,
): string | null {
  if (!importer || !id.startsWith('.')) return null

  const importerPath = normalizePath(importer)
  const normalizedRoot = normalizePath(root)

  let importerDir: string

  if (importerPath.startsWith('\0zeus:wc:')) {
    const virtualId = importerPath.slice(1)
    const tag = virtualId.replace('zeus:wc:', '')
    const component = manifest.components.find(c => c.tag === tag)
    if (component) {
      importerDir = path.posix.dirname(
        path.posix.resolve(normalizedRoot, normalizePath(component.source)),
      )
    } else {
      return null
    }
  } else if (importerPath.startsWith('\0')) {
    return null
  } else {
    const absoluteImporter = path.posix.isAbsolute(importerPath)
      ? importerPath
      : path.posix.resolve(normalizedRoot, importerPath)
    importerDir = path.posix.dirname(absoluteImporter)
  }

  const resolved = path.posix.resolve(importerDir, id)
  return resolveToSource(resolved, root, manifest)
}

function resolveToSource(
  resolved: string,
  root: string,
  manifest: ComponentManifest,
): string | null {
  const normalizedResolved = normalizePath(resolved)
  const normalizedRoot = normalizePath(root)

  for (const component of manifest.components) {
    const absSource = path.posix.resolve(
      normalizedRoot,
      normalizePath(component.source),
    )
    const normalizedAbs = normalizePath(absSource)

    if (normalizedResolved === normalizedAbs) {
      return normalizedAbs
    }

    const absDir = normalizePath(absSource.replace(/\.tsx?$/, ''))
    if (normalizedResolved === absDir) {
      return normalizedAbs
    }

    const componentDir = path.posix.dirname(normalizedAbs)
    if (normalizedResolved === componentDir) {
      return normalizedAbs
    }
  }
  return null
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}
