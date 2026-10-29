# Reactivity 上游、版权与补丁账本

日期：2026-10-30。关联：[ADR-001](./ADR-001-reactivity-engine.md)、[RFC-006](../rfcs/RFC-006-reactivity-contract.md)。

本账本记录 `packages/core/signal` 与 `packages/core/shared` 中派生自 Vue 的代码来源、逐文件差异分类和处理决定。账本只做对照和分级，不复制或覆盖上游源码；行为修复交给 PR-04。

## 版本锚点

| 项目            | 值                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游包          | `@vue/reactivity@3.5.44`、`@vue/shared@3.5.44`，经 `vue` 示例依赖间接安装在 `node_modules/.pnpm`                                                                                                                       |
| npm integrity   | reactivity `sha512-u+QJdKeBBEADkPdevsL+6E12QlYVfBD8Zcw5qjDQKtamI6l14KyqazJMobhCKelhWN5zpyKUiEDoTyHE93cqWw==`；shared `sha512-H82XLH0DjmSOdbEwO15x3QTo1f5PWEtv237eLpYKc0mqLu+B8hnq16lFWmuBmNurkeiG3wr+oM1FhOll/YVFRg==` |
| 上游 git commit | **待联网补齐**。两个包的 `package.json` 都没有 `gitHead`，离线环境无法解析 `vuejs/core` 的 `v3.5.44` tag                                                                                                               |
| 上游 LICENSE    | 两个包 LICENSE 内容相同，sha256 `1bb85cc9b13b81ef41c81c51866172fc345e0503c86726a6755b796590b70175`，持有人 `Copyright (c) 2018-present, Yuxi (Evan) You`                                                               |
| Zeus 基线       | `d8533522c74c289f69d32b04baa1c2fb7645eacb`（main）；`packages/core/signal/src` 最后一次修改在 `09e1a9c`                                                                                                                |
| 对照物          | 上游包只有构建产物，没有 TS 源码。对照使用开发版 `dist/reactivity.cjs.js`，下文"上游位置"的行号都指这个文件                                                                                                            |

派生起点版本无法从仓库历史确定：signal 源码最早出现在 2025-03 的 `packages/reactivity`，lockfile 历史里 `@vue/reactivity` 曾是 3.5.22（`6b3c353`）和 3.5.29（`8ec440c`）。因此差异按"当前 Zeus 源码 ↔ 3.5.44"记录。U-01 到 U-09 是上游有而 Zeus 缺的改动，其余是 Zeus 自己的修改。

## 派生文件范围

| Zeus 文件                                                                                                                                                                                                         | 来源              | 上游对应                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `signal/src/effectScope.ts`                                                                                                                                                                                       | `@vue/reactivity` | `reactivity.cjs.js:16-180`                                                                           |
| `signal/src/effect.ts`                                                                                                                                                                                            | `@vue/reactivity` | `181-532`                                                                                            |
| `signal/src/dep.ts`                                                                                                                                                                                               | `@vue/reactivity` | `533-774`                                                                                            |
| `signal/src/arrayInstrumentations.ts`                                                                                                                                                                             | `@vue/reactivity` | `775-1009`                                                                                           |
| `signal/src/baseHandlers.ts`                                                                                                                                                                                      | `@vue/reactivity` | `1010-1175`                                                                                          |
| `signal/src/collectionHandlers.ts`                                                                                                                                                                                | `@vue/reactivity` | `1176-1398`                                                                                          |
| `signal/src/reactive.ts`                                                                                                                                                                                          | `@vue/reactivity` | `1399-1525`                                                                                          |
| `signal/src/ref.ts`                                                                                                                                                                                               | `@vue/reactivity` | `1526-1708`                                                                                          |
| `signal/src/computed.ts`                                                                                                                                                                                          | `@vue/reactivity` | `1709-1800`                                                                                          |
| `signal/src/watch.ts`                                                                                                                                                                                             | `@vue/reactivity` | `1829-2039`                                                                                          |
| `signal/src/constants.ts`                                                                                                                                                                                         | `@vue/reactivity` | `TrackOpTypes/TriggerOpTypes/ReactiveFlags` 对应 `1801-1820`；`RuntimeDiagnosticsField` 是 Zeus 自有 |
| `signal/src/warning.ts`                                                                                                                                                                                           | `@vue/reactivity` | `12-14` 的 `warn`，前缀改为 `[Zeus warn]`                                                            |
| `shared/src/general.ts`、`makeMap.ts`、`typeUtils.ts`                                                                                                                                                             | `@vue/shared`     | `shared.cjs.js`、`shared.d.ts`；按声明名对照，40 个同名声明规范化后一致，`makeMap` 一致，差异见 U-15 |
| Zeus 自有：`signal/src` 的 `primitives`、`state`、`scope`、`lifecycle`、`scheduler`、`engine-context`、`diagnostics`、`runtime-diagnostics`、`internal`、`index`；`shared/src` 的 `mergeProps`、`rendererAdapter` | 无                | 无                                                                                                   |

