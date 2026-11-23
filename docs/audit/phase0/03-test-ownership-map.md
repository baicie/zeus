# 测试断言责任归属映射

本文件回答一个问题：**把 Demo 搬走时，哪些断言跟着走、哪些留下、哪些要拆成两份。**

## 1. `check:admin` — 115 条断言的责任拆解

`scripts/check/check-admin.ts`（964 行），Playwright 三引擎（chromium/firefox/webkit）。
实测 **115 条 `expect` 调用点**（111 处 `expect(` + 4 处跨行 `await expect(...).poll`），**42 组**。

### 1.1 责任组表

| #   | 组                           | 行号    | 断言对象                                           | expect | 责任层        | 迁移目标                                                      |
| --- | ---------------------------- | ------- | -------------------------------------------------- | -----: | ------------- | ------------------------------------------------------------- |
| 1   | 构建与依赖预检               | 52-71   | `check:vendored-dialog` + tsc + build 三个子进程   |      0 | application   | ecosystem（保留 vendor 预检）                                 |
| 2   | Server 启动                  | 73-91   | 每浏览器 `startAdminServer`                        |      0 | application   | ecosystem                                                     |
| 3   | 登录                         | 151-161 | 填表→提交→login-card 消失、users-page 可见         |      3 | integration   | ecosystem                                                     |
| 4   | 会话 Cookie                  | 162-181 | 轮询 `SESSION_COOKIE` 存在                         |      2 | application   | ecosystem                                                     |
| 5   | 初始 DataGrid 行             | 182-185 | `[data-row-key="ada"]` 可见                        |      1 | **component** | zeus-ui                                                       |
| 6   | 缩放布局                     | 186-225 | `zoom=2` 下无文档溢出                              |      1 | integration   | ecosystem                                                     |
| 7   | 分页                         | 226-228 | `Page 2 of 3`、margaret 行出现                     |      2 | integration   | ecosystem                                                     |
| 8   | 行选中 ARIA                  | 229-230 | 行 `aria-selected="true"`                          |      1 | **component** | zeus-ui                                                       |
| 9   | 搜索过滤                     | 231-249 | 输入→过滤→计数→`Page 1 of 1`                       |      6 | integration   | ecosystem                                                     |
| 10  | 状态过滤                     | 250-255 | select 过滤行                                      |      3 | integration   | ecosystem                                                     |
| 11  | 选中摘要                     | 256-259 | `selection-status` 含姓名                          |      1 | integration   | ecosystem                                                     |
| 12  | 陈旧查询与行 DOM 身份        | 260-273 | 600ms 按住后点击仍命中同一 DOM 行                  |      4 | integration   | ecosystem                                                     |
| 13  | 详情导航                     | 274-281 | URL `/admin/users/ada`、detail 含邮箱、dialog 打开 |      4 | integration   | ecosystem                                                     |
| 14  | **表单重建竞态**             | 282-325 | MutationObserver 计数节点替换 = 0                  |      2 | **framework** | **zeus**                                                      |
| 15  | 保存流程                     | 326-331 | Save→`Saved`、dialog 关闭                          |      2 | integration   | ecosystem                                                     |
| 16  | 保存后详情传播               | 332-350 | user-detail 含新邮箱                               |      1 | integration   | ecosystem                                                     |
| 17  | 同文档/布局持久化            | 351-360 | 跨路由不重载                                       |      2 | **framework** | **zeus**                                                      |
| 18  | Router 历史/预加载           | 361-372 | history-back、preload-status=ready                 |      6 | **framework** | **zeus**                                                      |
| 19  | 深链/刷新/404                | 373-385 | 直达、reload、404 错误路由                         |      5 | **framework** | **zeus**                                                      |
| 20  | 报表/审计页                  | 386-392 | 计数 8/5、audit-table 含 login                     |      5 | integration   | ecosystem                                                     |
| 21  | 组件画廊容器                 | 393-408 | components-page + 5 个 section                     |      2 | **component** | zeus-ui                                                       |
| 22  | Dialog 构建修复证据          | 426-446 | 组件根携带 `@zeus-web/dialog/state` symbol         |      1 | **component** | zeus-ui（保留 vendor 预检在 ecosystem）                       |
| 23  | Dialog 打开/焦点移入         | 448-459 | content 可见、`data-state=open`、焦点入面板        |      3 | **component** | zeus-ui                                                       |
| 24  | **Dialog Tab 焦点陷阱**      | 460-483 | 6 次 Tab 后焦点仍在内容内                          |      1 | **component** | zeus-ui                                                       |
| 25  | **Dialog Escape**            | 485-496 | Escape→`data-state=closed`、content 隐藏           |      2 | **component** | zeus-ui                                                       |
| 26  | Dialog 重新打开              | 498-509 | 再开→open+可见                                     |      2 | **component** | zeus-ui                                                       |
| 27  | Dialog 焦点回归              | 511-527 | Escape 后焦点回 trigger                            |      1 | **component** | zeus-ui                                                       |
| 28  | Dialog confirm/toast         | 529-547 | 第三次打开、confirm→toast                          |      3 | **component** | zeus-ui                                                       |
| 29  | 表单控件与 value-change      | 548-568 | `zw-input` 内层 input、错误/ok 可见                |      3 | **component** | zeus-ui                                                       |
| 30  | Tabs 键盘                    | 569-590 | ArrowRight→tab-three active                        |      3 | **component** | zeus-ui                                                       |
| 31  | Accordion                    | 592-601 | `data-state=open`、宿主 `value="b"`                |      2 | component     | zeus-ui                                                       |
| 32  | Switch                       | 603-613 | 点内层 control→`data-state` 变化                   |      1 | component     | zeus-ui                                                       |
| 33  | Progress/Empty/Error/Success | 615-621 | 状态可见                                           |      4 | component     | zeus-ui（**`:615-618` 为恒真断言 `/.*/`，建议修掉而非迁移**） |
| 34  | Roles 页                     | 623-661 | 成员计数、matrix ARIA、PATCH 后回写                |      8 | integration   | ecosystem                                                     |
| 35  | Settings                     | 662-675 | 保存、`data-theme=dark`、reload 保留               |      4 | integration   | ecosystem                                                     |
| 36  | **i18n**                     | 676-723 | 切 zh-CN、CJK 正则、reload 后仍中文                |      5 | **framework** | **zeus**                                                      |
| 37  | Viewer 权限                  | 724-742 | viewer→route-error 403                             |      4 | integration   | ecosystem                                                     |
| 38  | 未认证 API                   | 743-762 | 无 cookie PATCH→401、session 探针                  |      3 | application   | ecosystem                                                     |
| 39  | 页面错误预算                 | 763     | 整轮无 pageerror                                   |      1 | integration   | ecosystem                                                     |
| 40  | 生产会话复用                 | 827-830 | dev 流程复用生产会话                               |      1 | application   | ecosystem                                                     |
| 41  | **Native DevTools**          | 842-897 | snapshot owners/bindings/timeline、disconnect 清理 |     10 | **framework** | **zeus**                                                      |
| 42  | 总闸门                       | 940-947 | 每浏览器结果必须 passed                            |      0 | application   | ecosystem                                                     |

