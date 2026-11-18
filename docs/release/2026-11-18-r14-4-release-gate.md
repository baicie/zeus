# R14.4 — Final RC Release Gate Hardening

生成时间：2026-11-18
范围：Core `baicie/zeus` · PR #317

## 1. 基线（执行前重新获取）

| 项                 | 值                         |
| ------------------ | -------------------------- |
| Core main          | `bb5f40c1`（合 #316 后）   |
| 根版本             | `0.2.0-rc.0`               |
| `v0.2*` tag        | 不存在                     |
| npmjs `0.2.0-rc.0` | 不存在                     |
| Tag ruleset        | Active，禁止 update/delete |

## 2. P0：已批准的首发包导致发布链断裂

### 复现

`check-latest-tags.ts` 的 `evaluateLatestTags` 把 `LATEST_PRERELEASE` 无条件判为
error，`main()` 用 `evaluation.errors.length > 0` 设 `process.exitCode = 1`。

三个首发包发布后，`latest` 必然指向 RC，于是：

```
Build and publish      ✓ 包已发布
Verify publication     ✓
Check npm latest       ✗ 退出码 1
  → compiler-registry-smoke（needs: release）跳过
  → github-release（needs: [release, smoke]）不创建
  → tag 已推送，ruleset 禁止删除
```

失败的是一次**已经成功**的发布，且不可重试。

### 修复

引入四态判定，退出码由判定决定而非原始错误数：

| verdict              | 条件                                                      | 阻断   |
| -------------------- | --------------------------------------------------------- | ------ |
| `PASS`               | 全部合规                                                  | 否     |
| `ACCEPTED_DEVIATION` | 仅 pairing 记录批准的包，且 `latest` **恰好**等于本次版本 | **否** |
| `REFUSED`            | 未批准包；或已批准包指向别的版本                          | 是     |
| `UNKNOWN`            | Registry 不可读                                           | 是     |

两个条件都必需。批准一个包不批准任意版本；版本匹配不批准未列入的包。

批准名单只从 immutable pairing 记录的 `firstPublish` 读。**没有 CLI flag 能直接
指定**——flag 会在凌晨被敲进去，记录是在 PR 里被审过的。

`ACCEPTED_DEVIATION` 不写成「合规」：报告保留原始 errors，`basis` 字段写明
`repair:latest-tags` 是后续动作，workflow 把判定作为 artifact 上传。

## 3. P1：Registry 读回的 fail-open

### 复现

`repair-latest-tags.ts`：

```ts
let observedLatest: string | undefined // undefined = 既"不存在"又"查询失败"
observedLatest = client.readLatest(name) // catch 后仍是 undefined
const repaired =
  action.kind === 'set'
    ? observedLatest === action.version
    : observedLatest === undefined // 查询失败 == 删除成功
```

覆盖它的测试**断言了这个行为**，名字却叫「reports a failed read-back as
unverified rather than successful」——注释对，断言相反。

### 修复

```ts
export type LatestRead =
  | { status: 'PRESENT'; version: string }
  | { status: 'ABSENT' }
  | { status: 'QUERY_FAILED'; error: string }
```

`changeVerified(action, read, version)`：删除只认 `ABSENT`，设置只认 `PRESENT`
且版本精确相等。

`looksAbsent()` 只识别 404 族（`E404` / `404 Not Found` / `no dist-tags`）。
超时、DNS、拒绝连接、429、5xx 一律 `QUERY_FAILED`；未分类的错误也是
`QUERY_FAILED`——猜测方向若是宽松，每个新网络错误都会变成成功的修复。

## 4. 发布包数量：32，不是 35

上一份报告的 35 是错的。

| 集合                         | 数量                      |
| ---------------------------- | ------------------------- |
| `zeusFixedPackages`          | 32                        |
| 其中首发包                   | 3（**是成员，不是追加**） |
| `vite-plugin`（独立 tag 线） | 1，不参与 Core RC         |

32 个包全部存在、均非 private、版本统一 `0.2.0-rc.0`、无重复。

新增 `scripts/release/publish-manifest.ts` 产出 `zeus.publish-manifest/v1`，
字段：name、version、path、private、fixedGroup、publishable、expectedDistTag、
firstPublish、independentVersionLine。`publish-manifest.spec.ts` 对着真实树钉死
这个数字，并拒绝：private 包、版本不符、重复、磁盘缺失、首发名不在组内、
独立包混入组内。

