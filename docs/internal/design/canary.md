# Zeus Canary 与下游兼容验证

Zeus 的 canary 策略服务于 main-only trunk 模型：

```txt
短分支 PR
  -> CI
  -> 需要时发 canary
  -> zeus-ui / examples 下游验证
  -> squash merge main
  -> main 自动发 canary
```

canary 不需要独立长期分支。当前触发方式：

```txt
push main
push feat/* / fix/* / refactor/* / chore/* / test/* / release/* / hotfix/*
manual workflow_dispatch
```

PR 需要 canary 时，由维护者从对应分支手动触发 workflow，避免在 PR 上扩大 npm token 暴露面。

canary 验证目标：

```txt
1. zeus-ui 能不能安装
2. vite/rollup/rolldown 示例能不能跑
3. types 能不能被消费
4. exports 是否正确
5. wrapper 是否能正常使用
6. web-c auto 是否不会被 tree-shaking 掉
```

---

下面是一版**结合当前 `baicie/zeus` 代码结构**的 Zeus 侧落地方案。核心目标是：

> **Zeus 每次 API / 能力变化，都能自动产出机器可读信号；zeus-ui 不用人工盯 Zeus，而是通过 canary 包 + API 快照 + capability manifest 自动感知破坏性变化。**

我先说明当前代码现状，再给具体改造方案和代码草案。

---

## 0. 当前 Zeus 代码现状判断

现在 `zeus` 已经不是早期简单的 `packages/*` 结构，而是 workspace 下按领域分组：

```yaml
packages/core/*
packages/devtools/*
packages/web-c/*
packages/create/*
examples/*
benchmarks/*
docs
```

这一点已经在 `pnpm-workspace.yaml` 里体现。

当前核心包包括：

```txt
@zeus-js/zeus
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/compiler
@zeus-js/shared
```

Web Component 相关包也已经存在，例如：

```txt
@zeus-js/output-wc
@zeus-js/output-react-wrapper
@zeus-js/output-vue-wrapper
@zeus-js/output-css
@zeus-js/output-icons
@zeus-js/component-analyzer
@zeus-js/component-dts
@zeus-js/bundler-plugin
@zeus-js/web-c
```

这些在 `docs/api/packages.md` 里已经有清晰描述。

`@zeus-js/zeus` 当前定位是**统一入口包**，并且源码里已经明确写了：

```ts
// User-facing public API — stable, minimal surface area.
// Do NOT export runtime-dom internal helpers here.
```

它当前从 `@zeus-js/signal` 导出 `state / computed / effect / watch / scope / batch / untrack / nextTick / onCleanup`，从 `@zeus-js/runtime-dom` 导出 `render / Show / For / Host / Slot / defineElement`。

同时你已经有 public API 测试，确保 `@zeus-js/zeus` 主入口导出稳定用户 API，并且不导出 `template / insert / marker / bindAttr / mountShow / mountFor` 等内部 runtime helper。

所以我的结论是：

> **Zeus 侧已经具备“API 收口”的基础，但还缺少三个关键闭环：API 快照、capability manifest、canary downstream trigger。**

---

# 1. 最优方案总览

Zeus 侧最终应该形成这条链路：

```txt
开发者修改 Zeus
→ PR CI 校验 public API / package exports / tests / examples
→ main 合并后发布 @zeus-js/*@canary
→ 自动触发 zeus-ui compatibility CI
→ zeus-ui 安装最新 canary 包
→ zeus-ui 跑 typecheck / build / tests / examples
→ 失败就说明 Zeus 破坏了 zeus-ui
```

Zeus 仓库需要新增或加强 5 件事：

```txt
1. 收紧 package exports，禁止 "./*" 暴露内部文件
2. 给 @zeus-js/zeus 和 Web Component 相关包增加 capabilities 导出
3. 增加 API snapshot 检查，追踪 public d.ts 变化
4. 增加 canary 发布脚本和 GitHub Action
5. canary 发布成功后触发 zeus-ui 仓库的兼容性检查
```

---

# 2. 问题 1：当前 exports 还有隐患

当前 `@zeus-js/zeus/package.json` 已经有主入口、JSX runtime 入口，但是仍然保留了：

```json
"./*": "./*"
```

这会导致外部项目可以 import 包内部文件。当前 `@zeus-js/zeus` 的 package exports 里确实存在这个通配导出。

类似地，`@zeus-js/output-wc` 当前也有：

```json
"./*": "./*"
```

