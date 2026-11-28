# R25 — 不可变配对恢复报告

本文件记录 rc.8 配对恢复的最终结果。事故过程见
[`r25-rc6-release.md`](./r25-rc6-release.md)；本文件只写**改了什么、证据在哪、
哪些没做**。

---

## 1. 规则集变更前后

规则集 `27438539`（`release tag immutability`），修改前后：

| 项              | 修改前                                 | 修改后                              |
| --------------- | -------------------------------------- | ----------------------------------- |
| `enforcement`   | active                                 | active                              |
| `include`       | `v*`、`create-zeus@*`、`vite-plugin@*` | 同上 + `pair/*`、`pair-amendment/*` |
| `exclude`       | `[]`                                   | `[]`（探测用临时排除已还原）        |
| `rules`         | `{deletion}`、`{update}`               | 不变                                |
| `bypass_actors` | `[]`                                   | `[]`                                |

原有匹配范围一条未减。

## 2. 两个命名空间的实际保护状态

不是看规则名，是对真实远端探测：

| 操作               | `pair-amendment/*`                       | `pair/*` |
| ------------------ | ---------------------------------------- | -------- |
| 创建 tag           | 成功                                     | 成功     |
| 删除 tag           | `GH013 Cannot delete this tag`           | 同       |
| 强制移动 tag       | `GH013 Cannot update this protected ref` | 同       |
| 触发 `release.yml` | 否（只匹配 `v*`）                        | 否       |

探测用的两个临时 tag 已删除，规则集已还原为不含 `exclude` 的最终形态。

**没有恢复审批要求。** 早先的协议要求一条 `APPROVED` review，但唯一有 admin
的账号就是开 PR 的账号，GitHub 直接返回 `422 Review Can not approve your own
pull request`。无法满足的门禁只会让人绕过整个协议，所以授权改为由不可变锚点
承担——见第 4 节。

## 3. Lockfile 缺失负向测试

`UiCandidateIdentity.lockfileSha256` 从 `string | undefined` 改为必需的
`string`，读取改为三态 `UiCandidateLookup`。测试覆盖：

| 场景                            | 结果                            |
| ------------------------------- | ------------------------------- |
| lockfile 缺失                   | 拒绝（`has no pnpm-lock.yaml`） |
| lockfile 获取失败               | 拒绝（携带 HTTP 原因）          |
| amendment 省略 `lockfileSha256` | 拒绝（validator 层面）          |
| hash 不匹配                     | 拒绝                            |
| hash 完全匹配                   | 通过                            |

blob 通过提交自身 tree 里的 id 走 Git Data API 读取（Contents API 会拒收这个
体积），解码后与 GitHub 报的 `size` 比对，截断不会产生「看起来合理」的 hash。

## 4. 五份证据的实际验证

证据包 `meta/release/evidence/v0.2.0-rc.8/bundle.json`，
sha256 `ffed8f60926f752ec4c2909e0fb8bbad84bfdae5246dc6bc4e04ad96a01ef372`。

| 报告                  | 结论 | 关键数字                                                    |
| --------------------- | ---- | ----------------------------------------------------------- |
| Core registry         | PASS | 32/32 exact、32/32 rc-tagged、7 平台二进制、32/32 integrity |
| UI candidate          | PASS | 6/6 模板、全部 pinMatch                                     |
| Template acceptance   | PASS | 6/6（由候选报告推导，非手写）                               |
| Browser acceptance    | PASS | 5/5 probe 渲染，1 个模板无页面被跳过并记名                  |
| UI registry preflight | PASS | 46 个包全部 ABSENT、0 查询失败                              |

「结论」不是包里的 `verdict` 字段，而是校验器按报告**自身数字**重算的结果
（`rcTag == checked`、`passed == templates`、`published` 为空）。
`verifyEvidenceBundle` 对 tag 提交、UI 提交与 tree、lockfile 摘要运行：**0 problems**。

## 5. 最终维护者授权证明

没有 review，也不声称有。协议里的 `authorization` 是：

```json
{
  "releasedBy": "baicie",
  "releasedAt": "2026-11-28T08:24:59.167Z",
  "changeReference": "baicie/zeus#421"
}
```

它记录**谁在何时发布、去哪儿看**，不构成授权。真正的授权来自：

1. tag `pair-amendment/v0.2.0-rc.8` 受规则集覆盖，删不掉也移不动；
2. amendment 每个字段都对照受保护的 `v0.2.0-rc.8`、tag 内记录字节、UI 仓库真实内容；
3. 证据包与 amendment 在同一棵树里，逐份报告按自身数字重判。

改写 amendment 会让校验失败，除非把已发布的 Core 一起改写——tag 保护不允许。

## 6. 最终 UI Candidate

