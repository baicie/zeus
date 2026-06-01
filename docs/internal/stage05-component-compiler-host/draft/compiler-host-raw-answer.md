## 1. 分支名称

建议这次迭代用：

```bash id="8kvjlh"
feat/component-compiler-host
```

这个名字比 `feat/web-component-compiler` 更准确，因为这轮核心不是单纯做 Web Component，而是做：

```txt id="0b8y3o"
组件分析
Component Manifest
Rollup / Vite / Rolldown 插件宿主
多输出插件机制
Web Component / React / Vue 输出
Headless 组件底座验证
```

后续可以拆子分支：

```bash id="dl4jvb"
feat/component-manifest
feat/output-wc
feat/output-react-wrapper
feat/output-vue-wrapper
feat/headless-components
```

但主迭代分支我推荐：

```bash id="84izpj"
feat/component-compiler-host
```

---

## 2. 跨框架 Web Component 编译需要注意哪些

核心原则是：**React / Vue 不重新实现组件，只做 wrapper；真实逻辑只在 Zeus Web Component 里。**

需要重点注意这些点：

### props / attributes / properties

简单值可以走 attribute：

```html id="6vjh1w"
<z-button type="primary" disabled></z-button>
```

复杂值必须走 property：

```tsx id="ivma0w"
<ZTable columns={columns} data={data} />
```

不要让 object / array 走 attribute，否则容易变成：

```html id="3k44am"
<z-table columns="[object Object]"></z-table>
```

当前 `defineElement` 已经支持 `String / Number / Boolean / Object / Array`，也支持 `attr / reflect / default`。
但组件库规范里建议：

```ts id="lnjqbu"
columns: {
  type: Array,
  attr: false,
}
```

复杂数据只走 property。

### React 事件不要依赖合成事件

Web Component 事件应该统一用：

```ts id="dy6ai4"
el.addEventListener('change', handler)
```

而不是指望：

```tsx id="phj2id"
<z-button onChange={...} />
```

当前 `defineElement` 的 `emit` 已经会派发 `CustomEvent`，并且默认 `bubbles / composed / cancelable` 都是 true。
React wrapper 应该把它映射成：

```tsx id="1efie1"
<ZButton onChange={event => event.detail} />
```

### Vue wrapper 要处理 props + emits

Vue 可以自然消费自定义元素，但为了类型和 DX，仍然建议生成 wrapper：

```vue id="2vqxrt"
<ZButton type="primary" @change="handleChange" />
```

底层仍然是：

```html id="zae7ip"
<z-button type="primary"></z-button>
```

### Slot 语义要统一

Web Component 原生 slot 和 React/Vue children 有差异。

当前 Zeus 已经有 `Slot` 和 `createSlot`，并且会根据 shadow/light 模式处理 slot。

建议约定：

```tsx id="yr7b0b"
<Slot />
<Slot name="prefix" />
<Slot name="suffix" />
```

React wrapper 可以把命名 slot 映射成 prop：

```tsx id="i5feym"
<ZInput prefix={<IconSearch />} suffix={<ClearButton />} />
```

最终生成：

```html id="dtfjou"
<z-input>
  <span slot="prefix">...</span>
  <span slot="suffix">...</span>
</z-input>
```

Vue wrapper 可以走原生 slot：

```vue id="eslbpk"
<ZInput>
  <template #prefix>
    <IconSearch />
  </template>
</ZInput>
```

### 样式穿透与主题系统

如果使用 Shadow DOM，就不要指望外部 class 随便穿进去。

组件库要预留：

```txt id="yc8z06"
CSS Variables
::part()
data-state
data-disabled
data-size
data-variant
```

例如：

```css id="674yet"
z-button {
  --z-button-bg: black;
  --z-button-color: white;
}

z-button::part(root) {
  border-radius: 8px;
}
```

如果最终要做 shadcn-like，建议 headless 组件默认尽量 **少用 Shadow DOM**，或者提供：

```ts id="85rwb5"
shadow: false
```

因为 shadcn UI 的核心是“用户能直接改 class / 改结构 / 改样式”。

### customElements.define 是副作用

当前 `defineElement` 内部会执行：

```ts id="gcruws"
customElements.define(tagName, ZeusElement)
```

且已有重复注册保护。

所以 Web Component 注册文件不能被 tree-shaking 删除。组件库包不能简单写：

```json id="nzm5z9"
{
  "sideEffects": false
}
```

而应该写：

```json id="v5qdxh"
{
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "**/*.css"]
}
```

---

## 3. 只使用一个组件，会不会因为 runtime 体积过大有影响？

**会有一点影响，尤其是只用一个 Icon 或 Button 时。**

因为哪怕只用一个组件，也至少需要：

