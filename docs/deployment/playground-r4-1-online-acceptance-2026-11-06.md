# Zeus 0.2.0 R4.1 — Playground 公网安全加固与在线验收

状态：**PLAYGROUND_ONLINE_VALIDATED**

范围：仅 `WebC Studio` / `Native Lab`。Core RC 的四产品门禁仍为
**NOT_READY**；Admin 与 AI Workbench 仍为 **BLOCKED_BY_SECURITY**，未部署。
本文所有线上结论均来自 2026-11-06 的真实 HTTPS 请求与
Chromium/Firefox/WebKit 实测，不把 Git Tree 相等冒充密码学 Attestation。

## 1. 最终裁决

R4.1 开始前，Sandbox 存在一个可复现的 P0：

- 第三方页面用**不带 `sandbox` 属性**的 iframe 嵌入
  `https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html`；
- 第三方可以发送合法的 `sandbox-load` 消息；
- 预览代码在**真实的 Panel Origin** 下执行，`opaqueOrigin` 为 `false`，
  可读取 `localStorage` 与 `document.cookie`。

R4.1 已上线两层独立缓解：

1. Sandbox 响应头强制
   `Content-Security-Policy: sandbox allow-scripts; frame-ancestors https://mail.moonbyte.top:8443`；
2. `sandbox.ts` 在模块初始化时捕获 `globalThis.origin === 'null'`，非 opaque
   直接抛错，不安装消息监听器；
3. 父 Origin 白名单只接受 `VITE_ZEUS_PLAYGROUND_HOST_ORIGINS`
   （生产为 `https://mail.moonbyte.top:8443`），loopback 仅用于本地开发。

复测结果：第三方嵌入被 `frame-ancestors` 拦截；直接打开 Sandbox 为
opaque origin 且访问存储抛 `SecurityError`；正常 Host iframe、Native Lab、
React/Vue WebC 消费全部正常。即使未来 ingress 漏掉响应头，代码级 opaque
门仍会 fail closed（已用无 header 的本地服务器验证）。

## 2. Source → Build → Deployment Evidence

| 项                      | 值                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Core 仓库               | `https://github.com/baicie/zeus`                                                      |
| Core main / 部署源      | `7a14a9c5d801ebb6453ad057f7b95848675ccdb3`                                            |
| Core source tree        | `10659b3ecf5b70193d4c5fe8e429deebcbccf73d`                                            |
| UI main                 | `294431194a50735b62ba38e674fac1af76ae6cfb`                                            |
| 版本                    | `0.1.1-beta.20`                                                                       |
| Build time              | `2026-11-06T12:34:10Z`                                                                |
| Host artifact digest    | `sha256:8dbf32d536d74601bd0322268cdaf9f9c5cf0255544a9af07d05967362b99456`（15 files） |
| Sandbox artifact digest | `sha256:f529bc361f24672f5e428fb8976462876fa23dcaaf623be70943f1b749806679`（15 files） |
| 镜像                    | `zeus-playground:deploy-r41b`                                                         |
| 镜像 ID                 | `sha256:3c2deb10ceb4a7cb90d271ec9a7e643dfec2ef3430c316df1a5c754b61f06b25`             |
| 镜像归档 SHA256         | `ec92ebf432444cd972f77d036b85e3d60b95dcee77a46e94923736e81c5fab0c`                    |
| Host build-info         | `https://mail.moonbyte.top:8443/build-info.json`                                      |
| Sandbox build-info      | `https://panel.moonbyte.top:8443/zeus-sandbox/build-info.json`                        |

镜像标签 `org.opencontainers.image.revision=7a14a9c...`、
`zeus.ui.commit=2944311...`、`zeus.build.time=2026-11-06T12:34:10Z` 已由
验收器与本地 `docker image inspect` 交叉核对。部署源树与 main 相同；
`build-info` 的 `artifactDigest` 由验收器重新下载每个文件、逐文件校验
SHA256/字节数并重新计算，而不是只信 JSON 自报值。

原始验收结果：
[playground-r4-1-acceptance-2026-11-06.json](evidence/playground-r4-1-acceptance-2026-11-06.json)。

## 3. Sandbox 安全验证矩阵

