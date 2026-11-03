# RFC-020：Native Form、错误边界与 Testing SDK

状态：Accepted（PR-20，2026-11-02）

## 范围

本切片把三类开发期能力收敛为公开、显式的运行时契约：

- `createForm` 使用原生 `FormData`，允许 ElementInternals 提供的表单关联值参与提交；
- `ErrorBoundary` 区分 render、binding、event、request 和 runtime 阶段；
- `@zeus-js/testing` 提供用户交互、异步等待、SSR/hydration 和 runtime leak 检查。

不把 Query cache 复制进表单。`createForm` 的 `onSubmit` 接受任意 mutation callback，成功后的 invalidate 仍由 `@zeus-js/query` 负责。

## Native Form

`createForm({ initialValues, schema, onSubmit, onError })` 返回一个持有 signal 状态的 controller。`bind(form)` 安装原生 `submit`、`reset`、`input`、`change`、`blur` 和 composition 监听；`dispose()` 移除它们并取消进行中的提交。

值的合并顺序固定为：初始值、原生 `FormData`、`setValue`/field controller override。因此普通 input、重复 name、checkbox/select 和 form-associated custom element 可以共同组成一次提交。原生 constraint validation 先于 schema 执行；schema 返回字段错误时，提交回调不会执行，controller 会聚焦第一个错误控件。

`fromSafeParse` 只依赖 `safeParse`、`success`、`data` 和 `error.issues` 的结构，不把 Zod、Valibot 或其他 schema 实现带入 Zeus runtime。

## ErrorBoundary

绑定和事件 listener 在绑定时记录 owner scope。事件错误沿该 scope 找到最近边界并以 `info.phase === 'event'` 报告；请求由应用通过 `captureErrorBoundary()` 捕获 handler，再显式调用 `reportError(error, 'request')`。

错误边界只将可恢复错误切换到 fallback。`SecurityError`、`ZEUS_SECURITY_*`、`ZEUS_FATAL_*` 以及 `{ fatal: true }` 错误在释放失败子树后重新抛出，避免安全错误被 UI 吞掉。fallback 有独立 owner，`reset()` 先释放 fallback 再重建 child。

## Testing SDK

`userEvent` 只产生 DOM 事件并等待微任务，不引入 renderer 或测试框架状态。`waitFor` 以有限超时轮询断言；`startLeakCheck()` 读取公开 diagnostics 入口，检查 effect、scope、owner、binding 和 listener 的创建与释放差额。`renderSSR` 和 `hydrateSSR` 保持 server 入口与 client hydration 入口分离，防止测试工具的 SSR import 偷带 DOM 初始化。

## 验收

实现证据位于：

- `packages/core/runtime-dom/__tests__/form.spec.ts`：schema、native submit、IME、reset、repeated FormData 和 mutation rejection；
- `packages/core/runtime-dom/__tests__/errorBoundary.spec.ts`：binding、event、request、fatal SecurityError 和 owner release；
- `packages/core/testing/__tests__/testing.spec.ts`：user input、composition、waitFor、leak check、SSR/hydration；
- `docs/internal/pr20-forms-testing-evidence-2026-11-02.md`：命令和门禁结果。
