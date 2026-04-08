// @ts-nocheck
import * as t from '@babel/types'
import {
  Aliases,
  ChildProperties,
  DelegatedEvents,
  Properties,
  SVGElements,
  SVGNamespace,
  getPropAlias,
} from '../shared/constants'
import VoidElements from '../VoidElements'
import {
  canNativeSpread,
  checkLength,
  convertJSXIdentifier,
  escapeHTML,
  evaluateAndInline,
  filterChildren,
  getConfig,
  getRendererConfig,
  getStaticExpression,
  getTagName,
  isComponent,
  isDynamic,
  registerImportMethod,
  reservedNameSpaces,
  toEventName,
  toPropertyName,
  wrappedByText,
} from '../shared/utils'
import { transformNode } from '../shared/transform'

export function transformElement(path: any, info: any): any {
  path
    .get('openingElement')
    .get('attributes')
    .forEach((attr: any) =>
      evaluateAndInline(attr.node.value, attr.get('value')),
    )
  const tagName = getTagName(path.node)
  const voidTag = VoidElements.indexOf(tagName) > -1
  const results: any = {
    template: `<${tagName}>`,
    templateWithClosingTags: `<${tagName}>`,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    renderer: 'dom',
    tagName,
    id: info.skipId ? undefined : path.scope.generateUidIdentifier('el$'),
  }

  transformAttributes(path, results)
  if (getConfig(path).contextToCustomElements && tagName.indexOf('-') > -1) {
    contextToCustomElement(path, results)
  }
  if (!voidTag) {
    transformChildren(path, results, getConfig(path))
    results.template += `</${tagName}>`
    results.templateWithClosingTags += `</${tagName}>`
  }
  return results
}

export function setAttr(
  path: any,
  elem: t.Expression,
  name: string,
  value: t.Expression,
  { isSVG, dynamic, prevId, isCE, tagName }: any,
): t.Expression {
  let parts
  let namespace
  parts = name.split(':')
  if (parts[1] && reservedNameSpaces.has(parts[0])) {
    name = parts[1]
    namespace = parts[0]
  }
  if (namespace === 'style') {
    return t.callExpression(
      registerImportMethod(
        path,
        'setStyleProperty',
        getRendererConfig(path, 'dom').moduleName,
      ),
      [elem, t.stringLiteral(name), value],
    )
  }
  if (namespace === 'class') {
    return t.callExpression(
      t.memberExpression(
        t.memberExpression(elem, t.identifier('classList')),
        t.identifier('toggle'),
      ),
      [
        t.stringLiteral(name),
        dynamic ? value : t.unaryExpression('!', t.unaryExpression('!', value)),
      ],
    )
  }
  if (name === 'style')
    return t.callExpression(
      registerImportMethod(
        path,
        'style',
        getRendererConfig(path, 'dom').moduleName,
      ),
      prevId ? [elem, value, prevId] : [elem, value],
    )
  if (!isSVG && name === 'class')
    return t.callExpression(
      registerImportMethod(
        path,
        'className',
        getRendererConfig(path, 'dom').moduleName,
      ),
      [elem, value],
    )
  if (name === 'classList')
    return t.callExpression(
      registerImportMethod(
        path,
        'classList',
        getRendererConfig(path, 'dom').moduleName,
      ),
      prevId ? [elem, value, prevId] : [elem, value],
    )

  const isChildProp = ChildProperties.has(name)
  const isProp = Properties.has(name)
  const alias = getPropAlias(name, tagName.toUpperCase())
  if (
    namespace !== 'attr' &&
    (isChildProp || (!isSVG && isProp) || isCE || namespace === 'prop')
  ) {
    if (isCE && !isChildProp && !isProp && namespace !== 'prop')
      name = toPropertyName(name)
    return t.assignmentExpression(
      '=',
      t.memberExpression(elem, t.identifier(alias || name)),
      value,
    )
  }

  const isNameSpaced = name.indexOf(':') > -1
  name = Aliases[name] || name
  if (!isSVG) name = name.toLowerCase()
  const ns = isNameSpaced ? SVGNamespace[name.split(':')[0]] : undefined
  if (ns)
    return t.callExpression(
      registerImportMethod(
        path,
        'setAttributeNS',
        getRendererConfig(path, 'dom').moduleName,
      ),
      [elem, t.stringLiteral(ns), t.stringLiteral(name), value],
    )
  return t.callExpression(
    registerImportMethod(
      path,
      'setAttribute',
      getRendererConfig(path, 'dom').moduleName,
    ),
    [elem, t.stringLiteral(name), value],
  )
}