### 1.2 分层汇总

| 责任层      | 断言数 | 组                                                           | 迁移目标       |
| ----------- | -----: | ------------------------------------------------------------ | -------------- |
| integration |     49 | 3,6,7,9-13,15,16,20,34,35,37,39                              | zeus-ecosystem |
| component   |     30 | 5,8,21-33（Dialog/Tabs/Accordion/Switch/表单/DataGrid/画廊） | zeus-ui        |
| framework   |     30 | 14,17,18,19,36,41                                            | zeus           |
| application |      6 | 1,2,4,38,40,42                                               | zeus-ecosystem |

### 1.3 三组必须留在 zeus 的理由

| 组                 | 断言内容                                                                                                           | 为什么不能搬                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| #14 表单重建竞态   | `ref` 回调是挂载钩子，读 signal **不得**使 `<Show>` 产生依赖；MutationObserver 观测 `#user-email` 节点替换次数 = 0 | 这是 **Runtime 响应式依赖追踪契约**。放到组件仓只能证明「某个组件当时没坏」，无法证明运行时语义正确 |
| #17/#18/#19 Router | 同文档导航、history back/forward、preload、深链、刷新、404                                                         | `@zeus-js/router` 的契约。**admin 是当前唯一消费方**（zeus-ui 的 examples 零使用）                  |
| #36 i18n           | 切语言、CJK 正则匹配、reload 后持久                                                                                | `@zeus-js/i18n` 的契约（持久化部分属应用）                                                          |
| #41 DevTools       | owners/bindings/timeline 快照、翻页后 timeline id 增长、disconnect 后 DOM 移除                                     | `@zeus-js/devtools-consumer` 的契约                                                                 |

### 1.4 组件组可无损抽取的验证

