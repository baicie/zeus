import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'

import { analyzeFile } from './analyzeFile'

import type { AnalyzeComponentsOptions, AnalyzeComponentsResult } from './types'

export async function analyzeComponents(
  options: AnalyzeComponentsOptions,
): Promise<AnalyzeComponentsResult> {
  const root = options.root ?? process.cwd()

  const files = await fg(options.include, {
    cwd: root,
    absolute: true,
    ignore: options.exclude ?? ['node_modules/**', '**/dist/**'],
  })

  const components = []
  const diagnostics = []

  for (const file of files) {
    const code = await fs.readFile(file, 'utf-8')
    const result = analyzeFile({
      file: normalizePath(path.relative(root, file)),
      code,
    })

    components.push(...result.components)
    diagnostics.push(...result.diagnostics)
  }

  return {
    manifest: {
      version: 1,
      components,
    },
    diagnostics,
  }
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}
