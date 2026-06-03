结论：**方向对，当前实现已经接近可落地，但不建议直接合并。**
我建议先修完下面这些点再进主线，尤其是 **canary 发布脚本的可靠性** 和 **API snapshot 覆盖范围**。当前分支只领先 `main` 1 个提交，改动主要集中在 canary 发布、API snapshot、capabilities、exports 收紧这几块。

---

# 总体评价

做得好的地方：

1. **`./*` 通配 exports 已经基本移除**，这一步很关键，可以避免 zeus-ui 误用内部 API。
2. **`@zeus-js/zeus/advanced` 和 `@zeus-js/zeus/capabilities` 已经加上**，方向正确。`@zeus-js/zeus` 的 package exports 已显式暴露 `./advanced` 和 `./capabilities`。
3. **`@zeus-js/output-wc/capabilities` 也加了**，适合 zeus-ui 判断 Web Component 输出能力。
4. **CI 已经接入 `api:check` 和 `check:exports`**，build job 里会在 `build`、`build-dts` 后检查 API snapshot 和 package exports。
5. **release precheck 也已经接入 `api:check`**，正式 release 前会检查 API snapshot。

但是当前有几个 P0/P1 问题，尤其是 canary publish 这一块，有概率出现**半发布、重复发布失败、锁文件污染、snapshot 漏检**。

---

# P0：必须修

## 1. `release-canary.ts` 里 `findWorkspacePackages()` 使用 `require` 会有 JSON 缓存问题

当前 `findWorkspacePackages()` 读取 `package.json` 用的是：

```ts
const packageJson = require(pkgJsonPath)
```

这会被 Node require cache 缓存。

但 `release-canary.ts` 里先调用 `findWorkspacePackages()`，再写回所有包的 `package.json` 版本号。
后面 `publishCanary()` 又调用 `findWorkspacePackages()`，并且打印 `pkg.packageJson.version`。

这会导致一个问题：

```txt
第一次读取 package.json：缓存了 0.1.0-beta.1
updateVersions 写成 0.1.0-canary.xxx
第二次 findWorkspacePackages 仍可能拿到 require cache 里的旧 packageJson
```

即使 `pnpm publish` 会读磁盘文件，脚本内部状态也可能是旧的，后续一旦你用 `pkg.packageJson.version` 做判断就会出问题。

### 建议修改

把 `findWorkspacePackages()` 里的 `require(pkgJsonPath)` 改成无缓存读取：

```ts
const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<
  string,
  unknown
>
```

也就是改 `scripts/shared/utils.ts`：

```ts
export function findWorkspacePackages(): WorkspacePackage[] {
  const results: WorkspacePackage[] = []
  const seen = new Set<string>()

  const addPackage = (dir: string, relativeDir: string): void => {
    const pkgJsonPath = path.resolve(dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath) || seen.has(dir)) return

    try {
      const packageJson = JSON.parse(
        fs.readFileSync(pkgJsonPath, 'utf-8'),
      ) as Record<string, unknown>

      results.push({
        name: packageJson.name as string,
        dir,
        relativeDir,
        shortName: path.basename(dir),
        packageJson,
      })

      seen.add(dir)
    } catch (error) {
      throw Object.assign(
        new Error(`Failed to read workspace package: ${pkgJsonPath}`),
        { cause: error },
      )
    }
  }

  // 后面逻辑保持不变
}
```

---

## 2. canary 脚本不应该把 `workspace:*` 改成具体版本

当前 `updateVersions()` 会把所有 `@zeus-js/*` 的 `workspace:*` 依赖改成 canary 版本。

这个不建议。原因是 pnpm 官方 workspace 文档说明：`pnpm pack` / `pnpm publish` 时，会动态把 `workspace:` 依赖替换为目标 workspace 包版本；例如 `workspace:*` 会在发布包里变成对应版本号。([pnpm][1])

所以你没有必要手动改：

```json
"@zeus-js/signal": "workspace:*"
```

变成：

```json
"@zeus-js/signal": "0.1.0-canary.xxx"
```

这么改反而会带来几个问题：

```txt
1. pnpm install --lockfile-only 可能尝试从 registry 解析尚未发布的 canary 版本
2. 本地执行 release:canary 后会污染 package.json
3. workspace 协议的本地强约束被破坏
4. publish 过程失败后恢复成本更高
```