## 重复对照步骤

在仓库根目录执行：

```sh
node packages/core/signal/scripts/upstream-diff.mjs --out "$TMPDIR/zeus-upstream-diff"
```

脚本用 TypeScript `transpileModule` 去掉 Zeus 源码的类型，再与上游对应区段一起规范化（去掉 import/export、注释、`@__PURE__` 标注和 `shared.` 前缀），用 `diff -U2` 为每个模块写出 `<模块>.diff`，并打印逐模块变更行数。它只生成报告，不修改源码；`--vue-path` 可指向其他已解包的 `@vue/reactivity` 版本。

3.5.44 ↔ `d853352` 的输出（变更行数含常量命名等噪音，只用于定位）：

| 模块                  | 上游区段    | 变更行数 |
| --------------------- | ----------- | -------: |
| effectScope           | `16-180`    |      131 |
| effect                | `181-532`   |      333 |
| dep                   | `533-774`   |      154 |
| arrayInstrumentations | `775-1009`  |      136 |
| baseHandlers          | `1010-1175` |      139 |
| collectionHandlers    | `1176-1398` |      197 |
| reactive              | `1399-1525` |      123 |
| ref                   | `1526-1708` |      141 |
| computed              | `1709-1800` |       57 |
| watch                 | `1829-2039` |      171 |

## 分类标准

- **critical bug**：本地已复现的错误行为，且常规用法能经已发布入口触达（`@zeus-js/signal`、`@zeus-js/signal/internal`，或 runtime-dom 的运行时路径）。
- **compatibility**：与上游行为不同，但只出现在不经任何入口导出的内部 API 或边界输入上。
- **performance**：只影响开销，不改变结果。
- **irrelevant**：命名、常量内联、`__DEV__` 守卫、提示文本、上游自身的向后兼容字段等，不影响 Zeus 行为。
- **Zeus 有意分歧**：ADR-001 或 RFC-006 明确要求的语义。

可达性依据：`reactive`、`shallowReactive`、`readonly` 不从任何入口导出；`state()` 对普通对象、数组和集合调用 `reactive()`；`watch` 从 `@zeus-js/signal/internal` 导出，但仓库内没有调用方。

## 补丁账本

