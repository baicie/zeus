// @ts-nocheck
import * as t from '@babel/types'
import {
  canNativeSpread,
  checkLength,
  convertJSXIdentifier,
  evaluateAndInline,
  filterChildren,
  getConfig,
  getRendererConfig,
  getTagName,
  isDynamic,
  registerImportMethod,
  transformCondition,
} from '../shared/utils'
import { transformNode } from '../shared/transform'

export function transformElement(path: any): any {
  path
    .get('openingElement')
    .get('attributes')
    .forEach((attr: any) => {
      evaluateAndInline(attr.node.value, attr.get('value'))
    })

  const tagName = getTagName(path.node)
  const results = {
    id: path.scope.generateUidIdentifier('el$'),
    declarations: [
      t.variableDeclarator(
        path.scope.generateUidIdentifier('el$'),
        t.callExpression(
          registerImportMethod(
            path,
            'createElement',
            getRendererConfig(path, 'universal').moduleName,
          ),
          [t.stringLiteral(tagName)],
        ),
      ),
    ],
    exprs: [],
    dynamics: [],
    postExprs: [],
    renderer: 'universal',
    tagName,
  }
  results.declarations[0].id = results.id
  transformAttributes(path, results)
  transformChildren(path, results)
  return results
}

export function setAttr(
  path: any,
  elem: t.Expression,
  name: string,
  value: t.Expression,
  { prevId }: any = {},
): t.Expression {
  return t.callExpression(
    registerImportMethod(
      path,
      'setProp',
      getRendererConfig(path, 'universal').moduleName,
    ),
    prevId
      ? [elem, t.stringLiteral(name), value, prevId]
      : [elem, t.stringLiteral(name), value],
  )
}

function transformAttributes(path: any, results: any): void {
  const elem = results.id
  const hasChildren = path.node.children.length > 0
  const config = getConfig(path)
  let attributes = path.get('openingElement').get('attributes')
  let spreadExpr

  if (
    attributes.some((attribute: any) => t.isJSXSpreadAttribute(attribute.node))
  ) {
    ;[attributes, spreadExpr] = processSpreads(path, attributes, {
      elem,
      hasChildren,
      wrapConditionals: config.wrapConditionals,
    })
    path.get('openingElement').set(
      'attributes',
      attributes.map((a: any) => a.node),
    )
  }

  path
    .get('openingElement')
    .get('attributes')
    .forEach((attribute: any) => {
      const node = attribute.node
      const value = node.value
      const key = t.isJSXNamespacedName(node.name)
        ? `${node.name.namespace.name}:${node.name.name.name}`
        : node.name.name

      if (t.isJSXExpressionContainer(value)) {
        if (key === 'children') return
        if (key === 'ref') {
          let binding
          const isConstant =
            t.isIdentifier(value.expression) &&
            (binding = path.scope.getBinding(value.expression.name)) &&
            (binding.kind === 'const' || binding.kind === 'module')
          if (!isConstant && t.isLVal(value.expression)) {
            const refIdentifier = path.scope.generateUidIdentifier('_ref$')
            results.exprs.unshift(
              t.variableDeclaration('var', [
                t.variableDeclarator(refIdentifier, value.expression),
              ]),
              t.expressionStatement(
                t.conditionalExpression(
                  t.binaryExpression(
                    '===',
                    t.unaryExpression('typeof', refIdentifier),
                    t.stringLiteral('function'),
                  ),
                  t.callExpression(
                    registerImportMethod(
                      path,
                      'use',
                      getRendererConfig(path, 'universal').moduleName,
                    ),
                    [refIdentifier, elem],
                  ),
                  t.assignmentExpression('=', value.expression, elem),
                ),
              ),
            )
          } else if (isConstant || t.isFunction(value.expression)) {
            results.exprs.unshift(
              t.expressionStatement(
                t.callExpression(
                  registerImportMethod(
                    path,
                    'use',
                    getRendererConfig(path, 'universal').moduleName,
                  ),
                  [value.expression, elem],
                ),
              ),
            )
          } else {
            const refIdentifier = path.scope.generateUidIdentifier('_ref$')
            results.exprs.unshift(
              t.variableDeclaration('var', [
                t.variableDeclarator(refIdentifier, value.expression),
              ]),
              t.expressionStatement(
                t.logicalExpression(
                  '&&',
                  t.binaryExpression(
                    '===',
                    t.unaryExpression('typeof', refIdentifier),
                    t.stringLiteral('function'),
                  ),
                  t.callExpression(
                    registerImportMethod(
                      path,
                      'use',
                      getRendererConfig(path, 'universal').moduleName,
                    ),
                    [refIdentifier, elem],
                  ),
                ),
              ),
            )
          }
          return
        }
        if (key.startsWith('use:')) {
          ;(node.name as any).name.type = 'Identifier'
          results.exprs.unshift(
            t.expressionStatement(
              t.callExpression(
                registerImportMethod(
                  path,
                  'use',
                  getRendererConfig(path, 'universal').moduleName,
                ),
                [
                  (node.name as any).name,
                  elem,
                  t.arrowFunctionExpression(
                    [],
                    t.isJSXEmptyExpression(value.expression)
                      ? t.booleanLiteral(true)
                      : value.expression,
                  ),
                ],
              ),
            ),
          )
          return
        }
        if (
          config.effectWrapper &&
          isDynamic(attribute.get('value').get('expression'), {
            checkMember: true,
          })
        ) {
          results.dynamics.push({ elem, key, value: value.expression })
        } else {
          results.exprs.push(
            t.expressionStatement(
              setAttr(attribute, elem, key, value.expression),
            ),
          )
        }
      } else {
        results.exprs.push(
          t.expressionStatement(
            setAttr(attribute, elem, key, value || t.booleanLiteral(true)),
          ),
        )
      }
    })
  if (spreadExpr) results.exprs.push(spreadExpr)
}

