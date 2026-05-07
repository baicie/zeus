下面这版按 **`packages/core` 可直接开写** 的粒度来给。
目标是：

- 以 `createReactiveSystem()` 为内核
- 对外暴露你定下来的 7 个 API
- 先保证结构正确
- 先不追求和 alien-signals 一样极限优化的写法

我会用“**Zeus 可实现版骨架**”来写，而不是追求一次写满所有边角。

---

# 一、目录结构

```txt
packages/core/
├─ src/
│  ├─ types.ts
│  ├─ system.ts
│  ├─ owner.ts
│  ├─ signal.ts
│  ├─ computed.ts
│  ├─ effect.ts
│  ├─ batch.ts
│  ├─ untrack.ts
│  ├─ root.ts
│  ├─ cleanup.ts
│  ├─ flush.ts
│  └─ index.ts
└─ package.json
```

---

# 二、公开 API

```ts
// packages/core/src/index.ts
export { createSignal } from './signal'
export { createComputed } from './computed'
export { createEffect } from './effect'
export { createRoot } from './root'
export { onCleanup } from './cleanup'
export { batch } from './batch'
export { untrack } from './untrack'

export type {
  Accessor,
  Setter,
  CleanupFn,
  Owner,
  SignalNode,
  ComputedNode,
  EffectNode,
} from './types'
```

---

# 三、基础类型

```ts
// packages/core/src/types.ts
import type { Link, ReactiveFlags, ReactiveNode } from 'alien-signals/system'

export type Accessor<T> = () => T
export type Setter<T> = (next: T | ((prev: T) => T)) => T
export type CleanupFn = () => void

export interface Owner {
  parent: Owner | null
  children: Owner[]
  effects: EffectNode[]
  cleanups: CleanupFn[]
  disposed: boolean
}

export interface BaseNode extends ReactiveNode {
  deps?: Link | undefined
  depsTail?: Link | undefined
  subs?: Link | undefined
  subsTail?: Link | undefined
  flags: ReactiveFlags
}

export interface SignalNode<T> extends BaseNode {
  kind: 'signal'
  value: T
  pendingValue: T
  update(): boolean
  get(): T
  set(value: T): void
}

export interface ComputedNode<T> extends BaseNode {
  kind: 'computed'
  value: T | undefined
  getter: () => T
  update(): boolean
  get(): T
}

export interface EffectNode extends BaseNode {
  kind: 'effect'
  fn: () => void
  owner: Owner | null
  stopped: boolean
  run(): void
  stop(): void
}
```

---

# 四、system.ts：内核桥接层

这是最重要的一层。
这里放：

- `createReactiveSystem()` 返回的原语
- 全局执行状态
- flush 队列
- 活跃订阅者 `activeSub`

```ts
// packages/core/src/system.ts
import {
  createReactiveSystem,
  ReactiveFlags,
  type Link,
  type ReactiveNode,
} from 'alien-signals/system'

import type { EffectNode, SignalNode, ComputedNode, Owner } from './types'

export let activeSub: ReactiveNode | undefined = undefined
export let currentOwner: Owner | null = null
export let cycle = 0
export let batchDepth = 0

const effectQueue: EffectNode[] = []
const queuedEffects = new Set<EffectNode>()

export function enqueueEffect(effect: EffectNode) {
  if (effect.stopped) return
  if (queuedEffects.has(effect)) return
  queuedEffects.add(effect)
  effectQueue.push(effect)
}

export function flushEffects() {
  while (effectQueue.length) {
    const effect = effectQueue.shift()!
    queuedEffects.delete(effect)
    if (!effect.stopped) {
      effect.run()
    }
  }
}

export function maybeFlushEffects() {
  if (batchDepth === 0) {
    flushEffects()
  }
}

export const { link, unlink, propagate, checkDirty, shallowPropagate } =
  createReactiveSystem({
    update(node: SignalNode<any> | ComputedNode<any>) {
      return node.update()
    },

    notify(node: EffectNode) {
      enqueueEffect(node)
    },

    unwatched(_node) {
      // MVP 先留空
      // 后面可用于 computed 没有订阅者时的缓存释放/调试钩子
    },
  })

export function shouldUpdate(node: ReactiveNode): boolean {
  const flags = node.flags

  if (flags & ReactiveFlags.Dirty) {
    return true
  }

  if (flags & ReactiveFlags.Pending) {
    if (checkDirty((node as any).deps, node)) {
      return true
    }
    node.flags = flags & ~ReactiveFlags.Pending
  }

  return false
}
```

