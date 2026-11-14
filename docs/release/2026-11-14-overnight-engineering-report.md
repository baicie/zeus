# Zeus 深夜自主工程审查与修复 — 交付报告

日期：2026-11-14  
基线：Core `69f494f270c8fb501b34759dc22d2a9de7aee951`（本轮 fetch 后确认未移动）  
执行环境：macOS 24.6.0 / darwin arm64 / Node 24.16.0 / pnpm 10.33.4 / Rust 1.95.0

---

## A. 本轮完成情况

| #   | 任务                        | 分支                                | PR   | commit     | 状态  |
| --- | --------------------------- | ----------------------------------- | ---- | ---------- | ----- |
| 1   | Admin Docker 构建链完整性   | `fix/admin-image-trigger`           | #262 | `012be576` | Draft |
| 2   | Vendored Dialog 供应链硬化  | `fix/vendored-provenance-hardening` | #263 | `b7659a36` | Draft |
| 3   | Core/UI 配对门禁            | `fix/ui-pairing-hardening`          | #264 | `109e48c9` | Draft |
| 4   | R6 文档 Addendum            | `docs/release-addendum`             | #265 | `06c0cda5` | Draft |
| 5   | Admin 后端安全审计          | `fix/admin-security-hardening`      | #266 | `c3ef0946` | Draft |
| 6   | Playground Sandbox 安全审计 | `fix/sandbox-security-hardening`    | #267 | `f92025fe` | Draft |
| 7   | 发布证据链与部署事务        | `fix/release-provenance-hardening`  | #268 | `1a808496` | Draft |
| 8   | npm 包发布质量              | `fix/package-release-audit`         | #269 | `79767ea0` | Draft |
| 9   | Admin UX / 无障碍 / 性能    | `test/ux-a11y-performance`          | #270 | `e604d9e8` | Draft |

九个分支各自独立，均从 `main` 切出，互不依赖。

## B. 缺陷清单

### P1（本轮修复）

| #    | 缺陷                                    | 影响                                                | 修复 |
| ---- | --------------------------------------- | --------------------------------------------------- | ---- |
| P1-1 | 镜像两工作流各缺 4–6 类构建输入         | 改 `vendor/**` 或 `scripts/**` 不重建镜像，沉默失败 | #262 |
| P1-2 | `contentDigest` 从未重算                | 篡改文件列表仍打印摘要并 exit 0                     | #263 |
| P1-3 | `--untracked-files=no` 看不见未跟踪源码 | 发布 checkout 带未提交代码却报干净                  | #264 |
| P1-4 | 未配置 allow-list 时接受任何 `Origin`   | 跨源 CSRF，`SameSite` 与 CSRF token 都挡不住        | #266 |
| P1-5 | 20 个包无 LICENSE 文件                  | tarball 声明 MIT 却没有许可证文本                   | #269 |

### P2（记录未修）

| #    | 缺陷                                                    | 为什么没修                    |
| ---- | ------------------------------------------------------- | ----------------------------- |
| P2-1 | 备份失败路径无负向测试                                  | 本地模拟不可靠，易写成测 mock |
| P2-2 | `verifyServedArtifact` 未实测运行                       | 需真实部署，本轮禁止          |
| P2-3 | 沙箱逃逸未经真实浏览器验证                              | 需完整 Playground 构建        |
| P2-4 | `optionalDependencies` 已在 #264 修，但 UI 侧无持续门禁 | 需新脚本，超出本轮范围        |

### P3（记录）

| #    | 缺陷                                 |
| ---- | ------------------------------------ |
| P3-1 | 递归不触发循环预算（有宿主超时兜底） |
| P3-2 | Playground 首次加载与编译延迟未测量  |
| P3-3 | 表格 1000 行渲染未测量               |

### DECISION_REQUIRED

