import type { DOMCompilerOptions } from './index'
import * as t from '@babel/types'
import type { JSXAttribute } from '@babel/types'

// 检查是否是组件
export function isComponent(
  tag: string,
  options: DOMCompilerOptions = {}
): boolean {
  // 内置组件检查
  if (options.builtIns && options.builtIns.includes(tag)) {
    return true
  }

  // 自定义元素检查
  if (options.isCustomElement && options.isCustomElement(tag)) {
    return options.contextToCustomElements || false
  }

  // 原生标签检查
  if (options.isNativeTag && options.isNativeTag(tag)) {
    return false
  }

  // 默认组件检测规则：首字母大写
  return /^[A-Z]/.test(tag)
}

// 规范化属性
export function normalizeProps(
  attrs: (JSXAttribute | t.JSXSpreadAttribute)[]
): (JSXAttribute | t.JSXSpreadAttribute)[] {
  return attrs.filter(attr => {
    // 过滤掉特殊属性
    if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier') {
      // 过滤掉内部使用的属性
      if (attr.name.name.startsWith('_')) {
        return false
      }
    }
    return true
  })
}

// 创建运行时调用
export function createRuntimeCall(
  name: string,
  args: t.Expression[] = []
): t.CallExpression {
  return t.callExpression(t.identifier(name), args)
}

// 创建 DOM 元素
export function createElement(
  tag: string,
  props: t.ObjectExpression | null = null,
  children: t.Expression[] = []
): t.CallExpression {
  const args: t.Expression[] = [t.stringLiteral(tag)]

  if (props) {
    args.push(props)
  } else if (children.length > 0) {
    args.push(t.nullLiteral())
  }

  if (children.length > 0) {
    args.push(t.arrayExpression(children))
  }

  return createRuntimeCall('createElement', args)
}

// 创建文本节点
export function createTextNode(text: string | t.Expression): t.CallExpression {
  return createRuntimeCall('createTextNode', [
    typeof text === 'string' ? t.stringLiteral(text) : text,
  ])
}
