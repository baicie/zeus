你这里的 “meat” 我按 **meta 信息** 理解。

我的结论是：

```txt id="b85ex4"
defineElement：负责“定义/注册 Web Component + 提供结构化 meta 源”
Host：负责“组件模板内部对宿主元素的渲染期控制”
```

不建议回到“只靠 Host 定义 Web Component”的方案。更推荐：

```tsx id="nm3sjk"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,
    props: { ... },
    meta: { ... },
  },
  props => {
    return (
      <Host data-state={props.disabled ? 'disabled' : 'enabled'}>
        <button part="root">
          <Slot />
        </button>
      </Host>
    )
  },
)
```

也就是：**defineElement 是组件声明入口，Host 是模板里的宿主节点操作入口。**

---

## 先看当前实现状态

当前 `runtime-dom` 已经同时导出了 `defineElement`、`Host`、`Slot`、`createSlot`、hostContext 等能力。

但现在的 `Host` 实现其实非常轻：

```ts id="8kxe0u"
export function Host(props: HostProps): JSXValue {
  return resolveValue(props.children)
}
```

它目前只是把 children 解出来，并没有真的负责注册 custom element，也没有管理 props、attribute、生命周期。

而真正管理 Web Component 的是 `defineElement`：

```txt id="7c8zkl"
tagName
props
shadow
styles
consumes
connectedCallback
disconnectedCallback
attributeChangedCallback
property setter
CustomEvent emit
customElements.define
```

这些都已经在当前 `defineElement` 里实现了。

Slot 则是依赖 hostContext 工作：shadow 模式下生成原生 `<slot>`，light 模式下从 captured light children 里找匹配节点。

所以当前代码天然更偏向：

```txt id="26ez4e"
defineElement = Web Component 定义器
Host / Slot = Web Component 模板辅助组件
```

---

# 一、Host 定义 Web Component 的方案

你之前的想法大概是这种：

```tsx id="9oy5k0"
export function Button(props: ButtonProps) {
  return (
    <Host
      tag="z-button"
      shadow
      props={{
        type: String,
        disabled: Boolean,
      }}
    >
      <button>
        <Slot />
      </button>
    </Host>
  )
}
```

或者：

```tsx id="ecgxgf"
export const Button = () => (
  <Host as="z-button">
    ...
  </Host>
)
```

这种方案的优点是：**声明看起来更 JSX 化，更像“组件即模板”。**

### 优点

```txt id="0ytbxz"
1. 写法统一，用户只写 JSX
2. Host 可以自然表达宿主节点状态，比如 data-state、class、style
3. 编译器可以从 JSX 里分析 Slot、part、data-state、aria 等信息
4. 对 headless/shadcn-like 风格比较友好
```

比如：

```tsx id="lyr0fs"
<Host data-state={props.open ? 'open' : 'closed'}>
  <button part="trigger">
    <Slot name="trigger" />
  </button>
  <div part="content">
    <Slot />
  </div>
</Host>
```

这非常适合表达 headless 组件里的宿主状态。

### 缺点

但是如果让 Host 直接负责“定义 Web Component”，问题会很多：

#### 1. 语义混乱

`Host` 在 JSX 里看起来是一个组件，但 Web Component 注册是模块级副作用：

```ts id="9fw5al"
customElements.define('z-button', ...)
```

这两个语义不是一个层级。

JSX 的 `<Host />` 是运行时渲染语义，而 `customElements.define()` 是模块加载时的注册语义。

如果通过 `<Host tag="z-button" />` 定义组件，编译器就必须做很强的魔法：

```txt id="p24nf4"
发现 Host
  ↓
判断这是 Web Component 定义，不是普通 Host 使用
  ↓
把它提升到模块级
  ↓
生成 customElements.define
```

这会让代码含义变得隐式。

#### 2. 生命周期边界不清楚

Web Component 需要：

```txt id="d6i6hm"
connectedCallback
disconnectedCallback
attributeChangedCallback
observedAttributes
property setter
context bridge
style mount
slot capture
```

这些都是 class-level / element-level 逻辑。

如果只靠 `<Host />`，这些逻辑要么藏在编译器里，要么藏在 Host runtime 里，都会变得不直观。

