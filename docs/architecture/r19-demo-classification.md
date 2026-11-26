# R19 · examples 十个"复杂目录"的分类（P11）

基线 `ddae9d95`（main）。本轮只分类，**没有移动任何文件**。

类别只有四种：`app` / `demo` / `fixture` / `wrapper`。判据是**这个目录为什么存在**，
不是名字、README 的自称或估计行数。所有行数用受控文件实测：
`git ls-files <dir> | xargs wc -l`，排除 `node_modules`、`dist`、`.next`。

> 本文件是对 `ddae9d95` 初版的复核重写。初版的若干行数与依赖陈述与实测不符，
> 三个分类结论也不同；逐条差异见 §6。

---

## 1. 分类表

| 目录                          | 类别        | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 建议去向                                              |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `examples/project-board`      | **demo**    | 7 个受控文件、935 行；主体是 524 行单文件 `main.tsx` + 355 行 `style.css`，无第二个页面。全目录 grep `router\|fetch(\|localStorage\|sessionStorage\|indexedDB` 零命中：无路由、无持久化、无网络。1 个 `.tsx`；依赖 `@zeus-js/zeus` + `@zeus-js/vite-plugin`；无 Dockerfile/nginx；行为门禁为零（只有 `examples:check:all` 的 tsc + vite build）。覆盖面最广：`prop:value` 4 处、对象 `class={{…}}` 3 处（`examples/` 中唯一）、`defineElement` + `emits` + `consumes` + `Provider bridge` + `Show`/`For`/`Host`/`Slot` 同树           | ecosystem demos（先补契约用例，见 §3.1）              |
| `examples/headless-demo`      | **wrapper** | 6 个受控文件、96 行；源码只有 14 行 `main.tsx`（`import '@zeus-ui/headless/wc'` + `styles.css` + 两个 `console.log` 事件监听）+ 32 行 `index.html` 静态标签。声明 4 个 Zeus 依赖，**实际只 import 1 个**（`@zeus-ui/headless`），`@zeus-js/zeus` / `runtime-dom` / `web-c-runtime` 是死依赖。无 vite 插件、无测试、无行为门禁                                                                                                                                                                                                         | ecosystem demos                                       |
| `examples/use-headless-cli`   | **wrapper** | 10 个受控文件、307 行；源码 195 行 / 2 个 `.tsx`（`main.tsx` 126 + 生成的 `button.tsx` 63 + `utils.ts` 6）+ `components.json`。CLI scaffold 产物：`zeus-ui add button`。只消费 `@zeus-ui/headless`；Tailwind v4 真正生效（`dist/index.html` 内联已展开的 utilities）。无行为门禁。已落后于当前 CLI 输出（见 §3.4）                                                                                                                                                                                                                    | ecosystem demos（迁移前按当前输出重生成）             |
| `examples/use-headless-react` | **wrapper** | 6 个受控文件、401 行；207 行单页 `main.tsx` + 151 行内联样式 `index.html`。13 个 headless 组件全覆盖，两页用 `useState` 切换（不是路由）。只消费 `@zeus-ui/headless/react`；`@vitejs/plugin-react` 编译 JSX，Zeus 编译器不参与；无行为门禁                                                                                                                                                                                                                                                                                            | ecosystem demos                                       |
| `examples/use-headless-vue`   | **wrapper** | 7 个受控文件、394 行；204 行 `App.vue` + 143 行内联样式；与 React 版逐组件同构（同样 13 个组件、同样两页本地状态、同样 `alert()` 演示）。只消费 `@zeus-ui/headless/vue`；无 `.tsx`；无行为门禁                                                                                                                                                                                                                                                                                                                                        | ecosystem demos                                       |
| `examples/registry-react`     | **demo**    | 14 个受控文件、524 行；9 个源码 `.ts`/`.tsx`、421 行。**声明了 `@zeus-ui/headless` 却零 import**（`grep -rn '@zeus' src` 无命中）：5 个组件是手写复刻——`Switch`/`Checkbox` 自写 `role` 与 `data-state`，`Dialog` 只是 `div` 包装，`Button` 是裸 `<button>` + `cn()`；与 `packages/create/registry` 真正下发的 `ZButton`/`ZSwitch` 版本不是同一份代码。无 Tailwind 管线（依赖里只有 `tailwind-merge`，无 `tailwindcss`/插件/配置），构建产物 CSS 仅 757 B 且原样带出 `@tailwind base/components/utilities`，页面实际无样式。无行为门禁 | **retire**（或按 `zeus-ui add` 真实输出重生成后再议） |
| `examples/registry-vue`       | **demo**    | 12 个受控文件、290 行；7 个源码 `.ts`/`.vue`、189 行；只有 `Button`/`Switch`/`Checkbox` 三个组件（无 Dialog、无 Tabs），`App.vue` 29 行。同上：零 headless import、手写组件、757 B 未处理 CSS。无行为门禁                                                                                                                                                                                                                                                                                                                             | **retire**（同上）                                    |
| `examples/devtools-panel`     | **fixture** | 7 个受控文件、253 行；`main.tsx` 103 行只做四件事：定义两个自定义元素、连接 devtools consumer、挂载 panel、把 `window.devtoolsSmoke` 暴露给门禁。`vite.config.ts` / `tsconfig.json` 把 `@zeus-js/devtools-consumer` 直接指向 `packages/tooling/consumer/src`（绕过包解析），说明它的存在目的就是打这套源码。`scripts/check/check-devtools-panel.ts` 216 行、三引擎，并额外断言生产 runtime 不含 devtools 字符串。除此门禁外无其他消费者                                                                                               | **stays in core**                                     |
| `examples/next-boundary`      | **fixture** | 11 个受控文件、177 行；4 个 `.tsx`、65 行源码。`build-components.mjs` 先用 `@zeus-js/bundler-plugin` + `componentLibrary` 产出 WC / manifest / React wrapper，再由 Next 16 构建。`scripts/check/check-next-boundary.ts` 169 行、三引擎，含禁 JS 的宿主/属性断言与 hydration 报错断言。全仓唯一 Next 宿主                                                                                                                                                                                                                              | **stays in core**                                     |
| `examples/headless`           | **fixture** | 46 个受控文件、2075 行（`src` 与 `__tests__` 合计 1894，其中测试 788；构建配置 181）。包名 `@zeus-ui/headless`，`private: true`，**从未发布**（registry 查无此包），并在 `.changeset/config.json` 的 ignore 列表。无 `index.html`、无 dev 入口，`src/main.tsx` 无人引用（§3.2）。7 个 spec 由 `pnpm test-unit` 执行；被 6 个示例以 `workspace:*` 消费；被 `check-registry-cli` 先构建；是 `tsconfig.json` / `tsconfig.build.json` / `vitest.config.ts` 中 `@zeus-ui/headless` 别名的落点；占 parity 语料 23/56                        | **stays in core**                                     |

