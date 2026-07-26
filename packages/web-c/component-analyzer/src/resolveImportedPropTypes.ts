import fs from 'node:fs/promises'
import path from 'node:path'

import * as t from '@babel/types'

import { parseSource } from './ast'
import { collectLocalPropTypes } from './extractTypeProps'

import type { AnalyzerDiagnostic, ComponentProp } from './types'

type PropTypeMap = Map<string, Record<string, Partial<ComponentProp>>>

interface ResolvedModulePropTypes {
  bindings: PropTypeMap
  exports: PropTypeMap
  importedNames: Set<string>
}

export interface ResolvedImportedPropTypes {
  propTypes: PropTypeMap
  dependencies: string[]
  diagnostics: AnalyzerDiagnostic[]
}

export async function resolveImportedPropTypes(
  file: string,
  code: string,
): Promise<ResolvedImportedPropTypes> {
  const resolvedFile = path.resolve(file)
  const cache = new Map<string, ResolvedModulePropTypes>()
  const dependencies = new Set<string>()
  const diagnostics: AnalyzerDiagnostic[] = []
  const resolved = await collectFilePropTypes(
    resolvedFile,
    code,
    cache,
    new Set(),
    dependencies,
    diagnostics,
  )
  const result: PropTypeMap = new Map()

  for (const name of resolved.importedNames) {
    const props = resolved.bindings.get(name)

    if (props) {
      result.set(name, props)
    }
  }

  return {
    propTypes: result,
    dependencies: Array.from(dependencies).sort(),
    diagnostics,
  }
}

async function collectFilePropTypes(
  file: string,
  providedCode: string | undefined,
  cache: Map<string, ResolvedModulePropTypes>,
  ancestors: Set<string>,
  dependencies: Set<string>,
  diagnostics: AnalyzerDiagnostic[],
): Promise<ResolvedModulePropTypes> {
  const cached = cache.get(file)

  if (cached) return cached
  if (ancestors.has(file)) return createEmptyModulePropTypes()

  let ast: t.File

  try {
    const code =
      providedCode === undefined
        ? await fs.readFile(file, 'utf-8')
        : providedCode

    ast = parseSource(code, file)
  } catch (error) {
    const failed = createEmptyModulePropTypes()

    diagnostics.push({
      level: 'error',
      file,
      message: toErrorMessage(error),
    })
    cache.set(file, failed)
    return failed
  }

  const nextAncestors = new Set(ancestors)
  const importedPropTypes: PropTypeMap = new Map()
  const importedNames = new Set<string>()
  const exportedPropTypes: PropTypeMap = new Map()

  nextAncestors.add(file)

  for (const declaration of ast.program.body) {
    if (t.isImportDeclaration(declaration)) {
      const specifiers = collectTypeImportSpecifiers(declaration)

      for (const specifier of specifiers) {
        importedNames.add(specifier.local.name)
      }

      if (!specifiers.length) continue

      const sourceTypes = await resolveModuleSource(
        file,
        declaration.source.value,
        cache,
        nextAncestors,
        dependencies,
        diagnostics,
      )

      if (!sourceTypes) continue

      for (const specifier of specifiers) {
        const importedName = t.isImportDefaultSpecifier(specifier)
          ? 'default'
          : getModuleName(specifier.imported)
        const props = sourceTypes.exports.get(importedName)

        if (props) {
          importedPropTypes.set(specifier.local.name, props)
        }
      }

      continue
    }

    if (t.isExportNamedDeclaration(declaration) && declaration.source) {
      const sourceTypes = await resolveModuleSource(
        file,
        declaration.source.value,
        cache,
        nextAncestors,
        dependencies,
        diagnostics,
      )

      if (!sourceTypes) continue

      for (const specifier of declaration.specifiers) {
        if (!t.isExportSpecifier(specifier)) continue

        const props = sourceTypes.exports.get(getModuleName(specifier.local))

        if (props) {
          exportedPropTypes.set(getModuleName(specifier.exported), props)
        }
      }

      continue
    }

    if (t.isExportAllDeclaration(declaration)) {
      const sourceTypes = await resolveModuleSource(
        file,
        declaration.source.value,
        cache,
        nextAncestors,
        dependencies,
        diagnostics,
      )

      if (!sourceTypes) continue

      for (const [name, props] of sourceTypes.exports) {
        if (name !== 'default') {
          exportedPropTypes.set(name, props)
        }
      }
    }
  }

  const bindings = collectLocalPropTypes(ast, importedPropTypes)

  collectLocalExports(ast, bindings, exportedPropTypes)

  const result: ResolvedModulePropTypes = {
    bindings,
    exports: exportedPropTypes,
    importedNames,
  }

  cache.set(file, result)
  return result
}

