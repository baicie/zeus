# main CI 红灯：gallery.tsx 触发 WASM/native 嵌套预算分歧

日期：2026-11-13
main：`224e3aec`（P11 三个 PR 合并后）
Run：43352571913，失败 job `rust-compiler`，失败步骤 `WASM compiler parity with the native compiler`

---

## 1. 失败是什么

```
✖ examples/admin/src/gallery.tsx (dom, delegateEvents: true)

native: {"code":"import { template as $zeusTemplate, ... }", ...}   ← 编译成功
wasm:   {"code":"","diagnostics":[{"code":"ZEUS_INPUT_TOO_DEEP",
         "message":"Input nesting exceeds the supported limit of 506 levels."}]}
```

同一个文件，native 编译器编译成功，WASM 编译器判定嵌套超限。parity 测试要求两者
**逐字节一致**，因此失败。

## 2. 这不是回归，是两个已设计好的行为撞在一起

`crates/zeus_compiler/src/nesting.rs:45-56` 写得很清楚：

> Each target therefore selects its own weight table from crash depths measured
> on that host: the 64 MiB native worker, or the engine call stack of
> `wasm32-unknown-unknown`. **The native budget is 8,192 JSX levels' worth of
> weight** … **The WebAssembly budget is 506 JSX levels**, because browser
> engines have much smaller call stacks.

所以两个编译器对"多深算太深"**本来就有不同答案**，这是刻意的安全设计：
WASM 在浏览器里 trap 会丢弃整个编译器实例，所以它的预算必须更保守。

`examples/admin/src/gallery.tsx`（695 行，组件画廊，大量嵌套 JSX）刚好落在这两个
预算之间：超过 506、远低于 8192。

## 3. 为什么没有在 PR 上被发现

`#250` 的 PR CI 里 **`rust-compiler` 是 skipping**：

```
ci-gate        pass
rust-compiler  skipping
```

impact 分析没有把 `examples/admin/**` 算进 Rust 测试的触发路径。但 parity 测试
（`packages/core/compiler-wasm/__tests__/parity.test.mjs`）会遍历 `examples/`、
`benchmarks/`、`scripts/playground/fixtures/` 下的**全部 `.tsx`**：

```js
const corpusRoots = ['examples', 'benchmarks', 'scripts/playground/fixtures']
```

这是一个真实的 gate 覆盖漏洞：**改 `examples/**` 里一个嵌套很深的 JSX 文件，
可以让 WASM/native parity 失效，而 CI 不会跑它。\*\*

合并到 main 后第一次完整跑 CI 就暴露了。`610e5f48`（#250 本身）的 main CI 是
cancelled，所以这次是第一次真正执行。

## 4. 需要什么决定（不是我能单方面选的）

三条路，各有代价：

| 方案                                                     | 代价                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 把 `examples/**` 加入 `rust-compiler` 的 impact 触发路径 | 每个改 example 的 PR 多跑一次 Rust 测试（约 2 分钟）；但它会抓到这类问题          |
| 让 parity 测试对"超限诊断"豁免（两边都超限才算一致）     | 承认两个编译器的预算本就不同，parity 只覆盖它能覆盖的；但会削弱"逐字节一致"的契约 |
| 拆分 `gallery.tsx`，把嵌套降到 506 以下                  | 最小改动，但它掩盖了"PR gate 不会跑 parity"这个更根本的问题                       |

我倾向**第一条**：问题不在于这个文件太深，而在于改 `examples/**` 时没人跑 parity。
但它会改变 CI 的耗时结构，属于需要你确认的取舍。

## 5. 与 P11 三个 PR 的关系

**无。** #247 只改 `compiler-native.yml` 与文档；#251 改 `playground-engine`；
#252 改 `check-admin.ts` 与文档。三者都不碰 `examples/admin/src/gallery.tsx`、
不碰 `crates/`、不碰 parity 测试。

gallery.tsx 由 `610e5f48`（#250）引入，该 PR 的 `rust-compiler` 是 skipping，
main 上的 CI 在合并时是 cancelled。这个红灯是 #250 的遗留，不是本轮合并造成的。

## 6. 未处理

本轮没有修它：三个方案都需要设计取舍（CI 耗时 vs parity 契约 vs 文件重构），
不属于 P11 的任务范围。记录在此，等决定。