当前 `defineElement` 已经明确处理了这些生命周期，包括 connected 时 render、disconnected 时 dispose、attributeChangedCallback 更新 props。

#### 3. meta 不够结构化

如果从 Host JSX 里抽 meta，很多信息会变成启发式推断：

```tsx id="3h2pud"
<Host data-state={open() ? 'open' : 'closed'}>
```

你可以推断出有 `data-state`，但很难稳定推断出：

```txt id="osz6id"
data-state 可选值有哪些
事件 detail 类型是什么
props default 是什么
attribute 是否 reflect
object prop 是否 attr:false
```

最终还是要补一堆配置。

#### 4. 多输出插件更难做

React/Vue wrapper 生成需要的是一个稳定的 ComponentManifest：

```ts id="6e2x4j"
{
  tag: 'z-button',
  props: {...},
  events: {...},
  slots: {...}
}
```

`defineElement('z-button', options, setup)` 天然能抽这个 manifest。

而 `<Host tag="z-button" />` 如果藏在 render 里，分析成本更高，还要判断它是不是定义入口。

---

# 二、defineElement 方案

当前方案是：

```tsx id="dj7a2p"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,
    props: {
      type: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
  },
  (props, { emit }) => {
    return (
      <button
        disabled={props.disabled}
        onClick={() => emit('change', { value: true })}
      >
        <Slot />
      </button>
    )
  },
)
```

### 优点

#### 1. 组件定义边界清晰

```txt id="39j3mx"
defineElement(tag, options, setup)
```

这个 API 天然说明：

```txt id="buk57y"
我要定义一个 Custom Element
tag 是什么
props 是什么
shadow 怎么处理
setup 怎么渲染
```

这比 `<Host tag="z-button" />` 更明确。

#### 2. meta 信息天然结构化

`options.props` 可以直接抽：

```ts id="di473f"
props: {
  disabled: {
    type: Boolean,
    default: false,
    reflect: true,
  },
}
```

得到：

```json id="8ok3bi"
{
  "disabled": {
    "type": "boolean",
    "default": false,
    "reflect": true
  }
}
```

TypeScript 泛型可以抽 props 类型：

```ts id="axafaa"
interface ButtonProps {
  type?: 'default' | 'primary' | 'danger'
}
```

得到：

```json id="yg4p9q"
{
  "type": {
    "type": "string",
    "values": ["default", "primary", "danger"],
    "required": false
  }
}
```

#### 3. runtime 已经完成大半

当前 `defineElement` 已经做了：

```txt id="eikpjn"
props default
property accessor
attribute sync
shadow / light render target
CustomEvent emit
styles mount
customElements.define 防重复注册
```

这些对组件库都是必要能力。 

#### 4. 适合多输出

Component analyzer 可以直接扫描：

```txt id="0ncw7u"
defineElement<Props>('z-button', options, setup)
```

然后生成：

```txt id="8alpf9"
dist/wc
dist/react
dist/vue
dist/custom-elements.json
dist/*.d.ts
```

这个比扫描 Host 稳定。

### 缺点

#### 1. 模板表达不如 Host 直观

比如想表达宿主节点状态：

```html id="kjv4pd"
<z-dialog data-state="open">
```

如果只用 defineElement，用户可能得手动写：

```ts id="2ngwm4"
context.host.dataset.state = props.open ? 'open' : 'closed'
```

这不优雅。

#### 2. props 类型和 runtime props 可能重复

```ts id="ljgc1r"
interface ButtonProps {
  disabled?: boolean
}

props: {
  disabled: Boolean
}
```

这里会有一定重复。

但这个重复不是坏事，因为：

```txt id="6s7ys0"
TypeScript Props：给类型系统和 wrapper dts 用
runtime props：给 attribute/property/default/reflect 用
```

二者关注点不一样。

可以通过 analyzer 合并，不要求用户写独立 `.meta.ts`。

---

# 三、我建议的最终方案：defineElement + 增强 Host

不要让 Host 负责定义 Web Component。

应该让它负责 **操作当前 Web Component 的宿主元素**。

也就是：

