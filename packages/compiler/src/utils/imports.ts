import * as t from '@babel/types'

import type {
  BabelProgramPath,
  ElementTransformResults,
  ZeusRenderer,
} from '../types'
import type { NodePath } from '@babel/core'

type ImportMethodRecord = {
  imported: string
  local: t.Identifier
  moduleName: string
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

export type ProgramScopeData = {
  importMethods?: Map<string, ImportMethodRecord>
  events?: Set<string>
  templates?: TemplateRecord[]
}

export const DEFAULT_RENDERER_MODULE = '@zeus-js/runtime-dom'

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

export function appendEvents(path: BabelProgramPath): void {
  const scopeData = path.scope.data as ProgramScopeData
  const events = scopeData.events

  if (!events?.size) return

  path.node.body.push(
    t.expressionStatement(
      t.callExpression(
        registerImportMethod(
          path,
          'delegateEvents',
          getRendererConfig(path, 'dom').moduleName,
        ),
        [
          t.arrayExpression(
            Array.from(events).map(eventName => t.stringLiteral(eventName)),
          ),
        ],
      ),
    ),
  )
}

export function getProgramScopeData(path: NodePath): ProgramScopeData {
  const programPath = path.scope.getProgramParent().path as BabelProgramPath
  return programPath.scope.data as ProgramScopeData
}

function getProgramPath(path: NodePath): BabelProgramPath {
  return path.scope.getProgramParent().path as BabelProgramPath
}

export function registerTemplate(
  path: NodePath,
  result: ElementTransformResults,
): void {
  if (!result.template.length || result.skipTemplate) return

  const scopeData = getProgramScopeData(path)
  const templates = (scopeData.templates ||= [])

  const existing = templates.find(t => t.template === result.template)

  if (existing) return

  const templateId = getProgramPath(path).scope.generateUidIdentifier('tmpl$')

  templates.push({
    id: templateId,
    template: result.template,
    templateWithClosingTags: result.templateWithClosingTags,
    isSVG: result.isSVG,
    isCE: result.hasCustomElement,
    isImportNode: result.isImportNode,
    renderer: result.renderer,
  })
}

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
