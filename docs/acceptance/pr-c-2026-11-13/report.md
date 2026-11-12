# PR-C 交付报告：Admin 组件丰富度与页面增强（2026-11-13）

- 仓库：`baicie/zeus`（`examples/admin`）
- 分支：`feat/admin-component-gallery`
- 基线：`70210620`（`main`，2026-11-12）
- 环境：macOS arm64，Node 24.16.0，Chromium / Firefox / WebKit（Playwright 1.61）

本轮的输入是 `zeus-ui/docs/acceptance/pr-a-admin-gap-matrix.md` 的覆盖矩阵（36 行页面/行为 + 30 个组件族）。按矩阵实施，不重写 React、不动 Router / Query / Session / CSRF / RBAC。

## 1. 做了什么

### 1.1 Roles：把假数据换成真数据，并给出可读的权限矩阵

| 改前（矩阵标注）                | 改后                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| 成员数硬编码 `1` / `7`          | 由 `/api/users` 聚合，随目录变化                                            |
| capabilities 是一条 i18n 字符串 | 8 行 × 2 角色的矩阵，每个单元格有 `Allowed` / `Not allowed` 可访问名        |
| 无角色分配能力                  | 表单走真实 `PATCH /api/users/:id { role }`，成功后就地更新计数并 invalidate |
| —                               | 每个角色卡片列出真实成员（前 4 位，含团队）                                 |

### 1.2 Component Gallery（`/admin/components`）

矩阵指出“没有独立组件演示区”。新增按简报的分区组织，**每个示例都可交互**：

| 分区       | 内容                                                                                 | 可交互证据（门禁断言）                       |
| ---------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Actions    | Button（primary/secondary/ghost/destructive/disabled/busy）、Dialog、Toast、Dropdown | 打开并确认对话框、toast 出现                 |
| Forms      | Input、Textarea、Select（含禁用）、Checkbox/Radio、Switch、校验                      | 非法邮箱显示错误、合法邮箱显示成功、开关翻转 |
| Data       | Badge、Avatar（含堆叠）、Progress、Skeleton                                          | 进度条 `aria-valuenow=40`                    |
| Navigation | Tabs、Accordion、Popover、Tooltip                                                    | 切页签、展开折叠、气泡                       |
| States     | Loading、Empty、Error、Success、Disabled                                             | 五个状态块均可见                             |

`/admin/components` 放在侧栏新的 “Reference” 分组，admin 与 viewer 都可访问——它只读且无副作用。

### 1.3 Audit：修掉一个 i18n 泄漏

矩阵标注审计时间用 `toLocaleString('zh-CN')` 硬编码，英文界面会显示中文日期。改为跟随 `i18n.locale()`，格式固定 `yyyy/mm/dd hh:mm`。

## 2. 门禁

`check:admin` 扩展了断言并从“只测存在”升级为“测行为”：

| 断言                                                          | 覆盖              |
| ------------------------------------------------------------- | ----------------- |
| 角色计数来自真实目录（1 member → 分配后 2 → 还原 1）          | 假数据不会通过    |
| 矩阵单元格的可访问名（`Allowed` / `Not allowed` 各一）        | 矩阵不是均匀图    |
| 角色分配走真实 PATCH 并就地反映                               | 写路径真的通      |
| 画廊五个分区可见                                              | 覆盖面            |
| 对话框开→确认→关闭、toast 文案                                | Actions 真交互    |
| 非法邮箱报错、合法邮箱通过                                    | Forms 校验真生效  |
| Tabs 切面板、Accordion `aria-expanded`、Switch `aria-checked` | Navigation 真交互 |
| Progress `aria-valuenow`                                      | Data 状态真绑定   |

结果：

| 引擎     | 主流程 | DevTools |
| -------- | ------ | -------- |
| Chromium | PASS   | PASS     |
| Firefox  | PASS   | PASS     |
| WebKit   | PASS   | PASS     |

其他：

| 命令                                           | 结果   |
| ---------------------------------------------- | ------ |
| `pnpm -F @zeus-js/example-admin check`（tsc）  | 0 错误 |
| `pnpm -F @zeus-js/example-admin build`         | 成功   |
| `vitest --run examples/admin/server/__tests__` | 22/22  |
| `pnpm exec prettier --check examples/admin`    | PASS   |

## 3. 未做与原因

| 项                                       | 状态       | 原因                                                                                                       |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Tasks / Apps / Chats 三个参考页面        | **不做**   | Zeus Admin 没有任务、集成或消息域。矩阵已判定为 “not-applicable”：照抄会违反“业务页不造假后端”             |
| Users 的分面多选、列可见性、URL 状态同步 | 未做       | 需要 `zw-data-grid` 侧的能力（多选模式、列设置）与新的 URL 状态层；属于独立改动，不在本轮范围内硬塞        |
| Settings 拆成 5 个子路由                 | 未做       | 现有 3 段式设置页已覆盖工作区/外观/语言；拆路由会改动 Router 契约，需要单独评审                            |
| 使用 `@zeus-web/select` 等未接入的包     | 未做       | Admin 只依赖 data-grid / dialog / input；引入新包属于依赖变更，需与 zeus-ui 发版对齐                       |
| 仓库级 `pnpm test` 的 3 个失败           | 与本轮无关 | 均在 `scripts/release/*` 与 `packages/web-c/output-wc`，表现为超时，是既有环境问题；本报告不把它们算作通过 |

## 4. 复验

```bash
export PATH=/Users/liuzhiwei/.nvm/versions/node/v24.16.0/bin:$PATH
export NODE_OPTIONS=--experimental-sqlite
pnpm -F @zeus-js/example-admin check
ADMIN_BROWSERS=chromium,firefox,webkit pnpm check:admin
pnpm exec vitest --run examples/admin/server/__tests__
```