```tsx id="8o0mip"
export const ZDialog = defineElement<DialogProps>(
  'z-dialog',
  {
    shadow: false,
    props: {
      open: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
    meta: {
      description: 'Headless dialog component',
    },
  },
  props => {
    return (
      <Host
        data-state={props.open ? 'open' : 'closed'}
        data-open={props.open ? '' : undefined}
      >
        <div part="overlay">
          <Slot name="overlay" />
        </div>

        <div part="content">
          <Slot />
        </div>
      </Host>
    )
  },
)
```

这里：

```txt id="g42khu"
defineElement 负责定义 z-dialog
Host 负责把 data-state 等状态同步到 <z-dialog> 宿主元素
Slot 负责内容分发
```

这就非常适合你的最终目标：**headless + shadcn-like 封装**。

---

# 四、Host 应该怎么增强

当前 Host 只是返回 children。

可以把它增强成：

```ts id="t3q1nh"
export interface HostProps {
  children?: JSXValue | (() => JSXValue)
  class?: ClassValue
  className?: ClassValue
  style?: StyleValue
  part?: string
  role?: string
  id?: string

  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}
```

实现思路：

```ts id="2pr6z4"
export function Host(props: HostProps): JSXValue {
  const context = getCurrentHostContext()

  if (context) {
    bindHostProps(context.host, props)
  }

  return resolveValue(props.children)
}
```

伪代码：

```ts id="yoy5ex"
function bindHostProps(host: HTMLElement, props: HostProps) {
  for (const key in props) {
    if (key === 'children') continue

    const value = props[key]

    if (key === 'className') {
      bindClass(host, () => value)
      continue
    }

    if (key === 'style') {
      bindStyle(host, () => value)
      continue
    }

    bindAttr(host, key, () => value)
  }
}
```

这样用户就可以写：

```tsx id="62iq6z"
<Host
  data-state={props.open ? 'open' : 'closed'}
  aria-disabled={props.disabled}
>
  <Slot />
</Host>
```

最终落到宿主元素：

```html id="c8u4dk"
<z-dialog data-state="open"></z-dialog>
```

---

# 五、meta 信息应该怎么处理

推荐不要单独强制写 `.meta.ts`，而是做 **自动抽取 + options.meta 补充**。

## 信息来源优先级

```txt id="8f6ku2"
1. defineElement 调用本身
2. options.props
3. TypeScript Props 类型
4. setup 里的 emit()
5. JSX 里的 Slot / Host / part / data-state
6. options.meta 显式补充
```

## defineElement 自动抽取

从这里：

```tsx id="2fv7eq"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,
    props: {
      type: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: Boolean,
    },
    meta: {
      description: 'Button primitive',
    },
  },
  (props, { emit }) => {
    return (
      <Host data-disabled={props.disabled ? '' : undefined}>
        <button
          part="root"
          onClick={() => emit('change', { value: true })}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

抽出：

```json id="fjow1d"
{
  "tag": "z-button",
  "name": "ZButton",
  "props": {
    "type": {
      "type": "string",
      "default": "default",
      "reflect": true
    },
    "disabled": {
      "type": "boolean"
    }
  },
  "events": {
    "change": {
      "detail": {
        "value": "boolean"
      }
    }
  },
  "slots": {
    "default": {}
  },
  "cssParts": ["root"],
  "hostAttributes": ["data-disabled"],
  "description": "Button primitive"
}
```

## options.meta 只补充难推导信息

比如：

```tsx id="spgem0"
meta: {
  description: 'Button primitive',

  events: {
    change: {
      detail: {
        value: 'boolean',
      },
    },
  },

  slots: {
    default: {
      description: 'button content',
    },
  },

  cssVars: ['--z-button-bg', '--z-button-color'],
}
```

不要重复写 props。

---

# 六、Host 方案和 defineElement 方案对比

| 维度                    | Host 定义 Web Component | defineElement 定义 Web Component |
| --------------------- | --------------------- | ------------------------------ |
| 定义边界                  | 隐式，藏在 JSX 里           | 显式，模块级 API                     |
| 生命周期                  | 需要编译器魔法               | API 自然承载                       |
| customElements.define | 不直观                   | 明确                             |
| props meta            | 需要推断                  | options.props 天然结构化            |
| TypeScript props      | 可以推断，但入口不清晰           | 泛型参数清晰                         |
| events                | 需要扫描 emit             | 也需要扫描 emit，可配 meta             |
| slots                 | 扫 `<Slot />` 很自然      | 同样自然                           |
| host attrs            | 很自然                   | 需要增强 Host 后也自然                 |
| wrapper 生成            | 分析成本高                 | 分析成本低                          |
| shadcn-like           | 模板体验好                 | 配合 Host 后同样好                   |
| 推荐定位                  | 渲染期宿主操作               | 组件定义与注册                        |

所以我的建议是：

```txt id="6v1ddj"
不要用 Host 替代 defineElement
而是让 Host 成为 defineElement setup 内部的宿主控制组件
```

---

# 七、最终推荐 API 形态

## Headless 组件写法

```tsx id="gvqf4d"
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,

    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      size: {
        type: String,
        default: 'md',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless button primitive',
      events: {
        press: {
          detail: {
            nativeEvent: 'MouseEvent',
          },
        },
      },
      slots: {
        default: {
          description: 'Button content',
        },
      },
    },
  },

  (props, { emit }) => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-size={props.size}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          disabled={props.disabled}
          onClick={event => {
            if (props.disabled) return
            emit('press', { nativeEvent: event })
          }}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

