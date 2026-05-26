下面给你 **Phase 4：框架入口 + Vite 插件 + JSX DX** 的详细设计与代码草案。

Phase 0~3 解决的是：

```txt
Phase 0：项目基线
Phase 1：state() 统一状态 API
Phase 2：runtime-dom MVP
Phase 3：compiler JSX 编译闭环
```

**Phase 4 要解决的是：让用户真的能像用一个框架一样创建项目、写 TSX、跑 Vite。**

---

# Phase 4 总目标

Phase 4 的核心目标：

```txt
1. 新增 @zeus-js/zeus 作为框架统一入口
2. 新增 @zeus-js/vite-plugin 作为 Vite 插件
3. 支持 jsxImportSource
4. 支持 TSX 类型提示
5. 提供最小 playground / example
6. 用户不需要手动配置 Babel plugin
```

最终用户体验应该是：

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

`vite.config.ts`：

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus"
  }
}
```

---

# Phase 4 包结构

建议新增两个包：

```txt
packages/
  zeus/              # 框架统一入口
  vite-plugin/       # Vite 插件
```

最终结构：

```txt
packages/
  shared/
  signal/
  runtime-dom/
  compiler/
  zeus/
  vite-plugin/
```

当前 workspace 已经覆盖 `packages/*`，所以新增包会自动纳入 monorepo。

---

# Phase 4 用户侧 API 设计

## 主入口：`@zeus-js/zeus`

用户只需要从这里导入：

```ts
import {
  state,
  computed,
  effect,
  watch,
  scope,
  render,
  Show,
  For,
} from '@zeus-js/zeus'
```

不要让用户直接到处导：

```ts
import { state } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'
```

底层包仍然保留，框架入口负责整合。

---

# Phase 4 包设计

## 1. `packages/zeus`

### 目录结构

```txt
packages/zeus/
  package.json
  index.js
  src/
    index.ts
    jsx-runtime.ts
    jsx-dev-runtime.ts
    jsx.d.ts
```

---

## 2. `packages/zeus/package.json`

```json
{
  "name": "@zeus-js/zeus",
  "version": "0.0.1",
  "description": "Zeus framework entry",
  "main": "index.js",
  "module": "dist/zeus.esm-bundler.js",
  "types": "dist/zeus.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/zeus.d.ts",
      "node": {
        "production": "./dist/zeus.cjs.prod.js",
        "development": "./dist/zeus.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/zeus.esm-bundler.js",
      "import": "./dist/zeus.esm-bundler.js",
      "require": "./index.js"
    },
    "./jsx-runtime": {
      "types": "./dist/jsx-runtime.d.ts",
      "import": "./dist/jsx-runtime.esm-bundler.js",
      "require": "./dist/jsx-runtime.cjs.js"
    },
    "./jsx-dev-runtime": {
      "types": "./dist/jsx-dev-runtime.d.ts",
      "import": "./dist/jsx-dev-runtime.esm-bundler.js",
      "require": "./dist/jsx-dev-runtime.cjs.js"
    },
    "./jsx": {
      "types": "./dist/jsx.d.ts"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "Zeus",
    "formats": ["esm-bundler", "esm-browser", "cjs", "global"]
  },
  "dependencies": {
    "@zeus-js/signal": "workspace:*",
    "@zeus-js/runtime-dom": "workspace:*"
  }
}
```

---

## 3. `packages/zeus/index.js`

```js
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/zeus.cjs.prod.js')
} else {
  module.exports = require('./dist/zeus.cjs.js')
}
```

---

# 4. `packages/zeus/src/index.ts`

统一导出。

```ts
export {
  state,
  isValueState,
  computed,
  effect,
  stop,
  watch,
  scope,
  getCurrentScope,
  onScopeDispose,
  onCleanup,
  batch,
  untrack,
  type State,
  type ValueState,
  type ComputedRef,
  type WatchOptions,
  type WatchHandle,
  type Scope,
} from '@zeus-js/signal'

export {
  render,
  template,
  insert,
  bindText,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  bindEvent,
  bindRef,
  setRef,
  createComponent,
  Show,
  For,
  mountShow,
  mountFor,
  marker,
  child,
  type JSXValue,
  type Component,
  type RefTarget,
  type ShowProps,
  type ForProps,
} from '@zeus-js/runtime-dom'
```

用户层就只需要：

```ts
import { state, render } from '@zeus-js/zeus'
```

---

# JSX Runtime 设计

虽然 Zeus 主要靠 compiler 转换 JSX，但 TypeScript 的 `jsxImportSource` 会找：

```txt
@zeus-js/zeus/jsx-runtime
@zeus-js/zeus/jsx-dev-runtime
```

所以必须提供这两个入口。

注意：Zeus 的 JSX 不应该走 React 那种 runtime createElement。
这里的 `jsx-runtime` 主要是为了 TS 类型和兜底，不是主编译路径。

---

## 1. `packages/zeus/src/jsx-runtime.ts`

```ts
import { createComponent, insert, type JSXValue } from '@zeus-js/runtime-dom'

export const Fragment = (props: { children?: JSXValue }): JSXValue => {
  return props.children ?? null
}

export function jsx(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

export function jsxs(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

export function jsxDEV(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

function createJSXNode(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  if (typeof type === 'function') {
    return createComponent(type, props ?? {})
  }

  if (__DEV__) {
    console.warn(
      '[Zeus] JSX runtime fallback was used for a native element. ' +
        'Make sure @zeus-js/vite-plugin is enabled.',
    )
  }

  const el = document.createElement(type)

  if (props) {
    const children = props.children as JSXValue | undefined

    for (const key of Object.keys(props)) {
      if (key === 'children') continue

      const value = props[key]

      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
      } else if (key === 'ref') {
        // compiler path should handle ref.
        // fallback path only supports simple value/current/function.
        setFallbackRef(value, el)
      } else if (value != null && value !== false) {
        el.setAttribute(key === 'className' ? 'class' : key, String(value))
      }
    }

    if (children !== undefined) {
      insert(el, children)
    }
  }

  return el
}

function setFallbackRef(target: unknown, el: Element): void {
  if (target == null) return

  if (typeof target === 'function') {
    ;(target as (value: Element | null) => void)(el)
    return
  }

  if (typeof target === 'object') {
    if ('value' in target) {
      ;(target as { value: Element | null }).value = el
      return
    }

    if ('current' in target) {
      ;(target as { current: Element | null }).current = el
    }
  }
}
```

这个 fallback 不是性能路径，主要是防用户没配插件时能给提示。

---

## 2. `packages/zeus/src/jsx-dev-runtime.ts`

```ts
export { Fragment, jsx, jsxs, jsxDEV } from './jsx-runtime'
```

---

# JSX 类型设计

## `packages/zeus/src/jsx.d.ts`

```ts
import type { JSXValue, RefTarget } from '@zeus-js/runtime-dom'

type EventHandler<E extends Event = Event> = (event: E) => void

type PrimitiveAttr = string | number | boolean | null | undefined

type ClassValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | ClassValue[]

type StyleValue =
  | string
  | null
  | undefined
  | Partial<CSSStyleDeclaration>
  | Record<string, string | number | null | undefined>

type CommonDOMAttributes<T extends Element> = {
  ref?: RefTarget<T>

  class?: ClassValue
  className?: ClassValue
  style?: StyleValue

  id?: PrimitiveAttr
  title?: PrimitiveAttr
  role?: PrimitiveAttr

  onClick?: EventHandler<MouseEvent>
  onDblClick?: EventHandler<MouseEvent>
  onInput?: EventHandler<InputEvent>
  onChange?: EventHandler<Event>
  onSubmit?: EventHandler<SubmitEvent>
  onKeyDown?: EventHandler<KeyboardEvent>
  onKeyUp?: EventHandler<KeyboardEvent>
  onFocus?: EventHandler<FocusEvent>
  onBlur?: EventHandler<FocusEvent>

  children?: JSXValue
}

type HTMLAttributes<T extends HTMLElement> = CommonDOMAttributes<T> & {
  [key: `data-${string}`]: PrimitiveAttr
  [key: `aria-${string}`]: PrimitiveAttr
  [key: `prop:${string}`]: unknown
}

type SVGAttributes<T extends SVGElement> = CommonDOMAttributes<T> & {
  [key: string]: unknown
}

declare global {
  namespace JSX {
    type Element = JSXValue

    interface ElementChildrenAttribute {
      children: {}
    }

    interface IntrinsicElements {
      div: HTMLAttributes<HTMLDivElement>
      span: HTMLAttributes<HTMLSpanElement>
      p: HTMLAttributes<HTMLParagraphElement>
      a: HTMLAttributes<HTMLAnchorElement>
      button: HTMLAttributes<HTMLButtonElement>
      input: HTMLAttributes<HTMLInputElement>
      textarea: HTMLAttributes<HTMLTextAreaElement>
      select: HTMLAttributes<HTMLSelectElement>
      option: HTMLAttributes<HTMLOptionElement>
      form: HTMLAttributes<HTMLFormElement>
      label: HTMLAttributes<HTMLLabelElement>
      ul: HTMLAttributes<HTMLUListElement>
      ol: HTMLAttributes<HTMLOListElement>
      li: HTMLAttributes<HTMLLIElement>
      h1: HTMLAttributes<HTMLHeadingElement>
      h2: HTMLAttributes<HTMLHeadingElement>
      h3: HTMLAttributes<HTMLHeadingElement>
      h4: HTMLAttributes<HTMLHeadingElement>
      h5: HTMLAttributes<HTMLHeadingElement>
      h6: HTMLAttributes<HTMLHeadingElement>
      img: HTMLAttributes<HTMLImageElement>
      video: HTMLAttributes<HTMLVideoElement>
      audio: HTMLAttributes<HTMLAudioElement>
      canvas: HTMLAttributes<HTMLCanvasElement>

      svg: SVGAttributes<SVGSVGElement>
      path: SVGAttributes<SVGPathElement>
      circle: SVGAttributes<SVGCircleElement>
      rect: SVGAttributes<SVGRectElement>
      line: SVGAttributes<SVGLineElement>

      [name: string]: Record<string, unknown>
    }
  }
}

export {}
```

---

# Vite 插件设计

## 包结构

```txt
packages/vite-plugin/
  package.json
  index.js
  src/
    index.ts
    transform.ts
```

---

## `packages/vite-plugin/package.json`

```json
{
  "name": "@zeus-js/vite-plugin",
  "version": "0.0.1",
  "description": "Vite plugin for Zeus",
  "main": "index.js",
  "module": "dist/vite-plugin.esm-bundler.js",
  "types": "dist/vite-plugin.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/vite-plugin.d.ts",
      "node": {
        "production": "./dist/vite-plugin.cjs.prod.js",
        "development": "./dist/vite-plugin.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/vite-plugin.esm-bundler.js",
      "import": "./dist/vite-plugin.esm-bundler.js",
      "require": "./index.js"
    }
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusVitePlugin",
    "formats": ["esm-bundler", "cjs"]
  },
  "dependencies": {
    "@babel/core": "catalog:",
    "@zeus-js/compiler": "workspace:*"
  },
  "peerDependencies": {
    "vite": "catalog:"
  }
}
```

---

## `packages/vite-plugin/index.js`

```js
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/vite-plugin.cjs.prod.js')
} else {
  module.exports = require('./dist/vite-plugin.cjs.js')
}
```

---

# Vite 插件 API

用户配置：

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [
    zeus({
      dev: true,
    }),
  ],
})
```

插件选项：

```ts
export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  moduleName?: string
  dev?: boolean
  sourcemap?: boolean
}
```

默认：

```ts
{
  include: /\.[tj]sx$/,
  exclude: /node_modules/,
  moduleName: '@zeus-js/runtime-dom'
}
```

---

# `packages/vite-plugin/src/index.ts`

```ts
import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'

import type { Plugin } from 'vite'
import type { CompilerOptions } from '@zeus-js/compiler'

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  moduleName?: string
  dev?: boolean
  sourcemap?: boolean
}

export default function zeus(options: ZeusVitePluginOptions = {}): Plugin {
  const include = normalizePatterns(options.include ?? /\.[tj]sx$/)
  const exclude = normalizePatterns(options.exclude ?? /node_modules/)

  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    config() {
      return {
        esbuild: {
          jsx: 'preserve',
        },
      }
    },

    async transform(code, id) {
      if (!shouldTransform(id, include, exclude)) {
        return null
      }

      const result = await transformAsync(code, {
        filename: id,
        sourceMaps: options.sourcemap ?? true,
        plugins: [
          [
            zeusCompiler,
            {
              moduleName: options.moduleName ?? '@zeus-js/runtime-dom',
              generate: 'dom',
              hydratable: false,
              delegateEvents: false,
            } satisfies Partial<CompilerOptions>,
          ],
        ],
        parserOpts: {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
        },
        generatorOpts: {
          retainLines: false,
          compact: false,
          jsescOption: {
            minimal: true,
          },
        },
      })

      if (!result?.code) return null

      return {
        code: result.code,
        map: result.map ?? null,
      }
    },
  }
}

function normalizePatterns(value: RegExp | RegExp[]): RegExp[] {
  return Array.isArray(value) ? value : [value]
}

function shouldTransform(
  id: string,
  include: RegExp[],
  exclude: RegExp[],
): boolean {
  if (exclude.some(pattern => pattern.test(id))) return false
  return include.some(pattern => pattern.test(id))
}
```

---

# 关键点：Vite + TSX 的 JSX 流程

Zeus 的 Vite 编译流程应该是：

```txt
.tsx source
  ↓
Vite load
  ↓
vite-plugin-zeus transform
  ↓
Babel parser plugins: typescript + jsx
  ↓
@zeus-js/compiler
  ↓
runtime-dom helper calls
  ↓
Vite 后续打包
```

Vite 插件里必须：

```ts
enforce: 'pre'
```

这样可以尽量在 Vite/esbuild 把 JSX 转掉之前接管。

---

# tsconfig 设计

用户项目：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  },
  "include": ["src"]
}
```

这里有两个关键点：

```txt
jsx: preserve
jsxImportSource: @zeus-js/zeus
```

`jsx: preserve` 是为了让 Vite 插件能拿到 JSX。

---

# Playground 设计

新增：

```txt
playground/zeus-app/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
```

---

## `playground/zeus-app/package.json`

```json
{
  "name": "@zeus-js/playground",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build"
  },
  "dependencies": {
    "@zeus-js/zeus": "workspace:*"
  },
  "devDependencies": {
    "@zeus-js/vite-plugin": "workspace:*",
    "vite": "catalog:",
    "typescript": "^6.0.3"
  }
}
```

---

## `playground/zeus-app/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

---

## `playground/zeus-app/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  },
  "include": ["src"]
}
```

---

## `playground/zeus-app/index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Zeus Playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## `playground/zeus-app/src/main.tsx`

```tsx
import { For, Show, computed, render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  const user = state({
    name: 'Zeus',
    active: true,
  })

  const todos = state([
    { id: 1, title: 'Phase 1: state API' },
    { id: 2, title: 'Phase 2: runtime-dom' },
    { id: 3, title: 'Phase 3: compiler' },
  ])

  const input = state<HTMLInputElement | null>(null)

  const title = computed(() => {
    return `${user.name}: ${count.value}`
  })

  return (
    <main class={{ active: user.active }} style={{ padding: 16 }}>
      <h1>{title.value}</h1>

      <input
        ref={input}
        prop:value={user.name}
        onInput={event => {
          user.name = event.currentTarget.value
        }}
      />

      <button onClick={() => count.value++}>count: {count.value}</button>

      <Show when={count.value > 0} fallback={<p>empty</p>}>
        <p>count is positive</p>
      </Show>

      <ul>
        <For each={todos}>{todo => <li>{todo.title}</li>}</For>
      </ul>
    </main>
  )
}

render(() => <App />, document.getElementById('root')!)
```

---

# Root package scripts 调整

当前根 package 已有：

```json
{
  "scripts": {
    "playground": "pnpm -F @zeus-js/playground dev"
  }
}
```

如果你改成 `playground/zeus-app`，可以保持包名：

```json
{
  "name": "@zeus-js/playground"
}
```

然后原脚本不用改。

---

# Compiler 暴露类型

`@zeus-js/compiler` 当前默认导出 Babel plugin。Phase 4 需要确保它也导出 `CompilerOptions` 类型。

在 `packages/compiler/src/index.ts` 里：

```ts
export type { CompilerOptions } from './config'
```

当前 compiler 里 `CompilerOptions` 在 config 中已有定义。

---

# Vite 插件 source map

如果要更稳一点，transform 里保留 input source map：

```ts
const result = await transformAsync(code, {
  filename: id,
  sourceMaps: true,
  inputSourceMap: false,
  plugins: [
    [
      zeusCompiler,
      {
        moduleName: options.moduleName ?? '@zeus-js/runtime-dom',
      },
    ],
  ],
})
```

Phase 4 不需要做特别复杂的 sourcemap 合并，先保证能调试和报错定位。

---

# HMR 设计

Phase 4 的 HMR 先做最小能力：

```txt
1. Vite 默认模块热替换
2. 文件改动后重新执行模块
3. render dispose 由用户 main.tsx 控制
```

推荐 playground 里写：

```tsx
const root = document.getElementById('root')!

let dispose = render(() => <App />, root)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dispose()
  })
}
```

完整：

```tsx
const root = document.getElementById('root')!

let dispose = render(() => <App />, root)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dispose()
  })
}
```

暂时不做组件级 HMR，这个放后面。

---

# 文档更新

Phase 4 需要新增：

```txt
docs/
  getting-started.md
  vite-plugin.md
  jsx-types.md
```

---

## `docs/getting-started.md` 草案

````md
# Getting Started

## Install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin vite typescript
```
````

## Vite Config

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

## tsconfig

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  }
}
```

## Example

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>{count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

````

---

# Phase 4 测试规划

## 1. Vite plugin transform 单测

新增：

```txt
packages/vite-plugin/__tests__/transform.spec.ts
````

```ts
import { describe, expect, it } from 'vitest'
import zeus from '../src'

describe('vite-plugin-zeus', () => {
  it('transforms tsx files', async () => {
    const plugin = zeus()

    const result = await plugin.transform?.call(
      {} as any,
      `const App = () => <div>hello</div>`,
      `/src/App.tsx`,
    )

    expect(result).toBeTruthy()
    expect(typeof result === 'object' && result.code).toContain('_template')
  })

  it('ignores node_modules', async () => {
    const plugin = zeus()

    const result = await plugin.transform?.call(
      {} as any,
      `const App = () => <div>hello</div>`,
      `/node_modules/foo/index.tsx`,
    )

    expect(result).toBeNull()
  })
})
```

---

## 2. JSX type 测试

可以新增：

```txt
packages/zeus/__tests__/jsx-types.test.tsx
```

```tsx
import { state } from '../src'

function App() {
  const input = state<HTMLInputElement | null>(null)

  return (
    <div class={{ active: true }}>
      <input
        ref={input}
        prop:value="hello"
        onInput={event => {
          event.currentTarget.value
        }}
      />
    </div>
  )
}

void App
```

这类测试主要靠 `pnpm check`。

---

## 3. Playground smoke test

先不做 e2e，Phase 4 只要求：

```bash
pnpm playground
```

能启动，并且页面能显示。

后面 Phase 6/7 再加 Puppeteer。

---

# Phase 4 任务拆分

## Phase 4.1：新增 `@zeus-js/zeus`

```txt
- packages/zeus/package.json
- src/index.ts
- src/jsx-runtime.ts
- src/jsx-dev-runtime.ts
- src/jsx.d.ts
- buildOptions 接入 root build
```

---

## Phase 4.2：新增 `@zeus-js/vite-plugin`

```txt
- packages/vite-plugin/package.json
- src/index.ts
- 使用 Babel transformAsync
- 接入 @zeus-js/compiler
- include/exclude
- sourcemap
```

---

## Phase 4.3：完善 compiler 类型导出

```txt
- @zeus-js/compiler 导出 CompilerOptions
- 保证 vite-plugin 能类型引用
```

---

## Phase 4.4：新增 playground

```txt
- playground/zeus-app
- vite.config.ts
- tsconfig.json
- main.tsx
```

---

## Phase 4.5：TSX 类型支持

```txt
- JSX.IntrinsicElements
- ref 类型
- class/className 类型
- style 类型
- onClick/onInput 基础事件类型
- prop:* 支持
```

---

## Phase 4.6：最小 HMR

```txt
- render dispose 示例
- import.meta.hot.dispose 清理 root
```

---

# Phase 4 完成标准

Phase 4 完成后，用户应该可以：

```bash
pnpm create vite zeus-demo
cd zeus-demo
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin
```

配置：

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

然后写：

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

并且满足：

```txt
1. TSX 不报类型错误
2. Vite 能启动
3. JSX 被 @zeus-js/compiler 转换
4. DOM 能响应 state 更新
5. 不需要手动配置 Babel
6. 用户只从 @zeus-js/zeus 导入框架 API
```

---

# 最终结论

Phase 4 是 Zeus 从“内部包能跑”到“用户能用”的关键阶段。

核心交付是：

```txt
@zeus-js/zeus
  统一框架入口

@zeus-js/vite-plugin
  自动编译 TSX

jsx-runtime / jsx-dev-runtime / jsx.d.ts
  让 TypeScript 和 Vite 能识别 Zeus JSX

playground/zeus-app
  验证完整开发体验
```

做完 Phase 4，Zeus 才真正具备一个框架最小闭环：

```txt
state()
  ↓
TSX
  ↓
vite-plugin-zeus
  ↓
@zeus-js/compiler
  ↓
@zeus-js/runtime-dom
  ↓
细粒度 DOM 更新
```
