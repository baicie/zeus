import path from 'node:path'

import type {
  RequiredZeusComponentOutputConfig,
  ZeusComponentOutputConfig,
  ZeusComponentOutputKind,
  ZeusOutputPathResolver,
} from './types'

export function normalizeOutputConfig(
  config: ZeusComponentOutputConfig | undefined,
): RequiredZeusComponentOutputConfig {
  return {
    outDir: config?.outDir ?? '',
    wcDir: config?.wcDir ?? 'wc',
    reactDir: config?.reactDir ?? 'react',
    vueDir: config?.vueDir ?? 'vue',
    iconsDir: config?.iconsDir ?? 'icons',
    stripPrefix: config?.stripPrefix ?? false,
    dts: config?.dts ?? true,
    fileName: config?.fileName,
  }
}

export function createOutputPathResolver(
  output: RequiredZeusComponentOutputConfig,
): ZeusOutputPathResolver {
  return {
    getFileName(tag, kind) {
      if (output.fileName) {
        return output.fileName(tag, kind)
      }

      return `${normalizeTagToFileName(tag, output.stripPrefix)}.js`
    },

    getDir(kind) {
      const dir = getKindDir(kind, output)
      return output.outDir ? path.posix.join(output.outDir, dir) : dir
    },

    join(kind, fileName) {
      return path.posix.join(this.getDir(kind), fileName)
    },

    relativeImport(from, to, tag) {
      const fromDir = this.getDir(from)
      const toFile = path.posix.join(this.getDir(to), this.getFileName(tag, to))

      let relative = path.posix.relative(fromDir, toFile)

      if (!relative.startsWith('.')) {
        relative = `./${relative}`
      }

      return relative
    },
  }
}

function getKindDir(
  kind: ZeusComponentOutputKind,
  output: RequiredZeusComponentOutputConfig,
): string {
  switch (kind) {
    case 'wc':
      return output.wcDir
    case 'react':
      return output.reactDir
    case 'vue':
      return output.vueDir
    case 'icons-react':
      return path.posix.join(output.iconsDir, 'react')
    case 'icons-vue':
      return path.posix.join(output.iconsDir, 'vue')
    case 'icons-wc':
      return path.posix.join(output.iconsDir, 'wc')
    case 'asset':
      return output.outDir
  }
}

function normalizeTagToFileName(
  tag: string,
  stripPrefix: string | false,
): string {
  let name = tag

  if (stripPrefix && name.startsWith(stripPrefix)) {
    name = name.slice(stripPrefix.length)
  }

  return name
}
