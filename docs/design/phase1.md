# Phase 1：Unified State API + Reactivity Core

> 状态：进行中
> 说明：详细设计草案。Phase 1 核心决策见 [`roadmap.md`](../roadmap.md) Phase 1 部分。

## 核心原则

1. 对外只主推 `state()` 一个状态入口
2. 不提供 `cell()` / `ref()` / `domRef()` 这类额外创建 API
3. DOM ref 只作为 JSX 属性协议：`<input ref={input} />`
4. 底层继续保留 reactive/ref 实现，但不作为主 API 暴露
5. `state(引用类型)` 走 reactive / Proxy
6. `state(基础类型或不可代理对象)` 走内部 ref-like value holder

## 框架心智

你这个框架最终心智应该是：

```tsx id="xfgl2k"
const count = state(0)
const user = state({ name: 'Zeus' })
const input = state<HTMLInputElement | null>(null)

return (
  <div>
    <input ref={input} />
    <button onClick={() => count.value++}>
      {user.name}: {count.value}
    </button>
  </div>
)
```

---

# Phase 1：Unified State API + Reactivity Core

## 1. 阶段目标

Phase 1 不再叫 “Signal Core”，而是：

```txt id="asmezz"
Unified State API + Vue-like Reactivity Core
```

目标是把当前已有的 `ref/reactive/computed/effect/watch/effectScope` 底层能力，重新包装成更适合 Zeus 的用户 API。

你当前 `@zeus-js/signal` 已经有完整的 `ref / reactive / computed / effect / watch / effectScope` 导出，所以 Phase 1 不需要重写底层，而是做 API 收束和语义固定。

最终用户主 API：

```ts id="x5lpbo"
state()
computed()
effect()
watch()
scope()
```

不主推：

```ts id="sprv06"
ref()
reactive()
cell()
domRef()
templateRef()
useState()
```

---

# 2. API 最终设计

## 2.1 `state()`

统一状态入口。

```ts id="gqhsmx"
const count = state(0)
// count.value

const user = state({
  name: 'Zeus',
})
// user.name

const list = state([{ id: 1, title: 'learn compiler' }])
// list.push(...)

const map = state(new Map<string, number>())
// map.set('a', 1)
```

规则：

```txt id="flmcl6"
state(plain object) -> reactive proxy
state(array)        -> reactive proxy
state(Map/Set)      -> reactive proxy
state(primitive)    -> value holder，需要 .value
state(Date/RegExp/Promise/Function/DOM Node) -> value holder
```

当前 `reactive.ts` 底层已经区分普通对象/数组和 Map/Set/WeakMap/WeakSet 这类集合类型，这个能力可以直接复用。

---

## 2.2 `computed()`

保持现有 API。

```ts id="r0kuc8"
const double = computed(() => count.value * 2)

console.log(double.value)
```

`computed` 继续返回 `.value` 访问的派生状态。当前实现已经有 `ComputedRefImpl`、`Dep`、`globalVersion` 等缓存机制，适合保留。

---

## 2.3 `effect()`

保持现有 API。

```ts id="zb88cj"
effect(() => {
  console.log(user.name)
  console.log(count.value)
})
```

runtime-dom 后续的 DOM 绑定都会基于 `effect()`。当前 `runtime-dom` 的 `bindText / bindAttr / bindProp` 已经是 `effect(() => ...)` 模式。

---

## 2.4 `watch()`

保持现有 API，用于业务监听。

```ts id="qwagl5"
watch(
  () => user.name,
  (name, oldName) => {
    console.log(name, oldName)
  },
)
```

当前 `watch.ts` 已经支持 `immediate / deep / once / scheduler / cleanup / pause / resume / stop`，Phase 1 主要是补测试和固定行为。

---

## 2.5 `scope()`

`scope()` 是 `effectScope()` 的用户侧新名字。

```ts id="rz72vp"
const s = scope()

s.run(() => {
  effect(() => {
    console.log(user.name)
  })
})

s.stop()
```

底层还是 `effectScope()`，当前 `EffectScope` 已经支持 `run / stop / pause / resume`，可以作为后续组件生命周期、render root、Web Components disconnected cleanup 的基础。

---

## 2.6 JSX `ref` 协议

不提供 `domRef()`。

