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
  ZeusOutputFile,
  ZeusVirtualModule,
} from './types'
import type { Plugin } from 'rollup'

export function createZeusPlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  let shouldTransform = (_id: string) => false
  const virtualModules = new VirtualModuleRegistry()

  let ctx: ZeusBuildContext | undefined

  return {
    name: 'zeus-bundler-plugin',

    async buildStart() {
      virtualModules.clear()

      const root = resolveRoot(options.root)
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

      const outputs = createOutputRegistry()

      ctx = {
        root,
        manifest: manifestResult.manifest,
        diagnostics,
        dts,
        outputs,
        emitFile: this.emitFile.bind(this),
        warn: this.warn.bind(this),
        error: this.error.bind(this),
        addWatchFile: this.addWatchFile.bind(this),
        meta: {
          watchMode: this.meta.watchMode,
        },
      }

      const plugins = options.plugins ?? []

      for (const plugin of plugins) {
        await plugin.setup?.(ctx)
      }

      for (const plugin of plugins) {
        await plugin.buildStart?.(ctx)
      }

      for (const plugin of plugins) {
        const modules = await plugin.virtualModules?.(ctx)

        if (!modules) continue

        for (const mod of modules) {
          virtualModules.set(mod.id, mod.code, mod.fileName)
        }

        emitVirtualEntries(modules, this)
      }
    },

    resolveId(id, importer) {
      const resolved = virtualModules.resolve(id, importer)

      if (resolved) {
        return {
          id: resolved,
          moduleSideEffects: 'no-treeshake',
        }
      }

      return null
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

      const plugins = options.plugins ?? []

      for (const plugin of plugins) {
        const files = await plugin.generateBundle?.(ctx, bundle)

        if (!files) continue

        for (const file of files) {
          emitOutputFile(this, file)
        }
      }
    },
  }
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

  const files = await fg(include, {
    cwd: root,
    absolute: true,
    ignore: exclude,
  })

  return files
}

function resolveRoot(root: string | (() => string) | undefined): string {
  if (typeof root === 'function') {
    return path.resolve(root())
  }

  return path.resolve(root ?? process.cwd())
}

function emitOutputFile(
  pluginContext: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitFile: (file: any) => void
  },
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