## 5. 隔离 Registry 全链模拟

### 关键方法：先建基线

直接往空 registry 发 32 个包，会得到 **32 个** `latest=RC`——因为空 registry 上
每个包都是首发。这与真实 npmjs 不符（那里只有 3 个首发，其余 29 个已有 latest）。

正确做法：先发 29 个包的稳定版 `0.1.0`，再发 32 个 RC。

### 实测结果

```
present          : 32 / 32
latest == RC     : 3   (@zeus-js/i18n, @zeus-js/eslint-plugin, @zeus-js/playground-engine)
latest == stable : 29
```

用这个真实状态跑策略：

```
PASS manifest: 32 publishable, 3 first publication(s)
PASS publish: skipped (--skip-publish): evaluating registry state as already published
PASS latest-policy: ACCEPTED_DEVIATION (3 accepted, 0 refused, 0 unknown)
PASS first-publish-deviation: all 3 approved first publication(s) are ACCEPTED_DEVIATION
```

### 这是本地模拟，不是生产证据

`source: 'local-simulation'`、`productionPublished: false` 写在报告里。

## 6. 对抗审查

每项都实现为测试。

| 攻击                              | 结果            |
| --------------------------------- | --------------- |
| 让白名单接受未列入的包            | `REFUSED`       |
| 查询失败伪造成 ABSENT             | `UNKNOWN`，阻断 |
| 错误版本被接受                    | `REFUSED`       |
| 未批准包污染 latest 却继续        | `REFUSED`       |
| `ACCEPTED_DEVIATION` 阻断合法后续 | 不阻断（预期）  |
| accepted + unknown 混合           | `UNKNOWN` 阻断  |
| 空批准名单 + 全稳定               | `PASS`          |

**未发现错误的 PASS 路径。**

## 7. 生产权限（只读，未修改任何配置）

| 项                       | 结果                                |
| ------------------------ | ----------------------------------- |
| `Release` environment    | 存在，`protection_rules: []`        |
| Required reviewers       | **无** → 不会 Waiting for approval  |
| Deployment branch policy | `unrestricted` → 允许 `v0.2.0-rc.0` |
| `NPM_TOKEN`              | 已配置（未读取值）                  |
| GitHub Release 权限      | `contents: write`                   |
| Provenance OIDC          | `id-token: write`                   |
| 三个首发包               | npm 上均 HTTP 404，可创建           |

## 8. DAG 核查

```
push v* tag
  → native-prebuild
  → release job
      … precheck（含 check:sbom:write）→ authorize → precheck → publish
      → Verify publication / scaffold / dist-tags
      → Check npm latest（判定决定退出码）   ← 修复点
      → Preserve latest-tag verdict（artifact）
  → compiler-registry-smoke   (needs: release)
  → github-release            (needs: [release, compiler-registry-smoke])
       permissions: contents: write
```

`ACCEPTED_DEVIATION` 时 `release` 不退非零，两个下游 job 正常执行。

## 9. 未做（NOT_RUN）

- 真实 npmjs 发布
- 真实 `v0.2.0-rc.0` tag 推送触发 `release.yml`
- 真实 Node 22 / 24 smoke（本地是 22.12）
- 真实 GitHub Release 创建（workflow 结构已核，未执行）
- npm 2FA / token scope 的写权限（只确认了 secret 存在，未做写测试）

以上均**不是 PASS**。

## 10. 残余风险

1. **`ACCEPTED_DEVIATION` 依赖 pairing 记录的正确性。** 记录若被错误地列入不该
   首发的包，检查会接受它。缓解：记录在 PR 里被审、且 tag 不可变。
2. **`fast-rc` / `test` 各失败过一次**，都因 `release-workflow.spec.ts` 断言了
   旧的单行命令。已修（`5c7cd680`），改为断言步骤所需的参数而非 YAML 形状。
3. **`pair/*` ruleset 仍未配置**（上一轮决定延后）。首次配对不受影响。

## 11. GO / NO_GO

见 PR 描述与最终汇报。CI 全绿且未发现新的阻断项时：
**允许推 `v0.2.0-rc.0`** —— 但推 tag 是不可逆操作，需维护者单独授权。
