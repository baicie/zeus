import type { Expression, CallExpression } from '@babel/types'
import * as t from '@babel/types'

/**
 * 优化表达式
 * 内联简单表达式，减少运行时开销
 */
export function optimizeExpression(expression: Expression): Expression {
  if (t.isConditionalExpression(expression)) {
    return optimizeConditionalExpression(expression)
  }

  if (t.isLogicalExpression(expression)) {
    return optimizeLogicalExpression(expression)
  }

  if (t.isBinaryExpression(expression)) {
    return optimizeBinaryExpression(expression)
  }

  if (t.isUnaryExpression(expression)) {
    return optimizeUnaryExpression(expression)
  }

  if (t.isCallExpression(expression)) {
    return optimizeCallExpression(expression)
  }

  return expression
}

/**
 * 优化条件表达式
 */
function optimizeConditionalExpression(
  expr: t.ConditionalExpression
): Expression {
  const { test, consequent, alternate } = expr

  // 如果测试是布尔字面量，直接返回结果
  if (t.isBooleanLiteral(test)) {
    return test.value ? consequent : alternate
  }

  // 如果测试是 null 或 undefined，返回 alternate
  if (t.isNullLiteral(test) || isUndefined(test)) {
    return alternate
  }

  // 如果测试是字符串字面量，非空字符串为 true
  if (t.isStringLiteral(test)) {
    return test.value ? consequent : alternate
  }

  // 如果测试是数值字面量，非零为 true
  if (t.isNumericLiteral(test)) {
    return test.value !== 0 ? consequent : alternate
  }

  return expr
}

/**
 * 优化逻辑表达式
 */
function optimizeLogicalExpression(expr: t.LogicalExpression): Expression {
  const { operator, left, right } = expr

  if (operator === '&&') {
    // 短路求值：如果左侧为假，返回左侧
    if (isFalsy(left)) {
      return left
    }
    // 如果左侧为真，返回右侧
    if (isTruthy(left)) {
      return right
    }
  }

  if (operator === '||') {
    // 短路求值：如果左侧为真，返回左侧
    if (isTruthy(left)) {
      return left
    }
    // 如果左侧为假，返回右侧
    if (isFalsy(left)) {
      return right
    }
  }

  if (operator === '??') {
    // 空值合并：如果左侧不是 null 或 undefined，返回左侧
    if (!isNullish(left)) {
      return left
    }
    // 如果左侧是 null 或 undefined，返回右侧
    if (isNullish(left)) {
      return right
    }
  }

  return expr
}

/**
 * 优化二元表达式
 */
function optimizeBinaryExpression(expr: t.BinaryExpression): Expression {
  const { operator, left, right } = expr

  // 字符串连接
  if (operator === '+') {
    if (t.isStringLiteral(left) && t.isStringLiteral(right)) {
      return t.stringLiteral(left.value + right.value)
    }
  }

  // 数值运算
  if (['+', '-', '*', '/', '%', '**'].includes(operator)) {
    if (t.isNumericLiteral(left) && t.isNumericLiteral(right)) {
      const result = evaluateNumericBinary(left.value, operator, right.value)
      if (result !== null) {
        return t.numericLiteral(result)
      }
    }
  }

  // 比较运算
  if (['==', '===', '!=', '!==', '<', '>', '<=', '>='].includes(operator)) {
    if (t.isStringLiteral(left) && t.isStringLiteral(right)) {
      const result = evaluateStringComparison(left.value, operator, right.value)
      if (result !== null) {
        return t.booleanLiteral(result)
      }
    }

    if (t.isNumericLiteral(left) && t.isNumericLiteral(right)) {
      const result = evaluateNumericComparison(
        left.value,
        operator,
        right.value
      )
      if (result !== null) {
        return t.booleanLiteral(result)
      }
    }
  }

  return expr
}

/**
 * 优化一元表达式
 */
function optimizeUnaryExpression(expr: t.UnaryExpression): Expression {
  const { operator, argument } = expr

  if (operator === '!') {
    if (t.isBooleanLiteral(argument)) {
      return t.booleanLiteral(!argument.value)
    }
    if (isFalsy(argument)) {
      return t.booleanLiteral(true)
    }
    if (isTruthy(argument)) {
      return t.booleanLiteral(false)
    }
  }

  if (operator === '-') {
    if (t.isNumericLiteral(argument)) {
      return t.numericLiteral(-argument.value)
    }
  }

  if (operator === '+') {
    if (t.isNumericLiteral(argument)) {
      return argument
    }
  }

  return expr
}

/**
 * 优化函数调用
 */
function optimizeCallExpression(expr: CallExpression): Expression {
  // 这里可以添加函数调用的优化逻辑
  // 例如：内联简单的工具函数调用
  return expr
}

/**
 * 检查值是否为真值
 */
function isTruthy(node: Expression): boolean {
  if (t.isBooleanLiteral(node)) {
    return node.value
  }
  if (t.isStringLiteral(node)) {
    return node.value.length > 0
  }
  if (t.isNumericLiteral(node)) {
    return node.value !== 0
  }
  if (t.isNullLiteral(node) || isUndefined(node)) {
    return false
  }
  return false // 其他情况需要运行时判断
}

/**
 * 检查值是否为假值
 */
function isFalsy(node: Expression): boolean {
  if (t.isBooleanLiteral(node)) {
    return !node.value
  }
  if (t.isStringLiteral(node)) {
    return node.value.length === 0
  }
  if (t.isNumericLiteral(node)) {
    return node.value === 0
  }
  if (t.isNullLiteral(node) || isUndefined(node)) {
    return true
  }
  return false // 其他情况需要运行时判断
}

/**
 * 检查值是否为 null 或 undefined
 */
function isNullish(node: Expression): boolean {
  return t.isNullLiteral(node) || isUndefined(node)
}

/**
 * 检查是否为 undefined
 */
function isUndefined(node: Expression): boolean {
  return t.isIdentifier(node) && node.name === 'undefined'
}

/**
 * 计算数值二元运算
 */
function evaluateNumericBinary(
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
    case '**':
      return Math.pow(left, right)
    default:
      return null
  }
}

/**
 * 计算字符串比较
 */
function evaluateStringComparison(
  left: string,
  operator: string,
  right: string
): boolean | null {
  switch (operator) {
    case '==':
      return left == right
    case '===':
      return left === right
    case '!=':
      return left != right
    case '!==':
      return left !== right
    case '<':
      return left < right
    case '>':
      return left > right
    case '<=':
      return left <= right
    case '>=':
      return left >= right
    default:
      return null
  }
}

/**
 * 计算数值比较
 */
function evaluateNumericComparison(
  left: number,
  operator: string,
  right: number
): boolean | null {
  switch (operator) {
    case '==':
      return left == right
    case '===':
      return left === right
    case '!=':
      return left != right
    case '!==':
      return left !== right
    case '<':
      return left < right
    case '>':
      return left > right
    case '<=':
      return left <= right
    case '>=':
      return left >= right
    default:
      return null
  }
}