`@zeus-js/bundler-plugin` 也有通配导出。

这个对早期开发方便，但对你现在的目标不利。因为 zeus-ui 如果不小心 import 了内部路径，就会导致：

```txt
Zeus 内部重构
→ zeus-ui 无感知依赖了内部实现
→ 后续 break 很难定位
```

## 改造建议

### `packages/core/zeus/package.json`

把：

```json
"./*": "./*"
```

替换成显式入口：

```json
{
  "exports": {
    ".": {
      "types": "./dist/zeus.d.ts",
      "node": {
        "production": "./dist/zeus.cjs.prod.js",
        "development": "./dist/zeus.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/zeus.esm-bundler.js",
      "import": "./dist/zeus.esm-bundler.js",
      "require": "./index.js"
    },
    "./advanced": {
      "types": "./dist/advanced.d.ts",
      "import": "./dist/advanced.js"
    },
    "./capabilities": {
      "types": "./dist/capabilities.d.ts",
      "import": "./dist/capabilities.js"
    },
    "./jsx": {
      "types": "./src/jsx.d.ts"
    },
    "./jsx-runtime": {
      "types": "./jsx-runtime.d.ts",
      "default": "./jsx-runtime.js"
    },
    "./jsx-dev-runtime": {
      "types": "./jsx-dev-runtime.d.ts",
      "default": "./jsx-dev-runtime.js"
    }
  }
}
```

注意：
**不要导出 `./internal` 给普通用户。**
如果编译器内部确实需要 runtime helpers，应该让 `@zeus-js/compiler` 生成到 `@zeus-js/runtime-dom`，而不是让用户项目走 `@zeus-js/zeus/internal`。

---

# 3. 增加 `@zeus-js/zeus/capabilities`

你现在的 docs 里已经把 `Host / Slot / defineElement / props / attrs / events / context` 这些能力列出来了。`defineElement` 文档里已经明确支持 `shadow`、`props`、`styles`、`meta.events`、`Host`、`Slot` 等能力。

但是这些能力目前是**文档描述**，不是机器可读。

zeus-ui 需要的是：

```ts
import { ZEUS_CAPABILITIES } from '@zeus-js/zeus/capabilities'

if (!ZEUS_CAPABILITIES.webComponents.defineElement) {
  throw new Error('Current Zeus does not support defineElement')
}
```

## 新增文件

### `packages/core/zeus/src/capabilities.ts`

```ts
export const ZEUS_CAPABILITIES = {
  packageName: '@zeus-js/zeus',
  version: __ZEUS_VERSION__,

  publicApi: {
    state: true,
    computed: true,
    effect: true,
    watch: true,
    scope: true,
    batch: true,
    untrack: true,
    nextTick: true,
    onCleanup: true,

    render: true,
    Show: true,
    For: true,

    createContext: true,
    provide: true,
    inject: true,
    useContext: true,
  },

  jsx: {
    jsxRuntime: true,
    jsxDevRuntime: true,
    fragment: true,
    compiledJsx: true,
  },

  webComponents: {
    defineElement: true,
    Host: true,
    Slot: true,
    shadowDom: true,
    lightDom: true,
    namedSlots: true,
    defaultSlot: true,
    props: true,
    attrs: true,
    reflect: true,
    events: true,
    styles: true,
    context: true,
  },

  stability: {
    main: 'stable',
    advanced: 'advanced',
    internal: 'private',
  },
} as const

export type ZeusCapabilities = typeof ZEUS_CAPABILITIES
```

这里的 `__ZEUS_VERSION__` 需要在构建阶段替换。

---

# 4. 增加 `advanced` 入口

你当前 `docs/api/stability.md` 已经定义了三类 API：

```txt
@zeus-js/zeus main：稳定用户 API
@zeus-js/zeus/advanced：高级生命周期和调试 API
@zeus-js/zeus/internal：内部 API，无稳定性保证
```

文档里明确写了 main entry 的稳定 API 和 advanced API 范围。

但是当前 `@zeus-js/zeus/package.json` 没有显式 `./advanced` 导出。建议补上。

### `packages/core/zeus/src/advanced.ts`

```ts
// Advanced APIs for power users.
// Stable enough for tools and debugging, but not recommended for general app code.

export {
  stop,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  getCurrentEffect,
  onEffectCleanup,
  pauseTracking,
  enableTracking,
  resetTracking,
  getCurrentWatcher,
  onWatcherCleanup,
  queueJob,
  flushJobs,
  TrackOpTypes,
  TriggerOpTypes,
  ReactiveFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type Scope,
} from '@zeus-js/signal'
```