| 场景                                          | 预期                               | 实测                                                     |
| --------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| 正常 Host iframe（`sandbox="allow-scripts"`） | opaque、可编译、可交互             | Chromium/Firefox/WebKit 通过                             |
| 直接打开 Sandbox URL                          | opaque，不能读 Panel 存储/Cookie   | `origin === "null"`；`localStorage` 抛 `SecurityError`   |
| 第三方 iframe，无 `sandbox` 属性              | 不能执行不可信代码                 | `frame-ancestors` 拦截；无 ready/result/pwn 消息         |
| 第三方 iframe，有 `sandbox` 属性              | opaque，且父 Origin 不被白名单接受 | 无代码执行结果                                           |
| 漏配 CSP header 的静态服务                    | 代码级 fail closed                 | 直接页面抛 `requires an opaque origin`；第三方无任何消息 |
| 允许嵌入但父 Origin 不在白名单                | 不执行消息                         | 仅收到无敏感信息的 ready，无 preview 执行                |

关键代码：

- `examples/playground-editor/src/sandbox.ts`：模块初始化 opaque 硬门；
  父 Origin 精确白名单；`event.source === window.parent` 与 session 校验保留。
- `packages/devtools/playground-engine/src/sandbox-url.ts`：完整 Sandbox URL
  解析、Host/Sandbox 不同 Origin、非 loopback 必须 HTTPS、拒绝凭据、
  路径/查询/hash 保留、session 使用查询参数。
- `examples/playground-editor/src/preview.ts`：iframe URL 使用
  `withSandboxSession`，不再覆盖配置的 hash。
- 响应头：Sandbox 的 HTTP CSP 为
  `sandbox allow-scripts; frame-ancestors https://mail.moonbyte.top:8443`。
  `<meta>` CSP 仍保留资源限制；`frame-ancestors` 和 `sandbox` 不再依赖 meta。

Sandbox 与 Panel 共享 `panel.moonbyte.top:8443` 主机名是部署现状，但
iframe/CSP 使文档运行在 opaque origin，不能读取 Panel 的存储、Cookie 或
业务接口。长期仍建议使用独立 Sandbox Hostname；这不是本轮上线阻塞项。

## 4. Caddy / TLS / 回滚核查

实际路由（`/home/ubuntu/caddy/Caddyfile`）：

- `https://mail.moonbyte.top:8443` → `127.0.0.1:18080`（Playground Host）。
- `https://panel.moonbyte.top:8443`：
  - `/` → `302 /panel/`；
  - `/sandbox.html` → `302 /zeus-sandbox/sandbox.html`（兼容入口）；
  - `/zeus-sandbox/*` → `handle_path` 去前缀 → `127.0.0.1:18081`；
  - 其他路径 → 既有 `127.0.0.1:7863` Panel 服务。
- `panel.moonbyte.top` 的 443 站点块没有任何 `zeus`/`sandbox` 路由；
  8443 是唯一的 Playground 入口，没有重复的 `:8443` 站点块。
- Caddy active JSON 中顺序为 `redir` → `handle_path` → 兜底
  `reverse_proxy`；`/panel/` 自己的 CSP 未被 Sandbox header 覆盖。

安全头实测：

| 路径                                                    | CSP                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Host `/`                                                | `default-src 'self'; ...; frame-src https://panel.moonbyte.top:8443; frame-ancestors 'none'` |
| Sandbox `/zeus-sandbox/sandbox.html`                    | `sandbox allow-scripts; frame-ancestors https://mail.moonbyte.top:8443`                      |
| Sandbox aliases `/zeus-sandbox/index.html`、`host.html` | 同上（header 作用于整个 Sandbox server）                                                     |
| Panel `/panel/`                                         | Panel 自身的 `default-src 'none'; ...; frame-ancestors 'none'`，未受影响                     |

TLS：证书 SAN 覆盖 `mail.moonbyte.top`、`panel.moonbyte.top` 等 7 个域名，
有效期至 `2027-02-03T06:31:33Z`。**未发现 certbot/acme timer 或 cron**，
续期是人工流程；必须在 2027-02-03 前更新
`/home/ubuntu/caddy/certs/{fullchain,key}.pem` 并 `caddy reload`。本轮未改
证书、未重启 Caddy（容器 `StartedAt` 仍为 2026-11-04，配置通过 graceful
reload 生效）。

