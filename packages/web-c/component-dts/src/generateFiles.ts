import path from 'node:path'

import { generateWCJsxDts } from './generateJsxDts'
import { generatePropTypeDeclarations } from './generatePropTypeDeclarations'
import { generateComponentWCDtsFile, generateWCIndexDts } from './generateWcDts'
import {
  getComponentDtsFileName,
  getComponentFileBaseName,
  getGeneratedDeclarationNames,
} from './naming'

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
  const reservedNames = getGeneratedDeclarationNames(manifest.components)
  const resolvedComponents = generatePropTypeDeclarations(manifest.components, {
    reservedNames,
  }).components

  if (normalized.perComponent) {
    for (const component of resolvedComponents) {
      files.push({
        fileName: path.posix.join(
          normalized.outDir,
          getComponentDtsFileName(component.tag, normalized),
        ),
        source: generateComponentWCDtsFile(component, {
          exportPropTypes: false,
          reservedNames,
        }),
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