**汇总：app 0、demo 3、fixture 3、wrapper 4。**
去向：ecosystem demos 5、stays in core 3、retire 2。

---

## 2. 本批没有"应用"

`app` 的判据是独立交付链路：Dockerfile、镜像、部署单元、生产域名。
十个目录**没有一个**有 Dockerfile / `nginx.conf` / `docker-compose*`
（全仓 `examples/` 只有 `examples/playground-editor/` 有，不在本次范围）。

所以任务给出的第一类在本批是 0。严格性要求成立：**531 行的单文件 Kanban 是 demo，
不是 app**；`project-board` 有应用形态（业务模型、多区块交互、派生状态）但没有
应用的交付面。

"有 CI 构建"也不等于应用：`examples:check:all` 把全部 19 个示例包一起
tsc + vite build（§4），证明的是能编译，不证明任何行为。

---

## 3. 需要单独说明的五件事

### 3.1 `project-board` 的去向取决于一个覆盖缺口

它是唯一同时使用 **对象 `class={{…}}`、`consumes` + `Provider bridge`、
`defineElement` + `emits`** 的示例。而：

- `crates/zeus_compiler/tests/golden/` 的 46 个 fixture 中 **没有任何一个含
  `consumes` 或 `bridge`**（golden 目录 grep 两词零命中）；
