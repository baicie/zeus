/**
 * Template registration, scope data management, and program injection.
 *
 * Tracks all compiled templates across the program scope, registers template
 * variable declarations (tmpl$0, tmpl$1, ...), and generates the template
 * registration calls at the top of the program.
 */
import * as t from '@babel/types'

import { getRendererConfig, registerImportMethod } from './imports'

import type { ProgramScopeData, TemplateRecord } from './imports'
import type { BabelProgramPath } from '../../types'

//#region template registry

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

//#endregion

//#region escape helpers

function escapeStringForTemplate(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
}

function isMathMLTemplate(template: string): boolean {
  return /^<(math|annotation|annotation-xml|maction|merror|mfrac|mi|mmultiscripts|mn|mo|mover|mpadded|mphantom|mprescripts|mroot|mrow|ms|mspace|msqrt|mstyle|msub|msubsup|msup|mtable|mtd|mtext|mtr|munder|munderover|semantics|menclose|mfenced)(\s|>)/.test(
    template,
  )
}

//#endregion

//#region program injection

/**
 * Generates `var tmpl$0 = template(...), tmpl$1 = template(...)` declarations
 * and unshifts them to the top of the program.
 */
export function appendTemplates(path: BabelProgramPath): void {
  const templates = getTemplates(path, 'dom')

  if (!templates.length) return

  const templateMethod = registerImportMethod(
    path,
    'template',
    getRendererConfig(path, 'dom').moduleName,
  )

  const declarators = templates.map((template: TemplateRecord) => {
    const html = template.templateWithClosingTags || template.template

    const tmpl = {
      cooked: html,
      raw: escapeStringForTemplate(html),
    }

    const shouldUseImportNode = Boolean(template.isCE || template.isImportNode)
    const isMathML = isMathMLTemplate(html)

    const args: t.Expression[] = [
      t.templateLiteral([t.templateElement(tmpl, true)], []),
    ]

    if (template.isSVG || shouldUseImportNode || isMathML) {
      args.push(
        t.booleanLiteral(shouldUseImportNode),
        t.booleanLiteral(Boolean(template.isSVG)),
        t.booleanLiteral(isMathML),
      )
    }

    return t.variableDeclarator(
      t.cloneNode(template.id),
      t.addComment(
        t.callExpression(t.cloneNode(templateMethod), args),
        'leading',
        '#__PURE__',
      ),
    )
  })

  path.node.body.unshift(t.variableDeclaration('var', declarators))
}

//#endregion
