# 迁移顺序、风险门禁与回滚计划

## 1. 迁移顺序（依赖驱动，非规模驱动）

设计包 `docs/05-migration-roadmap.md:66-72` 建议「先低风险复杂 Demo，Admin 最后」。
本文件把它落成可执行的顺序，并标出每步的前置门禁。

```
Phase 1  ← 当前
  └─ 产出冻结清单，等待确认

门禁 G0：用户确认本清单 + 回答 D-01..D-05
  │
Phase 2  zeus-ui 组件职责归位
  ├─ 2a. @zeus-ui/headless 迁入（+ 补 headless-demo 的依赖声明）
  ├─ 2b. 5 个 headless 消费示例迁入
  └─ 2c. （可选）admin gallery 合并进 apps/docs
  门禁 G2：site:check + showcase:ci + docs:build 全绿

门禁 G1：P1（0.2.0 发布）+ P2（beta.35 发布）
  │
Phase 3  zeus-ecosystem 骨架
  ├─ 3a. 空仓库 + 基础 CI（install/lint/typecheck）
  ├─ 3b. 兼容矩阵文件 + 依赖更新策略
  └─ 3c. 一个只读消费者验证（能装已发布包）
  门禁 G3：独立 install --frozen-lockfile 通过

Phase 4-1  AI Workbench + Host 迁移（试点）
  ├─ 两应用同批迁
  ├─ 4 个 @zeus-web/* 改 registry
  ├─ 3 个 @zeus-js/* 从 0.1.1-beta.20 升到 0.2.0  ← 跨大版本
  └─ 5 个 gate 全绿 + 双镜像 digest 一致
  门禁 G4-1：7 个 gate 通过 + 公网 build-info 反证

Phase 4-2  demos-pages 与 product-acceptance 迁移
  └─ 消除 3 条跨仓 checkout
  门禁 G4-2：demo-pairing.json 校验通过

Phase 5  CI、部署与证据链
  ├─ 5a. 镜像 SBOM 新建
  ├─ 5b. 体积 artifact 化
  ├─ 5c. deployment-acceptance 解耦 import
  └─ 5d. playground 补 revision label（若留 zeus）
  门禁 G5：新旧证据可按 digest 对应

Phase 6  Admin 生产切换（最后，单独审批）
  ├─ 6a. admin 代码 + server + Dockerfile + deploy 迁入
  ├─ 6b. 24 个 @zeus-web 改 beta.35；删 vendor
  ├─ 6c. 5 个 @zeus-js 改 0.2.0
  ├─ 6d. framework 断言新宿主就位（R-03）
  └─ 6e. 双轨部署 + 回滚演练
  门禁 G6：新旧部署对比通过 + 回滚演练成功 + 用户明确批准

Phase 7  zeus 清理与依赖环验收
  ├─ 删除已迁出的 admin、headless 系
  ├─ 处理 create-zeus 模板（D-04）
  ├─ 决定 ci.yml:952 / release.yml:128 的跨仓 checkout
  └─ 清理文档、脚本、CI 路径引用
  门禁 G7：zeus 对 @zeus-web 零依赖（除已登记的例外）

Phase 8  最终审计
```

### 1.1 为什么 AI Workbench 先于 Admin

| 维度                  | AI Workbench                    | Admin                                       |
| --------------------- | ------------------------------- | ------------------------------------------- |
| 生产部署              | 有（2 镜像）                    | 有（1 镜像）                                |
| 框架版本跳变          | `0.1.1-beta.20` → `0.2.0`       | workspace → `0.2.0`                         |
| 与 zeus-ui 组件的耦合 | 4 个 ai-\* 包，无 UI primitives | **25 个 UI 包**                             |
| 框架断言宿主          | 无                              | **是唯一的 Router/Query/i18n 宿主**         |
| 与 zeus 工具的耦合    | 7 个 gate 脚本                  | `deployment-acceptance.ts:39` import server |
| 回滚复杂度            | 双镜像同时回滚                  | 单镜像 + SQLite 数据                        |

**AI Workbench 是更好的试点**：它有真实生产部署（验证切换流程），
但不承载框架契约断言（失败不会静默丢失覆盖），且不依赖 UI primitives。

---

## 2. 风险门禁

每个门禁是**硬门禁**：不通过则不进入下一阶段。