---

# 五、owner.ts：Zeus 自己的作用域系统

这个不是 alien-signals 的图算法本身，而是 Zeus 的框架层生命周期。

```ts
// packages/core/src/owner.ts
import type { Owner, EffectNode } from './types'
import { currentOwner } from './system'

export function getOwner(): Owner | null {
  return currentOwner
}

export function createOwner(parent: Owner | null): Owner {
  const owner: Owner = {
    parent,
    children: [],
    effects: [],
    cleanups: [],
    disposed: false,
  }

  if (parent) {
    parent.children.push(owner)
  }

  return owner
}

export function attachEffectToOwner(owner: Owner | null, effect: EffectNode) {
  if (!owner) return
  owner.effects.push(effect)
}

export function runWithOwner<T>(
  owner: Owner | null,
  fn: () => T,
  setCurrentOwner: (owner: Owner | null) => void,
): T {
  const prev = currentOwner
  setCurrentOwner(owner)
  try {
    return fn()
  } finally {
    setCurrentOwner(prev)
  }
}
```

上面 `setCurrentOwner` 这样传有点丑，下面我会在 `system.ts` 里补 setter，让代码更顺。

补一个：

```ts
// packages/core/src/system.ts 追加
export function setCurrentOwner(owner: Owner | null) {
  currentOwner = owner
}

export function setActiveSub(sub: ReactiveNode | undefined) {
  activeSub = sub
}
```

然后 `runWithOwner` 改成：

```ts
// packages/core/src/owner.ts
import { currentOwner, setCurrentOwner } from './system'

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = currentOwner
  setCurrentOwner(owner)
  try {
    return fn()
  } finally {
    setCurrentOwner(prev)
  }
}
```

---

# 六、cleanup.ts：注册和销毁

```ts
// packages/core/src/cleanup.ts
import { currentOwner } from './system'
import type { CleanupFn, Owner } from './types'

export function onCleanup(fn: CleanupFn) {
  if (!currentOwner) {
    throw new Error(
      'onCleanup() must be called inside createRoot() or createEffect().',
    )
  }
  currentOwner.cleanups.push(fn)
}

export function disposeOwner(owner: Owner) {
  if (owner.disposed) return
  owner.disposed = true

  for (const child of owner.children) {
    disposeOwner(child)
  }

  for (const effect of owner.effects) {
    effect.stop()
  }

  for (const cleanup of owner.cleanups) {
    cleanup()
  }

  owner.children.length = 0
  owner.effects.length = 0
  owner.cleanups.length = 0
}
```

---

# 七、batch.ts 和 untrack.ts

这两个很直。

```ts
// packages/core/src/batch.ts
import { batchDepth, flushEffects } from './system'

export function batch<T>(fn: () => T): T {
  // 直接修改导入绑定不行，所以要走 setter
  throw new Error('implemented in next snippet')
}
```

上面因为 ES module 导入是只读绑定，所以我们把计数操作放回 `system.ts`。

补到 `system.ts`：

```ts
// packages/core/src/system.ts 追加
export function startBatch() {
  batchDepth++
}

export function endBatch() {
  batchDepth--
  if (batchDepth === 0) {
    flushEffects()
  }
}
```

然后：

```ts
// packages/core/src/batch.ts
import { startBatch, endBatch } from './system'

export function batch<T>(fn: () => T): T {
  startBatch()
  try {
    return fn()
  } finally {
    endBatch()
  }
}
```

`untrack`：

```ts
// packages/core/src/untrack.ts
import { activeSub, setActiveSub } from './system'

export function untrack<T>(fn: () => T): T {
  const prev = activeSub
  setActiveSub(undefined)
  try {
    return fn()
  } finally {
    setActiveSub(prev)
  }
}
```

---

# 八、signal.ts