| ID   | Zeus 位置                                                                                                                 | 上游位置              | 差异                                                                                                                                                     | 分类          | 决定与理由                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| U-01 | `baseHandlers.ts:185`                                                                                                     | `1114`                | 上游只在 `Reflect.set` 返回 `true` 时 trigger；Zeus 缺 `&& result`，写入失败（不可写属性、只有 getter、不可扩展对象新增键）仍通知 effect                 | critical bug  | 采纳。已在 `fix/signal-failed-set`（`8efeb7a`）修复并带 4 个回归用例，待合并，本分支不重复修复。复现 R1  |
| U-02 | `effectScope.ts:229-234`                                                                                                  | `147-152`             | 上游 `stop()` 遍历 `this.scopes.slice()`；Zeus 直接遍历 `this.scopes`。子 scope 的 cleanup 停止兄弟 scope 时，兄弟被 O(1) 移出数组，循环读到 `undefined` | critical bug  | 采纳，PR-04 候选。复现 R2，并经 `createRoot` + `render` 复现 R2b                                         |
| U-03 | `watch.ts:223-229`                                                                                                        | `1925-1934`           | `once` 回调抛错时，上游在 `finally` 中停止 watcher；Zeus 只在回调成功后停止，回调会再次执行                                                              | critical bug  | 采纳，PR-04 候选。复现 R5                                                                                |
| U-04 | `watch.ts:252-276`                                                                                                        | `1942-1964`           | 上游执行 cleanup 和回调期间 `pauseTracking()`；Zeus 不暂停，watch 在另一个 effect 内同步触发时，回调读取的 signal 被外层 effect 订阅                     | critical bug  | 采纳，PR-04 候选。复现 R6                                                                                |
| U-05 | `watch.ts:245-251`                                                                                                        | `1942`                | 上游条件包含 `immediateFirstRun \|\|`；Zeus 缺少，`immediate` 监听空数组源时回调不执行                                                                   | compatibility | 延后至 PR-04，与 U-04 同一代码块评估。复现 R7：Zeus 0 次，上游 1 次                                      |
| U-06 | `collectionHandlers.ts:279-285`                                                                                           | `1365-1366`           | 集合 getter 缺 `__v_isShallow` 分支：`isShallow(shallowReactive(new Map()))` 为 `false`，赋给 ref 时被当作深层值再包装                                   | compatibility | 延后。`shallowReactive` 不经入口导出。复现 R3：Zeus `false/false`，上游 `true/true`                      |
| U-07 | `arrayInstrumentations.ts:21-26`                                                                                          | `775-782`             | `reactiveReadArray` 对 readonly 数组仍用 `toReactive` 包装元素；上游返回 readonly 元素                                                                   | compatibility | 延后。`readonly` 不经入口导出。复现 R4：`reactive([]).concat(readonly([{}]))[0]` 在 Zeus 中不是 readonly |
| U-08 | `arrayInstrumentations.ts:234-262`                                                                                        | `906-942`             | 上游对原生 Array Iterator 用 `Object.create(proto)` 包装，并为自定义方法转发 `return/throw`；Zeus 直接在原生迭代器上挂 `_next/next`                      | compatibility | 延后。实测 for-of、iterator helper 和依赖追踪一致，唯一可见差异是迭代器多出可枚举自有键 `_next`（R8）    |
| U-09 | `effectScope.ts:106-139`                                                                                                  | `55-90`               | `pause/resume` 遍历时没有复制 `scopes/effects` 数组                                                                                                      | compatibility | 延后。未复现；运行时代码不调用 scope 的 `pause/resume`                                                   |
| U-10 | `effect.ts:282-292`、`dep.ts:121-123`                                                                                     | `292-300`             | 没读取 computed 的 effect 跳过 `isDirty` 直接 `run()`，用 `EVALUATED` 标记区分                                                                           | performance   | 保留 Zeus 写法。来自 `f61cd95`、`e30bbfb`，由 `effect-fast-path.spec.ts` 覆盖                            |
| U-11 | `reactive.ts:297-305`                                                                                                     | `1474-1484`           | 上游先查 proxy 缓存再计算 `toRawType`；Zeus 在缓存命中时仍计算类型                                                                                       | performance   | 延后，未测量；结果一致                                                                                   |
| U-12 | `effect.ts:438-450`                                                                                                       | `391-401`             | 上游 `isDirty` 额外检查 `sub._dirty`                                                                                                                     | irrelevant    | 不采纳。Zeus 和 `@vue/reactivity` 内都没有代码给订阅者设置 `_dirty`                                      |
| U-13 | `computed.ts:106-115`                                                                                                     | `1747-1748`           | 上游保留 `this.effect = this` 向后兼容字段                                                                                                               | irrelevant    | 不采纳。Zeus 无调用方，且 AGENTS.md 2.6 不保留历史兼容                                                   |
| U-14 | 全部派生模块                                                                                                              | —                     | 常量枚举与内联字面量、`__DEV__` 守卫（上游开发版产物已展开）、`[Zeus warn]` 前缀、Symbol 描述、注释                                                      | irrelevant    | 不采纳                                                                                                   |
| U-15 | `shared/src/general.ts:2-5`                                                                                               | `shared.cjs.js:17-18` | `EMPTY_OBJ/EMPTY_ARR` 按 `__DEV__` 决定是否冻结；上游开发版产物已展开为 `Object.freeze`                                                                  | irrelevant    | 不采纳                                                                                                   |
| U-16 | `effect.ts:128`、`651-689`                                                                                                | `223`、`510-531`      | 一个 effect 可登记多个 cleanup，全部执行后抛第一个错误；上游只保留最后登记的一个，且没有错误汇总                                                         | Zeus 有意分歧 | 保留。RFC-006 Owner 第 3 条；ADR-001「Scope 与错误契约」                                                 |
| U-17 | `effect.ts:259-280`                                                                                                       | `281-291`             | 先清除 `ACTIVE` 再执行 cleanup 和 `onStop`；cleanup 抛错时 `onStop` 仍执行                                                                               | Zeus 有意分歧 | 保留。ADR-001「停止前先将 effect/scope 标记失效」；`reactivity-contract.spec.ts:201`                     |
| U-18 | `effect.ts:200-220`                                                                                                       | `248-259`             | `rejectReentry` 时同步写自身依赖抛诊断；运行中再次 `run()` 抛错                                                                                          | Zeus 有意分歧 | 保留。RFC-006 Owner 第 5 条；`owner-contract.spec.ts:136`                                                |
| U-19 | `effect.ts:226-256`                                                                                                       | `256-280`             | cleanup 移进 `try`，异常后恢复 `RUNNING`、tracker 和 owner；重跑时恢复 effect 所属 scope                                                                 | Zeus 有意分歧 | 保留。RFC-006 Owner 第 4 条；`owner-contract.spec.ts:18`、`reactivity-contract.spec.ts:182`              |
| U-20 | `effect.ts:332`、`354-395`                                                                                                | `316-363`             | 上游内部 `batch(sub)` 改名为 `queueSubscriber`；`endBatch` 用 `hasError` 标记传播 falsy 错误                                                             | Zeus 有意分歧 | 保留。RFC-006 `batch` 条；ADR-001 falsy 异常；`reactivity-contract.spec.ts:239`                          |
| U-21 | `effect.ts:567-592`                                                                                                       | `475-492`             | owner 已失效时不执行新 effect；首次执行失败时保留原始错误                                                                                                | Zeus 有意分歧 | 保留。RFC-006 Owner 第 1 条；`owner-contract.spec.ts:36`、`82`                                           |
| U-22 | `effectScope.ts:203-252`                                                                                                  | `135-163`             | stop 期间进入自身 scope、清空 tracker，逐项收集错误后抛第一个（未复制数组的问题单列为 U-02）                                                             | Zeus 有意分歧 | 保留。ADR-001「Scope 与错误契约」；RFC-006 Owner 第 2、3 条                                              |
| U-23 | `effectScope.ts:285-296`                                                                                                  | `171-179`             | 在已失效 scope 上登记的 cleanup 立即执行                                                                                                                 | Zeus 有意分歧 | 保留。RFC-006 Owner 第 1 条；`owner-contract.spec.ts:44`                                                 |
| U-24 | `effect.ts:139,231,240,490,606-637,652,733`；`effectScope.ts:60,144-151,163-201,274,286`；`dep.ts:113,275`                | —                     | engine owner frame 与 `canTrackEngine` 守卫；跨物理副本时抛 `different Zeus signal engine`                                                               | Zeus 有意分歧 | 保留。ADR-001「包入口与重复实例」；`engine-interop.spec.ts`                                              |
| U-25 | `effect.ts:140-161,176-178`；`effectScope.ts:61-82,95-97`；`computed.ts:111-112`；`ref.ts:133-134`；`reactive.ts:311-312` | —                     | runtime diagnostics 计数与包装                                                                                                                           | Zeus 有意分歧 | 保留。ADR-001（不能漏记 diagnostics）；`diagnostics.spec.ts`                                             |
| U-26 | `effect.ts:696-735` 及 Zeus 自有文件                                                                                      | 无                    | `batch(fn)`、`untrack`、`getCurrentEffect` 与六个公共 Primitive                                                                                          | Zeus 有意分歧 | 保留。RFC-006「公共 Primitive」                                                                          |

