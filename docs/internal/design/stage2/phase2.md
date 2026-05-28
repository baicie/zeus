下面给你 **Phase B：API 收敛与包出口稳定** 的详细设计与代码草案。

结合最新代码看，Phase B 其实已经开始做了：`packages/zeus/src/index.ts` 顶部已经写明它是 “User-facing public API”，并且内部 runtime helpers 改为从 `@zeus-js/runtime-dom` 直接导出。

但现在还没完全收口，主要问题是：

```txt
1. @zeus-js/zeus 仍导出了一些偏 internal/debug 的 API
2. package exports 还没有明确 advanced / internal 分层
3. 缺少 public API 回归测试，后续很容易又把内部 helper 暴露出去
```

---

# Phase B 总目标

Phase B 的目标是：

```txt
把 Zeus 的“用户 API、进阶 API、兼容 API、内部 API”分清楚。
```

最终分层建议：

```txt
@zeus-js/zeus
  用户主入口，稳定 API

@zeus-js/zeus/advanced
  进阶生命周期、调试、watcher/effect 控制 API

@zeus-js/zeus/internal
  内部 helper，不承诺稳定

@zeus-js/signal
  响应式核心主入口

@zeus-js/runtime-dom
  compiler runtime helpers，允许直接用，但不作为框架主 API
```

---

# Phase B.1：收敛 `@zeus-js/zeus` 主入口

## 当前状态

现在 `@zeus-js/zeus` 主入口已经不再导出 `template / insert / bindText / bindEvent` 等 runtime helper，这是对的。它主要导出 `state / computed / effect / scope / watch / render / Show / For / Host / Slot / defineElement`。

但还有这些偏内部或进阶的东西：

```ts
stop
pauseTracking
enableTracking
resetTracking
onEffectCleanup
getCurrentEffect
effectScope
getCurrentScope
onScopeDispose
getCurrentWatcher
onWatcherCleanup
TrackOpTypes
TriggerOpTypes
ReactiveFlags
```

它们不是不能用，而是不适合放在最主入口。

## 建议主入口只保留

```ts
state
computed
effect
watch
scope
render
Show
For
Host
Slot
defineElement
onCleanup
batch
untrack
nextTick
```

### `packages/zeus/src/index.ts`

```ts
// User-facing public API — stable, minimal surface area.

// reactivity
export {
  state,
  computed,
  effect,
  watch,
  scope,
  batch,
  untrack,
  nextTick,
  onCleanup,
  type State,
  type ValueState,
  type ComputedRef,
  type WatchOptions,
  type WatchHandle,
  type Scope,
} from '@zeus-js/signal'

// runtime
export {
  render,
  Show,
  For,
  Host,
  Slot,
  defineElement,
} from '@zeus-js/runtime-dom'

export type {
  JSXValue,
  Component,
  ShowProps,
  ForProps,
  HostProps,
  SlotProps,
  DefineElementOptions,
  DefineElementContext,
  DefineElementSetup,
} from '@zeus-js/runtime-dom'

// TS jsx runtime fallback
export { Fragment, jsx, jsxs, jsxDEV } from './jsx-runtime'
```

## 从主入口移除

```txt
stop
effectScope
pauseTracking
enableTracking
resetTracking
onEffectCleanup
getCurrentEffect
getCurrentScope
onScopeDispose
getCurrentWatcher
onWatcherCleanup
TrackOpTypes
TriggerOpTypes
ReactiveFlags
```

这些放到 `advanced`。

---

# Phase B.2：新增 `@zeus-js/zeus/advanced`

这个入口给高级用户和框架内部调试用。

## 新增文件

```txt
packages/zeus/src/advanced.ts
```

```ts
export {
  stop,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  getCurrentEffect,
  onEffectCleanup,
  pauseTracking,
  enableTracking,
  resetTracking,
  getCurrentWatcher,
  onWatcherCleanup,
  isValueState,
  queueJob,
  flushJobs,
  TrackOpTypes,
  TriggerOpTypes,
  ReactiveFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type EffectScheduler,
  type DebuggerOptions,
  type DebuggerEvent,
  type WatchStopHandle,
  type WatchScheduler,
} from '@zeus-js/signal'
```

## 使用方式

```ts
import { stop, getCurrentScope, onScopeDispose } from '@zeus-js/zeus/advanced'
```

这样普通用户不会被这些 API 干扰，但需要时仍然能用。

---

# Phase B.3：新增 `@zeus-js/zeus/internal`

这个入口用于内部调试、测试、特殊场景，不承诺稳定。

## 新增文件

