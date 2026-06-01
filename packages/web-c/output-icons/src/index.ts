import path from 'node:path'

import {
  generateReactDts,
  generateStaticWcDts,
  generateVueDts,
} from './generateDts'
import { generateReactIcon, generateReactIndex } from './generateReactIcon'
import {
  generateStaticWcIcon,
  generateStaticWcIndex,
} from './generateStaticWcIcon'
import { generateVueIcon, generateVueIndex } from './generateVueIcon'
import {
  getIconJsFileName,
  getIconSvgFileName,
  toIconComponentName,
} from './naming'
import { parseSvg, svgToDataSource } from './svg'

import type {
  IconSource,
  NormalizedIconSource,
  NormalizedOutputIconsOptions,
  OutputIconsOptions,
} from './types'
import type {
  ZeusOutputFile,
  ZeusComponentPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'

export type { IconSource, OutputIconsOptions } from './types'

export default function icons(
  options: OutputIconsOptions,
): ZeusComponentPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-icons',

    virtualModules(): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      if (normalized.react) {
        for (const icon of normalized.icons) {
          modules.push({
            id: `zeus:icons:react:${icon.name}`,
            fileName: path.posix.join(
              normalized.outDir,
              normalized.react.outDir,
              getIconJsFileName(icon.name),
            ),
            code: generateReactIcon(icon),
          })
        }

        modules.push({
          id: 'zeus:icons:react:index',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.react.outDir,
            'index.js',
          ),
          code: generateReactIndex(normalized.icons),
        })
      }

      if (normalized.vue) {
        for (const icon of normalized.icons) {
          modules.push({
            id: `zeus:icons:vue:${icon.name}`,
            fileName: path.posix.join(
              normalized.outDir,
              normalized.vue.outDir,
              getIconJsFileName(icon.name),
            ),
            code: generateVueIcon(icon),
          })
        }

        modules.push({
          id: 'zeus:icons:vue:index',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.vue.outDir,
            'index.js',
          ),
          code: generateVueIndex(normalized.icons),
        })
      }

      if (normalized.wc) {
        for (const icon of normalized.icons) {
          modules.push({
            id: `zeus:icons:wc:${icon.name}`,
            fileName: path.posix.join(
              normalized.outDir,
              normalized.wc.outDir,
              getIconJsFileName(icon.name),
            ),
            code: generateStaticWcIcon(icon),
          })
        }

        modules.push({
          id: 'zeus:icons:wc:index',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.wc.outDir,
            'index.js',
          ),
          code: generateStaticWcIndex(normalized.icons),
        })
      }

      return modules
    },

    generateBundle(): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.svg) {
        for (const icon of normalized.icons) {
          files.push({
            type: 'asset',
            fileName: path.posix.join(
              normalized.outDir,
              'svg',
              getIconSvgFileName(icon.name),
            ),
            source: svgToDataSource(icon.svg),
          })
        }
      }

      if (normalized.dts && normalized.react) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.react.outDir,
            'index.d.ts',
          ),
          source: generateReactDts(normalized.icons),
        })
      }

      if (normalized.dts && normalized.vue) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.vue.outDir,
            'index.d.ts',
          ),
          source: generateVueDts(normalized.icons),
        })
      }

      if (normalized.dts && normalized.wc) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.wc.outDir,
            'index.d.ts',
          ),
          source: generateStaticWcDts(normalized.icons),
        })
      }

      return files
    },
  }
}

function normalizeOptions(
  options: OutputIconsOptions,
): NormalizedOutputIconsOptions {
  if (!options.icons?.length) {
    throw new Error('[zeus-output-icons] options.icons is required.')
  }

  const wcOptions =
    options.wc === false
      ? false
      : {
          outDir:
            typeof options.wc === 'object' && options.wc.outDir
              ? options.wc.outDir
              : 'wc',
          tagPrefix:
            typeof options.wc === 'object' && options.wc.tagPrefix
              ? options.wc.tagPrefix
              : 'z-icon-',
        }

  return {
    icons: normalizeIcons(
      options.icons,
      wcOptions ? wcOptions.tagPrefix : 'z-icon-',
    ),
    outDir: options.outDir ?? 'icons',
    svg: options.svg ?? true,
    react:
      options.react === false
        ? false
        : {
            outDir:
              typeof options.react === 'object' && options.react.outDir
                ? options.react.outDir
                : 'react',
          },
    vue:
      options.vue === false
        ? false
        : {
            outDir:
              typeof options.vue === 'object' && options.vue.outDir
                ? options.vue.outDir
                : 'vue',
          },
    wc: wcOptions,
    dts: options.dts ?? true,
  }
}

function normalizeIcons(
  icons: IconSource[],
  tagPrefix: string,
): NormalizedIconSource[] {
  return icons.map(icon => {
    const parsed = parseSvg(icon.svg)

    return {
      name: icon.name,
      componentName: toIconComponentName(icon.name),
      wcTag: `${tagPrefix}${icon.name}`,
      svg: icon.svg,
      title: icon.title,
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    }
  })
}
