import path from 'node:path'

import { generateCustomElementsJson } from './generateCustomElementsJson'
import { generateWCDts, generateWCJsxDts } from './generateDts'
import { generateWCEntry } from './generateEntry'
import {
  generateWCIndex,
  getVirtualComponentId,
  getVirtualIndexId,
} from './generateIndex'
import { generateZeusComponentsManifest } from './generateManifest'
import { getComponentFileName } from './naming'

import type { OutputWCOptions } from './types'
import type {
  ZeusOutputPlugin,
  ZeusVirtualModule,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export type { OutputWCOptions } from './types'

export default function wc(options: OutputWCOptions = {}): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-wc',

    buildStart(ctx) {
      if (!ctx.manifest) return
      checkFileNameCollisions(ctx.manifest.components, normalized, {
        warn: ctx.warn,
      })
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      if (!ctx.manifest) return []
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        const fileName = path.posix.join(
          normalized.outDir,
          getComponentFileName(component.tag, normalized),
        )

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
          fileName: path.posix.join(normalized.outDir, 'index.js'),
          code: generateWCIndex({
            components: ctx.manifest.components,
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

      if (normalized.customElementsFile) {
        files.push({
          type: 'asset',
          fileName: normalized.customElementsFile,
          source: generateCustomElementsJson({
            manifest: ctx.manifest,
            getModulePath: component =>
              path.posix.join(
                normalized.outDir,
                getComponentFileName(component.tag, normalized),
              ),
          }),
        })
      }

      if (normalized.dts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
          source: generateWCDts(ctx.manifest),
        })
      }

      if (normalized.jsxDts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'jsx.d.ts'),
          source: generateWCJsxDts(ctx.manifest),
        })
      }

      return files
    },
  }
}

type NormalizedOutputWCOptions = Omit<Required<OutputWCOptions>, 'fileName'> & {
  fileName?: (tag: string) => string
}

function normalizeOptions(options: OutputWCOptions): NormalizedOutputWCOptions {
  return {
    outDir: options.outDir ?? 'dist/wc',
    manifestFile: options.manifestFile ?? 'dist/zeus.components.json',
    customElementsFile:
      options.customElementsFile ?? 'dist/custom-elements.json',
    dts: options.dts ?? true,
    jsxDts: options.jsxDts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    index: options.index ?? true,
    warnOnFileNameCollision: options.warnOnFileNameCollision ?? true,
  }
}

function checkFileNameCollisions(
  components: ComponentRecord[],
  options: NormalizedOutputWCOptions,
  reporter: {
    warn: (message: string) => void
  },
): void {
  if (!options.warnOnFileNameCollision) return

  const map = new Map<string, ComponentRecord[]>()

  for (const component of components) {
    const fileName = getComponentFileName(component.tag, options)
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
