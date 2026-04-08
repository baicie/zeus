// @ts-nocheck
import * as t from '@babel/types'
import { transformElement as transformElementDOM } from '../dom/element'
import { createTemplate as createTemplateDOM } from '../dom/template'
import { transformElement as transformElementSSR } from '../ssr/element'
import { createTemplate as createTemplateSSR } from '../ssr/template'
import { transformElement as transformElementUniversal } from '../universal/element'
import { createTemplate as createTemplateUniversal } from '../universal/template'
import {
  escapeHTML,
  getConfig,
  getStaticExpression,
  getTagName,
  isComponent,
  isDynamic,
  transformCondition,
  trimWhitespace,
} from './utils'
import transformComponent from './component'
import transformFragmentChildren from './fragment'

export function transformJSX(path: any, state: any): void {
  if (state.skip) return
  const config = getConfig(path)
  const replace = transformThis(path)
  const result = transformNode(
    path,
    t.isJSXFragment(path.node) ? {} : { topLevel: true, lastElement: true },
  )
  const template = getCreateTemplate(config, path, result)
  path.replaceWith(replace(template(path, result, false)))
}

function getTargetFunctionParent(path: any, parent: any): any {
  let current = path.scope.getFunctionParent()
  while (
    current !== parent &&
    current &&
    current.path &&
    current.path.isArrowFunctionExpression()
  ) {
    current = current.path.parentPath.scope.getFunctionParent()
  }
  return current
}

export function transformThis(path: any): (node: t.Expression) => t.Expression {
  const parent = path.scope.getFunctionParent()
  let thisId: t.Identifier | undefined
  path.traverse({
    ThisExpression(p: any) {
      const current = getTargetFunctionParent(p, parent)
      if (current === parent) {
        if (!thisId) thisId = p.scope.generateUidIdentifier('self$')
        p.replaceWith(thisId)
      }
    },
    JSXElement(p: any) {
      let source = p.get('openingElement').get('name')
      while (source.isJSXMemberExpression()) source = source.get('object')
      if (source.isJSXIdentifier() && source.node.name === 'this') {
        const current = getTargetFunctionParent(p, parent)
        if (current === parent) {
          if (!thisId) thisId = p.scope.generateUidIdentifier('self$')
          source.replaceWith(t.jsxIdentifier(thisId.name))
          if (p.node.closingElement)
            p.node.closingElement.name = p.node.openingElement.name
        }
      }
    },
  })
  return (node: t.Expression) => {
    if (!thisId) return node
    if (!parent || parent.block.type === 'ClassMethod') {
      const decl = t.variableDeclaration('const', [
        t.variableDeclarator(thisId, t.thisExpression()),
      ])
      if (parent) path.getStatementParent().insertBefore(decl)
      else {
        return t.callExpression(
          t.arrowFunctionExpression(
            [],
            t.blockStatement([decl, t.returnStatement(node)]),
          ),
          [],
        )
      }
    } else {
      parent.push({ id: thisId, init: t.thisExpression(), kind: 'const' })
    }
    return node
  }
}

export function transformNode(path: any, info: any = {}): any {
  const config = getConfig(path)
  const node = path.node
  let staticValue: any
  if (t.isJSXElement(node)) return transformElement(config, path, info)
  if (t.isJSXFragment(node)) {
    const results = { template: '', declarations: [], exprs: [], dynamics: [] }
    transformFragmentChildren(path.get('children'), results, config)
    return results
  }
  if (
    t.isJSXText(node) ||
    (staticValue = getStaticExpression(path)) !== false
  ) {
    const text =
      staticValue !== undefined
        ? info.doNotEscape
          ? staticValue.toString()
          : escapeHTML(staticValue.toString())
        : trimWhitespace(node.extra.raw)
    if (!text.length) return null
    const results: any = {
      template: text,
      declarations: [],
      exprs: [],
      dynamics: [],
      postExprs: [],
      text: true,
    }
    if (!info.skipId && config.generate !== 'ssr')
      results.id = path.scope.generateUidIdentifier('el$')
    return results
  }
  if (t.isJSXExpressionContainer(node)) {
    if (t.isJSXEmptyExpression(node.expression)) return null
    if (
      !isDynamic(path.get('expression'), {
        checkMember: true,
        checkTags: !!info.componentChild,
        native: !info.componentChild,
      })
    ) {
      return { exprs: [node.expression], template: '' }
    }
    const expr =
      config.wrapConditionals &&
      config.generate !== 'ssr' &&
      (t.isLogicalExpression(node.expression) ||
        t.isConditionalExpression(node.expression))
        ? transformCondition(
            path.get('expression'),
            info.componentChild || info.fragmentChild,
          )
        : t.arrowFunctionExpression([], node.expression)
    if (Array.isArray(expr)) {
      return {
        exprs: [
          t.callExpression(
            t.arrowFunctionExpression(
              [],
              t.blockStatement([expr[0], t.returnStatement(expr[1])]),
            ),
            [],
          ),
        ],
        template: '',
        dynamic: true,
      }
    }
    return { exprs: [expr], template: '', dynamic: true }
  }
  if (t.isJSXSpreadChild(node)) {
    if (
      !isDynamic(path.get('expression'), {
        checkMember: true,
        native: !info.componentChild,
      })
    ) {
      return { exprs: [node.expression], template: '' }
    }
    return {
      exprs: [t.arrowFunctionExpression([], node.expression)],
      template: '',
      dynamic: true,
    }
  }
  return { exprs: [], template: '' }
}

export function getCreateTemplate(config: any, _path: any, result: any): any {
  if (
    (result.tagName && result.renderer === 'dom') ||
    config.generate === 'dom'
  )
    return createTemplateDOM
  if (result.renderer === 'ssr' || config.generate === 'ssr')
    return createTemplateSSR
  return createTemplateUniversal
}

export function transformElement(config: any, path: any, info: any = {}): any {
  const node = path.node
  const tagName = getTagName(node)
  if (isComponent(tagName)) return transformComponent(path)
  const tagRenderer = (config.renderers ?? []).find((renderer: any) =>
    renderer.elements.includes(tagName),
  )
  if (
    (tagRenderer && tagRenderer.name === 'dom') ||
    getConfig(path).generate === 'dom'
  )
    return transformElementDOM(path, info)
  if (getConfig(path).generate === 'ssr') return transformElementSSR(path, info)
  return transformElementUniversal(path, info)
}