- 对象 `class={}` 只由 `packages/web-c/bundler-plugin/__tests__/transform.spec.ts`
  与 `packages/compiler/compiler/__tests__/semantic-matrix-runtime.spec.ts`（2 处）
  零散覆盖，不是组合用例。

结论：**先补一个 core 契约用例（consumes + bridge + emits + 对象 class 同树），
再迁 `project-board`。** 否则迁走的是这几项能力的唯一"同树"证据。
`runtime-dom/__tests__/context.spec.ts` 覆盖了 `consumes` 与 bridge 的语义，
但不在"编译产物 + 定义 + 事件 + 投影"同一条链上。

### 3.2 `examples/headless` 不是示例，而且两个入口是坏的

- **`pnpm example:headless` 是死入口，已实测。** 该目录没有 `index.html`，
  `vite.config.ts` 只声明 `build.rollupOptions.input = src/index.ts`。
  在 `examples/headless` 下起 dev server：`GET /` 返回 **404**，
  `GET /src/index.ts` 返回 200；日志同时刷 `[plugin:vite-plugin-zeus]
context method emitFile() is not supported in serve mode`。
- **`src/main.tsx` 是孤儿。** 它逐个 import 13 个组件模块（注册副作用），
  但全目录没有任何文件 import 它，也没有 HTML 引用它。它随首次提交
  （`f0efad96`）进入仓库，此后从未被消费。

它真正的身份是**库型 fixture**：`exports` 指向 `dist/`，6 个消费示例与
`check-registry-cli` 消费的也是 `dist/`。它从没被当页面跑过。

### 3.3 两个 registry 示例的演示不成立

三条同时成立才下此判断：

1. `package.json` 声明 `@zeus-ui/headless`，`src/` 里 **0 个 import**；
2. 组件是手写复刻，与 `packages/create/registry` 实际下发的代码不同
   （registry 的 `react/switch.ts` 内容是 `import { ZSwitch }`；示例里是自写
   `role="switch"` 的 `<button>`）；
3. 构建出的 CSS 是 757 B 的原始 `@tailwind` at-rule，没有 Tailwind 管线处理它。

第 3 点意味着**截图级证据也不成立**：页面加载后没有任何 utility class 生效。
一个既不复用被演示的包、又没有样式的"registry 演示"会误导读者以为这就是
`zeus-ui add` 的产物。真实产物由 `examples/use-headless-cli`（能跑、Tailwind 生效）
和 `packages/create/registry/__tests__` 覆盖。

zeus-ui 的同名副本同样如此（`examples/registry-*/src` 零 `@zeus-ui/headless` import），
所以"迁过去"只是把问题搬过去。

### 3.4 `use-headless-cli` 落后于它要演示的 CLI

与当前 `packages/create/registry/src/react/button.ts` 内嵌产物比对，两处语义差异：

- registry 产物有 `asChild?: false`，示例没有；
- registry 产物把 `disabled` 显式透传给 `ZButton`，示例没有。

它证明的是"某个历史版本的 scaffold 能跑"，不是"现在的 CLI 能跑"。后者由
`check:registry-cli` 负责（临时目录里真装、真 `zeus-ui init`、真 `zeus-ui add button`、
真 `tsc`）。保留该示例成本很低，但迁移前必须用当前输出重生成。

### 3.5 消费示例都不经过 Zeus 编译器

