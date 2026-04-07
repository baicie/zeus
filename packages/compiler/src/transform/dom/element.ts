import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { JSXElement } from '@babel/types'
import {
  arrowFunctionExpression,
  assignmentExpression,
  blockStatement,
  callExpression,
  expressionStatement,
  identifier,
  isJSXAttribute,
  isJSXExpressionContainer,
  isJSXSpreadAttribute,
  isJSXText,
  memberExpression,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types'
import type { TransformInfo, TransformResult } from '../../shared/types'
import {
  DELEGATED_EVENTS,
  SVG_ELEMENTS,
  VOID_ELEMENTS,
} from '../../shared/constants'
import { escapeForTemplate, escapeHTML } from '../../shared/escape'
import { getTagName, isDynamic } from '../../shared/dynamic'
import { getProgramScopeData } from '../../babel-cast'
import {
  filterChildren,
  getConfig,
  registerImportMethod,
  toEventName,
} from '../../shared/utils'
function isVoidTag(tagName: string): boolean {
  for (let i = 0; i < VOID_ELEMENTS.length; i++) {
    if (VOID_ELEMENTS[i] === tagName) {
      return true
    }
  }
  return false
}

function getAttrName(attr: t.JSXAttribute): string {
  const n = attr.name
  if (n.type === 'JSXIdentifier') {
    return n.name
  }
  return `${n.namespace.name}:${n.name.name}`
}

function trimJSXText(s: string): string {
  return s.replace(/\u200c|\u200b/g, '').trim()
}

function attrStaticHtml(key: string, expr: t.Expression): string | null {
  if (expr.type === 'StringLiteral') {
    return ` ${key}="${escapeForTemplate(escapeHTML(expr.value, true))}"`
  }
  if (expr.type === 'NumericLiteral') {
    return ` ${key}="${String(expr.value)}"`
  }
  if (expr.type === 'BooleanLiteral') {
    return expr.value ? ` ${key}` : null
  }
  return null
}

export function transformElementDOM(
  path: NodePath<JSXElement>,
  info: TransformInfo,
): TransformResult {
  const config = getConfig(path)
  const tagName = getTagName(path.node)

  if (config.generate === 'ssr') {
    throw new Error(
      '[zeus-jsx] SSR mode is not implemented yet (use generate: "dom").',
    )
  }
  if (config.generate === 'universal') {
    throw new Error(
      '[zeus-jsx] universal mode is not implemented yet (use generate: "dom").',
    )
  }

  const attrs = path.get('openingElement').get('attributes')
  for (let i = 0; i < attrs.length; i++) {
    if (isJSXSpreadAttribute(attrs[i].node)) {
      throw new Error(
        '[zeus-jsx] JSX spread attributes are not implemented yet.',
      )
    }
  }

  const wrapSVG =
    info.topLevel === true && tagName !== 'svg' && SVG_ELEMENTS.has(tagName)
  const voidTag = isVoidTag(tagName)

  const results: TransformResult = {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: wrapSVG,
    tagName,
    renderer: 'dom',
  }

  const elemId = path.scope.generateUidIdentifier('el$')
  results.id = elemId

  let html = wrapSVG ? `<svg><${tagName}` : `<${tagName}`

  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!isJSXAttribute(attr.node)) {
      continue
    }
    const key = getAttrName(attr.node)
    if (key === 'ref' || key.indexOf('use:') === 0) {
      throw new Error(`[zeus-jsx] attribute "${key}" is not implemented yet.`)
    }

    if (key.indexOf('on') === 0 && key.length > 2) {
      const ev = toEventName(key)
      const val = attr.node.value
      if (!val || !isJSXExpressionContainer(val)) {
        continue
      }
      const handler = val.expression
      if (handler.type === 'JSXEmptyExpression') {
        continue
      }
      if (config.delegateEvents && DELEGATED_EVENTS.has(ev)) {
        const scopeData = getProgramScopeData(path)
        if (!scopeData) {
          throw new Error('[zeus-jsx] internal: scope data missing')
        }
        if (!scopeData.events) {
          scopeData.events = new Set()
        }
        scopeData.events.add(ev)
        const keyId = identifier(`$$${ev}`)
        results.exprs.push(
          expressionStatement(
            assignmentExpression(
              '=',
              memberExpression(elemId, keyId),
              handler as t.Expression,
            ),
          ),
        )
      } else {
        const prop = `on${ev.charAt(0).toUpperCase()}${ev.slice(1)}`
        results.exprs.push(
          expressionStatement(
            assignmentExpression(
              '=',
              memberExpression(elemId, identifier(prop)),
              handler as t.Expression,
            ),
          ),
        )
      }
      continue
    }

    if (key === 'class' || key === 'className') {
      const v = attr.node.value
      if (v && isJSXExpressionContainer(v)) {
        if (v.expression.type === 'JSXEmptyExpression') {
          continue
        }
        const exprPath = attr
          .get('value')
          .get('expression') as NodePath<t.Expression>
        if (isDynamic(exprPath, { checkMember: true })) {
          const effectFn = registerImportMethod(path, config.effectWrapper)
          results.exprs.push(
            expressionStatement(
              callExpression(effectFn, [
                arrowFunctionExpression(
                  [],
                  blockStatement([
                    expressionStatement(
                      assignmentExpression(
                        '=',
                        memberExpression(elemId, identifier('className')),
                        v.expression as t.Expression,
                      ),
                    ),
                  ]),
                ),
              ]),
            ),
          )
        } else {
          const stat = attrStaticHtml('class', v.expression as t.Expression)
          if (stat) {
            html += stat
          }
        }
      } else if (v && v.type === 'StringLiteral') {
        html += ` class="${escapeForTemplate(escapeHTML(v.value, true))}"`
      }
      continue
    }

    const v = attr.node.value
    if (v && isJSXExpressionContainer(v)) {
      if (v.expression.type === 'JSXEmptyExpression') {
        continue
      }
      const exprPath = attr
        .get('value')
        .get('expression') as NodePath<t.Expression>
      if (isDynamic(exprPath, { checkMember: true })) {
        throw new Error(
          `[zeus-jsx] dynamic attribute "${key}" is not implemented yet (only class/className).`,
        )
      }
      const st = attrStaticHtml(key, v.expression as t.Expression)
      if (st) {
        html += st
      }
    } else if (v && v.type === 'StringLiteral') {
      html += ` ${key}="${escapeForTemplate(escapeHTML(v.value, true))}"`
    } else if (!v) {
      html += ` ${key}`
    }
  }

  html += '>'

  if (voidTag) {
    if (wrapSVG) {
      html += '</svg>'
    }
    return finalizeRootTemplate(path, results, elemId, html, wrapSVG, info)
  }

  const children = filterChildren(path.node.children)

  for (let i = 0; i < children.length; i++) {
    const ch = children[i]
    if (isJSXText(ch)) {
      const text = trimJSXText(ch.value)
      if (text.length) {
        html += escapeForTemplate(escapeHTML(text, false))
      }
      continue
    }
    if (ch.type === 'JSXExpressionContainer') {
      if (ch.expression.type === 'JSXEmptyExpression') {
        continue
      }
      const insertFn = registerImportMethod(path, 'insert')
      results.exprs.push(
        expressionStatement(
          callExpression(insertFn, [
            elemId,
            arrowFunctionExpression([], ch.expression as t.Expression),
          ]),
        ),
      )
      continue
    }
    if (ch.type === 'JSXElement') {
      throw new Error('[zeus-jsx] nested JSX elements are not implemented yet.')
    }
    if (ch.type === 'JSXFragment') {
      throw new Error('[zeus-jsx] nested JSX Fragment is not implemented yet.')
    }
  }

  html += `</${tagName}>`
  if (wrapSVG) {
    html += '</svg>'
  }

  return finalizeRootTemplate(path, results, elemId, html, wrapSVG, info)
}

function finalizeRootTemplate(
  path: NodePath,
  results: TransformResult,
  elemId: t.Identifier,
  html: string,
  isSVG: boolean,
  _info: TransformInfo,
): TransformResult {
  const data = getProgramScopeData(path)
  if (!data) {
    throw new Error(
      '[zeus-jsx] internal: scope data missing in finalizeRootTemplate',
    )
  }
  const templateId = path.scope.generateUidIdentifier('tmpl$')
  results.templateId = templateId
  results.template = html
  if (!data.templates) {
    data.templates = []
  }
  data.templates.push({
    id: templateId,
    template: html,
    templateWithClosingTags: html,
    isSVG,
    isCE: false,
    isImportNode: false,
    renderer: 'dom',
  })
  registerImportMethod(path, 'template')

  results.exprs.unshift(
    variableDeclaration('var', [
      variableDeclarator(elemId, callExpression(templateId, [])),
    ]),
  )

  return results
}
