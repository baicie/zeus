下面这版 roadmap 按你的最终目标来排：

```txt id="l2w1al"
Zeus Runtime / Compiler 稳定
  ↓
跨框架 Web Component 编译插件
  ↓
Headless Web Component 组件底座
  ↓
React / Vue 类型安全 wrapper
  ↓
shadcn-like 可复制、可定制 UI 层
```

当前 Zeus 已经有比较好的基础：workspace 覆盖 `packages/*`、`examples/*`、`docs`，构建脚本扫描 `packages` 下的所有子包。compiler 输出生态集中放在 `packages/web-c/` 下，包括 bundler-plugin、component-analyzer、component-dts、output-wc、output-react-wrapper、output-vue-wrapper、output-icons。
`runtime-dom` 已经导出了 `defineElement / Host / Slot / createSlot / hostContext`，`defineElement` 也已经具备 props、attribute/property、shadow/light、styles、emit、lifecycle 等 Web Component 基础能力。
compiler 当前是清晰的 JSX 编译链路：`lowerJSX -> passes -> collectTemplates -> emitDOM`，所以多输出 wrapper 不应该塞进 `@zeus-js/compiler`，而应该放到 bundler/plugin 层。

---

# 总分支

这轮主分支建议：

```bash id="xvw6pj"
feat/component-compiler-host
```

这个分支目标不是“做完整 UI 库”，而是打通：

```txt id="7f7m9l"
Component Analyzer
Bundler Plugin Host
Web Component Output
DTS Output
React / Vue Wrapper Output
Headless Component MVP
```

---

# Phase 0：MVP 稳定化补强

## 目标

先保证 Zeus 当前已有能力足够稳定，尤其是 Web Component、Slot、compiler 产物。

## Todo

```txt id="q0dsb4"
0.1 补 defineElement 单测
0.2 补 Slot / Host / light DOM / shadow DOM 单测
0.3 补 compiler 对 Slot / Host / Web Component 的 snapshot
0.4 增加 examples/web-component
0.5 跑通 build / build-dts / check / test / size
```

根目录已经有 `build / build-dts / check / lint / test / size / release / examples:check` 等脚本，可以直接接入质量门禁。

## 关键测试点

```txt id="z9wqvo"
defineElement props default
attribute -> prop
property -> prop
boolean attribute
reflect
CustomEvent detail
shadow Slot
light DOM Slot
disconnected cleanup
styles injection
Host data-state / aria / class / style
```

## 验收标准

```txt id="yryu10"
examples/web-component 可以 dev/build
defineElement + Slot 测试稳定
compiler snapshot 不再出现 marker/path/ref 类错误
```

---

# Phase 1：增强 Host 定位

## 目标

明确架构边界：

```txt id="hi2vba"
defineElement = Web Component 定义层
Host = 宿主元素渲染控制层
Slot = 内容分发层
```

不要让 `Host` 负责定义 Web Component。它应该在 `defineElement` 的 setup 内部控制宿主元素状态。

## 设计

```tsx id="k6pvfb"
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
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
  },
  props => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button part="root" disabled={props.disabled}>
          <Slot />
        </button>
      </Host>
    )
  },
)
```

## Todo

```txt id="4ye7db"
1.1 扩展 HostProps
1.2 Host 支持 data-* / aria-* / class / style / part / role
1.3 Host props 绑定到当前 custom element host
1.4 保持 Host 不承担 customElements.define
```

## 验收标准

```html id="56vdnp"
<z-button data-slot="button" data-variant="default"></z-button>
```

可以由 JSX 中的 `<Host />` 自动同步出来。

---

# Phase 2：Component Analyzer

## 目标

从 `defineElement` 自动抽取 meta，避免重复写 `.meta.ts`。

## 包位置

```txt id="4p8yn6"
packages/web-c/component-analyzer
```

> **设计决策**：component-analyzer 作为 compiler 输出生态的核心共享分析能力，放在 `packages/web-c/` 下，与同属 compiler 输出链的 bundler-plugin、output-* 等包集中管理。

## 输入

```tsx id="vzgt9u"
export interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
  disabled?: boolean
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: Boolean,
    },
    meta: {
      description: 'Headless button primitive',
    },
  },
  setup,
)
```

## 输出

```ts id="w09ei7"
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
  description?: string
}
```

## 信息来源优先级

```txt id="ywp908"
1. defineElement tagName
2. options.props
3. TypeScript Props 类型
4. setup 里的 emit()
5. JSX 里的 Slot / Host / part / data-state
6. options.meta 补充
7. 外部 .meta.ts 兜底
```

## Todo