`headless-demo`、`use-headless-cli`、`use-headless-react`、`use-headless-vue`
的 `vite.config.ts` 都没有 `@zeus-js/vite-plugin`：它们消费 `examples/headless`
构建出的 `dist/`（WC / React wrapper / Vue wrapper），JSX 由
`@vitejs/plugin-react` 或 `@vitejs/plugin-vue` 编译。

它们是**产物消费示例**，不是编译器示例。parity 仍会顺带编译它们的 `.tsx`，
但那些是 React/Vue JSX，不是 Zeus JSX，不能当编译器回归语料读。

---

## 4. CI 门禁矩阵：谁真的被验证

| 门禁                                        | 覆盖对象                                           | 跑在哪                                                                                              | 断言强度                                                                |
| ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `examples:check:all`（`check-examples.ts`） | 全部 19 个示例包（`@zeus-ui/headless` 先单独构建） | `component-host-rc.yml`（paths 含 `examples/**`）与 `release.config.ts` precheck；**不在 `ci.yml`** | tsc + `vite build`，**零行为断言**                                      |
| `check:next-boundary`                       | `examples/next-boundary`                           | `ci.yml` 的 `browser-web-components` job                                                            | 三引擎；禁 JS 的宿主/属性断言、升级后状态、DOM identity、hydration 报错 |
| `check:devtools-panel`                      | `examples/devtools-panel`                          | 同上                                                                                                | 三引擎；devtools 快照、click-to-binding、生产包字符串泄漏               |
| `test-unit`（vitest）                       | `examples/headless/__tests__`                      | `ci.yml` 的 `test` job、`component-host-rc.yml`                                                     | 7 个 spec，JSDOM                                                        |
| `check:registry-cli`                        | 自建临时工程（**不使用** `use-headless-*`）        | `component-host-rc.yml`                                                                             | 真实安装 + CLI + tsc                                                    |

两条结论：

1. **4 个 wrapper 与 3 个 demo 的运行时行为没有任何门禁。** 只被 tsc 与
   `vite build` 检查过；"组件能渲染""事件能抛""样式生效"全未断言。
   §3.3 的 Tailwind 缺陷能长期存活正是因为这条缺口。
2. **impact 分析不会漏掉它们**：`examples/(react|vue|registry|headless|next-boundary)`
   命中 `framework-adapters`，其余 `examples/*` 落到 `consumers`，两者都在
   `BROWSER_GATE_AREAS` 内。这一层是对的；缺的是"跑起来但从不断言"的那一层。

---

## 5. parity 语料预算

`packages/compiler/compiler-wasm/__tests__/parity.test.mjs` 遍历 `examples/`、
`scripts/bench/fixtures`、`scripts/playground/fixtures` 下所有 `.tsx`，加 9 条
inline 源码，断言 `corpus.length > 60`，并按 `expectedCorpusCounts` 逐根精确比对。

实测（`ddae9d95`）：

| 来源                          | 数量   |
| ----------------------------- | ------ |
| `examples/`                   | 56     |
| `scripts/bench/fixtures`      | 9      |
| `scripts/playground/fixtures` | 2      |
| inline                        | 9      |
| **合计**                      | **76** |

- 本表要走的 7 个目录（`project-board` 1、`headless-demo` 1、`use-headless-cli` 2、
  `use-headless-react` 1、`registry-react` 7，`use-headless-vue` / `registry-vue` 为 0）
  共 **12 个 `.tsx`**：迁移后 `examples/` 44、总计 **64**，余量 **4**。
- **`playground-editor`（4 个 `.tsx`）一迁，总数正好 60，`> 60` 守卫立刻变红**
  （守卫不含等号）。
- 十个目录**不能全走**：拿掉 40 个模块后总数为 36，守卫必红。
  `devtools-panel`（1）与 `next-boundary`（4）留在 core，本身保住了余量。

任何一步移动都要在同一次提交里改 `expectedCorpusCounts.examples`；
守卫的失败信息（`contributes N, expected M`）就是为此设计的。

---

