# Zeus Runtime

Zeus 框架的运行时核心，提供响应式系统和 DOM 操作工具。

## 功能特性

- ✅ **响应式系统**: 基于 `alien-signals` 的响应式状态管理
- ✅ **DOM 操作工具**: 完整的 DOM 创建、操作和挂载 API
- ✅ **类型安全**: 完整的 TypeScript 类型定义

## 核心 API

### DOM 创建

```typescript
import { createElement, createText, createFragment } from '@zeus/runtime'

// 创建元素
const button = createElement(
  'button',
  {
    type: 'button',
    class: 'btn btn-primary',
    disabled: false,
  },
  'Click me'
)

// 创建文本节点
const text = createText('Hello World')

// 创建文档片段
const fragment = createFragment(
  createElement('div', {}, 'Item 1'),
  createElement('div', {}, 'Item 2')
)
```

### 属性操作

```typescript
import { setAttr, getAttr, removeAttr, hasAttr } from '@zeus/runtime'

const div = createElement('div')

// 设置属性
setAttr(div, 'id', 'my-div')
setAttr(div, 'hidden', true) // 布尔属性

// 获取属性
const id = getAttr(div, 'id') // "my-div"

// 检查属性
const hasId = hasAttr(div, 'id') // true

// 移除属性
removeAttr(div, 'id')
```

### 文本操作

```typescript
import { setText, insertText } from '@zeus/runtime'

const div = createElement('div')

// 设置文本内容
setText(div, 'Hello World')

// 插入文本到指定位置
insertText(div, 'New text', 0) // 插入到开头
```

### 挂载和卸载

```typescript
import { mount, unmount, clear } from '@zeus/runtime'

const container = createElement('div')
const child = createElement('span', {}, 'Child')

// 挂载节点
mount(container, child)

// 卸载节点
unmount(child)

// 清空容器
clear(container)
```

### 事件处理

```typescript
import { addEventListener, delegateEvent } from '@zeus/runtime'

const button = createElement('button', {}, 'Click me')

// 添加事件监听器
addEventListener(button, 'click', event => {
  console.log('Button clicked!')
})

// 事件委托
const container = createElement('div')
const cleanup = delegateEvent(container, '.btn', 'click', event => {
  console.log('Button clicked via delegation')
})

// 清理事件监听器
cleanup()
```

### 节点操作

```typescript
import { replace, insertBefore, insertAfter } from '@zeus/runtime'

const oldNode = createElement('div', {}, 'Old')
const newNode = createElement('div', {}, 'New')
const reference = createElement('span', {}, 'Reference')

// 替换节点
replace(oldNode, newNode)

// 在参考节点前插入
insertBefore(reference, newNode)

// 在参考节点后插入
insertAfter(reference, newNode)
```

## 响应式系统

```typescript
import { signal, computed, effect } from '@zeus/runtime'

// 创建响应式状态
const count = signal(0)
const doubled = computed(() => count.value * 2)

// 响应式副作用
effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`)
})

// 更新状态
count.value = 5 // 输出: Count: 5, Doubled: 10
```

## 使用示例

查看 `src/example.ts` 文件获取更多详细的使用示例，包括：

- 创建简单按钮
- 交互式组件
- 复杂嵌套结构
- 事件委托
- 动态属性操作
- 完整的计数器组件

## 类型定义

```typescript
// 基础类型
export type DOMNode = Element | Text | DocumentFragment
export type DOMElement = Element
export type DOMText = Text

// 属性类型
export type Attrs = Record<string, string | number | boolean | null | undefined>

// 事件处理器类型
export type EventHandler = (event: Event) => void
```

## 安装

```bash
npm install @zeus/runtime
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 测试
npm test
```
