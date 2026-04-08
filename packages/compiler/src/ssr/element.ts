// @ts-nocheck
import * as t from '@babel/types'
import {
  Aliases,
  BooleanAttributes,
  ChildProperties,
  SVGElements,
} from '../shared/constants'
import VoidElements from '../VoidElements'
import {
  checkLength,
  convertJSXIdentifier,
  escapeHTML,
  filterChildren,
  getConfig,
  getTagName,
  registerImportMethod,
  trimWhitespace,
} from '../shared/utils'
import { transformNode } from '../shared/transform'
import { createTemplate } from './template'

function decodeText(v: string): string {
  return v
}

function appendToTemplate(template: string[], value: string | string[]): void {
  let array: string[] | undefined
  let first: string | undefined
  if (Array.isArray(value)) {
    first = value[0]
    array = value.slice(1)
  }
  template[template.length - 1] += first || (value as string)
  if (array && array.length) template.push.apply(template, array)
}

export function transformElement(path: any, info: any): any {
  const config = getConfig(path)
  const tagName = getTagName(path.node)
  const voidTag = VoidElements.indexOf(tagName) > -1

  if (
    path.node.openingElement.attributes.some((a: any) =>
      t.isJSXSpreadAttribute(a),
    )
  ) {
    return createElement(path, {
      topLevel: info.topLevel,
      hydratable: config.hydratable,
    })
  }

  const results: any = {
    template: [`<${tagName}`],
    templateValues: [],
    declarations: [],
    exprs: [],
    dynamics: [],
    renderer: 'ssr',
    tagName,
  }
  transformAttributes(path, results)
  appendToTemplate(results.template, '>')
  if (!voidTag) {
    transformChildren(path, results, config.hydratable)
    appendToTemplate(results.template, `</${tagName}>`)
  }
  return results
}

function createElement(path: any, { topLevel, hydratable }: any): any {
  const tagName = getTagName(path.node)
  const filteredChildren = filterChildren(path.get('children'))
  const multi = checkLength(filteredChildren)
  const markers = hydratable && multi
  const childNodes = filteredChildren.reduce((memo: any[], p: any) => {
    if (t.isJSXText(p.node)) {
      const v = decodeText(trimWhitespace(p.node.extra.raw))
      if (v.length) memo.push(t.stringLiteral(v))
    } else {
      const child = transformNode(p)
      if (markers && child.exprs.length && !child.spreadElement)
        memo.push(t.stringLiteral('<!--$-->'))
      memo.push(
        child.exprs.length ? child.exprs[0] : createTemplate(path, child),
      )
      if (markers && child.exprs.length && !child.spreadElement)
        memo.push(t.stringLiteral('<!--/-->'))
    }
    return memo
  }, [])

  const props = t.objectExpression(
    path.node.openingElement.attributes
      .filter((a: any) => !t.isJSXSpreadAttribute(a))
      .map((attr: any) => {
        const key = t.isJSXNamespacedName(attr.name)
          ? `${attr.name.namespace.name}:${attr.name.name.name}`
          : attr.name.name
        const val = attr.value
        const value = t.isJSXExpressionContainer(val)
          ? val.expression
          : val || t.booleanLiteral(true)
        return t.objectProperty(
          convertJSXIdentifier(t.jsxIdentifier(key)),
          value,
        )
      }),
  )

  const exprs = [
    t.callExpression(registerImportMethod(path, 'ssrElement'), [
      t.stringLiteral(tagName),
      props,
      childNodes.length
        ? hydratable
          ? t.arrowFunctionExpression(
              [],
              childNodes.length === 1
                ? childNodes[0]
                : t.arrayExpression(childNodes),
            )
          : childNodes.length === 1
            ? childNodes[0]
            : t.arrayExpression(childNodes)
        : t.identifier('undefined'),
      t.booleanLiteral(Boolean(topLevel && getConfig(path).hydratable)),
    ]),
  ]
  return { exprs, template: '', spreadElement: true }
}

function toAttribute(key: string, isSVG: boolean): string {
  key = Aliases[key] || key
  if (!isSVG) key = key.toLowerCase()
  return key
}

