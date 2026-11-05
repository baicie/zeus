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
`pnpm check:playground-editor` 会先构建它。

## 2. 本地构建与构建标识

```bash
pnpm install --frozen-lockfile
pnpm --filter @zeus-js/compiler-wasm build:wasm
pnpm --filter @zeus-js/compiler-native build:native
pnpm build
pnpm --filter @zeus-js/example-admin build
VITE_ZEUS_SANDBOX_ORIGIN=http://localhost:8081 \
  pnpm --filter @zeus-js/example-playground-editor build
pnpm build:info --product webc-studio,native-lab \
  --dist examples/playground-editor/dist \
  --core-commit "$(git rev-parse HEAD)" \
  --ui-commit "$(git -C ../zeus-ui rev-parse HEAD)" \
  --version "$(node -p "require('./package.json').version")"
```

AI Workbench 在 `zeus-ui` 仓库构建，并写入自己的 build-info。每个
`dist/build-info.json` 包含 Core/UI commit、版本、构建时间、逐文件 SHA-256
和 `artifactDigest`。任何资源变化都会改变 digest。

容器镜像在构建阶段写入同一份 build-info，并带
`org.opencontainers.image.revision/version` 标签。

## 3. 容器与不可变 Digest

WebC Studio / Native Lab：

```bash
cd examples/playground-editor
ZEUS_SANDBOX_ORIGIN=https://sandbox.example.com docker compose up -d --build
```

Admin：

```bash
cd examples/admin
ZEUS_ADMIN_EMAIL=... ZEUS_ADMIN_PASSWORD=... ZEUS_ADMIN_VIEWER_PASSWORD=... \
  docker compose up -d --build
```

AI Workbench + Host：

```bash
cd examples/ai-host
docker compose up -d --build
```

生产环境不得使用可覆盖的 `:r2` 标签。构建后用
`docker image inspect` 读取 `.Id`（本地内容 digest），或使用 registry 的
`RepoDigest`，固定为 `image@sha256:...`。CI 的 `images` job 会上传每个产品的
`imageDigest` 与 build-info；Host Validation 只使用这些 digest。

## 4. CI Provenance

`product-acceptance.yml` 在 Linux 和 Windows 上实际 checkout 两个仓库，记录
`git rev-parse HEAD`，构建并运行四产品预演，然后执行
`write-provenance.ts` 生成 `temp/release/provenance.json`。`images` job 额外
构建四个镜像并生成 `temp/release/image-provenance.json`。

Provenance 是**摘要绑定**的构建记录：它证明 CI 在某个 commit 上构建了具有
某个 artifact/image digest 的产物。它不是加密签名；不要把它描述成签名证明。
若需要签名，可在此之上接入 GitHub Artifact Attestations / Sigstore，并验证
签名者身份。

## 5. 部署验收

真实部署后生成 manifest（不要提交到仓库）：

```json
{
  "schema": "zeus.deployment-manifest/v2",
  "coreCommit": "<40 位 Core commit>",
  "uiCommit": "<40 位 UI commit>",
  "allowedHosts": [
    "studio.example.com",
    "sandbox.studio.example.com",
    "admin.example.com",
    "ai.example.com"
  ],
  "provenance": "provenance.json",
  "products": [
    {
      "product": "webc-studio",
      "url": "https://studio.example.com/webc.html",
      "commit": "<coreCommit>",
      "repository": "baicie/zeus",
      "artifactDigest": "sha256:<64 hex>",
      "imageDigest": "sha256:<64 hex>"
    },
    {
      "product": "native-lab",
      "url": "https://studio.example.com/",
      "commit": "<coreCommit>",
      "repository": "baicie/zeus",
      "artifactDigest": "sha256:<64 hex>",
      "imageDigest": "sha256:<64 hex>"
    },
    {
      "product": "admin",
      "url": "https://admin.example.com/",
      "commit": "<coreCommit>",
      "repository": "baicie/zeus",
      "artifactDigest": "sha256:<64 hex>",
      "imageDigest": "sha256:<64 hex>"
    },
    {
      "product": "ai-workbench",
      "url": "https://ai.example.com/",
      "commit": "<uiCommit>",
      "repository": "baicie/zeus-ui",
      "artifactDigest": "sha256:<64 hex>",
      "imageDigest": "sha256:<64 hex>",
      "healthUrl": "https://ai.example.com/ai-host/health"
    }
  ]
}
```

```bash
ZEUS_ACCEPTANCE_ADMIN_EMAIL=acceptance@example.test \
ZEUS_ACCEPTANCE_ADMIN_PASSWORD=... \
ZEUS_ACCEPTANCE_AI_REPLAY=true \
ZEUS_ACCEPTANCE_TENANT=acceptance-2026-11-05 \
  pnpm check:deployment-acceptance \
    --manifest temp/release/deployment.json \
    --provenance temp/release/provenance.json \
    --write-mode isolated \
    --tenant acceptance-2026-11-05
```

验收会：

- 只接受 `allowedHosts` 中的 HTTPS 域名（443；Playground 还必须包含 sandbox 域名），拒绝 IP、私网、loopback；
- 手动跟随最多 5 次重定向，每一跳都重新校验协议/主机/DNS，并用自定义
  `lookup` 固定连接目标；
- 限制单跳 15 秒、响应体 2 MiB；
- 读取实际部署的 `/build-info.json`，与 manifest、CI provenance 和 image
  digest 比对；
- 验证 HSTS、nosniff、sandbox CSP、Playground 真正跨 Origin 的 opaque
  sandbox；
- Admin 登录与 AI 消息写入只在 `--write-mode isolated --tenant` 下执行，
  否则返回 `BLOCKED`；AI 还要求 `ZEUS_ACCEPTANCE_AI_REPLAY=true`，避免
  Live Provider 产生付费调用。

结果写入 `temp/release/deployment-acceptance.json`。只有四个产品全部通过才是
`ONLINE_ACCEPTED`；任何 `BLOCKED` 都是 `BLOCKED`，任何 `FAIL` 都是
`NOT_ACCEPTED`。本地预演只能得到 `LOCAL_VALIDATED`。

本地四产品预演：

```bash
pnpm check:deployment-local --ui-root ../zeus-ui --browsers chromium
```

## 6. 证据链

`Source Commit → CI Build → Artifact/Image Digest → Test → Deployable RC`

CI artifact 至少包含：`provenance.json`、`image-provenance.json`、
`deployment-acceptance.local.json`、三个产品报告和 DataGrid 报告。CI 的
commit 来自实际 checkout，不是分支名推断；任意一仓 HEAD 与 manifest 不一致
都会失败。

## 7. 跨平台验收

```bash
gh workflow run product-acceptance.yml \
  --repo baicie/zeus --ref <branch> -f ui-ref=<zeus-ui-branch>
```

push 到 `feat/release-*` 时自动配对同名 UI 分支并运行。Linux 执行三引擎、
DataGrid 与镜像 digest；Windows 执行产品门禁与预演（Chromium）。WebKit
在 Windows 不可用，这是平台限制，不是静默跳过。

## 8. 人工验收（不自动化）

VoiceOver、NVDA、键盘导航、焦点管理、200% 缩放与移动端布局必须由人工完成。
`ZEUS_MANUAL_A11Y`、`ZEUS_CROSS_PLATFORM`、`ZEUS_JOINT_RELEASE_APPROVED`
只能由实际完成验收/审批的人设置。
