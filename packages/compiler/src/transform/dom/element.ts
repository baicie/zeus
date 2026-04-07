import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { JSXElement } from '@babel/types'
import {
  arrowFunctionExpression,
  assignmentExpression,
  blockStatement,
  callExpression,
  cloneNode,
  expressionStatement,
  identifier,
  isJSXAttribute,
  isJSXExpressionContainer,
  isJSXSpreadAttribute,
  isJSXText,
  memberExpression,
  returnStatement,
  stringLiteral,
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
import { transformSubtree } from '../transform-node'

function isMapCall(expr: t.Expression): boolean {
  if (expr.type !== 'CallExpression') {
    return false
  }
  if (expr.callee.type !== 'MemberExpression') {
    return false
  }
  if (expr.callee.computed) {
    return false
  }
  return (
    expr.callee.property.type === 'Identifier' &&
    expr.callee.property.name === 'map'
  )
}

function shouldWrapChildExpression(
  expr: t.Expression,
  config: ReturnType<typeof getConfig>,
): boolean {
  if (config.wrapConditionals) {
    if (
      expr.type === 'ConditionalExpression' ||
      expr.type === 'LogicalExpression'
    ) {
      return true
    }
  }
  // Minimal list optimization: memoize .map() child expressions.
  return isMapCall(expr)
}

function toChildAccessor(path: NodePath, expr: t.Expression): t.Expression {
  const config = getConfig(path)
  if (shouldWrapChildExpression(expr, config)) {
    const memoFn = registerImportMethod(path, config.memoWrapper)
    return callExpression(memoFn, [arrowFunctionExpression([], expr)])
  }
  return arrowFunctionExpression([], expr)
}

function toListRenderCall(
  path: NodePath,
  parent: t.Identifier,
  expr: t.Expression,
): t.Expression | null {
  if (!isMapCall(expr)) {
    return null
  }
  const call = expr as t.CallExpression
  if (!call.arguments.length) {
    return null
  }
  const mapper = call.arguments[0]
  if (!mapper || mapper.type === 'SpreadElement') {
    return null
  }
  const callee = call.callee as t.MemberExpression
  const source = callee.object as t.Expression
  const renderListFn = registerImportMethod(path, 'renderList')
  const keyFn = resolveListKeyFn(mapper as t.Expression)
  return callExpression(renderListFn, [
    parent,
    arrowFunctionExpression([], source),
    mapper as t.Expression,
    keyFn,
  ])
}

function resolveListKeyFn(mapper: t.Expression): t.Expression {
  const fallback = arrowFunctionExpression(
    [identifier('item'), identifier('index')],
    identifier('index'),
  )
  const keyExpr = extractKeyExprFromMapper(mapper)
  if (!keyExpr) {
    return fallback
  }
  const params = getMapperParams(mapper)
  if (!params) {
    return fallback
  }
  return arrowFunctionExpression(params, keyExpr)
}

function getMapperParams(
  mapper: t.Expression,
): [t.Identifier, t.Identifier] | null {
  if (mapper.type === 'ArrowFunctionExpression') {
    const p0 = mapper.params[0]
    const p1 = mapper.params[1]
    if (p0 && p0.type === 'Identifier' && p1 && p1.type === 'Identifier') {
      return [cloneNode(p0), cloneNode(p1)]
    }
  }
  if (mapper.type === 'FunctionExpression') {
    const p0 = mapper.params[0]
    const p1 = mapper.params[1]
    if (p0 && p0.type === 'Identifier' && p1 && p1.type === 'Identifier') {
      return [cloneNode(p0), cloneNode(p1)]
    }
  }
  return null
}

function extractKeyExprFromMapper(mapper: t.Expression): t.Expression | null {
  const jsx = getReturnedJSXElement(mapper)
  if (!jsx) {
    return null
  }
  const attrs = jsx.openingElement.attributes
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (attr.type !== 'JSXAttribute') {
      continue
    }
    if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'key') {
      continue
    }
    if (!attr.value) {
      return null
    }
    if (attr.value.type === 'StringLiteral') {
      return cloneNode(attr.value)
    }
    if (
      attr.value.type === 'JSXExpressionContainer' &&
      attr.value.expression.type !== 'JSXEmptyExpression'
    ) {
      return cloneNode(attr.value.expression)
    }
  }
  return null
}