function transformAttributes(path: any, results: any): void {
  const tagName = getTagName(path.node)
  const isSVG = SVGElements.has(tagName)
  const attributes = path.get('openingElement').get('attributes')
  attributes.forEach((attribute: any) => {
    const node = attribute.node
    if (t.isJSXSpreadAttribute(node)) return
    let key = t.isJSXNamespacedName(node.name)
      ? `${node.name.namespace.name}:${node.name.name.name}`
      : node.name.name
    const value = node.value
    if (
      key === 'ref' ||
      key.startsWith('use:') ||
      key.startsWith('prop:') ||
      key.startsWith('on')
    )
      return
    if (!value) {
      appendToTemplate(results.template, ` ${toAttribute(key, isSVG)}`)
      return
    }
    if (t.isStringLiteral(value)) {
      appendToTemplate(
        results.template,
        ` ${toAttribute(key, isSVG)}="${escapeHTML(value.value, true)}"`,
      )
      return
    }
    if (t.isNumericLiteral(value)) {
      appendToTemplate(
        results.template,
        ` ${toAttribute(key, isSVG)}="${escapeHTML(String(value.value), true)}"`,
      )
      return
    }
    if (t.isBooleanLiteral(value)) {
      if (value.value)
        appendToTemplate(results.template, ` ${toAttribute(key, isSVG)}`)
      return
    }
    if (t.isJSXExpressionContainer(value)) {
      if (ChildProperties.has(key)) return
      if (key === 'style') {
        if (
          t.isObjectExpression(value.expression) &&
          !value.expression.properties.some((p: any) => t.isSpreadElement(p))
        ) {
          const props = value.expression.properties.map((p: any, i: number) => {
            if (p.computed) {
              return t.callExpression(
                registerImportMethod(path, 'ssrStyleProperty'),
                [
                  t.binaryExpression('+', p.key, t.stringLiteral(':')),
                  escapeExpression(path, p.value, true),
                ],
              )
            }
            return t.callExpression(
              registerImportMethod(path, 'ssrStyleProperty'),
              [
                t.stringLiteral(
                  (i ? ';' : '') +
                    (t.isIdentifier(p.key) ? p.key.name : p.key.value) +
                    ':',
                ),
                escapeExpression(path, p.value, true),
              ],
            )
          })
          let res = props[0]
          for (let i = 1; i < props.length; i++) {
            res = t.binaryExpression('+', res, props[i])
          }
          results.template.push(' style="', '"')
          results.templateValues.push(res)
        } else {
          results.template.push(' style="', '"')
          results.templateValues.push(
            t.callExpression(registerImportMethod(attribute, 'ssrStyle'), [
              value.expression,
            ]),
          )
        }
        return
      }
      if (key === 'classList') {
        if (
          t.isObjectExpression(value.expression) &&
          !value.expression.properties.some((p: any) => t.isSpreadElement(p))
        ) {
          const values: t.Expression[] = []
          const quasis: t.TemplateElement[] = [t.templateElement({ raw: '' })]
          value.expression.properties.forEach((prop: any, i: number) => {
            const isLast = value.expression.properties.length - 1 === i
            let keyExpr: t.Expression
            if (t.isIdentifier(prop.key) && !prop.computed)
              keyExpr = t.stringLiteral(prop.key.name)
            else if (prop.computed) {
              keyExpr = t.callExpression(registerImportMethod(path, 'escape'), [
                prop.key,
                t.booleanLiteral(true),
              ])
            } else {
              keyExpr = t.stringLiteral(escapeHTML(prop.key.value, true))
            }

            if (t.isBooleanLiteral(prop.value)) {
              if (prop.value.value === true) {
                if (!prop.computed && t.isStringLiteral(keyExpr)) {
                  const prev = quasis.pop()
                  quasis.push(
                    t.templateElement({
                      raw:
                        (prev ? prev.value.raw : '') +
                        (i ? ' ' : '') +
                        keyExpr.value +
                        (isLast ? '' : ' '),
                    }),
                  )
                } else {
                  values.push(keyExpr)
                  quasis.push(t.templateElement({ raw: isLast ? '' : ' ' }))
                }
              }
            } else {
              values.push(
                t.conditionalExpression(
                  prop.value,
                  keyExpr,
                  t.stringLiteral(''),
                ),
              )
              quasis.push(t.templateElement({ raw: isLast ? '' : ' ' }))
            }
          })
          const classExpr =
            values.length === 0
              ? t.stringLiteral(quasis[0].value.raw)
              : t.templateLiteral(quasis, values)
          results.template.push(' class="', '"')
          results.templateValues.push(classExpr)
        } else {
          results.template.push(' class="', '"')
          results.templateValues.push(
            t.callExpression(registerImportMethod(attribute, 'ssrClassList'), [
              value.expression,
            ]),
          )
        }
        return
      }
      if (key.startsWith('attr:')) {
        key = key.slice(5)
      }
      if (BooleanAttributes.has(key)) {
        results.template.push('')
        results.templateValues.push(
          t.callExpression(registerImportMethod(attribute, 'ssrAttribute'), [
            t.stringLiteral(key),
            value.expression,
            t.booleanLiteral(true),
          ]),
        )
        return
      }
      results.template.push(` ${toAttribute(key, isSVG)}="`, '"')
      results.templateValues.push(
        escapeExpression(path, value.expression, true),
      )
    }
  })
}

