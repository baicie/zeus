import path from 'node:path'

import { generateWCJsxDts } from './generateJsxDts'
import { generateComponentWCDts, generateWCIndexDts } from './generateWcDts'
import { getComponentDtsFileName, getComponentFileBaseName } from './naming'

import type {
  ComponentDtsOptions,
  DtsOutputFile,
  NormalizedComponentDtsOptions,
} from './types'
import type { ComponentManifest } from '@zeus-js/component-analyzer'

export function generateWCDtsFiles(
  manifest: ComponentManifest,
  options: ComponentDtsOptions = {},
): DtsOutputFile[] {
  const normalized = normalizeOptions(options)
  const files: DtsOutputFile[] = []

  if (normalized.perComponent) {
    for (const component of manifest.components) {
      files.push({
        fileName: path.posix.join(
          normalized.outDir,
          getComponentDtsFileName(component.tag, normalized),
        ),
        source: generateComponentWCDts(component),
      })
    }
  }

  if (normalized.index) {
    files.push({
      fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
      source: generateWCIndexDts(manifest, {
        getComponentImportPath: component =>
          `./${getComponentFileBaseName(component.tag, normalized)}`,
      }),
    })
  }

  if (normalized.jsx) {
    files.push({
      fileName: path.posix.join(normalized.outDir, 'jsx.d.ts'),
      source: generateWCJsxDts(manifest),
    })
  }

  return files
}

export function normalizeOptions(
  options: ComponentDtsOptions,
): NormalizedComponentDtsOptions {
  return {
    outDir: options.outDir ?? 'wc',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    perComponent: options.perComponent ?? true,
    index: options.index ?? true,
    jsx: options.jsx ?? true,
  }
}
