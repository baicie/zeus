# Web-C Architecture and Aggregate Package Design

本文基于 [Primitive Component Protocol](./primitive-component-protocol.md) 和当前 `packages/web-c/*` 现状，定义 Zeus Web-C 的完整架构、包边界和新增聚合包 `@zeus-js/web-c` 的设计。

## 背景

当前 Web-C 能力已经拆成多个可发布包：

| 包                              | 职责                                           |
| ------------------------------- | ---------------------------------------------- |
| `@zeus-js/component-analyzer`   | 分析 `defineElement` 源码，生成组件 manifest   |
| `@zeus-js/component-dts`        | 基于 manifest 生成 WC / JSX / React / Vue 类型 |
| `@zeus-js/bundler-plugin`       | 组件构建宿主，适配 Vite / Rollup / Rolldown    |
| `@zeus-js/output-wc`            | 生成 Web Component lazy / side-effect 产物     |
| `@zeus-js/output-react-wrapper` | 生成 React wrapper                             |
| `@zeus-js/output-vue-wrapper`   | 生成 Vue wrapper                               |
| `@zeus-js/output-css`           | 生成 CSS asset 输出                            |
| `@zeus-js/output-icons`         | 生成 icon 输出                                 |
| `@zeus-js/web-c`                | 聚合工具链并组合 WC / React / Vue / CSS 输出   |
| `@zeus-js/web-c-runtime`        | lazy Web Component 运行时                      |

这些包边界适合内部维护，但对组件库作者来说包名太多，配置样板也偏重。

因此需要新增一个聚合包：

```txt
@zeus-js/web-c
```

它作为 Web-C 工具链的统一入口，向用户暴露高层 API，同时保留职责独立的细分包作为低层能力入口。

## 目标

1. 组件库作者优先安装和使用 `@zeus-js/web-c`。
2. `@zeus-js/web-c` 聚合 Web-C 构建、输出、分析、类型和 preset API。
3. 保留现有细分包，不做立即废弃。
4. `defineElement contract` 是组件元数据的唯一事实来源。
5. 默认输出 lazy Web Component。
6. `loader` / `auto` 由组件库产物提供，不放进 core runtime。
7. React / Vue wrapper 默认 minimal，声明事件时可启用 event bridge。
8. runtime 只做底层桥接，不承担组件库级别职责。

## 非目标

1. 不把 `@zeus-js/runtime-dom` 合并进 `@zeus-js/web-c`。
2. 不让 `@zeus-js/web-c` 成为组件运行时依赖的万能入口。
3. 不删除现有 `@zeus-js/output-*`、`@zeus-js/component-*`、`@zeus-js/bundler-plugin` 包。
4. 不要求组件作者手写 manifest。
5. 不在 P1 实现 `formAssociated` 的完整 ElementInternals 封装。

## 总体架构

```txt
component source
  defineElement contract
        │
        ▼
@zeus-js/component-analyzer
        │
        ▼
ComponentManifest
        │
        ▼
@zeus-js/bundler-plugin
        │
        ├── @zeus-js/output-wc
        ├── @zeus-js/output-react-wrapper
        ├── @zeus-js/output-vue-wrapper
        ├── @zeus-js/output-css
        └── @zeus-js/output-icons
        │
        ▼
dist/
  wc/
  react/
  vue/
  custom-elements.json
  zeus.components.json
```

`@zeus-js/web-c` 位于用户入口层：

```txt
@zeus-js/web-c
  ├── re-export bundler adapters
  ├── re-export component library preset
  ├── re-export output plugins
  ├── re-export analyzer / dts utilities
  └── re-export selected runtime helpers for generated output contracts
```

## 包分层

### Core Runtime Layer

| 包                       | 职责                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `@zeus-js/zeus`          | 用户写组件时的主入口，导出 `defineElement`、`Host`、`event`、`prop` 等 |
| `@zeus-js/runtime-dom`   | DOM 渲染和组件 runtime 基础                                            |
| `@zeus-js/web-c-runtime` | lazy custom element proxy runtime                                      |

约束：

- `@zeus-js/web-c-runtime` 只服务 Web-C lazy 输出。
- `@zeus-js/web-c-runtime` 可以作为组件库产物的直接运行时依赖。
- `loader` / `auto` 不进入 `@zeus-js/web-c-runtime`，只由 `output-wc` 生成到组件库 `dist/wc`。

### Compiler Host Layer