然后 `packages/core/zeus/package.json` 增加 additional entries。你仓库里 `@zeus-js/bundler-plugin` 已经通过 `buildOptions.additionalEntries` 支持额外入口。

### `packages/core/zeus/package.json` 增加

```json
{
  "buildOptions": {
    "name": "Zeus",
    "formats": ["esm-bundler", "esm-browser", "cjs", "global"],
    "additionalEntries": [
      {
        "entry": "advanced.ts",
        "output": "dist/advanced.js"
      },
      {
        "entry": "capabilities.ts",
        "output": "dist/capabilities.js"
      }
    ]
  }
}
```

如果当前构建脚本对 `additionalEntries` 只支持部分包，就统一在 `scripts/bundler/build.ts` 里支持所有包。

---

# 5. Web Component 输出包也要加 capability

Web Component 相关能力现在分布在：

```txt
@zeus-js/output-wc
@zeus-js/bundler-plugin
@zeus-js/component-analyzer
@zeus-js/component-dts
@zeus-js/web-c
```

`docs/api/packages.md` 已经说明这些包用于将 Zeus 组件库源码编译为多种输出格式，并且 `@zeus-js/output-wc` 是 Web Component 输出。

建议给 `@zeus-js/output-wc` 加：

```ts
@zeus-js/output-wc/capabilities
```

### `packages/web-c/output-wc/src/capabilities.ts`

```ts
export const ZEUS_OUTPUT_WC_CAPABILITIES = {
  packageName: '@zeus-js/output-wc',
  version: __ZEUS_VERSION__,

  output: {
    webComponent: true,
    customElements: true,
    shadowDom: true,
    lightDom: true,
    slots: true,
    props: true,
    attrs: true,
    events: true,
    styles: true,
  },

  manifest: {
    componentManifest: true,
    props: true,
    events: true,
    slots: true,
    cssVars: true,
    cssParts: true,
    dts: true,
  },

  wrappers: {
    react: false,
    vue: false,
  },
} as const

export type ZeusOutputWcCapabilities = typeof ZEUS_OUTPUT_WC_CAPABILITIES
```

### `packages/web-c/output-wc/package.json` 增加

```json
{
  "exports": {
    ".": {
      "types": "./dist/output-wc.d.ts",
      "node": {
        "production": "./dist/output-wc.cjs.prod.js",
        "development": "./dist/output-wc.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/output-wc.esm-bundler.js",
      "import": "./dist/output-wc.esm-bundler.js",
      "require": "./index.js"
    },
    "./capabilities": {
      "types": "./dist/capabilities.d.ts",
      "import": "./dist/capabilities.js"
    }
  },
  "buildOptions": {
    "name": "ZeusOutputWC",
    "formats": ["esm-bundler", "cjs"],
    "additionalEntries": [
      {
        "entry": "capabilities.ts",
        "output": "dist/capabilities.js"
      }
    ]
  }
}
```

同时移除：

```json
"./*": "./*"
```

---

# 6. 增加 API Snapshot 检查

你现在已经有：

```json
"build-dts": "tsc -p tsconfig.build.json --noCheck && rollup -c ./scripts/bundler/rollup.dts.config.ts"
```

这非常适合做 API snapshot，因为生成后的 `dist/*.d.ts` 就是包的真实类型出口。

## 新增目录

```txt
docs/api/snapshots/
  zeus.api.md
  signal.api.md
  runtime-dom.api.md
  compiler.api.md
  output-wc.api.md
  bundler-plugin.api.md
```

## 新增脚本

### `scripts/api/write-api-snapshots.ts`

```ts
import fs from 'node:fs'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

interface SnapshotPackage {
  name: string
  distDts: string
  snapshot: string
}

const repoRoot = path.resolve(import.meta.dirname, '../..')

const includePackages = new Set([
  '@zeus-js/zeus',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/compiler',
  '@zeus-js/output-wc',
  '@zeus-js/bundler-plugin',
  '@zeus-js/component-analyzer',
  '@zeus-js/component-dts',
  '@zeus-js/web-c',
])

function normalizeDts(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getPackageDtsFile(pkg: any) {
  const types = pkg.packageJson.types
  if (!types) return null

  return path.join(pkg.dir, types)
}

function getSnapshotFile(pkgName: string) {
  const fileName = pkgName.replace('@zeus-js/', '').replace(/\//g, '-')

  return path.join(repoRoot, 'docs/api/snapshots', `${fileName}.api.md`)
}

function toSnapshot(pkgName: string, dts: string) {
  return `# ${pkgName} API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run \`pnpm api:snapshot\` to update.

