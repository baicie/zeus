# Zeus R12 — 0.2.0 RC 版本切换演练与外部消费者验收

日期：2026-11-16
基线：Core `33719c5ea45ae7bbdd27af3837d3ec382d012509` / UI `89fc93cac5b97f29f48deb64964886476c5d7aac`
判定：**NO_GO**

本轮不发布 npm、不改生产环境、不建正式 Tag。全部版本切换发生在隔离 worktree。

---

## 0. 本轮推翻了上一版报告的三条结论

上一版 R12 报告（未提交）有三条结论经复验后不成立。这里先纠正，因为它们改变了结论的严重性和责任人。

| 原结论                                      | 复验结果                     | 证据  |
| ------------------------------------------- | ---------------------------- | ----- |
| REL-1：native 二进制缺失时打包静默成功      | **误报**。正式发布路径不可达 | 见 §6 |
| 「Vite 7 不能用 `@zeus-js/bundler-plugin`」 | **错误**。Vite 7 可用        | 见 §5 |
| DEP-1：「消费者装不上 React wrapper」       | **表述错误，但缺陷更严重**   | 见 §7 |

原报告的 REL-1 与 DEP-1 都是在隔离 worktree 里手跑 `pnpm pack` 得出的，没有走真实发布路径，也没有真正安装到消费者工程。这是方法问题：**绕开被验证的系统去验证系统**。

---

## 1. Core 32 包：版本切换、构建、打包

| 步骤                             | 结果                                       |
| -------------------------------- | ------------------------------------------ |
| 32 包版本 → `0.2.0-rc.0`         | PASS                                       |
| 根 `package.json` → `0.2.0-rc.0` | PASS（需修 `version-rehearsal`，见 §8）    |
| Cargo workspace → `0.2.0-rc.0`   | PASS（同上）                               |
| Rust 编译器构建                  | PASS — `zeus_compiler v0.2.0-rc.0`，1m49s  |
| Native 二进制                    | PASS — `aarch64-apple-darwin`，33s，1.9 MB |
| Core JS（rolldown）              | PASS — runtime 80.2 kB / 26.2 kB gzip      |
| 类型声明                         | PASS                                       |
| 打包                             | PASS — 32/32，0 workspace 泄漏             |

**工具事实**：`npm pack` 会保留 `workspace:*`（32/32 全部泄漏，消费者 `EUNSUPPORTEDPROTOCOL`）；`pnpm pack` 正确改写为具体版本。仓库的发布路径本来就用 `pnpm pack`（`release.config.ts:56` 的 `packageManager: 'pnpm'`），所以这不是发布缺陷——但这条差异没有写进任何文档，下一次有人手写打包脚本就会踩。

---

## 2. UI 46 包

| 步骤                                 | 结果         |
| ------------------------------------ | ------------ |
| 46 包版本 → `0.2.0-rc.0`             | PASS         |
| 用 Core RC tarball 作 overrides 安装 | PASS — 46.8s |
| 构建                                 | PASS         |
| dist 产物                            | PASS — 46/46 |
| 打包                                 | PASS — 46/46 |

---

## 3. Core/UI 精确配对

PASS。46 个 UI 包的 30 处 `@zeus-js/zeus` 约束（`dependencies` 与 `peerDependencies` 合计）全部精确等于 `0.2.0-rc.0`。

---

## 4. 真实消费者验证

全部从 tarball 安装，不使用 workspace 链接。

| 目标           | 结果     | 证据                                                         |
| -------------- | -------- | ------------------------------------------------------------ |
| Node 24 ESM    | PASS     | `signal → memo → effect` 得 2, 4, 6；memo = 21               |
| Node 24 CJS    | PASS     | 同上                                                         |
| jsdom 真实 DOM | PASS     | 文本从 `count: 0` 精确更新到 `count: 5`                      |
| Vite 8 + 插件  | PASS     | 72.33 kB / 24.62 kB gzip                                     |
| Vite 7 + 插件  | **PASS** | 见 §5                                                        |
| React 19       | PASS     | StrictMode mount/unmount，渲染 `<x-panel>`                   |
| Vue 3          | PASS     | `defineContainer`，渲染 `<x-vue label="hi">`，Vue 3.5.45     |
| Firefox        | PASS     | 应用加载、0 页面错误；WC 事件冒泡、shadow 隔离、重复注册被拒 |
| WebKit         | PASS     | 同上                                                         |
| Chromium       | NOT_RUN  | 本机 playwright 缓存无二进制                                 |

---

## 5. 纠正：Vite 7 可以使用 Zeus 插件

上一版报告写「Vite 7 可以用 Zeus 运行时，但不能用 `@zeus-js/bundler-plugin`，因为它的 peer 要求 Vite 8」。**实测可以。**

