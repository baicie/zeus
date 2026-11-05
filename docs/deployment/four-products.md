# Zeus 0.2.0 四产品部署与验收手册

本文只描述部署准备、可复现构建和真实验收流程。本轮没有执行任何线上部署、
npm 发布、Tag 或生产变更；线上结果必须来自实际部署后的
`check:deployment-acceptance` 报告，不能用人工填写的 URL 代替。

## 1. 产品与源码归属

| 产品         | 源码仓库         | 构建产物                          | 运行时                             |
| ------------ | ---------------- | --------------------------------- | ---------------------------------- |
| WebC Studio  | `baicie/zeus`    | `examples/playground-editor/dist` | 静态文件，host/sandbox 双源        |
| Native Lab   | `baicie/zeus`    | 同一份 `dist`，`/` 路由           | 静态文件，host/sandbox 双源        |
| Zeus Admin   | `baicie/zeus`    | `examples/admin/dist` + Node 服务 | Node 24 + SQLite                   |
| AI Workbench | `baicie/zeus-ui` | `examples/ai-workbench/dist`      | 静态文件 + `examples/ai-host` 服务 |

`@zeus-js/compiler-wasm` 的 `zeus-compiler.wasm` 是 gitignored 构建产物。
`pnpm check:playground-editor` 现在会先构建它；干净环境不再出现“编译失败”
的误导页面。

## 2. 本地构建

```bash
pnpm install --frozen-lockfile
pnpm --filter @zeus-js/compiler-wasm build:wasm
pnpm --filter @zeus-js/compiler-native build:native
pnpm build
pnpm --filter @zeus-js/example-admin build
VITE_ZEUS_SANDBOX_ORIGIN=http://localhost:8081 \
  pnpm --filter @zeus-js/example-playground-editor build
```

AI Workbench 在 `zeus-ui` 仓库：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @zeus-web/example-ai-workbench build
```

`VITE_ZEUS_SANDBOX_ORIGIN` 必须与最终的 sandbox 公网 origin 完全一致，并且
不能等于 host origin；构建后不可在运行时切换。AI Workbench 默认使用同源
`/ai-host`，由 nginx 反向代理到 AI Host；如果直接跨源部署，则在构建时设置
`ZEUS_AI_HOST_ORIGIN`，并把 workbench origin 加入 `ZEUS_AI_ORIGINS`。

## 3. 容器部署

WebC Studio / Native Lab：

```bash
cd examples/playground-editor
ZEUS_SANDBOX_ORIGIN=https://sandbox.example.com docker compose up -d --build
```

容器同时监听 80/81，compose 映射到 8080/8081；两个端口必须由不同的公网
origin 暴露。ingress 必须提供 TLS 与 HSTS，并保留 CORS 头。

Zeus Admin：

```bash
cd examples/admin
ZEUS_ADMIN_EMAIL=... ZEUS_ADMIN_PASSWORD=... ZEUS_ADMIN_VIEWER_PASSWORD=... \
  docker compose up -d --build
```

镜像以非 root 运行，`/data` 是唯一可写卷；`/api/health` 是健康检查。
严禁把本地测试数据库或默认弱口令部署到公网。

AI Workbench + AI Host：

```bash
cd examples/ai-host
docker compose up -d --build
```

workbench 的 nginx 把 `/ai-host/` 代理到 `ai-host:8788`，SSE 不做缓冲；
workbench 暴露 8083。Host 只允许 `ZEUS_AI_ORIGINS` 中的来源，写操作只在
Host 侧执行。

## 4. 部署验收

真实部署后，先生成 manifest（不要提交到仓库）：

```json
{
  "schema": "zeus.deployment-manifest/v1",
  "coreCommit": "<40 位 Core commit>",
  "uiCommit": "<40 位 UI commit>",
  "products": [
    {
      "product": "webc-studio",
      "url": "https://studio.example.com/webc.html",
      "commit": "<coreCommit>",
      "repository": "baicie/zeus"
    },
    {
      "product": "native-lab",
      "url": "https://studio.example.com/",
      "commit": "<coreCommit>",
      "repository": "baicie/zeus"
    },
    {
      "product": "admin",
      "url": "https://admin.example.com/",
      "commit": "<coreCommit>",
      "repository": "baicie/zeus"
    },
    {
      "product": "ai-workbench",
      "url": "https://ai.example.com/",
      "commit": "<uiCommit>",
      "repository": "baicie/zeus-ui"
    }
  ]
}
```

```bash
ZEUS_ADMIN_EMAIL=... ZEUS_ADMIN_PASSWORD=... \
  pnpm check:deployment-acceptance --manifest temp/release/deployment.json
```

验收会真正执行：

- HTTPS 请求、200 状态、HTML 内容、HSTS 与 `nosniff`；
- WebC Studio 的 `/sandbox.html` CSP（`default-src 'none'`）；
- Chromium 浏览器加载与产品交互：Playground 编译并出现预览、Admin 登录且
  会话 Cookie 不可被 JavaScript 读取、AI Workbench 发送消息并出现在时间线；
- 页面异常与 4xx/5xx 响应。

结果写入 `temp/release/deployment-acceptance.json`。只有四个产品全部通过才
是 `ONLINE_ACCEPTED`。本地预演使用同一套检查，但输出 `LOCAL_VALIDATED`，
不允许写成 `ONLINE_PASS`。

本地四产品预演：

```bash
pnpm check:deployment-local --ui-root ../zeus-ui --browsers chromium
```

它会构建生产产物、启动真实 host/sandbox 双源、Admin 服务和 AI Host/Workbench，
把结果写入 `temp/release/deployment-acceptance.local.json`。

## 5. 证据链

`Source SHA → Build Artifact → Test Run → Deployment → HTTPS Smoke → Approval`

每个产品至少要记录：产品 ID、源码 commit、构建产物指纹、部署目标、HTTPS URL、
健康检查、浏览器结果、运行日期与证据来源。`check:rc-readiness` 仍然只接受
HTTPS URL 与 commit 绑定的 `zeus.rc-evidence/v2`；真实部署验收是独立的、
更严格的一步，不能反过来放宽它。

## 6. 跨平台验收

`.github/workflows/product-acceptance.yml` 提供 Linux/Windows 两个真实 runner：

```bash
gh workflow run product-acceptance.yml \
  --repo baicie/zeus --ref <branch> -f ui-ref=<zeus-ui-branch>
```

两个 job 都执行 Node 24、冻结安装、WASM 构建、Admin/Playground/AI Workbench
浏览器门禁和四产品本地部署预演，并上传报告。Windows 只运行 Chromium；
WebKit 的 Windows 缺失必须记录为平台限制，不能静默跳过。

## 7. 人工验收（不自动化）

VoiceOver、NVDA、键盘导航、焦点管理、200% 缩放与移动端布局必须由人工完成。
`ZEUS_MANUAL_A11Y=passed`、`ZEUS_CROSS_PLATFORM=passed` 和
`ZEUS_JOINT_RELEASE_APPROVED=true` 只能由实际完成验收/审批的人设置，
不得由自动化脚本写入。