function transformChildren(path: any, results: any, hydratable: boolean): void {
  const filteredChildren = filterChildren(path.get('children'))
  const multi = checkLength(filteredChildren)
  const markers = hydratable && multi
  filteredChildren.forEach((node: any) => {
    const child = transformNode(node, { doNotEscape: path.doNotEscape })
    if (!child) return
    appendToTemplate(results.template, child.template || '')
    if (child.templateValues)
      results.templateValues.push(...child.templateValues)
    if (child.exprs && child.exprs.length) {
      if (!path.doNotEscape && !child.spreadElement) {
        child.exprs[0] = escapeExpression(path, child.exprs[0], false)
      }
      if (markers && !child.spreadElement)
        appendToTemplate(results.template, '<!--$-->')
      results.template.push('')
      results.templateValues.push(child.exprs[0])
      if (markers && !child.spreadElement)
        appendToTemplate(results.template, '<!--/-->')
    }
  })
}

function escapeExpression(
  path: any,
  expression: t.Expression,
  attr?: boolean,
): t.Expression {
  if (
    t.isStringLiteral(expression) ||
    t.isNumericLiteral(expression) ||
    (t.isTemplateLiteral(expression) && expression.expressions.length === 0)
  ) {
    if (attr) {
      if (t.isStringLiteral(expression))
        return t.stringLiteral(escapeHTML(expression.value, true))
      if (t.isTemplateLiteral(expression))
        return t.stringLiteral(escapeHTML(expression.quasis[0].value.raw, true))
    }
    return expression
  }
  if (t.isFunction(expression)) {
    if (t.isBlockStatement(expression.body)) {
      expression.body.body = expression.body.body.map(stmt => {
        if (t.isReturnStatement(stmt) && stmt.argument) {
          stmt.argument = escapeExpression(
            path,
            stmt.argument as t.Expression,
            attr,
          )
        }
        return stmt
      })
    } else {
      expression.body = escapeExpression(
        path,
        expression.body as t.Expression,
        attr,
      )
    }
    return expression
  }
  if (t.isTemplateLiteral(expression)) {
    expression.expressions = expression.expressions.map(e =>
      escapeExpression(path, e as t.Expression, attr),
    )
    return expression
  }
  if (t.isUnaryExpression(expression)) return expression
  if (t.isBinaryExpression(expression)) {
    expression.left = escapeExpression(
      path,
      expression.left as t.Expression,
      attr,
    )
    expression.right = escapeExpression(
      path,
      expression.right as t.Expression,
      attr,
    )
    return expression
  }
  if (t.isConditionalExpression(expression)) {
    expression.consequent = escapeExpression(
      path,
      expression.consequent as t.Expression,
      attr,
    )
    expression.alternate = escapeExpression(
      path,
      expression.alternate as t.Expression,
      attr,
    )
    return expression
  }
  if (t.isLogicalExpression(expression)) {
    if (expression.operator === '&&') {
      expression.right = escapeExpression(
        path,
        expression.right as t.Expression,
        attr,
      )
      return expression
    }
    return t.callExpression(
      registerImportMethod(path, 'escape'),
      [expression].concat(attr ? [t.booleanLiteral(true)] : []),
    )
  }
  if (t.isCallExpression(expression) && t.isFunction(expression.callee)) {
    if (t.isBlockStatement(expression.callee.body)) {
      expression.callee.body.body = expression.callee.body.body.map(stmt => {
        if (t.isReturnStatement(stmt) && stmt.argument) {
          stmt.argument = escapeExpression(
            path,
            stmt.argument as t.Expression,
            attr,
          )
        }
        return stmt
      })
    } else {
      expression.callee.body = escapeExpression(
        path,
        expression.callee.body as t.Expression,
        attr,
      )
    }
    return expression
  }
  if (t.isJSXElement(expression)) {
    ;(expression as any).wontEscape = true
    return expression
  }
  return t.callExpression(
    registerImportMethod(path, 'escape'),
    [expression].concat(attr ? [t.booleanLiteral(true)] : []),
  )
}
