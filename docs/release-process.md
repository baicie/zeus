# Zeus 发版流程

本文档描述 Zeus 项目的完整发版流程，包括版本管理、发布通道、质量门禁和 CI/CD 自动化。

## 1. 项目概览

| 项目          | 说明                                   |
| ------------- | -------------------------------------- |
| **包管理器**  | pnpm 10.33.4（通过 `preinstall` 强制） |
| **工作区**    | pnpm workspaces + catalog              |
| **构建工具**  | 自定义 Rolldown 构建系统               |
| **版本管理**  | Changesets                             |
| **Node 要求** | >= 18.12.0                             |
| **当前版本**  | 0.1.0-beta.4                           |
| **开发模型**  | Trunk-based（main 为单一主干）         |

### 工作区结构

```yaml
packages:
  - 'packages/core/*' # shared, signal, runtime-dom, compiler, zeus
  - 'packages/devtools/*' # vite-plugin, create-zeus
  - 'packages/web-c/*' # web-c, web-c-runtime, bundler-plugin, ...
  - 'packages/create/*' # zeus-ui, registry
  - 'examples/*'
  - 'benchmarks/*'
  - 'docs'
```

根目录 `package.json` 中的 npm scripts 定义了所有构建和发版相关的命令入口：

```json
{
  "scripts": {
    "dev": "tsx scripts/bundler/build.ts --watch",
    "build": "tsx scripts/bundler/build.ts",
    "build-dts": "tsc -p tsconfig.build.json --noCheck && rollup -c ./scripts/bundler/rollup.dts.config.ts",
    "clean": "rimraf --glob 'packages/*/dist' ... temp .eslintcache",
    "check": "tsc --incremental --noEmit",
    "check:branch": "tsx scripts/check/check-branch-name.ts",
    "check:compiler-cjs": "pnpm build shared compiler -f cjs && tsx scripts/check/check-compiler-cjs.ts",
    "check:exports": "tsx scripts/check/check-package-exports.ts",
    "lint": "eslint --cache .",
    "format": "prettier --write --cache .",
    "format-check": "prettier --check --cache .",
    "test-unit": "vitest --run --project 'unit*'",
    "size:ci": "tsx scripts/size/size-report.ts --ci",
    "docs:build": "pnpm -C docs build",
    "examples:check:all": "tsx scripts/check/check-examples.ts",
    "release": "tsx scripts/release/release.ts",
    "release:publishOnly": "tsx scripts/release/release.ts --publishOnly",
    "release:precheck": "tsx scripts/release/release-precheck.ts",
    "release:retry-tag": "tsx scripts/release/retry-release-tag.ts",
    "release:dry": "tsx scripts/release/release.ts --dry --skipGit",
    "release:canary": "tsx scripts/release/release-canary.ts",
    "api:snapshot": "tsx scripts/api/write-api-snapshots.ts",
    "api:check": "tsx scripts/api/check-api-snapshots.ts"
  }
}
```

## 2. 发布通道

Zeus 维护两条发布通道：

| 通道       | 触发方式                    | 发布目标   | 用途         |
| ---------- | --------------------------- | ---------- | ------------ |
| **Stable** | 推送 git tag `v*`           | npm latest | 正式发布     |
| **Canary** | 推送到 main 或 feature 分支 | npm canary | 持续集成验证 |

## 3. Changesets 配置

### 3.1 配置文件

