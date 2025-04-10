import type { NodePath } from '@babel/core'
import * as t from '@babel/types'
import type { JSXAttribute } from '@babel/types'
import { addNamed } from '@babel/helper-module-imports'
import type { MetadataConfig, NodePathHub } from '@zeus-js/compiler-core'

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

export function registerImportMethod(
  path: NodePath,
  name: string,
  moduleName?: string
): t.Identifier {
  const data = path.scope.getProgramParent().data
  const imports = (data.imports || (data.imports = new Map())) as Map<
    string,
    t.Identifier
  >
  const key = `${moduleName}:${name}`

  if (!imports.has(key)) {
    let id = addNamed(path, name, moduleName, {
      nameHint: `_$${name}`,
    })
    imports.set(key, id)
    return id
  } else {
    let iden = imports.get(key)
    return t.cloneNode(iden!)
  }
}

export function getConfig(path: NodePathHub): MetadataConfig {
  return path.hub.file.metadata.config
}

function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName
): string {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${node.property.name}`
  }
  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name
  }
  return `${node.namespace.name}:${node.name.name}`
}

export function getTagName(node: t.JSXElement): string {
  const jsxName = node.openingElement.name
  return jsxElementNameToString(jsxName)
}

export function isComponent(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^a-zA-Z]/.test(tagName[0])
  )
}

interface IsDynamicOptions {
  checkMember: boolean
  checkTags: boolean
  checkCallExpressions: boolean
  native: boolean
}

export function isDynamic(
  path: NodePathHub,
  {
    checkMember,
    checkTags,
    checkCallExpressions = true,
    native,
  }: IsDynamicOptions
): boolean {
  const config = getConfig(path)
  if (config.generate === 'ssr' && native) {
    checkMember = false
    checkCallExpressions = false
  }
  const expr = path.node
  if (t.isFunction(expr)) return false
  if (
    expr.leadingComments &&
    expr.leadingComments[0] &&
    expr.leadingComments[0].value.trim() === config.staticMarker
  ) {
    expr.leadingComments.shift()
    return false
  }

  if (
    checkCallExpressions &&
    (t.isCallExpression(expr) ||
      t.isOptionalCallExpression(expr) ||
      t.isTaggedTemplateExpression(expr))
  ) {
    return true
  }

  if (checkMember && t.isMemberExpression(expr)) {
    // Do not assume property access on namespaced imports as dynamic.
    const object = path.get('object').node

    if (
      t.isIdentifier(object) &&
      (!expr.computed ||
        !isDynamic(path.get('property'), {
          checkMember,
          checkTags,
          checkCallExpressions,
          native,
        }))
    ) {
      const binding = path.scope.getBinding(object.name)

      if (binding && binding.path.isImportNamespaceSpecifier()) {
        return false
      }
    }

    return true
  }

  if (
    checkMember &&
    (t.isOptionalMemberExpression(expr) ||
      t.isSpreadElement(expr) ||
      (t.isBinaryExpression(expr) && expr.operator === 'in'))
  ) {
    return true
  }

  if (
    checkTags &&
    (t.isJSXElement(expr) || (t.isJSXFragment(expr) && expr.children.length))
  ) {
    return true
  }

  let dynamic
  path.traverse({
    Function(p) {
      if (t.isObjectMethod(p.node) && p.node.computed) {
        dynamic = isDynamic(p.get('key'), {
          checkMember,
          checkTags,
          checkCallExpressions,
          native,
        })
      }
      p.skip()
    },
    CallExpression(p) {
      checkCallExpressions && (dynamic = true) && p.stop()
    },
    OptionalCallExpression(p) {
      checkCallExpressions && (dynamic = true) && p.stop()
    },
    MemberExpression(p) {
      checkMember && (dynamic = true) && p.stop()
    },
    OptionalMemberExpression(p) {
      checkMember && (dynamic = true) && p.stop()
    },
    SpreadElement(p) {
      checkMember && (dynamic = true) && p.stop()
    },
    BinaryExpression(p) {
      checkMember && p.node.operator === 'in' && (dynamic = true) && p.stop()
    },
    JSXElement(p) {
      checkTags ? (dynamic = true) && p.stop() : p.skip()
    },
    JSXFragment(p) {
      checkTags && p.node.children.length
        ? (dynamic = true) && p.stop()
        : p.skip()
    },
  })
  return dynamic
}
