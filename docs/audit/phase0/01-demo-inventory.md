# Demo Inventory 全量表

分类只允许：`framework` / `component` / `integration` / `application` / `fixture` / `benchmark` / `unknown`
决策只允许：`keep` / `move` / `split` / `merge` / `retire` / `investigate`

规模口径：文件数与 TS/TSX/Vue 行数，排除 `node_modules`、`dist`、`.next`、`.vitepress/dist`。

---

## A. `zeus/examples` — 21 个目录

`pnpm-workspace.yaml:8` 的 `examples/*` 匹配 20 个（`fixtures` 无 `package.json`，不是 workspace 包）。

| #   | 路径                                          | 目的                                                                          | 规模               |       @zeus-js |                 @zeus-web | 分类                | 决策                     | 风险 | 依据                                                                |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ | -------------: | ------------------------: | ------------------- | ------------------------ | ---- | ------------------------------------------------------------------- |
| 1   | `examples/admin`                              | 多页面业务应用：认证、SQLite、审计、报表、上传、组件画廊                      | 55 文件 / 10070 行 | 5（workspace） | 25（24 pinned + 1 file:） | **application**     | **split**                | 高   | `src/pages/*` 9 页；`server/api.ts:87-1018`；见下文 A1              |
| 2   | `examples/playground-editor`                  | 在线 Playground/IDE，双产品 `native-lab` + `webc-studio`，WASM 编译，隔离沙箱 | 37 文件 / 6267 行  | 9（workspace） |                         0 | **application**     | **investigate → keep**   | 高   | `Dockerfile`；`playground-image.yml`；`playground-pages.yml`；见 A2 |
| 3   | `examples/headless`                           | 私有库 `@zeus-ui/headless`：6 个组件，多打包器产物 + React/Vue wrapper        | 46 文件 / 1912 行  |              8 |                         0 | **fixture**（库型） | **investigate**          | 高   | 被 5 个示例以 `workspace:*` 消费；无 dev server                     |
| 4   | `examples/headless-demo`                      | 极简消费 demo，14 行                                                          | 6 文件 / 23 行     |              3 |                         0 | **component**       | **move**（随 headless）  | 低   | `src/main.tsx:1-14`；**未声明 `@zeus-ui/headless` 依赖**            |
| 5   | `examples/context`                            | `createContext`/`inject` 最小示例                                             | 5 / 128            |              3 |                         0 | **framework**       | **keep**                 | 低   | `src/main.tsx:1-8`                                                  |
| 6   | `examples/counter`                            | `createSignal` + `render` 最小计数器                                          | 5 / 24             |              3 |                         0 | **framework**       | **keep**                 | 低   | `src/main.tsx:1-18`                                                 |
| 7   | `examples/todo`                               | `For` + signal 不可变更新                                                     | 5 / 91             |              3 |                         0 | **framework**       | **keep**                 | 低   | `src/main.tsx:1,16-33`                                              |
| 8   | `examples/light-dom-slots`                    | `defineElement` + `Host`/`Slot` 具名投影                                      | 5 / 151            |              3 |                         0 | **framework**       | **keep**                 | 低   | `src/main.tsx:1,60-145`                                             |
| 9   | `examples/project-board`                      | 524 行单文件看板，memo/context/自定义事件                                     | 7 / 531            |              2 |                         0 | **integration**     | **investigate**          | 中   | 有应用形态但无路由/持久化/网络                                      |
| 10  | `examples/next-boundary`                      | Next.js App Router 服务端/客户端边界                                          | 11 / 65            |              6 |                         0 | **integration**     | **keep**                 | 中   | `app/page.tsx:5-15`；`ci.yml:706`                                   |
| 11  | `examples/web-component`                      | 三个自定义元素（属性/事件/Shadow）                                            | 8 / 221            |              5 |                         0 | **component**       | **keep**                 | 低   | `src/components/*`                                                  |
| 12  | `examples/devtools-panel`                     | 挂载 `@zeus-js/devtools-consumer` 面板                                        | 7 / 122            |              4 |                         0 | **integration**     | **keep**                 | 低   | `src/main.tsx:1-5,36-40`；`ci.yml:708`                              |
| 13  | `examples/react-wrapper`                      | 虚拟模块 `zeus:react:z-button` 绑定                                           | 8 / 131            |              5 |                         0 | **integration**     | **keep**                 | 低   | `src/App.tsx:1-34`                                                  |
| 14  | `examples/vue-wrapper`                        | 虚拟模块 `zeus:vue:z-button` 绑定                                             | 8 / 75             |              5 |                         0 | **integration**     | **keep**                 | 低   | `src/App.vue:1-30`                                                  |
| 15  | `examples/stencil-wrapper`                    | Stencil 自身产物，作为 wrapper 参照物（不用 Zeus）                            | 12 / 507           |          **0** |                         0 | **fixture**         | **retire / investigate** | 低   | `stencil.config.ts`；0 个 `@zeus-js` 依赖                           |
| 16  | `examples/registry-react`                     | registry 风格组件展示                                                         | 14 / 438           |              0 |                         0 | **component**       | **move**                 | 中   | 依赖 `@zeus-ui/headless`；无 CI                                     |
| 17  | `examples/registry-vue`                       | 同上 Vue 版                                                                   | 12 / 32            |              0 |                         0 | **component**       | **move**                 | 中   | 同上                                                                |
| 18  | `examples/use-headless-cli`                   | `zeus-ui add button` 脚手架产物                                               | 10 / 203           |              0 |                         0 | **component**       | **move**                 | 中   | `components.json`                                                   |
| 19  | `examples/use-headless-react`                 | `@zeus-ui/headless/react` 全组件消费                                          | 6 / 214            |              0 |                         0 | **component**       | **move**                 | 中   | `src/main.tsx:3-15`                                                 |
| 20  | `examples/use-headless-vue`                   | `@zeus-ui/headless/vue` 全组件消费                                            | 7 / 11             |              0 |                         0 | **component**       | **move**                 | 中   | `src/App.vue:3-13`                                                  |
| 21  | `examples/fixtures/third-party-output-plugin` | 第三方 output kind 契约（`acme:json`）                                        | 3 / 0              |      0（peer） |                         0 | **fixture**         | **keep**                 | 低   | `index.js:1-38`；被 `check-examples.ts:33-37` 排除                  |

