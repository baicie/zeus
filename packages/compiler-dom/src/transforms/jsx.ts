import type {
  MetadataConfig,
  NodePathHub,
  NodeTransform,
} from '@zeus-js/compiler-core'
import * as t from '@babel/types'
import { getConfig, getTagName, isComponent } from '../utils'

export const transformJSX: NodeTransform = path => {
  const config = getConfig(path)
  const replace = transformThis(path)
  // const result =
}

type Scope = ReturnType<NodePathHub['scope']['getFunctionParent']>

function getTargetFunctionParent<T = t.Node>(
  path: NodePathHub<T>,
  parent: Scope | null
) {
  let current = path.scope.getFunctionParent()
  while (
    current !== parent &&
    current &&
    current.path.isArrowFunctionExpression()
  ) {
    current = current.path.parentPath.scope.getFunctionParent()
  }
  return current
}

function transformThis(path: NodePathHub) {
  const parent = path.scope.getFunctionParent()
  let thisId: t.Identifier | undefined
  path.traverse({
    ThisExpression(path) {
      const current = getTargetFunctionParent(
        path as NodePathHub<t.ThisExpression>,
        parent
      )
      if (current === parent) {
        thisId || (thisId = path.scope.generateUidIdentifier('self$'))
        path.replaceWith(thisId)
      }
    },
    JSXElement(path) {
      let source = path.get('openingElement').get('name')
      while (source.isJSXMemberExpression()) {
        source = source.get('object')
      }
      if (source.isJSXIdentifier() && source.node.name === 'this') {
        const current = getTargetFunctionParent(
          path as NodePathHub<t.JSXElement>,
          parent
        )
        if (current === parent) {
          thisId || (thisId = path.scope.generateUidIdentifier('self$'))
          source.replaceWith(t.jsxIdentifier(thisId.name))

          if (path.node.closingElement) {
            path.node.closingElement.name = path.node.openingElement.name
          }
        }
      }
    },
  })

  return (node: t.Node) => {
    if (thisId) {
      if (!parent || parent.block.type === 'ClassMethod') {
        const decl = t.variableDeclaration('const', [
          t.variableDeclarator(thisId, t.thisExpression()),
        ])
        if (parent) {
          const stmt = path.getStatementParent()
          if (stmt) {
            stmt.insertBefore(decl)
          }
        } else {
          return t.callExpression(
            t.arrowFunctionExpression(
              [],
              t.blockStatement([decl, t.returnStatement(node)])
            ),
            []
          )
        }
      } else {
        parent.push({
          id: thisId,
          init: t.thisExpression(),
          kind: 'const',
        })
      }
    }
    return node
  }
}

interface TransformInfo {
  doNotEscape?: boolean
  topLevel?: boolean
  lastElement?: boolean
}

function transformNode(path: NodePathHub, info: TransformInfo = {}) {
  const config = getConfig(path)
  const node = path.node
  let staticValue
  if (t.isJSXElement(node)) {
    return transformElement(config, path, info)
  }
}

function transformElement(
  config: MetadataConfig,
  path: NodePathHub,
  info: TransformInfo
) {
  const node = path.node
  let tagName = getTagName(node as t.JSXElement)

  if (isComponent(tagName)) return
}
