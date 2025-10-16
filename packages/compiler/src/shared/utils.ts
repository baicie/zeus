import * as t from '@babel/types'
import { addNamed } from '@babel/helper-module-imports'
import type { JSXNode, NodePathHub } from '../type'
import type { CompilerConfig } from '../config'
import type { NodePath } from '@babel/core'

export const reservedNameSpaces: Set<string> = new Set([
  'class',
  'on',
  'oncapture',
  'style',
  'use',
  'prop',
  'attr',
  'bool',
])

export const nonSpreadNameSpaces: Set<string> = new Set([
  'class',
  'style',
  'use',
  'prop',
  'attr',
  'bool',
])

export function getConfig<T>(path: T): CompilerConfig {
  return ((path as NodePathHub).hub.file?.metadata.config ??
    {}) as CompilerConfig
}

export const getRendererConfig = (path, renderer) => {
  const config = getConfig(path)
  return config?.renderers?.find(r => r.name === renderer) ?? config
}

export function registerImportMethod<T = any>(
  path: NodePath<T>,
  name: string,
  moduleName?: string,
): t.Identifier {
  const program = path.scope.getProgramParent()
  const imports: Map<string, t.Identifier> =
    (program.data.imports as Map<string, t.Identifier>) ||
    (program.data.imports = new Map())

  moduleName = moduleName || getConfig(path).moduleName

  const key = `${moduleName}:${name}`
  if (!imports.has(key)) {
    const id = addNamed(path, name, moduleName, {
      nameHint: `_$${name}`,
    })
    imports.set(key, id)
    return id
  } else {
    const id = imports.get(key)!
    // the cloning is required to play well with babel-preset-env which is
    // transpiling import as we add them and using the same identifier causes
    // problems with the multiple identifiers of the same thing
    return t.cloneNode(id)
  }
}

