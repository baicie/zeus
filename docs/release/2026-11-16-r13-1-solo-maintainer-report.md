# R13.1 — Solo Maintainer Zero-Approval Release Architecture

日期：2026-11-16
基线：Core `1c9e9983`
策略版本：`zeus.release-policy/v2`（取代 v1 双人审批）

---

## 1. 现有架构的问题

### 1.1 过度的部分（多人审批遗产）

| 机制                                             | 真正解决的问题   | 在本项目中的实际效果         |
| ------------------------------------------------ | ---------------- | ---------------------------- |
| `RC Approval` 环境 + required reviewers          | 让第二个人签核   | 唯一维护者无法发布           |
| `Prevent self-review`                            | 防止请求者自批   | 同上，因为请求者就是唯一的人 |
| `ZEUS_RC_APPROVERS` 名单                         | 限定谁有审批权   | 名单只有一个人，且由本人填写 |
| `rc-approval` 产物的 Sigstore 签名               | 证明审批未被伪造 | 签的是自己给自己的授权       |
| `Release Governance` 环境 + Administration token | 证明环境保护生效 | 保护的对象是不该存在的审批   |
| `ZEUS_DEPLOYMENT_EVIDENCE_RUN_ID`                | 证明站点部署过   | **让库发包依赖生产站点**     |

最后一条尤其错：它把「发布一个 npm 包」与「生产环境已部署」绑定。两者的失败预算、回滚方式、验证对象都不同。

### 1.2 必须保留且已保留

受信触发源（tag）、不可变 commit、Core/UI 精确配对、CI 证据、native 七平台、SBOM、tarball 完整性、SLSA provenance、dist-tag 安全、Release Canary、失败即阻断、禁止重放旧证据、PR 无发布权限。

### 1.3 可以彻底删除的人工操作

- 手动 dispatch `RC Approval` 并填 7 个输入
- 手动 dispatch `Release Governance` 并填 core_commit
- 复制三个 run id 到 repository variables
- 手动运行 stage2 部署工作流换取证据
- 每次发布前的 Approve 点击

---

## 2. 新发布流程

```
维护者在 main 上提交 pairing 记录
    ↓  PR CI（含 check:release-pairing）
合并到 main
    ↓  main CI（ci.yml）
推送 tag v0.2.0-rc.0        ← 这一动作即发布授权
    ↓
[release.yml] 触发事件：push, refs/tags/v0.2.0-rc.0
    ↓  native-prebuild（compiler-native.yml，七平台）
    ↓  release job，environment: Release（持有 NPM_TOKEN）
    ↓
  ├─ checkout（fetch-depth: 0）
  ├─ verify:tag-source       tag == GITHUB_SHA 且可从 main 到达
  ├─ 读 release-pairing/v0.2.0-rc.0.json  → UI commit
  ├─ checkout UI，check:ui-pairing        → 配对证据
  ├─ authorize-release.ts                 → 自动授权
  │     ├─ 按提交查 ci.yml 与 compiler-native.yml 的 run
  │     ├─ 查 registry 是否已有该版本
  │     ├─ 读 SBOM
  │     └─ 写 temp/release/release-authorization.json
  ├─ release:precheck（32 包 tarball、SBOM、CJS、lint、test…）
  ├─ pnpm release --publishOnly --tag rc   ← 唯一写入 npm 的步骤
  ├─ verify:published                      → registry 真实产物
  ├─ check:create-zeus-packed
  └─ verify:dist-tags --require-provenance → dist-tag 与 SLSA
    ↓
[compiler-registry-smoke] 从 registry 装并执行编译器的两个 Node 版本
    ↓
[github-release] 创建 Release
```

| 环节          | 触发               | Workflow               | Environment | Token                          | Gate                   |
| ------------- | ------------------ | ---------------------- | ----------- | ------------------------------ | ---------------------- |
| 候选验证      | PR / main push     | `ci.yml`               | 无          | `GITHUB_TOKEN`                 | 全部 CI                |
| native 矩阵   | `release.yml` 调用 | `compiler-native.yml`  | 无          | 无                             | 七平台构建             |
| 授权          | tag push           | `release.yml`          | `Release`   | `GITHUB_TOKEN`（actions:read） | `authorize-release.ts` |
| 发布          | 同上               | `release.yml`          | `Release`   | `NPM_TOKEN`                    | precheck + 授权        |
| 发布后验证    | 同上               | `release.yml`          | `Release`   | `NPM_TOKEN`                    | registry 与 dist-tag   |
| 修复 dist-tag | 手动 dispatch      | `repair-dist-tags.yml` | `Release`   | `NPM_TOKEN`                    | dry-run 默认           |

---

## 3. Environment 数量：2