`.changeset/config.json`：

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "commit": false,
  "fixed": [
    [
      "@zeus-js/shared",
      "@zeus-js/signal",
      "@zeus-js/runtime-dom",
      "@zeus-js/compiler",
      "@zeus-js/zeus",
      "@zeus-js/bundler-plugin",
      "@zeus-js/component-analyzer",
      "@zeus-js/component-dts",
      "@zeus-js/output-wc",
      "@zeus-js/output-react-wrapper",
      "@zeus-js/output-vue-wrapper",
      "@zeus-js/output-css",
      "@zeus-js/output-icons"
    ]
  ],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@zeus-js/vite-plugin",
    "@zeus-js/docs",
    "@zeus-ui/registry",
    "@zeus-bench/component-host",
    "@zeus-ui/headless",
    "zeus-ui",
    "create-zeus"
  ]
}
```

### 3.2 包分组策略

**Fixed 组（同步版本）**：13 个核心包共享同一版本号，任何一个有变更都统一升级。

**Ignored 组（不发版）**：以下包不参与 npm 发布：

- `@zeus-js/vite-plugin` — 实验性
- `@zeus-js/docs` — 文档站，非 npm 包
- `@zeus-ui/registry` / `zeus-ui` / `@zeus-ui/headless` — 未发布
- `@zeus-bench/component-host` — benchmark 工具
- `create-zeus` — 脚手架工具

### 3.3 使用 Changesets

提交用户可见变更前，需要在 `.changeset/` 目录下创建一个 changeset 文件：

```bash
pnpm changeset
```

文件格式（frontmatter + 描述）：

```markdown
---
'@zeus-js/compiler': minor
'@zeus-js/runtime-dom': patch
---

fix(compiler): preserve boolean attributes in JSX transform
```

版本类型遵循 semver：

- `major` — 破坏性变更
- `minor` — 新功能
- `patch` — Bugfix / 类型修复

## 4. Stable 发布流程

### 4.1 完整流程图

```
┌─────────────────────────────────────────────────────────┐
│  开发者本地操作                                          │
├─────────────────────────────────────────────────────────┤
│  1. 创建 changeset 文件                                  │
│     $ pnpm changeset                                    │
│                                                         │
│  2. 提交 PR，合并到 main                                │
│     (CI: lint, type check, build, test, docs)          │
│                                                         │
│  3. 本地执行正式发布命令                                  │
│     $ pnpm release                                      │
│     - 选择版本类型 / 输入自定义版本                        │
│     - 确认 changelog                                    │
│     - 自动 commit + 创建 tag + push                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ tag v* 推送触发
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions: release.yml                            │
├─────────────────────────────────────────────────────────┤
│  4. release:precheck (13 项质量门禁)                     │
│                                                         │
│  5. extract version from tag                            │
│                                                         │
│  6. release --publishOnly --skipBuild                   │
│     - 遍历所有非 private、非 ignored 包                  │
│     - 根据版本号自动选择 npm tag（beta/rc/alpha）          │
│     - 发布到 npm (--access public)                       │
│     - 重试策略：最多 5 次，指数退避                       │
│                                                         │
│  7. 创建 GitHub Release                                 │
└─────────────────────────────────────────────────────────┘
```

### 4.2 release 脚本详解

`scripts/release/release.ts` 是核心发版脚本，完整逻辑如下：

```typescript
// ========== 核心数据结构 ==========

interface ParsedChangeset {
  id: string
  summary: string
  releases: Array<{ name: string; type: string }>
}

// ========== Changeset 解析 ==========

const readChangesets = (): ParsedChangeset[] => {
  // 读取 .changeset/*.md，解析 frontmatter 中的包名+版本类型
  // 以及正文中的变更描述
}

// ========== 统一 Changelog 生成 ==========

const generateUnifiedChangelog = (
  version: string,
  changesets: ParsedChangeset[],
) => {
  // 按 major/minor/patch 分组
  // 生成 ## {version} (date) 格式的 entry
  // 写入根目录 CHANGELOG.md
  // 格式: ### Breaking / Features / Fixes
}

// ========== 清理各包独立 CHANGELOG ==========

const cleanupPackageChangelogs = () => {
  // 删除各 packages/*/CHANGELOG.md
  // 统一只用根目录的 CHANGELOG.md
}

// ========== 固定组版本强制同步 ==========

const forceFixedGroupVersion = (version: string) => {
  // 读取 .changeset/config.json 中的 fixed 数组
  // 遍历固定组中所有包名
  // 将每个包的 package.json.version 强制设为同一版本
}

