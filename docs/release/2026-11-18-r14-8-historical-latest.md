# R14.8 — 历史 `latest` 策略与 RC.2 恢复

日期：2026-11-18
状态：PR-A 待验收

## 1. 问题

`0.2.0-rc.1` 的 Release Run `44263303787` 在 `Release precheck` 的
`check:latest-tags` 处失败，`Build and publish` 从未执行，32 个包一个都没有发布。

原因是 13 个包的 `latest` 指向 2026 年 8 月和 10 月的 canary：

| 组           | 包                                       | `latest`                               |
| ------------ | ---------------------------------------- | -------------------------------------- |
| native（8）  | `compiler-native` 及 7 个平台包          | `0.1.1-canary.20260812.106.1.658fe407` |
| runtime（5） | `runtime-ssr`                            | `0.1.0-canary.20260805.97.1.fa5d9cef`  |
| runtime（5） | `router`、`resource`、`query`、`testing` | `0.1.1-canary.20261020.188.1.02f2975b` |

这 13 个包都没有任何稳定版本。旧策略要求 `latest` 不得指向 prerelease，
于是每次发布都会命中 13 条 `REFUSED`。

删除这条路走不通：`repair-native-latest` 的六次运行（`39048806869`、
`39236355352`、`39363351657`、`39535665906`、`39884107912`）全部在认证通过
（`baicie2`，29 个包 read-write ACL）之后，首个 `npm dist-tag rm` 返回：

```
npm error code E403
npm error 403 403 Forbidden - DELETE https://registry.npmjs.org/-/package/@zeus-js%2fcompiler-native/dist-tags/latest
```

同一个 token 执行 `dist-tag add`（PUT）是成功的。所以这是平台对 DELETE 的限制，
不是仓库配置错误。

维护者已于 2026-10-24 决定放弃该清理（`docs/release-process.md` §5.4、
`docs/internal/architecture-roadmap-2026-10.md`）。本轮的改动是把那个决定变成
可执行、可审计、不可随意扩大的代码。

## 2. 设计

### 2.1 历史基线是提交进仓库的文件

`release-policy/historical-latest.json`，13 条精确的
`包名@latest 版本`。加载器 `scripts/release/historical-latest.ts` 校验：

- schema 与 policyVersion；
- `approvedBy` 与 `decisionReference.document` 必须存在（一条豁免必须说得出是谁批的、依据哪份决定）；
- 包名不得重复；
- 包必须在 `zeusFixedPackages` 内；
- 记录的 `latest` 必须是 prerelease。

路径是常量 `HISTORICAL_LATEST_PATH`，没有 `--baseline` 参数。release 读的是
Tag 所指向提交里的那一份，和任何其他仓库文件一样接受 PR 审查。

### 2.2 豁免只在值精确相等时成立

`judgeHistorical` 逐包比对：

| 注册表返回值              | 结果                                       |
| ------------------------- | ------------------------------------------ |
| 与记录完全相等            | `accepted`                                 |
| 另一个 canary / beta / rc | `drifted` → 拒绝                           |
| stable 或 absent          | 不再豁免（豁免已用尽，不算错误）           |
| 查询失败                  | `unresolved` → `UNKNOWN`                   |
| 等于本次发布版本          | 不算历史（豁免不能覆盖本次发布造成的偏差） |

`digestEntries` 对 `包名@版本` 序列做 SHA-256。改动任何一条豁免都会改变
digest；只改文字说明则不会。

### 2.3 Precheck 与 Post-publish 是两个阶段

`evaluateLatestPolicy` 新增 `phase`：

|                | 允许                                   | 拒绝                                                                       |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `precheck`     | `PASS`、`ACCEPTED_HISTORICAL`          | 任何未解释的 prerelease `latest`；发布**之前**就已存在的首发版本           |
| `post-publish` | 上述 + `ACCEPTED_DEVIATION` + 两者组合 | 首发包指向别的版本；未批准包的 `latest` 移到本次版本；历史包漂移；查询失败 |

precheck 里有一条特别重要的拒绝：如果某个被批准首发的包在发布**之前**就已经
`latest == 本次版本`，说明有东西在本 workflow 之外发布过，此时拒绝。
包 5.2 节的条件 10 正是这条。

### 2.4 快照把两个阶段绑在一起

Post-publish 不能只看"现在是什么样"——那样无法区分「发布正确」与「发布期间
tag 被改过但现在恰好合规」。

`temp/release/latest-precheck-snapshot.json` 由**同一个 job** 的 precheck 步骤
写出，包含全 32 包状态，并绑定：

- `version` — 本次发布版本；
- `gitSha` — Tag 指向的 commit；
- `runId` — 本次 workflow run；
- `baselineDigest` — 当时生效的基线。

任一项不符即拒绝，且 `snapshotDigest` 写入报告。快照缺失、只覆盖部分包、
来自另一次 run，都无法进入成功状态。`compareSnapshots` 另行拒绝：stable tag
移动、prerelease 换成另一个 prerelease、tag 消失、包没出现在快照里。

## 3. 日志缺陷

`check-latest-tags.ts` 里 `decision.outcome.toUpperCase` 少了调用括号，
每一条 finding 都打印 `function toUpperCase() { [native code] }`。
已修。同时把原来那行按原始错误数判 PASS/FAIL 的输出改为 `latest-tag census`
（纯统计），避免出现「统计行 FAIL、verdict ACCEPTED_HISTORICAL」的自相矛盾。

## 4. 验证

本地（官方 Registry，真实数据）：

```
latest-tag census: 32 packages (16 stable, 13 prerelease, 3 absent, 0 failed)
latest policy (precheck): ACCEPTED_HISTORICAL (13 historical, 0 first-publish, 0 refused, 0 unknown)
EXIT=0

latest policy (post-publish): ACCEPTED_HISTORICAL (13 historical, 0 first-publish, 0 refused, 0 unknown)
EXIT=0
```

绑定不匹配时：

```
BLOCKER snapshot: precheck snapshot came from run 44263303787, but this run is 99999999999
EXIT=1
```

测试：`historical-latest.spec.ts` 62 项，`check-latest-tags.spec.ts` 30 项，全部通过。

## 5. 未做的事

- 没有删除任何 npm dist-tag，没有调用 `repair:latest-tags --apply`。
- 没有更换生产 Token。
- 没有创建或移动任何 Tag，没有发布。
- 基线里 13 条的退出策略仍是「等到某个稳定版的 `latest` 正常推进」；在那之前
  它们会一直以 `ACCEPTED_HISTORICAL` 出现，而不是被静默忽略。
