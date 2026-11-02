# PR-19 证据报告：Router & Query 声明式 Application SDK

- 报告日期：2026-11-02
- 分支：`codex/pr19-app-sdk`
- Worktree：`temp/worktrees/pr19-app-sdk`
- Base / Start HEAD：`cff2721c` (`cff2721b581f0f370bb70a2f2871c0a667897cfe`)

## A. Baseline

| 项         | 值                                                                                    |
| ---------- | ------------------------------------------------------------------------------------- |
| Repository | `baicie/zeus`                                                                         |
| Branch     | `codex/pr19-app-sdk`（基于 `cff2721c`）                                               |
| 已存在工作 | 无 RouterProvider/Link/Outlet；Query 公共 API 直接暴露 `QueryClient` 与 tanstack 类型 |
| 未合并 PR  | 本分支未推送、未开 PR（见 E）                                                         |
| 工作树     | 本报告前存在未提交改动（本 PR 全部产物）                                              |

依赖保持既有 `@remix-run/router ^1.23.4` 与 `@tanstack/query-core ^5.104.3`，没有
`pnpm install`，没有引入第二个 matcher 或第二套 cache，没有第二套 TSX lowering。

## B. Changes

### Router（`packages/core/router`）

- 新增声明式层：`RouterProvider`、`Link`、`Outlet`；`Link` 渲染真实 `<a>`，拦截同源
  无修饰左键并 `router.navigate`，`preload="intent"` 走 `router.preload`。
- 新增 accessor hooks：`useRouter`、`useLocation`、`usePathname`、`useParams`、
  `useMatches`、`useLoaderData`、`useActionData`、`useNavigation`、
  `useRevalidation`、`useRouterState`、`useRouteError`、`useHref`、`useFetcher`。
- 公共类型全部改为 Zeus 自有（`ZeusRouter`、`ZeusRouteObject`、`ZeusLocation`、
  `ZeusFetcher`、…）；不再 re-export `@remix-run/router` 类型/实例。
- basename：engine 开启 `v7_prependBasename`；`location()/pathname()` 为应用相对路径，
  `createHref`/`Link href` 补上 basename；`preload`/relative 解析基于应用相对路径。
- `Outlet` 细粒度：memo 以 route 对象身份 + 错误身份为门控，params/search 变化只更新
  绑定；新增**透明错误边界**语义（仅声明 `errorElement` 的 pathless route 健康时透传、
  失败时成为边界）。
- `useFetcher` 绑定最近 route context，owner 释放时删除 fetcher 并 abort 请求。

### Query（`packages/core/query`）

- 新增 `ZeusQueryClient`（`query`/`getQueryData`/`setQueryData`/`invalidateQueries`/
  `cancelQueries`/`removeQueries`/`clear`/`dispose`），`QueryClient` 不再公开。
- 新增 `QueryClientProvider`（`mount()`/`unmount()` 引用计数，owner cleanup 释放，
  不拥有 client 生命周期）、`useQueryClient`（Provider 外抛出可诊断错误）。
- 新增 `useQuery`、`useInfiniteQuery`、`useMutation`；均返回稳定 accessor，observer 与
  owner 同步释放。
- `useMutation` 支持 `useMutation<T, V, E, TContext>`：`onMutate` 返回值作为其余回调的
  类型化 `context`；回调收到 `{ client }`，覆盖乐观更新模式。
- `ZeusQueryClient.query({ …, signal })` 把 loader 的 `request.signal` 与引擎信号合并，
  导航取消即中止查询。
- 删除旧 `createQuery/createInfiniteQuery/createMutation` 与 `client.client` 字段；
  beta 阶段不保留兼容层（AGENTS.md §2.6）。

### Admin（`examples/admin`）

- 迁移为声明式 SPA：`app.tsx`（`QueryClientProvider` + `RouterProvider`）、`router.tsx`
  （route tree + loader 与 query cache 协调）、`pages.tsx`（`Link`/`Outlet`/hooks/
  `useQuery`/`useMutation`）、`routes.ts`（领域模型 + 共享 query key）。
- 保持 `scripts/check/check-admin.ts` 中所有 `data-testid` 与三引擎验收路径不变。
- 移除 admin 对 `@zeus-js/resource` 的未使用依赖（package.json 与 lock importer 同步手工
  更新，未运行 `pnpm install`）。

### 文档 / 发布形状

- `docs/api/router.md`、`docs/api/query.md`、`docs/api/resource.md` 重写/补充，只承诺
  已实现 API。
- `docs/rfcs/RFC-014-router-adapter.md`：新增透明 route / 透明错误边界裁决与错误恢复语义。
- `docs/rfcs/RFC-015-resource-query-contract.md`：补充 `TContext` 类型化乐观更新。
- `.changeset/app-sdk-declarative.md`：router/query minor。
- `docs/api/snapshots/{router,query}.main.api.md` 由 `pnpm api:snapshot` 重新生成。

### 对 PR 任务的完成度

