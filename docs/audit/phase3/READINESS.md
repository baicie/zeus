# Phase 3 Readiness 预检报告

- 日期：2026-11-23
- 基线：zeus `4a5db055`、zeus-ui `629bd69e`
- 性质：**原始检查为只读预检**；后续生态仓库的 Phase 3a/3b 已实际启动。本报告保留当时的检查结果，并用后续状态注记纠正过时结论。

证据等级：**VERIFIED** = 实际执行命令并读到结果；**INFERRED** = 从配置或日志推断；
**UNKNOWN** = 现有材料无法确认。

---

## 结论先行

**Phase 3a/3b 可以开始，且新仓库已落地；完整 Phase 3c（Core + UI 联合消费者）仍未通过。** 以下两个问题阻止的是完整 Core/UI 验收，不是创建仓库或 Core-only smoke：

| #   | 阻塞                                        | 证据等级 | 影响                                                     |
| --- | ------------------------------------------- | -------- | -------------------------------------------------------- |
| B1  | `@zeus-web/*` 的 `0.1.0-beta.35` 全部未发布 | VERIFIED | 46/46 包在 registry 上不存在，最新是 beta.34             |
| B2  | R-V1：旧 beta 与 rc.5 在依赖树中共存        | VERIFIED | 安装树发现三份物理副本；活跃模块实例和浏览器表现仍需验证 |

B1 是 Phase 1 就已识别的门禁 G1 的第二半（P2）。B2 是这个门禁没达成时的具体后果。

---

## 1. `baicie/zeus-ecosystem` 是否存在

**预检当时不存在（历史 VERIFIED）；目前已创建（后续 VERIFIED）。**

