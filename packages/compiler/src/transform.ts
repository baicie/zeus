import type { NodePath } from '@babel/traverse'
import type { JSXElement, CallExpression, Expression } from '@babel/types'
import * as t from '@babel/types'
import { generateTemplate } from './template'
import { createDynamicBindings } from './bindings'
import { optimizeExpression } from './optimize'

/**
 * 转换 JSX 元素为 DOM 表达式
 * 参考 dom-expressions 的转换策略
 */
export function transformJSX(
  path: NodePath<JSXElement>,
  state: any
): CallExpression | null {
  const { node } = path
  const options = state.get('options')
  const templates = state.get('templates')
  const imports = state.get('imports')

  const tagName = getTagName(node)
  const isCustomElement = options.isCustomElement(tagName)

  // 分析 JSX 元素
  const analysis = analyzeJSXElement(node, isCustomElement)

  if (analysis.isStatic && analysis.children.length === 0) {
    // 完全静态的元素，直接生成
    return generateStaticElement(tagName, analysis.attributes, options)
  }

  // 生成模板
  const templateId = generateTemplate(node, analysis, templates, state)

  // 创建动态绑定
  const bindings = createDynamicBindings(node, analysis, state)

  // 生成克隆和绑定代码
  return generateElementWithBindings(
    tagName,
    templateId,
    bindings,
    options,
    imports
  )
}

/**
 * 获取标签名
 */
function getTagName(node: JSXElement): string {
  if (t.isJSXIdentifier(node.openingElement.name)) {
    return node.openingElement.name.name
  }
  if (t.isJSXMemberExpression(node.openingElement.name)) {
    // 处理 <Component.SubComponent />
    return `${getMemberExpressionName(node.openingElement.name)}`
  }
  if (t.isJSXNamespacedName(node.openingElement.name)) {
    // 处理 <ns:Component />
    return `${node.openingElement.name.namespace.name}:${node.openingElement.name.name.name}`
  }
  return 'div' // fallback
}

/**
 * 获取成员表达式名称
 */
function getMemberExpressionName(expr: any): string {
  if (t.isJSXIdentifier(expr.object)) {
    return expr.object.name
  }
  if (t.isJSXMemberExpression(expr.object)) {
    return `${getMemberExpressionName(expr.object)}.${expr.property.name}`
  }
  return 'Component'
}

/**
 * 分析 JSX 元素
 */
function analyzeJSXElement(node: JSXElement, isCustomElement: boolean) {
  const attributes = node.openingElement.attributes
  const children = node.children

  const analysis = {
    isStatic: true,
    hasDynamicAttributes: false,
    hasDynamicChildren: false,
    attributes: [] as any[],
    children: [] as any[],
    events: [] as any[],
    isCustomElement,
  }

  // 分析属性
  attributes.forEach(attr => {
    if (t.isJSXAttribute(attr)) {
      const attrAnalysis = analyzeAttribute(attr)
      analysis.attributes.push(attrAnalysis)

      if (attrAnalysis.isDynamic) {
        analysis.isStatic = false
        analysis.hasDynamicAttributes = true
      }

      if (attrAnalysis.isEvent) {
        analysis.events.push(attrAnalysis)
      }
    } else if (t.isJSXSpreadAttribute(attr)) {
      // 展开属性总是动态的
      analysis.isStatic = false
      analysis.hasDynamicAttributes = true
      analysis.attributes.push({
        type: 'spread',
        expression: attr.argument,
        isDynamic: true,
      })
    }
  })

  // 分析子元素
  children.forEach(child => {
    const childAnalysis = analyzeChild(child)
    analysis.children.push(childAnalysis)

    if (childAnalysis.isDynamic) {
      analysis.isStatic = false
      analysis.hasDynamicChildren = true
    }
  })

  return analysis
}

/**
 * 分析属性
 */
function analyzeAttribute(attr: any) {
  const name = attr.name.name
  const isEvent = name.startsWith('on') && name.length > 2
  const isDynamic = !attr.value || t.isJSXExpressionContainer(attr.value)

  return {
    name,
    value: attr.value,
    isDynamic,
    isEvent,
    isBoolean: !attr.value,
    isSpread: false,
  }
}

/**
 * 分析子元素
 */
function analyzeChild(child: any) {
  if (t.isJSXElement(child)) {
    return {
      type: 'element',
      node: child,
      isDynamic: true, // 子元素总是需要处理
    }
  }

  if (t.isJSXFragment(child)) {
    return {
      type: 'fragment',
      node: child,
      isDynamic: true,
    }
  }

  if (t.isJSXExpressionContainer(child)) {
    return {
      type: 'expression',
      node: child,
      isDynamic: true,
    }
  }

  if (t.isJSXText(child)) {
    const text = child.value.trim()
    return {
      type: 'text',
      value: text,
      isDynamic: false,
      isEmpty: !text,
    }
  }

  return {
    type: 'unknown',
    node: child,
    isDynamic: true,
  }
}

/**
 * 生成静态元素
 */
function generateStaticElement(
  tagName: string,
  attributes: any[],
  options: any
): CallExpression {
  const createElement = t.memberExpression(
    t.identifier('document'),
    t.identifier('createElement')
  )

  const args = [t.stringLiteral(tagName)]

  // 添加属性
  if (attributes.length > 0) {
    const props = attributes.map(attr => {
      if (attr.isBoolean) {
        return t.objectProperty(t.identifier(attr.name), t.booleanLiteral(true))
      }
      return t.objectProperty(
        t.identifier(attr.name),
        t.stringLiteral(attr.value.value || '')
      )
    })

    args.push(t.objectExpression(props))
  }

  return t.callExpression(createElement, args)
}

/**
 * 生成带绑定的元素
 */
function generateElementWithBindings(
  tagName: string,
  templateId: string,
  bindings: any[],
  options: any,
  imports: Set<string>
): CallExpression {
  // 添加必要的导入
  imports.add('cloneTemplate')
  imports.add('bindElement')

  const templateVar = t.identifier('_tmpl$')
  const elementVar = t.identifier('_el$')

  const statements = [
    // 获取模板
    t.variableDeclaration('const', [
      t.variableDeclarator(
        templateVar,
        t.callExpression(t.identifier('cloneTemplate'), [
          t.stringLiteral(templateId),
        ])
      ),
    ]),
    // 克隆元素
    t.variableDeclaration('const', [
      t.variableDeclarator(
        elementVar,
        t.callExpression(
          t.memberExpression(templateVar, t.identifier('content')),
          []
        )
      ),
    ]),
  ]

  // 添加绑定
  bindings.forEach(binding => {
    statements.push(
      t.expressionStatement(
        t.callExpression(t.identifier('bindElement'), [
          elementVar,
          t.stringLiteral(binding.type),
          t.stringLiteral(binding.name),
          binding.expression,
        ])
      )
    )
  })

  // 返回元素
  statements.push(t.returnStatement(elementVar))

  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    []
  )
}