| PR-19 任务                                                                  | 状态                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| 保留 remix data-router 与 tanstack query-core，先设计公开组件/Context API   | DONE                                                  |
| RouterProvider/Link/Outlet、嵌套路由、fetcher/preload、Abort、错误/加载状态 | DONE                                                  |
| QueryClient Context、resource/query/mutation、乐观更新、route loader 协调   | DONE（resource 保持单 owner 原语，未与 query 双缓存） |
| 对底层 router 未来迁移留下适配边界，禁止第二套 matcher/cache                | DONE（WeakMap engine registry + 全 Zeus 公共类型）    |
| 独立 Native SPA 声明式导航、加载、取消、错误恢复                            | DONE（examples/admin，三引擎）                        |

## C. Validation

环境：macOS Darwin 24.6.0 (arm64)，Node v24.18.0，Playwright chromium/firefox/webkit。

| Command                                                                                         | Environment         | Result                                                        | Evidence                 |
| ----------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- | ------------------------ |
| `pnpm check`                                                                                    | local, Node 24.18.0 | PASS                                                          | `/tmp/pr19-verify.log`   |
| `pnpm lint`                                                                                     | local               | PASS                                                          | `/tmp/pr19-lint2.log`    |
| `pnpm format-check`                                                                             | local               | PASS                                                          | `/tmp/pr19-fmt2.log`     |
| `npx vitest run --project unit`                                                                 | local               | PASS `1809 passed`                                            | task output `biu6dpluy`  |
| `npx vitest run --project unit packages/core/router packages/core/query packages/core/resource` | local               | PASS `5 files / 33 tests`（router 18、query 10、resource 5）  | `/tmp/pr19-verify.log`   |
| `pnpm check:cjs`                                                                                | local               | PASS                                                          | `/tmp/pr19-pkg.log`      |
| `pnpm check:exports`                                                                            | local               | PASS                                                          | `/tmp/pr19-pkg.log`      |
| `pnpm api:snapshot` + `pnpm api:check`                                                          | local               | PASS（快照 staged 后复跑：「API snapshots are up to date.」） | `/tmp/pr19-apicheck.log` |
| `pnpm --filter @zeus-js/example-admin check`                                                    | local               | PASS                                                          | `examples/admin` tsc     |
| `pnpm --filter @zeus-js/example-admin build`                                                    | local               | PASS                                                          | `/tmp/pr19-admin2.log`   |
| `pnpm check:admin`（chromium/firefox/webkit）                                                   | local, headless     | PASS ×3                                                       | `temp/admin/report.json` |

`check:admin` 覆盖：query 加载/筛选/分页/单选、DataGrid/Dialog/Input、声明式导航与
history、预加载、刷新深链、403/404/500 错误与恢复、`admin-layout` 同节点与
same-document 断言。

## D. Security & Performance

- 无新增网络入口、secret 或生产写入；示例数据全为本地确定性适配器。
- `Link` 仅拦截同源、无修饰、非 `download`/`target`、未 `defaultPrevented` 的点击，
  绝对 URL/跨域保持浏览器行为。
- bundler 保持 esm-bundler 外置、browser 构建内联既有策略；CJS 产物
  `require("@zeus-js/runtime-dom")`，与依赖声明一致（`check:cjs`/`check:exports` 通过）。
- 未做性能 benchmark；`Outlet` 仅以 route/error 身份重建子树，params 变化不触发重建
  （覆盖于 `components.spec.ts` 的布局保持测试）。

## E. Git / PR

- 起始 HEAD：`cff2721c`
- 最终 HEAD：`ea176ef1`（`feat(app-sdk): add declarative router and query layers`）
- 推送：**未推送**
- Draft PR：**未创建**（按任务约束）
- CI：未触发（未推送）
- 合并 / 发布：**未执行**

## F. Risks & Follow-up

1. **build lifecycle**：`pnpm api:check` 依赖快照进入 git index；本次已在 staged 后复跑
   通过，CI 中需保持先 `api:snapshot` 再提交的顺序。
2. **esm-browser 内联 runtime-dom**：router/query 的 browser 构建现在内联
   `@zeus-js/runtime-dom`，体积增长由既有 ledger/License 覆盖（router 为 Vue-derived
   已登记），未新增依赖许可问题；但 browser 产物体积未做基线对比。
3. **`useQuery` 函数式 options**：通过 `createEffect(setOptions)` 同步；若调用方在
   binding 中读取 query accessor 且 options 又读同一 signal，需注意双重订阅（现有测试
   覆盖常见路径，未覆盖所有组合）。
4. **resource 与 query 的边界**：仍允许应用自行选择；文档已说明不要对同一数据建双缓存，
   但未在编译器层面阻止。
5. **`@zeus-js/resource` 未从 admin 使用**：示例改为 query 后 resource 仅在 docs/测试中
   出现，是否需要调整其路线图由后续 PR 决定。
6. 无 Co-Authored-By 之外的作者署名冲突：按最新 harness 提醒使用
   `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## G. Stop Decision

- **READY_FOR_REVIEW**（本地验证通过、未推送/未开 PR）
- 未涉及 secret、模型费用、正式发布、生产写入或合并；均无用户授权需求被触发。