```txt id="x52twa"
@zeus-js/signal
@zeus-js/runtime-dom
组件自身代码
```

你之前的 size report 里，`runtime-dom` gzip 大约 9KB，`signal` gzip 大约 6KB。只用一个极小组件时，这个成本会显得偏高。

但不一定是问题，关键看你怎么设计输出模式。

建议做三种模式：

### 模式 1：library mode，默认推荐

runtime 作为 external / peer dependency。

```txt id="a9fvm3"
用户 app 只安装一份 @zeus-js/runtime-dom
所有组件共享这一份 runtime
```

适合组件库。

### 模式 2：standalone mode

把 runtime 打进组件里：

```txt id="798izb"
dist/standalone/z-button.js
```

适合 CDN、低心智成本使用，但体积更大。

### 模式 3：static / no-reactive mode

针对 icon 这类静态组件，允许输出无 Zeus runtime 的版本。

例如：

```txt id="u0z2mu"
<z-icon name="home" />
```

如果只是静态 SVG，没必要引入完整 signal/runtime-dom。

可以设计 compiler 输出：

```ts id="ak1r63"
outputIcons({
  mode: 'static-custom-element',
})
```

这样 icon 库不会被 runtime 体积拖累。

### 最终建议

```txt id="2q6x20"
Button / Dialog / Select 这类交互组件：用 Zeus runtime
Icon / Divider / Skeleton 这类静态组件：允许 no-runtime 输出
```

---

## 4. 如何做性能基准测试

当前根目录已经有 `test:benchs` 和 `size` 脚本，可以直接接入。

建议分四类 benchmark。

### A. 编译期 benchmark

测试：

```txt id="nbtohz"
100 个组件扫描 defineElement 耗时
1000 个组件扫描耗时
生成 React wrapper 耗时
生成 Vue wrapper 耗时
生成 custom-elements.json 耗时
```

示例：

```ts id="gm0za1"
// packages/compiler/__benchs__/component-manifest.bench.ts

import { bench, describe } from 'vitest'
import { extractComponentManifest } from '../src/component-manifest'

describe('component manifest extraction', () => {
  bench('extract 100 components', () => {
    extractComponentManifest(generateComponents(100))
  })

  bench('extract 1000 components', () => {
    extractComponentManifest(generateComponents(1000))
  })
})
```

### B. runtime benchmark

测试：

```txt id="4j3fx8"
customElements.define 注册 100/1000 个组件
mount 1000 个 z-button
prop 更新 10000 次
CustomEvent dispatch 10000 次
Slot 渲染 1000 次
unmount cleanup
```

### C. framework wrapper benchmark

React：

```txt id="nkv1oe"
mount 1000 个 ZButton
更新 1000 个 disabled
触发 1000 个 onChange
```

Vue 同理。

这里重点看 wrapper 是否引入额外性能损耗。

### D. bundle size benchmark

输出矩阵：

```txt id="9ruraz"
只用 z-button
只用 z-icon
使用 button + input + dialog
使用 20 个组件
使用 100 个 icon
runtime external
runtime bundled
```

建议输出：

```txt id="cc537t"
raw
gzip
brotli
runtime 占比
component code 占比
wrapper code 占比
```

你当前根目录已经有 `size` / `size:ci`，可以扩展成组件库 size report。

---

## 5. 编译器架构方面怎么做

不要把所有东西塞进 `@zeus-js/compiler`。

当前 `@zeus-js/compiler` 适合继续保持单文件 JSX 编译职责。它现在的核心流程是：

```txt id="7y5sje"
JSX
  ↓
lowerJSX
  ↓
normalizeChildren
  ↓
assignDomPaths
  ↓
assignPhysicalDomPaths
  ↓
analyzeBindings
  ↓
collectTemplates
  ↓
emitDOM
```

这个流程已经清晰，不应该被多输出 wrapper 逻辑污染。

建议新架构：

```txt id="6zgguo"
@zeus-js/compiler
  只做 JSX -> runtime-dom

@zeus-js/component-analyzer
  扫描 defineElement，生成 ComponentManifest

@zeus-js/bundler-plugin
  Rollup/Vite/Rolldown 插件宿主

@zeus-js/output-wc
  输出 Web Component 入口

@zeus-js/output-react-wrapper
  输出 React wrapper + d.ts

@zeus-js/output-vue-wrapper
  输出 Vue wrapper + d.ts

@zeus-js/output-theme
  可选：输出主题 token / CSS vars

@zeus-js/output-docs
  可选：输出 custom-elements.json / docs data
```

在仓库里建议这样放：

```txt id="eet81f"
addons/
  bundler-plugin/
  output-wc/
  output-react-wrapper/
  output-vue-wrapper/

packages/
  component-analyzer/
  headless/
```