zeus-ui 已有更强的覆盖，不需要从 `check:admin` 复制：

| 组件                  | zeus-ui 现有门禁                                                     | 规模                                 | 覆盖度对比                                                                                    |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Dialog                | `scripts/checks/wc/check-dialog-interaction.ts`                      | 1276 行 / 28 assert / 19 步 / 三引擎 | **强于** `check:admin` 的 6 组：多了嵌套层栈、受控模式、卸载清理、焦点候选过滤、backdrop 坐标 |
| DataGrid              | `e2e/advanced/data-grid/*`（5 个 runtime spec）                      | 1593+1263+926+592+303 行             | **强于** `check:admin` 的 3 组行/ARIA/分页                                                    |
| 表单控件              | `e2e/contract/cross-host-contract.spec.ts` + `a11y-keyboard.spec.ts` | 571+622 行                           | 覆盖四宿主一致性                                                                              |
| Tabs/Accordion/Switch | `e2e/contract/a11y-keyboard.spec.ts`                                 | 同文件                               | 键盘与 ARIA                                                                                   |

**结论**：`check:admin` 的组件组**不需要迁移**，因为 zeus-ui 侧已有等价或更强的验证。
迁移时只需确认三件事：

1. `check:admin` 的 Dialog symbol 断言（#22）用于识别「装的版本是否含修复」——这是**依赖来源证明**，应留在 ecosystem 的 vendor 预检里
2. `check-dialog-interaction.ts` 的 **ARIA 与滚动锁是否真的覆盖**（当前 UNKNOWN）
3. 恒真断言 `:615-618`（`/.*/`）在迁移前修掉，不要带过去

### 1.5 迁移后的断言分布

```
zeus（框架）
  ├── #14  ref 不建立 Show 依赖        ← 需新建宿主（admin 迁走后无消费方）
  ├── #17-19 Router 同文档/历史/深链    ← 同上
  ├── #36 i18n 实时重标签              ← 同上
  └── #41 DevTools 快照                ← 同上

zeus-ui（组件）
  └── 已有 check-dialog-interaction / data-grid runtime / cross-host-contract
      （不新增，只补 ARIA 与滚动锁缺口）

zeus-ecosystem（应用）
  ├── #3,6,7,9-13,15,16,20,34,35,37,39   页面业务流程
  ├── #1,2,4,38,40,42                    构建/Server/会话
  └── #22                                vendor 依赖来源证明
```

**风险**：framework 的 30 条断言在 admin 迁走后**失去宿主**。必须在 ecosystem 里保留一个
「zeus-js 集成验证」应用（或让 ecosystem 的 admin 兼任），否则框架层断言会凭空消失。
这是 `06-risk-register.md` 的 R-03。

---

## 2. `check:admin` 之外的三个验收入口

| 脚本                                              | 行数 | 验证什么                                                                                                              | 责任层                                 | 迁移建议                          |
| ------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| `scripts/check/check-sbom.ts`                     |  594 | CycloneDX 1.5 SBOM 生成与一致性：bom-ref 冲突、依赖图、组件匹配、schema 校验、stale 检查                              | application（供应链）                  | ecosystem 需自建；zeus 保留自己的 |
| `scripts/release/deployment-acceptance.ts`        | 1365 | 四产品部署验收：HTTP 200、HTML、挂载点、HSTS/nosniff、build-info+provenance、逐文件重哈希、沙箱 CSP、浏览器 pageerror | application                            | ecosystem                         |
| `scripts/release/playground-online-acceptance.ts` | 1028 | 仅 Playground（webc-studio、native-lab）：CSP frame-src、沙箱 opaque origin、build-info、CE 宿主绑定                  | application（`:766-783` 属 framework） | 随 Playground 归属决定            |

`deployment-acceptance.ts:39` 直接 `import { CSRF_COOKIE, SESSION_COOKIE } from '../../examples/admin/server/auth'`。
**这是最硬的一处跨层耦合**：部署验收脚本 import 应用的服务端常量。搬 admin 必须同时处理它。

## 3. `examples/admin/server/__tests__` — 26 个 it 全部属 application

