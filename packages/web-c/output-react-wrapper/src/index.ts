import { generateReactDts } from '@zeus-js/component-dts'

import { generateReactIndex } from './generateReactIndex'
import { generateReactWrapper } from './generateReactWrapper'

import type { RequiredOutputReactWrapperOptions } from './generateReactWrapper'
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
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-react-wrapper',

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:react:${component.tag}`,
          fileName: ctx.paths.join(
            'react',
            ctx.paths.getFileName(component.tag, 'react'),
          ),
          code: generateReactWrapper({
            component,
            options: normalized,
            wcImport: ctx.paths.relativeImport('react', 'wc', component.tag),
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:react:index',
          fileName: ctx.paths.join('react', 'index.js'),
          code: generateReactIndex(ctx.manifest.components, {
            ...normalized,
            getFileName: tag => ctx.paths.getFileName(tag, 'react'),
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
          fileName: ctx.paths.join('react', 'index.d.ts'),
          source: generateReactDts(ctx.manifest),
        })
      }

      return files
    },
  }
}

function normalizeOptions(
  options: OutputReactWrapperOptions,
): RequiredOutputReactWrapperOptions {
  return {
    outDir: options.outDir ?? 'react',
    wcOutDir: options.wcOutDir ?? '../wc',
    index: options.index ?? true,
    dts: options.dts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    namedSlots: options.namedSlots ?? 'props',
  }
}
