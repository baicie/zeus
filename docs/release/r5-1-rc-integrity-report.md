# Zeus 0.2.0 — R5.1 Release Integrity & RC Cut Preflight 报告

- 日期：2026-11-08
- 阶段：R5.1
- 结论：**BLOCKED_BY_ENVIRONMENT**（代码侧门禁已关闭；线上验收、人工审批与 npm 授权未执行）

## 1. 基线

| 仓库 | 分支   | HEAD                                       |
| ---- | ------ | ------------------------------------------ |
| Core | `main` | `fdeb87be04c4f9d777c790a74821922892d7b5cf` |
| UI   | `main` | `c3714eda374c10dea2c7b6c6968d7a863b374e21` |

本轮从上述基线创建独立 worktree，未修改用户主工作区（`Cargo.toml` 改动保留）。

## 2. PR 清单

| PR                                              | 分支                               | 范围                                              | 状态   |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------- | ------ |
| [#213](https://github.com/baicie/zeus/pull/213) | `fix/r51-rc-evidence-authenticity` | Phase A：审批与跨平台证据真实性                   | 已合并 |
| [#214](https://github.com/baicie/zeus/pull/214) | `fix/r51-deployment-recovery`      | Phase E：Stage 2 Workspace 回滚事务               | 已合并 |
| [#216](https://github.com/baicie/zeus/pull/216) | `fix/r51-framework-p2`             | Phase F：keyed reorder / Trusted HTML / 断连重连  | 已合并 |
| [#217](https://github.com/baicie/zeus/pull/217) | `feat/r51-rc-rehearsal`            | Phase D：离线 0.2.0-rc.0 预演                     | 已合并 |
| [#219](https://github.com/baicie/zeus/pull/219) | `fix/r51-release-tag-pairing`      | Phase B/C：dist-tag fail-closed、Core/UI SHA 绑定 | 已合并 |
| [#218](https://github.com/baicie/zeus/pull/218) | `docs/r51-rc-integrity-report`     | 本报告                                            | 本 PR  |

原 #215 在 #213 合并、base 分支被删除后自动关闭且无法重新打开，B/C 改动 rebase 到 `main` 后以 #219 重新提交并合并。

合并顺序：`#213` → `#214` → `#216` → `#217` → `#219` → `#218`。全部使用 squash merge，未启用 Auto Merge，未创建 Git Tag。

## 3. 本轮实际审查的源码

- `scripts/release/assemble-rc-evidence.ts`
- `scripts/check/rc-readiness.ts`
- `.github/workflows/release.yml`
- `.github/workflows/host-deployment-stage2.yml`
- `scripts/release/check-latest-tags.ts`
- `scripts/release/repair-latest-tags.ts`
- `scripts/release/verify-dist-tags.ts`
- `.github/workflows/repair-dist-tags.yml`
- `scripts/check/check-ui-pairing.ts`
- `scripts/release/deployment-transaction.ts`
- 相关单测与 CI workflow

## 4. Findings

### P0 / P1

| ID  | 级别 | 问题                                                   | 关闭情况                                                                 |
| --- | ---- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| A1  | P1   | `validateReleaseApproval()` 接受 `approver: "NOT_RUN"` | 已修复：`zeus.rc-approval/v2` 结构化契约，approver 必须是授权对象        |
| A2  | P1   | `crossPlatform.report` 非空即 PASS                     | 已修复：`zeus.cross-platform-evidence/v1` 校验真实 job/artifact/测试类型 |
| A3  | P1   | Release 信任任意 `rc-approval` artifact，无来源校验    | 已修复：新增受保护审批 workflow + run 元数据校验 + Sigstore attestation  |
| B1  | P1   | Registry 查询错误被当作 latest absent                  | 已修复：显式状态 + 有界重试 + fail closed                                |
| B2  | P1   | 从根 `package.json` 判断是否 RC                        | 已修复：`--version` / tag / `@zeus-js/zeus` 一致性校验                   |
| C1  | P1   | UI 只校验版本，不校验 commit                           | 已修复：批准 SHA checkout + `--require-commit` + source tree SHA 证据    |
| E1  | P1   | `chown` 失败后旧 Workspace 不再活动                    | 已修复：prepare → chown/验证 → 受检切换 → 验证 → 清理                    |

### P2

| ID  | 问题                                                                                      | 结论                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| F1  | keyed 列表 fixed-slot 快路径使用陈旧 `records`，重入更新后节点/键串位，缩短列表时越界读取 | 已修复（`list.ts` 快照 `fixedSlotRecords`），失败用例 + 守护测试              |
| F2  | `web-c-runtime` 的 `render()` 把字符串直接写入 `innerHTML`                                | 已修复：字符串按 text node 插入，Node/Node[] 是唯一可信通道；XSS 失败用例转绿 |
| F3  | 断连期间新增/删除的 light DOM 子节点在重连后被丢弃/复活                                   | 已修复：重连重新捕获 `childNodes`，`clearContainer` 重新挂回被埋节点          |

F1 的纯 reorder、index accessor、节点身份与 reorder 后 scope 清理经 fuzz 与守护测试确认无缺陷；F3 的响应式 root 重建与事件监听重复绑定经守护测试确认无缺陷。

## 5. 审批伪造负向测试

`scripts/release/__tests__/rc-approval.spec.ts`、`assemble-rc-evidence.spec.ts`、`rc-readiness.spec.ts` 覆盖：

- `NOT_RUN` / `PENDING` / 空审批
- 伪造 approver（不在授权列表、run actor 不匹配）
- 错误 Core SHA、错误 UI SHA
- 审批过期、TTL 超限、未来时间
- 错误 workflow path、错误 run id、错误 environment
- 篡改 payload artifact digest
- attestation 未验证 / signer workflow 错误
- approval SHA 正确但 evidence digest 不同
- Linux PASS + Windows NOT_RUN
- 本地 deployment report 冒充 online
- 旧 deployment evidence（接受超出 max age）

结果：**299 tests / 37 files 通过**（Phase A 分支）。

## 6. Registry 故障负向测试

`latest-tag-rehearsal.spec.ts` 使用独立进程的真实 HTTP mock registry + 真实 `npm view`：

- 31 个固定组包分类
- 未发布包（404）→ `LATEST_ABSENT`，不重试
- 503 全故障 → `REGISTRY_QUERY_FAILED`
- 500 部分故障 → 阻塞而不是 absent
- 前两次失败后成功 → 有界重试恢复
- 超时 / 5xx / DNS / 鉴权 / 非法 JSON → fail closed

结果：**5/5 通过（约 48s）**；Phases B/C 分支全量 **38 files / 325 tests 通过**。

## 7. Core/UI SHA 绑定测试

`check-ui-pairing.spec.ts` 使用真实 git 仓库 fixture：

- 同版本不同 commit → 失败
- 同 commit 错版本 → 失败
- 短 SHA / 缺失批准 commit → 失败
- dirty checkout → 失败
- 错误 Core pin → 失败
- 正确 SHA + 版本 → 通过并记录 `uiSourceTreeSha`

Release workflow 只按审批文档中的 40 位 SHA checkout，不再使用 `ZEUS_UI_REF` 作为正式发布身份。

## 8. Stage 2 回滚故障注入

见 PR #214。真实 Docker 故障注入 22 条全部通过（本次独立复核 192s）：

- tar 损坏、SHA256 错误、路径穿越、符号链接逃逸
- 只读挂载、chown 失败、mv 失败
- 写入容量失败（ulimit -f → EFBIG/SIGXFSZ）
- 解包后 / mv 之间 / 切换后中断（exit 137）
- 真实 `docker kill`
- 切换后校验失败 + 回滚
- DB 恢复成功 + Workspace 失败的部分恢复报告

每条均验证旧目录 SHA256 一致、活动目录状态明确。

无法稳定模拟：字面 ENOSPC（Docker Desktop overlayfs 限制）、测试镜像缺少 `node:sqlite` 的真实 DB 恢复。已在 PR 与文档中说明。

## 9. 离线 RC 预演与 32 包矩阵

见 PR #217 与 `docs/release/r5-1-rc-rehearsal-report.md`。

预演 HEAD `b8322e7`，目标版本 `0.2.0-rc.0`，17/17 步 PASS，无 FAIL/SKIPPED：

| 步骤                                                | 真实结果                                          |
| --------------------------------------------------- | ------------------------------------------------- |
| version-rewrite                                     | 37 文件 / 46 处编辑                               |
| ui-pin-sync                                         | 1 文件（`@zeus-web/button` beta.34 → beta.35）    |
| install / build / build-dts                         | 14.8s / 31.2s / 6.5s                              |
| check-package-versions / check-create-zeus-versions | PASS                                              |
| candidate-prepare                                   | 50.1s                                             |
| ui-install / ui-build-button                        | 82.7s / 7.4s                                      |
| candidate-matrix                                    | 42.3s                                             |
| tarball-validation                                  | **32/32**，版本全部 `0.2.0-rc.0`，sha256 复算匹配 |
| restore / verify-clean                              | PASS，工作区干净                                  |

32 包 = 31 个 `zeusFixedPackages` + `@zeus-js/vite-plugin`。版本统一性由 `check-package-versions` 与模板安装版本断言共同验证。

限制：仅 darwin/arm64；其他平台 native 包无二进制；非 Zeus 依赖仍走 registry；未验证 provenance / dist-tag / 发布回读。

## 10. Create Zeus 六模板与 Linux/Windows

六模板全部从隔离 tarball 安装并执行 `tsc` + `vite build`（带 test 的模板执行 vitest）：

- `basic-ts`
- `application-ts`
- `admin-ts`
- `web-component-ts`
- `component-library-ts`（`@zeus-js/zeus@0.2.0-rc.0`）
- `webc-consumer-ts`（`@zeus-web/button@0.1.0-beta.35`）

配对 UI：`baicie/zeus-ui@c3714eda374c10dea2c7b6c6968d7a863b374e21`，`--require-pin-match` 通过。

Linux/Windows：本轮 PR 的 CI 配置了 `create-zeus-candidates` 双平台矩阵与 `cross-platform-evidence` 收集 job；提交报告时 CI 仍在运行（无失败项），本报告不把未完成的运行计为 PASS。上一轮 RC-04 的 Linux/Windows 六模板结果为通过，但那不替代本轮证据。

## 11. Release Workflow 离线预演

已覆盖：

- 正常 RC 证据装配（valid approval + cross-platform + deployment）
- 缺审批 / 错误审批 / 错误 SHA / 错误 run / 错误 environment / 篡改 artifact / attestation 失败
- latest 指向 prerelease
- Registry 查询失败
- 重试后成功

未覆盖（**BLOCKED_BY_ENVIRONMENT**）：

- 真实 GitHub Actions 端到端（需要 Release environment、attestation 权限、真实 run）
- 真实 npm publish 的部分失败 / 重试（需要隔离 npm registry 与发布凭据）
- 缺 Native 包的完整发布链路（需要先跑 `compiler-native` 矩阵）
- 重复运行/部分发布失败（需要隔离 registry 与 stub 发布器）

因此本轮不把 D4 标记为完整通过。

## 12. 在线 / 人工 / 授权阻塞

- 四产品最新 SHA 的在线验收：未执行（无生产授权）
- VoiceOver + Safari、NVDA + Chrome/Firefox、键盘、200% zoom、移动端：未执行（人工）
- RC 审批：需要配置 `Release` environment required reviewers 与 `ZEUS_RC_APPROVERS`
- npm dist-tag 修复：需要 `NPM_TOKEN` dist-tag 权限，未执行任何写操作
- 正式 npm publish / Git Tag / GitHub Release：未授权，未执行

## 13. 下一轮 R5.2 提示词

```text
Zeus 0.2.0 — R5.2 Workflow Integration & RC Evidence Execution

目标：把 R5.1 已验证的脚本门禁提升为真实 GitHub Actions 端到端证据，并完成 RC 放行所需的线上与人工证据。

必须完成：
1. 配置 Release environment 的 required reviewers 与 ZEUS_RC_APPROVERS，真实运行一次 RC Approval（不发布）。
2. 用真实 CI run 生成 cross-platform evidence，运行 RC Approval，下载 rc-approval artifact，在本地/受控 runner 执行 verify-rc-approval + assemble-rc-evidence + check:rc-readiness。
3. 对 Release Workflow 做受控端到端预演：使用隔离 registry（Verdaccio 或等价）与 stub npm，覆盖正常 RC、缺审批、错误 UI SHA、latest prerelease、registry 故障、部分包失败、重试成功、重复运行。
4. 部署最新 Core/UI SHA 到受控环境，执行四产品 ONLINE_ACCEPTED；AI 保持只读 public replay。
5. 人工 A11y：VoiceOver + Safari、NVDA + Chrome/Firefox、键盘导航、200% zoom、移动端；证据模板不得代填。
6. 只读执行 repair:latest-tags --check，确认 13 个 prerelease latest 的计划；写操作仍需独立授权。

禁止：未经授权 merge main、Auto Merge、Release Tag、npm publish/dist-tag 写操作、生产部署/重启、修改 Caddy/Cloudflare/DNS/生产 Secrets/数据库。

交付：docs/release/r5-2-execution-report.md，结论只能取 READY_FOR_RC_CUT_REVIEW / BLOCKED_BY_CODE / BLOCKED_BY_SECURITY / BLOCKED_BY_CI / BLOCKED_BY_ENVIRONMENT。
```

## 14. 最终结论

**BLOCKED_BY_ENVIRONMENT**。

代码侧 A/B/C/D/E/F 均已实现并有真实测试：

- A：审批与跨平台证据结构化、attestation 校验，306 tests 通过。
- B/C：dist-tag fail-closed、隔离 registry 演练、UI SHA/版本绑定，rebase 到 main 后 361 tests 通过。
- D：0.2.0-rc.0 离线预演 17/17 步，32/32 tarball，六模板通过。
- E：Stage 2 回滚真实 Docker 故障注入 22/22 通过。
- F：三项框架缺陷修复，499 tests 通过。

这些改动已全部 squash merge 到 `main`，`main` CI 通过后构成本轮代码基线。

但 RC 放行仍需要线上验收、人工 A11y、Release environment 审批与 npm 授权；真实 GitHub Actions 端到端预演与 npm 写操作未执行。合并代码不等于 `RC_READY`，本轮不宣布 `RC_READY`。
