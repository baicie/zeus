# transformChildren

**源文件**: `vendor/dom-expressions/.../src/dom/element.js` 第 1039-1270+ 行

## 功能概述

处理 JSX 元素的子节点，递归调用 `transformNode` 转换每个子节点，合并子节点的 template 和 expressions 到 results 中。

## 核心逻辑

```js
function transformChildren(path, results, config) {
  const filteredChildren = filterChildren(path.get("children"))
  const lastElement = findLastElement(filteredChildren, config.hydratable)

  const childNodes = filteredChildren.reduce((memo, child, index) => {
    const transformed = transformNode(child, {
      toBeClosed: results.toBeClosed,
      lastElement: index === lastElement,
      skipId: !results.id || !detectExpressions(filteredChildren, index, config)
    })
    // 合并到 memo
    return memo
  }, [])

  childNodes.forEach(child => {
    // 合并 child 的 template / declarations / exprs / dynamics
    results.template += child.template
    results.declarations.push(...child.declarations)
    results.exprs.push(...child.exprs)
    results.dynamics.push(...child.dynamics)
  })
}
```

## 分块结构

### 1. 过滤子节点（filterChildren）

去除空白 JSXText、合并相邻文本节点等。

**Zeus 建议**：MVP 可以先不过滤，简单遍历所有 children。

### 2. 查找最后一个元素（findLastElement）

判断哪个子元素是最后一个，用于精细化闭合标签优化。

**Zeus 建议**：MVP 不需要，闭合所有标签即可。

### 3. 递归转换（transformNode）

对每个子节点调用 `transformNode`，如果是 JSXElement 则继续递归处理。

**Zeus 建议**：必须做。

### 4. 合并结果

将子节点的 template、declarations、exprs、dynamics 合并到父 results 中。

**Zeus 建议**：必须做。

### 5. 兄弟节点链（nextSibling）

为每个子节点生成 `nextSibling` 访问路径，用于运行时定位 DOM 节点：

```js
results.declarations.push(
  t.variableDeclarator(
    child.id,
    t.memberExpression(
      tempPath === results.id.name
        ? t.identifier(tempPath)
        : t.identifier(tempPath),
      t.identifier(i === 0 ? "firstChild" : "nextSibling")
    )
  )
)
```

**Zeus 建议**：必须做，但可以简化。

## 不做

- **Fragment 处理**（`child.isJSXFragment()` 报错）
- **hydratable 模式**（SSR 水合相关）
- **head 标签特殊处理**（NoHydration 组件）
- **精细化 lastElement 判断**（闭合标签优化）
- **html 标签 getNextMatch**（水合定位）

## 辅助函数

### findLastElement（1021-1037 行）

在子节点数组中从后往前找最后一个"有效元素"，用于 omitLastClosingTag 优化。

**Zeus 建议**：MVP 不需要。

## 最小可实现版本

```ts
export function transformChildren(path: BabelJSXElementPath, results: TransformResults) {
  const children = path.get('children')
  let tempPath = results.id?.name

  children.forEach((child, i) => {
    const transformed = transformNode(child, {
      skipId: !results.id
    })

    if (!transformed) return

    // 合并 template
    results.template += transformed.template
    results.templateWithClosingTags += transformed.templateWithClosingTags

    // 合并 declarations
    if (transformed.id) {
      results.declarations.push(
        t.variableDeclarator(
          transformed.id,
          t.memberExpression(
            tempPath ? t.identifier(tempPath) : results.id!,
            t.identifier(i === 0 ? 'firstChild' : 'nextSibling')
          )
        )
      )
      tempPath = transformed.id.name
    }

    results.declarations.push(...transformed.declarations)
    results.exprs.push(...transformed.exprs)
    results.dynamics.push(...transformed.dynamics)
    results.postExprs.push(...transformed.postExprs)
  })
}
```

## 配合的 transformNode

```ts
export function transformNode(path: BabelJSXPath, options: TransformOptions): TransformResults | undefined {
  if (isJSXElementPath(path)) {
    return transformElement(path, options)
  }
  // Fragment / Text 等暂不支持
  return undefined
}
```