HSTS：8443 未设置 `Strict-Transport-Security`，因为该 header 会按主机名
影响整个 `mail.moonbyte.top`，而当前是非标准端口布局。它被记录为
`hstsPresent=false`，不作为 Playground 上线失败项；迁移到独立域名/443 后
应补 HSTS。

回滚：

```sh
# Caddy（已验证的 R4.1 配置备份）
sudo cp /home/ubuntu/caddy/Caddyfile.bak-r41-online /home/ubuntu/caddy/Caddyfile
sudo docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# 镜像（服务器仍保留旧镜像）
# 将 /home/ubuntu/zeus-playground/docker-compose.yml 的 image 改回：
#   zeus-playground:deploy-paths
cd /home/ubuntu/zeus-playground && sudo docker compose up -d --wait
```

备份：`Caddyfile.bak-zeus`（15:42）、`Caddyfile.bak-zeus2`（17:10）、
`Caddyfile.bak-r41-online`（R4.1 已验证版本）。旧镜像
`deploy-paths` / `deploy-r41` 仍存在。回滚不需要改其他 mail/panel 业务路由。

## 5. 在线验收结果

命令（可复现，测试器默认拒绝所有未显式批准的端口）：

```sh
pnpm accept:playground-online \
  --host-url https://mail.moonbyte.top:8443/ \
  --sandbox-url https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html \
  --core-commit 7a14a9c5d801ebb6453ad057f7b95848675ccdb3 \
  --ui-commit 294431194a50735b62ba38e674fac1af76ae6cfb \
  --allow-port 8443 \
  --image-ref zeus-playground:deploy-r41b \
  --image-id sha256:3c2deb10ceb4a7cb90d271ec9a7e643dfec2ef3430c316df1a5c754b61f06b25 \
  --host-digest sha256:8dbf32d536d74601bd0322268cdaf9f9c5cf0255544a9af07d05967362b99456 \
  --sandbox-digest sha256:f529bc361f24672f5e428fb8976462876fa23dcaaf623be70943f1b749806679
```

结果：`PLAYGROUND_ONLINE_VALIDATED`。

| 浏览器   | 版本         | Native Lab | WebC Studio       | 直接访问 opaque | 第三方嵌入阻断 |
| -------- | ------------ | ---------- | ----------------- | --------------- | -------------- |
| Chromium | 156.0.8078.4 | 通过       | React 3→4 / Vue 7 | 通过            | 通过           |
| Firefox  | 157.0        | 通过       | React 3→4 / Vue 7 | 通过            | 通过           |
| WebKit   | 27.2         | 通过       | React 3→4 / Vue 7 | 通过            | 通过           |

验收器还验证：

- 每一跳重定向重新校验 HTTPS、host、port、凭据与 DNS；只接受显式批准
  的 `8443`，其他端口（包括 8444/9443）拒绝；私网/loopback/保留地址拒绝。
- 浏览器全部走同一 CONNECT 代理，代理只连接已批准 host/port 且只使用
  已解析的公网地址（Chromium/Firefox/WebKit 均有 DNS 固定）。
- 实际 iframe `src` 的 origin/path 与配置的完整 Sandbox URL 一致，且存在
  `zeus-sandbox-session`；不是从主站猜测 `/sandbox.html`。
- Host/Sandbox origin 不同；Sandbox frame 的 `globalThis.origin === "null"`；
  iframe `sandbox` 属性为 `allow-scripts`。
- Host `frame-src` 指向 Sandbox，Sandbox HTTP CSP、CORS、CORP、nosniff、
  meta `default-src 'none'` 均存在。
- 两个 build-info 的 15 个文件逐个下载校验，`artifactDigest` 重算一致；
  Core/UI commit 与镜像标签一致。

## 6. Admin / AI 只读差距分析（本轮不部署）

### Admin

- RBAC 的服务端校验本身正确；viewer 写操作返回 403，但验收器未断言
  viewer 403、Cookie `Secure`、登录限流。