\`\`\`ts
${normalizeDts(dts)}
\`\`\`
`
}

async function main() {
  const packages = findWorkspacePackages()
  const targets: SnapshotPackage[] = []

  for (const pkg of packages) {
    if (!includePackages.has(pkg.name)) continue

    const dtsFile = getPackageDtsFile(pkg)
    if (!dtsFile || !fs.existsSync(dtsFile)) {
      throw new Error(
        `Missing declaration file for ${pkg.name}. Run pnpm build-dts first.`,
      )
    }

    targets.push({
      name: pkg.name,
      distDts: dtsFile,
      snapshot: getSnapshotFile(pkg.name),
    })
  }

  fs.mkdirSync(path.join(repoRoot, 'docs/api/snapshots'), {
    recursive: true,
  })

  for (const target of targets) {
    const dts = fs.readFileSync(target.distDts, 'utf-8')
    const snapshot = toSnapshot(target.name, dts)

    fs.writeFileSync(target.snapshot, snapshot)
    console.log(
      pico.green(`updated ${path.relative(repoRoot, target.snapshot)}`),
    )
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

## 新增检查脚本

### `scripts/api/check-api-snapshots.ts`

```ts
import { execSync } from 'node:child_process'

try {
  execSync('pnpm api:snapshot', { stdio: 'inherit' })

  const diff = execSync('git diff -- docs/api/snapshots', {
    encoding: 'utf-8',
  })

  if (diff.trim()) {
    console.error('\nPublic API snapshot changed.\n')
    console.error(
      'If this is intentional, commit updated docs/api/snapshots files.',
    )
    console.error(
      'If this is breaking, add a major changeset and migration notes.\n',
    )
    console.error(diff)
    process.exit(1)
  }

  console.log('API snapshots are up to date.')
} catch (err) {
  process.exit(1)
}
```

## package.json 增加脚本

```json
{
  "scripts": {
    "api:snapshot": "tsx scripts/api/write-api-snapshots.ts",
    "api:check": "tsx scripts/api/check-api-snapshots.ts"
  }
}
```

## 接入 release precheck

你现在 release precheck 已经会跑：

```txt
build
check:compiler-cjs
build-dts
check
lint
test-unit
examples:check:all
docs:build
size:ci
check:exports
```

建议改成：

```ts
const steps: Array<[string, string[]]> = [
  ['pnpm', ['build']],
  ['pnpm', ['check:compiler-cjs']],
  ['pnpm', ['build-dts']],
  ['pnpm', ['api:check']],
  ['pnpm', ['check']],
  ['pnpm', ['lint']],
  ['pnpm', ['test-unit']],
  ['pnpm', ['examples:check:all']],
  ['pnpm', ['docs:build']],
  ['pnpm', ['size:ci']],
  ['pnpm', ['check:exports']],
]
```

这样一旦 public d.ts 变化，CI 会直接失败，开发者必须确认 API snapshot。

---

# 7. 增加 exports 边界检查

你现在已经有：

```json
"check:exports": "tsx scripts/check/check-package-exports.ts"
```

建议增强它：禁止可发布包存在 `./*`。

### `scripts/check/check-package-exports.ts` 增强逻辑草案

```ts
import fs from 'node:fs'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

const allowWildcard = new Set<string>([
  // 尽量为空。
  // 如果临时保留某个包，必须写原因和 TODO。
])

function main() {
  const packages = findWorkspacePackages()
  let hasError = false

  for (const pkg of packages) {
    const packageJson = pkg.packageJson
    if (packageJson.private) continue
    if (!packageJson.name?.startsWith('@zeus-js/')) continue

    const exportsField = packageJson.exports
    if (!exportsField) continue

    if (
      typeof exportsField === 'object' &&
      Object.prototype.hasOwnProperty.call(exportsField, './*') &&
      !allowWildcard.has(packageJson.name)
    ) {
      hasError = true
      console.error(
        pico.red(
          `${packageJson.name}: exports must not contain "./*". Use explicit public subpaths.`,
        ),
      )
      console.error(`  package: ${path.relative(process.cwd(), pkg.dir)}`)
    }
  }

  if (hasError) {
    process.exit(1)
  }

  console.log(pico.green('Package exports boundary check passed.'))
}

main()
```

这样 zeus-ui 不容易误用内部文件。

---

# 8. 增加 canary 发布脚本

你现在 release 脚本已经支持：

```ts
--tag
--publishOnly
--skipBuild
```

并且 `resolveReleaseTag` 目前只根据 `alpha / beta / rc` 返回 tag。

建议新增专门 canary 脚本，不污染正常 release。

## 新增脚本

### `scripts/release/release-canary.ts`

```ts
import fs from 'node:fs'
import path from 'node:path'

import semver from 'semver'
import pico from 'picocolors'

import { exec, findWorkspacePackages } from '../shared/utils'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function getBaseVersion() {
  const zeusPkgPath = path.join(repoRoot, 'packages/core/zeus/package.json')
  const pkg = JSON.parse(fs.readFileSync(zeusPkgPath, 'utf-8'))
  return pkg.version as string
}

function getCanaryVersion(baseVersion: string) {
  const core = semver.parse(baseVersion)
  if (!core) {
    throw new Error(`Invalid base version: ${baseVersion}`)
  }

  const shortSha = process.env.GITHUB_SHA?.slice(0, 8) ?? 'local'
  const runNumber = process.env.GITHUB_RUN_NUMBER ?? Date.now().toString()

  // 0.1.0-beta.1 -> 0.1.0-canary.20260603-xxxx
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${core.major}.${core.minor}.${core.patch}-canary.${date}.${runNumber}.${shortSha}`
}

function updateVersions(version: string) {
  const packages = findWorkspacePackages()

  for (const pkg of packages) {
    if (pkg.packageJson.private) continue

    // 只发 @zeus-js/*，create/bench/docs 这类先不动
    if (!pkg.name.startsWith('@zeus-js/')) continue

    const pkgPath = path.join(pkg.dir, 'package.json')
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    json.version = version

    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ]) {
      const deps = json[field]
      if (!deps) continue

      for (const name of Object.keys(deps)) {
        if (name.startsWith('@zeus-js/') && deps[name] === 'workspace:*') {
          deps[name] = version
        }
      }
    }

    fs.writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`)
  }

  const rootPath = path.join(repoRoot, 'package.json')
  const root = JSON.parse(fs.readFileSync(rootPath, 'utf-8'))
  root.version = version
  fs.writeFileSync(rootPath, `${JSON.stringify(root, null, 2)}\n`)
}

async function publishCanary() {
  const packages = findWorkspacePackages().filter(pkg => {
    if (pkg.packageJson.private) return false
    return pkg.name.startsWith('@zeus-js/')
  })

  for (const pkg of packages) {
    console.log(
      pico.cyan(`Publishing ${pkg.name}@${pkg.packageJson.version} canary...`),
    )

    await exec(
      'pnpm',
      [
        'publish',
        '--tag',
        'canary',
        '--access',
        'public',
        '--no-git-checks',
        ...(process.env.CI ? ['--provenance'] : []),
      ],
      {
        cwd: pkg.dir,
        stdio: 'inherit',
      },
    )
  }
}

async function main() {
  const baseVersion = getBaseVersion()
  const canaryVersion = getCanaryVersion(baseVersion)

  console.log(pico.cyan(`Preparing Zeus canary: ${canaryVersion}`))

  updateVersions(canaryVersion)

  await exec('pnpm', ['install', '--lockfile-only'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['build-dts'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await publishCanary()

  console.log(pico.green(`Published Zeus canary: ${canaryVersion}`))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

## 根 package.json 增加

```json
{
  "scripts": {
    "release:canary": "tsx scripts/release/release-canary.ts"
  }
}
```

---

# 9. 新增 GitHub Action：canary 发布

当前正式 release 是 tag 触发，只在 `v*` tag 上发布。

新增 main push 的 canary。

### `.github/workflows/release-canary.yml`

```yaml
name: Release Canary

on:
  push:
    branches:
      - main

concurrency:
  group: release-canary-${{ github.ref }}
  cancel-in-progress: true

env:
  PUPPETEER_SKIP_DOWNLOAD: 'true'

jobs:
  release-canary:
    if: github.repository == 'baicie/zeus'
    runs-on: ubuntu-latest

    permissions:
      contents: read
      id-token: write

    environment: Release

    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

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
          pnpm check
          pnpm test-unit
          pnpm check:exports

      - name: Publish canary
        run: pnpm release:canary
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Trigger zeus-ui compatibility check
        if: success()
        run: |
          curl -X POST \
            -H "Accept: application/vnd.github+json" \
            -H "Authorization: Bearer ${{ secrets.ZEUS_UI_DISPATCH_TOKEN }}" \
            https://api.github.com/repos/baicie/zeus-ui/dispatches \
            -d '{"event_type":"zeus-canary-published","client_payload":{"source":"zeus","sha":"${{ github.sha }}"}}'
```

`ZEUS_UI_DISPATCH_TOKEN` 需要是能触发 `baicie/zeus-ui` repository_dispatch 的 token。

如果你的组件库仓库实际叫 `zeus-web`，改成：

```txt
https://api.github.com/repos/baicie/zeus-web/dispatches
```

---

# 10. CI 增加 API 检查

当前 CI 有 lint/check/build/test/docs build。

建议把 API check 加到 build job：

```yaml
build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5

    - name: Install pnpm
      uses: pnpm/action-setup@v4

    - name: Setup Node.js
      uses: actions/setup-node@v5
      with:
        node-version-file: '.node-version'
        cache: 'pnpm'

    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: pnpm build-dts
    - run: pnpm api:check
    - run: pnpm check:exports
```

这样 PR 里只要 public `.d.ts` 变了，就必须提交 snapshot。

---

# 11. 增加 Zeus → zeus-ui 兼容契约文档

新增：

```txt
docs/api/downstream-contract.md
```

内容建议：

```md
# Zeus Downstream Contract

This document defines how downstream packages such as zeus-ui should consume Zeus.

## Allowed Imports

Downstream packages may import from:

- `@zeus-js/zeus`
- `@zeus-js/zeus/advanced`
- `@zeus-js/zeus/capabilities`
- `@zeus-js/output-wc`
- `@zeus-js/output-wc/capabilities`
- `@zeus-js/web-c`

## Disallowed Imports

Downstream packages must not import from:

- `@zeus-js/*/src/*`
- `@zeus-js/*/dist/*`
- `@zeus-js/runtime-dom` internal helper modules
- any undocumented subpath

## Stability

- `@zeus-js/zeus` follows semver.
- `@zeus-js/zeus/advanced` may change during beta.
- internal runtime/compiler helpers are private.
- capability manifests are additive whenever possible.

## Canary Flow

Every merge into Zeus main publishes `@zeus-js/*@canary`.
Downstream projects must run compatibility checks against canary.
```

---

# 12. 推荐最终改动列表

你可以按这个 commit 拆分：

## Commit 1

```txt
refactor: tighten zeus public exports
```

改：

```txt
packages/core/zeus/package.json
packages/web-c/output-wc/package.json
packages/web-c/bundler-plugin/package.json
scripts/check/check-package-exports.ts
```

目的：

```txt
去掉 "./*"，显式声明 public subpath。
```

---

## Commit 2

```txt
feat: add zeus capability manifests
```

新增：

```txt
packages/core/zeus/src/capabilities.ts
packages/core/zeus/src/advanced.ts
packages/web-c/output-wc/src/capabilities.ts
```

改：

```txt
package.json exports
buildOptions.additionalEntries
```

---

## Commit 3

```txt
test: add public api snapshot check
```

新增：

```txt
scripts/api/write-api-snapshots.ts
scripts/api/check-api-snapshots.ts
docs/api/snapshots/*.api.md
```

改：

```txt
package.json scripts
scripts/release/release-precheck.ts
.github/workflows/ci.yml
```

---

## Commit 4

```txt
ci: publish zeus canary and trigger downstream compatibility
```

新增：

```txt
scripts/release/release-canary.ts
.github/workflows/release-canary.yml
```

---

# 13. 最终效果

改完之后，Zeus 侧就具备了这几种能力：

```txt
1. zeus-ui 不再误用 Zeus 内部 API
2. Zeus public API 变化会生成 snapshot diff
3. Zeus 能通过 capabilities 告诉 zeus-ui 当前支持什么能力
4. main 合并后自动发布 @zeus-js/*@canary
5. 发布 canary 后自动触发 zeus-ui 兼容性检查
6. 正式 release 仍然走现有 v* tag 流程，不被 canary 污染
```

这就是最适合你现在两个新项目同时高速迭代的方案：**Zeus 负责发布信号，zeus-ui 负责消费验证，API 变化通过 CI 自动暴露。**
