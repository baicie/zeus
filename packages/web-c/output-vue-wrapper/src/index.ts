import path from 'node:path'

import { generateVueDts, generateVueGlobalDts } from '@zeus-js/component-dts'

import { generateVueIndex } from './generateVueIndex'
import { generateVueWrapper } from './generateVueWrapper'
import { getJsFileName } from './naming'

import type { RequiredOutputVueWrapperOptions } from './generateVueWrapper'
import type { OutputVueWrapperOptions } from './types'
import type {
  ZeusOutputFile,
  ZeusOutputPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'

export type { OutputVueWrapperOptions } from './types'

export default function vueWrapper(
  options: OutputVueWrapperOptions = {},
): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-vue-wrapper',

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:vue:${component.tag}`,
          fileName: path.posix.join(
            normalized.outDir,
            getJsFileName(component.tag, normalized),
          ),
          code: generateVueWrapper({
            component,
            options: normalized,
            getWcFileName: tag => getJsFileName(tag, normalized),
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:vue:index',
          fileName: path.posix.join(normalized.outDir, 'index.js'),
          code: generateVueIndex(ctx.manifest.components, normalized),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.dts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
          source: generateVueDts(ctx.manifest),
        })
      }

      if (normalized.globalDts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'global.d.ts'),
          source: generateVueGlobalDts(ctx.manifest),
        })
      }

      return files
    },
  }
}

function normalizeOptions(
  options: OutputVueWrapperOptions,
): RequiredOutputVueWrapperOptions {
  return {
    outDir: options.outDir ?? 'vue',
    wcOutDir: options.wcOutDir ?? '../wc',
    index: options.index ?? true,
    dts: options.dts ?? true,
    globalDts: options.globalDts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
  }
}
