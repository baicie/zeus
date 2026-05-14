import * as t from '@babel/types'

import {
  escapeStringForTemplate,
  getRendererConfig,
  isMathMLTemplate,
  type ProgramScopeData,
  registerImportMethod,
  type TemplateRecord,
} from '../utils'

import type { BabelProgramPath } from '../types'

export function appendTemplates(path: BabelProgramPath): void {
  const scopeData = path.scope.data as ProgramScopeData
  const templates = scopeData.templates?.filter(
    template => template.renderer === 'dom',
  )

  if (!templates?.length) return

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
