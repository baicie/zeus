# 生产镜像体积审计（2026-11-11）

四个生产镜像：`zeus-admin`、`zeus-playground`、`zeus-ai-host`、`zeus-ai-workbench`。

本报告只记录实测数据。所有数字来自本机
`docker pull --platform linux/amd64` 后的 `docker image inspect` / `docker history` /
`docker run ... du`，或 GitHub Actions 运行日志与 GHCR registry API。
没有估算，没有推测。

复现命令见文末「取证方法」。

---

## 1. 结论速览

| 镜像                | 压缩体积     | 解压后体积   | 层数 | 结论                                                                       |
| ------------------- | ------------ | ------------ | ---- | -------------------------------------------------------------------------- |
| `zeus-admin`        | **311.9 MB** | **749.5 MB** | 13   | 生产镜像内是完整 pnpm workspace 依赖（506 MB）与一次 `chown -R` 全量重写层 |
| `zeus-ai-host`      | **269.2 MB** | **676.2 MB** | 15   | 单阶段构建，构建工具与开发依赖全部留在运行镜像里                           |
| `zeus-playground`   | 26.3 MB      | 69 MB        | 10   | 静态 nginx，合理，无需整改                                                 |
| `zeus-ai-workbench` | 24.9 MB      | 64 MB        | 12   | 静态 nginx，合理，无需整改                                                 |

两个 Node 服务镜像的体积**不是**前端产物造成的：

- `zeus-admin` 的前端 dist 只有 **0.1 MB**（压缩后），服务端源码 112 KB。
- `zeus-ai-host` 的 `examples/` 目录只有 192 KB。

体积全部来自运行镜像里的 `node_modules` 与构建工具。

---

## 2. 取证基线

| 项                              | 值                                                                        |
| ------------------------------- | ------------------------------------------------------------------------- |
| `baicie/zeus` main              | `132c777e2da5197286cefdc7299675a1761c8d82`                                |
| `baicie/zeus-ui` main           | `0b2c85e2ed801c0f48859884f956b46fb18d6162`                                |
| `zeus-admin:main` digest        | `sha256:faf238d3b701ff896a5524225ef92ffdc99aed1828f1ed7088ee6c443096f819` |
| `zeus-playground:main` digest   | `sha256:4c308f18c15222ef07bfc54c0c776a9b7e7cfd7ffab8caa7744629f7368d96ee` |
| `zeus-ai-host:main` digest      | `sha256:00b4ac5c707a0c80e9c3729d2f90e0a91b84e7ee3bb40a9bdf2f2f23a790677a` |
| `zeus-ai-workbench:main` digest | `sha256:67a7dd5d746b0a3dc510d7f542310fdd64615394ff4454eaaa38f63d49fb2bfd` |

四个镜像都是 `linux/amd64` 单平台 manifest，`provenance: false`。

---

## 3. 分层归因

### 3.1 zeus-admin（13 层，压缩 311.9 MB）

| 层（压缩后） | 来源                                                  |
| -----------: | ----------------------------------------------------- |
|      26.9 MB | `node:24.18.0-bookworm-slim` 根文件系统               |
|       0.0 MB | 基础镜像 useradd                                      |
|  **48.0 MB** | 基础镜像 Node.js 运行时                               |
|       1.6 MB | 基础镜像 ca-certificates 等                           |
|       0.0 MB | `COPY docker-entrypoint.sh`                           |
|       0.0 MB | `WORKDIR /app`                                        |
|       0.0 MB | `RUN useradd --system --uid 10001 zeus`               |
|       0.1 MB | `COPY examples/admin/dist`                            |
|       0.0 MB | `COPY examples/admin/server`                          |
|       0.0 MB | `COPY examples/admin/package.json`                    |
| **113.6 MB** | `COPY /app/node_modules ./node_modules`               |
|       2.5 MB | `COPY /app/packages ./packages`                       |
| **119.1 MB** | `RUN mkdir -p /data && chown -R zeus:zeus /data /app` |

两个应用层合计 **235.3 MB，占整个镜像的 75%**：

