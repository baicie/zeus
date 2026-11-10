# Zeus Native Admin：真实服务端参考应用

这个独立 Vite / TSX 工程通过 `@zeus-js/zeus`、`@zeus-js/router`、`@zeus-js/query`
和 Zeus UI beta.33 的 Input、Dialog、DataGrid 展示声明式应用 SDK：`RouterProvider` /
`Link` / `Outlet` / hooks、`QueryClientProvider` / `useQuery` / `useMutation`、嵌套路由、
参数、浏览器 history、可取消请求、route loader 与 query cache 协调、权限检查、预加载、
乐观更新和编辑表单。组件只在挂载时初始化，路由与查询状态通过 accessor 更新 DOM 绑定；
Admin layout 在页面切换期间保持同一个 DOM 节点。

## 本地运行（真实 HTTP API）

先在仓库根目录安装依赖并构建公共包：

```sh
pnpm install
pnpm --filter @zeus-js/compiler-native build:native
pnpm build
pnpm build-dts
pnpm --filter @zeus-js/example-admin dev
```

配置演示凭据。**没有默认弱口令**；服务端拒绝少于 12 字符的密码：

```sh
cp examples/admin/server/demo-env.example examples/admin/.env.local
# 编辑 .env.local，填入唯一的 ZEUS_ADMIN_PASSWORD / ZEUS_ADMIN_VIEWER_PASSWORD
```

分别启动 API 与 Vite：

```sh
ZEUS_ADMIN_EMAIL=ada@example.test \
ZEUS_ADMIN_PASSWORD="$ZEUS_ADMIN_PASSWORD" \
ZEUS_ADMIN_VIEWER_PASSWORD="$ZEUS_ADMIN_VIEWER_PASSWORD" \
pnpm --filter @zeus-js/example-admin dev:api

pnpm --filter @zeus-js/example-admin dev
```

打开 Vite 输出的地址并使用配置的管理员邮箱登录。独立检查与生产构建：

```sh
pnpm --filter @zeus-js/example-admin check
pnpm --filter @zeus-js/example-admin build
pnpm --filter @zeus-js/example-admin preview --host 127.0.0.1
```

生产服务也可由同一个 Node 进程同时提供静态文件与 API：

```sh
pnpm --filter @zeus-js/example-admin build
ZEUS_ADMIN_PASSWORD=... ZEUS_ADMIN_VIEWER_PASSWORD=... \
  pnpm --filter @zeus-js/example-admin start
```

开发服务器中追加 `?devtools=1`（例如 `/admin/users?devtools=1`）会挂载可关闭的
Native DevTools 面板，显示 owner 树、binding/effect/signal 图、timeline、Custom
Element 生命周期和手动刷新。生产构建会移除这条开发分支。

## 视觉系统

界面建立在一层 token 上（`src/styles/tokens.css`）：颜色、间距、圆角、阴影、字号与
控件高度都在 light / dark 两套里声明一次。`tokens.css` 之后的样式只引用
`var(--admin-*)`，新增一个界面时选 token 而不是挑一个十六进制色值。

- 布局三段：可折叠侧栏、带面包屑与页面标题的固定工具栏、有最大宽度的内容列。
  1024px 以下侧栏变为抽屉，按 Escape 或切换路由时关闭。
- 主题为浅色 / 深色 / 跟随系统三态，侧栏折叠状态与主题偏好保存在本机；
  `system` 通过 `prefers-color-scheme` 保持实时。
- 路由内部信息（匹配链、历史按钮、预加载探针）移入 Developer Diagnostics 面板，
  不再占据产品界面。
- `zw-input`、`zw-data-grid`、`zw-dialog` 通过 `data-slot` 钩子接入同一套 token，
  不修改已发布的组件。

## 页面与交互

| 地址                                       | 行为                                                            |
| ------------------------------------------ | --------------------------------------------------------------- |
| `/admin`                                   | 工作空间概览；未登录先进入登录页                                |
| `/admin/users`                             | Query adapter 加载 8 位演示用户；可搜索、按状态筛选、分页与单选 |
| `/admin/users/ada`                         | Loader + useQuery 共享缓存加载 `id=ada`，Dialog/Input 编辑邮箱  |
| `/admin/users/grace`、`/admin/users/linus` | 其他确定性详情数据                                              |
| `/admin/reports`                           | 只读身份返回 403；管理员显示报表                                |
| `/admin/roles`                             | 管理员查看角色能力与成员数                                      |
| `/admin/audit`                             | 服务端审计日志（登录、越权拒绝、CRUD、设置与上传）              |
| `/admin/settings`                          | 工作空间名称、zh-CN/en、light/dark；持久化到 SQLite             |
| `/admin/upload`                            | 受限文件上传，校验类型/大小/文件名并记录 SHA-256                |
| `/admin/users/error`                       | 走真实 API，服务端以 404 表达该用户不存在                       |
| `/admin/users/missing`、其他未知地址       | 返回 404 错误页面                                               |

