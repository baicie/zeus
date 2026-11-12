# Phase P10-2: Admin 路由级懒加载

日期：2026-11-12
基线：`main` @ `8f8f5256`
前置：`docs/performance/build-size-audit.md`、`docs/performance/rfc-babel-wasm-compile-chain.md`

---

## 1. 先验证，再实现

`ZeusRouteObject` 在 `packages/core/router/src/types.ts:68` 声明了
`lazy?: () => Promise<unknown>`，但在 `packages/core/router/src/` 里
**grep 不到任何 `lazy` 的实现**。所以不能假设它可用，先做了实验。

实验结论：**WORKS WITH CAVEATS**。

`createRouter` 把整个路由数组原样传给 `@remix-run/router@1.23.4`
（`index.ts:113`），`mapRouteProperties` 只**增加** `hasErrorBoundary`、
不删字段，所以 `lazy` 被底层完整实现。但有两个必须知道的约束：

| 项                                   | 实测结果                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `lazy: () => Promise<{ element }>`   | **可用**。导航等待它 resolve，渲染正确，同一路由只调用一次                                             |
| `lazy: () => Promise<{ Component }>` | **静默白屏**。这是 React Router 的写法，Zeus 没有 `Component → element` 的适配层，运行时无警告、无错误 |
| lazy 拒绝                            | `navigate()` **resolve**（不 reject），错误冒泡到最近的 `errorElement`                                 |
| lazy 提供 `loader` + `element`       | 两者都生效，loader 先执行                                                                              |
| 导航离开时 lazy 未完成               | **不可取消**，promise 继续，结果被缓存                                                                 |
| 静态 `element` + lazy `element`      | 静态值胜出，lazy 被忽略，只打一条 warning                                                              |
| 渲染期异常                           | **不受**路由 `errorElement` 管辖（只处理 data 层错误）                                                 |

这些写进了 RFC 之外的实现注释，因为下一个写 lazy 路由的人最可能踩的是第一条。

---

## 2. 实现

### 2.1 拆分 `pages.tsx`

原来 2059 行、九个页面在一个文件，`router.tsx` 静态导入全部九个。
拆为：

```
examples/admin/src/pages/
  overview.tsx  users.tsx  user.tsx  reports.tsx  error.tsx
  audit.tsx  roles.tsx  settings.tsx  upload.tsx  shared.tsx
```

`shared.tsx` 收拢被多个页面使用的辅助函数（`StatusBadge`、`seedValue`、
`changedFields`、`errorMessage` 等）。每个页面只导入它实际用到的。

**页面 body 逐字未改** —— 拆分由脚本按函数边界切分，共享 helper 只是加了
`export`，页码级的内容没有一行被重写。`InviteUserDialog` 只被 `users.tsx`
使用，因此留在该文件内。

### 2.2 `pages.tsx` 被删除，不是保留为 barrel

第一版保留了 `pages.tsx` 作为 re-export 入口，构建器立刻报告八条：

```
INEFFECTIVE_DYNAMIC_IMPORT: src/pages/overview.tsx is dynamically imported by
src/router.tsx but also statically imported by src/pages.tsx, dynamic import
will not move module into another chunk.
```

一个静态 re-export 抵消了全部懒加载。`router.tsx` 改为直接从
`./pages/error` 导入 `ErrorPage`，barrel 删除。

`ErrorPage` 保持静态导入是刻意的：**一个要先下载才能报告错误的错误边界不是边界。**

### 2.3 路由改动

每处 `element: () => <XPage />` 改为：

```ts
lazy: async () => ({ element: (await import('./pages/x')).XPage })
```

`loader`（含 RBAC 的 403 判定）与 `errorElement` 保持静态，所以数据加载时机与
权限检查语义没有变化。九条路由全部转换。

---

## 3. 结果（MEASURED）

同一提交、同一机器、Chromium、1440×900、`pnpm build` 产物，
raw / gzip(level 9) / Brotli：