### A1 — `examples/admin` 拆分建议

Admin 同时承担 5 项职责，必须按职责拆，不能整体搬：

| 职责                                  | 载体                                                                                                  | 目标归属                                     | 理由                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| 应用（9 页业务、Router、Query、i18n） | `src/app.tsx`、`src/pages/*`、`src/router.tsx`、`src/shell/*`                                         | **zeus-ecosystem**                           | 唯一消费 `@zeus-js/router` + `@zeus-js/query` 的应用   |
| 服务端（HTTP、SQLite、认证、限流）    | `server/api.ts`、`server/database.ts`、`server/auth.ts`、`server/security.ts`、`server/rate-limit.ts` | **zeus-ecosystem**                           | 真实持久化与认证，非框架能力                           |
| 组件画廊                              | `src/gallery.tsx`（836 行，20 包）                                                                    | **zeus-ui**（与 docs 合并评估）              | 纯组件展示，与 `apps/docs` 的 29 组件页存在重叠        |
| 生产镜像与部署                        | `Dockerfile`、`deploy/docker-compose.deploy.yml`                                                      | **zeus-ecosystem**                           | `admin-image.yml` 的生产载体                           |
| GitHub Pages 只读 demo                | `deploy/demo-index.html`、`deploy/demo-404.html`、`src/demo-api.ts`、`src/admin-api.ts`               | **zeus-ecosystem**（站点编排可留 zeus 双轨） | 与 zeus-ui 的 ai-workbench demo 共用 `zeus-demos` 站点 |

`src/gallery.tsx` 的抽离可行性：结构上是普通 page，只依赖 `t`、`Icon`、`withProp/withRef` 与全局元素注册；
但当前嵌在 `AdminShell` + 会话上下文 + `/admin` basename 下，无独立布局（`router.tsx:78-90,130-137`）。
抽离需同时带走 20 个 `wc/auto` 注册——INFERRED 可行，无独立入口是 VERIFIED。

### A2 — `examples/playground-editor` 的特殊性

- **是产品不是示例**：独立镜像 `ghcr.io/<owner>/zeus-playground`、生产域名、独立 Pages 仓库 `zeus-playground`、
  SSH 部署到 18080/18081（`playground-image.yml:249`、`deploy/docker-compose.deploy.yml:17-19`）
- **对 `@zeus-web/*` 零依赖**，因此不属于「反向依赖污染」
- **但强耦合 monorepo 源码**：`Dockerfile:9-23` 复制 `crates/`、`packages/`、`scripts/` 全量；
  用 `@zeus-js/compiler-wasm` 在 Worker 内编译
- 6 个门禁脚本共 2822 行，全部是 Playwright 真实浏览器验收

**决策理由**：设计包把「zeus 不承担应用镜像部署」写成硬约束（`docs/04-ci-deployment-evidence.md:53-54`）。
Playground 是框架能力的直接演示（WASM 编译器 + 沙箱），但它是完整应用形态。
两条路都成立，需用户决策：留在 zeus（作为框架的旗舰 demo）或迁 ecosystem（作为参考应用）。
这是 `07-open-questions.md` Q2。

---

## B. `zeus-ui/examples` — 16 个目录

全部是 workspace 包（`pnpm-workspace.yaml:7`）。**只有 1 个直接依赖 `@zeus-js/*`**。