| 文件                 | 行数 |     it | expect | 覆盖                                                                                                                           |
| -------------------- | ---: | -----: | -----: | ------------------------------------------------------------------------------------------------------------------------------ |
| `api.spec.ts`        |  644 |     16 |     59 | 鉴权/授权、CRUD+审计、SQLite 重开持久化、上传校验、设置、acceptance 用户、CSRF、Cookie 属性、会话轮换/过期、限流、角色变更吊销 |
| `database.spec.ts`   |  243 |      8 |     18 | 备份/恢复一致性、seed 策略、损坏库拒绝启动、缺失备份、恢复前副本、零用户 bootstrap、acceptance viewer、ID 冲突                 |
| `rate-limit.spec.ts` |   36 |      2 |      5 | 锁定/恢复、Map 有界                                                                                                            |
| **合计**             |    — | **26** | **82** | 全部 application                                                                                                               |

**无一条属 framework/component**。这三个文件整体随 admin 迁移。

---

## 4. zeus-ui 侧测试责任

### 4.1 vitest projects

| project                                            | include                                                                                                                            | 环境                     | 服务对象                                                                | 归属                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- | ----------------------------- |
| `unit`                                             | `packages/**`（略去 DOM 类）+ `scripts/checks/__tests__` + `examples/ai-host/__tests__` + `examples/showcase-shared/src/__tests__` | node                     | 包逻辑 + 检查脚本逻辑                                                   | zeus-ui（ai-host 部分随应用） |
| `unit-jsdom`                                       | `packages/**` DOM 类 + `examples/ai-workbench/__tests__` + `examples/vue-showcase/src/**`                                          | jsdom                    | WC runtime、dialog、popover、ai-\*；**含 ai-workbench 与 vue-showcase** | **混合**                      |
| `unit-react-showcase`                              | `examples/react-showcase/src/**`                                                                                                   | jsdom + React            | react-showcase 页面级                                                   | 随 react-showcase             |
| `canary`                                           | `packages/zeus-compat/__tests__/canary-capabilities.spec.ts`                                                                       | jsdom                    | canary 包能力                                                           | zeus-ui                       |
| `e2e`                                              | `e2e/**`（排除 showcase/ai-browser）                                                                                               | **jsdom**                | 组件 runtime + 跨宿主契约                                               | 拆分                          |
| `showcase-e2e`                                     | `e2e/showcase/*.spec.ts`                                                                                                           | Playwright + 4 个 server | react/vue/advanced showcase + **apps/docs**                             | 拆分                          |
| `ai-browser-e2e`                                   | `e2e/ai-browser/*.spec.ts`                                                                                                         | Playwright               | **examples/ai-showcase**                                                | 随 ai-showcase                |
| `data-grid-framework-browser-e2e`                  | 单 spec                                                                                                                            | Playwright 三引擎        | data-grid renderer                                                      | zeus-ui                       |
| `data-grid-benchmark` / `web-c-instance-benchmark` | bench                                                                                                                              | jsdom / node             | 性能                                                                    | zeus-ui                       |

### 4.2 `showcase-e2e` 不能整体留也不能整体走

`e2e/showcase/setup.ts` 启动 **4 个服务**：react-showcase（5173）、vue-showcase（5174）、advanced-showcase（5176）、apps/docs（5175）。

14 个 spec 的实际目标：

| 目标               | spec 数 | spec                                                                                                                                                                                             |
| ------------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **apps/docs**      |       9 | accessibility-gate、docs-chat-playground、docs-component-playgrounds、docs-data-grid、docs-i18n、docs-primitive-playground-visuals、interaction-keyboard、select、primitive-presentation（部分） |
| react/vue showcase |       4 | icons、playground、routes、themes                                                                                                                                                                |
| advanced-showcase  |       1 | advanced                                                                                                                                                                                         |

**结论**：`showcase-e2e` 是「组件行为 + 文档站页面流程」的混合体。若 docs 留 zeus-ui，这部分 e2e 也留。
若 examples 留在 zeus-ui（当前建议 keep），则整个 `showcase-e2e` 不需要动。

### 4.3 e2e 责任表（节选关键项）

| spec                                                 | 驱动对象                                          | 验证层                                                               | 归属                            |
| ---------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------- |
| `e2e/contract/cross-host-contract.spec.ts`（571 行） | 四宿主（wc/react/vue/native）挂同一个组件         | **框架契约**：light-DOM 结构、反射属性、事件名、payload key 必须一致 | zeus-ui（跨宿主契约是核心资产） |
| `e2e/contract/a11y-keyboard.spec.ts`（622 行）       | 四宿主挂 input/select/dialog/form-field/data-grid | 组件 ARIA/键盘                                                       | zeus-ui                         |
| `e2e/ai/contract.spec.ts` 等 4 个                    | `@zeus-web/ai-core` + 三渲染器                    | ai 适配器契约                                                        | zeus-ui                         |
| `e2e/ai-browser/s1-s3.spec.ts`                       | **examples/ai-showcase** `?fast`                  | 应用 E2E                                                             | 随 ai-showcase                  |
| `e2e/advanced/data-grid/*`（5 spec，4677 行）        | `zw-data-grid` WC                                 | 组件 runtime                                                         | zeus-ui                         |
| `e2e/examples/vite-react/input-event.spec.ts`        | 直接 import input 包                              | 组件 wrapper 契约                                                    | zeus-ui（**未被任何 CI 调用**） |