| 包                            | 职责                          |
| ----------------------------- | ----------------------------- |
| `@zeus-js/component-analyzer` | 从源码提取 component contract |
| `@zeus-js/component-dts`      | 从 manifest 生成类型          |
| `@zeus-js/bundler-plugin`     | 构建宿主和输出插件 registry   |

约束：

- `component-analyzer` 的输出 manifest 是所有 output plugin 的共享输入。
- `component-dts` 不重新分析源码，只消费 manifest。
- `bundler-plugin` 不内置具体输出策略，只调度 output plugin。

### Output Layer

| 包                              | 职责                            |
| ------------------------------- | ------------------------------- |
| `@zeus-js/output-wc`            | 生成 WC lazy / side-effect 产物 |
| `@zeus-js/output-react-wrapper` | 生成 React wrapper              |
| `@zeus-js/output-vue-wrapper`   | 生成 Vue wrapper                |
| `@zeus-js/output-css`           | 生成 CSS asset                  |
| `@zeus-js/output-icons`         | 生成 icon 输出                  |

约束：

- React / Vue wrapper 依赖 WC 输出存在。
- `output-wc` 是 Web-C 组件库输出的基础目标。
- `output-react-wrapper` / `output-vue-wrapper` 只生成 wrapper，不重新定义组件契约。

### Preset Layer

`@zeus-js/web-c` 同时承担用户聚合入口与 `componentLibrary()` 预设实现，不保留单独的 preset 包。

## 新增包：`@zeus-js/web-c`

### 包定位

`@zeus-js/web-c` 是 Web-C 工具链聚合包。

推荐用户写组件库配置时只使用：

```ts
import { componentLibrary, zeus } from '@zeus-js/web-c/rolldown'
```

或者：

```ts
import { componentLibrary } from '@zeus-js/web-c'
import zeus from '@zeus-js/web-c/rolldown'
```

### 目录建议

```txt
packages/web-c/web-c/
  package.json
  index.js
  vite.js
  rollup.js
  rolldown.js
  src/
    index.ts
    vite.ts
    rollup.ts
    rolldown.ts
```

### package.json

```json
{
  "name": "@zeus-js/web-c",
  "version": "0.1.0-beta.3",
  "description": "Zeus Web-C component library toolchain",
  "type": "module",
  "main": "index.js",
  "module": "dist/web-c.esm-bundler.js",
  "types": "dist/web-c.d.ts",
  "files": ["index.js", "vite.js", "rollup.js", "rolldown.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/web-c.d.ts",
      "module": "./dist/web-c.esm-bundler.js",
      "import": "./dist/web-c.esm-bundler.js",
      "require": "./index.js"
    },
    "./vite": {
      "types": "./dist/vite.d.ts",
      "import": "./dist/vite.js"
    },
    "./rollup": {
      "types": "./dist/rollup.d.ts",
      "import": "./dist/rollup.js"
    },
    "./rolldown": {
      "types": "./dist/rolldown.d.ts",
      "import": "./dist/rolldown.js"
    }
  }
}
```

### Dependencies

`@zeus-js/web-c` 应依赖 Web-C 细分包：

```json
{
  "dependencies": {
    "@zeus-js/bundler-plugin": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "@zeus-js/component-dts": "workspace:*",
    "@zeus-js/output-css": "workspace:*",
    "@zeus-js/output-icons": "workspace:*",
    "@zeus-js/output-react-wrapper": "workspace:*",
    "@zeus-js/output-vue-wrapper": "workspace:*",
    "@zeus-js/output-wc": "workspace:*"
  },
  "peerDependencies": {
    "rollup": "^4.0.0",
    "rolldown": "^1.0.0",
    "vite": "^8.0.0",
    "react": ">=18",
    "vue": ">=3"
  },
  "peerDependenciesMeta": {
    "rollup": { "optional": true },
    "rolldown": { "optional": true },
    "vite": { "optional": true },
    "react": { "optional": true },
    "vue": { "optional": true }
  }
}
```

`@zeus-js/web-c-runtime` 不建议作为 `@zeus-js/web-c` 的强依赖暴露给用户配置层。它应由 `@zeus-js/output-wc` 生成的组件库产物按需引入。

如果包管理器需要产物运行时依赖可解析，则组件库包本身应声明：

```json
{
  "dependencies": {
    "@zeus-js/runtime-dom": "...",
    "@zeus-js/web-c-runtime": "..."
  }
}
```

### 主入口导出

`@zeus-js/web-c` 主入口导出高层 API：