因为当前 workspace 和构建脚本都已经支持 `packages/*` 和 `addons/*`。

### 数据流

```txt id="foygcb"
source files
  ↓
bundler-plugin buildStart
  ↓
component-analyzer 扫 defineElement
  ↓
ComponentManifest
  ↓
output plugins
  ↓
dist/wc
dist/react
dist/vue
dist/custom-elements.json
dist/types
```

### plugin hook 设计

```ts id="rl32bi"
export interface ZeusOutputPlugin {
  name: string

  buildStart?: (ctx: ZeusBuildContext) => void | Promise<void>

  virtualModules?: (
    ctx: ZeusBuildContext,
  ) => ZeusVirtualModule[] | Promise<ZeusVirtualModule[]>

  generateBundle?: (
    ctx: ZeusBuildContext,
  ) => ZeusOutputFile[] | Promise<ZeusOutputFile[]>
}
```

### ComponentManifest

```ts id="rr3ps5"
export interface ComponentManifest {
  components: ComponentRecord[]
}

export interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string

  props: Record<string, ComponentProp>
  events: Record<string, ComponentEvent>
  slots: Record<string, ComponentSlot>

  cssVars?: string[]
  cssParts?: string[]
  headless?: boolean
}
```

### meta 不要重复写

主路径应该是自动解析：

```ts id="wtjg0u"
defineElement<Props>('z-button', options, setup)
```

提取：

```txt id="6lcvd7"
tagName
props runtime 定义
TS Props 类型
emit 事件
Slot
css vars
```

`options.meta` 只作为补充，不重复定义 props。

---

## 6. 编译输出包含 dts，如何让 Vue / React 应用使用对应类型

建议每个输出插件自己负责对应的 d.ts。

最终包导出应该类似：

```json id="g50dyr"
{
  "exports": {
    "./wc": {
      "types": "./dist/wc/index.d.ts",
      "import": "./dist/wc/index.js"
    },
    "./react": {
      "types": "./dist/react/index.d.ts",
      "import": "./dist/react/index.js"
    },
    "./vue": {
      "types": "./dist/vue/index.d.ts",
      "import": "./dist/vue/index.js"
    },
    "./custom-elements.json": {
      "default": "./dist/custom-elements.json"
    }
  }
}
```

### React 类型输出

生成：

```ts id="pc9bsg"
// dist/react/index.d.ts

import type * as React from 'react'

export interface ZButtonChangeDetail {
  value: boolean
}

export interface ZButtonProps {
  type?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onChange?: (event: CustomEvent<ZButtonChangeDetail>) => void
}

export interface ZButtonElement extends HTMLElement {
  type?: ZButtonProps['type']
  disabled?: boolean
}

export declare const ZButton: React.ForwardRefExoticComponent<
  ZButtonProps & React.RefAttributes<ZButtonElement>
>
```

### Vue 类型输出

生成：

```ts id="5331fu"
// dist/vue/index.d.ts

import type { DefineComponent } from 'vue'

export interface ZButtonProps {
  type?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

export declare const ZButton: DefineComponent<
  ZButtonProps,
  {},
  {},
  {},
  {},
  {},
  {},
  {
    change: (event: CustomEvent<{ value: boolean }>) => void
  }
>
```

Vue 还可以额外输出全局组件声明：

```ts id="92vrkw"
// dist/vue/global.d.ts

import type { ZButton } from './index'

declare module 'vue' {
  export interface GlobalComponents {
    ZButton: typeof ZButton
  }
}
```

这样用户可以在 `tsconfig.json` 里加：

```json id="7x0h0u"
{
  "compilerOptions": {
    "types": ["@zeus-ui/components/vue/global"]
  }
}
```

### Web Component 原生类型

输出：

```ts id="086d81"
// dist/wc/index.d.ts

export interface ZButtonElement extends HTMLElement {
  type?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

declare global {
  interface HTMLElementTagNameMap {
    'z-button': ZButtonElement
  }
}
```

如果要支持 JSX 原生标签，也可以输出：

```ts id="0h2305"
// dist/wc/jsx.d.ts

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'z-button': {
        type?: 'default' | 'primary' | 'danger'
        disabled?: boolean
      }
    }
  }
}
```

### dts 生成策略

推荐两层：

```txt id="n0c4rw"
wrapper 源码本身生成 .ts/.tsx
  ↓
output plugin 根据 ComponentManifest 直接 emit 对应 .d.ts
```

也就是说不要完全依赖 tsc 推导，因为 wrapper 是生成物，类型可以直接从 manifest 生成，稳定、可控、跨框架一致。

---