实测配置：

```ts
// vite.config.mts  — 必须是 .mts/.mjs，见下
import { defineConfig } from 'vite'
import { zeus } from '@zeus-js/bundler-plugin/vite'

export default defineConfig({ plugins: [zeus()] })
```

Vite 7.3.8 上的结果：

```
React.createElement 出现次数: 0
cloneNode 出现次数: 1        ← Zeus 编译链接管了 TSX
Firefox: count: 0 -> count: 2, errors=0
WebKit:  count: 0 -> count: 2, errors=0
```

三点确证：

1. **peer 只是警告，不阻断安装。** `vite` 在 `bundler-plugin` 里是 `peerDependenciesMeta.optional`，pnpm 报 `unmet peer vite@^8.2.1: found 7.3.8` 后照常装完。
2. **插件有 Vite 7 的降级分支。** `isRolldownVite()`（`vite.ts:104`）为 false 时走 `esbuild.jsx = 'preserve'`，而不是 oxc。
3. **端到端可运行。** 三个浏览器里两个实跑通过。

**必须用 `.mts` 配置文件。** `@zeus-js/bundler-plugin/vite` 子路径只有 `import` 条件、无 `require`，Vite 以 CJS 加载 `vite.config.ts` 时报 `This package is ESM only but it was tried to load by require`。

**另一个真实约束**：插件默认只编译 `src/**` 与 `components/**`（`defaults.ts:1`）。放在项目根的 `.tsx` 不会被编译，会静默落到 `React.createElement` 而 bundle 里没有 React import——构建成功、运行崩溃。

---

## 6. 纠正：REL-1 是误报

上一版报告称：「native 二进制缺失时 `pnpm pack` 静默成功，产出一个不含二进制的 tarball」。

**`pnpm pack` 本身的静默行为属实**，我已复现：在一个只有 manifest 与源码、没有 `.node` 的目录里 `pnpm pack` 退出码 0，tarball 里没有 `.node`。

**但这条路径在正式发布中不可达**，因为 `release.yml` 的顺序是：

1. 第 66 行 `pnpm native:restore:artifacts` — 缺任何 artifact 直接 throw
2. 第 208 行 `pnpm release:precheck`，其命令表（`release.config.ts:105`）含 `check:release-artifacts --require-binaries`

实测把 `zeus-compiler-native.darwin-arm64.node` 删掉后跑该命令：

```
@zeus-js/compiler-native-darwin-arm64: required files are not present in the npm tarball: zeus-compiler-native.darwin-arm64.node
@zeus-js/compiler-native-darwin-arm64: native tarball contains no .node binary
ELIFECYCLE Command failed with exit code 1.
```

门禁有效。原报告的结论来自在隔离 worktree 里手跑 `pnpm pack`，没有经过 precheck。

**真正值得记的是**：`findMissingRequiredPaths` 默认跳过 `.node`（`release-artifact-utils.ts:9`），只有 `--require-binaries` 才检查。两条命令在 precheck 里都在，但任何绕过 precheck 的打包脚本都会失去这层保护。

---

## 7. DEP-1 修正：不是「装不上」，是「每个消费者被迫下载 24 MB TypeScript」

上一版报告写：「在 Vite 7 项目里装 React wrapper 会失败」。**装不会失败**——我实测 Vite 7.3.8 + wrapper 安装成功。

但缺陷是真的，而且比原描述严重。真实形态：

### 7.1 已发布包把构建链塞进运行时依赖

`@zeus-js/output-react-wrapper` 的 `dependencies`：

```json
{
  "@zeus-js/bundler-plugin": "…",
  "@zeus-js/component-analyzer": "…",
  "@zeus-js/component-dts": "…"
}
```

而 `bundler-plugin` 又依赖 `typescript@^6.0.3`、`@zeus-js/compiler-native`、`fast-glob`、`@jridgewell/*`。

### 7.2 影响面不是「React 用户」，是全部 `@zeus-web/*` 消费者

UI 仓 29 个包把 wrapper 与 vue-wrapper 列进 `dependencies`。这不是疏忽——`scripts/checks/package-rules.ts:163` 是一条**强制规则**，缺了直接报错：

```ts
for (const dependency of generatedWrapperRuntimeDependencies) {
  if (!pkg.dependencies || !pkg.dependencies[dependency]) {
    errors.push(`${pkg.name}: ${label} must depend on ${dependency}`)
  }
}
```

理由成立：`dist/react/button.js` 确实静态 `import '@zeus-js/output-react-wrapper/runtime'`，而 `./react` 是公开导出的子路径。改成 peer 会让 React 用户静默缺依赖。

