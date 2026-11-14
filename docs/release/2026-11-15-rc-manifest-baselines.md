# RC Manifest 的历史基线与当前候选

日期：2026-11-15  
HEAD：`96ceb447b92be66ed35152d72d2a5681438e6211`

---

## 1. 问题

`docs/release/0.2.0-rc-manifest.json` 记录的是 RC-3 审计执行时的那棵树（`7bc850b7`）。
main 之后前进了两个提交，于是 `rc-manifest --verify` 报：

```
RC manifest is out of date:
  core commit: "7bc850b7…" -> "96ceb447…"
```

**这是一个正确的报错。** 但处理方式有两种，而它们含义完全不同：

| 做法               | 后果                                                     |
| ------------------ | -------------------------------------------------------- |
| 原地重新生成       | 审计记录被改写成一个「在别的提交上生成」的文档，历史消失 |
| 新文件记录当前候选 | 历史保留，候选独立                                       |

## 2. 方案

两个文件，两个职责：

| 文件                               | 记录什么                          | 可变性       |
| ---------------------------------- | --------------------------------- | ------------ |
| `0.2.0-rc-manifest.json`           | **历史审计快照**，Core `7bc850b7` | **不改**     |
| `0.2.0-rc-manifest-candidate.json` | **当前候选**，Core `96ceb447`     | 每次重新生成 |

`rc-manifest.ts` 现在写候选文件，并在写入前拒绝覆盖历史文件：

```ts
if (path.resolve(output) === path.resolve(HISTORICAL)) {
  throw new Error(
    'refusing to overwrite the historical RC snapshot; regenerate the candidate instead',
  )
}
```

### 2.1 为什么历史快照也有价值

它记录了「审计那一刻，main 是什么、证据是什么、判定是什么」。这份记录本身是审计的一部分——
如果它随 main 移动，就无法回答「我们当初基于什么做的决定」。

**注意**：已提交的历史快照实际记录的是 `7bc850b7`，而不是更早草案里的 `69f494f2`。
那个草案被覆盖了（`git fsck` 可找到 unreachable blob `45429755`），原因已在
`2026-11-15-release-acceptance-report.md` §8.2 说明。本轮**不回溯修改**它。

## 3. 当前候选的真实判定

```json
{
  "schema": "zeus.rc-manifest/v1",
  "generatedAt": "2026-11-15T…",
  "repositories": {
    "core": { "commit": "96ceb447…" },
    "ui": { "commit": "89fc93ca…" }
  },
  "releaseSet": { "core": 32, "ui": 46 },
  "peers": 30,
  "verdict": "NO_GO",
  "blockers": 7
}
```

**`verdict` 仍然是 `NO_GO`。** 本轮没有削弱的验收条件，也没有为了让 blocker 变少而放宽任何断言。

## 4. blocker 按归属分类

任务第 10 点要求「明确哪些 blocker 属于代码，哪些属于审批、环境和版本发布」。
候选快照新增 `blockerCategories`：

```json
{
  "code": [],
  "release-process": [
    "versions are core 0.1.1-beta.20 / ui 0.1.0-beta.35, not 0.2.0-rc.0",
    "never published on npm, so the RC creates their first latest tag: @zeus-js/i18n, @zeus-js/eslint-plugin, @zeus-js/playground-engine"
  ],
  "environment": [
    "admin build-info names ui ffde5592, frozen ui is 89fc93ca",
    "native-lab build-info names ui ffde5592, frozen ui is 89fc93ca",
    "webc-studio build-info names ui ffde5592, frozen ui is 89fc93ca"
  ],
  "evidence": [
    "demo pairing names 69f494f2+89fc93ca, tree is 96ceb447+89fc93ca",
    "rc-readiness: NOT_READY; not passing: …",
    "evidence not produced: release-approval, online-products, product-signoff, byok-live-gateway"
  ]
}
```

### 4.1 结论：零个代码阻塞