function getReturnedJSXElement(mapper: t.Expression): t.JSXElement | null {
  if (
    mapper.type !== 'ArrowFunctionExpression' &&
    mapper.type !== 'FunctionExpression'
  ) {
    return null
  }
  if (mapper.body.type === 'JSXElement') {
    return mapper.body
  }
  if (mapper.body.type === 'BlockStatement') {
    let found: t.JSXElement | null = null
    for (let i = 0; i < mapper.body.body.length; i++) {
      const stmt = mapper.body.body[i]
      if (stmt.type === 'ReturnStatement' && stmt.argument) {
        if (stmt.argument.type !== 'JSXElement') {
          // complex return path (conditional/call/identifier) -> fallback key strategy
          return null
        }
        if (found) {
          // multiple JSX returns -> ambiguous key extraction, fallback
          return null
        }
        found = stmt.argument
      }
    }
    return found
  }
  return null
}
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

  const attrs = path.get('openingElement').get('attributes')

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
    renderer: config.generate === 'universal' ? 'universal' : 'dom',
  }

  const elemId = path.scope.generateUidIdentifier('el$')
  results.id = elemId

  let html = wrapSVG ? `<svg><${tagName}` : `<${tagName}`
  const spreadCalls: t.Expression[] = []

  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (isJSXSpreadAttribute(attr.node)) {
      spreadCalls.push(attr.node.argument)
      continue
    }
    if (!isJSXAttribute(attr.node)) {
      continue
    }
    const key = getAttrName(attr.node)
    if (key === 'ref') {
      const v = attr.node.value
      if (!v || !isJSXExpressionContainer(v)) {
        continue
      }
      if (v.expression.type === 'JSXEmptyExpression') {
        continue
      }
      const refFn = registerImportMethod(path, 'ref')
      results.exprs.push(
        expressionStatement(
          callExpression(refFn, [elemId, v.expression as t.Expression]),
        ),
      )
      continue
    }
    if (key.indexOf('use:') === 0) {
      const v = attr.node.value
      if (!v || !isJSXExpressionContainer(v)) {
        continue
      }
      if (v.expression.type === 'JSXEmptyExpression') {
        continue
      }
      const useFn = registerImportMethod(path, 'use')
      if (
        v.expression.type === 'ArrayExpression' &&
        v.expression.elements.length > 0
      ) {
        const action = v.expression.elements[0]
        const arg = v.expression.elements[1]
        if (action && action.type !== 'SpreadElement') {
          if (arg && arg.type !== 'SpreadElement') {
            results.exprs.push(
              expressionStatement(
                callExpression(useFn, [
                  elemId,
                  action as t.Expression,
                  arg as t.Expression,
                ]),
              ),
            )
            continue
          }
          results.exprs.push(
            expressionStatement(
              callExpression(useFn, [elemId, action as t.Expression]),
            ),
          )
          continue
        }
      }
      results.exprs.push(
        expressionStatement(
          callExpression(useFn, [elemId, v.expression as t.Expression]),
        ),
      )
      continue
    }

    if (key === 'style') {
      const styleFn = registerImportMethod(path, 'style')
      const v = attr.node.value
      if (v && isJSXExpressionContainer(v)) {
        if (v.expression.type === 'JSXEmptyExpression') {
          continue
        }
        const exprPath = attr
          .get('value')
          .get('expression') as NodePath<t.Expression>
        if (isDynamic(exprPath, { checkMember: true })) {
          results.exprs.push(
            expressionStatement(
              callExpression(styleFn, [
                elemId,
                arrowFunctionExpression([], v.expression as t.Expression),
              ]),
            ),
          )
        } else {
          results.exprs.push(
            expressionStatement(
              callExpression(styleFn, [elemId, v.expression as t.Expression]),
            ),
          )
        }
      } else if (v && v.type === 'StringLiteral') {
        html += ` style="${escapeForTemplate(escapeHTML(v.value, true))}"`
      }
      continue
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
        const effectFn = registerImportMethod(path, config.effectWrapper)
        const setAttrFn = registerImportMethod(path, 'setAttribute')
        results.exprs.push(
          expressionStatement(
            callExpression(effectFn, [
              arrowFunctionExpression(
                [],
                callExpression(setAttrFn, [
                  elemId,
                  {
                    type: 'StringLiteral',
                    value: key,
                  },
                  v.expression as t.Expression,
                ]),
              ),
            ]),
          ),
        )
        continue
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

  html += processChildren(path, elemId, results)

  html += `</${tagName}>`
  if (wrapSVG) {
    html += '</svg>'
  }

  if (spreadCalls.length) {
    const spreadFn = registerImportMethod(path, 'spread')
    for (let i = 0; i < spreadCalls.length; i++) {
      results.exprs.push(
        expressionStatement(callExpression(spreadFn, [elemId, spreadCalls[i]])),
      )
    }
  }

  return finalizeRootTemplate(path, results, elemId, html, wrapSVG, info)
}

