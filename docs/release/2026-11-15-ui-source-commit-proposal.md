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

### 1.3 npm provenance **不能**替代

实测 `@zeus-web/button@0.1.0-beta.34` 的 attestation：

```json
{
  "predicateType": "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
  "bundle": { "mediaType": "application/vnd.dev.sigstore.bundle+json;version=0.2", … }
}
```

`publish/v0.1` 证明的是「**这个包由这个 workflow 发布**」，payload 里是 workflow 身份与
registry 元数据，**不是源码 commit**。

**结论：provenance attestation 提供了发布链的可信性，不提供源码 commit 的可信性。**
两者都需要。

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

## 3. 历史包：beta.34 无法补全

**这一点必须明确：**

- `0.1.0-beta.34` 已于 2026-10-26 发布；
- 它的 tarball 里没有 sourceCommit 字段；
- 事后无法把数据「加进」已发布的 tarball——那会改变 integrity；
- npm 的 attestation 也不含 commit。

**因此 beta.34 的源码提交只能标 `UNVERIFIED`，不允许推测。**

### 3.1 能做什么

| 做法                                        | 可行性                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| 从 UI 仓 git 历史推断 beta.34 对应的 commit | **不可行**——发布是 `pnpm publish`，没有 tag 与版本对齐的强制约束 |
| 用发布时间就近匹配 commit                   | **不可行**——邻近有多个提交，无法排除                             |
| 读 npm 的 `gitHead`（若有）                 | 需先查该版本是否有此字段                                         |

**最后一项可以查，查不到就是查不到。**

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

Core 侧的对应改动（`ui-sources.ts` 记录 `sourceCommit: UNVERIFIED`）已经在
`feat/npm-package-integrity` 分支——它如实表达了「本仓库无法证明」，等 UI 仓落地后再改为真实值。

## 6. 未验证

| 项                        | 状态                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| beta.34 是否有 `gitHead`  | **未查** —— 可用 `npm view @zeus-web/button@0.1.0-beta.34 gitHead` 确认 |
| 第二层字段是否被 npm 保留 | **未验证** —— npm 会保留未知字段，但未实测                              |
| 第三层的循环依赖解法      | 理论分析，未实现                                                        |
