import type { Expression, JSXElement } from '@babel/types'
import * as t from '@babel/types'

/**
 * 创建动态绑定
 * 处理属性、事件、文本内容等的动态绑定
 */
export function createDynamicBindings(
  node: JSXElement,
  analysis: any,
  state: any
): any[] {
  const bindings: any[] = []

  // 处理动态属性
  analysis.attributes.forEach((attr: any) => {
    if (attr.isDynamic) {
      if (attr.isEvent) {
        // 事件绑定
        bindings.push({
          type: 'event',
          name: attr.name,
          expression: getExpression(attr.value),
          position: 0, // 事件绑定不需要位置
        })
      } else if (attr.isSpread) {
        // 展开属性
        bindings.push({
          type: 'spread',
          expression: attr.expression,
          position: 0,
        })
      } else {
        // 普通属性绑定
        bindings.push({
          type: 'attribute',
          name: attr.name,
          expression: getExpression(attr.value),
          position: 0, // 属性绑定不需要位置
        })
      }
    }
  })

  // 处理动态子元素
  analysis.children.forEach((child: any, index: number) => {
    if (child.isDynamic) {
      if (child.type === 'expression') {
        // 文本表达式
        bindings.push({
          type: 'text',
          expression: child.node.expression,
          position: index,
        })
      } else if (child.type === 'element' || child.type === 'fragment') {
        // 子元素
        bindings.push({
          type: 'child',
          expression: child.node,
          position: index,
        })
      }
    }
  })

  return bindings
}

/**
 * 获取表达式
 */
function getExpression(value: any): Expression {
  if (!value) {
    return t.booleanLiteral(true)
  }

  if (t.isJSXExpressionContainer(value)) {
    return value.expression
  }

  if (t.isStringLiteral(value)) {
    return value
  }

  return t.stringLiteral('')
}

/**
 * 优化绑定表达式
 */
export function optimizeBinding(expression: Expression): Expression {
  // 内联简单的表达式
  if (t.isConditionalExpression(expression)) {
    return optimizeConditional(expression)
  }

  if (t.isLogicalExpression(expression)) {
    return optimizeLogical(expression)
  }

  if (t.isBinaryExpression(expression)) {
    return optimizeBinary(expression)
  }

  return expression
}

/**
 * 优化条件表达式
 */
function optimizeConditional(expr: any): Expression {
  const { test, consequent, alternate } = expr

  // 如果测试是字面量，直接返回结果
  if (t.isBooleanLiteral(test)) {
    return test.value ? consequent : alternate
  }

  // 如果结果都是字面量，可以进一步优化
  if (t.isStringLiteral(consequent) && t.isStringLiteral(alternate)) {
    return expr // 保持原样，运行时处理
  }

  return expr
}

/**
 * 优化逻辑表达式
 */
function optimizeLogical(expr: any): Expression {
  const { operator, left, right } = expr

  if (operator === '&&') {
    // 如果左侧是 false，直接返回 false
    if (t.isBooleanLiteral(left) && !left.value) {
      return left
    }
    // 如果左侧是 true，返回右侧
    if (t.isBooleanLiteral(left) && left.value) {
      return right
    }
  }

  if (operator === '||') {
    // 如果左侧是 true，直接返回 true
    if (t.isBooleanLiteral(left) && left.value) {
      return left
    }
    // 如果左侧是 false，返回右侧
    if (t.isBooleanLiteral(left) && !left.value) {
      return right
    }
  }

  return expr
}

/**
 * 优化二元表达式
 */
function optimizeBinary(expr: any): Expression {
  const { operator, left, right } = expr

  // 字符串连接优化
  if (operator === '+' && t.isStringLiteral(left) && t.isStringLiteral(right)) {
    return t.stringLiteral(left.value + right.value)
  }

  // 数值运算优化
  if (['+', '-', '*', '/', '%'].includes(operator)) {
    if (t.isNumericLiteral(left) && t.isNumericLiteral(right)) {
      const result = evaluateBinary(left.value, operator, right.value)
      if (typeof result === 'number') {
        return t.numericLiteral(result)
      }
    }
  }

  return expr
}

/**
 * 计算二元表达式
 */
function evaluateBinary(
  left: number,
  operator: string,
  right: number
): number | null {
  switch (operator) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return right !== 0 ? left / right : null
    case '%':
      return right !== 0 ? left % right : null
    default:
      return null
  }
}