// ========== CLI 参数解析 ==========

const { values: args, positionals } = parseArgs({
  options: {
    preid: { type: 'string' }, // prerelease id，如 "beta"
    dry: { type: 'boolean' }, // 干跑模式
    tag: { type: 'string' }, // 指定 npm tag
    skipBuild: { type: 'boolean' }, // 跳过构建
    skipGit: { type: 'boolean' }, // 跳过 git 操作
    skipPrompts: { type: 'boolean' }, // 跳过确认
    publish: { type: 'boolean' }, // 是否在脚本内发布
    publishOnly: { type: 'boolean' }, // 仅发布
    registry: { type: 'string' }, // 指定 npm registry
  },
})

// ========== 主流程 (main) ==========

async function main() {
  // 1. 选择版本类型（交互式）或接收 positional 参数
  // 2. 读取 changeset，生成 release.md
  // 3. 执行 pnpm changeset version（更新各包 package.json）
  // 4. 强制固定组版本统一
  // 5. 生成统一 CHANGELOG.md，清理各包 CHANGELOG.md
  // 6. 更新根 package.json 版本
  // 7. 更新 lockfile (pnpm install --prefer-offline)
  // 8. git add + commit + tag + push
  // 9. 提示 CI 将接手 npm 发布
}

// ========== npm 发布逻辑 ==========

async function publishPackages(version: string) {
  const packages = findWorkspacePackages().filter(
    pkg =>
      !pkg.packageJson.private &&
      !changesetIgnore.has(pkg.name) &&
      !changesetIgnore.has(pkg.shortName),
  )
  for (const pkg of packages) {
    const pkgTag = resolveReleaseTag(pkgVersion)
    await publishPackage(pkg.name, pkgVersion, pkgTag, additionalFlags)
  }
}

function resolveReleaseTag(pkgVersion: string): string | null {
  if (args.tag) return args.tag
  if (pkgVersion.includes('alpha')) return 'alpha'
  if (pkgVersion.includes('beta')) return 'beta'
  if (pkgVersion.includes('rc')) return 'rc'
  return null // 所有其他情况使用 latest
}

async function publishPackage(pkgName, version, releaseTag, additionalFlags) {
  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await run(
        'pnpm',
        [
          'publish',
          ...(releaseTag ? ['--tag', releaseTag] : []),
          '--access',
          'public',
          ...additionalFlags,
        ],
        { cwd: getPkgRoot(pkgName) },
      )
      return
    } catch (e) {
      if (isAlreadyPublishedError(e)) return // 已发布则跳过
      if (await isPackagePublished(pkgName, version)) return // npm 上有则跳过
      if (!isRetryablePublishError(e) || attempt === maxAttempts) throw e
      await sleep(getPublishRetryDelay(attempt)) // 指数退避重试
    }
  }
}
```

### 4.3 release 脚本参数

```bash
# 交互式发布（推荐）
pnpm release

# 指定版本号
pnpm release 0.2.0

# 仅发布，跳过 precheck（CI 中使用）
pnpm release --publishOnly 0.2.0 --skipBuild

# 干跑，不执行 git 操作
pnpm release --dry --skipGit

# 指定 npm tag
pnpm release 0.2.0 --tag beta
```

### 4.4 GitHub Actions: release.yml

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    if: github.repository == 'baicie/zeus'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    environment: Release
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version-file: '.node-version'
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Release precheck
        run: pnpm release:precheck

      - name: Extract version from tag
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "VERSION=$VERSION" >> $GITHUB_ENV

      - name: Build and publish
        run: pnpm release --publishOnly ${{ env.VERSION }} --skipBuild
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: yyx990803/release-tag@8cccf7c5aa332d71d222df46677f70f77a8d2dc0
        with:
          tag_name: ${{ github.ref }}
          body: |
            Please refer to [CHANGELOG.md](https://github.com/baicie/zeus/blob/main/CHANGELOG.md) for details.
```

**触发条件**：`git push origin v0.2.0` 推送任意 `v*` 格式的 tag。

