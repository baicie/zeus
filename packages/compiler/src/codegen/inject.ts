/**
 * Program injection codegen.
 *
 * Generates the variable declarations for all compiled templates and
 * injects them at the very top of the program body.
 *
 * This runs in Program.exit — after all JSX has been transformed and
 * all templates have been registered.
 */
import * as t from '@babel/types'

import {
  getTemplates,
  escapeStringForTemplate,
  isMathMLTemplate,
  registerImportMethod,
  getRendererConfig,
} from '../runtime'

import type { TemplateRecord } from '../runtime'
import type { BabelProgramPath } from '../types'

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