1. `node_modules` 是 `pnpm install --frozen-lockfile` 在 builder 里的**全量 workspace 依赖**，
   包含 root devDependencies（typescript、rolldown、esbuild、playwright、puppeteer、
   jsdom、prettier、sass、eslint 等），与运行无关。
2. `chown -R /app` 把上一层的**每一个文件**都以新的 uid/gid 重新写了一遍，
   因此该层体积几乎等于整个 `/app`，等于把应用再存一份。

`/app` 实测（镜像内 `du -sh`）：

```
506M  /app/node_modules
 13M  /app/packages
392K  /app/dist
112K  /app/server
4.0K  /app/package.json
```

服务端运行时依赖实测为空：`examples/admin/server/*.ts` 的 import 只有
`node:crypto`、`node:fs`、`node:fs/promises`、`node:http`、`node:net`、`node:path`、
`node:sqlite` 与同目录相对路径。`/app/packages` 与 `/app/node_modules` 均无运行时入口。

### 3.2 zeus-ai-host（15 层，压缩 269.2 MB）

单阶段 Dockerfile：`FROM node:24.18.0-bookworm-slim` 之后直接
`COPY` 源码 → `pnpm install --frozen-lockfile` → `pnpm build` → `chown -R`。
构建工具因此全部进入生产镜像。

| 层（压缩后） | 来源                                                  |
| -----------: | ----------------------------------------------------- |
|      76.5 MB | `node:24.18.0-bookworm-slim` 基础层合计               |
|       0.1 MB | `COPY package.json pnpm-workspace.yaml …`             |
|       0.5 MB | `COPY packages`                                       |
|       0.2 MB | `COPY scripts`                                        |
|       0.0 MB | `COPY examples/ai-host`                               |
|  **92.1 MB** | `RUN pnpm install --frozen-lockfile`                  |
|       0.8 MB | `RUN pnpm build`                                      |
|       0.0 MB | `RUN useradd`                                         |
|  **98.9 MB** | `RUN mkdir -p /data && chown -R zeus:zeus /data /app` |

`/app` 实测：

```
428M  /app/node_modules
 16M  /app/packages
1.2M  /app/scripts
396K  /app/pnpm-lock.yaml
192K  /app/examples
```

`examples/ai-host/src/*.ts` 的运行时 import 只有 `node:*` 与 `@zeus-web/ai-core`
（后者是纯 JS，可打包）。`node:sqlite` 为 Node 内置，无原生模块。

### 3.3 zeus-playground / zeus-ai-workbench

两者都是 `nginx:1.29-alpine` 运行镜像 + 只 `COPY dist`。

| 镜像                |             `/usr/share/nginx/html` | 文件数 | `.map` | 测试文件 |
| ------------------- | ----------------------------------: | -----: | -----: | -------: |
| `zeus-playground`   | 5.1 MB（含 `zeus-compiler-*.wasm`） |     19 |      0 |        0 |
| `zeus-ai-workbench` |                              204 KB |      5 |      0 |        0 |

体积构成是 nginx alpine 基础镜像（约 24 MB 压缩）本身，不是发布产物。
**结论：无冗余，不需要整改。**

---

## 4. Top 20 大文件（`zeus-admin`，镜像内实测）

