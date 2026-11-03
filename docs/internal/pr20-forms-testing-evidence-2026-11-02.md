# PR-20 Native Form / ErrorBoundary / Testing SDK 证据

记录时间：2026-11-02。工作分支：`codex/pr20-forms-testing`。

## 实现范围

- `packages/core/runtime-dom/src/form.ts`：原生 FormData、重复字段、ElementInternals 参与的 form value、native constraint validation、schema adapter、IME composition、reset、mutation rejection 和 owner cleanup。
- `packages/core/runtime-dom/src/errorBoundary.ts`、`errorBoundaryContext.ts`、`events.ts`：binding/event/request phase、fatal SecurityError 重抛、失败 owner 释放和显式 `captureErrorBoundary` / `reportError`。
- `packages/core/testing/src/index.ts`：`userEvent`、`waitFor`、`cleanup`、`startLeakCheck`、`renderSSR`、`hydrateSSR`。
- `scripts/shared/aliases.ts`：为本地测试解析 `@zeus-js/zeus/server` 与 `capabilities` 入口。

## 已执行检查

```text
vitest --project unit packages/core/runtime-dom/__tests__/form.spec.ts       3 passed
vitest --project unit packages/core/runtime-dom/__tests__/errorBoundary.spec.ts 11 passed
vitest --project unit packages/core/testing/__tests__/testing.spec.ts        8 passed
vitest --project unit packages/core/runtime-dom packages/core/testing packages/core/query packages/core/zeus
  35 files / 437 tests passed
pnpm test-unit
  172 files / 1907 tests passed
pnpm build
  passed
pnpm build-dts
  passed
pnpm check
  passed
pnpm lint
  passed
pnpm format-check
  passed
pnpm check:docs
  passed
pnpm api:check
  passed after staging the three intentional API snapshots
pnpm check:cjs
  21 packages / 30 exports / 60 conditional loads / 46 wrapper fallbacks passed
pnpm check:ssr-safe-import
  passed
pnpm --filter @zeus-js/compiler-native build:native
  passed; local Darwin arm64 artifact was rebuilt for this worktree
```

`pnpm` 在本机提示 workspace 的旧式 `pnpm` 配置字段和 lockfile/node_modules 不同步，但上述命令均以零退出码完成；这些提示没有写入提交。构建期间已有的 vite-plugin `node:crypto` external warning 也未影响产物或检查结果。

## 设计边界

表单 controller 不拥有 Query cache；`onSubmit` 接收 `FormSubmitContext`，应用可以把它接到 `useMutation().mutateAsync`，成功后的 query invalidation 仍由 Query client 处理。错误边界不会自动把 Promise rejection 变成 UI 错误，异步请求必须通过 `captureErrorBoundary` / `reportError` 显式路由；安全错误会在清理失败子树后继续抛出。
