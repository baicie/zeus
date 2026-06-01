import path from 'node:path'

import { generateReactDts } from '@zeus-js/component-dts'

import { generateReactIndex } from './generateReactIndex'
import { generateReactWrapper } from './generateReactWrapper'
import { getJsFileName } from './naming'

import type { RequiredOutputReactWrapperOptions } from './generateReactWrapper'
import type { OutputReactWrapperOptions } from './types'
import type {
  ZeusOutputFile,
  ZeusOutputPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'

export type { OutputReactWrapperOptions } from './types'

export default function reactWrapper(
  options: OutputReactWrapperOptions = {},
): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-react-wrapper',

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:react:${component.tag}`,
          fileName: path.posix.join(
            normalized.outDir,
            getJsFileName(component.tag, normalized),
          ),
          code: generateReactWrapper({
            component,
            options: normalized,
            getWcFileName: tag => getJsFileName(tag, normalized),
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:react:index',
          fileName: path.posix.join(normalized.outDir, 'index.js'),
          code: generateReactIndex(ctx.manifest.components, normalized),
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