| #   | 事项                                          | 需要什么                                     |
| --- | --------------------------------------------- | -------------------------------------------- |
| D-1 | `ZEUS_ADMIN_TRUST_PROXY=true` 时取 XFF 最左值 | 维护者确认代理层数，再决定是否改取最右可信跳 |
| D-2 | `0.2.0-rc-cut-plan.md` 与当前基线的差异       | 已在 #265 的 Addendum 说明，不需改原文       |

### 上轮遗留（本轮未动）

RC 的 6 项外部阻塞全部仍然存在：dialog 未发布、版本未切、审批工作流零运行、`Release` 环境无保护规则、在线验收未做、产品签核为空。见 `0.2.0-rc-readiness.md`。

## C. 测试证据

### 新增/修改的测试

| 文件                                                            | 项数 | 覆盖                                                                           |
| --------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| `scripts/ci/__tests__/image-build-inputs.spec.ts`               | 8    | 两个镜像工作流的 Dockerfile 输入 → 触发路径                                    |
| `scripts/check/__tests__/vendored-provenance.spec.ts`           | 24   | 篡改、缺失、多余、漏记、摘要、包名、版本、commit、重复、穿越、符号链接、字节数 |
| `scripts/check/__tests__/check-ui-pairing.spec.ts`              | 16   | 未跟踪源码、ignored 产物、optional 依赖、release.yml 四条保证                  |
| `examples/admin/server/__tests__/api.spec.ts`                   | 16   | 跨源 4 项 + 既有 12 项                                                         |
| `packages/devtools/playground-engine/__tests__/sandbox.spec.ts` | 6    | 重放、跨会话 + 既有 4 项                                                       |
| `scripts/release/__tests__/build-info.spec.ts`                  | 10   | 磁盘重算 4 项 + 既有 6 项                                                      |
| `scripts/check/__tests__/package-license.spec.ts`               | 33   | 32 个包 + 计数                                                                 |
| `scripts/check/__tests__/admin-forced-colors.spec.ts`           | 3    | forced-colors 块、系统色、reduced-motion                                       |

**每个测试都先写失败版本、确认复现、再修复。** 证据在各 PR 描述里。

### 本轮真实执行的命令

| 命令                                         | 结果                                                    |
| -------------------------------------------- | ------------------------------------------------------- |
| `check:packed-consumers`                     | **38/38 passed**，Node 24.16.0，`sourceCommit=69f494f2` |
| `check:release-artifacts`                    | 32 packages                                             |
| `check:exports`                              | passed                                                  |
| `check:native-packages`                      | passed                                                  |
| `check:create-zeus`                          | `webc-consumer-ts` typecheck + build passed             |
| `check:vendored-dialog`                      | passed（真实目录）                                      |
| `pnpm --filter @zeus-js/example-admin build` | 成功                                                    |
| Playwright `forced-colors: active`           | `borderColor: rgb(0,0,0)`                               |
| 9 个分支各自的测试                           | 全部通过（8/24/16/7/16/6/10/33/3）                      |

### 未执行

| 项                          | 原因                       |
| --------------------------- | -------------------------- |
| 真实镜像构建（本地 Docker） | 只改触发规则；PR CI 会验证 |
| `check:admin` 三引擎        | 依赖完整构建链，未复跑     |
| AI Workbench 各门禁         | 同上                       |
| 真实网关                    | 需 environment secrets     |
| Stage 2 部署验收            | 禁止部署                   |

## D. 安全审计

### 确认的漏洞并修复

**跨源请求未受 Origin 约束**（#266）。未配置 `ZEUS_ADMIN_ORIGINS` 时接受任何来源，还回显 `Access-Control-Allow-Origin`。`SameSite=Lax` 挡不住同站兄弟源；CSRF cookie 故意非 `HttpOnly`，兄弟源脚本可读。修复后空 allow-list 表示「只有本服务」。

### 攻击面评估

**Admin 后端**（任务 A–F 全部覆盖）：

