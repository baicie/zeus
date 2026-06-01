import path from 'node:path'

import { resolvePluginDts } from '@zeus-js/bundler-plugin'
import { generateWCDtsFiles } from '@zeus-js/component-dts'

import { generateCustomElementsJson } from './generateCustomElementsJson'
import { generateWCEntry } from './generateEntry'
import {
  generateWCIndex,
  getVirtualComponentId,
  getVirtualIndexId,
} from './generateIndex'
import { generateZeusComponentsManifest } from './generateManifest'

import type { OutputWCOptions } from './types'
import type {
  DtsMode,
  ZeusComponentPlugin,
  ZeusVirtualModule,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'

export type { OutputWCOptions } from './types'

export default function wc(options: OutputWCOptions = {}): ZeusComponentPlugin {
  const normalized = {
    outDir: options.outDir ?? 'wc',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    manifestFile: options.manifestFile ?? 'zeus.components.json',
    customElementsFile: options.customElementsFile ?? 'custom-elements.json',
    dts: options.dts ?? 'auto',
    jsxDts: options.jsxDts ?? 'auto',
    index: options.index ?? true,
    warnOnFileNameCollision: options.warnOnFileNameCollision ?? true,
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
      checkFileNameCollisions(ctx.manifest.components, normalized, {
        warn: ctx.warn,
      })
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

      for (const component of ctx.manifest.components) {
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

      if (normalized.index) {
        modules.push({
          id: getVirtualIndexId(),
          fileName: joinPath('index.js'),
          code: generateWCIndex({
            components: ctx.manifest.components,
            getFileName,
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      if (!ctx.manifest) return []
      const files: ZeusOutputFile[] = []

      if (normalized.manifestFile) {
        files.push({
          type: 'asset',
          fileName: normalized.manifestFile,
          source: generateZeusComponentsManifest(ctx.manifest),
        })
      }

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

      if (normalized.customElementsFile) {
        files.push({
          type: 'asset',
          fileName: normalized.customElementsFile,
          source: generateCustomElementsJson({
            manifest: ctx.manifest,
            getModulePath: component => joinPath(getFileName(component.tag)),
          }),
        })
      }

      const dts = resolvePluginDts(normalized.dts as DtsMode, ctx)
      const jsxDts = resolvePluginDts(normalized.jsxDts as DtsMode, ctx)

      if (dts || jsxDts) {
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

function checkFileNameCollisions(
  components: { tag: string }[],
  options: {
    stripPrefix: string | false
    fileName?: (tag: string) => string
    warnOnFileNameCollision?: boolean
  },
  reporter: { warn: (message: string) => void },
): void {
  if (options.warnOnFileNameCollision === false) return

  const map = new Map<string, typeof components>()

  for (const component of components) {
    const fileName = normalizeFileName(
      component.tag,
      options.stripPrefix,
      options.fileName,
    )
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
