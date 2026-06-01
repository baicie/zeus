import {
  createOutputPathResolver,
  normalizeOutputConfig,
} from '@zeus-js/bundler-plugin'
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
  ZeusBuildContext,
  ZeusComponentPlugin,
  ZeusVirtualModule,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export type { OutputWCOptions } from './types'

export default function wc(options: OutputWCOptions = {}): ZeusComponentPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-wc',

    buildStart(ctx) {
      if (!ctx.manifest) return
      const outputState = createWcOutputState(ctx, normalized)

      checkFileNameCollisions(
        ctx.manifest.components,
        outputState.paths,
        normalized,
        {
          warn: ctx.warn,
        },
      )
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      if (!ctx.manifest) return []
      const modules: ZeusVirtualModule[] = []
      const outputState = createWcOutputState(ctx, normalized)

      for (const component of ctx.manifest.components) {
        const fileName = outputState.paths.join(
          'wc',
          outputState.paths.getFileName(component.tag, 'wc'),
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
          fileName: outputState.paths.join('wc', 'index.js'),
          code: generateWCIndex({
            components: ctx.manifest.components,
            getFileName: tag => outputState.paths.getFileName(tag, 'wc'),
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      if (!ctx.manifest) return []
      const files: ZeusOutputFile[] = []
      const outputState = createWcOutputState(ctx, normalized)

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
              outputState.paths.join(
                'wc',
                outputState.paths.getFileName(component.tag, 'wc'),
              ),
          }),
        })
      }

      if (normalized.dts || normalized.jsxDts) {
        const dtsFiles = generateWCDtsFiles(ctx.manifest, {
          outDir: outputState.output.wcDir,
          stripPrefix: outputState.output.stripPrefix,
          fileName: normalized.fileName
            ? tag => normalized.fileName!(tag) + '.js'
            : undefined,
          perComponent: true,
          index: normalized.dts,
          jsx: normalized.jsxDts,
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

type NormalizedOutputWCOptions = Omit<Required<OutputWCOptions>, 'fileName'> & {
  fileName?: (tag: string) => string
}

function createWcOutputState(
  ctx: ZeusBuildContext,
  options: NormalizedOutputWCOptions,
) {
  const output = normalizeOutputConfig({
    outDir: ctx.output?.outDir,
    reactDir: ctx.output?.reactDir,
    vueDir: ctx.output?.vueDir,
    iconsDir: ctx.output?.iconsDir,
    dts: ctx.output?.dts,
    wcDir: options.outDir,
    stripPrefix: options.stripPrefix,
    fileName: options.fileName
      ? (tag, kind) =>
          kind === 'wc'
            ? `${options.fileName!(tag)}.js`
            : (ctx.output?.fileName?.(tag, kind) ?? `${tag}.js`)
      : ctx.output?.fileName,
  })

  return {
    output,
    paths: createOutputPathResolver(output),
  }
}

function normalizeOptions(options: OutputWCOptions): NormalizedOutputWCOptions {
  return {
    outDir: options.outDir ?? 'wc',
    manifestFile: options.manifestFile ?? 'zeus.components.json',
    customElementsFile: options.customElementsFile ?? 'custom-elements.json',
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
  paths: ZeusBuildContext['paths'],
  options: NormalizedOutputWCOptions,
  reporter: {
    warn: (message: string) => void
  },
): void {
  if (!options.warnOnFileNameCollision) return

  const map = new Map<string, ComponentRecord[]>()

  for (const component of components) {
    const fileName = paths.getFileName(component.tag, 'wc')
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