- 认证：会话轮换、停用/角色变更撤销会话、自我降级与自我删除保护 —— **已正确**
- CSRF / Cookie：`HttpOnly` + `SameSite=Lax` + 非 `HttpOnly` CSRF cookie + 常量时间比较 —— **已正确**
- RBAC：每条路由 `requireRole`，viewer 无法写 —— **已正确**
- 限流：IP + 账号双键、有界 Map、lockout 恢复、dummy scrypt 防枚举 —— **已正确**
- 上传：只进 SQLite 不落盘、basename 校验、MIME 白名单、64KB 上限 —— **无穿越面**
- SQLite：`PRAGMA foreign_keys = ON`、`ON DELETE CASCADE`、事务包裹 —— **已正确**

**Playground Sandbox**：

- opaque origin（`sandbox="allow-scripts"`，无 `allow-same-origin`）
- 双向验证 source / origin / sessionId / schema
- 五种循环全插桩，累积式预算不误杀 async
- CSP 双条，`frame-ancestors` 锁定 host
- **未发现可利用逃逸**

### 剩余风险

递归不触发预算（P3，有超时兜底）；沙箱逃逸未经真实浏览器验证（P2）；`TRUST_PROXY` 的 XFF 语义依赖部署配置（D-1）。

## E. 发布状态

### RC 是否具备条件

**否。** 本轮修复了 5 个 P1，但**没有改变 RC 的外部阻塞**——那些不是代码问题。

### 代码阻塞（本轮已减少）

| 原阻塞            | 状态             |
| ----------------- | ---------------- |
| P1-2 摘要不可验证 | **已修**（#263） |
| P1-4 跨源         | **已修**（#266） |
| P1-5 许可证缺失   | **已修**（#269） |
| P1-1 镜像触发     | **已修**（#262） |
| P1-3 未跟踪文件   | **已修**（#264） |

### 外部阻塞（未变）

| #   | 阻塞                                                             | 谁能解                     |
| --- | ---------------------------------------------------------------- | -------------------------- |
| 1   | `@zeus-web/dialog` 无已发布修复版                                | 维护者授权发布             |
| 2   | 版本未切 `0.2.0-rc.0`                                            | 维护者批准                 |
| 3   | `rc-approval.yml` 零运行 + `Release` 环境 `protection_rules: []` | 维护者配置                 |
| 4   | 在线验收未执行                                                   | 需 Stage 2 部署            |
| 5   | 产品签核为空                                                     | 维护者本人                 |
| 6   | Admin/Playground 生产 `uiCommit` 记录错误                        | 需设 `vars.ZEUS_UI_COMMIT` |

## F. 下一轮任务

### 可以继续自动化

1. 合并这 9 个 PR 后，为 UI 侧补 `check:release-artifacts` 等价门禁
2. 给 `check:a11y-browser` 加 `forced-colors` 用例，覆盖主题包
3. Playground 首次加载与编译延迟测量
4. 表格 1000 行渲染时间

### 必须人工决策

1. **D-1** `TRUST_PROXY` 的代理层数
2. 是否授权发布 `@zeus-web/dialog`
3. 是否批准版本切换
4. `Release` 环境保护规则与审批人
5. 产品签核
6. 上轮遗留的 16 个未跟踪 RC 文档是否提交

## G. Git 清理

**未执行任何清理。** 理由：

- 本轮创建的 9 个分支全部对应开放 Draft PR，**不是已完成**；
- 其他 agent 的 worktree（`.claude/worktrees/zeus-ai-workbench-p0-3cdc23`）未触碰；
- 3 个 stash 属于其他会话（`other-session-wip-*`、`p11-unrelated-wip`），未 drop；
- 16 个未跟踪的 RC 文档是上一轮产物，未提交也未删除。

## 附：本轮自我纠正

一次：我最初判断「artifactDigest 从未从磁盘重算」，并准备按 P0 报告。读完 `deployment-acceptance.ts:705-775` 后发现 `verifyServedArtifact` 会重新下载每个部署文件、重新哈希、重新汇总。**判断撤回**，#268 的 PR 描述与审计文档都记录了这个过程。

教训：`verifyBuildInfo` 只做「记录之间自洽」，`verifyServedArtifact` 做「记录与字节一致」。只看前者签名会得出错误结论。