| 门禁 | 检查项                                                  | 失败后果                           |
| ---- | ------------------------------------------------------- | ---------------------------------- |
| G0   | 用户确认清单；D-01..D-05 有答案                         | 无法开始任何写操作                 |
| G1   | npm 上存在 `@zeus-js@0.2.0*` 与 `@zeus-web@>=beta.35`   | Phase 4 无法做到「只消费已发布包」 |
| G2   | `site:check`、`showcase:ci`、`docs:build` 全绿          | zeus-ui 组件职责归位失败           |
| G3   | ecosystem 空仓库独立 `install --frozen-lockfile`        | 骨架不可用                         |
| G4-1 | 7 个 ai gate 通过；双镜像 digest 与公网 build-info 一致 | 生产可能断流（SSE）                |
| G4-2 | `demo-pairing.json` 的 `siteDigest` 校验通过            | demo 站点可能展示错误数据          |
| G5   | 新旧证据可按 image digest 一一对应                      | 证据链断裂，不可审计               |
| G6   | 新旧部署对比 + 回滚演练 + 用户批准                      | 生产事故                           |
| G7   | zeus 对 `@zeus-web` 零依赖（除登记例外）                | 重构目标未达成                     |

---

## 3. 回滚计划

### 3.1 分阶段回滚

| 阶段                      | 回滚动作                                                     | 时间窗口            | 数据影响                            |
| ------------------------- | ------------------------------------------------------------ | ------------------- | ----------------------------------- |
| Phase 2（zeus-ui 内部）   | `git revert` 迁移提交                                        | 随时                | 无                                  |
| Phase 3（空仓库）         | 删除仓库即可                                                 | 随时                | 无                                  |
| Phase 4-1（AI Workbench） | 保留 zeus-ui 的旧工作流与旧镜像；DNS 切回；两容器同时回滚    | 保留 2 个稳定版本   | 无（SQLite 在卷上，镜像回滚不影响） |
| Phase 4-2（demos-pages）  | `zeus-demos` 仓库有 git 历史，`git revert` 到上一站点 commit | 随时                | 无                                  |
| Phase 5（证据）           | 保留旧 artifact                                              | 30-90 天            | 无                                  |
| **Phase 6（Admin）**      | **双轨**：zeus 的 `admin-image.yml` 保留可用；按 digest 回切 | **建议 2 周观察期** | **SQLite 需备份**                   |

### 3.2 Admin 的双轨切换细节

Phase 6 的关键设计：**新旧两条部署链并存，不同时销毁**。

```
切换前
  zeus/admin-image.yml ──build──> ghcr zeus-admin:<sha> ──deploy──> 宿主机 zeus-admin 容器
                                        ▲
切换中（双轨）
  zeus/admin-image.yml ──build──> ghcr zeus-admin:<sha>  （保留，可随时回切）
  ecosystem/...        ──build──> ghcr zeus-admin:<sha>  （新建，先只 build 不 deploy）
                                        │
切换后（观察期）
  ecosystem 部署到同一容器名
  回滚 = 用旧 digest 重新 `docker compose up -d --pull never`
```

**回滚命令**（复用 `admin-image.yml:637-670` 的 pull-by-digest 逻辑）：

```bash
# 在宿主机上
docker pull ghcr.io/<owner>/zeus-admin@sha256:<旧 digest>
docker tag  ghcr.io/<owner>/zeus-admin@sha256:<旧 digest> ghcr.io/<owner>/zeus-admin:rollback
cd /home/ubuntu/zeus-admin && IMAGE_TAG=rollback docker compose -f docker-compose.deploy.yml up -d --pull never
```

**数据回滚**：`examples/admin/server/database.ts:124-236` 已有 `VACUUM INTO` 备份与恢复。
切换前必须执行一次 `pnpm admin:db --backup`，并把备份文件路径记录到证据里。

### 3.3 AI Workbench 的回滚特殊点

**两个镜像必须同时回滚**。`ai-workbench-image.yml` 的文件头注释明写：
「shipping one without the other leaves every command and SSE stream failing to connect」。

回滚时必须同时指定两个 digest：

```bash
IMAGE_TAG=<旧 sha> HOST_IMAGE_TAG=<旧 sha> docker compose -f docker-compose.deploy.yml up -d --pull never
```

**验证方式**：`ai-workbench-image.yml:708-719` 的健康检查只探 workbench 的 `/healthz`，
不验证 SSE。回滚后必须额外跑一次 `check:ai-workbench-live` 或手工发一条消息确认 SSE 通。

---

## 4. 全局风险（与 Phase 0 的 R 系列对应）

