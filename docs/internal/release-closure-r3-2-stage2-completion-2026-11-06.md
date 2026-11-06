# Zeus 0.2.0 Release Closure R3.2 — Stage 2 Completion

日期：2026-11-06

## 1. 基线与 PR

- Core main：`a1036a0f25c671b6b0890f72ae2f5b8d6c61d90c`
- UI main：`294431194a50735b62ba38e674fac1af76ae6cfb`
- Draft PR #192，分支 `feat/release-host-deployment`。
- 用户 `Cargo.toml` 未修改；未合并、未部署、未发布。

## 2. 本轮修复

| 级别 | 缺陷                                        | 修复                                                                                                                                                |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0   | Stage 2 输入进入 shell                      | R3.1 已改 env + CLI；R3.2 继续用纯参数校验                                                                                                          |
| P1   | Candidate 未强制四镜像                      | `validateCandidateIdentity` 强制 playground/admin/aiHost/workbench，拒绝缺失/额外/重复；每项校验 imageDigest、artifactDigest、ociArchive、ociSha256 |
| P1   | 镜像身份未在 load 后核对                    | `verifyLoadedImageIds` 对四个 image 的 `docker image inspect .Id` 与 candidate 比对                                                                 |
| P1   | Manifest/Provenance/Candidate commit 可漂移 | 三者 Core/UI commit 与 expected SHA、pair.json 强制一致                                                                                             |
| P1   | Build-info digest 未与镜像绑定              | candidate image.buildInfo.artifactDigest 与 image.artifactDigest 一致                                                                               |
| P1   | Prepare Run 未独立验证                      | Stage 2 workflow 通过 `gh api` 获取 run/artifacts 元数据；CLI 校验仓库、workflow path、conclusion、head SHA、artifact 未过期与 digest               |
| P1   | 只有 preflight，无本地部署事务              | `--local-integration` 执行 compose up、健康检查、四产品本地验收；失败 finally compose down 并清理 runtime env                                       |
| P1   | 归档名称不准确                              | 文档/字段改为 Docker Image Archive；区分 image ID、archive SHA256、build-info artifact digest、未来 Registry RepoDigest                             |

## 3. 四镜像完整性矩阵

`verifyStage2Artifacts` 现在要求：

- 恰好 `playground`、`admin`、`aiHost`、`workbench` 四项；
- 每项 `ociArchive` 存在于 artifact 目录且非符号链接；
- 每项 `ociSha256` 与文件流式 SHA256 匹配；
- 每个 manifest 产品映射到正确镜像，artifact/image digest 一致；
- provenance 与 manifest/candidate commit 一致；
- 非模拟 load 后四个 image ID 与 candidate 一致。

反例测试 10 组：空 images、缺少 aiHost、额外镜像、错误产品映射、错误 commit、buildInfo digest 不符、归档替换、错误 tenant、路径逃逸、错误 prepare metadata。

## 4. 可信 Prepare Run

- Stage 2 workflow 用 `gh api` 读取 run 与 artifacts 元数据到 artifact 目录；
- CLI 校验 `baicie/zeus`、`host-deployment-prepare.yml`、`completed/success`、head SHA、artifact 未过期与 digest；
- `pair.json` 记录 Core/UI checkout SHA；
- 仍保留 Environment 审批、`ZEUS_HOST_DEPLOY_ENABLED=true`、main ancestry 校验。
- 实际生产部署仍要求先在 main 上产生一次成功的 Prepare Run；本轮没有合并，因此未执行该生产链路。

## 5. Local Integration 与 Rollback

在 Core `a1036a0` / UI `2944311` 的真实 Stage 1 证据上：

```text
STAGE2_LOCAL_INTEGRATION_PASS
```

四镜像 load、Compose up、健康检查、四产品浏览器验收全部通过，容器与 runtime env 清理。
故障注入 `ZEUS_DEPLOY_FAIL_AFTER_UP=true` 后：

- 部署事务抛出失败；
- `docker compose down` 执行；
- 容器清零，runtime env 删除。

未删除数据卷；生产回滚仍需备份卷与旧镜像 digest。

## 6. CI

- PR `319f3a2` Native Matrix `42173640297`：7/7 PASS（macOS arm64 使用 `macos-15`）。
- PR `319f3a2` Product Acceptance `42173634683`：PASS。
- PR `319f3a2` CI：PASS。
- 本轮新提交的 CI 将在推送后重新运行；不得用旧提交结果替代。

## 7. 安全边界

- Ingress：`INGRESS_TEMPLATE_READY`；`INGRESS_DEPLOYED_AND_VERIFIED = NOT_RUN`。
- AI Workbench 公网：`BLOCKED_BY_SECURITY`，直到 ingress 鉴权、限流、租户隔离完成。
- Docker socket 仍为 self-hosted runner 高权限入口；生产 runner 必须专用、隔离、最小权限。
- 不信任用户填写的 commit/SHA；Prepare Run 元数据与 artifact digest 双重校验。

## 8. 仍需人工完成

- 域名/DNS、TLS 证书或 ACME。
- 部署主机、self-hosted `zeus-host` runner、Environment 审批规则。
- 隔离验收账号与租户。
- VoiceOver/NVDA 人工 A11y。
- Release Approval、npm 发布授权。

## 9. 最终裁决

`READY_FOR_R3_MERGE_REVIEW`

P0 已关闭；四镜像 Artifact 完整性、Prepare Run 元数据校验、Local Integration、
Rollback 故障注入与最新 CI 均完成。生产 Stage 2 仍需 main 上的 Prepare Run、
真实 ingress 与部署授权，未在本轮执行。

该裁决只授权人工审查是否合并 #192，不授权合并、公网部署、Tag 或 npm 发布。

## 10. R4 Host Validation 提示词草案

> 接手 Zeus 0.2.0 Release Closure R4。基于合并后的 Core main 与 UI main，
> 确认 Host Deployment Prepare 在 main 上成功并生成 OCI artifact bundle、
> pair.json、provenance.json。配置 GitHub Environment 审批、self-hosted
> zeus-host runner、隔离测试租户、TLS 域名与 Secret Manager；先运行 Stage 2
> preflight 与 local integration，再以审核过的 artifact digest 执行部署；
> 验证 HTTPS/HSTS/CSP/sandbox/SSE，运行在线验收取得 ONLINE_ACCEPTED；完成
> VoiceOver/NVDA 人工验收与 Release Approval。不得伪造证据，不得在未授权前
> 发布 npm/Tag。
