# transformAttributes

**源文件**: `vendor/dom-expressions/.../src/dom/element.js` 第 332-1019 行

## 功能概述

处理 JSX 元素的属性，将静态属性内联到 template 字符串，将动态属性生成对应的运行时调用。

## 分块结构

### 1. Spread 处理（344-358 行）

```js
if (attributes.some(attribute => t.isJSXSpreadAttribute(attribute.node))) {
  [attributes, spreadExpr] = processSpreads(path, attributes, {...})
}
```

检测 `{...props}` 并特殊处理。

**Zeus 建议**：MVP 不支持 spread，检测到时报错或警告。

### 2. Style 内联（370-479 行）

三层处理：

| 层 | 输入 | 输出 |
|---|---|---|
| 静态字符串 | `style="color: red"` | 直接提取到 template |
| 静态对象 | `style={{ opacity: 1 - 0.5 }}` | 编译期求值 `style="opacity:0.5"` |
| 混合对象 | `style={{ width: w(), height: h() }}` | 展开为 `style:width={w()} style:height={h()}` |

**Zeus 建议**：至少做第一层和第三层，第二层（Babel 求值）可选。

### 3. classList 展开（481-533 行）

```tsx
classList={{ active: isActive(), disabled: false }}
```

- `disabled: false` → 丢弃
- `active: isActive()` → 转为 `class:active={isActive()}`

**Zeus 建议**：优先级低，MVP 可跳过。

### 4. class / className 合并（536-563 行）

多个 class 属性合并为一个，支持静态拼接和动态表达式合并：

```tsx
<div class="a" className="b" class={c()} />
// → <div class={`a b ${c() || ""}`} />
```

**Zeus 建议**：优先级低，MVP 可跳过。

### 5. 属性生成（626-1012 行）——核心

| 条件 | 输出 |
|---|---|
| `key === "ref"` | 生成 `use(ref, el)` 调用 |
| `key.startsWith("use:")` | 特殊指令式属性 |
| `key === "children"` | 收集 children |
| `key.startsWith("on")` | 事件绑定 |
| `key.startsWith("attr:")` | 动态 attribute |
| `key.startsWith("bool:")` | 布尔 attribute |
| 动态属性（需 effect） | 加入 `results.dynamics` |
| 其他静态属性 | 调用 `inlineAttributeOnTemplate` |

### 6. 收尾（1013-1019 行）

```js
if (!hasChildren && children) path.node.children.push(children)
if (spreadExpr) results.exprs.push(spreadExpr)
```

## 不做

- **Spread 展开**（`{...props}`）
- **event delegation**（事件委托优化）
- **effect wrapper**（响应式属性包装）
- **hydratable 相关处理**
- **SVG namespace 特殊处理**（可在 codegen 阶段处理）

## 最小可实现版本

```ts
export function transformAttributes(path: BabelJSXElementPath, results: TransformResults) {
  path.get("openingElement").get("attributes").forEach((attr) => {
    const node = attr.node
    if (!node.name) return

    const key = node.name.name
    const value = node.value

    if (t.isJSXExpressionContainer(value)) {
      const expr = value.expression

      // 事件绑定 onClick onInput ...
      if (key.startsWith('on') && key.length > 2) {
        const eventName = key[2].toLowerCase() + key.slice(3)
        results.exprs.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(results.id!, t.identifier('addEventListener')),
              [t.stringLiteral(eventName), expr]
            )
          )
        )
        return
      }

      // 其他动态属性 → setAttr
      results.exprs.push(
        t.expressionStatement(
          setAttr(results.id!, key, expr)
        )
      )
    } else {
      // 静态属性 → 内联到 template
      inlineAttributeOnTemplate(key, value, results)
    }
  })
}
```

## 辅助函数

```ts
function inlineAttributeOnTemplate(key: string, value: BabelNode, results: TransformResults) {
  if (!value) {
    results.template += ` ${key}`
    return
  }

  const text = value.value
  if (typeof text === 'number') {
    results.template += ` ${key}="${text}"`
  } else {
    results.template += ` ${key}="${text}"`
  }
}

function setAttr(elem: t.Identifier, key: string, value: t.Expression): t.CallExpression {
  return t.callExpression(t.identifier('setAttr'), [
    elem,
    t.stringLiteral(key),
    value
  ])
}
```
