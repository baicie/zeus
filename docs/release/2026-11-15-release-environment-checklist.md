# Release 环境保护：维护者设置清单

日期：2026-11-15
基线：Core `6bbcf081901331aeefac09edd64a7010d27be86e`

本文件是 T2 的交付物。**我没有修改任何 GitHub 环境配置**——这些操作需要维护者权限，且在禁止范围内。

---

## 1. 当前实测状态

```
$ gh api repos/baicie/zeus/environments/Release
{
  "name": "Release",
  "can_admins_bypass": true,
  "protection_rules": [],
  "deployment_branch_policy": null
}
```

### 1.1 逐项对照任务要求

| 检查项                       | 现状                                       | 判定                                     |
| ---------------------------- | ------------------------------------------ | ---------------------------------------- |
| Required reviewers 是否存在  | `protection_rules: []`                     | **FAIL** — 不存在                        |
| Prevent self-review 是否开启 | 规则都不存在，字段无从谈起                 | **FAIL**                                 |
| 管理员能否绕过规则           | `can_admins_bypass: true`                  | **FAIL** — 可以                          |
| 允许部署的分支与 Tag         | `deployment_branch_policy: null`           | **FAIL** — 无限制，任何分支/标签都能部署 |
| 审批工作流是否绑定不可变 SHA | 是（见 §2）                                | **PASS**                                 |
| 审批人身份是否符合授权策略   | 只校验「admin 或 maintain」，无白名单      | **部分** — 见 §2.1                       |
| 审批有效期与撤销策略         | TTL 默认 48h，最大 72h；撤销策略**不存在** | **部分**                                 |

### 1.2 与 Canary 环境对照

Canary 至少有一个 `branch_policy`：

```json
{
  "protection_rules": [{ "type": "branch_policy" }],
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
```

Release 连这个都没有。也就是说：**发布路径的保护弱于预发路径。**

### 1.3 使用 `Release` 的五个 workflow

```
.github/workflows/devtools-release.yml
.github/workflows/release.yml
.github/workflows/rc-approval.yml
.github/workflows/repair-dist-tags.yml
.github/workflows/repair-native-latest.yml
```

`repair-dist-tags.yml` 和 `repair-native-latest.yml` 会改 npm dist-tag——它们的保护同样为零。

---

## 2. 审批工作流本身的设计（这部分是对的）

`rc-approval.yml` 做得比「点一下批准」扎实：

| 机制                  | 实现                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| 显式确认              | `if [ "${{ inputs.confirm }}" != "APPROVE" ]; then exit 1`                         |
| 绑定运行 SHA          | `test "$GITHUB_SHA" = "${{ inputs.core_commit }}"`                                 |
| 绑定检出              | `test "$(git rev-parse HEAD)" = "${{ inputs.core_commit }}"`                       |
| 绑定证据              | 下载指定 `evidence_run_id` 的 cross-platform artifact，校验其 workflow 是 `ci.yml` |
| 有效期                | `ttl_hours` 默认 48，最大 72                                                       |
| 不可篡改              | `actions/attest-build-provenance@v2` 对三个产物做 Sigstore 证明                    |
| payload/envelope 绑定 | 先上传 payload 取 `artifact-digest`，envelope 记录该 digest                        |

**问题不在这个 workflow，而在它依赖的环境不拦人。** 一个只校验「输入是 APPROVE」的 workflow，如果任何人 push 都有权 dispatch，那 `inputs.confirm` 就是一个人对自己说 APPROVE。

### 2.1 审批人身份校验的强度

`create-rc-approval.ts` 检查的是：

```js
if (!APPROVER_PERMISSIONS.includes(permission.permission)) {
  errors.push(
    `approver ${input.actor} has permission ...; admin or maintain is required`,
  )
}
```

即**任何 admin 或 maintain 都可以**。任务要求「审批人身份符合授权策略」——目前没有授权名单。

`release.yml` 倒是引用 `vars.ZEUS_RC_APPROVERS`：

