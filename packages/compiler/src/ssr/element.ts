import * as t from '@babel/types'
import { decode } from 'html-entities'
import { Aliases, BooleanAttributes, ChildProperties, SVGElements } from '../shared/constants'
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

  if (path.node.openingElement.attributes.some((a: any) => t.isJSXSpreadAttribute(a))) {
    return createElement(path, { topLevel: info.topLevel, hydratable: config.hydratable })
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
      const v = decode(trimWhitespace(p.node.extra.raw))
      if (v.length) memo.push(t.stringLiteral(v))
    } else {
      const child = transformNode(p)
      if (markers && child.exprs.length && !child.spreadElement) memo.push(t.stringLiteral('<!--$-->'))
      memo.push(child.exprs.length ? child.exprs[0] : createTemplate(path, child))
      if (markers && child.exprs.length && !child.spreadElement) memo.push(t.stringLiteral('<!--/-->'))
    }
    return memo
  }, [])

  const props = t.objectExpression(
    path.node.openingElement.attributes
      .filter((a: any) => !t.isJSXSpreadAttribute(a))
      .map((attr: any) => {
        const key = t.isJSXNamespacedName(attr.name) ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name
        const val = attr.value
        const value = t.isJSXExpressionContainer(val) ? val.expression : val || t.booleanLiteral(true)
        return t.objectProperty(convertJSXIdentifier(t.jsxIdentifier(key)), value)
      }),
  )

  const exprs = [
    t.callExpression(registerImportMethod(path, 'ssrElement'), [
      t.stringLiteral(tagName),
      props,
      childNodes.length
        ? hydratable
          ? t.arrowFunctionExpression([], childNodes.length === 1 ? childNodes[0] : t.arrayExpression(childNodes))
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
    const key = t.isJSXNamespacedName(node.name)
      ? `${node.name.namespace.name}:${node.name.name.name}`
      : node.name.name
    const value = node.value
    if (key === 'ref' || key.startsWith('use:') || key.startsWith('prop:') || key.startsWith('on')) return
    if (!value) {
      appendToTemplate(results.template, ` ${toAttribute(key, isSVG)}`)
      return
    }
    if (t.isStringLiteral(value)) {
      appendToTemplate(results.template, ` ${toAttribute(key, isSVG)}="${escapeHTML(value.value, true)}"`)
      return
    }
    if (t.isNumericLiteral(value)) {
      appendToTemplate(results.template, ` ${toAttribute(key, isSVG)}="${escapeHTML(String(value.value), true)}"`)
      return
    }
    if (t.isBooleanLiteral(value)) {
      if (value.value) appendToTemplate(results.template, ` ${toAttribute(key, isSVG)}`)
      return
    }
    if (t.isJSXExpressionContainer(value)) {
      if (ChildProperties.has(key)) return
      if (key === 'style') {
        results.template.push(' style="', '"')
        results.templateValues.push(
          t.callExpression(registerImportMethod(attribute, 'ssrStyle'), [value.expression]),
        )
        return
      }
      if (key === 'classList') {
        results.template.push(' class="', '"')
        results.templateValues.push(
          t.callExpression(registerImportMethod(attribute, 'ssrClassList'), [value.expression]),
        )
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
        t.callExpression(registerImportMethod(attribute, 'escape'), [value.expression, t.booleanLiteral(true)]),
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
    if (child.templateValues) results.templateValues.push(...child.templateValues)
    if (child.exprs && child.exprs.length) {
      if (markers && !child.spreadElement) appendToTemplate(results.template, '<!--$-->')
      results.template.push('')
      results.templateValues.push(child.exprs[0])
      if (markers && !child.spreadElement) appendToTemplate(results.template, '<!--/-->')
    }
  })
}
