# Phase 3 Readiness 预检报告

- 日期：2026-11-23
- 基线：zeus `4a5db055`、zeus-ui `629bd69e`
- 性质：**只读检查**。未创建仓库、未迁移、未发布、未打 tag、未切换部署。

证据等级：**VERIFIED** = 实际执行命令并读到结果；**INFERRED** = 从配置或日志推断；
**UNKNOWN** = 现有材料无法确认。

---

## 结论先行

**Phase 3 现在不能开始。** 有两个硬阻塞：

| #   | 阻塞                                        | 证据等级 | 影响                                         |
| --- | ------------------------------------------- | -------- | -------------------------------------------- |
| B1  | `@zeus-web/*` 的 `0.1.0-beta.35` 全部未发布 | VERIFIED | 46/46 包在 registry 上不存在，最新是 beta.34 |
| B2  | R-V1：旧 beta 与 rc.5 在依赖树中共存        | VERIFIED | 实测出现 3 份 `runtime-dom`、3 份 `signal`   |

B1 是 Phase 1 就已识别的门禁 G1 的第二半（P2）。B2 是这个门禁没达成时的具体后果。

---

## 1. `baicie/zeus-ecosystem` 是否存在

**不存在**（VERIFIED）。

```
$ git ls-remote https://github.com/baicie/zeus-ecosystem.git HEAD
remote: Repository not found.
fatal: repository 'https://github.com/baicie/zeus-ecosystem.git/' not found
```

对照组：同一时刻 `git ls-remote https://github.com/baicie/zeus.git HEAD` 返回
`4a5db055…`，排除了网络故障。

## 2. 新仓库推荐名称与可见性

| 项       | 建议                       | 理由                                                        |
| -------- | -------------------------- | ----------------------------------------------------------- |
| 名称     | `zeus-ecosystem`           | 与 Phase 1 全部文档、迁移矩阵 CSV 一致，改名要同步 35 行    |
| 可见性   | **private**                | 内含 Admin 的管理后台与 AI Workbench 的部署配置（INFERRED） |
| 默认分支 | `main`                     | 与两个上游仓库一致                                          |
| 初始内容 | 空仓库 + 基础 CI，不迁代码 | Phase 3a 的定义                                             |

可见性判定依据不足：`zeus` 与 `zeus-ui` 的可见性未在本次预检中读取，若两者为 public
则 ecosystem 也应为 public。**这是一个需要你确认的决策（D-P3-01）。**

## 3–4. `@zeus-js/*` rc.5 是否全部可安装

**32/32 可用**（VERIFIED）。

```
发布组: 32 个包
可用: 32 | 缺失: 0
```

逐包对 `registry.npmjs.org` 查询 `@zeus-js/<name>@0.2.0-rc.5`，全部命中。

## 5. `@zeus-web/*` beta.35 是否全部发布

**46/46 全部未发布**（VERIFIED）。这是 B1 阻塞。

```
可发布 @zeus-web 包: 46
版本分布: [('0.1.0-beta.35', 46)]     ← 仓库内声明的版本

beta.35 已发布: 0 | 未发布: 46
```

registry 上的实际状态（`@zeus-web/button` 为例）：

```
已发布版本数: 32
最近 6 个: 0.1.0-beta.29 … 0.1.0-beta.34
dist-tags: { latest: '0.1.0-beta.0', beta: '0.1.0-beta.34' }
```

注意两点：

- 最新发布的是 **beta.34**，不是 beta.35。
- `latest` 仍停在 **`0.1.0-beta.0`**——与 zeus 的 latest 被预发布污染是同类现象，
  但方向相反（这里 latest 落后，而不是超前）。

## 6. zeus-ui beta.35 的 Release pairing 条件

**不满足**（VERIFIED）。