function transformChildren(path: any, results: any): void {
  const filteredChildren = filterChildren(path.get('children'))
  const multi = checkLength(filteredChildren)
  const childNodes = filteredChildren
    .map((p: any) => transformNode(p))
    .filter(Boolean)

  childNodes.forEach((child: any, index: number) => {
    if (child.id) {
      const insertNode = registerImportMethod(
        path,
        'insertNode',
        getRendererConfig(path, 'universal').moduleName,
      )
      results.exprs.push(
        t.expressionStatement(
          t.callExpression(insertNode, [results.id, child.id]),
        ),
      )
      results.declarations.push(...(child.declarations || []))
      results.exprs.push(...(child.exprs || []))
      results.dynamics.push(...(child.dynamics || []))
    } else if (child.exprs && child.exprs.length) {
      const insert = registerImportMethod(
        path,
        'insert',
        getRendererConfig(path, 'universal').moduleName,
      )
      if (multi) {
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(insert, [
              results.id,
              child.exprs[0],
              nextChild(childNodes, index) || t.nullLiteral(),
            ]),
          ),
        )
      } else {
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(insert, [results.id, child.exprs[0]]),
          ),
        )
      }
    }
  })
}

function nextChild(children: any[], index: number): any {
  return (
    children[index + 1] &&
    (children[index + 1].id || nextChild(children, index + 1))
  )
}

function processSpreads(
  path: any,
  attributes: any[],
  { elem, hasChildren, wrapConditionals }: any,
): any[] {
  const filteredAttributes: any[] = []
  const spreadArgs: any[] = []
  let runningObject: any[] = []
  let dynamicSpread = false
  let firstSpread = false
  attributes.forEach((attribute: any) => {
    const node = attribute.node
    const key =
      !t.isJSXSpreadAttribute(node) &&
      (t.isJSXNamespacedName(node.name)
        ? `${node.name.namespace.name}:${node.name.name.name}`
        : node.name.name)

    if (t.isJSXSpreadAttribute(node)) {
      firstSpread = true
      if (runningObject.length) {
        spreadArgs.push(t.objectExpression(runningObject))
        runningObject = []
      }
      spreadArgs.push(
        isDynamic(attribute.get('argument'), { checkMember: true }) &&
          (dynamicSpread = true)
          ? t.arrowFunctionExpression([], node.argument)
          : node.argument,
      )
    } else if (
      (firstSpread ||
        (t.isJSXExpressionContainer(node.value) &&
          isDynamic(attribute.get('value').get('expression'), {
            checkMember: true,
          }))) &&
      canNativeSpread(key as string, { checkNameSpaces: true })
    ) {
      const isContainer = t.isJSXExpressionContainer(node.value)
      const dynamic =
        isContainer &&
        isDynamic(attribute.get('value').get('expression'), {
          checkMember: true,
        })
      if (dynamic) {
        const id = convertJSXIdentifier(node.name)
        const expr =
          wrapConditionals &&
          (t.isLogicalExpression(node.value.expression) ||
            t.isConditionalExpression(node.value.expression))
            ? transformCondition(attribute.get('value').get('expression'), true)
            : t.arrowFunctionExpression([], node.value.expression)
        runningObject.push(
          t.objectMethod(
            'get',
            id,
            [],
            t.blockStatement([t.returnStatement(expr.body || expr)]),
            !t.isValidIdentifier(key as string),
          ),
        )
      } else {
        runningObject.push(
          t.objectProperty(
            t.stringLiteral(key as string),
            isContainer
              ? node.value.expression
              : node.value || t.booleanLiteral(true),
          ),
        )
      }
    } else filteredAttributes.push(attribute)
  })

  if (runningObject.length) spreadArgs.push(t.objectExpression(runningObject))
  const props =
    spreadArgs.length === 1 && !dynamicSpread
      ? spreadArgs[0]
      : t.callExpression(registerImportMethod(path, 'mergeProps'), spreadArgs)

  return [
    filteredAttributes,
    t.expressionStatement(
      t.callExpression(
        registerImportMethod(
          path,
          'spread',
          getRendererConfig(path, 'universal').moduleName,
        ),
        [elem, props, t.booleanLiteral(hasChildren)],
      ),
    ),
  ]
}