这是第一个真正的节点实现。

```ts
// packages/core/src/signal.ts
import { ReactiveFlags } from 'alien-signals/system'
import type { Accessor, Setter, SignalNode } from './types'
import {
  activeSub,
  link,
  maybeFlushEffects,
  propagate,
  shallowPropagate,
  shouldUpdate,
  cycle,
} from './system'

class ZeusSignal<T> implements SignalNode<T> {
  kind = 'signal' as const

  subs = undefined
  subsTail = undefined
  flags = ReactiveFlags.Mutable

  value: T
  pendingValue: T

  constructor(value: T) {
    this.value = value
    this.pendingValue = value
  }

  get(): T {
    if (shouldUpdate(this) && this.update()) {
      if (this.subs) {
        shallowPropagate(this.subs)
      }
    }

    if (activeSub) {
      link(this, activeSub, cycle)
    }

    return this.value
  }

  set(value: T): void {
    this.pendingValue = value
    this.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty

    if (this.subs) {
      propagate(this.subs)
    }

    maybeFlushEffects()
  }

  update(): boolean {
    this.flags = ReactiveFlags.Mutable
    return !Object.is(this.value, (this.value = this.pendingValue))
  }
}

export function createSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  const node = new ZeusSignal(initial)

  const get: Accessor<T> = () => node.get()

  const set: Setter<T> = next => {
    const value =
      typeof next === 'function' ? (next as (prev: T) => T)(node.get()) : next

    if (Object.is(value, node.value)) {
      return node.value
    }

    node.set(value)
    return value
  }

  return [get, set]
}
```

---

# 九、computed.ts

我建议把 `createComputed` 做成返回 accessor。

```ts
// packages/core/src/computed.ts
import { ReactiveFlags } from 'alien-signals/system'
import type { Accessor, ComputedNode } from './types'
import {
  activeSub,
  cycle as currentCycle,
  link,
  setActiveSub,
  setCurrentOwner,
  shallowPropagate,
  shouldUpdate,
  unlink,
} from './system'
import { currentOwner } from './system'

class ZeusComputed<T> implements ComputedNode<T> {
  kind = 'computed' as const

  value: T | undefined = undefined
  getter: () => T

  subs = undefined
  subsTail = undefined
  deps = undefined
  depsTail = undefined

  flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty

  constructor(getter: () => T) {
    this.getter = getter
  }

  get(): T {
    if (shouldUpdate(this) && this.update()) {
      if (this.subs) {
        shallowPropagate(this.subs)
      }
    }

    if (activeSub) {
      link(this, activeSub, currentCycle)
    }

    return this.value as T
  }

  update(): boolean {
    // 这里不能直接 ++import 变量，所以 system.ts 里补一个 nextCycle()
    throw new Error('implemented in next snippet')
  }
}

export function createComputed<T>(getter: () => T): Accessor<T> {
  const node = new ZeusComputed(getter)
  return () => node.get()
}
```

补 `system.ts`：

```ts
// packages/core/src/system.ts 追加
export function nextCycle() {
  cycle++
  return cycle
}
```

然后完成 `computed.ts`：

```ts
// packages/core/src/computed.ts
import { ReactiveFlags } from 'alien-signals/system'
import type { Accessor, ComputedNode } from './types'
import {
  activeSub,
  currentOwner,
  link,
  nextCycle,
  setActiveSub,
  shallowPropagate,
  shouldUpdate,
  unlink,
} from './system'

class ZeusComputed<T> implements ComputedNode<T> {
  kind = 'computed' as const

  value: T | undefined = undefined
  getter: () => T

  subs = undefined
  subsTail = undefined
  deps = undefined
  depsTail = undefined

  flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty

  constructor(getter: () => T) {
    this.getter = getter
  }

  get(): T {
    if (shouldUpdate(this) && this.update()) {
      if (this.subs) {
        shallowPropagate(this.subs)
      }
    }

    if (activeSub) {
      link(this, activeSub, nextCycle())
    }

    return this.value as T
  }

  update(): boolean {
    nextCycle()
    this.depsTail = undefined
    this.flags = ReactiveFlags.Mutable | ReactiveFlags.RecursedCheck

    const prevSub = activeSub
    setActiveSub(this)

    try {
      const nextValue = this.getter()
      return !Object.is(this.value, (this.value = nextValue))
    } finally {
      setActiveSub(prevSub)
      this.flags &= ~ReactiveFlags.RecursedCheck

      let toRemove =
        this.depsTail !== undefined ? (this.depsTail as any).nextDep : this.deps

      while (toRemove) {
        toRemove = unlink(toRemove, this)
      }
    }
  }
}

export function createComputed<T>(getter: () => T): Accessor<T> {
  const node = new ZeusComputed(getter)
  return () => node.get()
}
```

