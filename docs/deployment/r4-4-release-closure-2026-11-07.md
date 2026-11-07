# Zeus 0.2.0 R4.4 Release Closure Report

日期：2026-11-07  
产品在线验收：**PLAYGROUND_ONLINE_VALIDATED；四产品 LOCAL_VALIDATED**  
最终状态：**BLOCKED_BY_SECURITY**（代码修复完成，但公网 AI/Admin 凭据仍为旧状态；RC Cut 另有 `BLOCKED_BY_CODE` 门禁）

本轮完成了 Stage 2 事务、Admin 凭据/恢复、AI public replay 隔离的源码修复与真实 Docker
集成；没有部署公网、没有发布 npm、没有创建 Tag、没有修改生产 Caddy/Secrets。

## A. Git Baseline

| 仓库 | 分支                           | Commit    | 状态                  |
| ---- | ------------------------------ | --------- | --------------------- |
| Core | `fix/r4-4-stage2-transaction`  | `6773f56` | Draft PR #199         |
| Core | `fix/r4-4-admin-credentials`   | `4c842fc` | Draft PR #200         |
| Core | `docs/r4-4-rc-readiness`       | `d39398d` | Draft PR #201         |
| Core | `test/r4-4-integration`        | `be1ff75` | 集成/演练分支，不合并 |
| UI   | `fix/r4-4-ai-public-isolation` | `4827f38` | Draft PR #125         |

Core main `e193cf50ad3cbe1d4c14e48584339352c2b75edf`；UI main
`6806700585b1ae33c6e76ba22aae493f91124014`。两个 main 在本轮开始与结束均未漂移。Stage 1 候选由 Core `16f8369` + UI `4827f38` 构建；其后 Core 分支上的提交只修改部署脚本/测试工作流，不修改已构建的产品源码（Admin/Playground/AI Host/Workbench），因此镜像内容对应当前 PR 的产品代码。

## B. Findings 与修复

### P0

| ID            | 问题                                                                                 | 修复                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| S2-P0-01      | Stage 2 成功后无条件 `compose down`，四服务被停止                                    | 成功路径不再 down；生产失败显式回滚；local 使用独立项目并清理自己的资源                                                               |
| S2-P0-02      | 失败没有旧镜像/数据快照与回滚                                                        | 新增事务状态机：快照旧容器、SQLite 备份、受控替换、失败恢复旧容器+数据库并复验                                                        |
| S2-P0-03      | Stage 1 `down -v` 可删除持久卷                                                       | Stage 1 使用独立项目 `zeus-stage1-local`，数据改为临时 bind 目录，cleanup 不再依赖共享卷                                              |
| S2-P0-04      | Compose 路径未注入且未校验                                                           | workflow 明确注入；CLI 只接受仓库 `deploy/` 内 realpath、普通文件、非符号链接、非 artifact，并记录 SHA256                             |
| S2-P0-05/06   | 把 Stage 1 的 `127.0.0.1` manifest 当作 online manifest；environment 不参与绑定      | 新增 `production.layout.json`，从 layout+candidate 生成 formal online manifest，绑定真实 URL/8443/sandboxUrl/provenance/双 SHA/digest |
| S2-P0-07/08   | 可变 tag 部署；load 在快照之前                                                       | 按不可变 image ID 部署；先在快照之后 load，再校验 tag→ID；回滚按旧容器 image ID                                                       |
| S2-P0-09      | Sandbox 旧 P0 无强制回归                                                             | online manifest 强制 sandboxUrl；sandbox CSP/frame-ancestors/opaque 检查保留；Playground online 三引擎负向 PASS                       |
| AI-ISO-01/02  | 公网 viewer 可 `message.send`；共享 reference 流可被任意访客读写；任意 streamId 可读 | publicReplay 传输层只读守卫；seed version 重置旧事件/命令/工作区；stream allowlist + cursor 校验                                      |
| ADMIN-CRED-01 | 缺失备份被验证为 OK，可覆盖生产库                                                    | 路径必须存在/普通文件、只读打开、完整 schema 校验；恢复先 pre-restore 备份、临时文件 fsync、原子 rename                               |
| ADMIN-CRED-02 | 验收密码被当作生产 Admin 和 viewer 密码                                              | 生产凭据来自 0600 secrets 文件；验收使用独立 viewer + TTL；Stage 2 强制 pairwise 不同                                                 |

### P1（已修复）

- Admin 空库显式 bootstrap、已有库管理员不匹配 fail closed、demo seeding opt-in、非 active 不可登录。
- 验收账号结束后删除并从 runtime env 移除，Admin 容器重建，重启不能再次 seed。
- Admin 备份/恢复真实演练纳入 Stage 2 回滚；`admin-db restore` 只允许 `--isolated`。
- Stage 2 主机锁、重复部署幂等、端口/Caddy/Admin DB 预检、部署报告、故障注入仅 local。
- AI 未知命令 fail-open、Origin 空 allowlist 回退 `*`、per-IP 限流/SSE 上限、旧访客 workspace 文件清理。
- 在线验收重算 build-info 每个文件的 sha256/bytes 和 artifact digest；AI 只读探针；Admin CSRF/viewer 403/Secure cookie 断言。
- Stage 1 可为 production 构建烘焙公网 sandbox URL 的镜像（`--skip-acceptance`，由 Stage 2 online 验收把关）。

