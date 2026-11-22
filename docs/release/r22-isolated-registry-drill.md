# R22 TASK 45–47：隔离 registry 演练

**完全隔离。未接触 `registry.npmjs.org`。**

测量时间：2026-11-22
registry：本机 Verdaccio 6，`127.0.0.1:4873`，存储目录在临时目录内
命令：`pnpm drill:isolated-registry`
证据：`temp/release/isolated-registry-drill.json`、`isolated-registry-run.json`

---

## 1. 状态变化：NOT_RUN → VERIFIED

前两轮 TASK 45 一直记为 `NOT_RUN`，原因写的是「隔离 registry 未搭建」。

实际情况是：**演练脚本早就在仓库里**（`scripts/release/isolated-registry-drill.ts`，
schema `zeus.isolated-registry-drill/v1`），完整实现了发布、读回 dist-tags、
重复发布、断网模拟。它缺的不是能力，是**一个能一键跑起来的入口**——脚本要求
调用者自己先准备好一个 Verdaccio，而这件事没有任何地方写下来。

本轮补的是 `scripts/release/run-isolated-registry-drill.ts`
（`pnpm drill:isolated-registry`）：它启动 Verdaccio、注册用户、播种稳定版基线、
调用既有演练、关掉 registry、写报告。

---

## 2. 演练结果

三个一次性包（`@zeus-js/drill-*`，不是真实发布组）：

| 包             | 发布前状态         | 动作                        | `latest` 结果      |
| -------------- | ------------------ | --------------------------- | ------------------ |
| `drill-stable` | 已有稳定版 `0.1.0` | 发 `0.2.0-rc.9`，`--tag rc` | **`0.1.0`** ✓      |
| `drill-first`  | 从未发布           | 发 `0.2.0-rc.9`，`--tag rc` | **`0.2.0-rc.9`** ✗ |
| `drill-dup`    | 从未发布           | 发 `0.2.0-rc.9`，`--tag rc` | **`0.2.0-rc.9`** ✗ |

```
dist-tags after publish:
  drill-stable  { latest: 0.1.0,      rc: 0.2.0-rc.9 }
  drill-first   { latest: 0.2.0-rc.9, rc: 0.2.0-rc.9 }
  drill-dup     { latest: 0.2.0-rc.9, rc: 0.2.0-rc.9 }
```

### 2.1 这条证据补上了 TASK 50 缺的那一环

rc.3 的审计（`r22-release-group-audit.md`）发现 `eslint-plugin` 与
`playground-engine` 的 `latest` 指向 `0.2.0-rc.3`，并推断原因是「首次发布」。
**隔离演练把这个推断变成了受控实验**：同一批 tarball、同一个 `--tag rc`，
唯一差别是发布前有没有稳定版。

- 有稳定版 → `latest` 不动；
- 首次发布 → `latest` 被 RC 拿走，`--tag rc` 无效。

所以 TASK 50「`latest` 不得指向预发布版」在**首次发布**这一种情况下，
靠发布命令本身无法满足，必须在发布后修复。

### 2.2 可重复性

同一命令跑两次，`dist-tags` 结果完全一致（`drill-stable` 的 `latest` 停在
`0.1.0`，另外两个被 RC 占据）。每次运行都在新的临时目录里起一个全新的
Verdaccio，存储不复用——所以这个结果不依赖上一次运行的残留状态。

### 2.3 重复发布返回 `EPUBLISHCONFLICT`

三个包都返回：

```
EPUBLISHCONFLICT
```

这是 `skipExisting` 恢复策略的依据：重跑 rc.3 时，已发布的 7 个包会以这个错误
被跳过，而不是被覆盖或中断整条链路。演练确认了错误码，而不是假设它。

---

## 3. 这个演练证明了什么、没证明什么