这里有个小点：`link(this, activeSub, nextCycle())` 这句我不满意。
更合理是 **不要在 `get()` 里递增 cycle**，cycle 应该代表一次求值/执行轮次，而不是一次读取。

所以拍板：

- `cycle` 只在 `update()` / `run()` 时递增
- `get()` 里 `link(..., cycle)` 直接用当前 cycle

把 `computed.ts` 改好：

```ts
// packages/core/src/computed.ts
import { ReactiveFlags } from 'alien-signals/system'
import type { Accessor, ComputedNode } from './types'
import {
  activeSub,
  cycle,
  link,
  nextCycle,
  setActiveSub,
  shallowPropagate,
  shouldUpdate,
  unlink,
} from './system'

class ZeusComputed<T> implements ComputedNode<T> {
  kind = 'computed' as const

  value: T | undefined = undefined
  getter: () => T

  subs = undefined
  subsTail = undefined
  deps = undefined
  depsTail = undefined

  flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty

  constructor(getter: () => T) {
    this.getter = getter
  }

  get(): T {
    if (shouldUpdate(this) && this.update()) {
      if (this.subs) {
        shallowPropagate(this.subs)
      }
    }

    if (activeSub) {
      link(this, activeSub, cycle)
    }

    return this.value as T
  }

  update(): boolean {
    nextCycle()
    this.depsTail = undefined
    this.flags = ReactiveFlags.Mutable | ReactiveFlags.RecursedCheck

    const prevSub = activeSub
    setActiveSub(this)

    try {
      const nextValue = this.getter()
      return !Object.is(this.value, (this.value = nextValue))
    } finally {
      setActiveSub(prevSub)
      this.flags &= ~ReactiveFlags.RecursedCheck

      let toRemove =
        this.depsTail !== undefined ? (this.depsTail as any).nextDep : this.deps

      while (toRemove) {
        toRemove = unlink(toRemove, this)
      }
    }
  }
}

export function createComputed<T>(getter: () => T): Accessor<T> {
  const node = new ZeusComputed(getter)
  return () => node.get()
}
```

---

# 十、effect.ts

这里要把 effect 和 owner 体系接起来。

```ts
// packages/core/src/effect.ts
import { ReactiveFlags } from 'alien-signals/system'
import type { EffectNode } from './types'
import {
  activeSub,
  currentOwner,
  cycle,
  link,
  nextCycle,
  setActiveSub,
  setCurrentOwner,
  unlink,
} from './system'
import { attachEffectToOwner, createOwner } from './owner'
import { disposeOwner } from './cleanup'

class ZeusEffect implements EffectNode {
  kind = 'effect' as const

  deps = undefined
  depsTail = undefined
  flags = ReactiveFlags.Watching

  owner = currentOwner
  stopped = false

  fn: () => void

  private executionOwner = createOwner(this.owner)

  constructor(fn: () => void) {
    this.fn = fn
    attachEffectToOwner(this.owner, this)
  }

  run(): void {
    if (this.stopped) return

    // 每次重跑先销毁上轮执行作用域
    disposeOwner(this.executionOwner)
    this.executionOwner = createOwner(this.owner)

    nextCycle()
    this.depsTail = undefined
    this.flags = ReactiveFlags.Watching | ReactiveFlags.RecursedCheck

    const prevSub = activeSub
    const prevOwner = currentOwner

    setActiveSub(this)
    setCurrentOwner(this.executionOwner)

    try {
      this.fn()
    } finally {
      setActiveSub(prevSub)
      setCurrentOwner(prevOwner)
      this.flags &= ~ReactiveFlags.RecursedCheck

      let toRemove =
        this.depsTail !== undefined ? (this.depsTail as any).nextDep : this.deps

      while (toRemove) {
        toRemove = unlink(toRemove, this)
      }
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true

    disposeOwner(this.executionOwner)

    let dep = this.deps
    while (dep) {
      dep = unlink(dep, this)
    }
  }
}

export function createEffect(fn: () => void): () => void {
  const effect = new ZeusEffect(fn)
  effect.run()
  return () => effect.stop()
}
```