### 7.3 实测代价

从 registry 装**一个** `@zeus-web/button@0.1.0-beta.34`：

```
31 MB, 44 packages
其中 typescript@6.0.3 占 24 MB
```

`pnpm why typescript`：

```
typescript@6.0.3
└─┬ @zeus-js/bundler-plugin@0.1.1-beta.20
  ├─┬ @zeus-js/output-react-wrapper@0.1.1-beta.20
  │ └─┬ @zeus-web/button@0.1.0-beta.34
```

一个只想用按钮的 Vue 或纯 Web Components 项目，被迫下载完整 TypeScript 编译器。

### 7.4 缺陷的精确位置

`/runtime` 入口本身**零 import**、完全自包含：

```js
// dist/runtime/index.js — 无任何 import 语句
function createComponent(options) { … }
```

但 `@zeus-web/*` 的 `dependencies` 指向包根，于是整条构建链进入消费者的 `node_modules`。

**正确修法是拆包边界**（把 runtime 拆成 `@zeus-js/output-react-wrapper-runtime`，或让 UI 包依赖一个零依赖的 runtime-only 包），**不是改 peer**。

### 7.5 拆包方案已用原型验证

用现有 `dist/runtime/` 造了一个零依赖包，直接量效果：

| 配置                                | 体积  | 包数 | TypeScript |
| ----------------------------------- | ----- | ---- | ---------- |
| 现状：`@zeus-web/button`            | 31 MB | 44   | **24 MB**  |
| 拆包后：runtime-only + React + Vite | 27 MB | 20   | **0**      |
| 纯 React + Vite 基线                | 27 MB | 19   | 0          |

runtime 包可正常 `createComponent()`。27 MB 是 React + Vite 本身的成本，Zeus 不再额外叠加。

本轮**未修**：这是 UI 仓的 manifest 规则 + Core 的包拆分之组合改动，影响 46 个发布包和一条强制门禁，需独立设计与验证。记为 P0。

---

## 8. `version-rehearsal.ts` 漏改根与 Cargo，且修法本身带一个写坏文件的缺陷

### 8.1 漏改（已修，PR #303）

既有脚本只改包版本与模板 pin，**不改根 `package.json` 与 `Cargo.toml`**。跑完后根仍是 `0.1.1-beta.20`，Cargo 仍是 `0.1.1-beta.0`，而脚本报告成功——因为它检查的每个版本都匹配。

已修：新增根 manifest 与 Cargo workspace 两处编辑。在真实仓库副本上实测 49 处编辑 / 40 个文件，根、Cargo、32 包、模板 pin 全部到 `0.2.0-rc.0`；二次运行 0 编辑（幂等）。

### 8.2 第一版修法会静默改错文件（PR #303 合并前发现并修）

第一版用 `/\[workspace\.package\][\s\S]*?\nversion = "([^"]+)"/` 扫描 Cargo。`[\s\S]*?` **不会在下一个表头停下**。

构造：删掉 `[workspace.package]` 的 version 行，在文件下方加

```toml
[package]
name = "later"
version = "9.9.9"
```

实测输出：

```
rewrote 40 file(s) to 0.2.0-rc.0: 1 edit(s)
  Cargo.toml (1)
→ 第 62 行 version = "0.2.0-rc.0"     ← [package] 段被改
→ [workspace.package] 完全没动
```

**记了 1 处编辑、报告成功、文件被写坏。** 这是本轮最危险的一处：它不是漏改，是改错。

修法两条：

1. 扫描边界收到下一个 `[`：`/\[workspace\.package\][^\[]*?\nversion = "([^"]+)(")/`
2. 找不到 version 行时**抛错**而不是跳过。跳过正是这个函数存在的理由要消灭的行为——它会改完 40 个文件、留下 Cargo、然后报告成功。

新增 3 个测试，全部在上一版实现下失败、修复后通过：报错、不改后续段、失败时一个文件都不写（`collectVersionRehearsal` 在写盘前抛出，所以是原子的）。

`scripts/release/` 604 项通过。

顺带确认：Cargo workspace 版本（`0.1.1-beta.0`）与 npm 版本（`0.1.1-beta.20`）**本来就不同步**，是既有漂移，不是本轮引入。

---

## 9. Terminal 与 OpsWeave 试点

两个试点都在 `/tmp` 隔离目录完成，**未把源码复制进 Zeus 仓库**。

### Terminal（React 19 + Vite 8 + Core RC tarball）

主题网格组件：

```
rendered buttons: 3
initial checked: true,false,false
after click: false,false,true
onSelect calls: ["solarized"]
after destroy, children: 0
```