**权限**：通过 `environment: Release` 使用受保护的环境变量和 secrets。

## 5. Canary 发布流程

### 5.1 版本号格式

```
{baseVersion}-canary.{date}.{runNumber}.{runAttempt}.{sha}
# 例如：0.1.0-canary.20260609.123.1.a1b2c3d4
```

### 5.2 脚本详解

`scripts/release/release-canary.ts` 完整逻辑：

```typescript
// ========== 版本号生成 ==========

function getCanaryVersion(baseVersion: string) {
  const core = semver.parse(baseVersion)
  const shortSha = process.env.GITHUB_SHA?.slice(0, 8) ?? 'local'
  const runNumber = process.env.GITHUB_RUN_NUMBER ?? Date.now().toString()
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1'
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  return `${core.major}.${core.minor}.${core.patch}-canary.${date}.${runNumber}.${runAttempt}.${shortSha}`
}

// ========== 版本更新 ==========

function updateVersions(version: string) {
  const packages = findWorkspacePackages().filter(isCanaryPackage)
  for (const pkg of packages) {
    const json = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    json.version = version
    writeFileSync(pkgPath, JSON.stringify(json, null, 2))
  }
  // 同步更新根 package.json
}

// ========== 包过滤器 ==========

function isCanaryPackage(pkg: WorkspacePackage): boolean {
  return !pkg.packageJson.private && pkg.name.startsWith('@zeus-js/')
}

// ========== 发布参数 ==========

function getPublishArgs(options: { dryRun?: boolean }): string[] {
  const useProvenance =
    process.env.GITHUB_ACTIONS === 'true' &&
    Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)

  return [
    'publish',
    '--tag',
    'canary',
    '--access',
    'public',
    '--no-git-checks',
    ...(options.dryRun ? ['--dry-run'] : []),
    ...(useProvenance && !options.dryRun ? ['--provenance'] : []),
  ]
}

// ========== 主流程 ==========

async function main() {
  // 仅允许在 CI 或 --force-local 模式下运行
  if (!process.env.CI && !process.argv.includes('--force-local')) {
    console.error(
      'release:canary mutates package versions. It is intended to run in CI.',
    )
    process.exit(1)
  }

  const baseVersion = getBaseVersion()
  const canaryVersion = getCanaryVersion(baseVersion)

  // 将版本号写入 GITHUB_ENV，供下游 workflow 使用
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `ZEUS_CANARY_VERSION=${canaryVersion}\n`,
    )
  }

  updateVersions(canaryVersion)
  await exec('pnpm', ['install', '--lockfile-only']) // 仅更新 lockfile metadata
  await exec('pnpm', ['build'])
  await exec('pnpm', ['build-dts'])
  await exec('pnpm', ['api:check'])
  await exec('pnpm', ['check:exports'])
  await exec('pnpm', ['check:repository'])

  // dry-run 验证每个包可发布
  await dryRunCheck(releasePackages)

  // 实际发布
  await publishCanary()

  // 触发下游 zeus-ui 兼容性检查
  await triggerDownstreamCompatibilityCheck(canaryVersion)
}
```

### 5.3 GitHub Actions: release-canary.yml

```yaml
name: Release Canary
#
# Prerequisites before enabling this workflow:
#
# 1. Create a GitHub Environment named "Canary"
#    (Settings → Environments → New environment → Name: "Canary")
#
# 2. Add secrets to the "Canary" environment:
#    - NPM_TOKEN: npm publish token
#    - ZEUS_UI_DISPATCH_TOKEN: GitHub PAT for downstream repo compatibility check
#
on:
  push:
    branches:
      - main
      - feat/**
      - fix/**
      - refactor/**
      - chore/**
      - docs/**
      - test/**
      - release/**
      - hotfix/**
  workflow_dispatch:

jobs:
  release-canary:
    if: github.repository == 'baicie/zeus'
    runs-on: ubuntu-latest
    environment: Canary
    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 1

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version-file: '.node-version'
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Precheck
        run: |
          pnpm build
          pnpm build-dts
          pnpm api:check
          pnpm check
          pnpm test-unit
          pnpm check:exports
          pnpm check:repository

      - name: Publish canary
        run: pnpm release:canary
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Trigger downstream compatibility check
        if: success()
        run: |
          curl --fail-with-body -X POST \
            -H "Authorization: Bearer ${{ secrets.ZEUS_UI_DISPATCH_TOKEN }}" \
            https://api.github.com/repos/baicie/zeus-ui/dispatches \
            -d '{"event_type":"zeus-canary-published","client_payload":{...}}'
```