统计：critical bug 4、compatibility 5、performance 2、irrelevant 4、Zeus 有意分歧 11，共 26 条。决定：采纳 4（U-01 到 U-04），延后 6（U-05 到 U-09、U-11），保留 Zeus 现状或不采纳 16。

## Critical bug 复现（PR-04 修复候选）

Zeus 侧用临时 Vitest 文件运行，按上游行为写断言；上游侧用等价 CJS 脚本加载已安装的 `@vue/reactivity` 3.5.44。两类临时文件都只用于复现，没有提交。Zeus 侧 8 个断言全部失败（signal 7 个，runtime-dom 1 个），上游侧 R1 到 R7 全部符合预期。

R1（U-01）：

```ts
const raw = {} as { foo: number }
Object.defineProperty(raw, 'foo', {
  value: 1,
  writable: false,
  configurable: true,
})
const o = reactive(raw)
let runs = 0
effect(() => {
  runs++
  void o.foo
})
Reflect.set(o, 'foo', 2) // false
```

Zeus：`runs` 为 2。上游：`runs` 为 1。

R2（U-02）：

```ts
const root = effectScope(true)
let b!: EffectScope
root.run(() => {
  const a = effectScope()
  b = effectScope()
  a.run(() => onScopeDispose(() => b.stop()))
})
root.stop()
```