直接用 `state(null)`：

```tsx id="lsbw43"
const input = state<HTMLInputElement | null>(null)

return <input ref={input} />
```

编译/runtime 语义：

```ts id="c9vfzz"
input.value = el
```

卸载时：

```ts id="kg0q93"
input.value = null
```

支持三种形式：

```tsx id="t4l7ra"
// 1. value holder
const input = state<HTMLInputElement | null>(null)
<input ref={input} />

// 2. callback ref
<input ref={el => console.log(el)} />

// 3. React-like object ref
const input = { current: null as HTMLInputElement | null }
<input ref={input} />
```

---

# 3. 包结构设计

Phase 1 建议改成：

```txt id="wo38mi"
packages/signal/src/
  index.ts          # 新 public API
  compat.ts         # 旧 ref/reactive API 兼容出口

  state.ts          # 新增：统一状态入口
  scope.ts          # 新增：effectScope 别名

  ref.ts            # 保留：内部 value holder 实现
  reactive.ts       # 保留：内部 proxy 实现
  computed.ts       # 保留
  effect.ts         # 保留，新增 batch/untrack/onCleanup 可选
  watch.ts          # 保留
  effectScope.ts    # 保留
  dep.ts            # 保留
```

runtime-dom 增加：

```txt id="43bm41"
packages/runtime-dom/src/ref.ts 或直接放 index.ts
  setRef()
  bindRef()
```

compiler 增加：

```txt id="2fk20u"
RefBindingIR
lower ref attribute
emit bindRef
```

---

# 4. `state.ts` 代码草案

核心：用户只用 `state()`。

```ts id="iaj170"
import { reactive, type Reactive } from './reactive'

import { ref, type Ref } from './ref'

export interface ValueState<T = unknown> {
  get value(): T
  set value(value: T)
}

type AnyMap = Map<any, any> | WeakMap<object, any>

type AnySet = Set<any> | WeakSet<object>

type ProxyableInput =
  | Record<PropertyKey, any>
  | readonly any[]
  | AnyMap
  | AnySet

export type State<T> = T extends ProxyableInput ? Reactive<T> : ValueState<T>

export function state<T extends ProxyableInput>(value: T): Reactive<T>
export function state<T = undefined>(): ValueState<T | undefined>
export function state<T>(value: T): ValueState<T>
export function state(value?: unknown): unknown {
  if (arguments.length === 0) {
    return ref()
  }

  return isProxyable(value) ? reactive(value as object) : ref(value)
}

export function isValueState<T = unknown>(
  value: unknown,
): value is ValueState<T> {
  return Boolean(value && typeof value === 'object' && 'value' in value)
}

function isProxyable(value: unknown): value is object {
  if (value === null || typeof value !== 'object') {
    return false
  }

  if (Array.isArray(value)) {
    return true
  }

  if (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet
  ) {
    return true
  }

  return isPlainObject(value)
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
```

这里故意让这些走 value holder：

```txt id="qq4gsu"
Date
RegExp
Error
Promise
Function
HTMLElement
class instance
```

例如：

```ts id="tpl9le"
const date = state(new Date())
// date.value 是 Date
```

这样比强行 Proxy 更安全。

---

# 5. `scope.ts` 代码草案

```ts id="toqe6r"
export {
  effectScope as scope,
  getCurrentScope,
  onScopeDispose,
  type EffectScope as Scope,
} from './effectScope'
```

---

# 6. `effect.ts` 建议补充

如果你希望 Phase 1 顺手把常用能力补齐，建议添加：

```ts id="cvlv46"
batch()
untrack()
onCleanup()
getCurrentEffect()
```

注意：你当前 `effect.ts` 里面已经有内部 `batch(subscriber)`、`startBatch()`、`endBatch()`，要避免和用户 API 的 `batch(fn)` 撞名。建议把内部函数改名。

## 6.1 内部 batch 改名

原来类似：

```ts id="ou0uvc"
export function batch(sub: Subscriber, isComputed = false): void {
  // ...
}
```

建议改成：

```ts id="o7xjvk"
function queueSubscriber(sub: Subscriber, isComputed = false): void {
  // 原 batch(sub, isComputed) 的逻辑
}
```

然后把内部调用：

