import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { JSXElement } from '@babel/types'
import {
  conditionalExpression,
  isBooleanLiteral,
  isIdentifier,
  isJSXAttribute,
  isJSXExpressionContainer,
  isJSXSpreadAttribute,
  isJSXText,
  isNumericLiteral,
  isObjectExpression,
  isObjectProperty,
  isStringLiteral,
  stringLiteral,
} from '@babel/types'
import type { TransformInfo, TransformResult } from '../../shared/types'
import { VOID_ELEMENTS } from '../../shared/constants'
import { escapeHTML } from '../../shared/escape'
import { getTagName } from '../../shared/dynamic'
import { filterChildren, getConfig } from '../../shared/utils'
import { getProgramScopeData } from '../../babel-cast'
import { transformSubtree } from '../transform-node'
import {
  appendConcat,
  normalizeJSXTextValue,
  resultToExpression,
  stringifyExpression,
} from './shared'

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, s => `-${s.toLowerCase()}`)
}

function serializeStaticStyleObject(expr: t.Expression): string | null {
  if (!isObjectExpression(expr)) {
    return null
  }
  const parts: string[] = []
  for (let i = 0; i < expr.properties.length; i++) {
    const prop = expr.properties[i]
    if (!isObjectProperty(prop) || prop.computed || !prop.key || !prop.value) {
      return null
    }
    let key = ''
    if (isIdentifier(prop.key)) {
      key = prop.key.name
    } else if (isStringLiteral(prop.key)) {
      key = prop.key.value
    } else {
      return null
    }

    const styleKey = toKebabCase(key)
    const value = prop.value
    if (
      isStringLiteral(value) ||
      isNumericLiteral(value) ||
      isBooleanLiteral(value)
    ) {
      parts.push(`${styleKey}:${String(value.value)}`)
      continue
    }
    return null
  }
  return parts.join(';')
}

function getDangerousHTMLExpr(expr: t.Expression): t.Expression | null {
  if (!isObjectExpression(expr)) {
    return null
  }
  for (let i = 0; i < expr.properties.length; i++) {
    const prop = expr.properties[i]
    if (!isObjectProperty(prop) || prop.computed || !prop.key || !prop.value) {
      continue
    }
    let key = ''
    if (isIdentifier(prop.key)) {
      key = prop.key.name
    } else if (isStringLiteral(prop.key)) {
      key = prop.key.value
    }
    if (key !== '__html') {
      continue
    }
    const value = prop.value
    if (
      isStringLiteral(value) ||
      isNumericLiteral(value) ||
      isBooleanLiteral(value)
    ) {
      return stringLiteral(String(value.value))
    }
    return value as t.Expression
  }
  return null
}

export function transformElementSSR(
  path: NodePath<JSXElement>,
  _info: TransformInfo,
): TransformResult {
  const config = getConfig(path)
  const tagName = getTagName(path.node)
  const isVoidElement = VOID_ELEMENTS.indexOf(tagName) >= 0
  let out: t.Expression = stringLiteral(`<${tagName}`)
  let dangerousHTML: t.Expression | null = null
  let textareaValue: t.Expression | null = null

  const attrs = path.get('openingElement').get('attributes')
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (isJSXSpreadAttribute(attr.node)) {
      // Skeleton behavior: ignore spread in SSR for now.
      continue
    }
    if (!isJSXAttribute(attr.node)) {
      continue
    }
    const keyNode = attr.node.name
    const rawKey =
      keyNode.type === 'JSXIdentifier'
        ? keyNode.name
        : `${keyNode.namespace.name}:${keyNode.name.name}`
    if (/^on[A-Z]/.test(rawKey)) {
      // SSR skeleton: event handlers are not emitted as HTML attributes.
      // When hydratable, collect event names for server/client handshake.
      if (config.hydratable) {
        const data = getProgramScopeData(path)
        if (data && data.hydratableEvents) {
          data.hydratableEvents.add(rawKey.slice(2).toLowerCase())
        }
      }
      continue
    }
    if (rawKey === 'dangerouslySetInnerHTML') {
      const dVal = attr.node.value
      if (
        dVal &&
        isJSXExpressionContainer(dVal) &&
        dVal.expression.type !== 'JSXEmptyExpression'
      ) {
        dangerousHTML = getDangerousHTMLExpr(dVal.expression as t.Expression)
      }
      continue
    }
    if (tagName === 'textarea' && rawKey === 'value') {
      const tVal = attr.node.value
      if (!tVal) {
        textareaValue = stringLiteral('')
        continue
      }
      if (tVal.type === 'StringLiteral') {
        textareaValue = stringLiteral(tVal.value)
        continue
      }
      if (
        isJSXExpressionContainer(tVal) &&
        tVal.expression.type !== 'JSXEmptyExpression'
      ) {
        textareaValue = stringifyExpression(tVal.expression)
      }
      continue
    }
    const key = rawKey === 'className' ? 'class' : rawKey
    const v = attr.node.value
    if (!v) {
      out = appendConcat(out, stringLiteral(` ${key}`))
      continue
    }
    if (v.type === 'StringLiteral') {
      out = appendConcat(
        out,
        stringLiteral(` ${key}="${escapeHTML(v.value, true)}"`),
      )
      continue
    }
    if (
      isJSXExpressionContainer(v) &&
      v.expression.type !== 'JSXEmptyExpression'
    ) {
      if (tagName === 'option' && key === 'selected') {
        out = appendConcat(
          out,
          conditionalExpression(
            v.expression,
            stringLiteral(' selected'),
            stringLiteral(''),
          ),
        )
        continue
      }
      if (key === 'style') {
        const staticStyle = serializeStaticStyleObject(
          v.expression as t.Expression,
        )
        if (typeof staticStyle === 'string') {
          out = appendConcat(
            out,
            stringLiteral(` ${key}="${escapeHTML(staticStyle, true)}"`),
          )
          continue
        }
      }
      out = appendConcat(out, stringLiteral(` ${key}="`))
      out = appendConcat(out, stringifyExpression(v.expression))
      out = appendConcat(out, stringLiteral('"'))
    }
  }

  if (config.hydratable) {
    out = appendConcat(out, stringLiteral(' data-hk=""'))
  }
  out = appendConcat(out, stringLiteral('>'))

  if (isVoidElement) {
    // HTML/SVG void tags should not emit children or closing tags.
  } else if (dangerousHTML) {
    out = appendConcat(out, stringifyExpression(dangerousHTML))
  } else if (textareaValue) {
    out = appendConcat(out, textareaValue)
  } else {
    const children = filterChildren(path.node.children)
    const childPaths = path.get('children')
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (isJSXText(child)) {
        const text = normalizeJSXTextValue(child.value)
        if (text) {
          out = appendConcat(out, stringLiteral(escapeHTML(text, false)))
        }
        continue
      }
      if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type !== 'JSXEmptyExpression') {
          out = appendConcat(out, stringifyExpression(child.expression))
        }
        continue
      }
      const childPath = childPaths[i] as NodePath<t.JSXElement | t.JSXFragment>
      const childRes = transformSubtree(childPath, {
        topLevel: true,
        lastElement: true,
      })
      out = appendConcat(out, resultToExpression(childRes))
    }
  }

  if (!isVoidElement) {
    out = appendConcat(out, stringLiteral(`</${tagName}>`))
  }

  return {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    renderer: 'ssr',
    outputExpr: out,
  }
}