| 项                         |    优化前 |        优化后 |                        变化 |
| -------------------------- | --------: | ------------: | --------------------------: |
| 登录页首屏 JS chunk (raw)  | 340,510 B | **284,747 B** |                  **−16.4%** |
| 登录页首屏 JS chunk (gzip) |  98,380 B |  **86,972 B** |                  **−11.6%** |
| 全部 JS 合计 (raw)         | 340,510 B |     402,635 B | +18.2%（新增 9 个页 chunk） |

登录页首屏的减少量来自九个页面移出主 chunk；总量的增加是因为每个页 chunk
有自己的模块包装开销 —— 这是分包的固有代价，且这些字节**只在实际访问该页时下载**。

### 3.1 各页面 chunk

| chunk           |  raw B | gzip B | Brotli B |
| --------------- | -----: | -----: | -------: |
| `users-*.js`    | 17,196 |  4,963 |        — |
| `overview-*.js` | 10,055 |  2,619 |        — |
| `user-*.js`     |  9,131 |  2,796 |        — |
| `settings-*.js` |  6,909 |  2,047 |        — |
| `audit-*.js`    |  5,225 |  1,629 |        — |
| `reports-*.js`  |  4,081 |  1,371 |        — |
| `upload-*.js`   |  3,399 |  1,307 |        — |
| `roles-*.js`    |  2,316 |    895 |        — |

### 3.2 实际加载验证（Playwright，真实浏览器）

登录页（未认证）：

```
LOGIN JS (1): /assets/index-DcVW-G3G.js
=> PAGE CHUNKS ON LOGIN: NONE (correct)
```

登录后：

```
=> AFTER LOGIN new chunks: /assets/overview-DmiIc5lc.js
=> NAV TO USERS: /assets/users-Bf8eIzRE.js,
                 /assets/zw-input.entry-B6rVgmHQ.js,
                 /assets/zw-data-grid.entry-CIMvg20y.js
```

**登录页确认不下载任何页面模块**，这正是本条改动的目标。导航到 Users 时才加载
`users-*.js` 以及它依赖的 DataGrid WebC entry。

---

## 4. 功能回归

| 检查                                                                             | 结果                 |
| -------------------------------------------------------------------------------- | -------------------- |
| `pnpm --filter @zeus-js/example-admin check`                                     | clean                |
| `pnpm check`（整仓）                                                             | clean                |
| `check:admin` chromium（query、过滤、分页、选择、UI 组件、导航、权限、DevTools） | **PASS**             |
| 对照实验：main 上连跑 3 次                                                       | 3/3 通过，无空 PATCH |
| 我的改动连跑 3 次                                                                | 3/3 通过，无空 PATCH |

**关于 `check:admin` 的一次失败**：开发过程中出现过一次
`PATCH /api/users/ada {}` 空 body（与 CI 上记录的症状相同）。做了对照实验 ——
`main` 连跑 3 次全绿，改动分支连跑 3 次也全绿，空 PATCH 未再复现。结论是既有
flake，不是本次改动引入。没有修改测试绕过它。

---

## 5. 保留的语义

- **Session / RBAC**：`loader` 未动，403 判定仍在导航前执行。
- **Query cache**：`loader` 与组件共享同一 query key 的关系未变。
- **路由状态与 history**：`createRouter` 的参数、`basename`、`history` 未动。
- **错误边界**：`errorElement` 保持静态，lazy chunk 加载失败会落到它。
- **UI**：页面 body 逐字未改，shadcn-admin 的布局与样式未动。

## 6. 已知限制

- **lazy 不可取消**：导航离开后 chunk 仍会下载完并缓存。对 17 KB 的 chunk 无实际影响，
  但如果未来有更大的懒加载模块，需要一个取消机制。
- **渲染异常不受路由 errorElement 管辖**：这是 Router 的既有语义，本次未改变，
  但懒加载让"页面组件在渲染时抛错"这条路径更容易被触发（例如 chunk 内容损坏）。
  目前会表现为 `navigate()` 的 promise 拒绝。
- **首屏减少 16.4%，不是 50%**：九个页面对应的代码本来就不是主 chunk 的主体 ——
  Zeus runtime、Router、Query、i18n 与 shell 才是。要继续降低首屏，需要看这些。