```yaml
--approvers "${{ vars.ZEUS_RC_APPROVERS }}"
```

但**这个仓库变量不存在**（13 个变量里没有它）。`assemble-rc-evidence.ts` 对空值是：

```js
if (!values[key]) throw new Error(`--${key} is required`)
```

所以缺失会导致 release 明确失败——**fail-closed，不是静默放行**。这一点是正确的，但也意味着在变量配置之前，正式发布无法进行。

---

## 3. 维护者需要执行的操作

按优先级排列。全部需要仓库 admin 权限。

### P0-1 给 Release 加 required reviewers

```
Settings → Environments → Release → Environment protection rules
  ☑ Required reviewers
     添加至少 1 个团队或用户（建议 2 个，避免单人不可用时发布被卡死）
  ☑ Prevent self-review
     （必须勾选——否则触发者可以批准自己的运行）
```

对应 API：

```
PUT /repos/baicie/zeus/environments/Release
{
  "reviewers": [{"type": "User", "id": <user_id>}],
  "prevent_self_review": true,
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
```

### P0-2 取消管理员绕过

```
Settings → Environments → Release
  ☐ Allow administrators to bypass configured protection rules
```

当前是 `can_admins_bypass: true`。取消后，admin 也必须走审批。

**权衡**：这会让所有紧急修复也必须等审批。如果维护者认为这个代价不可接受，至少应当在 `rc-readiness` 里把它报成 `fail` 而不是 `pass`——我的实现目前是在 evidence 里附带说明，没有让它 fail。这是一个可讨论的设计选择。

### P0-3 限制可部署分支

当前 `deployment_branch_policy: null`，意味着任何分支都能部署到 Release 环境。

建议：只允许 `main` 与 `refs/tags/v*` 的 custom branch policy。

### P1-1 配置 `ZEUS_RC_APPROVERS`

这个变量当前不存在。在配置之前，`release.yml` 会因 `--approvers is required` 失败。

```
Settings → Secrets and variables → Actions → Variables → New repository variable
  Name:  ZEUS_RC_APPROVERS
  Value: <comma-separated logins>
```

**注意**：这是仓库变量（非 secret），值会明文可见。这是合适的——审批人名单本就应当是公开的。

### P1-2 决定审批人校验的强度

当前是「admin 或 maintain」。两个选项：

- **A（更严格）**：`create-rc-approval.ts` 增加白名单校验，与 `ZEUS_RC_APPROVERS` 交叉验证。需要改代码，我可以做。
- **B（现状）**：依赖 GitHub 权限等级。风险是任何被临时提权的人都能审批。

### P1-3 撤销策略

目前没有。审批产物在 `ttl_hours` 内一直有效。若需要撤销：

- 删除对应的 `rc-approval` artifact（`gh api -X DELETE`）
- 或缩短 TTL
- 或让 `assemble-rc-evidence.ts` 检查审批产物的 `run_attempt` 是否是最后一次

任务要求「审批有效期与撤销策略」——**有效期有，撤销策略没有**。这一项标记为缺口。

---

## 4. 验收方式

配置后，以下命令应输出 `has required reviewers: true`：

```bash
GH_TOKEN=$(gh auth token) pnpm check:rc-readiness
```

期望（PR #292 合并后）：

```
- release-environment: the Release environment requires approval from <名单> and prevents self-review
```

若 `prevent_self_review` 未勾选：

```
- release-environment: the Release environment allows the requester to approve
  their own run, so the second person can be the first
```

---

## 5. 我没有做的事

| 项                                      | 原因                         |
| --------------------------------------- | ---------------------------- |
| 修改环境配置                            | 禁止操作                     |
| 修改 `can_admins_bypass`                | 禁止操作                     |
| 创建 `ZEUS_RC_APPROVERS`                | 修改仓库变量，禁止操作       |
| 改 `create-rc-approval.ts` 的白名单逻辑 | 需要维护者先决定 P1-2 的选项 |