function transformAttributes(path: any, results: any): void {
  const elem = results.id
  const tagName = getTagName(path.node)
  const isSVG = SVGElements.has(tagName)
  let attributes = path.get('openingElement').get('attributes')
  if (attributes.some((a: any) => t.isJSXSpreadAttribute(a.node))) {
    const processed = processSpreads(path, attributes, {
      elem,
      isSVG,
      hasChildren: path.node.children.length > 0,
      wrapConditionals: getConfig(path).wrapConditionals,
      tagName,
    })
    const filtered = processed[0]
    const spreadExpr = processed[1]
    path.get('openingElement').set(
      'attributes',
      filtered.map((a: any) => a.node),
    )
    results.exprs.push(spreadExpr)
    attributes = path.get('openingElement').get('attributes')
  }

  const styleAttr = attributes.find(
    (a: any) =>
      a.node.name &&
      a.node.name.name === 'style' &&
      t.isJSXExpressionContainer(a.node.value) &&
      t.isObjectExpression(a.node.value.expression) &&
      !a.node.value.expression.properties.some((p: any) =>
        t.isSpreadElement(p),
      ),
  )
  if (styleAttr) {
    let i = 0
    const obj = styleAttr.node.value.expression
    obj.properties.slice().forEach((p: any, index: number) => {
      if (!p.computed) {
        path
          .get('openingElement')
          .node.attributes.splice(
            styleAttr.key + ++i,
            0,
            t.jsxAttribute(
              t.jsxNamespacedName(
                t.jsxIdentifier('style'),
                t.jsxIdentifier(
                  t.isIdentifier(p.key) ? p.key.name : p.key.value,
                ),
              ),
              t.jsxExpressionContainer(p.value),
            ),
          )
        obj.properties.splice(index - i - 1, 1)
      }
    })
    if (!obj.properties.length) {
      path.get('openingElement').node.attributes.splice(styleAttr.key, 1)
    }
    attributes = path.get('openingElement').get('attributes')
  }

  const classListAttr = attributes.find(
    (a: any) =>
      a.node.name &&
      a.node.name.name === 'classList' &&
      t.isJSXExpressionContainer(a.node.value) &&
      t.isObjectExpression(a.node.value.expression) &&
      !a.node.value.expression.properties.some(
        (p: any) => t.isSpreadElement(p) || p.computed,
      ),
  )
  if (classListAttr) {
    let i = 0
    const obj = classListAttr.node.value.expression
    obj.properties.slice().forEach((p: any, index: number) => {
      path
        .get('openingElement')
        .node.attributes.splice(
          classListAttr.key + ++i,
          0,
          t.jsxAttribute(
            t.jsxNamespacedName(
              t.jsxIdentifier('class'),
              t.jsxIdentifier(t.isIdentifier(p.key) ? p.key.name : p.key.value),
            ),
            t.jsxExpressionContainer(p.value),
          ),
        )
      obj.properties.splice(index - i - 1, 1)
    })
    path.get('openingElement').node.attributes.splice(classListAttr.key, 1)
    attributes = path.get('openingElement').get('attributes')
  }
  const appendStaticAttr = (k: string, v?: string): void => {
    if (v === undefined) {
      results.template = results.template.replace('>', ` ${k}>`)
      return
    }
    results.template = results.template.replace('>', ` ${k}="${v}">`)
  }

  attributes.forEach((attribute: any) => {
    const node = attribute.node
    if (t.isJSXSpreadAttribute(node)) return
    let value = node.value
    let key = t.isJSXNamespacedName(node.name)
      ? `${node.name.namespace.name}:${node.name.name.name}`
      : node.name.name
    if (t.isJSXExpressionContainer(value)) {
      if (key === 'children') return
      if (key === 'ref') {
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(
              registerImportMethod(
                path,
                'use',
                getRendererConfig(path, 'dom').moduleName,
              ),
              [value.expression, elem],
            ),
          ),
        )
        return
      }
      if (key.startsWith('use:')) {
        ;(node.name as any).name.type = 'Identifier'
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(
              registerImportMethod(
                path,
                'use',
                getRendererConfig(path, 'dom').moduleName,
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
      if (key.startsWith('attr:')) {
        const attrName = key.slice(5)
        results.exprs.push(
          t.expressionStatement(
            setAttr(attribute, elem, `attr:${attrName}`, value.expression, {
              isSVG,
              isCE: tagName.indexOf('-') > -1,
              tagName,
            }),
          ),
        )
        return
      }
      if (key.startsWith('bool:')) {
        results.exprs.push(
          t.expressionStatement(
            setAttr(attribute, elem, key, value.expression, {
              isSVG,
              isCE: tagName.indexOf('-') > -1,
              tagName,
            }),
          ),
        )
        return
      }
      if (key.startsWith('style:') || key.startsWith('class:')) {
        if (
          isDynamic(attribute.get('value').get('expression'), {
            checkMember: true,
          })
        ) {
          results.dynamics.push({
            elem,
            key,
            value: value.expression,
            isSVG,
            tagName,
          })
        } else {
          results.exprs.push(
            t.expressionStatement(
              setAttr(attribute, elem, key, value.expression, {
                isSVG,
                isCE: tagName.indexOf('-') > -1,
                tagName,
              }),
            ),
          )
        }
        return
      }
      if (key === 'classList' || key === 'style') {
        if (
          isDynamic(attribute.get('value').get('expression'), {
            checkMember: true,
          })
        ) {
          results.dynamics.push({
            elem,
            key,
            value: value.expression,
            isSVG,
            tagName,
          })
          return
        }
      }
      if (key.indexOf('on') === 0) {
        const ev = toEventName(key)
        if (key.startsWith('oncapture:')) {
          results.exprs.push(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(elem, t.identifier('addEventListener')),
                [
                  t.stringLiteral(key.split(':')[1]),
                  value.expression,
                  t.booleanLiteral(true),
                ],
              ),
            ),
          )
          return
        }
        if (key.startsWith('on:')) {
          results.exprs.push(
            t.expressionStatement(
              t.callExpression(
                registerImportMethod(
                  path,
                  'addEventListener',
                  getRendererConfig(path, 'dom').moduleName,
                ),
                [elem, t.stringLiteral(key.split(':')[1]), value.expression],
              ),
            ),
          )
          return
        }
        if (DelegatedEvents.has(ev)) {
          const events =
            attribute.scope.getProgramParent().data.events ||
            (attribute.scope.getProgramParent().data.events = new Set())
          events.add(ev)
          let handler = value.expression
          if (t.isArrayExpression(handler)) {
            if (handler.elements.length > 1) {
              results.exprs.push(
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(elem, t.identifier(`$$${ev}Data`)),
                    handler.elements[1] as t.Expression,
                  ),
                ),
              )
            }
            handler = handler.elements[0] as t.Expression
          }
          results.exprs.push(
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(elem, t.identifier(`$$${ev}`)),
                handler,
              ),
            ),
          )
        } else {
          results.exprs.push(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(elem, t.identifier('addEventListener')),
                [t.stringLiteral(ev), value.expression],
              ),
            ),
          )
        }
      } else if (
        isDynamic(attribute.get('value').get('expression'), {
          checkMember: true,
        })
      ) {
        results.dynamics.push({
          elem,
          key,
          value: value.expression,
          isSVG,
          tagName,
        })
      } else {
        results.exprs.push(
          t.expressionStatement(
            setAttr(attribute, elem, key, value.expression, {
              isSVG,
              isCE: tagName.indexOf('-') > -1,
              tagName,
            }),
          ),
        )
      }
    } else if (key !== 'children') {
      if (t.isStringLiteral(value)) {
        appendStaticAttr(key, escapeHTML(value.value, true))
      } else if (!value) {
        appendStaticAttr(key)
      } else if (t.isNumericLiteral(value)) {
        appendStaticAttr(key, String(value.value))
      } else if (t.isBooleanLiteral(value)) {
        if (value.value) appendStaticAttr(key)
      }
    }
  })
}

