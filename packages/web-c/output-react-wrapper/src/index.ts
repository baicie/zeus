import { resolvePluginDts } from '@zeus-js/bundler-plugin'
import { generateReactDts } from '@zeus-js/component-dts'

import { generateReactIndex } from './generateReactIndex'
import { generateReactWrapper } from './generateReactWrapper'

import type { OutputReactWrapperOptions } from './types'
import type {
  ZeusOutputFile,
  ZeusComponentPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'

export type { OutputReactWrapperOptions } from './types'

export default function reactWrapper(
  options: OutputReactWrapperOptions = {},
): ZeusComponentPlugin {
  const normalized = {
    outDir: options.outDir ?? 'react',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    dts: options.dts ?? 'auto',
    index: options.index ?? true,
    namedSlots: options.namedSlots ?? 'props',
    wrapper: options.wrapper ?? 'minimal',
  }

  return {
    name: 'zeus-output-react-wrapper',
    external: ['react'],

    setup(ctx) {
      ctx.outputs.register('react', {
        outDir: normalized.outDir,
        stripPrefix: normalized.stripPrefix,
        fileName: normalized.fileName
          ? tag => normalized.fileName!(tag)
          : undefined,
      })
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      if (!ctx.outputs.has('wc')) {
        ctx.error('[zeus-output-react-wrapper] react() requires wc() plugin.')
      }

      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:react:${component.tag}`,
          fileName: ctx.outputs.join(
            'react',
            ctx.outputs.getFileName('react', component.tag),
          ),
          code: generateReactWrapper({
            component,
            namedSlots: normalized.namedSlots,
            wcModuleId: `zeus:wc:${component.tag}`,
            mode: normalized.wrapper,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:react:index',
          fileName: ctx.outputs.join('react', 'index.js'),
          code: generateReactIndex(ctx.manifest.components, {
            getFileName: tag => ctx.outputs.getFileName('react', tag),
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      if (!resolvePluginDts(normalized.dts, ctx)) {
        return []
      }

      return [
        {
          type: 'asset',
          fileName: ctx.outputs.join('react', 'index.d.ts'),
          source: generateReactDts(ctx.manifest),
        },
      ]
    },
  }
}
