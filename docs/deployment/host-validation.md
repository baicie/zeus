# Zeus 0.2.0 Host Validation Runbook

状态：`NOT_RUN`。本文是获得部署授权后的执行清单，不是已完成的线上证据。
任何公开地址在真实部署并完成 `ONLINE_ACCEPTED` 前都必须标记 `NOT_RUN`。

## 1. 前置条件

- 维护者明确授权公网部署、域名、TLS 与测试租户。
- 禁止修改 GitHub Secrets / Environment；域名和证书由部署平台管理。
- 四个产品分别准备隔离的测试账号、数据库卷和对象存储前缀。
- 记录授权人、时间、目标域名和部署工具版本。

## 2. 部署模板与 Stage 1

统一模板位于 `deploy/host-validation/`：`compose.yml`（四服务、健康检查、
只读根文件系统、资源上限、日志轮转）、`.env.example`、`nginx.conf`（TLS、
HSTS、CSP、SSE）与 `README.md`。

无副作用的 Stage 1：

```bash
pnpm deploy:stage1 --core-root <clean-core-main> --ui-root <clean-ui-main>
```

Stage 2 仅保留受控入口：`.github/workflows/host-deployment-stage2.yml`，需要
GitHub Environment 审批、`ZEUS_HOST_DEPLOY_ENABLED=true`、self-hosted
`zeus-host` runner 与 `/etc/zeus/host-validation.env`；本轮未执行。

## 3. 候选产物

从最新 `product-acceptance.yml` 运行下载：

- `temp/release/provenance.json`：Core/UI commit、run id、artifact digest。
- `temp/release/image-provenance.json`：每个产品的 image digest 与 build-info。
- `temp/release/deployment-acceptance.local.json`：Linux/Windows 本地预演。
- 三产品报告与 `data-grid-framework-e2e/report.json`。

固定 digest：

```bash
docker image inspect zeus-admin:ci | jq -r '.[0].Id'
docker image inspect zeus-playground:ci | jq -r '.[0].Id'
docker image inspect zeus-ai-host:ci | jq -r '.[0].Id'
docker image inspect zeus-ai-workbench:ci | jq -r '.[0].Id'
```

生产 compose 必须使用 `image@sha256:...`，不得使用可变标签。

## 4. Sandbox Origin 规划

- Host：`https://studio.example.com`
- Sandbox：`https://sandbox.studio.example.com`
- 两个 origin 指向同一镜像/静态目录；sandbox 必须独立证书与 CORS。
- 构建时 `VITE_ZEUS_SANDBOX_ORIGIN` 必须等于 sandbox 公网 origin；构建后
  不可更改。
- sandbox 页面自带 `default-src 'none'; script-src 'self' blob:` CSP；
  host 不得把 sandbox 与 host 放在同一 origin。

## 5. Compose 模板

```yaml
services:
  playground:
    image: registry.example.com/zeus-playground@sha256:<digest>
    ports: ['8080:80', '8081:81']
    read_only: true
    tmpfs: ['/var/cache/nginx', '/var/run', '/tmp']
    security_opt: ['no-new-privileges:true']

  admin:
    image: registry.example.com/zeus-admin@sha256:<digest>
    ports: ['8082:8080']
    environment:
      ZEUS_ADMIN_EMAIL: acceptance@example.test
      ZEUS_ADMIN_PASSWORD: ${ZEUS_ADMIN_PASSWORD:?}
      ZEUS_ADMIN_VIEWER_PASSWORD: ${ZEUS_ADMIN_VIEWER_PASSWORD:?}
      ZEUS_ADMIN_HOST: 0.0.0.0
      ZEUS_ADMIN_DB: /data/admin.sqlite
      ZEUS_ADMIN_UPLOAD_BYTES: '65536'
    volumes: ['admin-data:/data']
    read_only: true
    tmpfs: ['/tmp']
    security_opt: ['no-new-privileges:true']

  ai-host:
    image: registry.example.com/zeus-ai-host@sha256:<digest>
    environment:
      ZEUS_AI_HOST: 0.0.0.0
      ZEUS_AI_DB: /data/ai.sqlite
      ZEUS_AI_WORKSPACE: /data/workspace
      ZEUS_AI_WORKSPACE_ID: acceptance-2026-11-05
      ZEUS_AI_ORIGINS: https://ai.example.com
    volumes: ['ai-data:/data']
    read_only: true
    tmpfs: ['/tmp']

  ai-workbench:
    image: registry.example.com/zeus-ai-workbench@sha256:<digest>
    ports: ['8083:80']
    depends_on: ['ai-host']
    read_only: true
    tmpfs: ['/var/cache/nginx', '/var/run', '/tmp']

volumes:
  admin-data:
  ai-data:
```