```ts
export { componentLibrary } from './componentLibrary'

export { default as wc } from '@zeus-js/output-wc'
export { default as react } from '@zeus-js/output-react-wrapper'
export { default as vue } from '@zeus-js/output-vue-wrapper'
export { default as css } from '@zeus-js/output-css'
export { default as icons } from '@zeus-js/output-icons'

export { analyzeFile, analyzeComponents } from '@zeus-js/component-analyzer'

export {
  generateWCDtsFiles,
  generateReactDts,
  generateVueDts,
  generateWCJsxDts,
} from '@zeus-js/component-dts'

export { createOutputRegistry, resolvePluginDts } from '@zeus-js/bundler-plugin'
```

### Adapter 子路径

`@zeus-js/web-c/vite`：

```ts
export { default, zeus } from '@zeus-js/bundler-plugin/vite'
export { componentLibrary } from './componentLibrary'
export * from './index'
```

`@zeus-js/web-c/rollup`：

```ts
export { default, zeus } from '@zeus-js/bundler-plugin/rollup'
export { componentLibrary } from './componentLibrary'
export * from './index'
```

`@zeus-js/web-c/rolldown`：

```ts
export { default, zeus } from '@zeus-js/bundler-plugin/rolldown'
export { componentLibrary } from './componentLibrary'
export * from './index'
```

### 推荐使用方式

Rolldown：

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/rolldown'

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    zeus({
      components: {
        include: ['src/**/*.{ts,tsx}'],
      },
      plugins: [
        componentLibrary({
          targets: ['wc', 'react', 'vue'],
          register: 'lazy',
          wrapper: 'event-bridge',
        }),
      ],
    }),
  ],
}
```

Vite：

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

export default {
  plugins: [
    zeus({
      plugins: [componentLibrary()],
    }),
  ],
}
```

低层自定义：

```ts
import zeus from '@zeus-js/web-c/rolldown'
import { react, vue, wc } from '@zeus-js/web-c'

export default {
  plugins: [
    zeus({
      plugins: [
        wc({ register: 'lazy' }),
        react({ wrapper: 'event-bridge' }),
        vue({ wrapper: 'minimal' }),
      ],
    }),
  ],
}
```

## Component Contract

组件源码以 `defineElement` contract 为唯一事实来源：

```tsx
defineElement(
  'zw-input',
  {
    shadow: false,
    props: {},
    emits: {},
  },
  setup,
)
```

compiler 从 contract 和 JSX 中推导：

| 来源           | 生成内容                                                  |
| -------------- | --------------------------------------------------------- |
| `props`        | attr、property 类型、wrapper props、manifest props、docs  |
| `emits`        | DOM events、React event props、Vue emits、manifest events |
| `ctx.expose()` | methods、lazy method proxy、element interface             |
| `<slot>`       | slots、docs、manifest slots                               |
| `part=""`      | cssParts、docs、manifest cssParts                         |
| `cssVars`      | CSS custom properties、docs、registry metadata            |
| JSDoc          | docs / registry 描述                                      |

组件作者不手写：

- `custom-elements.json`
- `zeus.components.json`
- `meta.props`
- `meta.events`
- wrapper props 类型

## Lazy Web-C 输出

默认注册方式为 `lazy`。

输出结构：

```txt
dist/
  wc/
    loader.js
    auto.js
    index.js
    components.manifest.js
    zw-input.entry.js
  react/
    index.js
    input.js
  vue/
    index.js
    input.js
  custom-elements.json
  zeus.components.json
```

语义：

1. `loader.js` 导出 `defineCustomElements()`。
2. `auto.js` 执行副作用注册。
3. lazy 模式只先注册 Proxy Custom Element。
4. 真实组件在 connected 后动态 import。
5. method proxy 必须允许用户在真实组件加载前调用 exposed methods，并返回 Promise。

## Runtime Boundaries

`@zeus-js/web-c-runtime` 只负责：

- lazy bootstrap
- proxy custom element
- host ref
- prop / attr bridge
- lifecycle bridge
- event dispatch bridge
- method proxy

不负责：

- 输出文件生成
- loader / auto 的包级组织
- React / Vue wrapper
- manifest 生成
- docs / registry
- component analyzer

## Props and Attributes

规则来自 `Primitive Component Protocol`：

1. 基础类型支持 attribute。
2. object / array / function 默认不支持 attribute。
3. `attr` 默认从 prop key 推导。
4. `reflect` 只推荐基础类型。
5. lazy 模式下如果 object / array / function prop 声明了 attribute 或 reflect，`output-wc` 必须报错。

## Events and Wrapper Modes

### Events

事件必须通过 `emits` 声明：

```ts
emits: {
  valueChange: event<{ value: string }>(),
}
```

默认映射：

