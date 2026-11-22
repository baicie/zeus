# R23 TASK 17 / 18：32 包隔离发布演练

**完全隔离。未对真实 registry 写入。**
命令：`pnpm drill:release-group`
证据：`temp/release/release-group-drill.json`

---

## 1. 与既有演练的区别

`drill:recovery` 用 5 个**合成**包验证机制。本次用**真实的 32 个 tarball**，
保留真实的 `dependencies` 与 `optionalDependencies`，按 `publishOrder` 算出的
真实顺序发布。

合成包证明不了 rc.3 的问题，因为 rc.3 出错的正是**依赖与顺序**：运行时排在
native 之后。

---

## 2. 实测结果

| 阶段             | 结果                                              |
| ---------------- | ------------------------------------------------- |
| 中断位置         | 第 8 位 `@zeus-js/compiler-native-linux-x64-musl` |
| 中断后已发       | 8 个                                              |
| **中断后框架包** | **0 个**                                          |
| 重跑             | 跳过 8，发布 24                                   |
| 重跑后           | **32/32**                                         |
| **重跑后框架包** | **5/5**                                           |

### 2.1 第一条断言：中断点必须落在没有框架的位置

```
afterInterrupt.framework === []
```

这正是 rc.3 的形态：发到第 8 个时，`shared`、`signal`、`runtime-dom`、
`runtime-ssr`、`zeus` 一个都没出去。

演练**断言**这一点而不是只记录：如果发布顺序变了、让某个运行时包提前，
这条会失败并指出顺序已经变了——因为那意味着「中断在第 8 位」的恢复预期不再成立。

### 2.2 第二条断言：重跑补齐整个组

```
rerun:      { skipped: 8, published: 24 }
afterRerun: { count: 32, framework: [5/5] }
```

跳过数恰好等于第一次发出的数量。这是 `skipExisting` 的行为：
`@baicie/release` 用 `npmVersionExists` 查版本，不是捕获冲突码
（对照 TASK 19 的发现：冲突码依 registry 而异，不能分支）。

### 2.3 第三条断言：消费者能用这个 registry

装 `@zeus-js/zeus`，然后验证运行时入口存在：

```
installed N packages; runtime-dom loads with render
and signal with createSignal, M exports from zeus
```

**这里有一个 optional 依赖的正面验证**：本次演练把七个平台包按顺序发到了
同一个 registry，所以 `compiler-native` 的 `optionalDependencies`
（形如 `"@zeus-js/compiler-native-darwin-arm64": "0.2.0-rc.3"`）能按名解析。

这与 TASK 11 的候选 tarball 路径形成对照：那里 npm 去 registry 找不到候选版本，
静默省略整组。**同一个包，两条安装路径，不同结果**——这正是为什么这个演练
必须发真实 tarball 到 registry，而不能用 `file:` 规格模拟。

---

## 3. 我在这两个演练里写错的三个断言

记下来因为它们都是同一类错误：**断言的内容比我想证明的更强或更弱**。

### 3.1 「每个包不能既发布又跳过」

第一版跨两次 attempt 统计，于是第一次发布的 8 个包在重跑里被跳过时，
被判定为「矛盾」。**正确的语义是按 attempt 分别校验**：重跑里每个包恰好
一种结局。

失败信息是 `these packages were both published and skipped:
@zeus-js/eslint-plugin, @zeus-js/playground-engine, ...` —— 列的正是**做对了的
那 8 个**。

### 3.2 「consumer 必须能加载 `@zeus-js/compiler`」

`@zeus-js/zeus` 的依赖是 `signal`、`runtime-dom`、`runtime-ssr`——**不含
compiler**。编译器由 `@zeus-js/vite-plugin` 带来。

断言要一个从未声明过的依赖，失败信息会是「这个发布坏了」，而实际上发布没问题。
改成验证运行时入口（`render`、`createSignal`）。

### 3.3 隔离 registry 上 `publishConfig.provenance: true` 会失败

每个待发布包的 manifest 都带 `provenance: true`（`check:native-packages` 会断言
这一点），而离线 registry 没有 OIDC provider。

`isolated-registry-drill.ts` 已经用 `--provenance=false` 处理过。本次演练同样处理，
并在代码里写明：**这是演练的属性，不是发布的属性**——演练测的是顺序与恢复，
provenance 失败与两者都无关。

---

## 4. 这个演练没有证明什么

| 项                                 | 原因                                            |
| ---------------------------------- | ----------------------------------------------- |
| 真实 npm registry 的行为           | 全程隔离                                        |
| provenance 是否成功                | 刻意关闭                                        |
| 32 个包的真实内容正确性            | 只验证发布与安装，不验证每个包的功能            |
| 中断点的其他位置                   | 只测第 8 位（rc.3 的实际位置）                  |
| 中途第二次失败（TASK 18 的一部分） | `drill:recovery` 覆盖了 5 包版本，32 包版本未做 |