function processSpreads(
  path: any,
  attributes: any[],
  { elem, isSVG, hasChildren, wrapConditionals, tagName }: any,
): any[] {
  const filteredAttributes: any[] = []
  const spreadArgs: any[] = []
  let runningObject: any[] = []
  let dynamicSpread = false
  let firstSpread = false

  attributes.forEach(attribute => {
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
            t.blockStatement([t.returnStatement((expr as any).body || expr)]),
            !t.isValidIdentifier(key as string),
          ),
        )
      } else {
        runningObject.push(
          t.objectProperty(
            t.stringLiteral(key as string),
            isContainer
              ? node.value.expression
              : node.value ||
                  (Properties.has(key as string)
                    ? t.booleanLiteral(true)
                    : t.stringLiteral('')),
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
          getRendererConfig(path, 'dom').moduleName,
        ),
        [elem, props, t.booleanLiteral(isSVG), t.booleanLiteral(hasChildren)],
      ),
    ),
  ]
}

function contextToCustomElement(path: any, results: any): void {
  results.exprs.push(
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(results.id, t.identifier('_$owner')),
        t.callExpression(
          registerImportMethod(
            path,
            'getOwner',
            getRendererConfig(path, 'dom').moduleName,
          ),
          [],
        ),
      ),
    ),
  )
}