```ts id="z0o7wk"
batch(this)
batch(this, true)
```

改成：

```ts id="qwf22f"
queueSubscriber(this)
queueSubscriber(this, true)
```

---

## 6.2 对外 batch

```ts id="vftgcs"
export function batch<T>(fn: () => T): T {
  startBatch()

  try {
    return fn()
  } finally {
    endBatch()
  }
}
```

---

## 6.3 untrack

```ts id="8xfqba"
export function untrack<T>(fn: () => T): T {
  pauseTracking()

  try {
    return fn()
  } finally {
    resetTracking()
  }
}
```

---

## 6.4 getCurrentEffect

```ts id="y72nq8"
export function getCurrentEffect(): ReactiveEffect | undefined {
  return activeSub instanceof ReactiveEffect ? activeSub : undefined
}
```

---

## 6.5 onCleanup

建议新建 `lifecycle.ts`，避免 effect.ts 太乱。

```ts id="1837vw"
import { getCurrentEffect, onEffectCleanup } from './effect'

import { getCurrentScope, onScopeDispose } from './effectScope'

import { warn } from './warning'

export function onCleanup(fn: () => void): void {
  if (getCurrentEffect()) {
    onEffectCleanup(fn, true)
    return
  }

  if (getCurrentScope()) {
    onScopeDispose(fn, true)
    return
  }

  if (__DEV__) {
    warn('onCleanup() was called without active effect or scope.')
  }
}
```

---

# 7. `index.ts` 代码草案

最终主入口只导出新 API。

```ts id="qrit7o"
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
} from './effect'

export {
  watch,
  getCurrentWatcher,
  traverse,
  onWatcherCleanup,
  type WatchOptions,
  type WatchScheduler,
  type WatchStopHandle,
  type WatchHandle,
  type WatchEffect,
  type WatchSource,
  type WatchCallback,
  type OnCleanup,
} from './watch'

export { scope, getCurrentScope, onScopeDispose, type Scope } from './scope'

export { onCleanup } from './lifecycle'
```

---

# 8. `compat.ts` 代码草案

旧 API 不从主入口主推，放到 compat。

```ts id="5zrdkr"
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
} from './reactive'

export { effectScope, EffectScope } from './effectScope'
```

`package.json` exports 增加：

```json id="mollm5"
{
  "exports": {
    ".": {
      "types": "./dist/signal.d.ts",
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

短期如果构建系统不方便多入口，可以先保留主入口兼容导出，但文档不写。等 Phase 1 结束后再切到 `./compat`。

---

# 9. runtime-dom：JSX ref 协议代码草案

当前 runtime-dom 已经有 `bindText / bindAttr / bindProp / bindEvent`。

新增 `setRef / bindRef`。

```ts id="5wgnmf"
import { onScopeDispose } from '@zeus-js/signal'

export type RefTarget<T> =
  | ((value: T | null) => void)
  | { value: T | null }
  | { current: T | null }

export function setRef<T>(
  target: RefTarget<T> | null | undefined,
  value: T | null,
): void {
  if (target == null) return

  if (typeof target === 'function') {
    target(value)
    return
  }

  if ('value' in target) {
    target.value = value
    return
  }

  if ('current' in target) {
    target.current = value
    return
  }

  if (__DEV__) {
    console.warn('[Zeus runtime] Invalid ref target:', target)
  }
}

export function bindRef<T extends Element>(
  el: T,
  target: RefTarget<T> | null | undefined,
): void {
  setRef(target, el)

  onScopeDispose(() => {
    setRef(target, null)
  }, true)
}
```

在 `runtime-dom/src/index.ts` 中导出：

```ts id="w037px"
export { setRef, bindRef, type RefTarget } from './ref'
```

MVP 阶段 ref 是绑定到元素创建时的，不需要 effect，因为 ref target 一般不应该动态变化。后面如果要支持动态 ref：

```tsx id="fs5a4i"
<div ref={condition ? refA : refB} />
```

再额外做动态 ref 更新。

---

# 10. compiler：ref 属性支持代码草案

当前 `lowerAttribute.ts` 已经处理了：

```txt id="b37a4s"
spread attribute -> 报错
onXxx -> EventBinding
prop:xxx -> PropBinding
其他表达式 -> AttrBinding
```

所以要在 `onXxx` 判断之前，先处理 `ref`。

---

## 10.1 IR 增加 RefBinding

`packages/compiler/src/ir/nodes.ts`

```ts id="a1djer"
export type RefBindingIR = SemanticBaseIRNode & {
  kind: 'RefBinding'
  expr: t.Expression
}