### 建议修改

`updateVersions()` 只改每个包自己的 `version`，不要改 dependencies：

```ts
function updateVersions(version: string) {
  const packages = findWorkspacePackages()

  for (const pkg of packages) {
    if (pkg.packageJson.private) continue
    if (!pkg.name.startsWith('@zeus-js/')) continue

    const pkgPath = path.join(pkg.dir, 'package.json')
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    json.version = version

    fs.writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`)
  }

  const rootPath = path.join(repoRoot, 'package.json')
  const root = JSON.parse(fs.readFileSync(rootPath, 'utf-8'))
  root.version = version
  fs.writeFileSync(rootPath, `${JSON.stringify(root, null, 2)}\n`)
}
```

然后删除这段：

```ts
for (const field of [
  'dependencies',
  'devDependencies',
  'peerDependencies',
] as const) {
  // ...
}
```

---

## 3. `dryRunCheck()` 大概率会因为 git dirty 失败

当前 canary 脚本流程是：

```txt
updateVersions()
pnpm install --lockfile-only
pnpm build
pnpm build-dts
dryRunCheck()
publishCanary()
```

`updateVersions()` 会改一堆 `package.json`，`pnpm install --lockfile-only` 还可能改 `pnpm-lock.yaml`。

但 `dryRunCheck()` 里执行的是：

```ts
pnpm publish --tag canary --dry-run
```

没有带 `--no-git-checks`。

而实际 publish 带了：

```ts
--no - git - checks
```

这会导致 dry-run 和真实 publish 行为不一致。更严重的是：dry-run 可能因为工作区 dirty 直接失败。

### 建议修改

dry-run 参数要和真实 publish 基本一致：

```ts
const publishArgs = [
  'publish',
  '--tag',
  'canary',
  '--access',
  'public',
  '--no-git-checks',
  '--dry-run',
]
```

或者抽一个函数：

```ts
function getPublishArgs(options: { dryRun?: boolean }) {
  return [
    'publish',
    '--tag',
    'canary',
    '--access',
    'public',
    '--no-git-checks',
    ...(options.dryRun ? ['--dry-run'] : []),
    ...(process.env.CI && !options.dryRun ? ['--provenance'] : []),
  ]
}
```

---

## 4. canary 版本号应该加入 `GITHUB_RUN_ATTEMPT`

当前 canary 版本号是：

```ts
0.1.0-canary.${date}.${runNumber}.${shortSha}
```

问题是：GitHub Actions 失败后如果点 **Re-run jobs**，`GITHUB_RUN_NUMBER` 和 `GITHUB_SHA` 都不会变，版本号还是同一个。假设第一次已经发布了 3 个包，第 4 个包失败，重跑时前 3 个包会遇到 “previously published”。

### 建议修改

加入 `GITHUB_RUN_ATTEMPT`：

```ts
function getCanaryVersion(baseVersion: string) {
  const core = semver.parse(baseVersion)
  if (!core) {
    throw new Error(`Invalid base version: ${baseVersion}`)
  }

  const shortSha = process.env.GITHUB_SHA?.slice(0, 8) ?? 'local'
  const runNumber = process.env.GITHUB_RUN_NUMBER ?? Date.now().toString()
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1'
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  return `${core.major}.${core.minor}.${core.patch}-canary.${date}.${runNumber}.${runAttempt}.${shortSha}`
}
```

---

## 5. `release-canary.yml` 不应该 `cancel-in-progress: true`

当前 workflow：

```yaml
concurrency:
  group: release-canary-${{ github.ref }}
  cancel-in-progress: true
```

发布任务不适合 cancel。因为 publish 是多包串行发布，取消在中间会留下：

```txt
部分包已经发了 canary
部分包没发
dist-tag 状态不一致
下游装 @canary 可能拿到不完整组合
```

正式 release workflow 里就没有取消进行中的发布，`cancel-in-progress` 是 `false`。你的 canary 也应该一样。

### 建议修改

```yaml
concurrency:
  group: release-canary-${{ github.ref }}
  cancel-in-progress: false
```

更稳一点可以按 commit 分组，避免同一个 commit 重复跑：

```yaml
concurrency:
  group: release-canary-${{ github.sha }}
  cancel-in-progress: false