function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
): string {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${node.property.name}`
  }
  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name
  }
  return `${node.namespace.name}:${node.name.name}`
}

export function tagNameToIdentifier(name) {
  const parts = name.split('.')
  if (parts.length === 1) return t.identifier(name)
  let part
  let base = t.identifier(parts.shift())
  while ((part = parts.shift())) {
    base = t.memberExpression(base, t.identifier(part))
  }
  return base
}

export function getTagName(tag: t.JSXElement): string {
  const jsxName = tag.openingElement.name
  return jsxElementNameToString(jsxName)
}

export function isComponent(tagName) {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^a-zA-Z]/.test(tagName[0])
  )
}

export function hasStaticMarker(object, path) {
  if (!object) return false
  if (
    object.leadingComments &&
    object.leadingComments[0] &&
    object.leadingComments[0].value.trim() === getConfig(path).staticMarker
  )
    return true
  if (object.expression) return hasStaticMarker(object.expression, path)
}

export interface IsDynamicOptions {
  checkMember?: boolean
  checkTags?: boolean
  checkCallExpressions?: boolean
  native?: boolean
}

export function isDynamic(
  path: NodePath<any>,
  {
    checkMember,
    checkTags,
    checkCallExpressions = true,
    native,
  }: IsDynamicOptions,
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

export function getStaticExpression(path) {
  const node = path.node
  let value, type
  return (
    t.isJSXExpressionContainer(node) &&
    t.isJSXElement(path.parent) &&
    !isComponent(getTagName(path.parent)) &&
    !t.isSequenceExpression(node.expression) &&
    (value = path.get('expression').evaluate().value) !== undefined &&
    ((type = typeof value) === 'string' || type === 'number') &&
    value
  )
}

// remove unnecessary JSX Text nodes
export function filterChildren<T = any>(
  children: NodePath<any>[],
): NodePath<T>[] {
  return children.filter(
    ({ node: child }) =>
      !(
        t.isJSXExpressionContainer(child) &&
        t.isJSXEmptyExpression(child.expression)
      ) &&
      (!t.isJSXText(child) || !/^[\r\n]\s*$/.test(child.extra!.raw as string)),
  )
}

export function checkLength(children: NodePath[]): boolean {
  let i = 0
  children.forEach(path => {
    const child = path.node
    !(
      t.isJSXExpressionContainer(child) &&
      t.isJSXEmptyExpression(child.expression)
    ) &&
      (!t.isJSXText(child) ||
        !/^\s*$/.test(child.extra!.raw as string) ||
        /^ *$/.test(child.extra!.raw as string)) &&
      i++
  })
  return i > 1
}

export function trimWhitespace(text) {
  text = text.replace(/\r/g, '')
  if (/\n/g.test(text)) {
    text = text
      .split('\n')
      .map((t, i) => (i ? t.replace(/^\s*/g, '') : t))
      .filter(s => !/^\s*$/.test(s))
      .join(' ')
  }
  return text.replace(/\s+/g, ' ')
}

export function toEventName(name: string): string {
  return name.slice(2).toLowerCase()
}

export function toAttributeName(name: string): string {
  return name.replace(/([A-Z])/g, g => `-${g[0].toLowerCase()}`)
}

export function toPropertyName(name: string): string {
  return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase())
}

export function wrappedByText(list, startIndex) {
  let index = startIndex,
    wrapped
  while (--index >= 0) {
    const node = list[index]
    if (!node) continue
    if (node.text) {
      wrapped = true
      break
    }
    if (node.id) return false
  }
  if (!wrapped) return false
  index = startIndex
  while (++index < list.length) {
    const node = list[index]
    if (!node) continue
    if (node.text) return true
    if (node.id) return false
  }
  return false
}

export function transformCondition(
  path: any,
  inline?: boolean,
  deep?: boolean,
): t.Expression | t.Statement[] {
  const config = getConfig(path)
  const expr = path.node
  const memo = registerImportMethod(path, config.memoWrapper)

  let dTest = false
  let cond: t.Expression | undefined
  let id: t.Expression | t.Identifier | undefined

  if (
    t.isConditionalExpression(expr) &&
    (isDynamic(path.get('consequent'), {
      checkTags: true,
      checkMember: true,
    }) ||
      isDynamic(path.get('alternate'), { checkTags: true, checkMember: true }))
  ) {
    dTest = isDynamic(path.get('test'), { checkMember: true })
    if (dTest) {
      cond = expr.test
      if (!t.isBinaryExpression(cond)) {
        cond = t.unaryExpression('!', t.unaryExpression('!', cond, true), true)
      }

      id = inline
        ? t.callExpression(memo, [t.arrowFunctionExpression([], cond)])
        : path.scope.generateUidIdentifier('_c$')

      expr.test = t.callExpression(id as t.Expression, [])

      if (
        t.isConditionalExpression(expr.consequent) ||
        t.isLogicalExpression(expr.consequent)
      ) {
        expr.consequent = transformCondition(
          path.get('consequent') as NodePath<t.Expression>,
          true,
          true,
        ) as t.Expression
      }

      if (
        t.isConditionalExpression(expr.alternate) ||
        t.isLogicalExpression(expr.alternate)
      ) {
        expr.alternate = transformCondition(
          path.get('alternate') as NodePath<t.Expression>,
          true,
          true,
        ) as t.Expression
      }
    }
  } else if (t.isLogicalExpression(expr)) {
    let nextPath: NodePath<t.LogicalExpression> = path

    while (
      nextPath.node.operator !== '&&' &&
      t.isLogicalExpression(nextPath.node.left)
    ) {
      nextPath = nextPath.get('left') as NodePath<t.LogicalExpression>
    }

    if (
      nextPath.node.operator === '&&' &&
      isDynamic(nextPath.get('right'), { checkTags: true, checkMember: true })
    ) {
      dTest = isDynamic(nextPath.get('left'), { checkMember: true })
      if (dTest) {
        cond = nextPath.node.left
        if (!t.isBinaryExpression(cond)) {
          cond = t.unaryExpression(
            '!',
            t.unaryExpression('!', cond, true),
            true,
          )
        }

        id = inline
          ? t.callExpression(memo, [t.arrowFunctionExpression([], cond)])
          : path.scope.generateUidIdentifier('_c$')

        nextPath.node.left = t.callExpression(id as t.Expression, [])
      }
    }
  }

  if (dTest && !inline && cond && id) {
    const statements: t.Statement[] = [
      t.variableDeclaration('var', [
        t.variableDeclarator(
          id as t.LVal,
          config.memoWrapper
            ? t.callExpression(memo, [t.arrowFunctionExpression([], cond)])
            : t.arrowFunctionExpression([], cond),
        ),
      ]),
      t.expressionStatement(t.arrowFunctionExpression([], expr)),
    ]

    return deep
      ? t.callExpression(
          t.arrowFunctionExpression(
            [],
            t.blockStatement([
              statements[0],
              t.returnStatement(
                (statements[1] as t.ExpressionStatement).expression,
              ),
            ]),
          ),
          [],
        )
      : statements
  }

  return deep ? expr : t.arrowFunctionExpression([], expr)
}

export function escapeHTML<T = string>(s: T, attr?: boolean): T {
  if (typeof s !== 'string') return s
  const delim = attr ? '"' : '<'
  const escDelim = attr ? '&quot;' : '&lt;'
  let iDelim = s.indexOf(delim)
  let iAmp = s.indexOf('&')

  if (iDelim < 0 && iAmp < 0) return s

  let left = 0,
    out = ''

  while (iDelim >= 0 && iAmp >= 0) {
    if (iDelim < iAmp) {
      if (left < iDelim) out += s.substring(left, iDelim)
      out += escDelim
      left = iDelim + 1
      iDelim = s.indexOf(delim, left)
    } else {
      if (left < iAmp) out += s.substring(left, iAmp)
      out += '&amp;'
      left = iAmp + 1
      iAmp = s.indexOf('&', left)
    }
  }

  if (iDelim >= 0) {
    do {
      if (left < iDelim) out += s.substring(left, iDelim)
      out += escDelim
      left = iDelim + 1
      iDelim = s.indexOf(delim, left)
    } while (iDelim >= 0)
  } else {
    while (iAmp >= 0) {
      if (left < iAmp) out += s.substring(left, iAmp)
      out += '&amp;'
      left = iAmp + 1
      iAmp = s.indexOf('&', left)
    }
  }

  return left < s.length ? out + s.substring(left) : out
}

export function convertJSXIdentifier(node) {
  if (t.isJSXIdentifier(node)) {
    if (t.isValidIdentifier(node.name)) {
      node.type = 'Identifier'
    } else {
      return t.stringLiteral(node.name)
    }
  } else if (t.isJSXMemberExpression(node)) {
    return t.memberExpression(
      convertJSXIdentifier(node.object),
      convertJSXIdentifier(node.property),
    )
  } else if (t.isJSXNamespacedName(node)) {
    return t.stringLiteral(`${node.namespace.name}:${node.name.name}`)
  }

  return node
}

export function canNativeSpread(key, { checkNameSpaces } = {}) {
  if (
    checkNameSpaces &&
    key.includes(':') &&
    nonSpreadNameSpaces.has(key.split(':')[0])
  )
    return false
  // TODO: figure out how to detect definitely function ref
  if (key === 'ref') return false
  return true
}

const chars = 'etaoinshrdlucwmfygpbTAOISWCBvkxjqzPHFMDRELNGUKVYJQZX_$'
const base = chars.length

export function getNumberedId(num) {
  let out = ''

  do {
    const digit = num % base

    num = Math.floor(num / base)
    out = chars[digit] + out
  } while (num !== 0)

  return out
}

export function escapeStringForTemplate(str) {
  return str.replace(/[{\\`\n\t\b\f\v\r\u2028\u2029]/g, ch =>
    templateEscapes.get(ch),
  )
}

const templateEscapes = new Map([
  ['{', '\\{'],
  ['`', '\\`'],
  ['\\', '\\\\'],
  ['\n', '\\n'],
  ['\t', '\\t'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\v', '\\v'],
  ['\r', '\\r'],
  ['\u2028', '\\u2028'],
  ['\u2029', '\\u2029'],
])

export function isJSXElementPath(
  path: NodePathHub,
): path is NodePathHub<t.JSXElement> {
  return t.isJSXElement(path.node)
}

export function isJSXFragmentPath(
  path: NodePathHub,
): path is NodePathHub<t.JSXFragment> {
  return t.isJSXFragment(path.node)
}
