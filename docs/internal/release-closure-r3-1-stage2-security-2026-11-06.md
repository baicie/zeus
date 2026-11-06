# Zeus 0.2.0 Release Closure R3.1 — Stage 2 Security & Immutable Artifacts

日期：2026-11-06

## A. 基线与 PR

- Core main：`a1036a0f25c671b6b0890f72ae2f5b8d6c61d90c`
- UI main：`294431194a50735b62ba38e674fac1af76ae6cfb`
- Draft PR：Core #192，分支 `feat/release-host-deployment`。
- 用户主 checkout 的 `Cargo.toml` 未被修改。

## B. P0/P1 修复

| 级别 | 缺陷                                            | 根因                                    | 修复                                                                                                                                                    |
| ---- | ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0   | Stage 2 workflow_dispatch 输入直接插入 shell    | `"${{ inputs.* }}"` 进入 `run:` 文本    | workflow 只通过 env 传递；CLI 校验 tenant/path/digest/ref；负向测试覆盖 shell 注入、换行、`..`、符号链接、非法 tenant、错误 SHA/digest                  |
| P1   | 本地 Image ID 被当作部署身份                    | Stage 1 只记录 `.Id`                    | Stage 1 导出 OCI tar + sha256；candidate 记录 `sourceCommit`、`artifactDigest`、`localImageId`、`ociSha256`、`ociArchive`；Stage 2 校验后 `docker load` |
| P1   | `stage1.env` 含验收密码且可能上传               | cleanup 未执行/上传清单包含 env         | env 0600，Stage 1 finally 删除；prepare 上传清单只含 candidate/provenance/report/OCI，不含 env                                                          |
| P1   | Stage 2 未区分 Environment gate 与 job-level if | environment vars 在 job-level if 不可用 | 移除 job-level vars 判断；environment 审批 + step 内 gate 变量 + CLI 二次校验                                                                           |
| P1   | 任意 ref 可 dispatch                            | 未限制来源                              | checkout 指定 `expected-core-sha`；shell 先验证 HEAD 与该 SHA 一致且为 origin/main 祖先；CLI 再次校验 manifest commits                                  |
| P1   | Manifest/provenance 可指向任意文件              | 绝对路径输入                            | 只接受 artifact 目录内安全相对路径；拒绝绝对路径、`..`、符号链接；SHA256 先于 JSON 解析                                                                 |
| P1   | AI Host 公开暴露                                | 仅 Origin allowlist                     | 文档标记公开 AI Workbench 为 BLOCKED_BY_SECURITY，要求 ingress 鉴权/限流；Host 不发布公网端口                                                           |
| P2   | 容器资源限制/日志                               | 模板缺失                                | Compose 增加 mem/cpus/read_only/tmpfs/logging                                                                                                           |

## C. Stage 2 安全模拟

在 Core `a1036a0` / UI `2944311` 的真实 Stage 1 证据上运行：

```text
STAGE2_SIMULATED_OK
```

验证内容：artifact 目录边界、manifest/provenance/candidate SHA256、provenance
schema/commit 绑定、OCI 归档 SHA256、tenant 白名单、Environment gate、凭据缺失、
ingress 未验证、main ancestry。`--simulate` 不执行 `docker load` 或部署。

负向测试：`scripts/release/__tests__/deployment-stage2.spec.ts`，覆盖
shell 特殊字符、命令替换、换行、非法 tenant、目录穿越、符号链接、错误 SHA/digest、
缺少 gate/ingress/credentials，全部拒绝。

## D. 不可变镜像链路

`Core/UI Commit → CI Build → OCI tar + SHA256 → Artifact Bundle → Stage 2 验证 → docker load → Compose`

Stage 1 本轮 main 证据：

- playground image `sha256:25b5bb6b...f4a4f0`，OCI `sha256:9befc77c...23df9`
- admin image `sha256:fa9f7976...c8490a`，OCI `sha256:41d77f2a...b0ece4`
- ai-host image `sha256:c29d3c7b...1e595`，OCI `sha256:b37077c0...c8d04e`
- ai-workbench image `sha256:a816712a...edf2ad`，OCI `sha256:78d8c698...096f75f`

Registry 模式保留扩展字段，但本轮未推送任何 Registry。

## E. TLS / Ingress

- `INGRESS_TEMPLATE_READY`：nginx 模板含 TLS/HSTS/CSP/SSE/sandbox origin。
- `INGRESS_DEPLOYED_AND_VERIFIED`：`NOT_RUN`。Stage 2 未执行公网部署。

## F. CI 状态

- Core main `a1036a0`：CI、Native Matrix 7/7、Docs、Canary dry-run PASS。
- PR #192 `085ff2e`：CI PASS；Product Acceptance `42172477019` PASS
  （Linux/Windows/四镜像）；Stage 2 安全修复在此提交。
- PR #192 `319f3a2`（仅把 arm64 macOS runner 从 `macos-14` 改为 `macos-15`）：
  Compiler Native Matrix `42173640297` **7/7 PASS**（含 macOS arm64）；
  Linux/Windows Product Acceptance `42173634683` 与 CI 正在完成。
- macOS arm64 在 `macos-14` 上多次被 Runner 在启动阶段 cancelled；切换
  `macos-15` 后通过，属于 Runner 环境问题，不是源码失败。

## G. 最终裁决

`READY_FOR_R3_MERGE_REVIEW`

P0 命令注入已关闭；Stage 2 只通过 env 接收输入并由 CLI 校验 tenant、路径、
SHA256、main ancestry 与 gate。Stage 2 模拟在真实 main 证据上返回
`STAGE2_SIMULATED_OK`；恶意 tenant 被拒绝且无副作用。Stage 1 已导出 OCI
归档与 SHA256，凭据 env 文件不再上传并在 finally 删除。Native Matrix 在最新
PR 代码上 7/7 通过。

该裁决只授权人工审查是否合并 #192，不授权合并、部署、Tag 或 npm 发布。