## 6. 与 `ddae9d95` 初版的差异（复核结论）

| 项                      | 初版                                                                           | 实测                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `use-headless-vue` 规模 | "11 行"                                                                        | `App.vue` **204 行**，源码 208 行 / 受控 394 行                                            |
| `registry-vue` 规模     | "32 行"                                                                        | 源码 **185 行** / 受控 290 行                                                              |
| `next-boundary` 规模    | "1896 行"                                                                      | 受控 **177 行**（1896 含未受控的 `dist/`、`.next/`）                                       |
| `headless` 规模         | "2052 行"                                                                      | 受控 **2075 行**                                                                           |
| `devtools-panel` 规模   | "239 行"                                                                       | 受控 **253 行** / 源码 103 行                                                              |
| `headless-demo` 依赖    | "依赖四个 headless 包"                                                         | 声明 4 个 Zeus 依赖，**只 import 1 个**（唯一 headless 包），另 3 个是死依赖               |
| `registry-react` 定性   | "演示 registry 在 React 里的消费"                                              | `src/` **零 `@zeus-ui/headless` import**，组件手写复刻，无 Tailwind 管线                   |
| parity 算术             | "−23，从 56 掉到 33，低于 `> 60`"                                              | 56 是 `examples/` 单根数量；语料总数是 **76**；减 23 为 53，结论（低于守卫）成立但基数写错 |
| 类别                    | `headless-demo` 复杂 Demo、`use-headless-vue` 消费示例、`registry-*` 复杂 Demo | 前两者 **wrapper**；`registry-*` 定为 **retire**                                           |

---

## 7. 迁移前提与顺序（本轮不执行）

1. **ecosystem 侧 `demos/` 尚不存在**：`docs/audit/phase1` 记录 `zeus-ecosystem`
   未创建（`git ls-remote` 返回 Repository not found）。本表 5 个"去 ecosystem demos"
   当前**无法执行**，只能作为方向。
2. **7 个 headless 系目录已是双轨**：`headless`、`headless-demo`、`registry-*`、
   `use-headless-*` 在 zeus 与 zeus-ui 各一份且已漂移（`headless` 46 个文件有 13 个不同；
   `registry-react` 14 个有 11 个不同）。对它们"迁移"实际是**去重**：先确定哪一份是正本，
   另一份删除，再谈命名空间（`@zeus-js/*` vs `@zeus-web/*`）。
3. **`project-board` 先补契约用例**（§3.1），再迁。
4. **`use-headless-cli` 先用当前 CLI 输出重生成**（§3.4），再迁。
5. **两个 `registry-*` 若 retire**，zeus 与 zeus-ui 两份都要处理；只删一边会留下
   一个更隐蔽的错误示范。
6. 任何移动都在同一提交里改 `parity.test.mjs` 的 `expectedCorpusCounts`。

---

## 8. 附带发现（不属于分类，但同属 examples 治理）

- `db862114` 的提交信息称 `examples/stencil-wrapper` "not a workspace member,
  so `pnpm-lock.yaml` is unchanged"。但 `pnpm-lock.yaml:590` 至今仍有
  `examples/stencil-wrapper:` importer 段，且 `pnpm-workspace.yaml` 的 `examples/*`
  本来就匹配它——它**曾是** workspace 成员。实测：最小工程里删掉一个被 lockfile
  记录的 workspace 目录后，`pnpm install --frozen-lockfile` 仍成功（pnpm 容忍残留），
  所以不是活跃故障，只是提交信息的判断有误。该目录在磁盘上还留着未受控的
  `dist/`、`.stencil/`、`node_modules/`。
- `pnpm examples:check`（不带 `:all`）只在 `package.json` 定义，仓库内无调用方；
  真正被 CI 与发布 precheck 用的是 `examples:check:all`。
- `examples/README.md` 把 `registry-react` / `registry-vue` 写成
  "registry 风格的最终消费形态"——按 §3.3，这句话目前不成立。
