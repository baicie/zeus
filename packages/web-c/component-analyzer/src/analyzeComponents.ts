import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'

import { analyzeFileWithImportedPropTypes } from './analyzeFile'
import { resolveImportedPropTypes } from './resolveImportedPropTypes'

import type { AnalyzeComponentsOptions, AnalyzeComponentsResult } from './types'

export async function analyzeComponents(
  options: AnalyzeComponentsOptions,
): Promise<AnalyzeComponentsResult> {
  const result = await analyzeComponentsWithDependencies(options)

  return {
    manifest: result.manifest,
    diagnostics: result.diagnostics,
  }
}

export interface AnalyzeComponentsWithDependenciesResult extends AnalyzeComponentsResult {
  dependencies: string[]
}

export async function analyzeComponentsWithDependencies(
  options: AnalyzeComponentsOptions,
): Promise<AnalyzeComponentsWithDependenciesResult> {
  const root = options.root ?? process.cwd()

  const files = await fg(options.include, {
    cwd: root,
    absolute: true,
    ignore: options.exclude ?? ['node_modules/**', '**/dist/**'],
  })

  const components = []
  const diagnostics: AnalyzeComponentsResult['diagnostics'] = []
  const dependencies = new Set(files)

  for (const file of files) {
    const relativeFile = normalizePath(path.relative(root, file))
    let code: string

    try {
      code = await fs.readFile(file, 'utf-8')
    } catch (error) {
      diagnostics.push({
        level: 'error',
        file: relativeFile,
        message: toErrorMessage(error),
      })
      continue
    }

    const imported = await resolveImportedPropTypes(file, code)

    for (const dependency of imported.dependencies) {
      dependencies.add(dependency)
    }

    for (const diagnostic of imported.diagnostics) {
      diagnostics.push({
        level: diagnostic.level,
        file: normalizePath(path.relative(root, diagnostic.file)),
        message: diagnostic.message,
      })
    }

    if (imported.diagnostics.length) continue

    const result = analyzeFileWithImportedPropTypes(
      {
        file: relativeFile,
        code,
      },
      imported.propTypes,
    )

    components.push(...result.components)
    diagnostics.push(...result.diagnostics)
  }

  return {
    manifest: {
      version: 1,
      components,
    },
    diagnostics,
    dependencies: Array.from(dependencies).sort(),
  }
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