```txt id="oduu8b"
2.1 Babel AST 扫描 defineElement
2.2 提取 tag / exportName / source file
2.3 提取 runtime props
2.4 提取 TS literal union
2.5 扫描 emit('xxx')
2.6 扫描 <Slot /> / <Slot name="xxx" />
2.7 扫描 part / data-* / aria-*
2.8 合并 options.meta
2.9 输出 ComponentManifest
```

## 验收标准

```txt id="lk6ucy"
输入 10 个 defineElement 组件
自动生成稳定 ComponentManifest
不需要重复写 .meta.ts
```

---

# Phase 3：Bundler Plugin Host

## 目标

做 Rollup / Vite / Rolldown 通用插件宿主。

当前 `@zeus-js/vite-plugin` 已经在 transform 阶段调用 Babel + `@zeus-js/compiler`，这部分可以抽象成通用 bundler 插件能力。

## 包位置

```txt id="c2dabx"
packages/web-c/bundler-plugin
```

## API

```ts id="pc5j2a"
import zeus from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'

export default {
  plugins: [
    zeus({
      include: /\.[tj]sx$/,

      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },

      outputs: [wc(), react(), vue()],
    }),
  ],
}
```

## 插件模型

```ts id="mvdjyl"
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

## Todo

```txt id="yom6lb"
3.1 抽离当前 vite-plugin transform 能力
3.2 支持 Rollup 插件格式
3.3 Vite 直接复用该插件
3.4 Rolldown 兼容
3.5 buildStart 调 component-analyzer
3.6 提供 outputs 插件宿主
3.7 支持 virtual module
3.8 支持 generateBundle emit assets/chunks
```

## 验收标准

```txt id="dfoxbg"
Vite / Rollup / Rolldown 都能使用 zeus()
outputs 插件可以拿到 ComponentManifest
```

---

# Phase 4：Web Component Output

## 目标

输出原生 Web Component 使用入口。

## 包位置

```txt id="ep8ige"
packages/web-c/output-wc
```

## 输出

```txt id="8ban3k"
dist/wc/button.js
dist/wc/icon.js
dist/wc/index.js
dist/custom-elements.json
dist/meta/components.json
dist/wc/index.d.ts
```

## 注意

Web Component 注册文件是副作用模块，因为 `defineElement` 内部会调用 `customElements.define`，即使当前已有重复注册保护，也不能被 tree-shaking 删除。

组件库包要配置：

```json id="nvg8ok"
{
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "**/*.css"]
}
```

## Todo

```txt id="cvas58"
4.1 生成每个组件 wc entry
4.2 生成 wc/index.js
4.3 生成 custom-elements.json
4.4 生成 HTMLElementTagNameMap 类型
4.5 生成 JSX IntrinsicElements 类型
4.6 支持 runtime external / bundled 两种模式
```

## 验收标准

```ts id="gd3uhx"
import '@zeus-ui/headless/wc/button'
```

```html id="pi8wsf"
<z-button variant="default">Button</z-button>
```

可以直接运行。

---

# Phase 5：DTS 输出体系

## 目标

所有输出都带自己的类型，让 React / Vue / 原生 Web Component 都有准确提示。

## 输出结构

```txt id="knj7nn"
dist/wc/index.d.ts
dist/react/index.d.ts
dist/vue/index.d.ts
dist/vue/global.d.ts
dist/custom-elements.json
```

## package exports

```json id="86lcwv"
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
    "./vue/global": {
      "types": "./dist/vue/global.d.ts"
    },
    "./custom-elements.json": {
      "default": "./dist/custom-elements.json"
    }
  }
}
```

## React dts

```ts id="e9uslg"
export interface ZButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
  disabled?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
}

export declare const ZButton: React.ForwardRefExoticComponent<
  ZButtonProps & React.RefAttributes<ZButtonElement>
>
```

## Vue dts

```ts id="c5hib8"
export declare const ZButton: DefineComponent<
  ZButtonProps,
  {},
  {},
  {},
  {},
  {},
  {},
  {
    press: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
  }