| #   | 路径                                  | 目的                                                     | 规模      | @zeus-js | @zeus-web | 分类                      | 决策                          | 风险 | 依据                                                 |
| --- | ------------------------------------- | -------------------------------------------------------- | --------- | -------: | --------: | ------------------------- | ----------------------------- | ---- | ---------------------------------------------------- |
| 1   | `examples/ai-workbench`               | 生产级 AI 应用：SSE + BYOK 双模式，AES-GCM vault         | 30 / 6621 |    **3** |         4 | **application**           | **move**（ecosystem）         | 高   | 唯一有生产部署的 UI 侧应用                           |
| 2   | `examples/ai-host`                    | 参考 Host 服务：command/SSE/snapshot 协议，`node:sqlite` | 15 / 3291 |        0 |         2 | **application**（服务端） | **move**（与 workbench 同批） | 高   | `ai-workbench-image.yml` 两镜像                      |
| 3   | `examples/react-showcase`             | React 绑定画廊：20 组件 × 7 路由                         | 75 / 6094 |        0 |    **23** | **component**             | **keep**                      | 中   | 20 个 `/components/$name` 页                         |
| 4   | `examples/vue-showcase`               | Vue 绑定画廊：同构镜像                                   | 73 / 981  |        0 |    **23** | **component**             | **keep**                      | 中   | 与 react-showcase 逐文件同构                         |
| 5   | `examples/advanced-showcase`          | 5 个 advanced 组件画廊 + 薄 React Router 壳              | 29 / 2134 |        0 |         5 | **component**             | **keep**                      | 中   | 6 路由；无认证/持久化/网络                           |
| 6   | `examples/native-showcase`            | 原生 WC 画廊（单页）                                     | 9 / 304   |        0 |         1 | **component**             | **keep**                      | 低   | 不在 e2e setup 内                                    |
| 7   | `examples/showcase-shared`            | 展示元数据库（20 组件描述、icons、themes）               | 17 / 2194 |        0 |         1 | **fixture**（元数据）     | **keep**                      | 中   | 被 4 个 showcase + docs + e2e 消费                   |
| 8   | `examples/ai-showcase`                | AI stories 画廊（脚本化 host，hash 路由）                | 12 / 1207 |        0 |         5 | **component**             | **investigate**               | 中   | 被 `ai-browser-e2e` 驱动                             |
| 9   | `examples/data-grid-react18-consumer` | React 18.3.1 版本夹具                                    | 5 / 175   |        0 |         1 | **fixture**               | **keep**                      | 低   | 钉死 React 18，有实质断言                            |
| 10  | `examples/next-app`                   | Next.js 宿主绑定验证                                     | 16 / 464  |        0 |         7 | **integration**           | **keep**                      | 中   | 唯一 Next 宿主；被排除出 `examples:check`            |
| 11  | `examples/native-wc`                  | WC 直用验证（骨架）                                      | 5 / 19    |        0 |         7 | **integration**           | **keep**                      | 低   | 只受文本契约断言                                     |
| 12  | `examples/react-vite`                 | 最小 React 注册消费                                      | 14 / 429  |        0 |         7 | **integration**           | **keep**                      | 低   | 仅类型检查                                           |
| 13  | `examples/vanilla`                    | 最小 WC 加载（14 行）                                    | 3 / 14    |        0 |         2 | **integration**           | **retire / investigate**      | 低   | **无 check/test/build 门禁**                         |
| 14  | `examples/vite-react`                 | 最小 React 绑定                                          | 5 / 98    |        0 |         2 | **integration**           | **retire / investigate**      | 低   | 无根脚本                                             |
| 15  | `examples/vite-vue`                   | 最小 Vue3 绑定                                           | 6 / 115   |        0 |         2 | **integration**           | **retire / investigate**      | 低   | 无根脚本                                             |
| 16  | `examples/vite-vue2`                  | 名义 Vue2，**实为 Vue3**                                 | 4 / 43    |        0 |         2 | **integration**           | **retire**                    | 低   | `package.json:6` 写 Vue 2，`:16` 依赖 `vue: ^3.5.38` |

### B1 — `examples/ai-workbench` + `ai-host` 必须同批

- 两镜像同批发布（`ai-workbench-image.yml:59-60`）；注释明写「ship one without the other breaks SSE」
- `ai-host` 是 `ai-workbench` 的服务端半身：7 个 gate 脚本全部 `import { startAiHost }`
- 迁移时它们是**一个产品对**，不能拆到两个仓库

### B2 — `react-showcase` / `vue-showcase` 合并的边界

两者展示骨架逐文件同构（AppShell/Sidebar/Topbar/DemoPage 等），但：

- **可合并**的是展示骨架与数据（`showcase-shared` 已是元数据层）
- **不可合并**的是双框架绑定验证——这是它们唯一的独有价值：同一 WC 在 React 与 Vue wrapper 下的
  事件名、受控语义、属性反射是否一致