```

---

## 6. `curl` 触发下游 CI 没有 `--fail`

当前：

```yaml
curl -X POST ...
```

如果 token 错、仓库名错、权限不够，GitHub API 返回 401/403/404 时，`curl` 默认仍可能以 0 退出。这样 workflow 会显示成功，但 zeus-ui 实际没有被触发。

### 建议修改

```yaml
curl --fail-with-body -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${{ secrets.ZEUS_UI_DISPATCH_TOKEN }}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/baicie/zeus-ui/dispatches \
  -d '{"event_type":"zeus-canary-published","client_payload":{"source":"zeus","sha":"${{ github.sha }}"}}'
```

---

# P1：强烈建议修

## 7. canary workflow 的 Precheck 缺少 `api:check`

当前 canary workflow 的 Precheck 是：

```yaml
pnpm build
pnpm build-dts
pnpm check
pnpm test-unit
pnpm check:exports
```

但是它没有跑：

```bash
pnpm api:check
```

虽然普通 CI 的 build job 已经跑了 `api:check`，但 canary 发布 workflow 是独立 workflow，不能假设 CI 一定先成功再发布。

### 建议修改

```yaml
- name: Precheck
  run: |
    pnpm build
    pnpm build-dts
    pnpm api:check
    pnpm check
    pnpm test-unit
    pnpm check:exports
```

---

## 8. API snapshot 只检查主入口，漏掉 `./advanced` 和 `./capabilities`

当前 snapshot 脚本只从 `packageJson.types` 获取一个 d.ts 文件。

这意味着：

```txt
@zeus-js/zeus
```

会被检查，但这些不会被纳入 snapshot：

```txt
@zeus-js/zeus/advanced
@zeus-js/zeus/capabilities
@zeus-js/output-wc/capabilities
@zeus-js/bundler-plugin/vite
@zeus-js/bundler-plugin/manifest
```

而你新增的 `@zeus-js/zeus` exports 明确有 `./advanced` 和 `./capabilities`。
但当前 `zeus.api.md` 里只记录了主入口导出，没有记录 advanced/capabilities。

### 建议修改

让 snapshot 脚本扫描 `packageJson.exports` 里的所有 `"types"` 字段。

示例：

```ts
interface ApiEntry {
  pkgName: string
  subpath: string
  dtsFile: string
  snapshotFile: string
}

function collectTypesExports(pkg: WorkspacePackage): ApiEntry[] {
  const exportsField = pkg.packageJson.exports as
    | Record<string, unknown>
    | undefined
  const entries: ApiEntry[] = []

  if (!exportsField) return entries

  for (const [subpath, value] of Object.entries(exportsField)) {
    const typesPath = findTypesTarget(value)

    if (!typesPath) continue

    const normalizedSubpath =
      subpath === '.' ? 'main' : subpath.replace('./', '')
    const fileName = `${pkg.name
      .replace('@zeus-js/', '')
      .replace(/\//g, '-')}.${normalizedSubpath}.api.md`

    entries.push({
      pkgName: pkg.name,
      subpath,
      dtsFile: path.join(pkg.dir, typesPath),
      snapshotFile: path.join(repoRoot, 'docs/api/snapshots', fileName),
    })
  }

  return entries
}

function findTypesTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  const obj = value as Record<string, unknown>

  if (typeof obj.types === 'string') {
    return obj.types
  }

  for (const nested of Object.values(obj)) {
    const found = findTypesTarget(nested)
    if (found) return found
  }

  return null
}
```

生成文件建议变成：

```txt
docs/api/snapshots/
  zeus.main.api.md
  zeus.advanced.api.md
  zeus.capabilities.api.md
  output-wc.main.api.md
  output-wc.capabilities.api.md
  bundler-plugin.main.api.md
  bundler-plugin.vite.api.md
  bundler-plugin.manifest.api.md
```

---

## 9. `api:check` 对新增 snapshot 文件会漏检

当前检查逻辑是：

```ts
const diff = execSync('git diff -- docs/api/snapshots')
```

`git diff` 不会显示 untracked 文件。也就是说，如果新增了一个 package 或新 subpath，`api:snapshot` 生成了一个新的 `*.api.md`，但它是 untracked，`git diff` 可能检测不到。

### 建议修改

改成 `git status --porcelain`：

```ts
const status = execSync('git status --porcelain -- docs/api/snapshots', {
  encoding: 'utf-8',
})

