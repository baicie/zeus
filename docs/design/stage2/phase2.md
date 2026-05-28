下面给你 **Phase B：API 收敛与包出口稳定** 的详细设计与代码草案。

结合最新代码看，Phase B 其实已经开始做了：`packages/zeus/src/index.ts` 顶部已经写明它是 “User-facing public API”，并且内部 runtime helpers 改为从 `@zeus-js/runtime-dom` 直接导出。

但现在还没完全收口，主要问题是：

```txt
1. @zeus-js/zeus 仍导出了一些偏 internal/debug 的 API
2. @zeus-js/signal 主入口仍直接导出 ref/reactive 兼容 API
3. package exports 还没有明确 advanced / compat / internal 分层
4. 缺少 public API 回归测试，后续很容易又把内部 helper 暴露出去
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

@zeus-js/signal/compat
  ref/reactive/effectScope 等兼容 Vue-like 底层 API

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

# Phase B.6：`@zeus-js/signal` 拆 compat 出口

## 当前状态

`@zeus-js/signal` 主入口现在仍然直接导出 `ref / reactive / shallowRef / toRef / proxyRefs / reactive / readonly / markRaw / toRaw` 等兼容 API。

这和你前面定的心智有点冲突：

```txt
主推 state()
不主推 ref()
不主推 reactive()
```

## 建议做法

因为现在还没正式发稳定版，建议直接收敛：

```txt
@zeus-js/signal
  state/computed/effect/watch/scope/batch/untrack/scheduler

@zeus-js/signal/compat
  ref/reactive/effectScope 等底层兼容 API
```

## 新增文件

```txt
packages/signal/src/compat.ts
```

```ts
export {
  ref,
  shallowRef,
  isRef,
  toRef,
  toValue,
  toRefs,
  unref,
  proxyRefs,
  customRef,
  triggerRef,
  type Ref,
  type MaybeRef,
  type MaybeRefOrGetter,
  type ToRef,
  type ToRefs,
  type UnwrapRef,
  type ShallowRef,
  type ShallowUnwrapRef,
  type RefUnwrapBailTypes,
  type CustomRefFactory,
} from './ref'

export {
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  toReactive,
  toReadonly,
  type Raw,
  type DeepReadonly,
  type ShallowReactive,
  type UnwrapNestedRefs,
  type Reactive,
  type ReactiveMarker,
} from './reactive'

export { effectScope, EffectScope } from './effectScope'
```

---

# Phase B.7：收敛 `packages/signal/src/index.ts`

主入口建议改成：

```ts
export { state, isValueState, type State, type ValueState } from './state'

export {
  computed,
  type ComputedRef,
  type WritableComputedRef,
  type WritableComputedOptions,
  type ComputedGetter,
  type ComputedSetter,
} from './computed'

export {
  effect,
  stop,
  batch,
  untrack,
  getCurrentEffect,
  ReactiveEffect,
  EffectFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type EffectScheduler,
  type DebuggerOptions,
  type DebuggerEvent,
} from './effect'

export {
  watch,
  getCurrentWatcher,
  traverse,
  onWatcherCleanup,
  WatchErrorCodes,
  type WatchOptions,
  type WatchScheduler,
  type WatchStopHandle,
  type WatchHandle,
  type WatchEffect,
  type WatchSource,
  type WatchCallback,
  type OnCleanup,
} from './watch'

export { scope, type Scope } from './scope'

export { getCurrentScope, onScopeDispose } from './effectScope'

export { onCleanup } from './lifecycle'

export { queueJob, flushJobs, nextTick } from './scheduler'

// debug/advanced but still acceptable in signal package
export { TrackOpTypes, TriggerOpTypes, ReactiveFlags } from './constants'

export {
  trigger,
  track,
  ITERATE_KEY,
  ARRAY_ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
} from './dep'
```

是否保留 `ref/reactive` 在主入口，有两个选择：

## 选择 A：现在就移除

优点：API 心智最干净。
缺点：如果项目内部还从 `@zeus-js/signal` import `reactive/ref`，需要同步改 import。

## 选择 B：暂时保留但标注 deprecated

优点：迁移成本低。
缺点：主入口仍然不够干净。

我建议：**Phase B 先新增 `compat`，主入口暂时保留 compat 一版，文档标 deprecated；Phase C 或 alpha 发布前再决定是否移除。**

---

# Phase B.8：更新 `packages/signal/package.json` exports

当前 `signal` exports 只有根入口和 `./*`。

建议加明确 compat：

```json
{
  "exports": {
    ".": {
      "types": "./dist/signal.d.ts",
      "node": {
        "production": "./dist/signal.cjs.prod.js",
        "development": "./dist/signal.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/signal.esm-bundler.js",
      "import": "./dist/signal.esm-bundler.js",
      "require": "./index.js"
    },
    "./compat": {
      "types": "./dist/compat.d.ts",
      "import": "./dist/compat.esm-bundler.js",
      "require": "./compat.js"
    },
    "./*": "./*"
  }
}
```

如果暂时不支持多入口独立构建，短期可以：

```json
{
  "./compat": {
    "types": "./dist/signal.d.ts",
    "import": "./dist/signal.esm-bundler.js",
    "require": "./index.js"
  }
}
```

但长期要产出独立 `compat`。

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

## Compat

Vue-like low-level APIs are available from:

```ts
import { ref, reactive } from '@zeus-js/signal/compat'
````

Zeus applications should prefer `state()`.

````

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
4. @zeus-js/signal/compat 存在
5. docs 说明主 API、advanced、compat、internal 的边界
6. public API tests 防止内部 helper 回流主入口
7. pnpm build / build-dts / check / test-unit 通过
```

---

# 推荐提交顺序

```txt
1. refactor(zeus): narrow main public API
2. feat(zeus): add advanced entry
3. feat(zeus): add internal entry for runtime helpers
4. feat(signal): add compat entry
5. test(zeus): add public API boundary tests
6. docs(api): document public advanced compat internal APIs
7. chore(package): update exports for zeus and signal
```

---

# 我的最终建议

你现在 `packages/zeus/src/index.ts` 已经做了一半收敛，而且注释也明确写了 “User-facing public API”。

Phase B 的重点不是大改，而是把这个边界制度化：

```txt
主入口：给用户
advanced：给高级用户
compat：给迁移/底层
internal：给 compiler/runtime/测试
```

这样 Zeus 后续即使继续扩 runtime 和 compiler，也不会把内部 helper 变成 public breaking change。
