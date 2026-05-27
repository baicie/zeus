# evaluateAndInline

**源文件**: `vendor/dom-expressions/.../src/shared/utils.js` 第 451-480 行

## 功能概述

编译期常量折叠（constant folding）。将能在编译时求值的表达式替换为字面量，减少运行时计算。

## 调用位置

在 `transformElement` 的属性遍历中调用：

```js
path
  .get('openingElement')
  .get('attributes')
  .forEach(attr => {
    evaluateAndInline(attr.node.value, attr.get('value'))
  })
```

## 算法逻辑

### 第一层：解包包装节点

```js
// 处理 JSX 表达式容器 {xxx}
if (t.isJSXExpressionContainer(value))
  evaluateAndInline(value.expression, valueNode.get('expression'))

// 处理对象属性 { prop: value }
if (t.isObjectProperty(value))
  evaluateAndInline(value.value, valueNode.get('value'))
```

### 第二层：递归处理复合类型

```js
// 处理对象
if (t.isObjectExpression(value)) {
  for (let i = 0; i < properties.length; i++)
    evaluateAndInline(properties[i], propertiesNode[i])
}
```

### 第三层：Babel 求值引擎

```js
const r = valueNode.evaluate() // Babel 内置求值器
if (r.confident) {
  // Babel 确定能求值
  if (typeof r.value === 'string')
    valueNode.replaceWith(t.stringLiteral(r.value))
  // ...
}
```

## 实际效果

```tsx
<div style={{ opacity: 1 - 0.5 }} />
```

Babel 求值器得到 `0.5`，替换为字面量：

```tsx
<div style={{ opacity: 0.5 }} />
```

## 必须做

无。这是纯优化，不影响正确性。

## 可参考

- **字符串/数字/布尔字面量**：已经是字面量，跳过
- **对象表达式**：递归处理每个属性
- **JSX 表达式容器**：解包后继续求值
- **Babel 求值器**：`valueNode.evaluate()` 返回 `{ confident: boolean, value: any }`

## 不做

- 不需要在 MVP 中实现
- 可后续按需加入

## 最小可实现版本

```ts
import * as t from '@babel/types'

export function evaluateAndInline(
  value: BabelNode | null,
  valueNode: NodePath,
): void {
  if (!value || !valueNode) return

  if (t.isJSXExpressionContainer(value)) {
    evaluateAndInline(value.expression, valueNode.get('expression') as NodePath)
    return
  }

  if (t.isObjectProperty(value)) {
    evaluateAndInline(value.value, valueNode.get('value') as NodePath)
    return
  }

  if (
    t.isStringLiteral(value) ||
    t.isNumericLiteral(value) ||
    t.isBooleanLiteral(value) ||
    t.isNullLiteral(value)
  ) {
    // 已经是字面量，无需处理
    return
  }

  if (t.isObjectExpression(value)) {
    const properties = value.properties
    const propertiesNode = valueNode.get('properties')
    for (let i = 0; i < properties.length; i++) {
      evaluateAndInline(properties[i], propertiesNode[i] as NodePath)
    }
    return
  }

  // 使用 Babel 内置求值器
  const r = (valueNode as NodePath).evaluate()
  if (r.confident) {
    if (typeof r.value === 'string') {
      ;(valueNode as NodePath).replaceWith(t.stringLiteral(r.value))
    } else if (typeof r.value === 'number') {
      ;(valueNode as NodePath).replaceWith(t.numericLiteral(r.value))
    } else if (typeof r.value === 'boolean') {
      ;(valueNode as NodePath).replaceWith(t.booleanLiteral(r.value))
    }
  }
}
```
