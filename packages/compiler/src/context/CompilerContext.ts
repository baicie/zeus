import * as t from '@babel/types'

import { DEFAULT_RENDERER_MODULE } from '../codegen/support'

import type { CompilerOptions } from '../config'
import type { BabelProgramPath, ProgramScopeData } from '../types'
import type { NodePath } from '@babel/core'

export type RuntimeImportRecord = {
  moduleName: string
  imported: string
  local: t.Identifier
}

export type CompilerDiagnostic = {
  code: string
  message: string
  path?: NodePath
  hint?: string
}

export type IRTemplateRecord = {
  id: t.Identifier
  html: string
  isSVG: boolean
}

export class CompilerContext {
  readonly diagnostics: CompilerDiagnostic[] = []

  constructor(
    readonly options: CompilerOptions,
    readonly programPath: BabelProgramPath,
  ) {}

  runtimeModule(): string {
    return this.options.moduleName || DEFAULT_RENDERER_MODULE
  }

  uid(name: string): t.Identifier {
    return this.programPath.scope.generateUidIdentifier(name)
  }

  importRuntime(imported: string): t.Identifier {
    const moduleName = this.runtimeModule()
    const scopeData = this.programPath.scope.data as ProgramScopeData
    const importMethods = (scopeData.importMethods ||= new Map())
    const key = `${moduleName}:${imported}`
    const cached = importMethods.get(key)

    if (cached) return t.cloneNode(cached.local)

    const local = this.uid(imported)

    importMethods.set(key, {
      moduleName,
      imported,
      local,
    })

    return t.cloneNode(local)
  }

  registerTemplate(html: string, isSVG = false): IRTemplateRecord {
    const scopeData = this.programPath.scope.data as ProgramScopeData
    const templateMap = (scopeData.templateMap ||= new Map())
    const templates = (scopeData.templates ||= [])
    const cached = templateMap.get(html)

    if (cached) {
      return {
        id: t.cloneNode(cached.id),
        html,
        isSVG: Boolean(cached.isSVG),
      }
    }

    const id = this.uid('tmpl$')

    templateMap.set(html, {
      id,
      template: html,
      templateWithClosingTags: html,
      renderer: 'dom',
      isSVG,
      isCE: html.includes('-'),
      isImportNode: /^<(img|iframe)(\s|>)/.test(html),
    })
    templates.push(templateMap.get(html)!)

    return { id: t.cloneNode(id), html, isSVG }
  }

  report(diagnostic: CompilerDiagnostic): void {
    this.diagnostics.push(diagnostic)
  }
}

export function getCompilerContext(
  path: NodePath,
  options: CompilerOptions,
): CompilerContext {
  return new CompilerContext(
    options,
    path.scope.getProgramParent().path as BabelProgramPath,
  )
}