- 当前仓库：[baicie/zeus-ecosystem](https://github.com/baicie/zeus-ecosystem)，Public、默认分支 `main`。
- Phase 3a 基础提交 `334b940c` 的静态 CI 已成功。
- Phase 3b 的合并提交 `a53f1589` 包含 Node 22/24 政策测试和已发布 Core rc.5 的独立消费者验证，四个 CI Job 全部成功。
- **这不代表 Core + UI 联合验收已完成。**

```
$ git ls-remote https://github.com/baicie/zeus-ecosystem.git HEAD
remote: Repository not found.
fatal: repository 'https://github.com/baicie/zeus-ecosystem.git/' not found
```

对照组：同一时刻 `git ls-remote https://github.com/baicie/zeus.git HEAD` 返回
`4a5db055…`，排除了网络故障。

## 2. 新仓库推荐名称与可见性

| 项       | 建议                       | 理由                                                       |
| -------- | -------------------------- | ---------------------------------------------------------- |
| 名称     | `zeus-ecosystem`           | 与 Phase 1 全部文档、迁移矩阵 CSV 一致，改名要同步 35 行   |
| 可见性   | **public（实际状态）**     | 与 zeus / zeus-ui 两个公开仓库一致，禁止提交凭据和客户数据 |
| 默认分支 | `main`                     | 与两个上游仓库一致                                         |
| 初始内容 | 空仓库 + 基础 CI，不迁代码 | Phase 3a 的定义                                            |

后续已通过 GitHub 仓库元数据确认 `zeus`、`zeus-ui` 均为 **public**；ecosystem 也实际创建为 public。D-P3-01 已关闭。

## 3–4. `@zeus-js/*` rc.5 是否全部可安装

**32/32 可用**（VERIFIED）。

```
发布组: 32 个包
可用: 32 | 缺失: 0
```

逐包对 `registry.npmjs.org` 查询 `@zeus-js/<name>@0.2.0-rc.5`，全部命中。

## 5. `@zeus-web/*` beta.35 是否全部发布

**46/46 全部未发布**（VERIFIED）。这是 B1 阻塞。

```
可发布 @zeus-web 包: 46
版本分布: [('0.1.0-beta.35', 46)]     ← 仓库内声明的版本

beta.35 已发布: 0 | 未发布: 46
```

registry 上的实际状态（`@zeus-web/button` 为例）：

```
已发布版本数: 32
最近 6 个: 0.1.0-beta.29 … 0.1.0-beta.34
dist-tags: { latest: '0.1.0-beta.0', beta: '0.1.0-beta.34' }
```

注意两点：

- 最新发布的是 **beta.34**，不是 beta.35。
- `latest` 仍停在 **`0.1.0-beta.0`**——与 zeus 的 latest 被预发布污染是同类现象，
  但方向相反（这里 latest 落后，而不是超前）。

## 6. zeus-ui beta.35 的 Release pairing 条件

**尚不满足完整发布契约（已确认存在代码阻塞，发布预演仍未做）。**

- `zeus/meta/release/pairing/` 下只有 `v0.2.0-rc.3/4/5.json`，**没有 beta.35 的记录**。
- zeus-ui 自身有 `.github/workflows/release.yml` 与 `scripts/release.config.ts`
  （`repo: 'baicie/zeus-ui'`、`mode: 'workspace-fixed'`），发布链路存在，
  但从未产出 beta.35。

**后续代码复核补充**：`zeus-ui/scripts/checks/release/check-release-pairing.ts` 的 `evaluateStatic()` 默认 `coreVersion = uiVersion` 并拒绝二者不同；而 Core `0.2.0-rc.5` 与 UI `0.1.0-beta.35` 本就是独立版本线。`buildPairingReport()` 的 CLI 调用也未明显传入已解析 Core Commit；release workflow 的 dispatch 又强制使用完整 Core SHA。这些属于**静态代码识别的阻断风险**，需要集成测试和 Release Protocol 修复，不能直接改 tag 绕过。UI 的版本线未必需要强制改成 Core 相同版本。

## 7. R-V1：同一消费者安装 rc.5 与 beta.34 的重复 `@zeus-js` 风险

**安装层面的兼容性风险已证实（VERIFIED）；运行时症状尚未完成实证。**

### 7.1 直接的 peer 冲突

```
$ npm install @zeus-js/zeus@0.2.0-rc.5 @zeus-web/button@0.1.0-beta.34
npm error code ERESOLVE
npm error Found: @zeus-js/zeus@0.2.0-rc.5
npm error Could not resolve dependency:
npm error peer @zeus-js/zeus@"0.1.1-beta.20" from @zeus-web/button@0.1.0-beta.34
```

beta.34 的 peer 硬绑 `0.1.1-beta.20`，与 rc.5 不相容。

### 7.2 绕过 peer 检查后的实际依赖树

`--legacy-peer-deps` 让安装成功，但树是这样：

```
+-- @zeus-js/runtime-dom@0.2.0-rc.5
+-- @zeus-js/zeus@0.2.0-rc.5
`-- @zeus-web/button@0.1.0-beta.34
  +-- @zeus-js/runtime-dom@0.1.1-beta.20        ← 嵌套了另一份
  +-- @zeus-js/web-c-runtime@0.1.1-beta.20
  +-- @zeus-js/zeus@0.2.0-rc.5 deduped invalid: "0.1.1-beta.20" from node_modules/@zeus-web/button
  `-- @zeus-web/zeus-compat@0.1.0-beta.34
    +-- @zeus-js/runtime-dom@0.1.1-beta.20
```

磁盘上的实际份数：

| 包                     |  份数 | 版本                   |
| ---------------------- | ----: | ---------------------- |
| `@zeus-js/runtime-dom` | **3** | rc.5、beta.20、beta.20 |
| `@zeus-js/signal`      | **3** | 同上                   |

### 7.3 物理副本数 ≠ 活跃引擎数（2026-11-23 修订）

`signal` 是响应式引擎本体。磁盘存在多个副本说明**可能**产生多个模块身份及
响应式作用域；但要声称浏览器真的加载了多个独立引擎，必须检查打包后 realpath、
模块去重、活跃实例和浏览器执行结果——**不能仅靠 `npm ls` 推断**。

**这两件事已经分开测了**（详见附录）：

| 指标               | 实测值   | 含义                     |
| ------------------ | -------- | ------------------------ |
| 物理 `signal` 副本 | 4 个     | 磁盘上有几份文件         |
| **活跃运行时引擎** | **2 个** | 真正被求值、持有依赖图的 |

验证方式：对每个副本做 `realpath`，再在 Node 与真实 Chrome 中分别加载两份引擎，
比较 `createSignal` 的引用相等性并尝试跨引擎建立 effect。结果是
`A.createSignal === B.createSignal` 为 `false`，跨引擎调用立即抛错。

副本数不等于引擎数：没有被 import 的副本不构成任何风险。

### 7.4 跨引擎的**实际**行为：立即报错，带修复指引

本报告初版称「静默失效」。**这个结论是错的**，已通过真实运行时实验推翻。

Zeus 的 signal 有引擎身份检查。跨实例调用时立即抛出：

```
Error: Cannot create an effect with a different Zeus signal engine.
       Deduplicate @zeus-js/signal for this reactive tree.
```

**验证环境**（VERIFIED）：

| 环境                           | 结果                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| Node 22.12 ESM                 | `Cannot create an effect with a different Zeus signal engine` |
| Chrome（Playwright，真实页面） | 同样的错误，`pageerror` 捕获                                  |

同引擎对照组正常工作（effect 执行 2 次，符合预期）。

`0.2.0-rc.5` 与 `0.1.1-beta.20` **两个版本都带这个检查**，所以不存在「旧版本没有保护」的窗口。

### 7.5 那真正的问题是什么

不是"静默失效"，而是：

1. **安装期就冲突**：npm 直接 `ERESOLVE` 拒绝（beta.34 的 peer 硬绑 `0.1.1-beta.20`）；
   pnpm 则只警告 `✕ unmet peer` 并继续——**两个包管理器的行为不同**。
2. **绕过 peer 检查后，运行期快速失败**：对开发者友好（有明确指引），
   但意味着混用组合**根本跑不起来**，任何依赖双版本的方案都不成立。

**结论反而更强**：不是"可能出错"，是"确定不可用"。

### 7.6 仍不把「install 成功」当验收标准

理由变了：不是因为会静默失效，而是因为
`--legacy-peer-deps` 能让一个**运行时必然崩溃**的组合"安装成功"。

### 7.4 对 Phase 3 的含义

Phase 3c 的完整验收要求已发布 Core + UI 联合消费者。预检时若要验证 UI，存在下列选择：

- 全 rc.5：`@zeus-web/*` 无法使用（peer 冲突，7.1）。
- 全 beta.34：`@zeus-js/*` 停在 `0.1.1-beta.20`，拿不到 rc.5 的任何修复
  （包括 `mergeEvents` 那个）。

**后续已完成 Core-only 第三条路径**：ecosystem 的独立 npm 消费者在 Node 22/24 上成功安装 rc.5，并验证 `signal` 更新与 disposal（GitHub Actions `45178572361`）。它仅证明 Core 自身可消费，不解除 UI 联合验收的阻塞。完整联合验收需上游发布可兼容的 UI 版本，不必先验指定其版本号是 beta.35 还是 0.2.0 RC。

## 8. 新仓库需要的 permissions / secrets / environments

以下是从 zeus 与 zeus-ui 现有 workflow 中统计出的、会被迁入 ecosystem 的部分
（VERIFIED 为 grep 结果，INFERRED 为归属判断）：

| 项                                       | 现有用法                              | 迁移后是否需要                                | 证据     |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------- | -------- |
| `contents: write`                        | 3 处（release、github-release、部署） | 是                                            | VERIFIED |
| `packages: write`                        | 3 处（GHCR 镜像推送）                 | 是                                            | VERIFIED |
| `id-token: write`                        | 7 处（npm provenance）                | **ecosystem 不需要 npm 发布权限**             | VERIFIED |
| `actions: read`                          | 2 处                                  | 是                                            | VERIFIED |
| `NPM_TOKEN`                              | 12 处                                 | **否；ecosystem 是消费者，不在此发布 npm 包** | VERIFIED |
| `TCR_USERNAME/PASSWORD`                  | 各 9 处（腾讯云镜像仓库）             | 是（Admin/Workbench 镜像）                    | VERIFIED |
| `ZEUS_WORKBENCH_DEPLOY_SSH_KEY/PASSWORD` | 各 1 处                               | 是                                            | VERIFIED |
| `ZEUS_PLAYGROUND_DEPLOY_SSH_*`           | 各 2 处                               | 否（Playground 留在 zeus）                    | INFERRED |
| `ZEUS_UI_DISPATCH_TOKEN`                 | 1 处                                  | 待定                                          | UNKNOWN  |
| `ZEUS_LIVE_PASSPHRASE`                   | 1 处                                  | 待定                                          | UNKNOWN  |

**Environments**（VERIFIED，现有 4 个）：`Release`、`Canary`、`production`、
`ai-workbench-live`。

只应在**对应应用迁移和部署获批时**于新仓库配置所需 environment；不要把生产或 npm 发布权限作为 Phase 3a/3b 默认条件。注意 zeus 的 `Release` 环境
**没有配置必需审批人**——这是已记录的决定，不应在迁移中被"顺手加上"。

## 9. 自托管 Runner 的归属与部署权限

**只有一处**（VERIFIED）：

```
zeus/.github/workflows/host-deployment-stage2.yml:111
    runs-on: [self-hosted, zeus-host]
```

其余 68 处全部是 GitHub 托管的 `ubuntu-*` / `windows-*`。

含义：

- `zeus-host` 这个 runner **注册在 zeus 仓库**下（仓库级）还是组织级，本次预检
  无法从仓库内容确认（**UNKNOWN**，需要读 GitHub 设置）。
- 如果它是仓库级 runner，迁移 `host-deployment-stage2.yml` 到 ecosystem 时
  必须在新仓库重新注册同名 runner，否则该 job 会无限排队——而不是立刻失败。
  这类失败**没有错误信息**，只有超时。
- 部署权限由 `Release` 环境承担；新仓库需重建该 environment 及其 secrets。

## 10. 是否需要保留 Demo 的完整 Git 历史

**建议保留，但只对部署相关的仓库**（INFERRED，附理由）。

依据：

| 事实                                                 | 来源     |
| ---------------------------------------------------- | -------- |
| 部署 workflow 使用 `fetch-depth: 0`（完整历史）      | VERIFIED |
| `host-deployment-stage2.yml` 用它做部署事务与证据    | VERIFIED |
| 现有脚本中**没有** `git log` / `git rev-list` 的调用 | VERIFIED |

结论：目前没有任何逻辑真正消费历史提交，但部署 job 显式要求了完整克隆。
迁移时若改成 `fetch-depth: 1` 需要先确认没有隐式依赖——这属于 Phase 5/6
的验证项，不建议在 Phase 3 就切断。

对纯代码迁移（headless 系已完成的 Phase 2），历史无关紧要。

---

## 未解决项汇总（详见 DECISIONS.md）

| ID      | 问题                          | 阻塞程度           |
| ------- | ----------------------------- | ------------------ |
| D-P3-01 | ecosystem 仓库的可见性        | **已关闭：Public** |
| D-P3-02 | beta.35 何时发布（B1）        | **高**             |
| D-P3-03 | R-V1 的根治方式（B2）         | **高**             |
| D-P3-04 | `zeus-host` runner 的注册范围 | 中                 |
| D-P3-05 | Phase 3c 的消费者应该装什么   | **高**（依赖 02）  |

---

## 附录：R-V1 运行时验证（2026-11-23，P1-1）

### 隔离消费者（仓库外）

`/tmp` 下的独立项目，不读任何 workspace 链接。安装均指定
`--registry=https://registry.npmjs.org`。

### 场景矩阵

| 场景 | 依赖                                  | 安装 | `signal` 物理副本 | 版本                 |
| ---- | ------------------------------------- | ---- | ----------------: | -------------------- |
| A    | `@zeus-js/*@0.2.0-rc.5` 单独          | ✅   |                 1 | rc.5                 |
| B    | `@zeus-web/button@0.1.0-beta.34` 单独 | ✅   |                 1 | 0.1.1-beta.20        |
| C    | Core rc.5 + UI beta.34 混用           | ⚠️   |             **4** | rc.5 + 0.1.1-beta.20 |

场景 C 的安装差异（**同一组合，两个包管理器行为不同**）：

```
npm  --legacy-peer-deps → 装上了，但运行期必然崩溃
npm  （严格）           → ERESOLVE，拒绝安装
pnpm （严格）           → 警告 "✕ unmet peer @zeus-js/zeus@0.1.1-beta.20: found 0.2.0-rc.5"，继续安装
```

### 跨引擎的运行时行为（真实执行）

```js
const A = await import('@zeus-js/signal') // rc.5
const B = await import('.../button/node_modules/@zeus-js/signal/...') // beta.20

A === B // false
A.createSignal === B.createSignal // false

A.createRoot(() => {
  B.createEffect(() => {})
})
// Error: Cannot create an effect with a different Zeus signal engine.
//        Deduplicate @zeus-js/signal for this reactive tree.
```

**两个环境都复现**：

| 环境                           | 结果                   |
| ------------------------------ | ---------------------- |
| Node 22.12（ESM）              | 抛错                   |
| Chrome（Playwright，真实页面） | 抛错，`pageerror` 捕获 |

同引擎对照组：effect 执行 2 次，符合预期。

### 最小复现

```bash
mkdir rv1 && cd rv1
cat > package.json <<'EOF'
{"name":"rv1","private":true,"dependencies":{
  "@zeus-js/zeus":"0.2.0-rc.5",
  "@zeus-js/signal":"0.2.0-rc.5",
  "@zeus-web/button":"0.1.0-beta.34"}}
EOF
npm install --registry=https://registry.npmjs.org --legacy-peer-deps
node --input-type=module -e "
const A = await import('@zeus-js/signal')
const B = await import('./node_modules/@zeus-web/button/node_modules/@zeus-js/signal/dist/signal.esm-bundler.js')
A.createRoot(() => B.createEffect(() => {}))
"
# Error: Cannot create an effect with a different Zeus signal engine.
```

### 对验收条件的对照

| 条件                   | 结果                                     |
| ---------------------- | ---------------------------------------- |
| 依赖图无非预期跨版本包 | ❌ 场景 C 有 2 个活跃引擎                |
| 无错误 peer 契约       | ❌ beta.34 硬绑 `0.1.1-beta.20`          |
| 无跨引擎运行时异常     | ❌ 抛 `different Zeus signal engine`     |
| 响应式更新正确         | ✅ 同引擎内正常（effect 2 次）           |
| 卸载后无遗留订阅       | 未测（跨引擎在建立阶段即失败，无从卸载） |
| 三种浏览器证据         | ⚠️ 仅 Chromium（Firefox/WebKit 未装）    |

**结论**：R-V1 不是"可能有风险"，是**该组合确定不可用**，并且在安装阶段
（npm）或首次创建 effect 时（pnpm + 运行时）就会暴露。这不是静默缺陷。