```txt
packages/zeus/src/internal.ts
```

```ts
export {
  template,
  insert,
  mountDynamic,
  child,
  marker,
  markers,
  invalidateMarkers,
  bindText,
  bindTextContent,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  bindEvent,
  delegateEvents,
  bindRef,
  setRef,
  createComponent,
  mountShow,
  mountFor,
  createSlot,
  getCurrentHostContext,
  withHostContext,
  captureCurrentHostContext,
  withCapturedHostContext,
  type RefTarget,
  type HostRenderContext,
  type HostRenderMode,
} from '@zeus-js/runtime-dom'
```

如果你不想把 runtime helper 通过 `@zeus-js/zeus/internal` 重新导出，也可以完全不做这个入口，让用户直接从 `@zeus-js/runtime-dom` 导。但我建议保留 `internal`，方便测试和文档标注。

---

# Phase B.4：更新 `packages/zeus/package.json` exports

当前 package exports 只有：

```txt
.
./jsx-runtime
./jsx-dev-runtime
./jsx
./*
```

建议明确加：

```json
{
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
    "./advanced": {
      "types": "./dist/advanced.d.ts",
      "import": "./dist/advanced.esm-bundler.js",
      "require": "./advanced.js"
    },
    "./internal": {
      "types": "./dist/internal.d.ts",
      "import": "./dist/internal.esm-bundler.js",
      "require": "./internal.js"
    },
    "./jsx-runtime": {
      "types": "./dist/jsx-runtime.d.ts",
      "import": "./dist/jsx-runtime.esm-bundler.js",
      "require": "./jsx-runtime.js"
    },
    "./jsx-dev-runtime": {
      "types": "./dist/jsx-dev-runtime.d.ts",
      "import": "./dist/jsx-dev-runtime.esm-bundler.js",
      "require": "./jsx-dev-runtime.js"
    },
    "./jsx": {
      "types": "./src/jsx.d.ts"
    },
    "./*": "./*"
  }
}
```

不过你当前构建系统是否会给 `advanced.ts / internal.ts / jsx-runtime.ts` 产出独立 bundle，需要看 `scripts/build.ts` 的多入口支持。如果暂时不支持多入口，可以先用同一个 `dist/zeus.esm-bundler.js`：

```json
{
  "./advanced": {
    "types": "./dist/zeus.d.ts",
    "import": "./dist/zeus.esm-bundler.js",
    "require": "./dist/zeus.cjs.js"
  },
  "./internal": {
    "types": "./dist/zeus.d.ts",
    "import": "./dist/zeus.esm-bundler.js",
    "require": "./dist/zeus.cjs.js"
  }
}
```

但长期更推荐多入口构建。

---

# Phase B.5：给 `advanced/internal` 增加 CJS bridge

如果你沿用现在的 `index.js` CJS bridge 模式，需要新增：

```txt
packages/zeus/advanced.js
packages/zeus/internal.js
packages/zeus/jsx-runtime.js
packages/zeus/jsx-dev-runtime.js
```

## `packages/zeus/advanced.js`

```js
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/advanced.cjs.prod.js')
} else {
  module.exports = require('./dist/advanced.cjs.js')
}
```

## `packages/zeus/internal.js`

```js
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/internal.cjs.prod.js')
} else {
  module.exports = require('./dist/internal.cjs.js')
}
```

## `packages/zeus/jsx-runtime.js`

```js
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/jsx-runtime.cjs.prod.js')
} else {
  module.exports = require('./dist/jsx-runtime.cjs.js')
}
```

## `packages/zeus/jsx-dev-runtime.js`

```js
'use strict'

module.exports = require('./dist/jsx-dev-runtime.cjs.js')
```

同时 `files` 加上：

```json
{
  "files": [
    "index.js",
    "advanced.js",
    "internal.js",
    "jsx-runtime.js",
    "jsx-dev-runtime.js",
    "dist",
    "src/jsx.d.ts"
  ]
}
```


---

# Phase B.9：Public API 测试

新增测试，防止以后又把内部 helper 暴露到 `@zeus-js/zeus`。

## 新增文件

```txt
packages/zeus/__tests__/public-api.spec.ts
```

