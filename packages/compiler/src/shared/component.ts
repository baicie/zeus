import * as t from '@babel/types'
import {
  getConfig,
  registerImportMethod,
  filterChildren,
  trimWhitespace,
  convertJSXIdentifier,
  isDynamic,
  transformCondition,
} from './utils'
import { decode } from 'html-entities'
import { transformNode, getCreateTemplate } from './transform'

function convertComponentIdentifier(node: any): any {
  if (t.isJSXIdentifier(node)) {
    if (node.name === 'this') return t.thisExpression()
    if (t.isValidIdentifier(node.name)) node.type = 'Identifier'
    else return t.stringLiteral(node.name)
  } else if (t.isJSXMemberExpression(node)) {
    const prop = convertComponentIdentifier(node.property)
    const computed = t.isStringLiteral(prop)
    return t.memberExpression(convertComponentIdentifier(node.object), prop, computed)
  }
  return node
}

export default function transformComponent(path: any): any {
  const config = getConfig(path)
  const tagId = convertComponentIdentifier(path.node.openingElement.name)
  let props: t.Expression[] = []
  let runningObject: (t.ObjectProperty | t.ObjectMethod)[] = []
  let dynamicSpread = false
  const hasChildren = path.node.children.length > 0

  path
    .get('openingElement')
    .get('attributes')
    .forEach((attribute: any) => {
      const node = attribute.node
      if (t.isJSXSpreadAttribute(node)) {
        if (runningObject.length) {
          props.push(t.objectExpression(runningObject))
          runningObject = []
        }
        const expr = isDynamic(attribute.get('argument'), { checkMember: true })
          ? (dynamicSpread = true, t.arrowFunctionExpression([], node.argument))
          : node.argument
        props.push(expr)
        return
      }

      const value =
        (t.isStringLiteral(node.value) ? t.stringLiteral(node.value.value) : node.value) ||
        t.booleanLiteral(true)
      const id = convertJSXIdentifier(node.name)
      const key = (id as any).name || ((id as any).value as string)

      if (hasChildren && key === 'children') return

      if (t.isJSXExpressionContainer(value)) {
        if (key === 'ref') {
          runningObject.push(t.objectProperty(t.identifier('ref'), value.expression))
          return
        }
        if (isDynamic(attribute.get('value').get('expression'), { checkMember: true, checkTags: true })) {
          if (
            config.wrapConditionals &&
            config.generate !== 'ssr' &&
            (t.isLogicalExpression(value.expression) || t.isConditionalExpression(value.expression))
          ) {
            const expr = transformCondition(attribute.get('value').get('expression'), true)
            runningObject.push(
              t.objectMethod(
                'get',
                id as any,
                [],
                t.blockStatement([t.returnStatement((expr as any).body || expr)]),
                !t.isValidIdentifier(key),
              ),
            )
            return
          }
          runningObject.push(
            t.objectMethod(
              'get',
              id as any,
              [],
              t.blockStatement([t.returnStatement(value.expression)]),
              !t.isValidIdentifier(key),
            ),
          )
          return
        }
        runningObject.push(t.objectProperty(id as any, value.expression))
      } else {
        runningObject.push(t.objectProperty(id as any, value))
      }
    })

  const childResult = transformComponentChildren(path.get('children'), config)
  if (childResult && childResult[0]) {
    if (childResult[1]) {
      const body =
        t.isCallExpression(childResult[0]) && t.isFunction((childResult[0] as any).arguments[0])
          ? (childResult[0] as any).arguments[0].body
          : (childResult[0] as any).body
            ? (childResult[0] as any).body
            : childResult[0]
      runningObject.push(
        t.objectMethod(
          'get',
          t.identifier('children'),
          [],
          t.isExpression(body) ? t.blockStatement([t.returnStatement(body)]) : body,
        ),
      )
    } else {
      runningObject.push(t.objectProperty(t.identifier('children'), childResult[0]))
    }
  }
  if (runningObject.length || !props.length) props.push(t.objectExpression(runningObject))
  if (props.length > 1 || dynamicSpread) {
    props = [t.callExpression(registerImportMethod(path, 'mergeProps'), props)]
  }

  return {
    exprs: [t.callExpression(registerImportMethod(path, 'createComponent'), [tagId, props[0]])],
    template: '',
    component: true,
  }
}

function transformComponentChildren(children: any[], config: any): any {
  const filteredChildren = filterChildren(children)
  if (!filteredChildren.length) return
  const transformedChildren = filteredChildren.reduce((memo: any[], path: any) => {
    if (t.isJSXText(path.node)) {
      const v = decode(trimWhitespace(path.node.extra.raw))
      if (v.length) memo.push(t.stringLiteral(v))
    } else {
      const child = transformNode(path, { topLevel: true, componentChild: true, lastElement: true })
      memo.push(getCreateTemplate(config, path, child)(path, child, filteredChildren.length > 1))
    }
    return memo
  }, [])
  if (transformedChildren.length === 1) return [transformedChildren[0], false]
  return [t.arrayExpression(transformedChildren), true]
}

export { convertComponentIdentifier, convertJSXIdentifier }
