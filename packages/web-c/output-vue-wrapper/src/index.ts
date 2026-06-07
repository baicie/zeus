import { resolvePluginDts } from '@zeus-js/bundler-plugin'
import { generateVueDts, generateVueGlobalDts } from '@zeus-js/component-dts'

import { generateVueIndex } from './generateVueIndex'
import { generateVueWrapper } from './generateVueWrapper'

import type { OutputVueWrapperOptions } from './types'
import type {
  ZeusOutputFile,
  ZeusComponentPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'

export type { OutputVueWrapperOptions } from './types'

export { defineContainer } from './runtime'
export type { ZeusVueContainerOptions, ZeusVueModelOptions } from './runtime'

export default function vueWrapper(
  options: OutputVueWrapperOptions = {},
): ZeusComponentPlugin {
  const normalized = {
    outDir: options.outDir ?? 'vue',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    dts: options.dts ?? true,
    globalDts: options.globalDts ?? true,
    index: options.index ?? true,
    wrapper: options.wrapper ?? 'runtime',
  }

  return {
    name: 'zeus-output-vue-wrapper',
    external: ['vue'],

    setup(ctx) {
      ctx.outputs.register('vue', {
        outDir: normalized.outDir,
        stripPrefix: normalized.stripPrefix,
        fileName: normalized.fileName
          ? tag => normalized.fileName!(tag)
          : undefined,
      })
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      if (!ctx.outputs.has('wc')) {
        ctx.error('[zeus-output-vue-wrapper] vue() requires wc() plugin.')
      }

      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:vue:${component.tag}`,
          fileName: ctx.outputs.join(
            'vue',
            ctx.outputs.getFileName('vue', component.tag),
          ),
          code: generateVueWrapper({
            component,
            wcModuleId: `zeus:wc:${component.tag}`,
            mode: normalized.wrapper,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:vue:index',
          fileName: ctx.outputs.join('vue', 'index.js'),
          code: generateVueIndex(ctx.manifest.components, {
            getFileName: tag => ctx.outputs.getFileName('vue', tag),
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (resolvePluginDts(normalized.dts, ctx)) {
        files.push({
          type: 'asset',
          fileName: ctx.outputs.join('vue', 'index.d.ts'),
          source: generateVueDts(ctx.manifest),
        })
      }

      if (resolvePluginDts(normalized.globalDts, ctx)) {
        files.push({
          type: 'asset',
          fileName: ctx.outputs.join('vue', 'global.d.ts'),
          source: generateVueGlobalDts(ctx.manifest),
        })
      }

      return files
    },
  }
}
