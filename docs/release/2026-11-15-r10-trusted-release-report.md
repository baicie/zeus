# Zeus R10 — Trusted Release & External Consumer Readiness

日期：2026-11-15
执行基线（本轮实测，非历史记录）

| 项                     | 值                                         |
| ---------------------- | ------------------------------------------ |
| Core main              | `50c69ee89e47b90f18ab073ea37c1c6922e32433` |
| UI main                | `89fc93cac5b97f29f48deb64964886476c5d7aac` |
| Core 开放 PR（开始前） | 0                                          |
| 本轮新增 Draft PR      | #288、#289、#290                           |

---

## 1. 最新 SHA 与 CI

Core `50c69ee8` 上五个 workflow 全部 success：

| Workflow               | 结果                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| CI                     | 13/13 job success                                                                                   |
| Release Canary         | `release-preflight` + `canary-dry-run` success；`release-canary` / `dispatch-canary` 按契约 skipped |
| Compiler Native Matrix | 7/7 success                                                                                         |
| Admin Image            | build → mirror → **Deploy** success                                                                 |
| Playground Image       | build → **Deploy** success                                                                          |

生产实测（不是凭 workflow 绿）：

| 产物                                      | coreCommit | builtAt              |
| ----------------------------------------- | ---------- | -------------------- |
| Admin `admin.moonbyte.top:8443`           | `50c69ee8` | 2026-11-15T08:09:36Z |
| Playground `playground.moonbyte.top:8443` | `50c69ee8` | 2026-11-15T08:11:43Z |

npm dist-tags（实测）：`@zeus-js/zeus` beta=`0.1.1-beta.20`，latest=`0.1.0`；
`@zeus-web/button` beta=`0.1.0-beta.34`，latest=`0.1.0-beta.0`。

正式 `0.2.0` 未发布。当前公开 Beta 是 `0.1.1-beta.20`（Core）/ `0.1.0-beta.34`（registry 上的 UI）。

---

## 2. 发现的问题

### 2.1 CONFIRMED — 已复现

| #   | 位置                                                 | 缺陷                                                                                                                                                              |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `scripts/release/ui-attestation.ts`                  | 只 base64 解码 DSSE payload，**无任何签名验证**。手工伪造的 payload 与构建产出的等价，唯一检验是 `/^[0-9a-f]{40}$/`。结果直接喂 `release-strict`。                |
| A2  | `scripts/release/ui-sources.ts`、`ui-attestation.ts` | `attestationMatches` 只被测试调用；生产路径接受**任意 GitHub 仓库**的同形态 SHA。                                                                                 |
| A3  | 同上                                                 | lockfile integrity 与 SLSA subject digest 完全未比对。实测两者是同一 sha512 的 base64/hex 两种编码。                                                              |
| B1  | `scripts/release/verify-ui-provenance.ts`            | `verifyUiProvenance(null)` / `undefined` / 畸形 `uiSources` 抛 `TypeError`，而非结构化失败。                                                                      |
| B2  | `scripts/release/ui-sources.ts`                      | 用包名做 `Map` 键，重复条目静默覆盖前一条。一条错一条对的文档，通过与否取决于顺序。                                                                               |
| B3  | `verify-ui-provenance.ts`                            | 逐包串行请求、无单请求超时、无总预算、无并发上限、无退避。                                                                                                        |
| C1  | `scripts/check/rc-readiness.ts`                      | `evaluateSbom` 手工比对 `bomFormat`/`specVersion` 字符串，**从不运行官方 schema**；而 `check:sbom` 也只在测试里编译 schema。两个门禁可互相矛盾。                  |
| C2  | 同上                                                 | workspace 检查只比对包名，`// Every expected workspace package must be present at some version` —— 任意版本通过。                                                 |
| C3  | 同上                                                 | 依赖图只检查「引用存在」，不比对 lockfile 真实边。`dependencyGraphProblems` 有能力但未被调用；`sbomExpectation` 丢掉 `requiredBy`，导致所有权比对**永远被跳过**。 |
| C4  | `scripts/check/check-sbom.ts`                        | 覆盖范围只写在代码注释里，文档本身不声明。实测 lockfile 490 个包名 vs SBOM 83 个。                                                                                |
| D2  | `docs/release/0.2.0-rc-manifest.json`                | 候选记录绑定 `7bc850b7`（审计期），远早于当前 main。                                                                                                              |
| D3  | `.github/workflows/rc-approval.yml` + GitHub 环境    | 注释写「runs behind the protected Release environment (required reviewers)」，实测 `protection_rules: []`。**保护不存在。**                                       |
| D4  | npm registry                                         | `@zeus-js/i18n`、`@zeus-js/eslint-plugin`、`@zeus-js/playground-engine` 从未发布（29/32 已发布）。                                                                |
| E3  | `packages/web-c/bundler-plugin`                      | peer `"vite": "catalog:"` → 解析为 `^8.2.1`。Vite 7 硬失败 ERESOLVE。                                                                                             |