- `zeus/meta/release/pairing/` 下只有 `v0.2.0-rc.3/4/5.json`，**没有 beta.35 的记录**。
- zeus-ui 自身有 `.github/workflows/release.yml` 与 `scripts/release.config.ts`
  （`repo: 'baicie/zeus-ui'`、`mode: 'workspace-fixed'`），发布链路存在，
  但从未产出 beta.35。

结论：beta.35 的发布不是「差一个 tag」，而是整条链路尚未跑过。

## 7. R-V1：同一消费者安装 rc.5 与 beta.34 的重复 `@zeus-js` 风险

**风险成立，且比预期严重**（VERIFIED）。这是本报告最重要的实测项。

### 7.1 直接的 peer 冲突

```
$ npm install @zeus-js/zeus@0.2.0-rc.5 @zeus-web/button@0.1.0-beta.34
npm error code ERESOLVE
npm error Found: @zeus-js/zeus@0.2.0-rc.5
npm error Could not resolve dependency:
npm error peer @zeus-js/zeus@"0.1.1-beta.20" from @zeus-web/button@0.1.0-beta.34
```

beta.34 的 peer 硬绑 `0.1.1-beta.20`，与 rc.5 不相容。

### 7.2 绕过 peer 检查后的实际依赖树

`--legacy-peer-deps` 让安装成功，但树是这样：

```
+-- @zeus-js/runtime-dom@0.2.0-rc.5
+-- @zeus-js/zeus@0.2.0-rc.5
`-- @zeus-web/button@0.1.0-beta.34
  +-- @zeus-js/runtime-dom@0.1.1-beta.20        ← 嵌套了另一份
  +-- @zeus-js/web-c-runtime@0.1.1-beta.20
  +-- @zeus-js/zeus@0.2.0-rc.5 deduped invalid: "0.1.1-beta.20" from node_modules/@zeus-web/button
  `-- @zeus-web/zeus-compat@0.1.0-beta.34
    +-- @zeus-js/runtime-dom@0.1.1-beta.20
```

磁盘上的实际份数：

| 包                     |  份数 | 版本                   |
| ---------------------- | ----: | ---------------------- |
| `@zeus-js/runtime-dom` | **3** | rc.5、beta.20、beta.20 |
| `@zeus-js/signal`      | **3** | 同上                   |

### 7.3 为什么这比「版本号不一致」严重

`signal` 是响应式引擎本体。三份 `signal` 意味着三套独立的依赖收集与通知：

- 在 A 实例里 `createSignal`，在 B 实例里 `createEffect` 不会建立依赖。
- `createRoot` / `onCleanup` 的作用域不跨实例，组件卸载时另一份的订阅不会被释放。
- 这是**静默失效**：`npm ls` 不报错（加了 `--legacy-peer-deps` 之后），
  类型检查也过（两份 `.d.ts` 结构相同），只有运行时行为错乱。

这也解释了为什么本报告不把「`pnpm install` 成功」当作通过标准。

### 7.4 对 Phase 3 的含义

Phase 3c 要求「一个只读消费者验证能装已发布包」。按当前 registry 状态，
这个消费者**只能二选一**：

- 全 rc.5：`@zeus-web/*` 无法使用（peer 冲突，7.1）。
- 全 beta.34：`@zeus-js/*` 停在 `0.1.1-beta.20`，拿不到 rc.5 的任何修复
  （包括 `mergeEvents` 那个）。

**没有第三个选项，除非先发布 beta.35。** 这就是 B1 与 B2 的因果关系：
B1 未解决时，Phase 3c 的「验证能装」只能验证出一个畸形的树。

## 8. 新仓库需要的 permissions / secrets / environments

以下是从 zeus 与 zeus-ui 现有 workflow 中统计出的、会被迁入 ecosystem 的部分
（VERIFIED 为 grep 结果，INFERRED 为归属判断）：