这个实现的关键点是：

- 每个 effect 自带一个 `executionOwner`
- effect 重跑前，先把上一次执行期间挂进去的 cleanup / 子 effect 全部 dispose
- 这就能模拟你想要的 `onCleanup()` 语义

这也是 Zeus 接近 Solid 风格的一种方式。

---

# 十一、root.ts

```ts
// packages/core/src/root.ts
import { createOwner, runWithOwner } from './owner'
import { disposeOwner } from './cleanup'
import { currentOwner } from './system'

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const owner = createOwner(currentOwner)

  return runWithOwner(owner, () => {
    return fn(() => disposeOwner(owner))
  })
}
```

---

# 十二、这版 API 的使用方式

```ts
import {
  createSignal,
  createComputed,
  createEffect,
  createRoot,
  onCleanup,
  batch,
  untrack,
} from '@zeus/core'

const [count, setCount] = createSignal(0)

const doubled = createComputed(() => count() * 2)

const stop = createEffect(() => {
  console.log('doubled =', doubled())
})

batch(() => {
  setCount(1)
  setCount(2)
})

createRoot(dispose => {
  const stopInner = createEffect(() => {
    console.log(count())
    onCleanup(() => {
      console.log('cleanup inner effect run')
    })
  })

  return dispose
})

console.log(untrack(() => count()))
stop()
```

---

# 十三、这版里哪些地方是“先够用”，哪些要后续优化

## 已经够你做 Zeus MVP 的

- `createSignal`
- `createComputed`
- `createEffect`
- `createRoot`
- `onCleanup`
- `batch`
- `untrack`

## 还需要后续优化的

### 1. `EffectNode` 从 owner.effects 中移除

现在 stop 之后没有从数组里清掉，可以补一个移除逻辑。

### 2. `depsTail.nextDep` 的类型

这里我用 `as any` 过了，实际你应该把 `Link` 类型结构补齐。

### 3. `Computed` 的缓存释放策略

后面可以接 `unwatched()` 做没人订阅时的优化。

### 4. 错误处理

如果 effect 里抛错，是否要继续 flush 队列，要明确策略。

### 5. 批处理与 effect 调度策略

当前是同步 flush，可以后面再做 scheduler。

---

# 十四、我建议你下一步马上补的 3 个测试

## 1. 动态依赖切换

```ts
const [ok, setOk] = createSignal(true)
const [a, setA] = createSignal(1)
const [b, setB] = createSignal(2)

const value = createComputed(() => (ok() ? a() : b()))
```

验证切换后旧依赖不再触发。

---

## 2. effect cleanup

```ts
const [count, setCount] = createSignal(0)

createEffect(() => {
  count()
  onCleanup(() => console.log('cleanup'))
})
```

验证每次重跑前都会 cleanup。

---

## 3. root dispose

```ts
const [count, setCount] = createSignal(0)

const dispose = createRoot(dispose => {
  createEffect(() => console.log(count()))
  return dispose
})

dispose()
setCount(1)
```

验证 dispose 后 effect 不再触发。

---

# 十五、我的建议：先别急着把这版写到“最优”

最好的推进方式是：

1. 先按这版骨架把 `core` 写出来
2. 跑通单元测试
3. 先接上 `runtime-dom` 的 `bindText`
4. 再回头修 `Link` 类型和 owner 细节

因为只要 `core` 能稳定跑这几个测试，Zeus 的后面很多东西就能开工了。

---

如果你要，我下一条直接继续给你：

**`packages/runtime-dom` 的第一版实现骨架**，让这套 `core` 立刻接到 DOM 上。