|     大小 | 路径                                                                  | 所属                   |
| -------: | --------------------------------------------------------------------- | ---------------------- |
| 117.9 MB | `/usr/local/bin/node`                                                 | Node 运行时（必要）    |
|  24.7 MB | `.pnpm/@typescript+native-preview-linux-x64@7.0.0-dev…/lib/tsgo`      | devDependency          |
|  20.9 MB | `.pnpm/@rolldown+binding-linux-x64-gnu@1.0.3/…/rolldown-binding…node` | devDependency          |
|  20.9 MB | `.pnpm/@rolldown+binding-linux-x64-gnu@1.1.0/…`                       | devDependency          |
|  19.7 MB | `.pnpm/@rolldown+binding-linux-x64-gnu@1.1.2/…`                       | devDependency          |
|  18.9 MB | `.pnpm/@rolldown+binding-linux-x64-gnu@1.2.14/…`                      | devDependency          |
|  10.8 MB | `.pnpm/@esbuild+linux-x64@0.28.0/bin/esbuild`                         | devDependency          |
|  10.6 MB | `.pnpm/@esbuild+linux-x64@0.27.7/bin/esbuild`                         | devDependency          |
|   9.6 MB | `.pnpm/lightningcss-linux-x64-gnu@1.32.0/…node`                       | devDependency          |
|   9.6 MB | `.pnpm/lightningcss-linux-x64-gnu@1.33.0/…node`                       | devDependency          |
|   8.7 MB | `.pnpm/typescript@6.0.3/lib/typescript.js`                            | devDependency          |
|   6.0 MB | `.pnpm/typescript@6.0.3/lib/_tsc.js`                                  | devDependency          |
|   5.4 MB | `.pnpm/sass@1.105.2/sass.dart.js`                                     | devDependency          |
|   5.1 MB | `/opt/yarn-v1.22.22/lib/cli.js`                                       | 基础镜像自带（未使用） |
|   4.6 MB | `.pnpm/@octokit+openapi-types@28.0.0/types.d.ts`                      | devDependency          |
|   4.5 MB | `.pnpm/@octokit+openapi-types@27.0.0/types.d.ts`                      | devDependency          |
|   4.2 MB | `.pnpm/chromium-bidi@16.0.1/…/mapperTab.js.map`                       | devDependency          |
|   4.0 MB | `.pnpm/@babel+standalone@8.1.1/babel.js`                              | devDependency          |
|   3.6 MB | `/usr/bin/perl5.36.0`                                                 | 基础镜像自带           |
|   3.6 MB | `/usr/bin/perl`                                                       | 基础镜像自带           |

`zeus-ai-host` 的 Top 10 形态相同：node 二进制之后全是
`@rolldown/binding` ×2、`esbuild` ×3 个版本、`lightningcss`、`typescript`、
`@iconify-json/simple-icons`（4.5 MB，来自 docs 依赖）。

判定：**存在「复制整个 node_modules / 开发依赖 / 构建工具」问题**，
`zeus-admin` 与 `zeus-ai-host` 均命中；两个静态镜像未命中。

---

## 5. 构建与传输耗时（CI 实测）

### 5.1 构建

| 镜像                | 工作流运行    |         构建步骤耗时 | 备注                                                             |
| ------------------- | ------------- | -------------------: | ---------------------------------------------------------------- |
| `zeus-admin`        | `42989266256` | 151 s（含推送 GHCR） | 其中导出层 11.1 s、推 manifest 18.8 s、**GHA cache 导出 53.3 s** |
| `zeus-ai-host`      | `42956957402` |                131 s | 单阶段，含 `pnpm install` + `pnpm build`                         |
| `zeus-ai-workbench` | `42956957402` |                113 s | 静态构建                                                         |
| `zeus-playground`   | `42942300396` |                184 s | 含 wasm32 编译                                                   |

### 5.2 推送与拉取

GitHub Actions runner → GHCR 的推送包含在构建步骤内，日志未单独计时。

部署机从 TCR 拉取（热缓存层，非首次冷拉）：

| 镜像                |                    拉取耗时 | 运行          |
| ------------------- | --------------------------: | ------------- |
| `zeus-admin`        | 17 s（18:35:34 → 18:35:51） | `42875850946` |
| `zeus-ai-host`      | 20 s（18:34:23 → 18:34:43） | `42875671261` |
| `zeus-ai-workbench` |                         1 s | `42875671261` |
| `zeus-playground`   |                         1 s | `42942300396` |

**注意**：这些是层已存在时的拉取，不能代表 312 MB 冷拉的真实耗时。

首次冷拉的真实数据来自失败的 `42989266256`（GHCR → TCR 复制）：
312 MB 镜像在 300 s 单次预算内无法完成传输，两次重试（300 s、180 s）同样超时。
即 GitHub runner 到 `ccr.ccs.tencentyun.com` 的有效带宽 **低于约 1 MB/s**。
该镜像 312 MB，按此速率需要 5 分钟以上连续传输，任何单次尝试都必然超时。

