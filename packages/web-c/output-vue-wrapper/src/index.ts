import { generateVueDts, generateVueGlobalDts } from '@zeus-js/component-dts'

import { generateVueIndex } from './generateVueIndex'
import { generateVueWrapper } from './generateVueWrapper'

import type { RequiredOutputVueWrapperOptions } from './generateVueWrapper'
import type { OutputVueWrapperOptions } from './types'
import type {
  ZeusOutputFile,
  ZeusComponentPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'

export type { OutputVueWrapperOptions } from './types'

export default function vueWrapper(
  options: OutputVueWrapperOptions = {},
): ZeusComponentPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-vue-wrapper',

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:vue:${component.tag}`,
          fileName: ctx.paths.join(
            'vue',
            ctx.paths.getFileName(component.tag, 'vue'),
          ),
          code: generateVueWrapper({
            component,
            wcImport: ctx.paths.relativeImport('vue', 'wc', component.tag),
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:vue:index',
          fileName: ctx.paths.join('vue', 'index.js'),
          code: generateVueIndex(ctx.manifest.components, {
            ...normalized,
            getFileName: tag => ctx.paths.getFileName(tag, 'vue'),
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.dts) {
        files.push({
          type: 'asset',
          fileName: ctx.paths.join('vue', 'index.d.ts'),
          source: generateVueDts(ctx.manifest),
        })
      }

      if (normalized.globalDts) {
        files.push({
          type: 'asset',
          fileName: ctx.paths.join('vue', 'global.d.ts'),
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
