# transformElement

**源文件**: `vendor/dom-expressions/.../src/dom/element.js` 第 62-205 行

## 功能概述

处理单个 JSX 元素，生成 DOM 编译结果，包括标签名、属性、子节点等。

## 必须做

- 解析 `tagName`（标签名）
- 识别 `voidTag`（自闭合标签）
- 初始化 `results` 对象（template、declarations、exprs、dynamics 等）
- 调用 `transformAttributes` 处理属性
- 调用 `transformChildren` 处理子节点
- 拼接闭合标签

## 可参考

| 功能 | 说明 |
|---|---|
| `evaluateAndInline` 常量折叠 | 对属性值做编译期求值，减少运行时计算 |
| SVG 包裹逻辑 | 当内部元素是 SVG 标签时自动包裹 `<svg>` |
| voidTag 识别 | 使用 `VoidElements` 集合判断 |
| `isCustomElement` 检测 | 通过标签名含 `-` 判断 |
| `isImportNode` 检测 | `img`/`iframe` 的 `loading` 属性 |
| 多个 `class` 合并 | 合并静态 class 并拼接动态表达式 |

## 不做

- **`data-hk` 校验**：SSR 水合相关，Zeus 无水合
- **hydratable 模式**：`html`/`head`/`body` 特殊处理
- **`runHydrationEvents`**：水合事件运行
- **精细化闭合标签优化**：lastElement / omitLastClosingTag 判断

## 最小可实现版本

```ts
import * as t from '@babel/types'
import { VoidElements } from './constant'

export function transformElement(path: BabelJSXElementPath, state: BabelState) {
  const tagName = getTagName(path.node)
  const voidTag = VoidElements.includes(tagName)

  const results = {
    template: `<${tagName}`,
    templateWithClosingTags: `<${tagName}`,
    declarations: [] as t.Statement[],
    exprs: [] as t.Statement[],
    dynamics: [] as t.Statement[],
    postExprs: [] as t.Statement[],
    tagName,
    renderer: 'dom',
  }

  transformAttributes(path, results)

  results.template += '>'
  results.templateWithClosingTags += '>'

  if (!voidTag) {
    transformChildren(path, results)
    results.template += `</${tagName}>`
    results.templateWithClosingTags += `</${tagName}>`
  }

  return results
}
```
