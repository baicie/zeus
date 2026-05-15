/**
 * Runtime helpers registration and program injection.
 *
 * Manages the collection of runtime helper imports (template, insert, setAttr,
 * createComponent, delegateEvents, etc.) and generates the necessary import
 * declarations at the top of the program.
 */
import * as t from '@babel/types'

import type { BabelProgramPath, ZeusRenderer } from '../../types'
import type { NodePath } from '@babel/core'

type ImportMethodRecord = {
  imported: string
  local: t.Identifier
  moduleName: string
}

export type ProgramScopeData = {
  importMethods?: Map<string, ImportMethodRecord>
  events?: Set<string>
  templates?: TemplateRecord[]
}

export type TemplateRecord = {
  id: t.Identifier
  template: string
  templateWithClosingTags?: string
  renderer: ZeusRenderer
  isSVG?: boolean
  isCE?: boolean
  isImportNode?: boolean
}

export const DEFAULT_RENDERER_MODULE = '@zeus-js/runtime-dom'

//#region private helpers

function getImportKey(moduleName: string, imported: string): string {
  return `${moduleName}:${imported}`
}

type ZeusMetadata = {
  zeus?: {
    config?: {
      moduleName?: string
    }
  }
}

type BabelHubWithFile = {
  file?: {
    metadata?: ZeusMetadata
  }
}

export function getRendererConfig(
  path: NodePath,
  renderer: ZeusRenderer = 'dom',
) {
  const hub = path.hub as BabelHubWithFile
  const moduleName = hub.file?.metadata?.zeus?.config?.moduleName

  return {
    renderer,
    moduleName: moduleName || DEFAULT_RENDERER_MODULE,
  }
}

//#endregion

//#region import method registry

export function registerImportMethod(
  path: NodePath,
  imported: string,
  moduleName = getRendererConfig(path, 'dom').moduleName,
): t.Identifier {
  const data = getProgramScopeData(path)
  const importMethods = (data.importMethods ||= new Map())
  const key = getImportKey(moduleName, imported)
  const cached = importMethods.get(key)

  if (cached) {
    return t.cloneNode(cached.local)
  }

  const local = getProgramPath(path).scope.generateUidIdentifier(imported)

  importMethods.set(key, {
    imported,
    local,
    moduleName,
  })

  return t.cloneNode(local)
}

/**
 * Generates import declarations for all collected runtime helpers and
 * prepends them to the program body.
 */
export function appendImportMethods(path: BabelProgramPath): void {
  const data = path.scope.data as ProgramScopeData
  const importMethods = data.importMethods

  if (!importMethods?.size) return

  const grouped = new Map<string, ImportMethodRecord[]>()

  for (const record of importMethods.values()) {
    const records = grouped.get(record.moduleName)

    if (records) {
      records.push(record)
    } else {
      grouped.set(record.moduleName, [record])
    }
  }

  const declarations: t.ImportDeclaration[] = []

  for (const [moduleName, records] of grouped) {
    declarations.push(
      t.importDeclaration(
        records.map(record =>
          t.importSpecifier(
            t.cloneNode(record.local),
            t.identifier(record.imported),
          ),
        ),
        t.stringLiteral(moduleName),
      ),
    )
  }

  path.unshiftContainer('body', declarations)
}

//#endregion

//#region program scope data

export function getProgramScopeData(path: NodePath): ProgramScopeData {
  const programPath = path.scope.getProgramParent().path as BabelProgramPath
  return programPath.scope.data as ProgramScopeData
}

function getProgramPath(path: NodePath): BabelProgramPath {
  return path.scope.getProgramParent().path as BabelProgramPath
}

//#endregion

//#region escape helpers

export function escapeStringForTemplate(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
}

export function isMathMLTemplate(template: string): boolean {
  return /^<(math|annotation|annotation-xml|maction|merror|mfrac|mi|mmultiscripts|mn|mo|mover|mpadded|mphantom|mprescripts|mroot|mrow|ms|mspace|msqrt|mstyle|msub|msubsup|msup|mtable|mtd|mtext|mtr|munder|munderover|semantics|menclose|mfenced)(\s|>)/.test(
    template,
  )
}

//#endregion