## 7. 最终想做成 shadcn ui 那种库，该怎么设计

你的目标可以拆成两层：

```txt id="spcx3q"
第一层：Zeus Headless Web Component
第二层：shadcn-like 可复制/可定制 UI 封装
```

不要直接把样式写死在 Web Component 里。

### 第一层：Headless UI

包名建议：

```txt id="qqo3sq"
@zeus-ui/headless
```

提供底层行为组件：

```txt id="uerlsy"
z-button
z-dialog
z-popover
z-tabs
z-select
z-dropdown-menu
z-tooltip
z-switch
z-checkbox
z-radio-group
z-toast
```

特点：

```txt id="9pd099"
负责状态
负责交互
负责键盘行为
负责可访问性
负责事件
负责 focus 管理
尽量不绑定强样式
```

输出：

```txt id="o6327n"
dist/wc
dist/react
dist/vue
```

### 第二层：shadcn-like 封装

包名可以是：

```txt id="7g693z"
@zeus-ui/registry
```

或者 CLI：

```bash id="r35mmb"
npx zeus-ui add button
npx zeus-ui add dialog
npx zeus-ui add tabs
```

用户安装后不是只拿 npm 组件，而是把源码复制进项目：

```txt id="2gkilg"
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/tabs.tsx
```

React 项目里生成：

```tsx id="0olcnw"
import { ZButton } from '@zeus-ui/headless/react'
import { cn } from '@/lib/utils'

export function Button({ className, variant, size, ...props }) {
  return (
    <ZButton
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
```

Vue 项目里生成：

```vue id="tzw3vr"
<script setup lang="ts">
import { ZButton } from '@zeus-ui/headless/vue'
import { buttonVariants } from './button-variants'

defineProps<{
  variant?: 'default' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <ZButton :class="buttonVariants({ variant, size })">
    <slot />
  </ZButton>
</template>
```

### 主题系统

建议统一用：

```txt id="w7jd3c"
CSS Variables
data-state
data-disabled
data-size
data-variant
class-variance-authority 风格的 variants
Tailwind tokens
```

Headless 组件输出状态：

```html id="xbpzui"
<z-button data-state="open" data-disabled data-size="sm" data-variant="primary">
</z-button>
```

用户样式层控制：

```ts id="h953by"
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'border border-input bg-background',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
      },
    },
  },
)
```

### Shadow DOM 策略

如果目标是 shadcn-like，我建议：

```txt id="saylwr"
Headless 组件默认 shadow: false
需要隔离的复杂组件可选 shadow: true
```

因为 shadcn-like 的关键是用户能改 class、改 DOM、改样式。如果默认 Shadow DOM，样式定制会变复杂。

可以提供两种模式：

```ts id="8a2g19"
defineElement('z-button', {
  shadow: false,
  headless: true,
})
```

复杂组件：

```ts id="l4ev6u"
defineElement('z-color-picker', {
  shadow: true,
  parts: ['root', 'trigger', 'panel'],
})
```

### 最终用户体验

用户创建项目：

```bash id="uv2nkp"
pnpm add @zeus-ui/headless
pnpm dlx zeus-ui init
pnpm dlx zeus-ui add button dialog tabs
```

生成：

```txt id="aj1qmt"
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/tabs.tsx
src/lib/utils.ts
src/styles/theme.css
```

底层依赖：

```txt id="ul99la"
@zeus-ui/headless/react
```

用户可以自由改：

```txt id="lg293f"
组件源码
className
variants
tokens
theme.css
```

这就接近 shadcn UI 的模式了。

---

## 我建议这轮迭代最终交付物

这轮 `feat/component-compiler-host` 不要贪多，建议交付：

```txt id="61d00q"
1. addons/bundler-plugin
   - 复用当前 vite-plugin 的 transform 能力
   - 支持 Rollup/Vite/Rolldown
   - 提供 outputs 插件机制

2. packages/component-analyzer
   - 扫描 defineElement
   - 生成 ComponentManifest
   - 支持 props / events / slots 基础提取

3. addons/output-wc
   - 输出 dist/wc
   - 输出 custom-elements.json

4. examples/web-component
   - z-button
   - z-icon

5. benchmark
   - compile manifest benchmark
   - mount/update/custom-event benchmark
   - single component size report

6. 设计文档
   - docs/internal/design/component-compiler-host.md
```

React/Vue wrapper 可以放到下一轮，或者本轮只做最小版本。

最终路线：

```txt id="ff6eh9"
本轮：插件宿主 + manifest + wc 输出 + benchmark
下一轮：react/vue wrapper + dts
再下一轮：headless components + shadcn-like registry
```

这样风险最低，也最符合 Zeus 当前阶段。
