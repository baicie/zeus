/**
 * Template registration and scope data management.
 *
 * Tracks all compiled templates across the program scope and generates
 * the template variable declarations (tmpl$0, tmpl$1, ...) at the
 * top of the program.
 */
import { getProgramScopeData } from './imports'

import type { BabelProgramPath, ElementTransformResults } from '../types'
import type { ProgramScopeData, TemplateRecord } from './imports'
import type { NodePath } from '@babel/core'

//#region template registry

/**
 * Registers a compiled element template in the program scope.
 * Idempotent — if the same template string was already registered, does nothing.
 */
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

/**
 * Retrieves all registered templates for a given renderer.
 */
export function getTemplates(
  path: BabelProgramPath,
  renderer: 'dom' = 'dom',
): TemplateRecord[] {
  const scopeData = path.scope.data as ProgramScopeData
  return scopeData.templates?.filter(t => t.renderer === renderer) ?? []
}

/** Looks up a registered template by its template string. */
export function findTemplateByString(
  path: NodePath,
  template: string,
): TemplateRecord | undefined {
  const scopeData = getProgramScopeData(path)
  return scopeData.templates?.find(t => t.template === template)
}

//#endregion

//#region private helpers

function getProgramPath(path: NodePath): BabelProgramPath {
  return path.scope.getProgramParent().path as BabelProgramPath
}

//#endregion
