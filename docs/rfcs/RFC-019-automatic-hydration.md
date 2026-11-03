# RFC-019：实验性自动 Hydration 接管

状态：Proposal（experimental，2026-11-02 随 PR-17 引入）

## 范围

RFC-004 的显式 `hydrate()` / `hydratePlan()` 契约保持不变。自动 Hydration 是
编译器与 DOM runtime 共同提供的可选模式：源码必须以 `autoHydrate: true` 同时编译
DOM 与 SSR target，客户端再调用 `render(value, container, { hydrate: true })`。
默认关闭，不对普通 `render()` 增加接管或 DOM 猜测行为。

## 编译语义

同一 Rust IR 生成两套 DOM component body：

- SSR body 在组件根 marker 后输出配对的 `<!--zeus:hydrate:/cN.root-->` 结束 marker；
  `Show`、`For`、`Transition` 和动态区域也输出自己的 range 结束 marker。
- DOM body 调用 `autoHydrateComponent(componentId, rootMarkerId, adopt, create)`。
  `adopt` 通过 element、text、component 和 region marker 建立精确绑定；`create` 保留
  既有模板 clone 和直接 DOM codegen。

这不是第二套 JSX lowering，也不从任意 HTML 推断结构。元素接管会校验标签、静态
attribute 和可确定的直接子元素标签；动态区域由 compiler 明确标记为重建边界。

## Owner 与恢复

一个容器只能有一个活动的自动 Hydration owner。重复接管抛出
`ZEUS_HYDRATION_DUPLICATE_OWNER`。组件根接管失败时，runtime 报告带 component、
marker 和范围的 `ZEUS_HYDRATION_*` 错误，只清除该根 marker 到结束 marker 之间的节点，
然后在同一锚点执行 client body；重建根标记为 `data-zeus-hydration-fallback`。

接管前已发生的原生表单编辑优先于第一次绑定写入：`value`、`checked` 和 `selected`
在 live property 与服务端 markup 不同时保留。后续响应式更新仍由 Zeus binding
正常写入。接管与清理共用现有 render owner 和 scope disposal。

## 边界

- 外层 session 不穿透 ShadowRoot，也不接管 Light DOM custom element 内由 CE owner
  管理的标记范围。
- `Show`、`For`、`Transition` 和动态 children 区域在接管时清空并重建，因此不承诺
  这些分支内部的服务端节点 identity。
- ErrorBoundary、流式增量接管、out-of-order hydration、自动 WC 内部 hydration
  不属于本 RFC。
- `pnpm check:auto-hydration` 在真实 Chromium、Firefox、WebKit 中验证基础自动
  Hydration；Node/jsdom 证据仍必须与浏览器验证分开记录，不能互相替代。该门禁暂不
  覆盖 DSD、Light DOM upgrade race、lazy custom element 或 ShadowRoot 内部 owner。

## 验证

`packages/core/compiler/__tests__/auto-hydration.spec.ts` 覆盖：静态和嵌套组件接管、
DOM identity、表单值、focus、selection、局部多余节点失配、重复 owner、custom
element / ShadowRoot 边界，以及动态 Show 区域重建。既有显式 hydration suite 仍必须
通过。`pnpm check:auto-hydration` 进一步验证构建后的 DOM/SSR codegen 在
Chromium、Firefox、WebKit 中保持这些基础接管契约。
