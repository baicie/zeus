# Zeus 0.2.0 — R4.1 Final Closure / R4.2 Security 最终报告

日期：2026-11-06

## 1. Git / PR

| 项                   | 值                                                              |
| -------------------- | --------------------------------------------------------------- |
| Core main            | `310891161d28bf2fed57f20fc457000338c6a206`（#193 merge commit） |
| Core main tree       | `962ed3efecc288522caf94fe065fc0eb905cfcb5`                      |
| Core R4.1 PR         | https://github.com/baicie/zeus/pull/193（已合并）               |
| Core R4.2 Admin HEAD | `629b4eabd67a06b87d121f9b1025c8f9b13ec2b4`                      |
| Core Admin PR        | https://github.com/baicie/zeus/pull/194（Draft）                |
| UI main              | `294431194a50735b62ba38e674fac1af76ae6cfb`                      |
| UI R4.2 AI HEAD      | `b9eafa91df3240694e8be4348377ae0eab9a8a7a`                      |
| UI AI PR             | https://github.com/baicie/zeus-ui/pull/123（Draft）             |

## 2. 阶段裁决

- Playground：**PLAYGROUND_ONLINE_VALIDATED**。#193 已合并为 main
  `31089116`；已从干净 main 重建并上线 `zeus-playground:deploy-main-r41`，
  build-info/label/sourceTree 与三浏览器在线验收全部通过。
- Admin：**ADMIN_SECURITY_READY**，已部署到独立域名
  `https://admin.moonbyte.top:8443`（登录、Secure Cookie、HSTS 实测）。
- AI Host/Workbench：**AI_HOST_SECURITY_READY**，已部署到
  `https://ai.moonbyte.top:8443`，公网为 viewer-only 只读演示；Host 无公网端口。
- 四产品：**NOT_READY**（没有完整的四产品在线验收 manifest；Admin/AI 公网仅完成独立域名 Host Validation）。
- 总体：**READY_FOR_R4_HOST_VALIDATION_REVIEW**。Playground provenance 已
  从正式 main 重建关闭；Admin/AI 已部署独立域名并通过 Host Validation，
  但镜像来自 Draft PR 分支，四产品门禁没有伪造 ONLINE_ACCEPTED。

## 3. #193 CI / API Snapshot

- 失败原因：新增 Sandbox URL/parent-origin 公共 API 未更新
  `docs/api/snapshots/playground-engine.main.api.md`。
- 已用仓库生成器 `pnpm api:snapshot` 生成并提交快照；新增接口有公开注释、
  README、单元测试和类型检查。未跳过 API Check。
- 最终 HEAD `9513098` CI 23 项全部 SUCCESS（Compiler Native Matrix、build、
  test、packed-consumers、docs-build 等）。

## 4. Provenance 事故与纠正

- 部署镜像 `zeus-playground:deploy-r41b` 在 #193 commit 之前从工作树构建；
  Docker build args/标签使用了旧 main `7a14a9c`，但实际产品源码是 R4.1
  修改（后来提交为 `11021a4`，tree `344ee5`）。
- 清洁源码重建验证：从 `11021a4` 以相同环境重建 Host/Sandbox，产物
  digest 与线上完全一致：
  - Host `sha256:8dbf32d5...b99456`
  - Sandbox `sha256:f529bc36...806679`
- 已给 build-info 增加 `sourceTree`，Stage 1 从干净工作树传递
  `ZEUS_SOURCE_TREE`，并让在线验收在 build-info 带 sourceTree 时校验。
- 维护者授权后 #193 已合并为 main `31089116`，并从干净 tree `962ed3e`
  重建上线：镜像 `zeus-playground:deploy-main-r41`，Host digest
  `sha256:218e2eeb...7de4`，Sandbox digest `sha256:51232ef4...9a54`；
  build-info 与 label 已写入 main commit/sourceTree。在线验收重新通过。

## 5. Playground P0 事故影响评估

- 暴露窗口：首条 Sandbox 请求 `2026-11-06T09:13:49Z`；HTTP CSP
  `sandbox allow-scripts` 于 `12:18:24Z` 上线，窗口约 3h05m。
- 日志：窗口内 542 条 Sandbox 请求（516×200、17×302、9×404），记录的
  来源地址只有 1 个，User-Agent 为本地测试浏览器/curl/验收器，Referer
  为空或本地攻击复现页面。未观察到外部第三方嵌入；但这不等于证明未利用。
- 影响：攻破时可在 Panel Origin 读取该 Origin 的 Cookie/LocalStorage 并
  发起同源请求。没有证据支持“已发生数据泄露”；不要据此宣称已被利用。
- 建议：保留当前 CSP + opaque 代码门；若 Panel 存在非 HttpOnly token 或
  长期 LocalStorage 凭据，等待授权后轮换/撤销。
- 回滚约束：禁止回滚到无 CSP 旧镜像；回滚后必须复验直接访问 opaque、
  第三方无 sandbox 嵌入失败，并确认 Panel 业务正常。

## 6. Admin Security Matrix

| 项目                                  | 结果                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| Secure/HttpOnly/SameSite Cookie       | 已实现；生产 Secure，不信任 X-Forwarded-Proto                      |
| CSRF                                  | 登录签发 CSRF cookie；所有写请求要求 X-CSRF-Token；缺失/错误 403   |
| Session 轮换 / 登出 / 过期 / 角色撤销 | 全部测试通过                                                       |
| 登录限流 / 锁定 / 恢复                | per-IP + per-account；有界；伪造 XFF 不绕过                        |
| 防账号枚举                            | unknown email dummy scrypt；错误脱敏                               |
| RBAC / viewer 403 / 401               | 真实 HTTP + 三浏览器                                               |
| 隔离验收 / demo 数据                  | 临时 DB，`demoUsers:false` 只引导管理员                            |
| SQLite 备份/恢复/损坏保护             | VACUUM INTO + quick_check + CLI；实际 backup→verify→restore→verify |
| 网络                                  | Compose 仅 127.0.0.1:8080；TLS 在受信 ingress                      |