function collectTypeImportSpecifiers(
  declaration: t.ImportDeclaration,
): Array<t.ImportSpecifier | t.ImportDefaultSpecifier> {
  const result: Array<t.ImportSpecifier | t.ImportDefaultSpecifier> = []

  for (const specifier of declaration.specifiers) {
    if (t.isImportSpecifier(specifier)) {
      result.push(specifier)
      continue
    }

    if (
      t.isImportDefaultSpecifier(specifier) &&
      declaration.importKind === 'type'
    ) {
      result.push(specifier)
    }
  }

  return result
}

function collectLocalExports(
  ast: t.File,
  bindings: PropTypeMap,
  exports: PropTypeMap,
): void {
  for (const declaration of ast.program.body) {
    if (t.isExportNamedDeclaration(declaration) && !declaration.source) {
      const localDeclaration = declaration.declaration

      if (
        t.isTSInterfaceDeclaration(localDeclaration) ||
        t.isTSTypeAliasDeclaration(localDeclaration)
      ) {
        setExportedPropType(
          exports,
          localDeclaration.id.name,
          bindings.get(localDeclaration.id.name),
        )
      }

      for (const specifier of declaration.specifiers) {
        if (!t.isExportSpecifier(specifier)) continue

        setExportedPropType(
          exports,
          getModuleName(specifier.exported),
          bindings.get(getModuleName(specifier.local)),
        )
      }

      continue
    }

    if (!t.isExportDefaultDeclaration(declaration)) continue

    const defaultDeclaration = declaration.declaration

    if (
      t.isTSInterfaceDeclaration(defaultDeclaration) ||
      t.isTSTypeAliasDeclaration(defaultDeclaration)
    ) {
      setExportedPropType(
        exports,
        'default',
        bindings.get(defaultDeclaration.id.name),
      )
    } else if (t.isIdentifier(defaultDeclaration)) {
      setExportedPropType(
        exports,
        'default',
        bindings.get(defaultDeclaration.name),
      )
    }
  }
}

function setExportedPropType(
  exports: PropTypeMap,
  name: string,
  props: Record<string, Partial<ComponentProp>> | undefined,
): void {
  if (props) {
    exports.set(name, props)
  }
}

async function resolveModuleSource(
  importer: string,
  source: string,
  cache: Map<string, ResolvedModulePropTypes>,
  ancestors: Set<string>,
  dependencies: Set<string>,
  diagnostics: AnalyzerDiagnostic[],
): Promise<ResolvedModulePropTypes | undefined> {
  if (!source.startsWith('.')) return undefined

  const importedFile = await resolveRelativeModule(importer, source)

  if (!importedFile) return undefined

  dependencies.add(importedFile)

  return collectFilePropTypes(
    importedFile,
    undefined,
    cache,
    ancestors,
    dependencies,
    diagnostics,
  )
}

function createEmptyModulePropTypes(): ResolvedModulePropTypes {
  return {
    bindings: new Map(),
    exports: new Map(),
    importedNames: new Set(),
  }
}

function getModuleName(node: t.Identifier | t.StringLiteral): string {
  return t.isIdentifier(node) ? node.name : node.value
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function resolveRelativeModule(
  importer: string,
  source: string,
): Promise<string | undefined> {
  const base = path.resolve(path.dirname(importer), source)
  const extension = path.extname(base).toLowerCase()
  const runtimeCandidates = RUNTIME_EXTENSION_CANDIDATES.get(extension)
  let candidates: string[]

  if (runtimeCandidates) {
    const sourceBase = base.slice(0, -extension.length)

    candidates = runtimeCandidates.map(value => `${sourceBase}${value}`)
  } else if (extension) {
    if (!TYPE_FILE_EXTENSIONS.has(extension)) return undefined

    candidates = [base]
  } else {
    candidates = TYPE_SOURCE_EXTENSIONS.map(value => `${base}${value}`)
    candidates.unshift(base)

    for (const value of TYPE_SOURCE_EXTENSIONS) {
      candidates.push(path.join(base, `index${value}`))
    }
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)

      if (stat.isFile()) return candidate
    } catch {}
  }

  return undefined
}

const TYPE_SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.d.ts',
  '.d.mts',
  '.d.cts',
]
const TYPE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const RUNTIME_EXTENSION_CANDIDATES = new Map([
  ['.js', ['.ts', '.tsx', '.d.ts']],
  ['.mjs', ['.mts', '.d.mts']],
  ['.cjs', ['.cts', '.d.cts']],
])