>
```

## Todo

```txt id="p7icve"
5.1 从 ComponentManifest 生成 WC 类型
5.2 从 ComponentManifest 生成 React 类型
5.3 从 ComponentManifest 生成 Vue 类型
5.4 生成 Vue GlobalComponents
5.5 生成 JSX IntrinsicElements
5.6 给 examples/react 和 examples/vue 验证类型提示
```

## 验收标准

```txt id="kbglfc"
React 中 onPress 有 event.detail 类型
Vue 中 @press 有事件类型
原生 JSX 中 <z-button> 有 props 提示
```

---

# Phase 6：React / Vue Wrapper Output

## 目标

生成类型安全 wrapper，但底层仍然只使用 Web Component。

## 包位置

```txt id="0rk2lg"
packages/web-c/output-react-wrapper
packages/web-c/output-vue-wrapper
```

## React wrapper 原则

React 不能完全依赖 JSX 给 Web Component 传事件和复杂 props，应该使用：

```txt id="qnvzd0"
ref + property assignment + addEventListener
```

因为 object / array / boolean / CustomEvent 都容易有坑。

## Vue wrapper 原则

Vue wrapper 做：

```txt id="i4zs2f"
defineComponent
props
emits
attrs 透传
slots 透传
property sync
event bridge
```

## Todo

```txt id="7rk0h6"
6.1 output-react-wrapper 生成 JS
6.2 output-react-wrapper 生成 d.ts
6.3 output-vue-wrapper 生成 JS
6.4 output-vue-wrapper 生成 d.ts
6.5 命名 slot 映射规则
6.6 React named slot prop 规则
6.7 Vue slot 规则
6.8 examples/react
6.9 examples/vue
```

## 验收标准

React：

```tsx id="mpzyh0"
import { ZButton } from '@zeus-ui/headless/react'
;<ZButton
  variant="outline"
  onPress={event => {
    console.log(event.detail.nativeEvent)
  }}
>
  Button
</ZButton>
```

Vue：

```vue id="ex02lg"
<ZButton variant="outline" @press="handlePress">
  Button
</ZButton>
```

都能正常运行和类型提示。

---

# Phase 7：Headless Components MVP

## 目标

做底层 headless 组件，不做强样式。

## 包位置

```txt id="4c59k6"
packages/headless
```

或者：

```txt id="rdp4ju"
packages/components
```

我更推荐先叫：

```txt id="r8j2gu"
packages/headless
```

因为你的最终目标是 shadcn-like，headless 是基础层。

## 首批组件

```txt id="mzntaq"
z-button
z-icon
z-switch
z-checkbox
z-tabs
z-dialog
```

建议顺序：

```txt id="wk3sld"
Button -> Icon -> Switch -> Checkbox -> Tabs -> Dialog
```

不要一开始做 Select / Combobox / Table。

## Headless 规范

```txt id="mu5j9p"
默认 shadow: false
通过 data-state / data-disabled / data-size / data-variant 暴露状态
通过 Slot 暴露结构
通过 CustomEvent 暴露行为
复杂组件再考虑 ::part 和 shadow: true
```

## Todo

```txt id="pnh2c6"
7.1 定义 headless 组件规范
7.2 实现 z-button
7.3 实现 z-icon
7.4 实现 z-switch
7.5 实现 z-checkbox
7.6 实现 z-tabs
7.7 实现 z-dialog
7.8 输出 wc/react/vue
7.9 每个组件配 playground/example
```

## 验收标准

```txt id="lgz1bl"
每个组件都能以 wc/react/vue 三种方式使用
每个组件都有类型
每个组件都暴露可样式化状态
```

---

# Phase 8：性能与体积基准

## 目标

验证“只使用一个组件时 runtime 是否过重”和“跨框架 wrapper 是否有额外成本”。

## Benchmark 分类

```txt id="q4jqch"
A. 编译期 benchmark
B. runtime benchmark
C. wrapper benchmark
D. bundle size benchmark
```

## 编译期

```txt id="vnbi1u"
扫描 100 个组件
扫描 1000 个组件
生成 react wrapper
生成 vue wrapper
生成 custom-elements.json
生成 dts
```

## runtime

```txt id="xxm7os"
customElements.define 100/1000 个
mount 1000 个 z-button
prop 更新 10000 次
CustomEvent dispatch 10000 次
Slot 渲染 1000 次
unmount cleanup
```

## bundle size

```txt id="0he6cj"
只用 z-button
只用 z-icon
button + icon
20 个 headless components
100 个 icons
runtime external
runtime bundled
static icon no-runtime
```

## 输出指标

```txt id="8r1uc3"
raw
gzip
brotli
runtime 占比
component code 占比
wrapper code 占比
mount ops/sec
update ops/sec
compile ms
```

## 验收标准

```txt id="s755da"
有 scripts/bench/component-compiler
有 scripts/size/headless-size-report
CI 可跑 size:ci
```

---

# Phase 9：Icon 专用输出

## 目标

解决“只用一个 icon 但 runtime 过重”的问题。

## 策略

Icon 不一定要依赖完整 Zeus runtime。

输出两种模式：

```txt id="gr41e3"
runtime mode:
  <z-icon name="home" />

static mode:
  IconHome / IconUser 直接输出 SVG，不依赖 Zeus runtime