| 结论                                    | 状态                                                              |
| --------------------------------------- | ----------------------------------------------------------------- |
| 首发 RC 会夺走 `latest`，`--tag` 挡不住 | **VERIFIED**（受控实验）                                          |
| 已有稳定版时 RC 不会夺走 `latest`       | **VERIFIED**                                                      |
| 重复发布返回 `EPUBLISHCONFLICT`         | **VERIFIED**                                                      |
| `skipExisting` 能跳过这 7 个包并继续    | **NOT_TESTED**（`skipExisting` 是发布工具的能力，演练没有驱动它） |
| 真实 32 包能全部发布                    | **NOT_TESTED**（需要真实 publish，禁止项）                        |
| 网络中断下的行为                        | 演练脚本有该分支，本轮未单独取证据                                |

第 4 行要说清楚：演练证明的是**错误码**，不是恢复流程本身。恢复流程仍属
`release.yml` 的职责，需要在有发布授权时验证。

---

## 3.5 恢复演练（TASK 46–49）

`pnpm drill:recovery` 在另一个隔离 registry 上演练「发到一半失败，再重跑」。

### 场景

5 个包，第一次只发前 2 个就停（模拟 rc.3 发到第 8 个停），然后**整组重跑**。

`recover-c` 预先有一个稳定版 `0.1.0`，用来验证稳定 `latest` 会不会被重跑破坏。

### 结果

```
first attempt  published  recover-a
first attempt  published  recover-b
rerun          skipped    recover-a     ← skipExisting 生效
rerun          skipped    recover-b
rerun          published  recover-c
rerun          published  recover-d
rerun          published  recover-e
```

| 断言                                    | 结果                 |
| --------------------------------------- | -------------------- |
| 重跑恰好跳过第一次已发的 2 个           | **VERIFIED**         |
| 重跑补齐了整组 5 个                     | **VERIFIED**         |
| `recover-c` 的稳定 `latest: 0.1.0` 存活 | **VERIFIED**         |
| 首发包被 RC 夺走 `latest`               | **VERIFIED**（4 个） |

### 3.5.1 `skipExisting` 的真实机制

读 `@baicie/release` 的源码（`dist/index.js`，`publishOnePackage`）：

```js
const skipExisting = options.skipExisting ?? publishConfig.skipExisting ?? true
if (skipExisting && (await npmVersionExists(config, pkg, options))) {
  console.log(colors.yellow(`skip existing ${pkg.name}@${pkg.version}`))
  return
}
```

**它靠查询 registry 判断版本是否存在，不是靠捕获 `EPUBLISHCONFLICT`。**
这个区别重要：如果是靠捕获冲突，重跑时每个已发包仍要付一次上传；实际是跳过。

这也意味着 §2.3 记录的 `EPUBLISHCONFLICT` 在正常重跑里**不会出现**——它只在
绕过 `skipExisting` 时才会遇到。两处证据并不矛盾，是两个不同路径。

### 3.5.2 对 rc.3 恢复的直接含义

重跑 rc.3 时：

- 已发的 7 个包会被 `npmVersionExists` 跳过（不需要人工 exclude）；
- 从第 8 个继续；
- **`eslint-plugin` 与 `playground-engine` 的 `latest` 污染不会被重跑修复**——
  它们的首个版本已经发过了，重跑跳过后仍然指着 rc.3。

最后一条是 rc.3 特有的：重跑解决"没发完"，不解决"发错了标签"。

---

## 4. 为什么这件事值得单独做

如果不做，恢复计划里有两个假设是**没有被验证过的**：

1. 「首发 RC 会污染 `latest`」——现在有了受控证据，且知道唯一触发条件是首次发布；
2. 「重跑会被 `EPUBLISHCONFLICT` 挡住」——现在确认了错误码。

两个假设都影响恢复时要不要额外准备 `repair:latest-tags`。答案是**要**，
且只需要针对首次发布的包。

---

## 5. 未做

| 项                             | 原因                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| 驱动 `skipExisting` 走完整恢复 | 需要发布工具的该路径，且要真实 tarball 组                            |
| 断网分支的独立证据             | 脚本有该分支，本轮只跑了主路径                                       |
| 把演练接进 CI                  | Verdaccio 需下载约 318 包/9s，且要在 CI 里起服务；是否值得是独立决策 |
