import * as t from '@babel/types'
import { transformElement as transformElementDOM } from '../dom/element'
import { createTemplate as createTemplateDOM } from '../dom/template'
import { transformElement as transformElementSSR } from '../ssr/element'
import { createTemplate as createTemplateSSR } from '../ssr/template'
import { transformElement as transformElementUniversal } from '../universal/element'
import { createTemplate as createTemplateUniversal } from '../universal/template'
import {
  getTagName,
  isComponent,
  isDynamic,
  trimWhitespace,
  transformCondition,
  getStaticExpression,
  escapeHTML,
  getConfig,
} from './utils'
import transformComponent from './component'
import transformFragmentChildren from './fragment'

export function transformJSX(path: any, state: any): void {
  if (state.skip) return
  const config = getConfig(path)
  const result = transformNode(path, t.isJSXFragment(path.node) ? {} : { topLevel: true, lastElement: true })
  const template = getCreateTemplate(config, path, result)
  path.replaceWith(template(path, result, false))
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
  if (t.isJSXText(node) || (staticValue = getStaticExpression(path)) !== false) {
    const text = staticValue !== undefined
      ? info.doNotEscape ? staticValue.toString() : escapeHTML(staticValue.toString())
      : trimWhitespace(node.extra.raw)
    if (!text.length) return null
    const results: any = { template: text, declarations: [], exprs: [], dynamics: [], postExprs: [], text: true }
    if (!info.skipId && config.generate !== 'ssr') results.id = path.scope.generateUidIdentifier('el$')
    return results
  }
  if (t.isJSXExpressionContainer(node)) {
    if (t.isJSXEmptyExpression(node.expression)) return null
    if (!isDynamic(path.get('expression'), { checkMember: true, checkTags: !!info.componentChild, native: !info.componentChild })) {
      return { exprs: [node.expression], template: '' }
    }
    const expr = config.wrapConditionals && config.generate !== 'ssr'
      && (t.isLogicalExpression(node.expression) || t.isConditionalExpression(node.expression))
      ? transformCondition(path.get('expression'), info.componentChild || info.fragmentChild)
      : t.arrowFunctionExpression([], node.expression)
    if (Array.isArray(expr)) {
      return {
        exprs: [
          t.callExpression(
            t.arrowFunctionExpression([], t.blockStatement([expr[0], t.returnStatement(expr[1])])),
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
    if (!isDynamic(path.get('expression'), { checkMember: true, native: !info.componentChild })) {
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
  if ((result.tagName && result.renderer === 'dom') || config.generate === 'dom') return createTemplateDOM
  if (result.renderer === 'ssr' || config.generate === 'ssr') return createTemplateSSR
  return createTemplateUniversal
}

export function transformElement(config: any, path: any, info: any = {}): any {
  const node = path.node
  const tagName = getTagName(node)
  if (isComponent(tagName)) return transformComponent(path)
  const tagRenderer = (config.renderers ?? []).find((renderer: any) => renderer.elements.includes(tagName))
  if (tagRenderer?.name === 'dom' || getConfig(path).generate === 'dom') return transformElementDOM(path, info)
  if (getConfig(path).generate === 'ssr') return transformElementSSR(path, info)
  return transformElementUniversal(path, info)
}
