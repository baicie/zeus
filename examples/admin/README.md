# Zeus Native Admin：真实导航切片

这个独立 Vite / TSX 工程通过 `@zeus-js/zeus`、`@zeus-js/router`、`@zeus-js/resource`、
`@zeus-js/query` 和 Zeus UI beta.32 的 Input、Dialog、DataGrid 展示
嵌套路由、参数、浏览器 history、可取消请求、缓存查询、权限检查、预加载和编辑表单。
组件只在挂载时初始化，
路由状态通过 accessor 更新 DOM 绑定；Admin layout 在页面切换期间保持同一个 DOM 节点。

## 本地运行

先在仓库根目录安装依赖和构建公共包：

```sh
pnpm install
pnpm --filter @zeus-js/compiler-native build:native
pnpm build
pnpm build-dts
pnpm --filter @zeus-js/example-admin dev
```

打开 Vite 输出的地址并访问 `/admin`。独立检查与生产构建：

```sh
pnpm --filter @zeus-js/example-admin check
pnpm --filter @zeus-js/example-admin build
pnpm --filter @zeus-js/example-admin preview --host 127.0.0.1
```

## 页面与交互

| 地址                                       | 行为                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `/admin`                                   | 工作空间概览，路由匹配链为 `root / admin / overview`               |
| `/admin/users`                             | Query adapter 加载 8 位演示用户；可搜索、按状态筛选、分页与单选    |
| `/admin/users/ada`                         | Resource 加载动态参数 `id=ada`，真实 Zeus UI Dialog/Input 编辑邮箱 |
| `/admin/users/grace`、`/admin/users/linus` | 其他确定性详情数据                                                 |
| `/admin/reports`                           | 默认只读身份返回 403；切换管理员后重试当前路由并显示报表           |
| `/admin/users/error`                       | loader 返回 500 和可恢复的错误页面                                 |
| `/admin/users/missing`、其他未知地址       | 返回 404 错误页面                                                  |

链接保留真实 `href`。同源、无修饰的左键点击由 `router.navigate()` 接管；新标签页、
修饰键和外部链接保持浏览器行为。页面上的“后退 / 前进”与浏览器按钮使用同一个 history。
“预加载 Ada 详情”执行目标 loader 并显示完成状态，不改变当前地址。

演示数据适配器使用 40ms 可取消的异步请求，不依赖后端、账户或外部网络；列表由
`createQuery` 按搜索/状态/页码缓存，详情与摘要分别由 `createResource` 加载，保存经
Query mutation 更新数据并失效列表缓存。身份仅存在于当前页面的 Signal 中，刷新后恢复
只读身份。这里的权限演示不是生产认证，真实服务端仍需独立验证权限。DataGrid 使用
真实 `@zeus-web/data-grid` custom element，Dialog/Input 使用 `@zeus-web/dialog` 与
`@zeus-web/input`，都通过各包的 `/wc/auto` 入口注册。

## 静态部署

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

本示例没有 SSR 或 hydration。静态服务器对 SPA 路由返回 `index.html` 的 HTTP 200；
界面中的 403/404/500 是客户端 loader 的错误状态，不会改变已经返回的文档 HTTP 状态码。
若部署在子路径，需同步配置 Vite `base`、Router `basename` 和所有应用链接。
