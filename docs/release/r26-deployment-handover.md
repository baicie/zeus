# 部署职责交接：Core → Ecosystem

产品部署不属于框架职责。本文记录它去了哪里、迁移了什么、以及哪些保障必须
继续成立。

---

## 为什么迁移

`zeus` 是编译器优先的 UI 框架仓库：运行时、编译器、Router、Reactivity、公共工具。
`deploy/host-validation/` 与 `scripts/release/deployment-*.ts` 是**四个应用的生产部署
基础设施**——compose 拓扑、容器事务、Caddy 断言、SQLite 备份、线上业务验收。
它服务的是产品交付，不是框架语义。

应用本来就住在 `zeus-ecosystem`（admin / ai-workbench / ai-host / playground），
部署留在 Core 让「谁能改生产拓扑」这个问题有两个答案。

---

## 迁移清单

| 资产                                                          | 去向                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `deploy/host-validation/`（compose、nginx、layout、env 模板） | `infra/deployment/host-validation/`                              |
| `deployment-transaction.ts`（1977 行）                        | `scripts/deployment/transaction.mjs`                             |
| `deployment-acceptance.ts`（1376 行）                         | `scripts/deployment/acceptance.mjs`                              |
| `deployment-workspace-restore.ts`（979 行）                   | `scripts/deployment/workspace-restore.mjs`                       |
| `deployment-layout.ts`（487 行）                              | `scripts/deployment/layout.mjs`                                  |
| `deployment-ai.ts`                                            | `scripts/deployment/ai-environment.mjs`                          |
| `network-policy.ts`                                           | `scripts/deployment/network-policy.mjs`（Core 仍保留一份，见下） |
| `build-info.ts` 的校验函数                                    | `scripts/deployment/build-info.mjs`                              |
| 2323 行测试（5 个 spec）                                      | `scripts/__tests__/deployment/`                                  |

`network-policy.ts` 在 Core **保留**：`online-url-policy.ts` 用它做发布期的 URL
校验，那是 npm 发布职责，不是部署。同一份分类逻辑因此存在于两个仓库，各自服务
自己的调用方；这不是遗漏，是两处不同用途。

---

## 12 项保障的归属

迁移前逐项核对，只有 Ecosystem 尚未覆盖的才需要搬。

| 保障                                              | 迁移后位置                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| 不可变镜像 Digest                                 | Ecosystem `verify-plan-digests.mjs`（已有）                           |
| 生产拓扑校验                                      | `scripts/deployment/layout.mjs`                                       |
| 部署事务（锁→校验→快照→预检→备份→切换→健康→验收） | `scripts/deployment/transaction.mjs`                                  |
| 中途失败恢复                                      | 同上 + `scripts/__tests__/deployment/`（含 SIGKILL 用例）             |
| 容器回滚                                          | `transaction.mjs` 的 `rollbackDeployment`                             |
| SQLite 备份与预检                                 | `transaction.mjs` 的 `preflightAdminDatabase` / `preflightAiDatabase` |
| Caddy 路由断言                                    | `transaction.mjs` 的 `assertCaddyUpstreams`                           |
| Playground 双 Origin 安全                         | Ecosystem `check-playground-sandbox-csp`（已有，实测 5/5）            |
| AI SSE 代理                                       | Ecosystem 已有                                                        |
| 线上业务验收                                      | `scripts/deployment/acceptance.mjs`                                   |
| 隔离测试租户                                      | `transaction.mjs` 的 `createLocalLayout`                              |
| 部署证据                                          | `transaction.mjs` 的 `TRANSACTION_REPORT_SCHEMA`                      |

---

## 测试迁移的一处教训

Core 用 vitest，Ecosystem 用 `node:test`。第一次尝试是把每个
`expect(x).toBe(y)` 机械替换成 `assert.equal(x, y)`，结果把

```js
expect(() => verifyLayoutDigest(file, other)).not.toThrow()
```

变成了 `assert.throws(...).not.toThrow()` —— 一个本来会通过的断言，翻转成了
永远不可能失败的一个。

所以测试源码保持原样，改为提供一个 `scripts/__tests__/deployment/expect.mjs`
垫片：11 个 matcher，每个映射到一条 `node:assert` 调用，取反与 throws 只实现一次。
机械改写断言是让测试保持形状却丢掉含义的最快方式。

---

## Core 不再做什么

- 不再有 `deploy/` 目录。
- 不再有 `deploy:stage1` / `deploy:stage2` / `check:deployment-acceptance`。
- 不再有 `host-deployment-prepare.yml` / `host-deployment-stage2.yml`。

两个 workflow 的最后一次运行在 2026-11-07，均为手动触发；此后没有使用记录。

Core 仍负责 **npm package release**：打 tag、发布、配对、registry 验收。
应用部署全部归 Ecosystem。

---

## 历史文档

`docs/deployment/` 保留为历史记录——它们是某个日期某次部署的证据，改它们等于
篡改记录。现行部署文档在 Ecosystem。`docs/architecture/r19-*` 与
`docs/audit/phase0/*` 同理，是历史审计快照。