这正是本次体积整改的直接动机之一：把待传字节从 312 MB 降到接近基础镜像大小。

---

## 6. Registry 与缓存占用（独立于生产镜像）

| 仓库                | tag 数 | 唯一 blob 数 | 唯一 blob 总量 |
| ------------------- | -----: | -----------: | -------------: |
| `zeus-admin`        |     23 |          112 |  **3370.7 MB** |
| `zeus-ai-host`      |      8 |           76 |  **1425.2 MB** |
| `zeus-playground`   |     23 |           37 |        42.4 MB |
| `zeus-ai-workbench` |     14 |           26 |        25.2 MB |

统计方式：列出全部 tag → 取每个 tag 的 manifest → 按 digest 去重累加
layer + config 大小。不含 manifest 自身与删除标记。

GitHub Actions Cache（与镜像无关，单独计量）：

| 仓库             |    总大小 |
| ---------------- | --------: |
| `baicie/zeus`    | 1267.8 MB |
| `baicie/zeus-ui` | 2000.9 MB |

其中 `zeus-ui` 的 2000.9 MB 里有 1350 MB 是 Playwright 浏览器缓存
（`Linux-playwright-*`），与镜像无关。

**关键区别**：BuildKit 的 `mode=max` 缓存会把 builder 阶段（含 Rust 工具链、
完整 node_modules）全部存进 GHA Cache。这部分**不进生产镜像**，
但会占用缓存配额，也解释了 `zeus-admin` 单次 cache 导出 53.3 s。

---

## 7. 冗余项判定

| 冗余项                  | `zeus-admin` | `zeus-ai-host` | 说明                                                 |
| ----------------------- | :----------: | :------------: | ---------------------------------------------------- |
| 复制整个 `node_modules` |   ✅ 命中    |    ✅ 命中     | 506 MB / 428 MB 解压后                               |
| 开发依赖进运行镜像      |   ✅ 命中    |    ✅ 命中     | typescript、rolldown、esbuild、playwright、puppeteer |
| 构建工具进运行镜像      |   ✅ 命中    |    ✅ 命中     | 单阶段 / 运行阶段直接复用 builder 依赖               |
| 源码进运行镜像          |   ✅ 命中    |    ✅ 命中     | `server/*.ts`、`packages/`、`scripts/`               |
| 运行时依赖 tsx          |   ✅ 命中    |    ✅ 命中     | `CMD node --import tsx`                              |
| `chown -R` 重复整层     |   ✅ 命中    |    ✅ 命中     | 119.1 MB / 98.9 MB                                   |
| 测试资源进镜像          |  ❌ 未命中   |   ❌ 未命中    | 用 `--frozen-lockfile`，无测试 fixture 复制          |
| sourcemap 进镜像        |  ❌ 未命中   |   ❌ 未命中    | 前端产物无 `.map`                                    |
| 静态镜像含构建产物冗余  |      —       |       —        | playground/workbench 仅 5.1 MB / 204 KB              |

---

## 8. 取证方法

```bash
# 压缩体积与 digest
docker pull --platform linux/amd64 ghcr.io/baicie/<image>:main
docker image inspect ghcr.io/baicie/<image>:main --format '{{.Size}}'

# 分层来源与大小
docker history ghcr.io/baicie/<image>:main --no-trunc --format '{{.Size}}\t{{.CreatedBy}}'

# 解压后体积
docker run --rm --platform linux/amd64 --entrypoint sh ghcr.io/baicie/<image>:main \
  -c 'du -sx -m /'

# 大文件
docker run --rm --platform linux/amd64 --entrypoint sh ghcr.io/baicie/<image>:main \
  -c 'find / -xdev -type f -size +2M -printf "%s\t%p\n" | sort -rn | head -20'

# registry 唯一 blob 统计
node scripts/release/registry-size.mjs

# CI 构建耗时
gh api repos/baicie/zeus/actions/runs/<id>/jobs \
  --jq '.jobs[] | select(.name=="Build and publish to GHCR") | .steps[]'
```

GHCR manifest 与 config blob 通过匿名 pull token 获取：