```txt
valueChange -> value-change -> onValueChange
```

默认事件配置：

```ts
{
  bubbles: true,
  composed: true,
  cancelable: false,
}
```

### React wrapper

默认 `minimal`：

- 渲染 `zw-*` 标签。
- 透传普通 props / attrs / children / ref。
- 不做复杂 state sync。

`event-bridge`：

- 从 `emits` 生成 `onValueChange` 等 props。
- 运行时使用 `addEventListener('value-change', handler)`。
- handler 更新时清理旧 listener。
- unmount 时清理 listener。

### Vue wrapper

默认 `minimal`：

- 使用 `h('zw-*')`。
- 透传 props / attrs / slots。

事件：

- 从 `emits` 生成 Vue emits 类型。
- 模板中使用 kebab-case event。

## Manifest and Types

生成文件：

| 文件                   | 来源              | 说明                          |
| ---------------------- | ----------------- | ----------------------------- |
| `zeus.components.json` | ComponentManifest | Zeus 内部和 registry 消费     |
| `custom-elements.json` | ComponentManifest | 标准 Custom Elements Manifest |
| `wc/index.d.ts`        | component-dts     | DOM element 类型              |
| `wc/types/jsx.d.ts`    | component-dts     | JSX IntrinsicElements         |
| `react/index.d.ts`     | component-dts     | React wrapper 类型            |
| `vue/index.d.ts`       | component-dts     | Vue wrapper 类型              |
| `vue/global.d.ts`      | component-dts     | Vue global component 类型     |

所有类型都应由 compiler 生成，不由组件库作者手写。

## Test Plan

### Analyzer

- props 简写和对象写法。
- attr 默认推导。
- values union 推导。
- emits 默认事件名推导。
- `<slot>` 推导。
- `part=""` 推导。
- `ctx.expose()` 推导。
- JSDoc 推导 docs metadata。

### output-wc

- lazy loader 不提前加载真实组件。
- `auto.js` 只注册 proxy。
- string / number / boolean attr bridge。
- object / array / function prop property-only。
- reflect 只允许基础类型。
- method proxy 可在真实组件加载前调用并 await。
- `custom-elements.json` 和 `zeus.components.json` 包含 props / events / slots / parts / css vars / methods。

### output-react-wrapper

- minimal wrapper 只渲染 custom element。
- event-bridge wrapper 不把 `onValueChange` 透传成 attribute。
- event-bridge wrapper mount / update / unmount listener 正确。
- ref 指向 custom element。
- 类型包含 `onValueChange?: (event: CustomEvent<Detail>) => void`。

### output-vue-wrapper

- minimal wrapper 透传 props / attrs / slots。
- emits 类型来自 `emits`。
- global dts 正确生成。

### `@zeus-js/web-c`

- 主入口 re-export 高层 API。
- `./vite`、`./rollup`、`./rolldown` 子路径导出对应 adapter。
- `componentLibrary()` 可从聚合包导入。
- 细分包仍可独立导入。

## Migration Plan

### Phase 1: 文档与协议

1. 完成 `Primitive Component Protocol`。
2. 完成本文 `Web-C Architecture and Aggregate Package Design`。
3. 更新 `docs/api/packages.md`，加入 `@zeus-js/web-c`。

### Phase 2: 新增聚合包

1. 新建 `packages/web-c/web-c`。
2. 添加主入口和 adapter 子路径。
3. 添加 package exports。
4. 添加 API snapshot。
5. 添加 re-export 单测。

### Phase 3: 输出插件协议对齐

1. analyzer 支持 `props` 简写、`prop(values)`、`emits`、`event()`。
2. analyzer 支持 slots / parts / expose 静态推导。
3. output-wc 消费新增 metadata。
4. output-react-wrapper 支持 event-bridge。
5. output-vue-wrapper 类型对齐 emits。

### Phase 4: preset 收敛

1. `componentLibrary()` 作为推荐入口继续保留。
2. 文档推荐从 `@zeus-js/web-c` 导入。
3. 细分 output 包继续作为低层高级入口。

## Open Questions

1. `@zeus-js/web-c` 是否应 re-export `@zeus-js/web-c-runtime`，还是保持 runtime 仅由生成产物引用。
2. `@zeus-js/web-c` 是否应包含 `./runtime` 子路径。
3. React wrapper 的 `event-bridge` 是否应成为默认模式，还是保持 `minimal` 默认。
4. `componentLibrary()` 已迁入 `@zeus-js/web-c` 源码。
5. `formAssociated` 的具体 runtime API 何时进入 P2 实现。
