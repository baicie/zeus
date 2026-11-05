# PR-30/31：Zeus Admin 真实服务端证据

日期：2026-11-04（Asia/Shanghai）

## 交付

- `examples/admin/server/database.ts`：`node:sqlite` 迁移、WAL、外键、确定性 seed。
- `examples/admin/server/security.ts`：scrypt 密码哈希、恒定时间比较、随机 token 与 SHA-256 会话摘要。
- `examples/admin/server/auth.ts`：HttpOnly/SameSite=Lax 会话、8 小时 TTL、过期清理。
- `examples/admin/server/api.ts`：登录/登出/会话、用户 CRUD、服务端 RBAC、审计、设置、受限上传、SPA fallback 与安全响应头。
- `examples/admin/src/api.ts`：同源 Cookie HTTP adapter。
- `examples/admin/src/app.tsx`：认证子树在会话完成后创建，避免未登录 loader 缓存 401。
- `examples/admin/src/pages.tsx`：Roles、Audit、Settings、Upload 页面；登录、退出、light/dark。
- `examples/admin/Dockerfile`、`docker-compose.yml`、`demo-env.example`：非 root、只读根文件系统、持久卷与健康检查。

## 测试证据

### HTTP 契约

```sh
pnpm exec vitest --run --project unit examples/admin/server/__tests__/api.spec.ts
```

结果：1 文件 / 6 测试通过。覆盖：

- 未登录读取和 mutation 均返回 401；
- viewer mutation / audit 读取返回 403；
- 管理员登录、筛选、更新、摘要和审计记录；
- SQLite 关闭并重新打开后用户与审计仍存在；
- 上传文件名、媒体类型与大小限制；
- 设置持久化与 viewer 写入拒绝；
- 错误密码 401 与 suspended 账号 403。

### 三引擎浏览器

```sh
pnpm check:admin
```

结果：Chromium / Firefox / WebKit 的生产门禁与 DevTools 均通过。每个浏览器使用独立
SQLite 文件、独立 Admin 服务和独立 Vite 实例，避免执行顺序污染。覆盖：

- 真实登录、HttpOnly session、服务端角色；
- 用户筛选、分页、DataGrid 选择、编辑与乐观更新；
- 深链刷新、历史导航、404；
- Reports 管理员访问、Roles/Settings/Upload；
- 设置写入 SQLite 后刷新仍保留；
- 无 Cookie 的 PATCH 返回 401；
- viewer 访问受保护页面返回 403；
- `?devtools=1` 的 Owner/Binding/Timeline 面板与清理。

报告：[`temp/admin/report.json`](../../temp/admin/report.json)；截图
`temp/admin/admin-{chromium,firefox,webkit}.png`。

## 未执行 / BLOCKED

- 生产在线 URL、真实反向代理、TLS 与 Docker 构建未执行（部署需授权）。
- VoiceOver/NVDA、200% zoom 人工验收未执行。
- Windows/Linux 浏览器矩阵未执行。
- 真实上传对象存储、邮件邀请与密码重置不在本切片范围。

## 决策

- 密码失败与 suspended 账号均不泄漏账号是否存在（登陆错误文案统一）。
- 客户端 Signal 永不作为权限真相；每次 API 读写重新读取 session 并校验角色。
- 无默认弱口令：服务启动强制读取 12 字符以上密码；Docker Compose 使用必填环境变量。