## 6. 质量门禁

### 6.1 release:precheck（正式发布前）

13 项检查，按顺序执行，任一失败则阻止发布。

`scripts/release/release-precheck.ts`：

```typescript
/**
 * Release precheck script
 *
 * Note: create-zeus is excluded from this precheck because it is marked as
 * "ignore" in changeset (experimental DX tool, not part of MVP scope).
 */

const steps: Array<[string, string[]]> = [
  ['pnpm', ['check:branch']], // 1. 分支名符合规范
  ['pnpm', ['build']], // 2. 构建所有包（Rolldown）
  ['pnpm', ['check:compiler-cjs']], // 3. 验证 CJS 输出可用
  ['pnpm', ['build-dts']], // 4. 生成 TypeScript 声明文件
  ['pnpm', ['api:check']], // 5. API 快照一致性检查
  ['pnpm', ['check']], // 6. TypeScript 类型检查
  ['pnpm', ['lint']], // 7. ESLint 代码风格检查
  ['pnpm', ['test-unit']], // 8. Vitest 单元测试
  ['pnpm', ['examples:check:all']], // 9. 所有示例构建和类型检查
  ['pnpm', ['docs:build']], // 10. VitePress 文档构建
  ['pnpm', ['size:ci']], // 11. Bundle 大小报告生成
  ['pnpm', ['check:exports']], // 12. Package exports 边界验证
  ['pnpm', ['check:repository']], // 13. 仓库 URL 一致性检查
]

async function run() {
  for (const [command, args] of steps) {
    console.log(`\n> ${command} ${args.join(' ')}\n`)
    await exec(command, args, { stdio: 'inherit' })
  }
  console.log('\nRelease precheck passed.\n')
}
```

