// @ts-nocheck
import * as t from '@babel/types'
import { registerImportMethod } from '../shared/utils'

export function createTemplate(_path: any, result: any): t.Expression {
  const path = _path
  if (!result.template) {
    if (result.exprs && result.exprs[0]) return result.exprs[0]
    return t.identifier('undefined')
  }
  let template: t.Expression
  let id: t.Identifier | undefined

  if (!Array.isArray(result.template)) {
    template = t.stringLiteral(result.template)
  } else if (result.template.length === 1) {
    template = t.stringLiteral(result.template[0])
  } else {
    template = t.arrayExpression(
      result.template.map((tmpl: string) => t.stringLiteral(tmpl)),
    )
  }

  const templates =
    path.scope.getProgramParent().data.templates ||
    (path.scope.getProgramParent().data.templates = [])
  const found = templates.find((tmp: any) => {
    if (t.isArrayExpression(tmp.template) && t.isArrayExpression(template)) {
      return tmp.template.elements.every(
        (el: any, i: number) =>
          template.elements[i] &&
          el.value === (template as any).elements[i].value,
      )
    }
    return (tmp.template as any).value === (template as any).value
  })

  if (!found) {
    id = path.scope.generateUidIdentifier('tmpl$')
    templates.push({
      id,
      template,
      templateWithClosingTags: template,
      renderer: 'ssr',
    })
  } else {
    id = found.id
  }

  if (result.wontEscape) {
    if (!Array.isArray(result.template) || result.template.length === 1)
      return id
    const firstTemplateValue =
      result.templateValues && result.templateValues.length
        ? result.templateValues[0]
        : undefined
    if (
      Array.isArray(result.template) &&
      result.template.length === 2 &&
      firstTemplateValue &&
      firstTemplateValue.type === 'CallExpression' &&
      firstTemplateValue.callee &&
      firstTemplateValue.callee.name === '_$ssrHydrationKey'
    ) {
      return t.binaryExpression(
        '+',
        t.binaryExpression(
          '+',
          t.memberExpression(id, t.numericLiteral(0), true),
          result.templateValues[0],
        ),
        t.memberExpression(id, t.numericLiteral(1), true),
      )
    }
  }
  return t.callExpression(
    registerImportMethod(path, 'ssr'),
    Array.isArray(result.template) && result.template.length > 1
      ? [id, ...result.templateValues]
      : [id],
  )
}

export function appendTemplates(path: any, templates: any[]): void {
  const declarators = templates.map(template =>
    t.variableDeclarator(template.id, template.template),
  )
  path.node.body.unshift(t.variableDeclaration('var', declarators))
}
