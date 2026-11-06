# Zeus 0.2.0 Host Security Review

状态：本地代码与部署模板审查完成；线上环境未部署，所有公网结论为 `NOT_RUN`。

## 审查范围

- `examples/playground-editor` 的 host/sandbox 双源与 CSP。
- `examples/admin` 的登录、Session、RBAC、上传、静态文件与 SQLite。
- `examples/ai-host` 的工作区路径、审批写入、SSE 与来源限制。
- `scripts/release/deployment-acceptance.ts` 的 SSRF/DNS/重定向边界。
- `deploy/host-validation/` 的 Compose、nginx 与容器权限。
- 既有测试：Admin 三引擎、Playground 三引擎、AI Workbench 三引擎、容器验收。

## Findings

| ID  | 级别 | 发现                                                                | 复现/证据                                                                        | 处置                                                            |
| --- | ---- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| S-1 | P1   | AI Host 只有 Origin allowlist，没有用户级鉴权                       | `examples/ai-host/src/protocol-server.ts`；任意 allowlist 来源可发起会话         | 参考宿主定位；生产必须放在带鉴权的 ingress 后，禁止直接公网暴露 |
| S-2 | P1   | Build Metadata 是摘要绑定，不是签名 Attestation                     | `build-info.ts` / `provenance.json`；manifest 可自填但必须与 CI digest 匹配      | 文档明确边界；R3 后续接入 GitHub Artifact Attestations/Sigstore |
| S-3 | P1   | 浏览器 DNS 固定只在 Chromium 生效                                   | `deployment-acceptance.ts` 的 `--host-resolver-rules`；Firefox/WebKit 无等价参数 | 在线验收默认 Chromium；多引擎时记录残余风险                     |
| S-4 | P1   | Admin 演示账号密码由环境变量注入，弱口令会启动失败但必须使用 Secret | `examples/admin/server/index.ts` 密码长度与必填校验                              | Compose 模板不含默认密码；生产使用 Secret Manager               |
| S-5 | P2   | SSE 长连接没有按客户端并发上限                                      | AI Host SSE；nginx `proxy_read_timeout 3600s`                                    | 验收 20 秒超时并主动关闭页面；生产增加连接数监控                |
| S-6 | P2   | 容器资源限制此前只在文档中                                          | `deploy/host-validation/compose.yml` 新增 mem/cpus/read_only/tmpfs               | 已补齐模板                                                      |
| S-7 | P2   | 验收日志可能包含请求 URL，但不含密码/Cookie/Token                   | `deployment-acceptance.ts` 只输出状态、digest 与错误                             | 保持不打印认证头                                                |
| S-8 | P0   | 未发现 P0                                                           | 三引擎门禁、CSP、路径校验、上传 basename、HttpOnly Cookie、SSRF 测试             | —                                                               |

## 已验证的安全边界

- Playground sandbox 是独立 Origin，opaque origin 断言与 `default-src 'none'` CSP 在验收中执行；host 与 sandbox 不同端口/域名。
- Admin 静态服务 `path.resolve` 前缀校验，上传文件名必须是 basename，大小 64 KiB，媒体类型白名单，会话 Cookie HttpOnly。
- AI 工作区 `safePath` 拒绝绝对路径、`..`、NUL 与逃逸；写操作必须经过 pending approval。
- 在线验收拒绝私网/保留/回环地址、非 443 端口、超过 5 次重定向、HTTPS→HTTP 降级，并对每一跳做 DNS 校验。
- 容器模板使用只读根文件系统、tmpfs、`no-new-privileges`、内存/CPU 上限与日志轮转。

## 未关闭的残余风险

- AI Host 的参考实现不是多租户身份系统；必须在生产 ingress 做认证、限流与隔离。
- Build provenance 不是加密签名；不能宣称“密码学证明”。
- 线上 TLS、WAF、DDoS、日志脱敏与密钥轮换需在 Host Validation 环境验证。

## Ingress 与 AI Host 公开边界

- `INGRESS_TEMPLATE_READY`：`deploy/host-validation/nginx.conf` 提供 TLS、HSTS、
  CSP、Sandbox Origin 与 SSE 配置模板，Stage 1 已本地验证。
- `INGRESS_DEPLOYED_AND_VERIFIED`：`NOT_RUN`。Stage 2 必须在真实 ingress 上
  验证 Hostname、证书、HTTP→HTTPS、HSTS、CSP、sandbox origin 和 SSE 后才可
  标记。
- AI Workbench 公开部署当前为 **BLOCKED_BY_SECURITY**，直到 ingress 具备
  用户鉴权、请求限流和并发上限；AI Host 不直接发布公网端口。
- Stage 2 只接受祖先于 main 的提交、已验证的 artifact SHA256、隔离 tenant、
  GitHub Environment 审批与 `ZEUS_HOST_DEPLOY_ENABLED=true`；输入只通过 env
  传给 CLI，不进入 shell 文本。