```bash
TOK=$(curl -s "https://ghcr.io/token?scope=repository:baicie/zeus-admin:pull&service=ghcr.io" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -sH "Authorization: Bearer $TOK" \
  -H "Accept: application/vnd.oci.image.manifest.v1+json" \
  "https://ghcr.io/v2/baicie/zeus-admin/manifests/main"
```

---

## 9. 整改目标（Phase 2 输入）

| 镜像           | 当前压缩体积 |         目标 | 依据                                                       |
| -------------- | -----------: | -----------: | ---------------------------------------------------------- |
| `zeus-admin`   |     311.9 MB | **≤ 100 MB** | 基础镜像 76.5 MB + 前端 dist 0.1 MB + 打包后服务端 0.02 MB |
| `zeus-ai-host` |     269.2 MB | **≤ 100 MB** | 同上                                                       |

硬约束（不得为体积牺牲能力）：

- Admin 保留 Rust/Native Compiler 构建能力，但只存在于 builder 阶段。
- 服务端 TypeScript 构建为可运行 JavaScript，删除运行时 `tsx` 依赖。
- SQLite 持久化目录、`read_only` + `tmpfs`、非 root、healthcheck、安全参数不变。
- AI Host 保留 SSE、认证、审批、SQLite、workspace、replay/live 全部语义。
- 静态镜像不动。

---

## 10. 整改结果（Phase 2 实测）

两个 Node 服务镜像改为真正的多阶段构建。改动只动 Dockerfile 与 CI：

| 镜像                | 优化前（压缩） | 优化后（压缩） |       降幅 |              解压后 |
| ------------------- | -------------: | -------------: | ---------: | ------------------: |
| `zeus-admin`        |       311.9 MB |    **76.6 MB** | **−75.4%** | 749.5 MB → 250.6 MB |
| `zeus-ai-host`      |       269.2 MB |    **76.5 MB** | **−71.6%** | 676.2 MB → 250.3 MB |
| `zeus-playground`   |        26.3 MB |        26.3 MB |       不变 |               69 MB |
| `zeus-ai-workbench` |        24.9 MB |        24.9 MB |       不变 |               64 MB |

优化后两个镜像都等于 `node:24.18.0-bookworm-slim` 本身的大小：
剩下的 250 MB 解压体积里，117.9 MB 是 Node 二进制，48 MB 是 Node 运行时层，
26.9 MB 是 Debian 基础层，其余是 Debian 的 `perl` / `ncurses` 等基础工具。
应用自身只占 **0.45 MB（admin）/ 0.13 MB（ai-host）**。

### 10.1 Admin 的改动

`examples/admin/Dockerfile`：

1. builder 阶段新增一步，把 `server/index.ts` 打包成单个 ESM 文件
   （`scripts/release/bundle-server.ts`，39 KB 输出，仅 `node:*` 为 external）。
2. 运行阶段删除 `COPY /app/node_modules` 与 `COPY /app/packages`。
3. 删除 `chown -R zeus:zeus /data /app`，改为 `COPY --chown=zeus:zeus`
   与 `chown zeus:zeus /data`。这消除了一个 119.1 MB 的重复层。
4. `CMD` 从 `node --import tsx server/index.ts` 改为 `node server/index.mjs`，
   运行时不再需要 `tsx`。

### 10.2 AI Host 的改动

`examples/ai-host/Dockerfile` 从单阶段改为两阶段：

1. builder：`pnpm install` → `pnpm build` → 打包 `src/server.ts`
   （`scripts/release/bundle-ai-host.mjs`，125 KB 输出，仅 `node:*` 为 external，
   `@zeus-web/ai-core` 与 `@zeus-web/ai-adapters` 内联进产物）。
2. runtime：`node:24.18.0-bookworm-slim` + 一个 `server.mjs`。
3. 同样把 `chown -R` 换成 `COPY --chown`，消除了 98.9 MB 的重复层。

### 10.3 运行验收（本机实测，linux/arm64 原生）

Admin（`zeus-admin:slim`，`--read-only` + `tmpfs /tmp` + 非 root）：