`56ae16497e242dc93e09cdd25598af5c787fb1da`（`baicie/zeus-ui#172` squash 合并）。
tree `16cb7aec`，lockfile `fb4651a3`。

对它的完整验收：`pnpm install --frozen-lockfile`、`tsc --noEmit`、`pnpm build`、
`vitest --run --project unit`（**1406 tests**）、`release:verify`、
`check:release-pairing`（static）、`check:release-channel`，全部通过。

联合验收在 **rc.8 自己的源码树**（`c7f5e1a4`）里跑，不是当前 Core main：
6/6 模板、5/5 probe。

## 7. 原始候选被拒绝

```
$ check-release-pairing --release-sha 01b0778a... --online
v0.2.0-rc.8 is amended: the candidate that ships is 56ae1649..., so 01b0778a... cannot be released under this version
replacement.uiCommit 56ae1649... is not the commit being released (01b0778a...)
```

原始候选即使与 tag 内记录一致也被拒绝——这正是 v1 的缺陷：只有不相等时才查
amendment，导致被替代的候选永久保留一条直连路径。

## 8. Amendment Tag 与 Commit

| 项     | 值                                                 |
| ------ | -------------------------------------------------- |
| tag    | `pair-amendment/v0.2.0-rc.8`                       |
| commit | `a2ad24710875db4970170fa012a5f2afa4e03229`         |
| 文件   | `meta/release/pairing/amendments/v0.2.0-rc.8.json` |
| schema | `zeus.pairing-amendment/v2`                        |

验收状态记录单独一份：tag `pair-amendment/v0.2.0-rc.8.accepted`，
commit `3ce0d1f1`。**原始 tag 内的记录未改一字**——它仍然写着
`UI_PUBLISHED: null`，因为那是发布当时的事实。

## 9. UI rc.8 正式发布结果

Run `46125975434`，conclusion success。

| 检查                      | 结果                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| 逐包验证（workflow 自报） | 46 verified、0 propagation pending、0 registry unavailable、0 contract mismatch |
| 独立重查 46 个包          | 46/46：`rc` 指向 rc.8、latest 未变、integrity 存在                              |
| latest 基线               | 46 个包的 latest 仍全是 beta                                                    |
| SLSA provenance           | `@zeus-web/button` 的 bundle 记录 `56ae1649` / `baicie/zeus-ui`                 |
| 真实安装                  | `@zeus-web/button@0.2.0-rc.8` 拉 42 个包，`@zeus-js/*` 全部 rc.8                |
| 脚手架                    | 模板依赖全部解析；`basic-ts` 构建 57ms、Chromium 渲染 0 错误                    |

发布前的 ABSENT 证据保留在证据包里（`ui-registry-preflight`）。

## 10. Core/UI Pair Accepted

`CORE_PUBLISHED` 与 `UI_PUBLISHED` 都成立，`PAIR_ACCEPTED` 记录在
`pair-amendment/v0.2.0-rc.8.accepted` 的
`meta/release/pairing/amendments/v0.2.0-rc.8.accepted.json`。

## 11. Ecosystem 升级与验收

`zeus-ecosystem@4823494`：

| 项                      | 结果                                                        |
| ----------------------- | ----------------------------------------------------------- |
| 四个应用 pin            | 全部 rc.8（含 `@zeus-web/ai-*`）                            |
| 独立版本线              | 保持 `vite-plugin@0.0.6`、`devtools-consumer@0.1.1-beta.15` |
| `verify-published-pair` | pass，errors `[]`                                           |
| `pnpm check`            | **163/163**                                                 |
| 构建                    | admin 791ms、ai-workbench 636ms、playground 1.23s           |
| 消费者 fixture lockfile | 重新生成（不是手改）                                        |
| 契约状态                | **`candidate`**，不是 `validated`                           |

契约明确写了**没做**的：三引擎浏览器矩阵、镜像构建、三个部署单元都未在这一对上
重跑。上一对（rc.5 / beta.35）的浏览器证据描述的是别的版本，不能转移。

---

## 尚未完成

这些是任务范围外或需要独立授权的事，逐条列出而不是含糊带过：

- **三引擎浏览器矩阵** 未在 rc.8 这一对上运行。
- **镜像构建与三个部署单元**（Admin / AI Workbench / AI Host）的升级回滚未执行。
- **`@zeus-web/chat`** 等 46 个包中，我第一次查询时有一个尚未传播（后来确认已发布）；
  这类传播延迟在 workflow 的验证窗口里已被覆盖，但本机查询需要重试。
- 本机 npm 10 不安装 optional 平台包（[npm/cli#4828](https://github.com/npm/cli/issues/4828)），
  脚手架验收时显式放置了 `compiler-native-darwin-arm64`；CI 无此问题。