然后 React shadcn-like 封装：

```tsx id="7ujgh7"
import { ZButton } from '@zeus-ui/headless/react'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}) {
  return (
    <ZButton
      variant={variant}
      size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
```

Vue shadcn-like 封装：

```vue id="0m5ckm"
<script setup lang="ts">
import { ZButton } from '@zeus-ui/headless/vue'
import { buttonVariants } from './button-variants'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'outline' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    variant: 'default',
    size: 'md',
  },
)
</script>

<template>
  <ZButton :class="buttonVariants(props)">
    <slot />
  </ZButton>
</template>
```

---

# 八、编译器怎么处理 meta

建议新增：

```txt id="b83tbs"
packages/component-analyzer
```

职责：

```txt id="e9i7lv"
扫描 defineElement
生成 ComponentManifest
不负责 JSX 编译
不负责输出 React/Vue
```

输出：

```ts id="78jjy8"
export interface ComponentRecord {
  tag: string
  name: string
  source: string
  exportName: string

  props: Record<string, ComponentProp>
  events: Record<string, ComponentEvent>
  slots: Record<string, ComponentSlot>

  hostAttributes?: string[]
  cssParts?: string[]
  cssVars?: string[]

  meta?: Record<string, unknown>
}
```

然后：

```txt id="44pzje"
addons/output-wc            消费 ComponentManifest
addons/output-react-wrapper 消费 ComponentManifest
addons/output-vue-wrapper   消费 ComponentManifest
addons/output-docs          消费 ComponentManifest
```

这样 meta 是中间产物，不需要用户手写重复声明。

---

# 九、什么时候还需要独立 meta 文件？

只作为兜底：

```txt id="hv46m2"
1. 组件不是 defineElement 写的
2. props/event 过于动态，无法静态分析
3. 第三方 Web Component 想纳入输出体系
4. 文档信息非常多，不想塞进源码
```

比如：

```txt id="orpmz0"
z-button.meta.ts
```

可以作为 override，而不是主路径。

优先级：

```txt id="a5az42"
defineElement 自动抽取
  +
options.meta 补充
  +
外部 meta override
```

---

# 最终判断

你之前的 Host 方案不是错，它更适合表达：

```txt id="4swx2s"
宿主元素状态
data-state
aria
class
style
headless DOM 结构
slot 组织
```

但它不适合承担：

```txt id="86k3v9"
customElements.define
observedAttributes
attributeChangedCallback
props default
property setter
lifecycle cleanup
ComponentManifest 主声明
```

所以最终最稳的架构是：

```txt id="a1v9dg"
defineElement = Web Component 定义层
Host = 宿主元素渲染控制层
Slot = 内容分发层
component-analyzer = meta 抽取层
output plugins = React/Vue/WC/DTS 输出层
```

这样既保留了 `defineElement` 的结构化、可分析、易多输出优势，也把你最初 Host 方案里对 headless/shadcn-like 很有价值的部分保留下来了。