| 风险                                 | Phase 1 处理                                            | 残留                          |
| ------------------------------------ | ------------------------------------------------------- | ----------------------------- |
| R-01（0.2.0 未成功发布）             | 设为门禁 G1；rc.3 tag 已存在但发布半途失败（i18n 缺失） | 需恢复发布（无审批门）        |
| R-02（beta.35 未发布）               | 设为门禁 G1                                             | 需用户启动发布                |
| R-03（framework 断言失去宿主）       | 标记 6 组 needs_new_host（G14/17/18/19/36/41）          | **需在 Phase 6 前设计新宿主** |
| R-04（create-zeus 模板）             | D-04                                                    | 需用户决策                    |
| R-05（3 个生产部署）                 | 已拆为 3 条独立决策                                     | 已处理                        |
| R-06（demos-pages 跨仓）             | 整体迁 ecosystem                                        | 已处理                        |
| R-07（deployment-acceptance import） | Phase 5c 解耦                                           | 已排期                        |
| R-08（examples 被检查脚本锁定）      | 决定不搬 showcase                                       | 已处理                        |
| R-09（vendor 删除）                  | 排在 Phase 6b，双轨期保留                               | 已排期                        |
| R-10（@zeus-ui scope）               | D-05                                                    | 需用户决策                    |
| R-11（zeus-ui 包名被占）             | 不在迁移范围，登记为技术债                              | 残留                          |
| R-12（playground ui-commit 错误）    | Phase 5d 修补                                           | 已排期                        |
| R-13（beta/online 配对矛盾）         | Phase 1 后立即澄清                                      | **建议优先**                  |
| R-14（无 SBOM）                      | Phase 5a 新建                                           | 已排期                        |
| R-15（体积只写 summary）             | Phase 5b                                                | 已排期                        |
| R-16（无 revision label）            | Phase 5d                                                | 已排期                        |

---

## 5. 新增风险（Phase 1 识别）

| ID       | 风险                                                   | 等级   | 说明                                                                                                                            | 控制                                                                              |
| -------- | ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **R-V1** | **双版本 `@zeus-js/*` 并存**                           | **高** | ecosystem 的 admin 需要 `0.2.0`（新 Router API），而 `@zeus-web/*` 的传递依赖仍是 `0.1.1-beta.20`。同一应用树里可能装出两个版本 | Phase 4 前验证 pnpm 的 dedupe 结果；若并存，需先让 zeus-ui 升级到 0.2.0           |
| R-V2     | AI Workbench 跨大版本编译器行为变化                    | 高     | `jsxImportSource: @zeus-js/zeus` 从 0.1.1 到 0.2.0，编译输出可能变化                                                            | 7 个 gate 全绿是硬门禁；额外对比 `dist` 产物 hash                                 |
| R-V3     | Admin 迁移后失去 `devtools-consumer` 的 workspace 链接 | 中     | `@zeus-js/devtools-consumer` 是 private 包（`0.1.1-beta.14`），**不可发布**                                                     | 迁移时需确认它是否发布；若不可发布，admin 的 `?devtools` 功能需改为可选依赖或移除 |
| R-V4     | `@zeus-ui/headless` 迁入后 scope 分裂                  | 中     | zeus-ui 同时有 `@zeus-web/*` 与 `@zeus-ui/*`                                                                                    | D-05 决策；若选 A，在 AGENTS.md 登记                                              |
| R-V5     | Playground 留 zeus 与「zeus 不承担应用部署」冲突       | 中     | 设计包内部矛盾                                                                                                                  | D-02 决策后修订设计包                                                             |
| R-V6     | Phase 2 的 `@zeus-ui/headless` 迁移无门禁              | 中     | 它没有 CI job 覆盖（只有 `component-host-rc` 间接）                                                                             | 迁移时补一个独立的 check 脚本                                                     |

### R-V3 需要立即核实

`@zeus-js/devtools-consumer` 的 `private: true`（Phase 0 已记录）。
admin 的 `?devtools` 功能依赖它。**如果它不发布，迁移后的 admin 无法保留该功能。**
这需要在 Phase 6 前决定：发布 devtools-consumer、或 admin 移除该功能、或改为可选。

---

## 6. 每个阶段的"完成"定义

设计包 `docs/06-acceptance-and-non-goals.md:26-31` 要求不得用删除测试/跳过/放宽 timeout 冒充完成。
逐阶段给出可验证的完成定义：

| 阶段      | 完成定义（必须全部满足）                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| Phase 2   | `site:check` 绿；`showcase:ci` 绿；`docs:build` 绿；迁入的示例有独立 check          |
| Phase 3   | 空仓库 CI 绿；一个只读消费者能 `install --frozen-lockfile`                          |
| Phase 4-1 | 7 个 ai gate 绿；双镜像 digest 一致；公网 build-info 的 `uiCommit` == 源 commit     |
| Phase 4-2 | `demo-pairing.json` 校验通过；站点内容与迁移前逐字节比对（除元数据）                |
| Phase 5   | 新旧证据可按 digest 对应；SBOM 包含全部运行时依赖                                   |
| Phase 6   | 新旧部署对比通过；回滚演练成功；`check:admin` 的 115 条断言全部有归属且在新位置执行 |
| Phase 7   | zeus 对 `@zeus-web` 零依赖（除登记例外）；`check:structure` 通过                    |

**Phase 6 的完成定义最容易被糊弄**：只要 `check:admin` 被整体删掉，所有断言"都有归属"（归属=删除）。
因此必须额外验证：**6 组 framework 断言在 zeus 的新宿主体里真实执行并通过**。
建议在 migration manifest 里为它们单列验收项。