| 名称      | 用途          | Branch/Tag policy                              | Required reviewers | Secrets                               | 允许 main | 阻碍单人发布？ |
| --------- | ------------- | ---------------------------------------------- | ------------------ | ------------------------------------- | --------- | -------------- |
| `Release` | 发布与修复    | `v*`, `create-zeus@*`, `vite-plugin@*`, `main` | **无**             | `NPM_TOKEN`                           | 是        | 否             |
| `Canary`  | 预发布 canary | `main`                                         | **无**             | `NPM_TOKEN`, `ZEUS_UI_DISPATCH_TOKEN` | 是        | 否             |

`RC Approval` 与 `Release Governance` 已删除；`Release Maintenance` 与 `Devtools Release` 并入 `Release`。

**为什么一个环境不比五个更弱**：五个环境提供的是「job 之间不能互相借用凭据」。但 R13 的审查已经发现，`Release` 的保护被验证一次、被另一个 job 假定——那正是环境边界失效的样子。真正约束「谁能发布什么」的是 workflow 自己的 `permissions:` 与 `if:`，那是代码，可审阅、可测试。

若将来有第二位维护者，契约模块保留了显式映射，拆分可以回来。

---

## 4. 维护者配置清单（一次性）

1. **创建 `Release` 环境**
   - Settings → Environments → New environment → `Release`
   - Deployment branches and tags → 添加四条：`v*`、`create-zeus@*`、`vite-plugin@*`、`main`
   - **不要**勾选 Required reviewers
2. **添加 secret**：`Release` 环境 → `NPM_TOKEN`（npm Automation token）
3. **创建 tag ruleset**（这是唯一让 tag 不可变的机制）
   - Settings → Rules → Rulesets → New tag ruleset
   - Target: `v*`, `create-zeus@*`, `vite-plugin@*`
   - 勾选 **Restrict deletions** 与 **Block force pushes**
4. **创建 `Canary` 环境**：准入 `main`，加 `NPM_TOKEN` 与 `ZEUS_UI_DISPATCH_TOKEN`
5. **首个 RC 前**：提交 `release-pairing/v0.2.0-rc.0.json`（格式见该目录 README）
6. **清理**（可选）：删除 repository variables `ZEUS_RC_APPROVAL_RUN_ID`、`ZEUS_RC_APPROVERS`、`ZEUS_DEPLOYMENT_EVIDENCE_RUN_ID`；删除 `ZEUS_GOVERNANCE_TOKEN` secret

完成第 1–3 项后，每次发布只需推 tag。

---

## 5. 自动发布验收

| 项                | 结果                                                                           |
| ----------------- | ------------------------------------------------------------------------------ |
| 单维护者可以发布  | **验证** — 授权输入不含任何人名或 run id（`solo-maintainer-deadlock.spec.ts`） |
| 无人工审批        | **验证** — 策略里没有任何关于 approver/reviewer/sign 的规则                    |
| 合法 tag 自动通过 | **验证** — 模拟测试从 tag 走到发布计划                                         |
| 完整技术门禁      | **验证** — 12 条规则，37 项测试                                                |
| 发布前安全阻断    | **验证** — 拒绝时不产生发布计划（6 个负向场景）                                |
| 自动生成审计证据  | **验证** — `release-authorization.json`，拒绝时也写                            |
| 不污染 dist-tag   | **验证** — `distTagForVersion` 拒绝未映射的 channel；首次发布 + 预发布被拒     |
| 不重放旧证据      | **验证** — 每个 run 以 `headSha` 为键                                          |
| PR 无发布权限     | **验证** — `pull_request` 事件在证据查找中被排除                               |

---

## 6. PR 与 CI

| 仓库 | PR                                              | 分支                         | 说明            |
| ---- | ----------------------------------------------- | ---------------------------- | --------------- |
| Core | [#306](https://github.com/baicie/zeus/pull/306) | `feat/r13-1-solo-maintainer` | 全部改动，Draft |

UI 仓无需配套改动（配对记录在 Core）。

### 已知未关闭

- `admin-demo-provenance` 在并行满载时超时（既有，单跑通过）
- 对抗审查结果见下节

---

## 7. 0.2.0 发布准备

### 具备的工程条件

- 授权逻辑完整并有测试
- 五环境收敛为两环境
- 无人工审批依赖
- pairing 记录机制就位
- 发布模拟通过

### 仍需一次性配置

- `Release` 环境 + `NPM_TOKEN`
- tag ruleset（**关键**：没有它 tag 可以移动）
- `release-pairing/v0.2.0-rc.0.json`

### 需要真实环境验收

- 五环境删除后，四个 workflow 在新 `Release` 环境下能否部署（本地只能校验文件与契约一致）
- `authorize-release.ts` 在真实 GitHub API 上的行为（本地用 stub）

### 阻止正式发布的

- 上述配置未完成
- UI `0.1.0-beta.35` 有版本无 tag（需决定补 tag 或直接切 RC）
- DEP-1（31 MB TypeScript 仍进入消费者树）——不影响发布，但影响 0.2.1 产品化

### 最早可进入的下一阶段

配置完成 → 跑一次 `0.2.0-rc.0` 真实发布 → R14 做 DEP-1 拆包与 Terminal/OpsWeave 真实集成。