- 与 `apps/docs` 的重叠是**部分重叠**：同 20 个组件的外观展示两处都有；docs 偏 API/安装/playground，
  showcase 偏双框架行为一致性。不是重复建设，不建议合并进 docs

### B3 — 空壳样例的判定

`vanilla`（14 行）、`vite-react`（98 行）、`vite-vue`（115 行）、`vite-vue2`（43 行）：

- 均无 `check` 脚本、无 `test` 脚本、无根命令引用、无 CI job
- `vite-vue2` 的描述与依赖不符（声称 Vue 2，实为 Vue 3）
- **INFERRED**：属于历史模板残留。`retire` 需要用户确认；保守做法是 `investigate`

---

## C. `zeus-ui/apps` — 1 个

| 路径        | 目的                                                                             | 规模       | @zeus-web | 分类          | 决策     | 依据                                                    |
| ----------- | -------------------------------------------------------------------------------- | ---------- | --------: | ------------- | -------- | ------------------------------------------------------- |
| `apps/docs` | VitePress 组件文档站：29 组件页 × 2 语言 + 28 个单组件 demo + 1 个 DataGrid 面板 | 127 / 2385 |        31 | **component** | **keep** | GitHub Pages 部署，base `/zeus-ui/`（`docs.yml:52-97`） |

- **无完整小程序**：无 `vue-router`、无 store、无 iframe 嵌入 examples
- 与 examples 的耦合只有两处：`showcase:e2e:deps` 构建前置、`native-wc.md` 的文字链
- `ZeusPlayground.vue`（236 行）在全部 md 中零引用——疑似死代码（VERIFIED 引用面）

---

## D. 汇总统计

### D1 — 按分类

| 分类        | zeus | zeus-ui |  合计 |
| ----------- | ---: | ------: | ----: |
| application |    2 |       2 | **4** |
| integration |    5 |       6 |    11 |
| component   |    7 |       5 |    12 |
| framework   |    4 |       0 |     4 |
| fixture     |    3 |       1 |     3 |
| （docs 站） |    — |       1 |     1 |

### D2 — 按决策

| 决策        |              数量 | 主要对象                                                          |
| ----------- | ----------------: | ----------------------------------------------------------------- |
| keep        |                22 | 框架示例、组件画廊、绑定验证、fixture                             |
| move        |                 7 | headless-demo、5 个 headless 消费示例、ai-workbench + ai-host     |
| split       |                 1 | admin（5 项职责）                                                 |
| merge       |                 0 | 暂不合并；showcase 骨架合并列为 investigate                       |
| retire      | 1 + 3 investigate | vite-vue2；vanilla/vite-react/vite-vue/stencil-wrapper            |
| investigate |                 5 | playground-editor、headless、project-board、ai-showcase、3 个空壳 |

### D3 — 有生产部署的

| 对象                   | 部署载体                                        | environment    |
| ---------------------- | ----------------------------------------------- | -------------- |
| admin                  | `admin-image.yml`                               | `production`   |
| playground-editor      | `playground-image.yml` + `playground-pages.yml` | `production`   |
| ai-workbench + ai-host | `ai-workbench-image.yml`                        | `production`   |
| docs                   | `zeus-ui/docs.yml`                              | `github-pages` |

---

## E. 盘点完整性说明

**搜索范围**（全部已执行）：

- `examples/`、`apps/`、`benchmarks/`、`e2e/`（两仓）
- 所有 `package.json`（`zeus` 38 + 6 模板；`zeus-ui` 46 + 16 examples + 1 app）
- `pnpm-workspace.yaml`（两仓）
- 所有 `.github/workflows/*.yml`（`zeus` 17、`zeus-ui` 9）
- `Dockerfile`、`docker-compose*`、`nginx.conf`（两仓 `examples/`）
- 根 `package.json` 的 193 + 130 个 scripts
- `vitest.config.ts` 的全部 project

**未发现但可能存在的**：

- `zeus-ui/temp/`（86 个目录，含大量历史验收产物）—— 不是 Demo，是证据残留。未逐个审计
- `zeus-ui/benchmarks/web-c-instances` —— 已归入 benchmark 类，未列入本表
- `zeus/scripts/bench/fixtures/*` —— 是 workspace 包但属基准夹具，未列入 examples 表
- `zeus-ui/docs/`（14 个子目录，文档资产）—— 不在 Demo 范围

**UNKNOWN**：

- 是否存在被外部脚本、README、网站引用但已从仓库删除的旧 Demo（无历史扫描）
- `zeus-ui/temp/` 下 86 个目录中是否有仍在被脚本读取的路径（`joint-readiness.ts:361` 读 `temp/ai-pack-report.json` 已证实至少 1 个）