```ts
import { describe, expect, it } from 'vitest'

import * as zeus from '../src'

describe('@zeus-js/zeus public API', () => {
  it('exports stable user-facing APIs', () => {
    expect(zeus).toHaveProperty('state')
    expect(zeus).toHaveProperty('computed')
    expect(zeus).toHaveProperty('effect')
    expect(zeus).toHaveProperty('watch')
    expect(zeus).toHaveProperty('scope')
    expect(zeus).toHaveProperty('render')
    expect(zeus).toHaveProperty('Show')
    expect(zeus).toHaveProperty('For')
    expect(zeus).toHaveProperty('Host')
    expect(zeus).toHaveProperty('Slot')
    expect(zeus).toHaveProperty('defineElement')
  })

  it('does not export compiler/runtime internal helpers from main entry', () => {
    expect(zeus).not.toHaveProperty('template')
    expect(zeus).not.toHaveProperty('insert')
    expect(zeus).not.toHaveProperty('marker')
    expect(zeus).not.toHaveProperty('bindText')
    expect(zeus).not.toHaveProperty('bindAttr')
    expect(zeus).not.toHaveProperty('bindProp')
    expect(zeus).not.toHaveProperty('bindEvent')
    expect(zeus).not.toHaveProperty('mountShow')
    expect(zeus).not.toHaveProperty('mountFor')
  })
})
```

## advanced 测试

```txt
packages/zeus/__tests__/advanced-api.spec.ts
```

```ts
import { describe, expect, it } from 'vitest'

import * as advanced from '../src/advanced'

describe('@zeus-js/zeus/advanced', () => {
  it('exports advanced lifecycle and debugging APIs', () => {
    expect(advanced).toHaveProperty('stop')
    expect(advanced).toHaveProperty('getCurrentScope')
    expect(advanced).toHaveProperty('onScopeDispose')
    expect(advanced).toHaveProperty('getCurrentEffect')
  })
})
```

---

# Phase B.10：Type-level API 测试

新增：

```txt
packages/zeus/__tests__/public-api-types.test.ts
```

```ts
import {
  For,
  Host,
  Show,
  Slot,
  computed,
  defineElement,
  effect,
  render,
  scope,
  state,
  watch,
} from '../src'

void state
void computed
void effect
void watch
void scope
void render
void Show
void For
void Host
void Slot
void defineElement
```

如果你把 `stop` 从主入口移走，则这个测试里不要引入 `stop`。

---

# Phase B.11：文档更新

新增或修改：

```txt
docs/api/zeus.md
docs/api/signal.md
docs/api/runtime-dom.md
docs/api/stability.md
```

## `docs/api/zeus.md` 草案

````md
# @zeus-js/zeus

Main framework entry.

## Public APIs

- `state`
- `computed`
- `effect`
- `watch`
- `scope`
- `render`
- `Show`
- `For`
- `Host`
- `Slot`
- `defineElement`

## Advanced APIs

Advanced APIs are available from:

```ts
import { stop, getCurrentScope } from '@zeus-js/zeus/advanced'
```
````

## Internal APIs

Runtime helpers are not exported from the main entry.

Use `@zeus-js/runtime-dom` or `@zeus-js/zeus/internal` only if you know what you are doing.

````

## `docs/api/signal.md` 草案

```md
# @zeus-js/signal

Zeus reactivity core.

## Recommended

- `state`
- `computed`
- `effect`
- `watch`
- `scope`

---

# Phase B.12：ESLint 防回归规则，可选

可以在 `packages/zeus/src/index.ts` 上加注释约定：

```ts
// Do not export runtime-dom internal helpers here.
// Public framework APIs only.
````

更严格可以加测试，不需要一开始上 ESLint 自定义规则。

---

# Phase B 完成标准

Phase B 完成后，满足：

```txt
1. @zeus-js/zeus 主入口只暴露用户 API
2. @zeus-js/zeus/advanced 暴露高级控制 API
3. @zeus-js/zeus/internal 暴露内部 helper 或明确不提供
4. docs 说明主 API、advanced、internal 的边界
5. public API tests 防止内部 helper 回流主入口
6. pnpm build / build-dts / check / test-unit 通过
```

---

# 推荐提交顺序

```txt
1. refactor(zeus): narrow main public API
2. feat(zeus): add advanced entry
3. feat(zeus): add internal entry for runtime helpers
4. test(zeus): add public API boundary tests
5. docs(api): document public advanced internal APIs
6. chore(package): update exports for zeus
```

---

# 我的最终建议

你现在 `packages/zeus/src/index.ts` 已经做了一半收敛，而且注释也明确写了 “User-facing public API”。

Phase B 的重点不是大改，而是把这个边界制度化：

```txt
主入口：给用户
advanced：给高级用户
internal：给 compiler/runtime/测试
```

这样 Zeus 后续即使继续扩 runtime 和 compiler，也不会把内部 helper 变成 public breaking change。