环境变量模板（不要提交真实值）：

```bash
ZEUS_ADMIN_EMAIL=acceptance@example.test
ZEUS_ADMIN_PASSWORD=<from-secret-manager>
ZEUS_ADMIN_VIEWER_PASSWORD=<from-secret-manager>
ZEUS_ACCEPTANCE_ADMIN_EMAIL=acceptance@example.test
ZEUS_ACCEPTANCE_ADMIN_PASSWORD=<from-secret-manager>
ZEUS_ACCEPTANCE_AI_REPLAY=true
ZEUS_ACCEPTANCE_TENANT=acceptance-2026-11-05
ZEUS_SANDBOX_ORIGIN=https://sandbox.studio.example.com
```

测试账号使用独立租户，邮箱/消息前缀可识别；禁止使用真实用户账号。
Admin 只授予验收所需的最小角色；AI 只使用 Replay Host，不配置 Live 密钥。

## 6. 反向代理与 HTTPS

```nginx
server {
  listen 443 ssl http2;
  server_name studio.example.com sandbox.studio.example.com admin.example.com ai.example.com;
  ssl_certificate     /etc/tls/tls.crt;
  ssl_certificate_key /etc/tls/tls.key;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src https://sandbox.studio.example.com; object-src 'none'; base-uri 'none'" always;

  location /ai-host/ {
    proxy_pass http://ai-workbench:80/ai-host/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }
}
```

- HSTS 必须在 TLS 终止层设置；容器内不提供 TLS。
- Admin 会话 Cookie 必须是 `HttpOnly; Secure; SameSite=Lax`。
- SSE 关闭 buffering，验收最多等待 20 秒并主动关闭页面。
- DNS 只解析到公网地址；验收器会拒绝私网/保留地址。

## 7. 备份、回滚与失败恢复

1. 部署前备份 Admin/AI 的 `/data` 卷，记录 image digest 与 manifest。
2. 以新 digest 启动新容器，保留旧容器/镜像；健康检查通过后再切流量。
3. 失败时把 compose 指回旧 digest，恢复数据卷快照；不要删除旧镜像。
4. 回滚后重新运行 `check:deployment-acceptance`，不能沿用旧 PASS。
5. 清理验收测试数据：Admin 测试账号、AI 测试会话/工作区、上传附件；
   保留清理记录。

## 8. 验收清单

- [ ] DNS 四个域名解析到公网地址。
- [ ] TLS 证书有效，HTTP 自动跳转 HTTPS，HSTS 存在。
- [ ] 四个产品 `/build-info.json` 可访问且 digest 与 CI provenance 一致。
- [ ] Playground host/sandbox 是不同 origin，sandbox 为 opaque origin 且 CSP 生效。
- [ ] Admin 登录 Cookie 为 HttpOnly/Secure；viewer 不能写入。
- [ ] AI Workbench 通过同源 `/ai-host/` 代理，SSE 不缓冲；workspace 与租户一致。
- [ ] 验收只写入隔离测试数据，并可清理。
- [ ] 无密码、Cookie、Token 出现在日志。
- [ ] Linux/Windows CI 与 DataGrid 报告绑定同一 SHA。
- [ ] VoiceOver/NVDA 人工验收完成并记录。
- [ ] 发布审批人、时间、commit、digest 记录在案。

## 9. 在线验收命令

```bash
ZEUS_ACCEPTANCE_ADMIN_EMAIL=acceptance@example.test \
ZEUS_ACCEPTANCE_ADMIN_PASSWORD=<secret> \
ZEUS_ACCEPTANCE_AI_REPLAY=true \
ZEUS_ACCEPTANCE_TENANT=acceptance-2026-11-05 \
  pnpm check:deployment-acceptance \
    --manifest temp/release/deployment.json \
    --provenance temp/release/provenance.json \
    --write-mode isolated \
    --tenant acceptance-2026-11-05
```

只有四个产品都返回 `ONLINE_PASS` 且 decision 为 `ONLINE_ACCEPTED`，才能把
公开地址从 `NOT_RUN` 改为线上通过。任何 `BLOCKED` 都必须先解决隔离租户/
清理机制，不能直接写生产数据。
