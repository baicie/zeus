# Zeus Reactive Alien Split

基于你提供的 `createReactiveSystem` 自定义响应式核心继续扩展，保留 `signal / computed / effect / effectScope / trigger / batch`，并新增 Vue-like 但面向 Zeus 可拆分演进的引用类型响应式层。

## 目录

```txt
src/
  index.ts                    # 总出口
  system.ts                   # 你保留的 alien-signals/system 自定义响应式核心
  reactive/
    index.ts                  # reactive 模块出口
    reactive.ts               # reactive/readonly/shallow/toRaw/markRaw
    baseHandlers.ts           # Object/Array 代理逻辑
    collectionHandlers.ts     # Map/Set 代理逻辑
    dep.ts                    # target/key -> signal dep
    constants.ts              # flags / iterate key
    utils.ts                  # 工具函数
```

## 能力覆盖

- 第一阶段：`signal` 原样保留，新增 `reactive(object / array)`，支持普通对象深层响应式。
- 第二阶段：支持 Array 的 `length`、index、遍历依赖。
- 第三阶段：支持 `Map / Set` 的 `get/set/add/delete/clear/size/keys/values/entries/forEach/iterator`。
- 第四阶段：支持 `readonly`、`shallowReactive`、`shallowReadonly`、`toRaw`、`markRaw`。

## 使用

```ts
import { effect, reactive, readonly, shallowReactive, toRaw, markRaw } from 'zeus-reactive-alien-split'

const state = reactive({
  user: { name: 'zeus' },
  list: [1, 2],
  map: new Map([['a', 1]]),
})

effect(() => {
  console.log(state.user.name, state.list.length, state.map.get('a'))
})

state.user.name = 'alien'
state.list.push(3)
state.map.set('a', 2)
```

## 设计重点

`reactive/dep.ts` 没有重写一套 effect 系统，而是把每个 `target + key` 映射成一个内部 `signal(0)`：

- `track(target, key)`：读取这个 signal，完成依赖收集。
- `trigger(target, key)`：递增这个 signal，复用 `system.ts` 里的调度、batch、computed、effect 机制。

这样后续你要自定义更多响应式 API，例如 `createStore`、`createMutable`、`selector`、`resource`，都可以继续复用 `system.ts`。

## 命令

```bash
pnpm i
pnpm test
pnpm build
```
