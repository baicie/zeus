# Rust WASM Compiler 双目标与 parity（PR-08）

日期：2026-10-31。分支：`codex/zeus-0.2.0-progress`。范围：设计包 PR-08 与 ADR-05。

## 结论

`crates/zeus_compiler`（oxc 0.144）无需任何改动即可编译到 `wasm32-unknown-unknown`。新增
`packages/core/compiler-wasm`：Rust 宿主只负责在线性内存上收发 JSON 并按 N-API 相同的规则校验选项，
解析、lowering、IR 与 codegen 仍是唯一的 `zeus_compiler`，没有第二套 transpiler。

| 项目                                  | 结果                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 产物                                  | `zeus-compiler.wasm`，无 import；导出 `memory`、`zeus_alloc`、`zeus_free`、`zeus_transform`                 |
| 体积                                  | 1,486,456 B raw、449,982 B gzip（level 9）、324,789 B brotli                                                |
| 初始内存                              | 2.19 MiB（2 MiB shadow stack）                                                                              |
| Node parity                           | 仓库 75 个 TSX 模块 × 3 组选项 = 225 次 transform，与 native 规范化 JSON 逐字节一致                         |
| 耗时（同一语料，M 系 macOS，Node 24） | native 95.5 ms、WASM 116.5 ms（含每次 N-API 线程创建）                                                      |
| 浏览器                                | Chromium、Firefox、WebKit 的 module Worker 中各 10 次 transform 与 native 一致，trap 后恢复，主线程路径一致 |
| 嵌套上限                              | 约 1,424 层后触发引擎调用栈上限，变为可恢复的 `[ZEUS_COMPILER_WASM_TRAP]`；native 为数万层                  |

## 宿主接口

- 请求：`transformModule` 的选项对象（与 `@zeus-js/compiler-native` 相同字段）。
- 响应：`{ "status": "ok", "result": TransformModuleResult }` 或 `{ "status": "error", "message" }`。
  选项错误的消息与 native 完全一致，JS 侧以 `TypeError` 拒绝。
- `zeus_transform` 返回 `指针 << 32 | 长度`（BigInt），JS 解码后立即 `zeus_free`。
- 不使用 wasm-bindgen、WASI 或线程：浏览器无需跨源隔离，CI 只需 `wasm32-unknown-unknown` target。
- `unsafe` 仅限 `#[cfg(target_arch = "wasm32")] mod abi` 中的三个导出函数。

## 栈与故障隔离

| shadow stack  | 初始内存         | 嵌套上限    | 失败形式                                          |
| ------------- | ---------------- | ----------- | ------------------------------------------------- |
| 1 MiB（默认） | 1.19 MiB         | 约 785 层   | `memory access out of bounds`                     |
| 2 MiB（采用） | 2.19 MiB         | 约 1,424 层 | V8 `RangeError: Maximum call stack size exceeded` |
| 4 / 16 MiB    | 4.19 / 16.19 MiB | 约 1,424 层 | 同上，受引擎调用栈限制                            |

与 native 不同，WASM 中的栈溢出不会终止宿主进程。loader 在 trap 后丢弃该实例，下一次调用重新实例化；
Worker bridge 另有超时：超时即 `terminate()` 并拒绝所有挂起请求。

## 命令与证据

| 命令                                                                                       | 环境                                                 | 结果                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `cargo build -p zeus_compiler --target wasm32-unknown-unknown --release`                   | rustc 1.95.0                                         | 通过                                             |
| `cargo test --workspace --locked`                                                          | 同上                                                 | 119 通过                                         |
| `cargo clippy --package zeus_compiler_wasm --target wasm32-unknown-unknown -- -D warnings` | 同上                                                 | 通过                                             |
| `pnpm test:compiler-wasm`                                                                  | Node 24.18                                           | 4 通过（parity、选项错误、trap 恢复、无 import） |
| `pnpm check:compiler-wasm-browser`                                                         | Playwright Chromium 1248、Firefox 157.0、WebKit 27.2 | 三引擎通过（`temp/compiler-wasm/report.json`）   |
| `__tests__/types.ts`（`pnpm check`）                                                       | tsc                                                  | WASM 与 native 的选项/结果类型互相可赋值         |

CI：`rust-compiler` job 增加 wasm target、WASM clippy 与 `pnpm test:compiler-wasm`；`packed-consumers` job
构建 WASM 并在三引擎运行 Worker 检查，报告随 artifact 上传。

## 未完成与后续

- 包保持 `private`，由 PR-27 Playground 决定消费方式（Vite 资源 URL、CDN、版本化缓存）后再发布。
- 尚未测量浏览器内的编译延迟分布与内存峰值；PR-27/PR-34 的性能预算需在 Worker 中采样。
- 嵌套上限低于 native；如 Playground 需要更深输入，可在 Worker 中分块解析前先做深度预检，属于后续优化。