Zeus：抛 `TypeError: Cannot read properties of undefined (reading 'stop')`。上游：不抛错，`b` 已停止。

R2b（U-02，runtime-dom，jsdom）：

```ts
createRoot(dispose => {
  disposeRoot = dispose
  render(() => {
    onCleanup(() => disposeB())
    return document.createElement('span')
  }, a)
  disposeB = render(() => document.createElement('i'), b)
})
disposeRoot()
```

Zeus：抛同样的 `TypeError`，`b` 的子节点已清空。上游没有对应的 render API，机制由 R2 对照。

R5（U-03）：

```ts
const s = ref(0)
let calls = 0
watch(
  s,
  () => {
    calls++
    throw new Error('boom')
  },
  { once: true },
)
try {
  s.value = 1
} catch {}
try {
  s.value = 2
} catch {}
```

Zeus：`calls` 为 2。上游：`calls` 为 1。

R6（U-04）：

```ts
const s = ref(0)
const other = ref(0)
const gate = ref(0)
watch(s, () => {
  void other.value
})
let runs = 0
effect(() => {
  runs++
  s.value = gate.value + 1
})
other.value = 1
```

Zeus：写入 `s` 的外层 effect 订阅了 `other`，`runs` 为 2。上游：`runs` 为 1。

## 版权与许可审计

审计前，`npm pack --dry-run` 显示下列 5 个包的 tarball 都没有 LICENSE 或 NOTICE（signal 22 个文件、shared 7、runtime-dom 10、router 8、zeus 26）。仓库根目录没有 LICENSE。构建 banner 只有 `(c) 2026 baicie Released under the MIT License.`，产物不保留上游 `@license` 注释。

发布文件中含 Vue 派生代码的包：

| 包                     | 派生代码所在                                                                  |
| ---------------------- | ----------------------------------------------------------------------------- |
| `@zeus-js/signal`      | 源码派生自 `@vue/reactivity`；所有 dist；浏览器构建另内联 shared 的 `makeMap` |
| `@zeus-js/shared`      | `general`、`makeMap`、`typeUtils` 派生自 `@vue/shared`；所有 dist             |
| `@zeus-js/runtime-dom` | `dist/*.esm-browser.js`、`dist/*.global.js` 内联 signal 与 shared             |
| `@zeus-js/router`      | `dist/router.esm-browser.js` 内联 signal 与 shared                            |
| `@zeus-js/zeus`        | `dist/*.esm-browser.js`、`dist/*.global.js` 内联 signal 与 shared             |