测试：Admin server 3 files / **16 tests passed**；Chromium/Firefox/WebKit
浏览器门禁全部通过。Docker 镜像 `zeus-admin:r42` 构建成功，容器
`127.0.0.1:18087` healthy；容器内 Secure/HttpOnly/SameSite Cookie、viewer
403 和 Admin UI 登录通过。公网 `https://admin.moonbyte.top:8443` 已部署并
实测登录、Secure/HttpOnly/SameSite Cookie、HSTS；viewer 公网登录未建测试
账号，viewer 403 由本地 HTTP/三浏览器覆盖。

## 7. AI Security Matrix

| 项目                            | 结果                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Bearer 认证（无 Origin 也认证） | 无 token 401；带 token + 无 Origin 200                                       |
| Tenant/user/role 绑定           | 跨 tenant workspace/stream/asset/approval 401/403/404                        |
| Approval ID                     | 随机 UUID；可预测 `approval-1` 404                                           |
| 自批 / 角色                     | 非 replay 自批拒绝；approver/admin only；viewer 403                          |
| 一次性 / 重放 / 持久化          | 重复 409；审批 journal 重启可恢复                                            |
| 多租户隔离                      | 独立 SQLite、workspace、conversation、asset、SSE clients                     |
| 资源上限                        | 请求 120/min/user、asset 数量/大小/TTL、SSE 每 tenant 上限、tool timeout     |
| Replay / Live                   | 默认 replay；live 无 provider 全部 503 fail closed                           |
| Ingress                         | Workbench nginx 服务端注入 Bearer token；Host 无公网端口；Workbench loopback |

测试：AI Host **13 tests passed**；Chromium/Firefox/WebKit Workbench E2E
全部通过（chat、SSE、approval、workspace write）。Docker 镜像
`zeus-ai-host:r42` / `zeus-ai-workbench:r42` 构建成功；容器栈用 nginx 服务端
注入 Bearer Token，浏览器不带 Token 完成 SSE/审批/workspace 写入，Host
无公网端口。公网 `https://ai.moonbyte.top:8443` 已部署，但只注入
viewer token：chat/SSE 可用，propose/approval 403，workspace 保持为空；
完整审批/写入演示仅限本地 admin-token 栈。长时间 SSE 资源耗尽仍为 **NOT_RUN**。

## 8. 未完成 / 阻塞

- #193 已合并；最终证据 PR（branch `codex/r4-1-main-provenance`）待 review/merge。
- Admin #194 与 AI #123 仍是 Draft；当前公网镜像是从 PR 分支构建，合并后
  应从 main 重建。AI 公网只注入 viewer token，不能匿名写 workspace/审批。
- 四产品 `FOUR_PRODUCTS_ONLINE_ACCEPTED` 未达成，不得因本地测试通过而标记。
- 8443 无 HSTS；证书 2027-02-03 到期，自动续期仍未配置；属于 Host
  Validation 前必须处理的运维项。
- 容器内持久卷恢复演练未执行；Admin/AI 真实 8443/TLS ingress 未执行。

## 8.1 独立域名公网验证

| 域名 | 结果 |
| --- | --- |
| `https://admin.moonbyte.top:8443` | HTTP 200；登录、Secure/HttpOnly/SameSite Cookie、HSTS 通过；仅引导管理员 |
| `https://ai.moonbyte.top:8443` | Workbench 200；viewer token 服务端注入；workspace 200、message 200、propose 403、无 workspace 写入 |

Cloudflare DNS-only A 记录已创建；Let's Encrypt 证书 SAN 覆盖两个域名，有效期
至 2027-02-04；acme.sh cron 与 Caddy reload hook 已配置。

## 9. R4 正式 Host Validation 提示词草案

> **Zeus 0.2.0 — R4 Host Validation**
>
> 前置：维护者 review 并授权合并 #193、#194、#123；从各自正式 main merge
> commit 重新构建，不允许使用 PR 分支或脏工作树产物。先关闭 Playground
> provenance：从 main 重建 Host/Sandbox、build-info、镜像 label，执行
> 8443 在线验收与 P0 回归后再更新线上标签；禁止回滚到无 CSP 镜像。
>
> Playground：三浏览器正向/负向、CSP sandbox/frame-ancestors、opaque 代码门、
> 父 Origin 白名单、完整 URL、8443 allowlist、逐跳重定向、DNS 固定、
> build-info/sourceTree、HSTS 方案。
>
> Admin：在真实 8443/TLS ingress 上验证 Secure Cookie、CSRF、登录限流、
> viewer 403、隔离验收账号、SQLite 备份/恢复故障注入、容器持久卷。
>
> AI：验证无 Origin 未认证 401、跨租户资源/SSE 拒绝、审批自批/重放/一次性、
> replay/live fail closed、请求与并发上限、断线恢复；Workbench ingress
> 服务端 token 注入不得泄露到浏览器。
>
> 所有未执行项标 NOT_RUN；禁止伪造 A11y/发布审批，禁止 npm publish、正式
> Tag、未授权部署；四产品门禁必须在真实在线证据齐全后才可变更。