| 项                                       | 现有用法                              | 迁移后是否需要             | 证据     |
| ---------------------------------------- | ------------------------------------- | -------------------------- | -------- |
| `contents: write`                        | 3 处（release、github-release、部署） | 是                         | VERIFIED |
| `packages: write`                        | 3 处（GHCR 镜像推送）                 | 是                         | VERIFIED |
| `id-token: write`                        | 7 处（npm provenance）                | beta.35 发布时需要         | VERIFIED |
| `actions: read`                          | 2 处                                  | 是                         | VERIFIED |
| `NPM_TOKEN`                              | 12 处                                 | 是（若在 ecosystem 发布）  | VERIFIED |
| `TCR_USERNAME/PASSWORD`                  | 各 9 处（腾讯云镜像仓库）             | 是（Admin/Workbench 镜像） | VERIFIED |
| `ZEUS_WORKBENCH_DEPLOY_SSH_KEY/PASSWORD` | 各 1 处                               | 是                         | VERIFIED |
| `ZEUS_PLAYGROUND_DEPLOY_SSH_*`           | 各 2 处                               | 否（Playground 留在 zeus） | INFERRED |
| `ZEUS_UI_DISPATCH_TOKEN`                 | 1 处                                  | 待定                       | UNKNOWN  |
| `ZEUS_LIVE_PASSPHRASE`                   | 1 处                                  | 待定                       | UNKNOWN  |

**Environments**（VERIFIED，现有 4 个）：`Release`、`Canary`、`production`、
`ai-workbench-live`。

迁移时需要在新仓库重建这些 environment。注意 zeus 的 `Release` 环境
**没有配置必需审批人**——这是已记录的决定，不应在迁移中被"顺手加上"。

## 9. 自托管 Runner 的归属与部署权限

**只有一处**（VERIFIED）：

```
zeus/.github/workflows/host-deployment-stage2.yml:111
    runs-on: [self-hosted, zeus-host]
```

其余 68 处全部是 GitHub 托管的 `ubuntu-*` / `windows-*`。

含义：

- `zeus-host` 这个 runner **注册在 zeus 仓库**下（仓库级）还是组织级，本次预检
  无法从仓库内容确认（**UNKNOWN**，需要读 GitHub 设置）。
- 如果它是仓库级 runner，迁移 `host-deployment-stage2.yml` 到 ecosystem 时
  必须在新仓库重新注册同名 runner，否则该 job 会无限排队——而不是立刻失败。
  这类失败**没有错误信息**，只有超时。
- 部署权限由 `Release` 环境承担；新仓库需重建该 environment 及其 secrets。

## 10. 是否需要保留 Demo 的完整 Git 历史

**建议保留，但只对部署相关的仓库**（INFERRED，附理由）。

依据：

| 事实                                                 | 来源     |
| ---------------------------------------------------- | -------- |
| 部署 workflow 使用 `fetch-depth: 0`（完整历史）      | VERIFIED |
| `host-deployment-stage2.yml` 用它做部署事务与证据    | VERIFIED |
| 现有脚本中**没有** `git log` / `git rev-list` 的调用 | VERIFIED |

结论：目前没有任何逻辑真正消费历史提交，但部署 job 显式要求了完整克隆。
迁移时若改成 `fetch-depth: 1` 需要先确认没有隐式依赖——这属于 Phase 5/6
的验证项，不建议在 Phase 3 就切断。

对纯代码迁移（headless 系已完成的 Phase 2），历史无关紧要。

---

## 未解决项汇总（详见 DECISIONS.md）

| ID      | 问题                          | 阻塞程度          |
| ------- | ----------------------------- | ----------------- |
| D-P3-01 | ecosystem 仓库的可见性        | 低                |
| D-P3-02 | beta.35 何时发布（B1）        | **高**            |
| D-P3-03 | R-V1 的根治方式（B2）         | **高**            |
| D-P3-04 | `zeus-host` runner 的注册范围 | 中                |
| D-P3-05 | Phase 3c 的消费者应该装什么   | **高**（依赖 02） |
