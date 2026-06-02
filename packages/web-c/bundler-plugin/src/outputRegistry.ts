import path from 'node:path'

import type {
  RequiredZeusOutputRegistration,
  ZeusOutputKind,
  ZeusOutputRegistration,
  ZeusOutputRegistry,
} from './types'

export function createOutputRegistry(): ZeusOutputRegistry {
  const map = new Map<ZeusOutputKind, RequiredZeusOutputRegistration>()

  return {
    register(kind, options) {
      map.set(kind, normalizeRegistration(kind, options))
    },

    has(kind) {
      return map.has(kind)
    },

    get(kind) {
      const current = map.get(kind)

      if (!current) {
        throw new Error(`[zeus] output kind "${kind}" is not registered.`)
      }

      return current
    },

    getDir(kind) {
      return this.get(kind).outDir
    },

    getFileName(kind, tag) {
      const current = this.get(kind)

      if (current.fileName) {
        return current.fileName(tag, kind)
      }

      return `${normalizeTagName(tag, current.stripPrefix)}.js`
    },

    join(kind, fileName) {
      return path.posix.join(this.getDir(kind), fileName)
    },
  }
}

function normalizeRegistration(
  kind: ZeusOutputKind,
  options: ZeusOutputRegistration,
): RequiredZeusOutputRegistration {
  return {
    outDir: options.outDir ?? defaultDir(kind),
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
  }
}

function defaultDir(kind: ZeusOutputKind): string {
  switch (kind) {
    case 'wc':
      return 'wc'
    case 'react':
      return 'react'
    case 'vue':
      return 'vue'
    case 'icons-react':
      return 'icons/react'
    case 'icons-vue':
      return 'icons/vue'
    case 'icons-wc':
      return 'icons/wc'
    case 'asset':
      return ''
  }
}

function normalizeTagName(tag: string, stripPrefix: string | false): string {
  if (stripPrefix && tag.startsWith(stripPrefix)) {
    return tag.slice(stripPrefix.length)
  }

  return tag
}
