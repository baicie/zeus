import type { TransformContext, TransformOptions } from './ast'
import type { NodePath } from '@babel/core'
import * as t from '@babel/types'

// 创建转换上下文
export function createTransformContext(
  options: TransformOptions
): TransformContext {
  return {
    currentPath: null!,
    options,
    helpers: new Set(),
    inStatic: false,
    identifierCount: 0,
    moduleName: options.moduleName,
  }
}

// 生成唯一标识符
export function generateUniqueIdentifier(
  context: TransformContext,
  base: string = '_temp'
): string {
  return `${base}_${++context.identifierCount}`
}

// 注入帮助函数
export function injectHelpers(context: TransformContext): void {
  const helpers = Array.from(context.helpers)
  if (helpers.length) {
    const programPath = context.currentPath.findParent(p =>
      p.isProgram()
    ) as NodePath<t.Program>

    // 在程序开头注入帮助函数
    helpers.forEach(helper => {
      programPath.unshiftContainer('body', createHelperDeclaration(helper))
    })
  }
}

// 创建帮助函数声明
function createHelperDeclaration(name: string): t.Statement {
  // 这里可以根据不同的帮助函数名返回不同的实现
  switch (name) {
    case 'createElem':
      return t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('createElem'),
          t.arrowFunctionExpression(
            [t.identifier('tag')],
            t.callExpression(
              t.memberExpression(
                t.identifier('document'),
                t.identifier('createElement')
              ),
              [t.identifier('tag')]
            )
          )
        ),
      ])
    // 可以添加更多帮助函数
    default:
      throw new Error(`Unknown helper: ${name}`)
  }
}

// 判断是否是静态表达式
export function isStaticExpression(node: t.Node): boolean {
  return (
    t.isLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined')
  )
}

// 创建属性表达式
export function createPropertyExpression(
  object: t.Expression,
  property: string
): t.MemberExpression {
  return t.memberExpression(object, t.identifier(property), false)
}

// 创建条件表达式
export function createConditionExpression(
  test: t.Expression,
  consequent: t.Expression,
  alternate: t.Expression
): t.ConditionalExpression {
  return t.conditionalExpression(test, consequent, alternate)
}
