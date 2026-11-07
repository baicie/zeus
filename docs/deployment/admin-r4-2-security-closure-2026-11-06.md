# Zeus 0.2.0 R4.2 — Admin Security Closure

状态：**ADMIN_SECURITY_READY**（本地真实 HTTP/浏览器验收完成；未公网部署）

范围：`examples/admin` 参考应用。没有部署到公网，因此不是
`FOUR_PRODUCTS_ONLINE_ACCEPTED`，也没有声称线上 8443 验收完成。

## 安全矩阵

| 项目            | 实现                                                                                                                   | 验证                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Session Cookie  | `HttpOnly; SameSite=Lax`；生产/NODE_ENV=production 或显式配置追加 `Secure`                                             | API 测试断言；`X-Forwarded-Proto` 不参与决定    |
| CSRF            | 登录写入可读 `zeus_admin_csrf` Cookie；所有 POST/PATCH/DELETE 要求 `X-CSRF-Token` 与服务端 session 中的 CSRF hash 匹配 | 缺失/错误 403，正确通过                         |
| Session 轮换    | 每次成功登录删除该用户全部旧 session，重新签发                                                                         | 旧 Cookie 第二次登录后 401                      |
| Logout / 过期   | 服务端删除 session；过期时间查询；过期清理                                                                             | 登出后 401；强制过期后 401                      |
| 角色变更        | 角色或状态变化撤销目标用户全部 session                                                                                 | 测试通过                                        |
| 401/403         | 未认证 401；viewer 写操作 403；RBAC 每次请求重验                                                                       | API + 三浏览器 E2E                              |
| 登录限流        | per-IP + per-account 固定窗口失败计数、锁定、恢复、最多 10k 条目                                                       | 2 次失败后 429；伪造 XFF 不绕过；时间推进后恢复 |
| 账号枚举        | 未知邮箱执行等价 dummy scrypt；错误消息统一                                                                            | API 测试                                        |
| 隔离验收        | 内存/临时 SQLite；`demoUsers:false` 只引导管理员；测试结束清理                                                         | 数据库测试与浏览器 E2E                          |
| SQLite 备份     | `VACUUM INTO` + `quick_check`；恢复前/后校验；CLI                                                                      | 单元测试 + CLI backup/verify/restore            |
| 启动保护        | `PRAGMA quick_check`；迁移事务回滚；损坏库拒绝启动                                                                     | 损坏文件测试                                    |
| 网络            | Compose 仅 `127.0.0.1:8080`；TLS/访问控制在受信 ingress                                                                | `docker compose config`                         |
| 静态/API 响应头 | CSP、nosniff、Referrer-Policy、X-Frame-Options、Permissions-Policy                                                     | 浏览器/HTTP 检查                                |

## 测试结果

```text
NODE_OPTIONS=--experimental-sqlite pnpm exec vitest run \
  examples/admin/server/__tests__ --reporter=dot
# 3 files, 16 tests passed
```

三浏览器真实浏览器门禁（本地 HTTP，非生产 TLS）：

```text
ADMIN_BROWSERS=chromium,firefox,webkit NODE_OPTIONS=--experimental-sqlite \
  pnpm exec tsx scripts/check/check-admin.ts
# chromium/firefox/webkit: query, filtering, pagination, selection,
# UI components, navigation and permissions passed
```

数据库 CLI 实际执行：backup → verify → restore → verify，全部 OK。

## 未完成 / 边界

- 未部署 Admin，未做真实公网 8443/TLS ingress 在线验收；该状态为 `NOT_RUN`。
- 容器内持久卷恢复演练未在本轮执行；镜像构建与容器 E2E 已执行。
- 演示 seed 数据只在开发/测试启用；生产 Compose 设置
  `ZEUS_ADMIN_SEED_DEMO=false`，只创建引导管理员。
- `ZEUS_ADMIN_TRUST_PROXY=true` 只应在受信 ingress 已剥离客户端
  `X-Forwarded-For` 时启用；默认 false。

## Docker / 容器验证（本地）

```text
image: zeus-admin:r42
image id: sha256:2b7fb5bb...6ed7
build: Core 31089116 / UI 2944311 / version 0.1.1-beta.20
container: 127.0.0.1:18087 -> 8080, healthy
```

真实容器 HTTP 结果：

- `/api/health` 200。
- 登录返回两个 Cookie；会话 Cookie 属性为
  `Path=/; HttpOnly; SameSite=Lax; Secure`，CSRF Cookie 为
  `Path=/; SameSite=Lax; Secure`（容器 `NODE_ENV=production`，Secure 保持开启）。
- 未认证 `PATCH /api/users/ada` 401。CSRF 缺失/错误 403 由 in-memory HTTP
  测试覆盖；容器内 Secure Cookie 在本地 HTTP curl 中不会发送，浏览器因
  localhost secure-context 例外仍可登录。
- Chromium 通过容器登录 Admin UI；viewer 访问 `/admin/reports` 显示 403。

未将容器端口发布到公网；没有执行真实 8443/TLS ingress 验收。

## 独立域名 Host Validation（公网）

- 域名：`https://admin.moonbyte.top:8443`，Cloudflare DNS-only A 记录指向
  `82.156.234.84`；Let's Encrypt 证书 SAN 为 `admin.moonbyte.top` /
  `ai.moonbyte.top`，有效期至 2027-02-04。
- Caddy 在 8443 终止 TLS，转 `127.0.0.1:18090`；Admin 容器没有其他公网
  端口。HSTS 已在 dedicated hostname 上启用。
- 公网 `GET /api/health` 200；浏览器登录成功；Cookie 实测为
  `Secure; HttpOnly; SameSite=Lax`（CSRF Cookie `Secure; SameSite=Lax`）。
- 生产容器使用 `ZEUS_ADMIN_SEED_DEMO=false`，只引导管理员账号，不创建
  viewer 演示账号；公网部署未测试 viewer 登录，viewer 403 由本地 HTTP 和
  三浏览器测试覆盖。
- 当前公网镜像是从 Admin PR 分支构建的 `zeus-admin:r42-deploy`（分支
  commit `382d33d`），不是 main merge commit；合并 #194 后应从 main 重建
  再更新该镜像，避免长期运行未合并产物。

### 证书续期

acme.sh 已配置 cron（`5,11,17,23` 小时），并已设置 install-cert 的
`--reloadcmd` 调用 Caddy reload；证书 SAN 与私钥只在服务器
`/home/ubuntu/caddy/certs/admin-ai-*`，权限 600。