### 6.2 CI 门禁（PR 合并前）

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches:
      - main
      - feat/**
      - fix/**
      - refactor/**
      - chore/**
      - docs/**
      - test/**
      - release/**
      - hotfix/**
  pull_request:
    branches:
      - main

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-check:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm check:branch # 分支名检查
      - run: pnpm lint # ESLint
      - run: pnpm format-check # Prettier
      - run: pnpm check # TypeScript

  build:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build # 构建所有包
      - run: pnpm build-dts # 生成 .d.ts
      - run: pnpm api:check # API 快照检查
      - run: pnpm check:exports # exports 边界检查
      - run: pnpm check:repository # 仓库 URL 检查

  test:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test-unit # Vitest 单元测试

  docs-build:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm docs:build # 文档构建
```

### 6.3 Component Host RC 门禁

`.github/workflows/component-host-rc.yml` 在 PR 改动 core/web-c/create 包时触发：

```yaml
name: Component Host RC

on:
  pull_request:
    paths:
      - 'packages/core/**'
      - 'packages/web-c/**'
      - 'packages/create/**'
      - 'examples/**'
      - 'scripts/**'
      - 'docs/**'
      - 'package.json'

jobs:
  fast-rc:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build
      - run: pnpm check
      - run: pnpm test-unit

  integration:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build
      - run: pnpm build-dts
      - run: pnpm check:exports
      - run: pnpm examples:check:all
      - run: pnpm check:registry-cli
      - run: pnpm docs:build

  bench:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build
      - run: pnpm bench:component-host:ci
      - run: pnpm release:rc-notes
      - uses: actions/upload-artifact@v4
        with:
          name: component-host-rc-report
          path: |
            temp/bench/component-host
            temp/release
```

## 7. 构建系统

### 7.1 Rolldown 构建

`scripts/bundler/build.ts` 是自定义构建 orchestrator，使用 `rolldown` 作为 bundler：

```typescript
// ========== 命令行参数 ==========

const { values, positionals: targets } = parseArgs({
  options: {
    formats: { type: 'string', short: 'f' }, // 指定输出格式
    devOnly: { type: 'boolean', short: 'd' }, // 仅开发构建
    prodOnly: { type: 'boolean', short: 'p' }, // 仅生产构建
    withTypes: { type: 'boolean', short: 't' }, // 生成类型声明
    sourceMap: { type: 'boolean', short: 's' }, // Source map
    release: { type: 'boolean' }, // Release 模式
    all: { type: 'boolean', short: 'a' }, // 构建所有匹配
    size: { type: 'boolean' }, // 生成大小报告
    watch: { type: 'boolean', short: 'w' }, // Watch 模式
  },
})

// ========== 并发构建（最多 1 个并发，防止 TS config 冲突） ==========

async function buildAll(targets: string[]): Promise<void> {
  await runParallel(1, targets, build)
}

async function build(target: string): Promise<void> {
  const pkgDir = resolvePackageDir(target)
  const pkg = JSON.parse(readFileSync(`${pkgDir}/package.json`, 'utf-8'))

  // Release 模式或全量构建时跳过 private 包
  if ((isRelease || !targets.length) && pkg.private) return

  const env = pkg.buildOptions?.env || (devOnly ? 'development' : 'production')

  await exec(
    'rolldown',
    [
      '-c',
      './scripts/bundler/rolldown.config.ts',
      '--environment',
      [
        `COMMIT:${commit}`,
        `NODE_ENV:${env}`,
        `TARGET:${target}`,
        formats ? `FORMATS:${encodeURIComponent(formats)}` : '',
        prodOnly ? `PROD_ONLY:true` : '',
        sourceMap ? `SOURCE_MAP:true` : '',
      ]
        .filter(Boolean)
        .join(','),
      watch ? '--watch' : '',
    ],
    { stdio: 'inherit' },
  )
}

// ========== 大小报告 ==========

async function checkFileSize(filePath: string): Promise<void> {
  const file = fs.readFileSync(filePath)
  const gzipped = gzipSync(file)
  const brotli = brotliCompressSync(file)

  console.log(
    `${pico.gray(pico.bold(fileName))} ` +
      `min:${prettyBytes(file.length)} ` +
      `/ gzip:${prettyBytes(gzipped.length)} ` +
      `/ brotli:${prettyBytes(brotli.length)}`,
  )

  if (writeSize)
    fs.writeFileSync(
      path.resolve(sizeDir, `${fileName}.json`),
      JSON.stringify({
        file: fileName,
        size: file.length,
        gzip: gzipped.length,
        brotli: brotli.length,
      }),
    )
}
```

### 7.2 Rolldown 配置

`scripts/bundler/rolldown.config.ts` 详细配置：

```typescript
// ========== 输出格式定义 ==========

const outputConfigs: Record<PackageFormat, OutputOptions> = {
  'esm-bundler': { file: `dist/${name}.esm-bundler.js`, format: 'es' },
  'esm-browser': { file: `dist/${name}.esm-browser.js`, format: 'es' },
  cjs: { file: `dist/${name}.cjs.js`, format: 'cjs' },
  global: { file: `dist/${name}.global.js`, format: 'iife' },
  'esm-bundler-runtime': {
    file: `dist/${name}.runtime.esm-bundler.js`,
    format: 'es',
  },
  'esm-browser-runtime': {
    file: `dist/${name}.runtime.esm-browser.js`,
    format: 'es',
  },
  'global-runtime': { file: `dist/${name}.runtime.global.js`, format: 'iife' },
}

const defaultFormats: ReadonlyArray<PackageFormat> = ['esm-bundler', 'cjs']
const packageFormats = inlineFormats || packageOptions.formats || defaultFormats

// ========== 生产构建配置 ==========

if (process.env.NODE_ENV === 'production') {
  packageFormats.forEach(format => {
    if (format === 'cjs') packageConfigs.push(createProductionConfig(format)) // .prod.js
    if (/^(global|esm-browser)(-runtime)?/.test(format))
      packageConfigs.push(createMinifiedConfig(format)) // .prod.js + minify
  })
}

// ========== 编译宏定义 ==========

function resolveDefine() {
  return {
    __COMMIT__: `"${process.env.COMMIT}"`,
    __VERSION__: `"${packageVersion}"`,
    __TEST__: `false`,
    __BROWSER__: String(isBrowserBuild),
    __GLOBAL__: String(isGlobalBuild),
    __ESM_BUNDLER__: String(isBundlerESMBuild),
    __ESM_BROWSER__: String(isBrowserESMBuild),
    __CJS__: String(isCJSBuild),
    __SSR__: String(!isGlobalBuild),
    __DEV__: String(!isProductionBuild),
  }
}

// ========== 外部依赖处理 ==========

function resolveExternal() {
  if (isGlobalBuild || isBrowserESMBuild) {
    // 浏览器构建：仅排除 tree-shaken deps
    return [
      'source-map-js',
      '@babel/parser',
      'estree-walker',
      'entities/decode',
    ]
  } else {
    // Node / esm-bundler 构建：排除所有 dependencies + peerDependencies + Node 内置模块
    return [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      'module',
      'path',
      'stream',
      'url',
      'fs',
      'fs/promises',
      'node:module',
      'node:path',
      'node:stream',
      'node:url',
      'node:fs',
      'node:fs/promises',
    ]
  }
}

// ========== 完整配置示例（每个包的 package.json） ==========

/*
{
  "name": "@zeus-js/runtime-dom",
  "buildOptions": {
    "formats": ["esm-bundler", "cjs", "global"],
    "env": "browser",
    "additionalEntries": [
      { "entry": "ssr/index.ts", "output": "dist/runtime-dom.ssr.js" }
    ]
  }
}
*/
```

### 7.3 DTS 构建

```bash
# scripts/bundler/rollup.dts.config.ts 使用 @baicie/plugin-dts
# 流程：
# 1. tsc -p tsconfig.build.json --noCheck  # 生成临时声明文件
# 2. rollup -c ./scripts/bundler/rollup.dts.config.ts  # 合并所有 .d.ts
```

### 7.4 输出文件命名规范

以 `@zeus-js/runtime-dom` 为例，构建后产生：

```
dist/
├── runtime-dom.esm-bundler.js           # 开发 ESM
├── runtime-dom.cjs.js                    # 开发 CJS
├── runtime-dom.esm-bundler.prod.js       # 生产 ESM
├── runtime-dom.cjs.prod.js               # 生产 CJS
├── runtime-dom.global.js                 # 开发 UMD (global)
├── runtime-dom.global.prod.js           # 生产 UMD (minified)
├── runtime-dom.runtime.esm-bundler.js   # 仅运行时
├── runtime-dom.runtime.global.js        # 仅运行时 UMD
├── runtime-dom.ssr.js                    # SSR 额外入口
└── runtime-dom.d.ts                      # 合并后的类型声明
```

## 8. 分支模型

采用 **Trunk-based Development**：

```
main  ──────────────────────────────────────────────────────
        └─ feat/compiler-ssr
        └─ fix/runtime-dom-leak
        └─ chore/update-deps
        └─ release/v0.2.0  (临时发布分支)
        └─ hotfix/critical-bug