function resultToExpression(result: TransformResult): t.Expression {
  if (result.outputExpr) {
    return result.outputExpr
  }
  if (!result.id) {
    return {
      type: 'NullLiteral',
    } as t.NullLiteral
  }
  const body: t.Statement[] = []
  for (let i = 0; i < result.exprs.length; i++) {
    body.push(result.exprs[i])
  }
  body.push(returnStatement(result.id))
  return callExpression(arrowFunctionExpression([], blockStatement(body)), [])
}

function processChildren(
  path: NodePath<JSXElement>,
  elemId: t.Identifier,
  results: TransformResult,
): string {
  const children = filterChildren(path.node.children)
  const rawChildren = path.get('children')
  let hasNestedJSX = false
  for (let i = 0; i < rawChildren.length; i++) {
    const childNode = rawChildren[i].node
    if (childNode.type === 'JSXElement' || childNode.type === 'JSXFragment') {
      hasNestedJSX = true
      break
    }
  }
  if (hasNestedJSX) {
    processChildrenWithNested(path, elemId, rawChildren, results)
    return ''
  }
  return processChildrenSimple(path, elemId, children, results)
}

function processChildrenSimple(
  path: NodePath<JSXElement>,
  elemId: t.Identifier,
  children: t.JSXElement['children'],
  results: TransformResult,
): string {
  let html = ''
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
      const listCall = toListRenderCall(
        path,
        elemId,
        ch.expression as t.Expression,
      )
      if (listCall) {
        results.exprs.push(expressionStatement(listCall))
        continue
      }
      const insertFn = registerImportMethod(path, 'insert')
      results.exprs.push(
        expressionStatement(
          callExpression(insertFn, [
            elemId,
            toChildAccessor(path, ch.expression as t.Expression),
          ]),
        ),
      )
    }
  }
  return html
}

function processChildrenWithNested(
  path: NodePath<JSXElement>,
  elemId: t.Identifier,
  rawChildren: Array<
    NodePath<
      | t.JSXText
      | t.JSXExpressionContainer
      | t.JSXSpreadChild
      | t.JSXElement
      | t.JSXFragment
    >
  >,
  results: TransformResult,
): void {
  const insertFn = registerImportMethod(path, 'insert')
  for (let i = 0; i < rawChildren.length; i++) {
    const childPath = rawChildren[i]
    const child = childPath.node
    if (child.type === 'JSXText') {
      const text = trimJSXText(child.value)
      if (text.length) {
        results.exprs.push(
          expressionStatement(
            callExpression(insertFn, [elemId, stringLiteral(text)]),
          ),
        )
      }
      continue
    }
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type === 'JSXEmptyExpression') {
        continue
      }
      const listCall = toListRenderCall(
        path,
        elemId,
        child.expression as t.Expression,
      )
      if (listCall) {
        results.exprs.push(expressionStatement(listCall))
        continue
      }
      results.exprs.push(
        expressionStatement(
          callExpression(insertFn, [
            elemId,
            toChildAccessor(path, child.expression as t.Expression),
          ]),
        ),
      )
      continue
    }
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      const childResult = transformSubtree(
        childPath as NodePath<t.JSXElement | t.JSXFragment>,
        {
          topLevel: true,
          lastElement: true,
        },
      )
      results.exprs.push(
        expressionStatement(
          callExpression(insertFn, [elemId, resultToExpression(childResult)]),
        ),
      )
    }
  }
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

  let initExpr: t.Expression = callExpression(templateId, [])
  if (isSVG) {
    // For wrapped SVG templates like <svg><circle/></svg>, expose inner element.
    initExpr = memberExpression(initExpr, identifier('firstChild'))
  }

  results.exprs.unshift(
    variableDeclaration('var', [variableDeclarator(elemId, initExpr)]),
  )

  return results
}
