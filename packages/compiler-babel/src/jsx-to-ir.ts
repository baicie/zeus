// JSX to IR transformation

import type { TemplateIR, BindingIR, NodePath, ExprIR, TextBindingIR, AttrBindingIR, PropBindingIR, EventBindingIR, ShowBindingIR, ForBindingIR } from '@zeusjs/compiler-shared'
import { getTagName, analyzeJSXElement, isShow, isFor, isHost, isSlot } from '@zeusjs/compiler-shared'

export function transformComponent(fnPath: any, state: any): TemplateIR {
  let rootJSX: any = null

  fnPath.traverse({
    ReturnStatement(retPath: any) {
      const arg = retPath.get('argument')
      if (arg.isJSXElement() || arg.isJSXFragment()) {
        rootJSX = arg
        retPath.stop()
      }
    },
  })

  if (!rootJSX) throw new Error('No JSX root found')

  const ctx = createTransformContext(state)

  return visitJSXNode(rootJSX, ctx, [0])
}

export interface TransformContext {
  templateName: string
  bindings: BindingIR[]
  templateCounter: number
  usedHelpers: Set<string>
}

export function createTransformContext(state: any): TransformContext {
  return {
    templateName: `_tmpl$${state.templateCounter || 0}`,
    bindings: [],
    templateCounter: 0,
    usedHelpers: new Set(),
  }
}

function visitJSXNode(node: any, ctx: TransformContext, path: NodePath): TemplateIR {
  const tagName = getTagName(node)

  if (!tagName) {
    throw new Error('Unknown JSX tag')
  }

  const info = analyzeJSXElement(tagName, node.children?.length > 0)

  // Handle built-in components
  if (info.isBuiltIn) {
    if (isShow(tagName)) {
      return visitShow(node, ctx, path)
    }
    if (isFor(tagName)) {
      return visitFor(node, ctx, path)
    }
    if (isHost(tagName)) {
      return visitHost(node, ctx, path)
    }
    if (isSlot(tagName)) {
      return visitSlot(node, ctx, path)
    }
  }

  return visitElement(node, ctx, path, info)
}

function visitElement(node: any, ctx: TransformContext, path: NodePath, info: any): TemplateIR {
  const htmlParts: string[] = [`<${info.tagName}`]
  const childPath = [...path, 0]
  let childIndex = 0

  // Process attributes
  const attrs = node.openingElement.attributes || []
  for (const attr of attrs) {
    if (attr.type === 'JSXAttribute') {
      const attrName = attr.name?.name
      const attrValue = attr.value

      if (attr.value === null) {
        // Boolean attribute
        htmlParts.push(` ${attrName}`)
      } else if (attrValue.type === 'JSXExpressionContainer') {
        const expr = attrValue.expression
        if (isStaticValue(expr)) {
          htmlParts.push(` ${attrName}="${escapeHtml(String(getStaticValue(expr)))}"`)
        } else {
          // Dynamic attribute
          const isEvent = /^on[A-Z]/.test(attrName)
          if (isEvent) {
            const eventName = attrName.slice(2).toLowerCase()
            ctx.bindings.push({
              type: 'event',
              path: [...path, childIndex],
              name: eventName,
              handler: toExprIR(expr),
            } as EventBindingIR)
            ctx.usedHelpers.add('bindEvent')
          } else if (isDOMProperty(attrName)) {
            ctx.bindings.push({
              type: 'prop',
              path: [...path, childIndex],
              name: attrName,
              expr: toExprIR(expr),
            } as PropBindingIR)
            ctx.usedHelpers.add('bindProp')
          } else {
            ctx.bindings.push({
              type: 'attr',
              path: [...path, childIndex],
              name: attrName,
              expr: toExprIR(expr),
            } as AttrBindingIR)
            ctx.usedHelpers.add('bindAttr')
          }
        }
      }
    }
  }

  htmlParts.push('>')

  // Process children
  const children = node.children || []
  for (const child of children) {
    if (child.type === 'JSXText') {
      const text = child.value
      if (text.trim()) {
        htmlParts.push(escapeHtml(text))
      }
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression
      if (expr.type === 'JSXEmptyExpression') continue

      const textPath = [...childPath, childIndex]
      htmlParts.push(`<!--z-t-->${childIndex}`)
      ctx.bindings.push({
        type: 'text',
        path: textPath,
        expr: toExprIR(expr),
      } as TextBindingIR)
      ctx.usedHelpers.add('bindText')
      childIndex++
    } else if (child.type === 'JSXElement') {
      const childIR = visitJSXNode(child, ctx, [...childPath, childIndex])
      childIndex++
    }
  }

  htmlParts.push(`</${info.tagName}>`)

  return {
    kind: 'template',
    name: ctx.templateName,
    html: htmlParts.join(''),
    roots: 1,
    bindings: ctx.bindings,
  }
}