### 2.2 STATIC_RISK — 代码可见，影响未实测

| 位置                            | 风险                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `examples/react-wrapper`        | 依赖 `workspace:*`，无任何测试；消费契约只能靠 `packages/web-c/output-react-wrapper` 的单测间接证明。 |
| `packages/devtools/vite-plugin` | 同样 peer `vite: catalog:`，Vite 7 下不可用。                                                         |

### 2.3 未验证 / 未运行

| 项                                       | 状态                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| Terminal 真实集成（F）                   | **NOT_RUN** — 需修改 `baicie/terminal`，不在本轮授权范围 |
| OpsWeave 真实集成（G）                   | **NOT_RUN** — 同上，且 Vite 7 是硬阻塞                   |
| Tauri 三平台 GUI 验收（F3）              | **NOT_RUN** — 需 macOS/Windows/Linux 上的真实 Tauri 应用 |
| Windows/macOS 上的消费者安装（E1）       | **NOT_RUN** — 本轮仅 Linux(容器)/本地 macOS Node 24      |
| 浏览器矩阵中的 Firefox/WebKit 消费者实测 | **NOT_RUN** — 本轮用 Vite build 验证，非浏览器运行       |

---

## 3. 已验证与未验证的供应链信任关系

### 3.1 已闭合（PR-1）

对 `@zeus-web/*@0.1.0-beta.34` 的 24 个包，用 `sigstore@4.1.1` 完成真实验证：

```
ui provenance: verified 24/24
ui provenance (release-strict) ok
```

验证内容：

| 检查                          | 手段                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| DSSE 签名 + 证书链 + 透明日志 | `createVerifier({ tlogThreshold: 1, ctLogThreshold: 1 })`                                       |
| 签名身份                      | 钉死 `https://github.com/baicie/zeus-ui/.github/workflows/publish.yml@refs/tags/v0.1.0-beta.34` |
| 签发者                        | `token.actions.githubusercontent.com`                                                           |
| 来源仓库                      | `baicie/zeus-ui`                                                                                |
| 来源 ref                      | 由 manifest 精确版本推导的 tag                                                                  |
| Subject                       | purl 匹配包名+版本，sha512 匹配 lockfile integrity（hex/base64 归一化后比较）                   |

负向实测：错误 `--expected-ref` → 24 个 `invalid`（不是 `missing`）；不带 `--read-attestations` → 结构化失败逐个点名。

**活体测试**（`ui-attestation.spec.ts`）：拉真实 npm attestation → 真实信任根验证 → 改动 payload 一个十六进制字符 → 断言验证失败。耗时约 2 s，不 skip。

### 3.2 仍未验证

| 关系                                                            | 状态                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Contract 里说的是「发布 workflow 签的」到「这个 commit 构建的」 | 已验证（`resolvedDependencies`）                                                       |
| 该 commit 在 UI 仓确实存在且是 `v0.1.0-beta.34`                 | 已在上一轮核实（本地 `git rev-parse`），本轮未重复                                     |
| UI 仓 `0.1.0-beta.35` 与 registry `beta.34` 的关系              | **UNVERIFIED** — 本地 main 是 beta.35，registry 最高 beta.34，Admin 依赖 registry 版本 |
| `ZEUS_UI_COMMIT` = `ffde5592` 的正确性                          | **UNVERIFIED** — 与包实际来源 `a8826dd1` 不一致（ffde5592 更新 14 个提交）             |

---

## 4. 三个 Draft PR

