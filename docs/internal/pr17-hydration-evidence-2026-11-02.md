# PR-17 自动 Hydration 验收证据（2026-11-02）

## 交付

PR-17 在 `codex/pr17-hydration` worktree 完成编译器选项、SSR range marker、DOM
adoption body、单容器 owner、局部 fallback、表单状态保护和回归测试。默认路径不变：
`autoHydrate` 与 `render({ hydrate: true })` 都是显式 opt-in。

核心文件：

- `crates/zeus_compiler/src/codegen.rs`：同一 IR 的 adopt/create codegen，以及 SSR
  组件和控制流结束 marker。
- `packages/core/runtime-dom/src/autoHydration.ts`：marker 索引、结构校验、owner、
  mismatch fallback 和动态区域边界。
- `packages/core/runtime-dom/src/render.ts`：保留 SSR markup、启动和释放自动接管 session。
- `packages/core/runtime-dom/src/bindings.ts`：接管前的 `value` / `checked` / `selected`
  优先保留。
- `packages/core/compiler/__tests__/auto-hydration.spec.ts`：6 个端到端 jsdom 用例。

## 实际验证

| 命令                                                                                                                                           | 结果                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo check -p zeus_compiler --offline`                                                                                                       | PASS                                                                                                                                                                                                    |
| `cargo test -p zeus_compiler --offline`                                                                                                        | PASS，1 + 7 + 54 + 1 + 61 = 124 tests                                                                                                                                                                   |
| `pnpm --filter @zeus-js/compiler-native build:native`                                                                                          | PASS，重建 native binary                                                                                                                                                                                |
| `pnpm --filter @zeus-js/compiler-native test:native`                                                                                           | PASS，32 tests                                                                                                                                                                                          |
| `pnpm vitest run --project unit packages/core/compiler/__tests__/auto-hydration.spec.ts packages/core/runtime-dom/__tests__/hydration.spec.ts` | PASS，25 tests                                                                                                                                                                                          |
| `pnpm check:auto-hydration`                                                                                                                    | PASS，构建产物在 Chromium、Firefox、WebKit 验证 SSR markup、预 hydration 表单/焦点/选区、节点 identity、事件更新、局部 tag mismatch fallback 与 dispose；报告 `temp/auto-hydration-browser/report.json` |
| `rustfmt --edition 2024 --check crates/zeus_compiler/src/codegen.rs`                                                                           | PASS                                                                                                                                                                                                    |
| 相关 TS Prettier / ESLint                                                                                                                      | PASS                                                                                                                                                                                                    |
| `pnpm check`                                                                                                                                   | PASS                                                                                                                                                                                                    |

## Git

- Base：`19316c1`（PR-17 独立 worktree，未 rebase）
- Branch：`codex/pr17-hydration`
- Push / Draft PR / merge：未执行

## 风险与后续

自动 Hydration 当前是 experimental。动态区域会清空并重建，ShadowRoot 和 custom
element 内部 owner 不由外层接管。三引擎专用脚本已经加入仓库；DSD、Light DOM
upgrade race、失配 listener 计数和 lazy CE 边界仍不在本切片的浏览器场景内，不能用
当前报告替代这些后续场景。