```

**命名规范**：

| 前缀        | 用途     |
| ----------- | -------- |
| `feat/`     | 新功能   |
| `fix/`      | Bugfix   |
| `refactor/` | 重构     |
| `chore/`    | 维护     |
| `docs/`     | 文档     |
| `test/`     | 测试     |
| `release/`  | 发布准备 |
| `hotfix/`   | 紧急热修 |

**提交规范**：遵循 Conventional Commits

```
feat(compiler): add SSR streaming support
fix(runtime-dom): correct event delegation on nested For
chore: bump rolldown to 1.1.0
```

Git hooks（在 `package.json` 中配置）：

```json
{
  "simple-git-hooks": {
    "pre-commit": "pnpm lint-staged && pnpm check",
    "commit-msg": "node -e \"import('@baicie/scripts').then(m => m.verifyCommit())\""
  },
  "lint-staged": {
    "*.ts?(x)": ["eslint --fix", "prettier --parser=typescript --write"]
  }
}
```

## 9. GitHub Actions 工作流汇总

| Workflow               | 文件                       | 触发                          | 用途                               |
| ---------------------- | -------------------------- | ----------------------------- | ---------------------------------- |
| `CI`                   | `ci.yml`                   | PR / push 到 main 和特征分支  | 基础 CI（lint, build, test, docs） |
| `Release`              | `release.yml`              | Git tag `v*`                  | 正式发版到 npm                     |
| `Release Canary`       | `release-canary.yml`       | Push 到 main/特征分支，或手动 | Canary 发版到 npm                  |
| `Component Host RC`    | `component-host-rc.yml`    | PR 改动 core/web-c/create 包  | RC 验证 + benchmark                |
| `Component Host Bench` | `component-host-bench.yml` | PR 改动 core/web-c            | 性能回归检查                       |
| `Docs`                 | `docs.yml`                 | Push 到 main（docs 目录变更） | 部署文档到 GitHub Pages            |

## 10. 日常发版操作

### 提交一个 Bugfix

```bash
# 1. 从 main 创建特征分支
git checkout -b fix/runtime-dom-leak