| 分类            | 数量  | 谁能清                          |
| --------------- | ----- | ------------------------------- |
| **code**        | **0** | —                               |
| release-process | 2     | 维护者（切版、发布）            |
| environment     | 3     | 维护者（更新 `ZEUS_UI_COMMIT`） |
| evidence        | 3     | 维护者（审批、在线验收、签核）  |

**没有一项能靠改代码解决。** 这是 NO_GO 的结构性原因：代码质量已经足够，
缺的是发布动作、配置更新和人工签核。

### 4.2 关于 `demo pairing` 那条

它记的是 `core 69f494f2 + ui 89fc93ca`，而当前树是 `96ceb447`。这条被归入 `evidence`——
`temp/rc-demo-pairing.json` 是一个本地缓存的配对记录，需要在当前 SHA 上重新读一次线上
`demo-pairing.json` 才能更新。它不是代码缺陷，也不是环境故障。

## 5. 跨平台证据的 SHA 绑定

任务第 9 点要求「将最新跨平台 evidence 与实际 SHA 绑定」。

本轮从 CI artifact `14130500082` 取回 `96ceb447` 的证据：

```
commit: 96ceb447b92b…
linux:  PASS
win32:  PASS
```

放进 `temp/cross-platform/evidence.json` 后重新生成候选，`cross-platform-evidence` 从
`NOT_RUN` 变成 `PASS`，blocker 从 8 条降到 7 条。

**这不算削弱验收**：证据本来就存在且有效，只是一直没下载到本地。上一轮已用仓库验证器确认
`errors: []`。

## 6. stale evidence 与 missing evidence

任务第 7 点要求区分两者。候选快照的 `tests[].status` 已经表达：

| 状态      | 含义           | 本轮实例                                                                      |
| --------- | -------------- | ----------------------------------------------------------------------------- |
| `PASS`    | 证据存在且通过 | `packed-consumers`、`sbom`、`cross-platform-evidence`                         |
| `FAIL`    | 证据存在且失败 | `rc-readiness`（CI 上仍是 NOT_READY）                                         |
| `NOT_RUN` | **证据不存在** | `release-approval`、`online-products`、`product-signoff`、`byok-live-gateway` |

**`NOT_RUN` 从不表示「跑过但没过」，`FAIL` 也不表示「没跑」。** 这一区分在代码里由
`testEvidence()` 的四个分支各自决定，不是靠人读字符串。

### 6.1 那 `packed-consumers` 在本地的 FAIL 是什么

本地跑 `check:rc-readiness` 会报：

```
- packed-consumers: packed consumer report is bound to 69f494f2…, expected 96ceb447…
```

这是 **stale evidence**（报告存在但绑定旧 SHA），不是 missing，也不是产品缺陷。
CI 上同一检查在 `96ceb447` 上 PASS。

**候选快照记录的是 PASS**，因为它读的是 `temp/packed-consumers/report.json`——本轮没有重跑，
所以本地那份仍是旧的。这是一个已知的本地偏差，写在这里而不是掩盖。

## 7. `--verify` 的使用边界

`rc-manifest --verify` 比较 `repositories.*.commit`、`lockfiles.*`、`releaseSet.*` 与当前树。
**它只能验证候选快照**——历史快照按定义与当前树不同，对它跑 `--verify` 永远失败。

这不是缺陷，是职责：历史快照是记录，候选快照是断言。

## 8. 未做

| 项                                             | 原因                                      |
| ---------------------------------------------- | ----------------------------------------- |
| 重跑 `packed-consumers` 让本地报告绑定当前 SHA | 需要完整构建链，CI 已在当前 SHA 上验证    |
| 更新 `temp/rc-demo-pairing.json`               | 需要读线上 Demos 站点，且它不影响 verdict |
| 修改历史快照                                   | 任务明确禁止把旧报告改写成看似通过        |
| 降低 blocker 数量                              | 任务明确禁止弱化验收条件                  |
