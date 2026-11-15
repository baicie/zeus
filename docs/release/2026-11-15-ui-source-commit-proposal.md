# UI 仓 sourceCommit 发布流程方案（T4）

日期：2026-11-15  
基线：UI `89fc93ca`  
状态：**方案，跨仓库修改未提交**

---

## 1. 已核实的现状

### 1.1 UI 发布时确实知道 commit

`.github/workflows/publish.yml` 有 `release_sha` 输入，并做三重校验：

```yaml
- test "$GITHUB_SHA" = "$RELEASE_SHA" # 事件 SHA
- test "$(git rev-parse HEAD)" = "$RELEASE_SHA" # checkout
- test "$(git rev-parse "refs/tags/v$VERSION^{commit}")" = "$RELEASE_SHA"
- git merge-base --is-ancestor -- "$RELEASE_SHA" refs/remotes/origin/main
```

**发布那一刻，commit 是确定的、被验证过的。**

### 1.2 但 commit 没有进入包的可验证数据

`package.json` 不含 `gitHead`（npm 只在部分场景自动写），也不含自定义 source 字段。

`pnpm release:verify:published --release-sha "$RELEASE_SHA"` 会校验——但那是**发布方自己的**检查，
消费者拿不到。

### 1.3 npm provenance **能**提供源码 commit（本文档曾写反）

> **更正（2026-11-15）**：本节原来写「provenance 不提供源码 commit」，据此把 beta.34
> 判为 `UNVERIFIED`。**那个结论是错的**，原因是只看了两个 attestation 里的第一个。

实测 `@zeus-web/button@0.1.0-beta.34` 返回**两个** attestation：

```json
[
  {
    "predicateType": "https://github.com/npm/attestation/tree/main/specs/publish/v0.1"
  },
  { "predicateType": "https://slsa.dev/provenance/v1" }
]
```

`publish/v0.1` 证明的是「这个包由这个 workflow 发布」，确实不含 commit。
`slsa.dev/provenance/v1` 的 payload 里有：

```json
"resolvedDependencies": [
  {
    "uri": "git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34",
    "digest": { "gitCommit": "a8826dd1f81560aaf6459d8d40a3e599f705f6e0" }
  }
]
```

`buildType` 为 `https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1`，
由 GitHub Actions 签发、Sigstore 签名，**消费者可独立验证**。

**全量核实（25 个真实 UI 包，不是抽样）**：

| 检查项           | 结果                                                          |
| ---------------- | ------------------------------------------------------------- |
| 有 attestation   | 25 / 25                                                       |
| 含 SLSA v1       | 25 / 25                                                       |
| 指向的 gitCommit | 全部 `a8826dd1f81560aaf6459d8d40a3e599f705f6e0`（1 个不同值） |

**修正后的结论**：对已发布的 beta.34，源码 commit 是**已证实的**，不是 `UNVERIFIED`。
Core 侧的读取逻辑见 `scripts/release/ui-attestation.ts`（R9 #284 落地）。

本文档后续的方案（写 `gitHead`、写自定义字段）因此从「补上唯一缺失的
commit」降级为「让不支持 SLSA 校验的工具也能读到」——**它们是体验改进，不是证据缺口**。

## 2. 方案

三层，从弱到强，可分别落地。

### 2.1 第一层：写入 `gitHead`（最小改动）

npm 接受 `package.json` 的 `gitHead` 字段并在 registry 上展示。发布前写入：

```json
{ "gitHead": "<RELEASE_SHA>" }
```

`publish.yml` 在 `pnpm build` 之后、`pnpm publish` 之前执行一个写入脚本。

**优点**：零客户端改动，`npm view @zeus-web/button gitHead` 即可查。  
**缺点**：`gitHead` 是元数据，不与 tarball 内容绑定——改了它可以重建一个不同的包。

### 2.2 第二层：写入自定义 source 字段（可验证）

在 `package.json` 里写一个命名空间字段，并由发布流程校验：

```json
{
  "zeus": {
    "sourceCommit": "<RELEASE_SHA>",
    "coreCommit": "<CORE_COMMIT>",
    "channel": "beta"
  }
}
```

发布前 `check-publish-preflight` 增加一条：字段值必须等于 `RELEASE_SHA`。

**优点**：消费者能读到，且发布流程保证它正确。  
**缺点**：仍然是「包里的一条数据」，理论上可控。