组件层面 PASS。**「不影响 PTY」无法验证**——PoC 没有触碰 PTY/SSH/SFTP，无法证明它不干扰。真实 Tauri GUI 未运行。

### OpsWeave（Vite 7 无插件路径 + UMD）

```
UMD global: _instances, register
multi-instance: dev.opsweave.zeus / dev.opsweave.zeus.second
state after click: ready
body children after deactivate: 1
eval: false | new Function: false | style injection: false
```

`register(host)` 契约、多实例、load 生命周期、deactivate 清理、0 eval、0 全局样式注入均验证。

**未验证**：真实签名校验、upgrade/rollback、route namespace、capability 授权、React Host singleton 在真实宿主体内。

---

## 10. Release Environment

```
$ gh api repos/baicie/zeus/environments/Release
{"protection_rules":[],"can_admins_bypass":true,"deployment_branch_policy":null}
```

四项保护全缺。`GITHUB_TOKEN` 无 Administration 权限，普通 CI 读不到该端点，因此 `check:rc-readiness` 的 `release-environment` 检查在 CI 中必然 `not_run`——这是正确行为，不是缺陷。

---

## 11. 未运行项

| 项                | 原因                             |
| ----------------- | -------------------------------- |
| Node 22           | 本机只有 Node 24                 |
| React 18          | 未安装                           |
| Chromium          | playwright 缓存无二进制          |
| 其余 6 个原生平台 | 无 runner                        |
| Tauri GUI         | 未运行                           |
| 真实签名校验      | 需签名环境                       |
| PTY 隔离          | PoC 未触碰 PTY                   |
| 性能测量          | 只记录单次构建体积，未做多轮测量 |

**不用 CI 的 beta 结果冒充 RC 的七平台证据。CI 七平台矩阵是 PASS，但那是 `0.1.1-beta.20`。**

---

## 12. 判定

**NO_GO。**

| ID     | 严重性 | 状态                     | 说明                                                           |
| ------ | ------ | ------------------------ | -------------------------------------------------------------- |
| ENV-1  | P0     | BLOCKED_BY_AUTHORIZATION | Release environment 四项保护全缺                               |
| DEP-1  | **P0** | OPEN                     | 29 个 `@zeus-web/*` 消费者被迫安装 24 MB TypeScript（§7）      |
| VER-1  | P0     | BLOCKED_BY_AUTHORIZATION | Core/UI 仍在 beta，RC 只在隔离 worktree 验证                   |
| VER-2  | P1     | OPEN                     | UI `0.1.0-beta.35` 有版本无 tag                                |
| EVID-1 | P1     | NOT_RUN                  | cross-platform / stage-2 / approval / rollback 证据缺失        |
| CONS-1 | P2     | NOT_RUN                  | Chromium、Node 22、React 18 未测                               |
| REL-2  | P2     | 已修                     | Cargo 与 npm 版本漂移（PR #303）                               |
| VER-3  | P1     | 已修                     | rehearsal 的 Cargo 正则会写错段（PR #303 合并前发现，见 §8.2） |

已撤销的 blocker：**REL-1**（误报，见 §6）。

### 维护者必须做

1. Release 环境：required reviewers + prevent self-review + 取消 admin bypass + `refs/tags/v*` branch policy
2. 决定 UI `0.1.0-beta.35`：补 tag 或直接切 RC
3. 授权切 `0.2.0-rc.0`

### 工程侧仍需完成

4. **DEP-1 拆包边界**（P0，本轮最大未修项）
5. cross-platform / approval / rollback 证据（依赖 ENV-1）

---

## 13. 0.2.1 能否启动外部消费者迁移

**可以启动技术验证，不能承诺支持。**

支持的理由：Core/UI 配对精确、78 个 tarball 可安装、Vite 7 与 Vite 8 双路径可用、React 19 / Vue 3 wrapper 可运行、三引擎中两个实跑通过。

不能承诺的理由：

- 没有任何真实项目集成过
- **DEP-1 未修**：装一个 `@zeus-web/*` 就付 24 MB TypeScript 代价
- Terminal 的 PTY 隔离未验证

建议 0.2.1 scope：DEP-1 拆包 + 一个外部项目真实集成 + Vite 7 路径文档化。

---

## 附录：本轮方法上的错误

上一版报告的三条错误结论有同一个来源：在隔离环境里跑工具，然后推断生产行为。

- REL-1 在临时目录跑 `pnpm pack`，没检查 precheck 是否已覆盖
- Vite 7 只测了 runtime-only 路径，没试插件
- DEP-1 只看了 manifest 字符串，没真装

真实消费者验证之所以有价值，正是因为它绕不过去。任何「我推断它装不上」都该换成「我装了，结果是这样」。