| PR                                              | 标题                                 | 测试               | CI                      |
| ----------------------------------------------- | ------------------------------------ | ------------------ | ----------------------- |
| [#288](https://github.com/baicie/zeus/pull/288) | SLSA 签名验证取代解析即信任          | 891 pass / 15 skip | 17 pass, 4 skip, 0 fail |
| [#289](https://github.com/baicie/zeus/pull/289) | SBOM 官方 schema + 精确版本 + 依赖边 | 878 pass / 15 skip | 15 pass, 6 skip, 0 fail |
| [#290](https://github.com/baicie/zeus/pull/290) | readiness 读取 Release 环境保护      | 871 pass / 15 skip | 16 pass, 5 skip, 0 fail |

三个 PR 均：`tsc --noEmit` clean、`prettier --check .` clean。

**注意依赖顺序**：PR-4 的 `evaluateSbom` 签名与 PR-3 有交集。三个分支各自基于 `50c69ee8`，合并时可能需要一处冲突解决（`evaluateSbom` 的 `expected` 类型）。

---

## 5. CycloneDX SBOM 官方验证

`scripts/check/sbom-schema.ts` 是唯一实现，vendored `bom-1.5.schema.json` + 两个 `$ref` 目标。

三处调用：生成器输出、已提交文件、readiness 门禁。

实测：

```
$ pnpm check:sbom
SBOM is current (85 components, 25 runtime dependencies).
```

覆盖范围（写进文档，不再靠暗示）：

```
zeus:sbom:coverage                = workspace-and-direct-runtime
zeus:sbom:transitive-dependencies = not-modelled
```

**量化差距**：lockfile 解析出 **490** 个包名，SBOM 有 **83** 个。published 包的直接运行时依赖覆盖 **3/3**，传递依赖 **完全未建模**。

0.2.0 是否需要完整传递依赖清单：**本轮不实现**，理由是它会显著扩大生成器复杂度且与 RC 时间线冲突。但文档现在明确声明不完整，不声称 Full Dependency Graph。

---

## 6. RC blockers 与结论

候选 manifest（`docs/release/0.2.0-rc-manifest-candidate.json`）绑定当前 HEAD `50c69ee8`，verdict **NO_GO**，9 个 blocker 分 6 类：

| 类别             | blocker                                                               |
| ---------------- | --------------------------------------------------------------------- |
| release process  | 版本是 `0.1.1-beta.20` / `0.1.0-beta.35`，不是 `0.2.0-rc.0`           |
| release process  | 3 个包首次发布会让 prerelease 成为 latest                             |
| environment      | 三个 build-info 记录 ui `ffde5592`，冻结 ui 是 `89fc93ca`             |
| evidence missing | release-approval、online-products、product-signoff、byok-live-gateway |
| evidence stale   | cross-platform 证据 commit 不匹配                                     |
| manual approval  | **Release 环境无 required reviewers**（本轮新增检查发现）             |

### 0.2.0 能否进入正式 RC Cut

**不能。**

新增的 `release-environment` 检查给出决定性证据：审批保护不存在。在这个前提下，`rc-approval` 产物是自证，任何依赖它的 GO 判定都不成立。

---

## 7. 维护者需要做的动作

| 优先级 | 动作                                                                  | 为什么不能由我代做       |
| ------ | --------------------------------------------------------------------- | ------------------------ |
| P0     | 给 `Release` environment 加 required reviewers                        | 修改环境保护属于禁止操作 |
| P0     | 决定 UI 是否发布 `0.1.0-beta.35`（本地）                              | 发布 npm，需授权         |
| P0     | 更新 `ZEUS_UI_COMMIT`                                                 | 任务明确禁止             |
| P1     | 决定 3 个首次发布包的 dist-tag 策略                                   | 影响 latest 污染         |
| P1     | 提供 release-approval / online-products / product-signoff / byok 证据 | 需真实人工审批与线上验证 |
| P2     | 合并 #288/#289/#290（会触发生产部署）                                 | 合并需授权               |

---

## 8. Terminal 试点（F）

**未执行真实集成。**

已核实的事实（来自 `baicie/terminal` main，2026-11-15T08:40Z）：

| 项      | 值                                          |
| ------- | ------------------------------------------- |
| React   | `^19.2.5`                                   |
| Vite    | `^8.0.10`                                   |
| Tauri   | `2.11.0`                                    |
| Zustand | `^5.0.12`                                   |
| xterm   | `@baicie/xterm@0.1.7` + 8 个 addon          |
| 结构    | `packages/frontend`、`packages/team-server` |

Vite 8 意味着 `bundler-plugin` **可用**——Terminal 是比 OpsWeave 更适合的首发试点。

试点切入点建议（基于实际目录结构）：`packages/frontend/src/components/` 下的 `notification-panel` 或 `command-history`，二者是展示型组件，不触碰 PTY/session/tab 生命周期。

未执行原因：需修改外部仓库并推送，超出「允许」范围。

---

## 9. OpsWeave 试点（G）

**未执行真实集成。**

已核实的事实（来自 `baicie/ops-1` main，2026-11-15T08:39Z）：

| 项        | 值                                                               |
| --------- | ---------------------------------------------------------------- |
| React     | `^19.1.0`                                                        |
| Vite      | `^7.1.0`                                                         |
| Router    | `^7.8.0`                                                         |
| 结构      | `apps/platform-console`、`apps/ops-web`、`plugins/*`             |
| 插件契约  | UMD 远程，`export function register(host: HelloHost)`            |
| 现存插件  | `hello-ops`、`data-catalog`、`data-integration`、`zabbix-source` |
| 已用 Zeus | **否**（0 处 `@zeus` 引用）                                      |

### Vite 7 的实测结论

在隔离环境实测（Vite 7.3.8）：

| 尝试                                          | 结果                                    |
| --------------------------------------------- | --------------------------------------- |
| `npm i @zeus-js/bundler-plugin@0.1.1-beta.20` | **ERESOLVE 失败**（peer `vite ^8.2.1`） |
| `npm i @zeus-js/web-c-runtime@0.1.1-beta.20`  | 成功                                    |
| Vite 7 构建 Zeus 运行时应用                   | **成功**（17.96 kB / 6.74 kB gzip）     |
| Vite 7 构建 Zeus UMD 插件（`register(host)`） | **成功**（33.63 kB / 11.93 kB gzip）    |

UMD 产物的关键属性（可复验）：

```
eval 出现次数:        0
new Function 出现次数: 0
全局样式注入:          0
```

即：**不依赖编译插件时，Zeus 在 Vite 7 下完全可用，且满足 CSP 与 CSS 隔离要求。**

G2 的其余契约（插件签名、asset digest、加载/deactivate/upgrade/rollback、React Host singleton、route namespace、capability、多实例、事件清理）**未验证**——都需要平台侧真实运行。

---

## 10. 兼容矩阵

| 维度   | 实测                                                           | 未实测             |
| ------ | -------------------------------------------------------------- | ------------------ |
| Node   | 24.16.0（本地全部验证）                                        | 22                 |
| pnpm   | 10.33.4                                                        | —                  |
| Vite   | 7.3.8（运行时 ✅ / 插件 ❌）、8.x（仓库内）                    | —                  |
| React  | 19（`output-react-wrapper` 38 项单测）                         | 18                 |
| 浏览器 | Chromium/Firefox/WebKit 由 CI 的 `browser-web-components` 覆盖 | 消费者项目内的实测 |
| 平台   | macOS（本地）、Linux（CI）                                     | Windows            |

---

## 11. 0.2.1 还缺什么

| 能力                          | 现状                | 建议                                                                      |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------- |
| Vite 7 支持                   | 插件硬要求 Vite 8   | 放宽 peer 到 `^7 \|\| ^8` 并实测，或明确文档化「Vite 7 只能用预编译产物」 |
| 传递依赖 SBOM                 | 未建模（490 vs 83） | 决定是否纳入 0.2.1 scope                                                  |
| 外部消费者实测                | 0 个真实项目        | 用一个真实项目跑通再声明支持                                              |
| `examples/react-wrapper` 测试 | 无                  | 补 React 19 契约的浏览器级验证                                            |
| Windows/macOS 消费者          | 未测                | 至少一个平台各跑一次安装+构建                                             |

**建议的 0.2.1 Scope**：Vite 7 兼容 + 一个真实外部项目的端到端证据 + 传递依赖决策。不建议在缺少真实消费者证据前宣称「外部可用」。