```

## Todo

```txt id="6bmjmt"
9.1 SVG parser
9.2 icons manifest
9.3 生成 z-icon
9.4 生成 React IconHome
9.5 生成 Vue IconHome
9.6 支持 static no-runtime 输出
9.7 支持 tree-shaking
```

## 验收标准

```tsx id="1v4e32"
import { IconHome } from '@zeus-ui/icons/react'
```

只引入一个 icon 时，不需要完整 runtime。

---

# Phase 10：shadcn-like Registry

## 目标

做第二层 UI 封装：用户可以按需复制组件源码到项目里，自定义样式和主题。

## 包/工具

```txt id="q1qvic"
packages/registry
create-zeus-ui 或 zeus-ui CLI
```

## 用户体验

```bash id="mn4wyj"
pnpm dlx zeus-ui init
pnpm dlx zeus-ui add button
pnpm dlx zeus-ui add dialog
pnpm dlx zeus-ui add tabs
```

生成：

```txt id="le8ob0"
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/tabs.tsx
src/lib/utils.ts
src/styles/theme.css
```

React 封装示例：

```tsx id="bwsyrh"
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

## 主题系统

```txt id="xqpbei"
CSS Variables
Tailwind tokens
data-state
data-disabled
data-size
data-variant
class-variance-authority 风格 variants
```

## Todo

```txt id="the8g1"
10.1 registry schema
10.2 React template
10.3 Vue template
10.4 theme.css
10.5 button registry item
10.6 dialog registry item
10.7 tabs registry item
10.8 CLI add/remove/update
10.9 用户项目 smoke test
```

## 验收标准

```txt id="0zsa8z"
用户可以按需 add button
生成源码可改
底层依赖 @zeus-ui/headless/react 或 /vue
主题可自定义
```

---

# Phase 11：文档与生态发布

## 目标

让外部用户能理解这套体系。

## 文档结构

```txt id="jh6430"
docs/
  guide/
    component-compiler.md
    define-element.md
    host-slot.md
    output-plugins.md
    theming.md
    shadcn-like-registry.md
  examples/
    wc.md
    react.md
    vue.md
```

## Todo

```txt id="xlz05a"
11.1 defineElement 文档
11.2 Host / Slot 文档
11.3 ComponentManifest 文档
11.4 output plugin 开发文档
11.5 React/Vue wrapper 文档
11.6 Headless 组件规范
11.7 Theme 规范
11.8 Registry 使用文档
```

---

# 推荐版本节奏

## v0.1.0：Zeus Framework MVP

```txt id="oz31y8"
稳定 signal/runtime-dom/compiler/vite-plugin
补测试
补 examples
发布基础框架
```

## v0.2.0：Component Compiler Host

```txt id="tgdkc8"
component-analyzer
bundler-plugin
output-wc
custom-elements.json
examples/web-component
```

## v0.3.0：Cross Framework Wrapper

```txt id="nggyhn"
output-react-wrapper
output-vue-wrapper
dts 输出
examples/react
examples/vue
```

## v0.4.0：Headless Components

```txt id="klw3i8"
@zeus-ui/headless
button/icon/switch/checkbox/tabs/dialog
wc/react/vue 输出
性能和体积 benchmark
```

## v0.5.0：shadcn-like Registry

```txt id="e3nqpw"
zeus-ui CLI
registry
theme system
React/Vue 可复制组件模板
```

---

# 最终路线总结

```txt id="ggrkaw"
Phase 0  稳定当前 MVP
Phase 1  增强 Host，明确 defineElement/Host/Slot 边界
Phase 2  Component Analyzer，自动抽 meta
Phase 3  Bundler Plugin Host，支持 Rollup/Vite/Rolldown
Phase 4  output-wc，输出 Web Component 和 custom-elements.json
Phase 5  dts 输出体系
Phase 6  React/Vue wrapper 输出
Phase 7  Headless Components MVP
Phase 8  性能与体积基准
Phase 9  Icon 专用 no-runtime 输出
Phase 10 shadcn-like Registry
Phase 11 文档和发布
```

最重要的原则：

```txt id="742fct"
defineElement 负责定义 Web Component
Host 负责宿主元素状态控制
Slot 负责内容分发
Component Analyzer 负责 meta 抽取
Bundler Plugin 负责多输出宿主
Output Plugins 负责 wc/react/vue/dts/docs
Headless Components 负责行为
Registry 负责可复制、可定制 UI
```

这条路线做完，Zeus 的定位就不是单纯的“一个前端框架”，而是：

```txt id="75mlm8"
跨框架 Web Component 编译底座
+
Headless UI 行为组件库
+
shadcn-like 可定制 UI 生态
```