链接保留真实 `href`。同源、无修饰的左键点击由 `router.navigate()` 接管；新标签页、
修饰键和外部链接保持浏览器行为。页面上的“后退 / 前进”与浏览器按钮使用同一个 history。
“预加载 Ada 详情”执行目标 loader 并显示完成状态，不改变当前地址。

客户端通过同源 Cookie 会话调用真实 HTTP API；服务端对每次读写重新校验 session 与
角色，浏览器 Signal 只承载 UX 状态。登录写入 `HttpOnly; SameSite=Lax` 会话 Cookie；生产
环境 (`NODE_ENV=production` 或 `ZEUS_ADMIN_SECURE_COOKIES=true`) 追加 `Secure`。登录还会
写入可被同源 JS 读取的 `zeus_admin_csrf` Cookie，所有 `POST/PATCH/DELETE` 必须带
`X-CSRF-Token` 请求头，缺失或不匹配返回 403。密码以 scrypt 哈希保存；登录有 per-IP 与
per-account 失败限流/锁定，未知邮箱也执行等价的 scrypt 校验，避免账号枚举。SQLite 启用
WAL、外键、启动完整性检查和迁移；用户变更、设置、上传和审计在进程重启后仍存在。route loader 与组件用同一个 `ZeusQueryClient` 和相同 query key 读取缓存：
loader 预取后组件不会重复请求，导航取消会通过 `request.signal` 中止查询。保存走
`useMutation`：`onMutate` 先取消目标查询并写入乐观值，`onError` 回滚，`onSettled`
写回结果并失效列表。DataGrid 使用
真实 `@zeus-web/data-grid` custom element，Dialog/Input 使用 `@zeus-web/dialog` 与
`@zeus-web/input`，都通过各包的 `/wc/auto` 入口注册。

## 部署

### Docker Compose

从仓库根目录创建 `.env`（不要提交）：

```sh
ZEUS_ADMIN_EMAIL=ada@example.test
ZEUS_ADMIN_PASSWORD=<unique-password-at-least-12-chars>
ZEUS_ADMIN_VIEWER_PASSWORD=<another-unique-password>
```

```sh
docker compose -f examples/admin/docker-compose.yml up --build
```

容器以非 root 用户运行、根文件系统只读、仅 `/data` 持久卷可写，并通过
`/api/health` 健康检查。Compose 只绑定 `127.0.0.1:8080`，TLS 与访问控制在受信 ingress
终止；`ZEUS_ADMIN_SEED_DEMO=false` 时只引导一个管理员，不创建演示 viewer。不要把原始
Compose 端口发布到公网。受信 ingress 若要传递客户端 IP，必须显式设置
`ZEUS_ADMIN_TRUST_PROXY=true` 并剥离客户端自带的 `X-Forwarded-For`；服务端从不信任
`X-Forwarded-Proto` 来决定 Secure Cookie。

### 单进程 / 静态 + API

`pnpm --filter @zeus-js/example-admin start` 会在缺少外部静态目录时使用内置
`dist/`，同一端口处理 SPA fallback 与 `/api/`。生产反向代理需为深层链接回退到
`index.html`，并为静态资源返回正确缓存头。

`build` 生成 `dist/`。把其内容上传到任意支持 SPA fallback 的静态服务器，部署在域名根路径。
服务器必须将 `/admin`、`/admin/users/ada` 等非资源路径重写到 `index.html`，使深链接刷新
仍能交给 Router 处理。资源不存在时应保持 404；不要把资源请求错误替换为 HTML。

Nginx 示例：

```nginx
server {
  listen 8080;
  root /srv/zeus-admin;

  location /assets/ {
    try_files $uri =404;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

备份与恢复（先停止写入，或对一致性快照执行）：

```sh
pnpm admin:db --database /path/to/admin.sqlite --backup /path/to/admin.backup.sqlite
pnpm admin:db --verify /path/to/admin.backup.sqlite
# 目标必须先关闭；默认拒绝覆盖，确认已有回滚点后再加 --force
pnpm admin:db --database /path/to/admin.sqlite --restore-from /path/to/admin.backup.sqlite --force
```

备份使用 SQLite `VACUUM INTO` 并执行 `quick_check`；恢复前再次校验，恢复后重新检查。
`openAdminDatabase` 启动时也执行完整性检查，损坏数据库不会以部分数据启动。

本示例没有 SSR 或 hydration。静态服务器对 SPA 路由返回 `index.html` 的 HTTP 200；
界面中的 403/404 是客户端 loader 的错误状态，不会改变已经返回的文档 HTTP 状态码；
API 的 401/403 由服务端真实返回。
若部署在子路径，需同步配置 Vite `base`、Router `basename` 和所有应用链接。
