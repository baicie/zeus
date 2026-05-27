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

**建议**：MVP 不支持 spread，检测到时报错或警告。

### 2. Style 内联（370-479 行）

三层处理：

- **层 1 - 静态字符串**：输入 `style="color: red"`，输出直接提取到 template
- **层 2 - 静态对象**：输入 `style=({ opacity: 1 - 0.5 })`（括号内为对象），输出编译期求值 `style="opacity:0.5"`
- **层 3 - 混合对象**：输入 `style=({ width: w(), height: h() })`，输出展开为 `style:width={w()} style:height={h()}`

建议：至少做第一层和第三层，第二层（Babel 求值）可选。

（可选：后续可增加 Babel 求值静态对象）

### 3. classList 展开（481-533 行）

```tsx
classList = { active: isActive(), disabled: false }
```

- `disabled: false` → 丢弃
- `active: isActive()` → 转为 `class:active={isActive()}`

建议：优先级低，MVP 可跳过。

### 4. class / className 合并（536-563 行）

多个 class 属性合并为一个，支持静态拼接和动态表达式合并：

```tsx
<div class="a" className="b" class={c()} />
// → <div class={`a b ${c() || ""}`} />
```

建议：优先级低，MVP 可跳过。

### 5. 属性生成（626-1012 行）——核心

| 条件                      | 输出                             |
| ------------------------- | -------------------------------- |
| `key === "ref"`           | 生成 `use(ref, el)` 调用         |
| `key.startsWith("use:")`  | 特殊指令式属性                   |
| `key === "children"`      | 收集 children                    |
| `key.startsWith("on")`    | 事件绑定                         |
| `key.startsWith("attr:")` | 动态 attribute                   |
| `key.startsWith("bool:")` | 布尔 attribute                   |
| 动态属性（需 effect）     | 加入 `results.dynamics`          |
| 其他静态属性              | 调用 `inlineAttributeOnTemplate` |

### 6. 收尾（1013-1019 行）

```js
if (!hasChildren && children) path.node.children.push(children)
if (spreadExpr) results.exprs.push(spreadExpr)
```

## 事件绑定详解

SolidJS 编译器对事件绑定的处理分为**两种模式**：

### 模式一：普通模式（直接绑定）

```tsx
<button onClick={handleClick}>点击</button>
```

编译后直接调用 `addEventListener`：

```js
button.addEventListener('click', handleClick)
```

编译器代码（element.js 831-871 行）：

```js
results.exprs.unshift(
  t.expressionStatement(
    t.callExpression(
      t.memberExpression(elem, t.identifier('addEventListener')),
      [t.stringLiteral(ev), handler],
    ),
  ),
)
```

### 模式二：委托模式（事件委托）

这是 SolidJS 的**核心优化**。对于高频事件（click、input、keydown 等），不直接在每个元素上绑定，而是**委托到 document**。

```tsx
<button onClick={handleClick}>点击</button>
```

编译后变成**赋值到 DOM 节点属性**：

```js
button['$click'] = handleClick
```

编译器代码（element.js 773-830 行）：

```js
results.exprs.unshift(
  t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(elem, t.identifier(`$$${ev}`)),
      handler,
    ),
  ),
)
```

#### 委托的运行时逻辑

```js
// client.js
export function delegateEvents(eventNames) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set())
  for (const name of eventNames) {
    if (!e.has(name)) {
      e.add(name)
      document.addEventListener(name, eventHandler)
    }
  }
}

// 事件处理器，从 e.target 往上遍历
function eventHandler(e) {
  let node = e.target
  const key = `$$${e.type}`

  while (node) {
    const handler = node[key]
    if (handler && !node.disabled) {
      const data = node[`${key}Data`]
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e)
      if (e.cancelBubble) return
    }
    node = node.parentNode
  }
}
```

#### 委托事件列表

```js
const DelegatedEvents = new Set([
  'beforeinput',
  'click',
  'dblclick',
  'contextmenu',
  'focusin',
  'focusout',
  'input',
  'keydown',
  'keyup',
  'mousedown',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pointerdown',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'touchend',
])
```

#### 其他事件语法

| 语法                   | 效果                                   |
| ---------------------- | -------------------------------------- |
| `on:click={fn}`        | 强制用 `addEventListener`（不走委托）  |
| `oncapture:click={fn}` | 捕获阶段监听                           |
| `onClick={[fn, data]}` | 委托模式，handler 接收 `[data, event]` |

### Zeus 事件绑定最小实现

MVP 阶段先用普通模式，事件委托作为后续优化：

```ts
function toEventName(name: string): string {
  return name.slice(2).toLowerCase()
}

if (key.startsWith('on') && key.length > 2) {
  const eventName = toEventName(key)
  results.exprs.push(
    t.expressionStatement(
      t.callExpression(
        t.memberExpression(results.id!, t.identifier('addEventListener')),
        [t.stringLiteral(eventName), expr],
      ),
    ),
  )
}
```

## 当前实现状态

已实现，与 dom-expressions 的普通模式一致：

```ts
// 事件绑定 onClick onInput ...
if (key.startsWith('on') && key.length > 2) {
  const eventName = key[2].toLowerCase() + key.slice(3)
  results.exprs.push(
    t.expressionStatement(
      t.callExpression(
        t.memberExpression(results.id!, t.identifier('addEventListener')),
        [t.stringLiteral(eventName), expr],
      ),
    ),
  )
}
```

对应源码：`packages/compiler/src/element.ts` transformAttributes 函数。

## 后续优化方向

- [ ] **事件委托**：参考上方"模式二：委托模式"，将高频事件统一委托到 document
- [ ] `on:click={fn}` 语法支持
- [ ] `oncapture:click={fn}` 语法支持
- [ ] `[fn, data]` 数组形式支持

## 不做

- **Spread 展开**（`{...props}`）
- **event delegation**（事件委托优化）
- **effect wrapper**（响应式属性包装）
- **hydratable 相关处理**
- **SVG namespace 特殊处理**（可在 codegen 阶段处理）

## 最小可实现版本

```ts
import * as t from '@babel/types'

function toEventName(name: string): string {
  return name.slice(2).toLowerCase()
}

export function transformAttributes(
  path: BabelJSXElementPath,
  results: TransformResults,
) {
  path
    .get('openingElement')
    .get('attributes')
    .forEach(attr => {
      const node = attr.node
      if (!node.name) return

      const key = node.name.name
      const value = node.value

      if (t.isJSXExpressionContainer(value)) {
        const expr = value.expression

        // 事件绑定 onClick onInput ...
        if (key.startsWith('on') && key.length > 2) {
          const eventName = toEventName(key)
          results.exprs.push(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  results.id!,
                  t.identifier('addEventListener'),
                ),
                [t.stringLiteral(eventName), expr],
              ),
            ),
          )
          return
        }

        // 其他动态属性 → setAttr
        results.exprs.push(
          t.expressionStatement(setAttr(results.id!, key, expr)),
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
function inlineAttributeOnTemplate(
  key: string,
  value: BabelNode,
  results: TransformResults,
) {
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

function setAttr(
  elem: t.Identifier,
  key: string,
  value: t.Expression,
): t.CallExpression {
  return t.callExpression(t.identifier('setAttr'), [
    elem,
    t.stringLiteral(key),
    value,
  ])
}
```
