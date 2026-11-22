# R22 TASK 52：发布顺序把运行时排在最后

**只读 registry 查询 + 配置分析。未执行任何发布操作。**

测量时间：2026-11-22
数据：registry 的 `0.2.0-rc.3` 各包发布时间戳 + `scripts/release.config.ts`

---

## 1. 结论

`0.2.0-rc.3` 前 8 个位置是：

```
 1  @zeus-js/eslint-plugin
 2  @zeus-js/playground-engine
 3  @zeus-js/compiler
 4  @zeus-js/compiler-native
 5  @zeus-js/compiler-native-darwin-arm64
 6  @zeus-js/compiler-native-darwin-x64
 7  @zeus-js/compiler-native-linux-arm64-gnu
 8  @zeus-js/compiler-native-linux-x64-gnu     ← 失败在这里
 ...
17  @zeus-js/runtime-dom
22  @zeus-js/zeus
```

**前 11 个位置全部是编译器与 native 平台包。** 运行时从第 12 位
（`compiler-shared`）之后才开始，`runtime-dom` 在 17，`zeus` 在 22。

发布在第 8 个失败，所以在任何可能的恢复尝试里，只要中断点在前 11 位，
发出去的东西里**一个运行时包都没有**。

---

## 2. 这不是「运气不好」，是排序规则决定的

`@baicie/release` 的排序（`listWorkspacePackages` 末尾，实测源码）：

```js
packages.sort((a, b) => {
  if ((a.kind ?? '') !== (b.kind ?? ''))
    return (a.kind ?? '').localeCompare(b.kind ?? '')
  return a.name.localeCompare(b.name)
})
```

kind 为空串时排最前。当前 `packageKind`（`scripts/release/publish-order.ts`）：

- `packages/web-c/**` → `web-c`
- `tooling/eslint-plugin`、`tooling/playground-engine` → 无 kind
- 其余（含 compiler、runtime、features）→ `core`

所以无 kind 的两个排最前，`core` 组内部按名字排。`compiler` 系列名字靠前，
运行时靠后，native 平台包名字最长、位置最集中——于是 `core` 组的前十被
native 全部占满。

---

## 3. 一个被发现的回归：当前配置算出的顺序 ≠ rc.3 的实际发布顺序

对比 registry 的发布时间戳：

| 包                  | 实际发布时间 |
| ------------------- | ------------ |
| `eslint-plugin`     | 03:11:29     |
| `playground-engine` | 03:11:37     |
| `compiler-native`   | 03:12:04     |
| `compiler`          | 03:13:14     |

实际是 **`compiler-native` 先、`compiler` 后**。

但**当前配置算出来的顺序是反的**——`compiler` 在前。原因是六域重构改了
`packageKind`：

```js
// 发布 rc.3 时的配置（638b433a）
if (relativeDir.startsWith('packages/core/')) return 'core'
if (relativeDir.startsWith('packages/web-c/')) return 'web-c'
return undefined // ← compiler 当时在 packages/compiler/，无 kind
```

那时 `compiler` 无 kind，排在最前；`compiler-native` 在 `packages/core/`
之下是 `core`。六域重构后 `compiler` 移入 `packages/compiler/`，规则改成
「其余都算 core」，两个包落进同一组，名字比较把 `compiler` 排到了前面。

**这是重构带来的真实行为变化，不是测试的错。** 它被记录为一条断言
（`scripts/release/__tests__/publish-order.spec.ts`「computes the order rc.3
was actually published in」），而不是被抹平。

影响评估：这只是两个相邻编译器件互换位置，不改变「运行时在最后」这个主结论。
但它说明**发布顺序会随目录重构静默变化**，而顺序决定了部分发布留下什么。

---

## 4. 为什么值得记下来

恢复 rc.3 的计划是「重跑，`skipExisting` 跳过已发布的包」。这个计划有效，
但有一条隐含前提：**重跑会从第 8 个继续，而第 8 到第 11 仍是 native 平台包。**

也就是说：

- 如果重跑在第 8–11 之间再次失败（native 构建是整条链路里最容易失败的环节），
  结果仍然是「compiler 齐了、运行时没有」；
- 「32 个都在」这个验收标准要到第 22 位才覆盖 `zeus`。

**所以恢复的中间检查点应该盯第 22 位（`zeus`），不是发布数量。**
这条以前没人写下来。

---

## 5. 新增文件

| 文件                                              | 作用                                                   |
| ------------------------------------------------- | ------------------------------------------------------ |
| `scripts/release/publish-order.ts`                | 把 `packageKind` 从 `release.config.ts` 抽出成独立模块 |
| `scripts/release/__tests__/publish-order.spec.ts` | 5 项断言                                               |

抽出的理由：`release.config.ts` import 了 `@baicie/release`，那个包的依赖树在
测试进程里解析失败（`conventional-changelog` 没有 exports main）。规则本身不
依赖它，所以分开之后既可测、也能被其它脚本复用。

配置那边只留一行委托：`packageKind: packageKind`。

---

## 6. 本轮未做

| 项                                   | 原因                                             |
| ------------------------------------ | ------------------------------------------------ |
| 改变发布顺序                         | 属于发布工具与发布决策，不是检查脚本能单方面改的 |
| 验证「重跑从第 8 位继续」            | 需要真实 publish，禁止项                         |
| 让 native 平台包在失败时降级而非中断 | 需要发布工具支持，且会改变发布语义               |
