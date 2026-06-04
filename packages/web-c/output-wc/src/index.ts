import path from 'node:path'

import { resolvePluginDts } from '@zeus-js/bundler-plugin'
import {
  generateLoaderDts,
  generateReactDts,
  generateWCDtsFiles,
  generateWCJsxDts,
} from '@zeus-js/component-dts'

import { generateCustomElementsJson } from './generateCustomElementsJson'
import { generateWCEntry } from './generateEntry'
import {
  generateWCIndex,
  getVirtualComponentId,
  getVirtualIndexId,
} from './generateIndex'
import { generateLazyEntry } from './generateLazyEntry'
import { generateLazyManifest } from './generateLazyManifest'
import {
  generateAutoEntry,
  generateLazyIndex,
  generateLoader,
} from './generateLoader'
import { generateZeusComponentsManifest } from './generateManifest'
import { toAbsoluteImportPath } from './imports'

import type { OutputWCOptions } from './types'
import type {
  DtsMode,
  ZeusComponentPlugin,
  ZeusVirtualModule,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'

export type { OutputWCOptions } from './types'

export default function wc(options: OutputWCOptions = {}): ZeusComponentPlugin {
  const registerMode = options.register ?? 'lazy'

  const normalized = {
    outDir: options.outDir ?? 'wc',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    manifestFile:
      registerMode === 'lazy'
        ? false
        : (options.manifestFile ?? 'zeus.components.json'),
    customElementsFile:
      registerMode === 'lazy'
        ? false
        : (options.customElementsFile ?? 'custom-elements.json'),
    dts: options.dts ?? true,
    jsxDts: options.jsxDts ?? true,
    index: options.index ?? true,
    warnOnFileNameCollision: options.warnOnFileNameCollision ?? true,
    register: registerMode,
    manifest: options.manifest ?? true,
    loader: options.loader ?? true,
    auto: options.auto ?? true,
    entryFileName: options.entryFileName ?? (tag => `${tag}.entry`),
  }

  let _outDir = normalized.outDir

  return {
    name: 'zeus-output-wc',

    setup(ctx) {
      _outDir = normalized.outDir
      ctx.outputs.register('wc', {
        outDir: normalized.outDir,
        stripPrefix: normalized.stripPrefix,
        fileName: normalized.fileName
          ? tag => normalized.fileName!(tag)
          : undefined,
      })
    },

    buildStart(ctx) {
      if (!ctx.manifest) return

      if (normalized.register === 'lazy') {
        if (!normalized.manifest) {
          ctx.error(
            '[zeus-output-wc] register:"lazy" requires manifest:true because the runtime loader needs components.manifest.js.',
          )
        }

        if (!normalized.loader) {
          ctx.error(
            '[zeus-output-wc] register:"lazy" requires loader:true because framework wrappers and auto entry depend on loader.js.',
          )
        }
      }

      checkFileNameCollisions(
        ctx.manifest.components,
        {
          getFileName: tag => {
            if (normalized.register === 'lazy') {
              return ensureJsExtension(normalized.entryFileName(tag))
            }
            return normalizeFileName(
              tag,
              normalized.stripPrefix,
              normalized.fileName,
            )
          },
          warnOnFileNameCollision: normalized.warnOnFileNameCollision,
        },
        {
          warn: ctx.warn,
        },
      )
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      if (!ctx.manifest) return []
      const modules: ZeusVirtualModule[] = []

      const hasOutputs = ctx.outputs.has('wc')
      const getFileName = (tag: string) => {
        if (hasOutputs) return ctx.outputs.getFileName('wc', tag)
        return normalizeFileName(
          tag,
          normalized.stripPrefix,
          normalized.fileName,
        )
      }
      const joinPath = (fileName: string) => {
        if (hasOutputs) return ctx.outputs.join('wc', fileName)
        return path.posix.join(_outDir, fileName)
      }

      const isLazy = normalized.register === 'lazy'

      // Lazy mode: manifest, loader, auto
      if (isLazy) {
        if (normalized.manifest) {
          modules.push({
            id: 'zeus:wc:components.manifest',
            fileName: joinPath('components.manifest.js'),
            code: generateLazyManifest({
              components: ctx.manifest.components,
              getEntryFileName: tag => `${normalized.entryFileName(tag)}.js`,
            }),
          })
        }

        if (normalized.manifest && normalized.loader) {
          modules.push({
            id: 'zeus:wc:loader',
            fileName: joinPath('loader.js'),
            code: generateLoader(),
          })
        }

        if (normalized.manifest && normalized.loader && normalized.auto) {
          modules.push({
            id: 'zeus:wc:auto',
            fileName: joinPath('auto.js'),
            code: generateAutoEntry(),
          })
        }
      }

      for (const component of ctx.manifest.components) {
        if (isLazy) {
          /**
           * Compatibility module consumed by Vue / React wrappers.
           *
           * It only registers lazy Proxy Elements.
           * It does not import the real component implementation.
           */
          if (normalized.manifest && normalized.loader) {
            modules.push({
              id: getVirtualComponentId(component),
              code: `
import { defineCustomElements } from "zeus:wc:loader";

defineCustomElements();

export {};
`.trimStart(),
            })
          }

          const entryFileName = normalized.entryFileName(component.tag) + '.js'
          const fileName = joinPath(entryFileName)
          modules.push({
            id: `zeus:wc:entry:${component.tag}`,
            fileName,
            code: generateLazyEntry({
              component,
              outPath: fileName,
              sourceImport: toAbsoluteImportPath(ctx.root, component.source),
            }),
          })
        } else {
          const fileName = joinPath(getFileName(component.tag))
          modules.push({
            id: getVirtualComponentId(component),
            fileName,
            code: generateWCEntry({
              root: ctx.root,
              component,
            }),
          })
        }
      }

      if (normalized.index && !isLazy) {
        modules.push({
          id: getVirtualIndexId(),
          fileName: joinPath('index.js'),
          code: generateWCIndex({
            components: ctx.manifest.components,
            getFileName,
          }),
        })
      }

      if (isLazy && normalized.index && normalized.loader) {
        modules.push({
          id: getVirtualIndexId(),
          fileName: joinPath('index.js'),
          code: generateLazyIndex(),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      if (!ctx.manifest) return []
      const files: ZeusOutputFile[] = []
      const dts = resolvePluginDts(normalized.dts as DtsMode, ctx)
      const jsxDts = resolvePluginDts(normalized.jsxDts as DtsMode, ctx)

      const hasOutputs = ctx.outputs.has('wc')
      const getFileName = (tag: string) => {
        if (hasOutputs) return ctx.outputs.getFileName('wc', tag)
        return normalizeFileName(
          tag,
          normalized.stripPrefix,
          normalized.fileName,
        )
      }
      const joinPath = (fileName: string) => {
        if (hasOutputs) return ctx.outputs.join('wc', fileName)
        return path.posix.join(_outDir, fileName)
      }

      const isLazy = normalized.register === 'lazy'

      // Lazy mode runtime modules are emitted as virtual chunks in virtualModules().
      // generateBundle() only emits declaration assets to avoid file-name collisions.
      if (isLazy) {
        if (normalized.manifest && normalized.loader && dts) {
          const loaderDts = generateLoaderDts(ctx.manifest)

          files.push({
            type: 'asset',
            fileName: joinPath('loader.d.ts'),
            source: loaderDts,
          })

          if (normalized.index) {
            files.push({
              type: 'asset',
              fileName: joinPath('index.d.ts'),
              source: loaderDts,
            })
          }
        }

        if (jsxDts) {
          files.push({
            type: 'asset',
            fileName: joinPath('types/jsx.d.ts'),
            source: generateWCJsxDts(ctx.manifest),
          })
        }

        if (dts) {
          files.push({
            type: 'asset',
            fileName: joinPath('types/react.d.ts'),
            source: generateReactDts(ctx.manifest),
          })
        }
      } else if (normalized.manifestFile) {
        files.push({
          type: 'asset',
          fileName: normalized.manifestFile,
          source: generateZeusComponentsManifest(ctx.manifest),
        })
      }

      if (!isLazy && normalized.customElementsFile) {
        files.push({
          type: 'asset',
          fileName: normalized.customElementsFile,
          source: generateCustomElementsJson({
            manifest: ctx.manifest,
            getModulePath: component => joinPath(getFileName(component.tag)),
          }),
        })
      }

      if (!isLazy && (dts || jsxDts)) {
        const dtsFiles = generateWCDtsFiles(ctx.manifest, {
          outDir: _outDir,
          stripPrefix: normalized.stripPrefix,
          fileName: tag => getFileName(tag).replace(/\.js$/, ''),
          perComponent: true,
          index: dts,
          jsx: jsxDts,
        })

        for (const file of dtsFiles) {
          files.push({
            type: 'asset',
            fileName: file.fileName,
            source: file.source,
          })
        }
      }

      return files
    },
  }
}

function normalizeFileName(
  tag: string,
  stripPrefix: string | false,
  fileName?: (tag: string) => string,
): string {
  let name: string
  if (fileName) {
    name = fileName(tag)
  } else {
    name = tag
    if (stripPrefix && name.startsWith(stripPrefix)) {
      name = name.slice(stripPrefix.length)
    }
  }
  if (!name.endsWith('.js')) {
    name = `${name}.js`
  }
  return name
}

function ensureJsExtension(fileName: string): string {
  return fileName.endsWith('.js') ? fileName : `${fileName}.js`
}

function checkFileNameCollisions(
  components: { tag: string }[],
  options: {
    getFileName: (tag: string) => string
    warnOnFileNameCollision?: boolean
  },
  reporter: { warn: (message: string) => void },
): void {
  if (options.warnOnFileNameCollision === false) return

  const map = new Map<string, typeof components>()

  for (const component of components) {
    const fileName = options.getFileName(component.tag)
    const list = map.get(fileName) ?? []

    list.push(component)
    map.set(fileName, list)
  }

  for (const [fileName, list] of map) {
    if (list.length <= 1) continue

    reporter.warn(
      `[zeus-output-wc] Multiple components map to "${fileName}": ${list
        .map(item => item.tag)
        .join(', ')}`,
    )
  }
}