export type AttributeIR =
  | StaticAttributeIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR
  | RefBindingIR
```

---

## 10.2 semanticBuilders 增加 refBindingIR

假设你有 `ir/semanticBuilders.ts`，增加：

```ts id="smx631"
import * as t from '@babel/types'

import type { RefBindingIR } from './nodes'

let id = 0

export function refBindingIR(expr: t.Expression): RefBindingIR {
  return {
    id: id++,
    kind: 'RefBinding',
    expr,
  }
}
```

如果你现在已有统一 `nextId()`，就复用已有的。

---

## 10.3 lowerAttribute 支持 ref

`packages/compiler/src/lower/lowerAttribute.ts`

```ts id="ujdqnb"
import * as t from '@babel/types'

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import {
  attrBindingIR,
  eventBindingIR,
  propBindingIR,
  refBindingIR,
  staticAttrIR,
} from '../ir/semanticBuilders'
import { getJSXAttrName, toEventName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { AttributeIR } from '../ir/nodes'
import type { NodePath } from '@babel/core'

export function lowerAttribute(
  path: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
  _context: CompilerContext,
): AttributeIR | null {
  if (path.isJSXSpreadAttribute() || t.isJSXSpreadAttribute(path.node)) {
    throw new CompilerError({
      code: CompilerErrorCode.UNSUPPORTED_SPREAD_ATTRIBUTE,
      message: 'Spread attributes are not supported in Zeus MVP.',
      path,
      hint: 'Use explicit attributes instead, for example <div id={id} />.',
    })
  }

  const node = path.node
  const name = getJSXAttrName(node.name)
  const value = node.value

  if (!value) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: 'ref attribute requires an expression.',
        path,
        hint: 'Use <div ref={target} /> instead.',
      })
    }

    return staticAttrIR(name, true)
  }

  if (t.isStringLiteral(value)) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.INVALID_REF_USAGE,
        message: 'String refs are not supported in Zeus.',
        path,
        hint: 'Use a state holder or callback ref: <div ref={el} />.',
      })
    }

    return staticAttrIR(name, value.value)
  }

  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression

    if (t.isJSXEmptyExpression(expr)) {
      throw new CompilerError({
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: `Attribute "${name}" expression cannot be empty.`,
        path,
      })
    }

    if (name === 'ref') {
      return refBindingIR(expr)
    }

    if (name.startsWith('on') && name.length > 2) {
      return eventBindingIR(toEventName(name), expr)
    }

    if (name.startsWith('prop:')) {
      return propBindingIR(name.slice('prop:'.length), expr)
    }

    return attrBindingIR(name, expr)
  }

  return null
}
```

需要在 `CompilerErrorCode` 里新增：

```ts id="p53h99"
INVALID_REF_USAGE = 'INVALID_REF_USAGE'
```

如果你目前 enum 是数字，也按当前风格补一项。

---

## 10.4 emitBinding 支持 RefBinding

`packages/compiler/src/codegen/dom/emitBinding.ts`

在 `emitBindings` 中增加：

```ts id="k47zvz"
if (attr.kind === 'RefBinding') {
  statements.push(emitRefBinding(node, attr, context))
}
```

新增函数：

```ts id="73szpv"
import type { RefBindingIR } from '../../ir/nodes'

function emitRefBinding(
  target: ElementIR,
  binding: RefBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindRef'), [
      t.identifier(target.ref.name),
      binding.expr,
    ]),
  )
}
```

---

## 10.5 hasRuntimeWork 支持 RefBinding

`emitElement.ts` 中：

```ts id="z1jdyj"
function hasRuntimeWork(node: ElementIR): boolean {
  return (
    node.attrs.some(
      attr =>
        attr.kind === 'AttrBinding' ||
        attr.kind === 'PropBinding' ||
        attr.kind === 'EventBinding' ||
        attr.kind === 'RefBinding',
    ) || node.children.some(hasChildRuntimeWork)
  )
}
```

---

# 11. 测试规划

## 11.1 signal 测试

新增：

```txt id="snrmgy"
packages/signal/__tests__/state.spec.ts
packages/signal/__tests__/scope.spec.ts
packages/signal/__tests__/watch.spec.ts
packages/signal/__tests__/computed.spec.ts
packages/signal/__tests__/effect.spec.ts
```

---

## 11.2 `state.spec.ts`

```ts id="tc2gxc"
import { describe, expect, it, vi } from 'vitest'