已检查但不含 Vue 派生代码：runtime-ssr、query、resource、testing、compiler-shared 的 dist 没有 signal 或 shared 的内联区段；其他发布包把 signal/shared 作为外部依赖；`crates/` 没有 Vue 来源标记。

处理：

- 为上述 5 个包新增 `LICENSE`：先是 MIT 全文，持有人沿用 `packages/core/compiler-native/LICENSE` 的 `Copyright (c) 2026 Baicie`；分隔线后说明派生来源，并逐字附上已安装 `@vue/reactivity` 3.5.44 的 LICENSE（与 `@vue/shared` 相同）。npm 会自动把包根目录的 LICENSE 打进 tarball，所以 `files` 字段不变。
- `scripts/check/check-release-artifacts.ts` 对这 5 个包额外检查：tarball 中必须有 `LICENSE`，且文本保留上游版权行。

## 回归类别映射

| 类别               | 现有覆盖                                                                                                                                                                                                                                  | PR-04 缺口                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50k signal 写入    | `packages/core/signal/scripts/reactivity-audit.mjs`：50,000 次写入，断言最终值和执行次数（单 Effect 与 diamond）                                                                                                                          | 该脚本依赖已构建产物，不在 CI 中运行；Vitest 中没有 50k 级用例                                                                                                              |
| diamond + 分支     | `reactivity-contract.spec.ts:41`、`66`；`effect-fast-path.spec.ts:22`                                                                                                                                                                     | 无                                                                                                                                                                          |
| owner cleanup / GC | `owner-contract.spec.ts:18`、`36`、`44`、`67`；`reactivity-contract.spec.ts:90`、`115`、`134`、`166`；`effectScope.spec.ts:226`（父 scope 解除引用）；`reactive.spec.ts:423`（#11979 释放属性 Dep）；`diagnostics.spec.ts:38`（幂等释放） | 没有基于 `WeakRef`/`FinalizationRegistry` 或堆快照的 GC 用例；cleanup 中停止兄弟 scope（U-02）                                                                              |
| 异常               | `reactivity-contract.spec.ts:182`、`201`、`220`、`239`；`owner-contract.spec.ts:67`、`82`、`94`；`engine-interop.spec.ts:65`                                                                                                              | `Reflect.set` 失败（U-01，修复分支已带用例）；`once` 回调抛错（U-03）                                                                                                       |
| 并发 / 异步交错    | `owner-contract.spec.ts:44`；`effectScope.spec.ts:302`；`engine-interop.spec.ts:89`、`105`                                                                                                                                                | `scheduler.ts` 的 `queueJob/flushJobs/nextTick` 没有测试，也没有仓库内调用方；watch 回调追踪泄漏（U-04）；`effectScope.spec.ts` 中依赖 `@vue/runtime-core` 而被注释掉的用例 |

## 复核路径

1. 每次 `@vue/reactivity` 发布 patch 或 minor 版本，且至少每季度一次，取得该版本的包（`--vue-path` 指向解包目录）并运行 `upstream-diff.mjs`。
2. 对新增或变化的 hunk 按"分类标准"登记新的 U 编号，写明 Zeus 位置、上游位置和决定。critical bug 先写失败用例再修复。
3. 只做最小补丁，不整体替换源码。修复后运行 signal 单测、`reactivity-audit.mjs`、`pnpm check:runtime-interop` 和 `pnpm check:release-artifacts`。
4. 更新"版本锚点"。联网后补齐 `v3.5.44` 的上游 commit SHA。

`upstream-diff.mjs` 不进入 CI：它依赖本地已安装的 `@vue/reactivity`（目前只是 `vue` 示例的间接依赖），而且结果需要人工分级，不能自动合并。
