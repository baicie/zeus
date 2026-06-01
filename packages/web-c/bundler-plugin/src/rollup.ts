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
} from './types'
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

          if (mod.fileName) {
            this.emitFile({
              type: 'chunk',
              id: mod.id,
              fileName: mod.fileName,
            })
          }
        }
      }
    },

    resolveId(id, importer) {
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