### 4.4 `scripts/checks` 中的 examples 强约束（决定 examples 能否搬走）

| 检查脚本                            |         行数 | 强制的约束                                                                                                                                                                                               |
| ----------------------------------- | -----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-showcase-implementation.ts`  |          228 | 每个已实现组件**必须**在 React 与 Vue 两个 showcase 有 `demos/<batch>/<Pascal>DemoPage.{tsx,vue}`；两个 showcase 必须依赖对应 `@zeus-web/*`；`build:deps` 脚本必须精确匹配；root `site:check` 必须包含它 |
| `check-showcase-metadata.ts`        |          166 | showcase 的 icons 必须与 `packages/icons` **双向全等**；themes 必须与 `packages/themes` 全等；组件名必须与 registry 一致                                                                                 |
| `check-product-contract.ts:624-700` | 1129（总计） | showcase 必须有 `zeus-ui.json`/`zeus-ui.lock.json`/`src/lib/cn.ts`/`src/styles/zeus.css`；P0 Button/Input demo **必须** import `@/components/ui/*` 且**禁止** import `@zeus-web/<x>/react\|vue`          |
| `check-examples.ts`                 |          157 | `native-wc`、`next-app` 的导入形态与 `use client` 断言                                                                                                                                                   |

**结论**：`zeus-ui/examples` 不是一个独立可搬的目录——它是 registry + CLI 同步链路的下游，
被 4 个检查脚本与根 `site:check` 双重锁定。搬走它需同时改这 4 个脚本 + 根 scripts，且会打断 `site:check`。

### 4.5 `check-dialog-interaction.ts` — 组件责任的最强证据

- 1276 行，Playwright 三引擎，**28 处 assert**，19 个步骤
- 覆盖：初始态、trigger 打开、**Tab 焦点陷阱（正向 6 次 + 反向 6 次）**、**Escape 关闭 + 焦点归还**、
  重开、close 控件、backdrop 坐标点击、程序化打开、外部焦点时 Escape、焦点候选过滤（`display:none`/`inert`）、
  页面仍收到 Escape、**嵌套层栈（一次 Escape 只关内层）**、卸载清理、受控模式三态
- **UNKNOWN**：ARIA 断言与滚动锁断言在已检视范围内未见

**这证明了设计包的判断正确**：Dialog 的组件行为断言归 zeus-ui，且 zeus-ui 侧已经比 `check:admin` 更完整。
迁移时 `check:admin` 的 Dialog 组不需要复制过去。

---

## 5. 断言迁移的硬约束

1. **`check:admin` 不能整文件归属**：42 组里只有 6 组（application）能整体随 admin 走；
   30 条 framework 断言需要新宿主体；30 条 component 断言在 zeus-ui 已有更强覆盖
2. **framework 断言失去宿主**：admin 迁走后，`zeus` 仓内无 Router/Query/i18n 的集成消费方
3. **部署验收脚本 import 应用服务端**：`deployment-acceptance.ts:39` 是硬耦合
4. **examples 被检查脚本双重锁定**：搬 examples 需同步改 4 个检查脚本与根 `site:check`
5. **不得用删除/跳过/放宽冒充迁移完成**：设计包 `docs/06-acceptance-and-non-goals.md:30` 已明确，
   本审计确认当前无 `continue-on-error` 掩盖失败的情况（未逐 job 验证，INFERRED）

## 6. UNKNOWN

- `check:admin` 在各 workflow 中是阻塞门禁还是允许失败（`ci.yml:641-642` 在 `packed-consumers` job 内，未见 `continue-on-error`，INFERRED 为阻塞）
- `check-dialog-interaction.ts` 的 ARIA 与滚动锁覆盖
- `e2e/examples/vite-react/input-event.spec.ts` 未被 CI 调用是否是有意
- `e2e/advanced/data-grid/test-virtual-focus.spec.ts` 是否为遗留调试 spec（文件内 `describe('debug')`）