function visitShow(node: any, ctx: TransformContext, path: NodePath): TemplateIR {
  const whenAttr = node.openingElement.attributes?.find(
    (a: any) => a.name?.name === 'when'
  )

  if (!whenAttr) {
    throw new Error('Show requires a "when" attribute')
  }

  const whenExpr = whenAttr.value.expression
  const children = node.children || []
  const body = children.length > 0 ? visitJSXNode(children[0], ctx, [...path, 0]) : null

  ctx.usedHelpers.add('mountCondition')

  return {
    kind: 'template',
    name: ctx.templateName,
    html: `<!--z-show-->`,
    roots: 1,
    bindings: [
      {
        type: 'show',
        path,
        when: toExprIR(whenExpr),
        body: body!,
      } as ShowBindingIR,
    ],
  }
}

function visitFor(node: any, ctx: TransformContext, path: NodePath): TemplateIR {
  const eachAttr = node.openingElement.attributes?.find(
    (a: any) => a.name?.name === 'each'
  )

  if (!eachAttr) {
    throw new Error('For requires an "each" attribute')
  }

  const eachExpr = eachAttr.value.expression
  const children = node.children || []

  let itemName = 'item'
  let indexName = 'index'

  if (children.length > 0 && children[0].type === 'JSXExpressionContainer') {
    const callback = children[0].expression
    if (callback.params?.length > 0) {
      itemName = callback.params[0].name
      if (callback.params[1]) {
        indexName = callback.params[1].name
      }
    }
  }

  const body = children.length > 1 ? visitJSXNode(children[1], ctx, [...path, 0]) : null

  ctx.usedHelpers.add('mountList')

  return {
    kind: 'template',
    name: ctx.templateName,
    html: `<!--z-for-->`,
    roots: 1,
    bindings: [
      {
        type: 'for',
        path,
        each: toExprIR(eachExpr),
        itemName,
        indexName,
        body: body!,
      } as ForBindingIR,
    ],
  }
}

function visitHost(node: any, ctx: TransformContext, path: NodePath): TemplateIR {
  // Host is a special marker, visit children
  const children = node.children || []
  if (children.length > 0) {
    return visitJSXNode(children[0], ctx, path)
  }

  return {
    kind: 'template',
    name: ctx.templateName,
    html: '',
    roots: 0,
    bindings: [],
  }
}

function visitSlot(node: any, ctx: TransformContext, path: NodePath): TemplateIR {
  const nameAttr = node.openingElement.attributes?.find(
    (a: any) => a.name?.name === 'name'
  )
  const slotName = nameAttr?.value?.value || null

  return {
    kind: 'template',
    name: ctx.templateName,
    html: `<!--slot:${slotName || ''}-->`,
    roots: 1,
    bindings: [],
  }
}

function toExprIR(node: any): ExprIR {
  return {
    kind: 'js',
    node,
    reactiveHint: 'unknown',
  }
}

function isStaticValue(node: any): boolean {
  if (!node) return false
  return node.type === 'StringLiteral' ||
         node.type === 'NumericLiteral' ||
         node.type === 'BooleanLiteral' ||
         node.type === 'NullLiteral'
}

function getStaticValue(node: any): any {
  if (node.type === 'StringLiteral') return node.value
  if (node.type === 'NumericLiteral') return node.value
  if (node.type === 'BooleanLiteral') return node.value
  if (node.type === 'NullLiteral') return null
  return undefined
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isDOMProperty(name: string): boolean {
  return ['value', 'checked', 'selected', 'disabled', 'readOnly', 'hidden'].includes(name)
}
