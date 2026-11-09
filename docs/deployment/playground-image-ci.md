# Playground 镜像发布与部署

Playground 的生产部署完全由 GitHub Actions 完成，不在服务器上执行手工构建或
`ssh` 操作。

## 流程

`.github/workflows/playground-image.yml`：

```text
push to main（命中 playground 相关路径）
        │
        ▼
build-and-publish ── ubuntu-latest，linux/amd64
        │            构建 examples/playground-editor/Dockerfile
        │            推送 GHCR：main / sha-<sha> / <YYYY.M.D.HHmm>
        │            校验 tag 真的在 registry 上
        ▼
deploy ── environment: production（可配置 required reviewer）
         通过 SSH 在主机上按 digest 拉取镜像 → compose up -d → 健康检查
```

- **PR** 只构建、不推送、不部署。
- **push 到 main** 构建、推送并自动滚动部署。
- **workflow_dispatch** 默认只构建；勾选 `deploy` 才部署。

路径过滤只覆盖能影响 Playground 产物的路径：`examples/playground-editor/**`、
`packages/**`、`crates/**`、`scripts/release/build-info.ts`、`package.json`、
`pnpm-lock.yaml`、`Cargo.toml`、`Cargo.lock`，以及 workflow 自身。

## 一次性配置

仓库 Settings → Secrets and variables → Actions 需要：

| 类型     | 名称                                  | 说明                                                   |
| -------- | ------------------------------------- | ------------------------------------------------------ |
| Secret   | `ZEUS_PLAYGROUND_DEPLOY_SSH_KEY`      | 推荐。专用部署私钥，只授予 `ubuntu` 用户的 docker 权限 |
| Secret   | `ZEUS_PLAYGROUND_DEPLOY_SSH_PASSWORD` | 备选。仅在无法用密钥时使用                             |
| Variable | `ZEUS_PLAYGROUND_DEPLOY_HOST`         | 生产主机地址（缺失时 workflow 直接失败，不会静默跳过） |
| Variable | `ZEUS_PLAYGROUND_DEPLOY_USER`         | 默认 `ubuntu`                                          |
| Variable | `ZEUS_PLAYGROUND_DEPLOY_PORT`         | 默认 `22`                                              |
| Variable | `ZEUS_PLAYGROUND_DEPLOY_DIR`          | 默认 `/home/ubuntu/zeus-playground`                    |
| Variable | `ZEUS_PLAYGROUND_CONTAINER`           | 默认 `zeus-playground`                                 |
| Variable | `ZEUS_PLAYGROUND_SANDBOX_URL`         | 生产沙箱文档 URL，构建期写入                           |
| Variable | `ZEUS_PLAYGROUND_HOST_ORIGINS`        | 允许嵌入沙箱的父源                                     |
| Variable | `ZEUS_UI_COMMIT`                      | 与本次 Core 提交配对的 UI 提交                         |
| Variable | `GHCR_MIRRORS`                        | 可选，国内拉取加速源，默认 `ghcr.nju.edu.cn`           |

需要在 `Settings → Environments` 新建 `production` 环境，并按需添加
**Required reviewers**。配置后，即使 push 到 main 自动触发，部署也要人工批准一次。

## 主机侧要求

- 用户可访问 docker（在 `docker` 组），或有免密 `sudo`；workflow 会自动回退到 `sudo -n docker`。
- 容器配置会挂载主机上的 `/home/ubuntu/zeus-playground/nginx.conf`。
  **必须保留这个挂载**：镜像内置的 `nginx.conf` 是通用版，沙箱 CSP 只有
  `sandbox allow-scripts`，没有 `frame-ancestors`；生产文件的
  `frame-ancestors https://playground.moonbyte.top:8443` 才是安全边界。
  `deploy/docker-compose.deploy.yml` 中已保留该挂载。
- 主机需要 `docker compose` 插件。

## 回滚

镜像按 digest 拉取并同时打了 `main`、`sha-<sha>`、日期标签，所以回滚是把
`IMAGE_TAG` 指向旧标签后重跑部署，或直接重新运行对应 commit 的 workflow。

旧的 compose 项目名为 `zeus-playground`，部署脚本带 `--remove-orphans`，
切换时不会留下同名残留容器。

## 生产环境才会暴露的坑（已修）

这三类问题在本地门禁里都看不出来，首次上线时才依次出现，排查顺序值得记住：

1. **构建变量为空 → 页面白屏。** `production` environment 创建晚于当次
   workflow 运行，`vars.*` 全部解析为空，`VITE_ZEUS_SANDBOX_URL` 没有写进产物，
   `resolveSandboxUrl` 因此在公网域名上直接抛错。现在部署前会先校验变量非空。
2. **沙箱资源绝对路径 → 预览永远"未就绪"。** `sandbox.html` 生成的是
   `/assets/...`，而生产把它挂在 `/zeus-sandbox/` 下，请求会越出前缀。
   `vite.config.ts` 的 `relativeSandboxAssets` 插件把它改写成 `./assets/...`，
   根路径与前缀路径都能工作。
3. **内联脚本被 CSP 拦截 → 主题闪烁。** 主机 CSP 是
   `script-src 'self' 'wasm-unsafe-eval'`，内联的预加载脚本被拒绝。现在按
   hash 放行，`pnpm check:playground-theme-i18n` 会从构建产物重新计算 hash，
   与 `deploy/nginx.conf` 声明值不一致时直接失败。

另外 `nginx.conf` 由容器 bind mount，改文件后必须重建容器才生效；workflow 在
检测到内容变化时写入标记，下一次 `up -d` 才带 `--force-recreate`。

## GitHub Pages 部署

除 Docker 生产环境外，Playground 也发布到 GitHub Pages：

- 站点：<https://baicie.github.io/zeus-playground/>
- workflow：`.github/workflows/playground-pages.yml`
- 站点仓库：`baicie/zeus-playground`（只存构建产物，内容每次 force-push 覆盖）

### 为什么宿主和沙箱同源

GitHub Pages 对一个账号只提供一个源（`<owner>.github.io`），所有项目站点都
共用它，因此没办法像 Docker 那样让沙箱跑在第二个端口上。Pages 构建因此显式
打开 `VITE_ZEUS_SANDBOX_SAME_ORIGIN=true`。

隔离**没有因此减弱**：iframe 始终是 `sandbox="allow-scripts"`，从不授予
`allow-same-origin`，浏览器会强制给它一个不透明源。`sandbox.ts` 在
`globalThis.origin !== 'null'` 时直接拒绝启动，配错就失败关闭。
`resolveSandboxUrl` 的同源检查保留为纵深防御，只有显式开启时才放行。

三条引擎验证都确认了 `sandbox reports opaque origin = null`。

### 一次性配置

| 项目     | 值                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| 部署密钥 | `baicie/zeus-playground` 的 Deploy key（read-write），私钥存为 `zeus` 仓库 secret `PLAYGROUND_PAGES_TOKEN` |
| Pages 源 | `baicie/zeus-playground` → Settings → Pages → main / `/`                                                   |

用 SSH deploy key 而不是 PAT：`GITHUB_TOKEN` 无法写别的仓库，PAT 权限更大、
有效期更长，都与这个 job 的实际需要不匹配。

### 与 Docker 生产的差异

|        | GitHub Pages           | Docker 生产               |
| ------ | ---------------------- | ------------------------- |
| 沙箱源 | 同源 + iframe 不透明源 | 独立源（`:18081`）        |
| 编译   | CI 构建后发布静态文件  | 镜像内构建                |
| 部署   | force-push 到站点仓库  | 拉镜像 + compose 滚动更新 |
