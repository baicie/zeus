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