if (status.trim()) {
  console.error('\nPublic API snapshot changed.\n')
  console.error(status)

  const diff = execSync('git diff -- docs/api/snapshots', {
    encoding: 'utf-8',
  })

  if (diff.trim()) {
    console.error(diff)
  }

  process.exit(1)
}
```

---

## 10. `api:check` catch 直接吞错误，排查不友好

当前：

```ts
} catch {
  process.exit(1)
}
```

CI 失败时会少很多上下文。

### 建议修改

```ts
} catch (err) {
  console.error(err)
  process.exit(1)
}
```

---

## 11. `includePackages` 不应该写死

当前 snapshot 脚本写死了：

```ts
const includePackages = new Set([
  '@zeus-js/zeus',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/compiler',
  '@zeus-js/output-wc',
  '@zeus-js/bundler-plugin',
  '@zeus-js/component-analyzer',
  '@zeus-js/component-dts',
  '@zeus-js/preset-component-library',
])
```

但是 canary 发布脚本会发布所有非 private 的 `@zeus-js/*` 包。

这会造成不一致：
**能发布的包，不一定被 API snapshot 覆盖。**

比如如果 `@zeus-js/output-css`、`@zeus-js/output-icons`、`@zeus-js/output-react-wrapper`、`@zeus-js/output-vue-wrapper` 有 public API，当前 snapshot 可能漏掉。

### 建议修改

直接自动发现：

```ts
const shouldSnapshotPackage = (pkg: WorkspacePackage) => {
  if (pkg.packageJson.private) return false
  if (!pkg.name.startsWith('@zeus-js/')) return false
  if (!pkg.packageJson.exports) return false
  return true
}
```

不要维护静态名单。

---

## 12. package exports 子路径缺少 CJS / node 条件

现在 `@zeus-js/zeus` 的主入口支持 `node.production`、`node.development`、`import`、`require`。

但新加的：

```json
"./advanced": {
  "types": "./dist/advanced.d.ts",
  "import": "./dist/advanced.js"
}
```

以及：

```json
"./capabilities": {
  "types": "./dist/capabilities.d.ts",
  "import": "./dist/capabilities.js"
}
```

只有 `import`，没有 `require`。

`@zeus-js/output-wc/capabilities` 也一样，只有 `import`。
`@zeus-js/bundler-plugin/vite` 和 `./manifest` 也只有 `import`。

如果这些子路径只打算支持 ESM，可以接受；但当前包主入口明确支持 CJS，那子路径最好保持一致。

### 建议修改

```json
"./advanced": {
  "types": "./dist/advanced.d.ts",
  "node": {
    "production": "./dist/advanced.cjs.prod.js",
    "development": "./dist/advanced.cjs.js",
    "default": "./dist/advanced.cjs.js"
  },
  "import": "./dist/advanced.js",
  "require": "./dist/advanced.cjs.js"
},
"./capabilities": {
  "types": "./dist/capabilities.d.ts",
  "node": {
    "production": "./dist/capabilities.cjs.prod.js",
    "development": "./dist/capabilities.cjs.js",
    "default": "./dist/capabilities.cjs.js"
  },
  "import": "./dist/capabilities.js",
  "require": "./dist/capabilities.cjs.js"
}
```

`output-wc/capabilities` 同理。

---

## 13. `check-package-exports` 只检查已有 exports，不强制所有发布包都有 exports

当前脚本先过滤：

```ts
.filter(pkg => pkg.packageJson.exports)
```

这意味着一个 publishable package 如果没有 `exports`，会被直接跳过。

### 建议修改

对所有非 private 的 `@zeus-js/*` 包强制要求 `exports`：

```ts
const packages = findWorkspacePackages()
  .filter(pkg => !pkg.packageJson.private)
  .filter(pkg => pkg.name.startsWith('@zeus-js/'))

for (const pkg of packages) {
  if (!pkg.packageJson.exports) {
    hasError = true
    console.error(`${pkg.name}: missing package.json exports`)
    continue
  }

  checkExports(...)
}
```

---

# P2：建议优化

## 14. capabilities 需要加测试，防止和真实 public API 漂移

当前 `ZEUS_CAPABILITIES` 是手写的静态对象。

这没问题，但需要测试保证它没有撒谎。比如里面写了：

```ts
publicApi.state = true
webComponents.defineElement = true
```

那测试应该确认：

```ts
import * as zeus from '../src'
import { ZEUS_CAPABILITIES } from '../src/capabilities'

expect(typeof zeus.state).toBe('function')
expect(typeof zeus.defineElement).toBe('function')
expect(ZEUS_CAPABILITIES.publicApi.state).toBe(true)
```

### 新增测试

```ts
// packages/core/zeus/__tests__/capabilities.spec.ts
import { describe, expect, it } from 'vitest'

import * as zeus from '../src'
import { ZEUS_CAPABILITIES } from '../src/capabilities'

describe('@zeus-js/zeus capabilities', () => {
  it('matches exported public APIs', () => {
    for (const [name, enabled] of Object.entries(ZEUS_CAPABILITIES.publicApi)) {
      if (!enabled) continue
      expect(zeus).toHaveProperty(name)
    }

    for (const [name, enabled] of Object.entries(
      ZEUS_CAPABILITIES.webComponents,
    )) {
      if (!enabled) continue

      if (name === 'defineElement' || name === 'Host' || name === 'Slot') {
        expect(zeus).toHaveProperty(name)
      }
    }
  })
})
```

---

## 15. canary workflow 建议不要复用 `Release` environment

当前 canary workflow 使用：

```yaml
environment: Release
```

如果 `Release` environment 配了人工审批，那 canary 就不是自动发布了。
建议单独建：

```yaml
environment: Canary
```

或者如果 canary 允许完全自动化，就不配置 environment，直接用 repo secret。

推荐：

```yaml
environment: Canary
```

这样正式 release 和 canary 权限可以分开。

---

## 16. downstream dispatch payload 最好带 canary version

当前只传了：

```json
{
  "source": "zeus",
  "sha": "${{ github.sha }}"
}
```

下游虽然可以直接安装 `@zeus-js/zeus@canary`，但带上 version 更方便排查。

建议 `release-canary.ts` 输出到 GitHub env：

```ts
fs.appendFileSync(
  process.env.GITHUB_ENV!,
  `ZEUS_CANARY_VERSION=${canaryVersion}\n`,
)
```

或者 workflow 中单独计算，然后 dispatch：

```json
{
  "event_type": "zeus-canary-published",
  "client_payload": {
    "source": "zeus",
    "sha": "${{ github.sha }}",
    "version": "${{ env.ZEUS_CANARY_VERSION }}"
  }
}
```

---

## 17. 分支名 `feat/cancry` 建议改成 `feat/canary`

小问题，但建议改。`cancry` 看起来像拼写错误，后面容易在 PR / CI / 文档里传播。

---

# 推荐最终修复顺序

按优先级来：

```txt
P0-1 修 findWorkspacePackages require cache
P0-2 canary 脚本不要替换 workspace:* 依赖
P0-3 dryRunCheck 加 --no-git-checks / --access public
P0-4 canary version 加 GITHUB_RUN_ATTEMPT
P0-5 release-canary concurrency 改 cancel-in-progress: false
P0-6 curl 加 --fail-with-body

P1-1 canary workflow precheck 加 pnpm api:check
P1-2 snapshot 扫 exports 所有 types 子路径
P1-3 api:check 用 git status --porcelain 检测 untracked
P1-4 snapshot package 列表自动发现
P1-5 子路径 exports 补 require/node 条件
P1-6 check-package-exports 强制所有 @zeus-js/* 发布包都有 exports

P2-1 capabilities 加测试
P2-2 Canary environment 和 Release environment 分离
P2-3 dispatch payload 带 version
P2-4 分支名改 canary
```

---

# 我建议的合并结论

**暂不建议直接合并。**

这版已经把架子搭起来了，但 canary 发布属于“会写 npm registry 的动作”，容错要更严格。尤其下面 4 个必须先修：

```txt
1. canary 发布任务不能 cancel-in-progress
2. dry-run 和真实 publish 参数必须一致
3. 版本号必须包含 GITHUB_RUN_ATTEMPT
4. api snapshot 必须覆盖 exports 的所有子路径，并检测 untracked 文件
```

修完这些后，这个分支就比较稳，可以作为 Zeus → zeus-ui 自动兼容检测链路的基础版本合并。

[1]: https://pnpm.io/workspaces 'Workspace | pnpm'