- 会话 Cookie 只有 `HttpOnly; SameSite=Lax`，缺少 `Secure`
  （`examples/admin/server/api.ts:686`）。
- 登录无失败计数/锁定，ingress 无 `limit_req`（`api.ts:124-160`）。
- 没有隔离验收账号/租户；seed 固定演示账号，验收后不清理
  （`examples/admin/server/database.ts:161-196`）。
- 没有数据库备份/恢复实现或故障注入演练；Stage 2 只 `compose down`
  （`scripts/release/deployment-stage2.ts:559`）。
- 产品 compose 将 8080 发布到所有网卡（`examples/admin/docker-compose.yml:7`），
  不能作为公网入口。
- 结论：**BLOCKED_BY_SECURITY**，本轮不开放。

### AI Workbench / AI Host

- AI Host 全端点没有身份认证/授权；Origin allowlist 不是认证，非浏览器
  客户端或无 Origin 请求可绕过（`examples/ai-host/src/protocol-server.ts:95`）。
- 匿名客户端可以 `changeset.propose` 后按可预测的 `approval-N` 自批并写入
  `/data/workspace`（`workspace.ts:121-159`）。
- 只有一个 workspace 和固定 `reference` stream；SSE 向同 stream 所有客户端
  广播；assets 无 owner、id 可枚举（`store.ts:157`、
  `protocol-server.ts:45`/`:191-209`）。
- 无请求限流、并发上限、assets 淘汰；ingress 没有 `limit_req`/`limit_conn`。
- replay/live 没有真正隔离；`ZEUS_ACCEPTANCE_AI_REPLAY` 只是验收开关。
- 产品 compose 将 8788/8083 发布到所有网卡
  （`examples/ai-host/docker-compose.yml:6-7`），必须删除。
- 结论：**BLOCKED_BY_SECURITY**，无 API key 也不能作为公开写工作区 demo。

四产品总门禁仍未满足；不能因为 Playground 通过就写
`ONLINE_ACCEPTED`。原始四产品验收器现在支持显式 `allowedPorts` 与
`sandboxUrl`，但 Admin/AI 没有上线证据，门禁保持 NOT_READY。

## 7. 残余风险与边界

- Sandbox 与 Panel 共享主机名，虽然 iframe/CSP 为 opaque；独立
  `sandbox.moonbyte.top` 域名仍是长期建议。
- 8443 无 HSTS；证书续期没有自动 timer，属于人工运维风险。
- `build-info`/镜像标签是摘要绑定，不是签名 Attestation；没有 Sigstore
  或 GitHub Artifact Attestation。
- Sandbox 的 `sandbox-ready` 在允许嵌入但父 Origin 不在白名单时仍可能被
  对方收到（不含敏感数据）；真正的代码执行入口已由 opaque 硬门与
  allowlist 双重阻断。
- 本轮未执行 npm publish、正式 Tag、Release、未部署 Admin/AI。

## 8. R4.2 提示词草案

> Zeus 0.2.0 — R4.2 Admin/AI Security Closure
>
> 基于 R4.1 的只读差距分析，目标是让 Admin 与 AI Workbench 具备可复核的
> 公网安全边界，但仍不要求本轮直接开放公网。Admin：补 Secure Cookie、
> 登录 per-IP/per-account 限流与锁定、隔离验收账号/租户、SQLite 备份与
> 故障注入恢复、viewer 403 与 Set-Cookie 属性验收；删除产品 compose 的
> 公网端口发布。AI：在 Host 与 ingress 双层做身份认证（无 Origin 请求也
> 必须认证）、审批绑定 user/tenant/workspace 且禁止自提自批、按租户隔离
> stream/workspace/assets、SSE/命令/assets 硬上限与限流、真正的 replay/live
> 隔离；删除 8788/8083 公网发布；无 API key 的公开演示默认只读。保持
> Playground 的 8443 验收不回归；补充 Admin/AI 的 8443 独立 hostname 或
> 443 部署方案、HSTS、证书自动续期与备份回滚证据。禁止 npm publish、正式
> Tag、未授权部署、伪造 PASS；四产品门禁在证据齐全前保持 NOT_READY。