function transformChildren(path: any, results: any, config: any): void {
  const filteredChildren = filterChildren(path.get('children'))
  const multi = checkLength(filteredChildren)
  const markers = config.hydratable && multi
  const childNodes = filteredChildren.reduce(
    (memo: any[], child: any, index: number) => {
      const transformed = transformNode(child, {
        lastElement: index === filteredChildren.length - 1,
        skipId: !results.id,
      })
      if (transformed) memo.push(transformed)
      return memo
    },
    [],
  )

  childNodes.forEach((child: any, index: number) => {
    if (!child) return
    if (child.tagName && child.renderer !== 'dom') {
      throw new Error(
        `<${child.tagName}> is not supported in <${getTagName(path.node)}>.`,
      )
    }
    results.template += child.template || ''
    results.templateWithClosingTags +=
      child.templateWithClosingTags || child.template || ''
    if (child.id) {
      const walk = t.memberExpression(
        t.identifier(results.id.name),
        t.identifier(index === 0 ? 'firstChild' : 'nextSibling'),
      )
      results.declarations.push(t.variableDeclarator(child.id, walk))
      results.declarations.push(...(child.declarations || []))
      results.exprs.push(...(child.exprs || []))
      results.dynamics.push(...(child.dynamics || []))
    } else if (child.exprs && child.exprs.length) {
      if (!results.id) {
        results.exprs.push(
          ...child.exprs.map((expr: t.Expression) =>
            t.expressionStatement(expr),
          ),
        )
        return
      }
      const insert = registerImportMethod(
        path,
        'insert',
        getRendererConfig(path, 'dom').moduleName,
      )
      if (markers || wrappedByText(childNodes, index)) {
        let exprId
        let contentId
        if (markers) {
          const marker = createPlaceholder(
            path,
            results,
            results.id.name,
            index + 1,
            '$',
          )
          exprId = marker[0]
        }
        const placeholder = createPlaceholder(
          path,
          results,
          results.id.name,
          index + 1,
          markers ? '/' : '',
        )
        exprId = exprId || placeholder[0]
        contentId = placeholder[1]
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(
              insert,
              contentId
                ? [results.id, child.exprs[0], exprId, contentId]
                : [results.id, child.exprs[0], exprId],
            ),
          ),
        )
      } else {
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(insert, [
              results.id,
              child.exprs[0],
              nextChild(childNodes, index) || t.nullLiteral(),
            ]),
          ),
        )
      }
    }
  })
}

function createPlaceholder(
  path: any,
  results: any,
  tempPath: string,
  i: number,
  char: string,
): [t.Identifier, t.Identifier | undefined] {
  const exprId = path.scope.generateUidIdentifier('el$')
  let contentId
  results.template += `<!${char}>`
  results.templateWithClosingTags += `<!${char}>`
  if (getConfig(path).hydratable && char === '/') {
    contentId = path.scope.generateUidIdentifier('co$')
    results.declarations.push(
      t.variableDeclarator(
        t.arrayPattern([exprId, contentId]),
        t.callExpression(
          registerImportMethod(
            path,
            'getNextMarker',
            getRendererConfig(path, 'dom').moduleName,
          ),
          [
            t.memberExpression(
              t.identifier(tempPath),
              t.identifier('nextSibling'),
            ),
          ],
        ),
      ),
    )
  } else {
    results.declarations.push(
      t.variableDeclarator(
        exprId,
        t.memberExpression(
          t.identifier(tempPath),
          t.identifier(i === 0 ? 'firstChild' : 'nextSibling'),
        ),
      ),
    )
  }
  return [exprId, contentId]
}

function nextChild(children: any[], index: number): any {
  return (
    children[index + 1] &&
    (children[index + 1].id || nextChild(children, index + 1))
  )
}

export { convertJSXIdentifier, getStaticExpression, isComponent }