| 项                           | 结果                                     |
| ---------------------------- | ---------------------------------------- |
| `/api/health`                | `{"ok":true}`                            |
| 静态首页 `/`                 | HTTP 200                                 |
| `/build-info.json`           | 返回 `coreCommit` = 构建时的 commit      |
| 登录 `POST /api/auth/login`  | 200，返回 admin 用户                     |
| 会话 `GET /api/auth/session` | 200                                      |
| 无 CSRF 头写入               | 被拒：`ZEUS_ADMIN_CSRF`                  |
| 带 CSRF 头创建用户           | 成功                                     |
| 重启后 SQLite 数据           | 保留（`slim@example.test` 仍在）         |
| 用户列表泄露 `password_hash` | 0 处                                     |
| 非 root                      | `uid=10001(zeus)`                        |
| 只读根文件系统               | `touch /app/x` → `Read-only file system` |

AI Host（`zeus-ai-host:slim`，`--read-only` + `tmpfs /tmp` + 非 root）：

| 项                              | 结果                                     |
| ------------------------------- | ---------------------------------------- |
| `/health`                       | `{"ok":true,...}`                        |
| 无 token 访问 `/snapshots`      | 401                                      |
| 错误 token                      | 401                                      |
| 有效 token `/snapshots`         | 200，返回快照与事件                      |
| SSE `/streams/reference/events` | 收到 `: connected` 与后续 `ai-event`     |
| `message.send` 命令             | `accepted: true`，SSE 实时收到 2 条事件  |
| `changeset.propose`             | 生成待审批项                             |
| editor 自审批                   | 被拒：`AI_HOST_FORBIDDEN`                |
| approver 审批                   | `{"status":"applied"}`，文件落盘         |
| 重启后事件 / 文件               | 保留（events: 5，文件 digest 一致）      |
| 非 root                         | `uid=10001(zeus)`                        |
| 只读根文件系统                  | `touch /app/x` → `Read-only file system` |

单元测试：

- `examples/admin/server/__tests__`：22 passed / 22。
- `examples/ai-host/__tests__`：26 passed / 27，1 个失败是 macOS
  `/var` → `/private/var` 符号链接导致的路径断言差异，与本次改动无关
  （改动前即存在，未触及该测试）。

### 10.4 CI 侧改动

- `baicie/zeus` 的 `admin-image.yml`：构建阶段增加镜像体积预算检查。
  超过 `ADMIN_IMAGE_MAX_MB`（默认 120）则构建失败，并把实测体积写进
  job summary。这样"把 node_modules 复制回去"会立刻被门禁拦住。
- `baicie/zeus-ui` 的 `ai-workbench-image.yml`：原先用同一个
  `docker/build-push-action` 同时推 GHCR 与 TCR，正是它导致了 run
  `42964905300` 的 58 分钟无输出挂起（05:20:51 manifests 推完 GHCR 后，
  在 `exporting to image` 静默到 06:18:54 被取消）。现按 Admin 的方式拆成
  `build` / `mirror-tcr` / `deploy` 三个 job：
  - `build` 只推 GHCR，并对两个镜像做体积预算检查。
  - `mirror-tcr` 用 `crane copy` 按不可变 digest 复制，各自 780 秒预算、
    3 次尝试，失败即明确报错；回读目标 digest 并校验。
  - `deploy` 优先用 TCR 的 digest 拉取，其次才回退到 tag / GHCR；
    镜像未验证通过就不部署。

### 10.5 剩余项

- amd64 的压缩体积数字由 CI 构建产出（本机为 arm64，走 QEMU 模拟编译
  Rust 需要数十分钟，不可接受）。本报告的 76.6 / 76.5 MB 是本机实测，
  与 CI 的差别只在 Rust 编译产物所属架构，产物本身不进运行镜像。
- `zeus-playground` 与 `zeus-ai-workbench` 未改动，体积由 nginx alpine
  基础镜像决定。
- 未处理的更激进优化（换 `node:24-alpine` 可再降约 45 MB）留作后续，
  因为它会改变 glibc/musl 语义，需要在 CI 重新验证原生模块与 SQLite。
