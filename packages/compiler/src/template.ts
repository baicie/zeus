import type { JSXElement } from '@babel/types'
import * as t from '@babel/types'

/**
 * 生成模板
 * 参考 dom-expressions 的模板生成策略
 */
export function generateTemplate(
  node: JSXElement,
  analysis: any,
  templates: Map<string, any>,
  state: any,
): string {
  const templateId = `_tmpl$${state.get('templateCounter')}`
  state.set('templateCounter', state.get('templateCounter') + 1)
  const options = state.get('options')

  // 生成静态 HTML
  const html = generateStaticHTML(node, analysis)

  // 创建模板节点
  const template = {
    id: templateId,
    html,
    bindings: analysis.bindings || [],
    hasChildren: analysis.children.length > 0,
    isCustomElement: analysis.isCustomElement,
  }

  // 存储模板
  templates.set(templateId, template)

  // 如果启用了模板优化，生成模板代码
  if (options.optimizeTemplates) {
    generateTemplateCode(template, state)
  }

  return templateId
}

/**
 * 生成静态 HTML
 */
function generateStaticHTML(node: JSXElement, analysis: any): string {
  const tagName = getTagName(node)
  const attributes = analysis.attributes.filter((attr: any) => !attr.isDynamic)
  const children = analysis.children.filter((child: any) => !child.isDynamic)

  let html = `<${tagName}`

  // 添加静态属性
  attributes.forEach((attr: any) => {
    if (attr.isBoolean) {
      html += ` ${attr.name}`
    } else if (attr.value && attr.value.value) {
      html += ` ${attr.name}="${escapeHTML(attr.value.value)}"`
    }
  })

  html += '>'

  // 添加静态子元素
  children.forEach((child: any) => {
    if (child.type === 'text' && !child.isEmpty) {
      html += escapeHTML(child.value)
    } else if (child.type === 'element') {
      html += generateStaticHTML(child.node, child.analysis || {})
    }
  })

  html += `</${tagName}>`

  return html
}

/**
 * 获取标签名
 */
function getTagName(node: JSXElement): string {
  if (t.isJSXIdentifier(node.openingElement.name)) {
    return node.openingElement.name.name
  }
  if (t.isJSXMemberExpression(node.openingElement.name)) {
    return 'div' // 组件名在运行时处理
  }
  return 'div'
}

/**
 * HTML 转义
 */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 生成模板代码
 */
function generateTemplateCode(template: any, state: any) {
  const imports = state.get('imports')
  imports.add('createTemplate')
}