# 2. 编写修复代码，添加测试

# 3. 创建 changeset
pnpm changeset
# 选择 @zeus-js/runtime-dom: patch

# 4. 提交 PR，CI 通过后合并到 main
git push origin fix/runtime-dom-leak
# 打开 PR，等待 CI 绿灯
```

### 发布正式版本

```bash
# 1. 确保 main 分支最新
git checkout main && git pull

# 2. 执行发布
pnpm release
# → 选择版本类型，或输入自定义版本
# → 确认 changelog
# → 脚本自动完成 commit、tag、push

# 3. 等待 GitHub Actions release.yml 完成
#    https://github.com/baicie/zeus/actions/workflows/release.yml

# 4. 确认 npm 发布成功
npm view @zeus-js/zeus versions --json | tail -5
```

### 发布 Canary

```bash
# 正常提交 PR，合并后 GitHub Actions 自动触发
# 或手动触发 release-canary.yml (workflow_dispatch)
```

### 验证包可发布性（不实际发布）

```bash
pnpm release --dry --skipGit
```

## 11. 常见问题

### Q: changeset 文件一定要创建吗？

是的。所有用户可见的变更需要 changeset 来生成 CHANGELOG 和确定版本号。只改内部实现而不涉及公共 API 可以不加。

### Q: 哪些包会实际发布到 npm？

满足以下全部条件的包：

- `private: false`（`"private": true` 的包不会发布）
- 不在 Changesets `ignore` 列表中
- 包名以 `@zeus-js/` 开头

### Q: 固定组内一个包改了 patch，其他包版本也会变吗？

会。固定组内所有包强制同步到同一版本，由 `forceFixedGroupVersion()` 函数保证。

### Q: CI 发布失败了怎么办？

使用 `pnpm release:retry-tag` 重试，或者手动修复后重新推送 tag。

### Q: 为什么 release 脚本要分两步（本地 + CI）？

本地 `pnpm release` 负责版本计算、changelog 生成、git commit 和 tag 推送；CI 中的 `release:precheck` 重新执行完整质量门禁后才真正 `pnpm publish`。这样确保版本号和 changelog 在 tag 中不可变，而发布环境完全受控。