### 2.3 第三层：绑定到 tarball 摘要（最强）

在 `publish.yml` 里，`npm pack` 之后计算 tarball 的 sha512，并把
`{ sourceCommit, tarballIntegrity }` 一起写进一个**独立的、随包发布的 JSON**
（例如 `dist/provenance.json`）。

因为 `integrity` 是 registry 对 tarball 字节的承诺，消费者可以：

1. `npm view @zeus-web/button@X dist.integrity` 拿到 registry 的 integrity；
2. 下载 tarball、验证 integrity；
3. 读包内 `dist/provenance.json` 的 `sourceCommit`。

**这才把「commit → 字节 → 消费者」连成一条链。**

注意循环依赖：`provenance.json` 里的 `tarballIntegrity` 无法包含自身。可行做法是记录
**不含该文件**的摘要，或只记录 `sourceCommit` 而让 registry 的 `dist.integrity` 承担字节绑定。

**推荐第二层 + 第三层的前半部分**：写 `zeus.sourceCommit`，并用 registry integrity 绑字节。

## 3. 历史包：beta.34 的 commit 已由 attestation 证明

`0.1.0-beta.34` 已于 2026-10-26 发布，tarball 里没有 `sourceCommit` 字段，
事后也无法把数据「加进」已发布的 tarball——那会改变 integrity。

**但源码 commit 并不因此未知。** 见 §1.3：25/25 个包都有 SLSA v1 attestation，
一致指向 `a8826dd1f81560aaf6459d8d40a3e599f705f6e0`。

| 问题                       | 答案                                            |
| -------------------------- | ----------------------------------------------- |
| beta.34 的源码 commit 是？ | `a8826dd1f81560aaf6459d8d40a3e599f705f6e0`      |
| 证据是什么？               | SLSA v1 attestation，GitHub 签发、Sigstore 签名 |
| 消费者能独立验证吗？       | 能，`npm audit signatures` 或读 `/attestations` |
| 需要推测或就近匹配吗？     | **不需要**                                      |

所以 beta.34 **不再标 `UNVERIFIED`**。此前标 `UNVERIFIED` 是只读了
`publish/v0.1` 这一个 attestation 得出的错误结论。

### 3.1 自定义字段能补的是什么

| 做法                                        | 评价                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| 从 UI 仓 git 历史推断 beta.34 对应的 commit | 不需要——attestation 已经给了确定值                       |
| 用发布时间就近匹配 commit                   | 不需要，而且方法本身不可靠                               |
| 读 npm 的 `gitHead`                         | beta.34 无此字段（`npm view` 无输出）；SLSA 已覆盖该需求 |

## 4. 跨仓库改动清单

| 文件                                                | 改动                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| `scripts/release.config.ts`                         | `afterVersion` 或在 publish 前写入 `zeus.sourceCommit` |
| `.github/workflows/publish.yml`                     | 发布前断言字段等于 `RELEASE_SHA`                       |
| `scripts/checks/release/check-publish-preflight.ts` | 新增一条校验                                           |
| 文档                                                | 说明消费者如何核验                                     |

**这些都需要在 `baicie/zeus-ui` 单独开 Draft PR，本轮不提交。**

## 5. 本轮做了什么

**没有修改 UI 仓库。** 只做了调查与方案。

Core 侧已经有了读取 attestation 的能力：`scripts/release/ui-attestation.ts`
（R9 #284，已合入 main）从 `slsa.dev/provenance/v1` 的 DSSE payload 里提取
`resolvedDependencies[].digest.gitCommit`，`ui-sources.ts` 据此把
`sourceCommit` 从 `UNVERIFIED` 改写为真实值，并标记
`sourceCommitProvenance: 'attestation'`。

也就是说：**本仓库现在能证明 UI 包的源码 commit，不需要 UI 仓配合。**

## 6. 未验证

| 项                        | 状态                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| beta.34 是否有 `gitHead`  | **已查，无此字段**（`npm view` 无输出）；不影响结论，SLSA 已覆盖 |
| 第二层字段是否被 npm 保留 | **未验证** —— npm 会保留未知字段，但未实测                       |
| 第三层的循环依赖解法      | 理论分析，未实现                                                 |
| 未来版本的 attestation    | **未验证** —— 只在 beta.34 上实测过；新版本发布后需重查          |