import { state, effect, computed, isValueState } from '../src'

describe('state', () => {
  it('creates value state for primitive', () => {
    const count = state(0)

    expect(isValueState(count)).toBe(true)
    expect(count.value).toBe(0)

    count.value++
    expect(count.value).toBe(1)
  })

  it('creates reactive state for plain object', () => {
    const user = state({
      name: 'Zeus',
    })

    expect(user.name).toBe('Zeus')

    user.name = 'ZeusJS'

    expect(user.name).toBe('ZeusJS')
  })

  it('tracks primitive value state', () => {
    const count = state(0)
    const fn = vi.fn(() => count.value)

    effect(fn)

    expect(fn).toHaveBeenCalledTimes(1)

    count.value++

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('tracks reactive object property', () => {
    const user = state({
      name: 'Zeus',
    })

    const fn = vi.fn(() => user.name)

    effect(fn)

    expect(fn).toHaveBeenCalledTimes(1)

    user.name = 'ZeusJS'

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('supports computed from primitive and object state', () => {
    const count = state(1)
    const user = state({
      name: 'Zeus',
    })

    const title = computed(() => `${user.name}:${count.value}`)

    expect(title.value).toBe('Zeus:1')

    count.value++
    user.name = 'ZeusJS'

    expect(title.value).toBe('ZeusJS:2')
  })

  it('creates value state for Date', () => {
    const now = new Date()
    const date = state(now)

    expect(isValueState(date)).toBe(true)
    expect(date.value).toBe(now)
  })

  it('creates reactive state for array', () => {
    const list = state([{ id: 1 }])
    let length = 0

    effect(() => {
      length = list.length
    })

    expect(length).toBe(1)

    list.push({ id: 2 })

    expect(length).toBe(2)
  })

  it('creates reactive state for Map', () => {
    const map = state(new Map<string, number>())
    let value: number | undefined

    effect(() => {
      value = map.get('a')
    })

    expect(value).toBeUndefined()

    map.set('a', 1)

    expect(value).toBe(1)
  })
})
```

---

## 11.3 runtime-dom ref 测试

```ts id="y2qkz7"
import { describe, expect, it, vi } from 'vitest'

import { state, scope } from '@zeus-js/signal'
import { bindRef, setRef } from '../src'

describe('runtime ref', () => {
  it('sets value state ref', () => {
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(null)

    setRef(input, el)

    expect(input.value).toBe(el)
  })

  it('sets callback ref', () => {
    const el = document.createElement('input')
    const fn = vi.fn()

    setRef(fn, el)

    expect(fn).toHaveBeenCalledWith(el)
  })

  it('sets current object ref', () => {
    const el = document.createElement('input')
    const input = { current: null as HTMLInputElement | null }

    setRef(input, el)

    expect(input.current).toBe(el)
  })

  it('clears ref on scope dispose', () => {
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(null)

    const s = scope()

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.value).toBe(el)

    s.stop()

    expect(input.value).toBe(null)
  })
})
```

---

## 11.4 compiler ref snapshot 测试

新增：

```ts id="x4d2c9"
it('compiles element ref', async () => {
  const code = `
    const App = () => {
      const input = state<HTMLInputElement | null>(null)
      return <input ref={input} />
    }
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望生成类似：

```ts id="l4nzhf"
import {
  bindRef as _bindRef,
  template as _template,
} from '@zeus-js/runtime-dom'

var _tmpl$ = /*#__PURE__*/ _template(`<input>`)

const App = () => {
  const input = state<HTMLInputElement | null>(null)
  return (() => {
    const _el$ = _tmpl$().firstChild
    _bindRef(_el$, input)
    return _el$
  })()
}
```

---

# 12. Phase 1 任务拆分

## Phase 1.1：新增 state API

```txt id="ez8x91"
- 新增 state.ts
- state(primitive) 返回 value holder
- state(object/array/map/set) 返回 reactive proxy
- 新增 isValueState()
- index.ts 导出 state()
```

验收：

```ts id="zocpyy"
const count = state(0)
count.value++

const user = state({ name: 'Zeus' })
user.name = 'ZeusJS'
```

---

## Phase 1.2：隐藏 ref/reactive 主入口

```txt id="jk3ats"
- 新增 compat.ts
- ref/reactive/effectScope 移到 compat 出口
- 主文档只写 state/computed/effect/watch/scope
```

短期可保留 root 兼容，最终建议：

```ts id="h7bn78"
import { state } from '@zeus-js/signal'
import { ref, reactive } from '@zeus-js/signal/compat'
```

---

## Phase 1.3：scope 命名层

```txt id="upw9y5"
- 新增 scope.ts
- scope() alias effectScope()
- 继续导出 getCurrentScope/onScopeDispose
```

---

## Phase 1.4：batch / untrack / onCleanup

```txt id="nt2lot"
- 内部 batch(sub) 改名 queueSubscriber()
- 对外新增 batch(fn)
- 新增 untrack(fn)
- 新增 getCurrentEffect()
- 新增 lifecycle.ts/onCleanup()
```

这一步是后续 runtime 和组件生命周期的基础。

---

## Phase 1.5：JSX ref 协议

```txt id="iet7zu"
- runtime-dom 新增 setRef/bindRef
- compiler IR 新增 RefBindingIR
- lowerAttribute 支持 ref={expr}
- emitBinding 输出 bindRef(el, expr)
- ref 卸载时置 null
```

---

## Phase 1.6：测试补齐

```txt id="nsgllw"
- state.spec.ts
- effect.spec.ts
- computed.spec.ts
- watch.spec.ts
- scope.spec.ts
- runtime-dom ref.spec.ts
- compiler ref snapshot
```

重点测试矩阵：

```txt id="ik0czt"
state(0)
state('')
state(null)
state(undefined)
state({})
state([])
state(new Map())
state(new Set())
state(new Date())
state(() => {})
state(class instance)
```

---

# 13. Phase 1 完成标准

下面代码全部成立，Phase 1 就算完成：

```tsx id="x7qeef"
import { state, computed, effect, watch, scope } from '@zeus-js/signal'

function App() {
  const count = state(0)

  const user = state({
    name: 'Zeus',
    age: 1,
    todos: ['learn compiler'],
  })

  const input = state<HTMLInputElement | null>(null)

  const double = computed(() => count.value * 2)

  watch(
    () => user.age,
    age => {
      console.log('age changed:', age)
    },
  )

  effect(() => {
    console.log(user.name)
    console.log(count.value)
    console.log(double.value)
  })

  return (
    <div>
      <input ref={input} />

      <button onClick={() => count.value++}>
        {user.name}: {count.value}
      </button>
    </div>
  )
}
```

满足：

```txt id="h8fihj"
1. 用户不需要 ref()/cell()/domRef()
2. state() 是唯一主状态入口
3. primitive 使用 .value
4. object/array/map/set 直接属性级响应式
5. JSX ref={} 可以接收 state(null)
6. ref 卸载后自动清空为 null
7. computed/effect/watch/scope 全部基于 state 正常工作
8. ref/reactive 作为 compat 能力保留，但不主推
```

---

# 14. 最终 Phase 1 结论

最终版 Phase 1 是：

```txt id="ukv7bp"
Phase 1：Unified State API + Reactivity Core
```

核心方案：

```txt id="gj9s0x"
state() 是唯一主状态 API。
state(引用类型) -> reactive proxy。
state(基础类型/不可代理对象) -> 内部 ref-like value holder。
DOM ref 不提供创建 API，只作为 JSX ref={} 协议。
ref/reactive 继续作为底层实现和 compat API 保留。
```

这套设计比较适合 Zeus，因为它同时保留了：

```txt id="lacy2q"
Vue 的引用类型响应式能力
Solid/Svelte 风格的无 VDOM 细粒度更新
JSX 下清晰的 ref={} DOM 引用语义
一个 state() 统一心智
```