### P2（记录，未全部关闭）

- `docker save` 归档仍命名为 `ociArchive/ociSha256`，实际是 Docker archive + tar 哈希；RC 前应拆分 `archiveSha256`/`ociManifestDigest`。
- AI Host 的 build-info 由 OCI labels 生成；尚无 `/build-info.json` 端点。
- 零停机蓝绿需要 ingress 层流量切换；本轮为受控替换，失败回滚已真实演练。
- RC-08..RC-16 见 RC Cut Plan。

## C. Stage 2 事务

实现位于 `scripts/release/deployment-transaction.ts`，顺序：

1. 主机锁 + 状态目录（0700，禁止在 artifact 内）。
2. 校验 Compose/layout/secrets/artifact/provenance/prepare run。
3. 快照旧容器（image ID、health、mount、非敏感 env）与旧 build-info。
4. 端口占用、Caddy upstream、Admin/AI SQLite quick_check/管理员预检。
5. 加载镜像并校验 tag→image ID（唯一项目名，避免 down 误删旧容器）。
6. `VACUUM INTO` 备份 Admin/AI SQLite 到 bind data 目录，复制到备份目录，容器内 `quick_check` + 独立容器复验 SHA256。
7. 重命名并停止旧容器 → `compose up --wait` → 真实 HTTP health。
8. Chrome 四产品验收，写 `deployment-acceptance.json`。
9. 删除验收账号、从 runtime env 移除验收凭据、只重建 Admin、再等 health。
10. 成功：保留服务并写 `deployment-state.json`/`deployment-transaction.json`；local 按需清理。
11. 失败：`compose down` 只清理本次唯一项目 → 恢复 Admin/AI 备份 → 重命名/启动旧容器 → health + build-info 复验 → `ROLLED_BACK`；回滚失败为 `ROLLBACK_FAILED`。

### 真实 Docker 集成

- Stage 1：Run [42377031815](https://github.com/baicie/zeus/actions/runs/42377031815) SUCCESS，
  四产品 `LOCAL_VALIDATED`；Core `16f8369...`，UI `4827f38...`，tree
  `3def2345...`；artifact `host-deployment-stage1` ID `13576960124`，digest
  `sha256:b3255153d4d5c4dee5c9219b2918c973024de118d0bc32b14975b699c7c8c49b`。
- Stage 2 本地成功事务：`PASS`，四产品 `LOCAL_VALIDATED`；image IDs：
  Playground `sha256:f7eba578...`、Admin `sha256:8d2c3818...`、AI Host
  `sha256:ef289498...`、Workbench `sha256:7324e71e...`；部署报告见
  `docs/deployment/evidence/r4-4/stage2-success.json` 与 `stage2-acceptance.json`。
- 回滚演练（Run [42380174256](https://github.com/baicie/zeus/actions/runs/42380174256)）：SUCCESS。
  `after-acceptance` 故障注入后 `ROLLED_BACK`；Admin 备份
  `sha256:a57e35c5...`、AI 备份 `sha256:79395320...`，两者 `quick_check=ok`；四个旧容器
  全部恢复，`rollback.health=PASS`、`rollback.buildInfoVerified=true`；回滚后四产品
  health 再次通过。证据 `docs/deployment/evidence/r4-4/stage2-rollback.json`。

## D. AI 公网隔离攻击矩阵

`examples/ai-host/__tests__/public-replay.spec.ts`（23 tests PASS，真实 HTTP+SSE）：

| 用例                              | 结果                                              |
| --------------------------------- | ------------------------------------------------- |
| viewer `message.send`             | 403 `AI_HOST_PUBLIC_REPLAY_READ_ONLY`，事件数不变 |
| A/B 消息不可见                    | 双方写入均 403，snapshot/SSE 无 A marker          |
| A/B snapshot/SSE                  | 只返回 preset reference；任意 `streamId` 404      |
| viewer propose / approve          | 403                                               |
| editor/admin upload/test-report   | 403                                               |
| 无 token                          | 401                                               |
| 无 Origin + 有效 token            | 读 200（Origin 不是认证）                         |
| 跨租户                            | 403/404；各自 tenant seed                         |
| replay provider                   | mock host，无真实 Provider                        |
| 旧可写部署遗留消息/workspace 文件 | seed version 重置后不可见                         |
| 非法 cursor                       | 400                                               |
| 未知命令 type（可写模式）         | 400，不再 fail-open                               |

**线上仍为旧镜像**：`https://ai.moonbyte.top:8443/ai-host/health` 返回
`{"ok":true,"workspace":"reference"}`，没有 `publicReplay/readOnly` 字段；R4.3 已实测
viewer `message.send` 200。该修复只在 Draft PR #125，未部署；因此公网 AI 仍为
**BLOCKED_BY_SECURITY**。

## E. Admin

- `pnpm exec vitest run examples/admin/server/__tests__`：22 tests PASS（Session/CSRF/
  Cookie/角色/限流/备份恢复/损坏拒绝/acceptance TTL）。
- 生产 Admin 当前仍运行 R4.3 镜像；`/api/auth/session` 401、HSTS/CSP 正常。
- 生产 `.env` 由 R4.3 生成，Admin 与 viewer 密码相同；新 Stage 2 会在部署前
  `assertCredentialSeparation` 直接 BLOCKED，不会自动重置。轮换需单独授权。
- 生产数据库未做破坏性恢复；恢复演练只在隔离数据目录/容器中进行。

## F. Playground UX / P0

- 线上三引擎（Chromium 156 / Firefox 157 / WebKit 27.2）：
  `PLAYGROUND_ONLINE_VALIDATED`；`native=true webc=true direct=true thirdParty=true`。
- host CSP `frame-src https://panel.moonbyte.top:8443`、sandbox CSP
  `sandbox allow-scripts; frame-ancestors https://playground.moonbyte.top:8443`、HSTS 均通过；
  build-info `sha256:02000c9d...` 17 个文件。
- 证据：`docs/deployment/evidence/r4-4/playground-online.json`。
- 本地 Stage 2 验收再次验证 Native/WebC 预览、sandbox opaque、四产品页面。

## G. 四产品状态

| 产品                     | 本地 Stage 1    | Stage 2 本地事务        | 公网                                |
| ------------------------ | --------------- | ----------------------- | ----------------------------------- |
| Playground (Native/WebC) | LOCAL_VALIDATED | LOCAL_VALIDATED         | ONLINE 三引擎 PASS（R4.3 镜像未变） |
| Admin                    | LOCAL_VALIDATED | LOCAL_VALIDATED         | R4.3 在线 PASS；新镜像未部署        |
| AI Host                  | LOCAL_VALIDATED | LOCAL_VALIDATED（只读） | 旧镜像，仍可写，BLOCKED             |
| AI Workbench             | LOCAL_VALIDATED | LOCAL_VALIDATED（只读） | 旧镜像，仍显示可写 UI，BLOCKED      |

## H. RC Cut

完整计划见 `docs/release/0.2.0-rc-cut-plan.md`。结论：

- Core 29 包 `0.1.1-beta.20` → `0.2.0-rc.0`；UI `0.1.0-beta.35` → `0.2.0-rc.0`；UI 精确 pin 需在 Core RC 后对齐。
- RC-01（P0）：release workflow 不提供 HEAD 绑定 evidence，tag precheck 必失败。
- RC-02..RC-07（P1）：本地 release 脏工作区、两个公开包未入发布组、模板旧 pin、Core/UI 无联合门禁、evidence 接受手写 URL、`latest` 指向 prerelease。
- 因此 RC Cut 仍为 **BLOCKED_BY_CODE**。

## I. 剩余阻塞

1. **BLOCKED_BY_SECURITY**：公网 AI 旧镜像仍允许 viewer 写；Admin 生产 admin/viewer 密码复用；SSH 密码暴露未轮换（用户此前明确“暂不轮换”）。
2. **BLOCKED_BY_CODE**：RC-01..RC-07。
3. 人工 A11y（VoiceOver/NVDA）、200% Zoom、DataGrid、Shadow DOM、AI SSE 播报、移动端：全部 `NOT_RUN`。
4. 联合发布审批、npm publish、dist-tag、正式 Tag：未授权、未执行。

## J. 下一轮提示词（R5 Release Candidate）

```text
Zeus 0.2.0 R5 — Release Candidate Cut。目标：在 R4.4 已修复的部署事务/Admin/AI 基础上，
取得明确的生产变更授权，完成以下收口：
1. 轮换生产 Admin viewer 密码与 SSH 凭据（用户授权后），更新本地受管凭据；
2. 部署 AI public replay 修复到 ai.moonbyte.top（先 staging 后生产），三引擎验证
   message.send/propose/approve/upload 全部 403，旧访客消息/工作区不可见；
3. 用 Stage 2 事务部署四产品，保留旧容器与 SQLite 备份，执行失败回滚演练；
4. 关闭 RC-01..RC-07：release workflow 消费真实 deployment-acceptance evidence，
   两个公开包入发布组或显式忽略，模板/packed consumer 绑定候选版本，增加 Core/UI
   joint gate 与 latest dist-tag 策略；
5. 完成 VoiceOver/NVDA、键盘、200% Zoom、DataGrid、Shadow DOM、AI SSE、移动端人工验收；
6. 仅在所有 P0/P1、人工验收、联合审批通过后，申请 npm publish / rc dist-tag / Tag。
不得跳过安全检查；不得用模拟结果替代真实在线验收；不得直接修改 main。
```

## K. 最终状态

**BLOCKED_BY_SECURITY**。代码侧 P0/P1 已修复并有真实 Docker 集成/回滚证据，但公网旧
AI 仍可写、生产 Admin 凭据仍复用、SSH 凭据未轮换；RC Cut 另有 P0 流水线门禁。
