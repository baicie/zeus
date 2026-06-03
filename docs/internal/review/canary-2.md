结论：**这版比上一轮明显好了，P0 大部分已经修掉，但我仍不建议直接合并。**
当前主要剩下两个必须处理的问题：**canary workflow 并发分组不对**、**API snapshot 文件和新生成规则不同步**。

---

# 总体审查结论

`feat/cancry` 当前已经完成了这些关键改进：

1. `findWorkspacePackages()` 已经从 `require(package.json)` 改成 `fs.readFileSync + JSON.parse`，避免了 canary 脚本多次读取 package.json 时拿到 require cache 旧版本的问题。

2. `release-canary.ts` 已经把 canary 版本号改成包含 `GITHUB_RUN_ATTEMPT`，可以避免 rerun job 时重复发布同一个 npm version。

3. canary 脚本已经不再把 `workspace:*` 依赖改成具体 canary 版本，只改每个 `@zeus-js/*` 包自己的 `version`。

4. dry-run 和真实 publish 已经共用 `getPublishArgs()`，并且都包含 `--no-git-checks`，真实发布时才加 `--provenance`。

5. canary workflow 已经加了 `pnpm api:check`、`curl --fail-with-body`、`Canary environment`、dispatch payload 里也带了 canary version。

6. `check-package-exports.ts` 已经强制所有非 private 的 `@zeus-js/*` 包必须有 `exports`，并且禁止 `./*` 通配导出。

这些改动方向都对。

---

# P0：合并前必须修

## 1. `release-canary.yml` 的 concurrency group 不能用 `github.sha`

当前：

```yaml
concurrency:
  group: release-canary-${{ github.sha }}
  cancel-in-progress: false
```

这个还有风险。因为如果短时间内连续 push 两个 commit 到 `main`：

```txt
commit A 触发 canary
commit B 触发 canary
```

由于 group 是 `github.sha`，A 和 B 的 group 不同，它们可能**并发发布**。如果 B 先发布完成，随后 A 后发布完成，就可能导致 npm 的 `canary` dist-tag 被较旧 commit 覆盖，出现：

```txt
@zeus-js/zeus@canary 指向旧 commit
zeus-ui compatibility 检测到的不是最新主线
```

### 建议改成按 ref 串行

```yaml
concurrency:
  group: release-canary-${{ github.ref }}
  cancel-in-progress: false
```

也可以更固定一点：

```yaml
concurrency:
  group: release-canary-main
  cancel-in-progress: false
```

这里重点是：**canary 发布不能取消，也不能让多个 main commit 并发发布。**

---

## 2. API snapshot 文件和新生成规则不同步

现在 `write-api-snapshots.ts` 已经改成按 package export subpath 生成文件名：

```ts
const normalizedSubpath = subpath === '.' ? 'main' : subpath.replace('./', '')

const fileName = `${pkg.name
  .replace('@zeus-js/', '')
  .replace(/\//g, '-')}.${normalizedSubpath}.api.md`
```

也就是说它会生成类似：

```txt
zeus.main.api.md
zeus.advanced.api.md
zeus.capabilities.api.md
output-wc.main.api.md
output-wc.capabilities.api.md
bundler-plugin.vite.api.md
bundler-plugin.manifest.api.md
```

但当前分支里仍然存在旧格式文件，例如：

```txt
docs/api/snapshots/zeus.api.md
```

它的标题还是旧的 `# @zeus-js/zeus API Snapshot`。

这说明你改了生成规则，但还没有重新生成并清理旧 snapshot。现在 CI 跑 `pnpm api:check` 很可能会出现：

```txt
?? docs/api/snapshots/zeus.main.api.md
?? docs/api/snapshots/zeus.advanced.api.md
?? docs/api/snapshots/zeus.capabilities.api.md
...
```

因为 `api:check` 已经用 `git status --porcelain` 检测 modified 和 untracked 文件。

### 建议执行

本地跑：

```bash
pnpm build
pnpm build-dts
pnpm api:snapshot
```

然后删除旧格式 snapshot：

```txt
docs/api/snapshots/zeus.api.md
docs/api/snapshots/signal.api.md
docs/api/snapshots/runtime-dom.api.md
docs/api/snapshots/compiler.api.md
docs/api/snapshots/output-wc.api.md
...
```

保留新格式：

```txt
docs/api/snapshots/zeus.main.api.md
docs/api/snapshots/zeus.advanced.api.md
docs/api/snapshots/zeus.capabilities.api.md
```

### 更稳的脚本改造

建议 `write-api-snapshots.ts` 在生成前清理旧 snapshot，避免历史文件残留：

```ts
function cleanSnapshotDir(expectedFiles: Set<string>) {
  const dir = path.join(repoRoot, 'docs/api/snapshots')
  if (!fs.existsSync(dir)) return

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.api.md')) continue

    const fullPath = path.join(dir, file)
    if (!expectedFiles.has(fullPath)) {
      fs.unlinkSync(fullPath)
      console.log(
        pico.yellow(`removed stale ${path.relative(repoRoot, fullPath)}`),
      )
    }
  }
}
```

然后在写入前先计算 `targets`，再清理：

```ts
const expectedFiles = new Set(targets.map(t => t.snapshotFile))
cleanSnapshotDir(expectedFiles)
```

否则后续重命名 snapshot 规则时，旧文件会一直留在仓库里。

---

# P1：强烈建议修

## 3. snapshot 会覆盖所有 `@zeus-js/*` exports，但当前已有文件明显不全

现在 `shouldSnapshotPackage()` 是：

```ts
if (pkg.packageJson.private) return false
if (!pkg.name.startsWith('@zeus-js/')) return false
if (!pkg.packageJson.exports) return false
return true
```

这意味着 `@zeus-js/vite-plugin` 也会被纳入 snapshot，因为它是 `@zeus-js/*`，并且有 `exports`。

但当前 compare 结果里没有看到 `vite-plugin.main.api.md` 这类新 snapshot 文件。换句话说，当前 snapshot 目录还没有按最新规则重新生成完整结果。

### 建议

统一执行一次：

```bash
pnpm build-dts
pnpm api:snapshot
git status -- docs/api/snapshots
```

确保新增这些类型：

```txt
vite-plugin.main.api.md
zeus.main.api.md
zeus.advanced.api.md
zeus.capabilities.api.md
output-wc.main.api.md
output-wc.capabilities.api.md
bundler-plugin.main.api.md
bundler-plugin.vite.api.md
bundler-plugin.manifest.api.md
```

否则 `api:check` 一定会红。

---

## 4. canary 发布包范围和 changeset ignore 范围不一致

`.changeset/config.json` 里仍然 ignore 了：

```json
"ignore": [
  "@zeus-js/vite-plugin",
  "@zeus-js/docs",
  ...
]
```

但 `release-canary.ts` 发布包的逻辑是：

```ts
return pkg.name.startsWith('@zeus-js/')
```

这意味着 canary 会发布：

```txt
@zeus-js/vite-plugin
```

即使正式 changeset release 忽略了它。

这不一定错，但要明确。你需要二选一：

### 方案 A：canary 发布所有 `@zeus-js/*`

适合你的目标是：

```txt
zeus-ui 使用什么，就 canary 验证什么
```

那就保留现在逻辑，但把文档写清楚：

```txt
canary release intentionally publishes all non-private @zeus-js/* packages,
including packages ignored by formal changeset release.
```

### 方案 B：canary 跟正式 release 范围一致

那就读取 `.changeset/config.json` 的 `ignore`：

```ts
function readChangesetIgnore() {
  const configPath = path.join(repoRoot, '.changeset/config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return new Set<string>(config.ignore ?? [])
}

const changesetIgnore = readChangesetIgnore()

function isCanaryPackage(pkg: WorkspacePackage) {
  if (pkg.packageJson.private) return false
  if (!pkg.name.startsWith('@zeus-js/')) return false
  if (changesetIgnore.has(pkg.name)) return false
  return true
}
```

我个人建议 **方案 A**，因为 zeus-ui 真实消费的可能正好包括 `@zeus-js/vite-plugin` 或 web-c toolchain。但文档要写清楚，否则后面维护会困惑。

---

## 5. snapshot 文件名需要处理多级 subpath

当前：

```ts
const normalizedSubpath = subpath === '.' ? 'main' : subpath.replace('./', '')
```

如果未来出现：

```json
"./output/foo": {
  "types": "./dist/output/foo.d.ts"
}
```

会生成：

```txt
pkg.output/foo.api.md
```

这会变成子目录路径，不太合适。

### 建议

```ts
function normalizeSnapshotSubpath(subpath: string) {
  return subpath === '.'
    ? 'main'
    : subpath.replace(/^\.\//, '').replace(/[\\/]/g, '-')
}
```

然后：

```ts
const normalizedSubpath = normalizeSnapshotSubpath(subpath)
```

---

## 6. `findTypesTarget()` 递归找第一个 `types`，建议只按 exports condition 明确解析

当前：

```ts
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

现在能用，但稍微有点“宽”。如果 exports 结构复杂，递归 `Object.values` 可能拿到非当前 subpath 最合适的 types。

更稳一点：

```ts
function findTypesTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  const obj = value as Record<string, unknown>

  if (typeof obj.types === 'string') return obj.types

  // 常见条件入口
  for (const key of ['import', 'require', 'node', 'default']) {
    const nested = obj[key]
    const found = findTypesTarget(nested)
    if (found) return found
  }

  return null
}
```

或者更严格：要求每个公开 subpath 顶层必须有 `"types"`，没有就报错。考虑你现在目标是公共 API 管控，我更推荐严格一点。

---

## 7. `release-canary.ts` 的错误提示仍然不准确

当前发布失败时提示：

```ts
Please manually remove the canary tag from already-published packages above.
```

这个提示不准确。npm package version 一旦 publish，不能靠删除 dist-tag 来“撤销这个版本”。删除 tag 只能影响 `@canary` 指向，不能让这个 version 重新可发布。

### 建议改成

```ts
throw new Error(
  [
    `Failed to publish ${pkg.name}.`,
    publishedList,
    '',
    'Some packages may already have been published.',
    'NPM package versions are immutable.',
    'Re-run the workflow to generate a new canary version via GITHUB_RUN_ATTEMPT,',
    'or publish missing packages manually with a new canary version.',
  ].join('\n'),
)
```

---

## 8. canary workflow 触发下游失败是否应该阻断 workflow，需要明确

现在 dispatch zeus-ui 失败会让整个 workflow 红，因为用了 `curl --fail-with-body`。

这是好事，能发现 token/仓库配置错误。但从发布角度看，有一个问题：

```txt
npm canary 已经发布成功
dispatch 失败
workflow 标红
```

这可能会让你误以为“canary 发布失败”，但实际上只是“下游触发失败”。

### 建议

把 step 名称改得更明确：

```yaml
- name: Trigger downstream compatibility check
```

并在失败时输出提示：

```yaml
- name: Trigger zeus-ui compatibility check
  if: success()
  run: |
    echo "Canary packages were published successfully."
    echo "Now triggering downstream compatibility check..."
    curl --fail-with-body ...
```

如果你希望 canary 发布不被下游触发影响，也可以改成：

```yaml
continue-on-error: true
```

但我不建议一开始这么做。早期链路还不稳时，让它红更好。

---

# P2：可以后续优化

## 9. `release-canary.ts` 本地运行会污染工作区

canary 脚本会改：

```txt
root package.json
各 @zeus-js/* package.json
pnpm-lock.yaml
dist
```

相关逻辑在 `updateVersions()` 和后续 `pnpm install --lockfile-only`。

CI 里没问题，但本地执行后容易弄脏工作区。

### 建议

加一个 CI 限制：

```ts
if (!process.env.CI) {
  console.warn(
    pico.yellow(
      'release:canary mutates package versions. It is intended to run in CI.',
    ),
  )
}
```

或者更强：

```ts
if (!process.env.CI && !process.argv.includes('--force-local')) {
  throw new Error(
    'release:canary is intended to run in CI. Use --force-local to run locally.',
  )
}
```

---

## 10. capabilities 测试已经加了，但还可以覆盖 output-wc

当前 `@zeus-js/zeus` capabilities 测试已经覆盖了 publicApi、webComponents、jsx。

但 `@zeus-js/output-wc/src/capabilities.ts` 也新增了静态能力声明，建议也加一个测试，至少保证它能被 import，且核心字段存在。

```ts
// packages/web-c/output-wc/__tests__/capabilities.spec.ts
import { describe, expect, it } from 'vitest'

import { ZEUS_OUTPUT_WC_CAPABILITIES } from '../src/capabilities'

describe('@zeus-js/output-wc capabilities', () => {
  it('declares web component output capabilities', () => {
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.webComponent).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.customElements).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.manifest.componentManifest).toBe(true)
  })
})
```

---

## 11. `pnpm install --lockfile-only` 可能不是必须的

现在 canary 脚本在改版本后执行：

```ts
await exec('pnpm', ['install', '--lockfile-only'], ...)
```

如果你没有把 `workspace:*` 改成具体版本，这一步的必要性变低。可以保留，但它会修改 lockfile，增加运行时间和工作区污染。

建议二选一：

### 保留

如果你希望 lockfile 中 root/package versions 同步，保留。

### 移除

如果 publish 能正常处理 workspace 协议，且 build 不依赖 lockfile version metadata，可以删掉：

```ts
await exec('pnpm', ['install', '--lockfile-only'], ...)
```

我更偏向先保留，等 canary workflow 稳定后再优化。

---

# 建议最终修改清单

## 合并前必须做

```txt
1. release-canary.yml concurrency group 改成 github.ref 或固定 main，不要用 github.sha
2. 重新运行 pnpm build-dts && pnpm api:snapshot
3. 删除旧格式 docs/api/snapshots/*.api.md
4. 提交新格式 snapshot，例如 zeus.main.api.md / zeus.advanced.api.md / zeus.capabilities.api.md
```

## 强烈建议一起做

```txt
5. 明确 canary 发布包范围是否包含 changeset ignore 包
6. snapshot subpath 文件名处理多级路径
7. findTypesTarget 改成更严格的 exports types 解析
8. 修正 release-canary 发布失败提示，不要说 remove canary tag
```

## 后续优化

```txt
9. 给 output-wc capabilities 加测试
10. 本地执行 release:canary 时给出强提示或禁止
11. 评估 pnpm install --lockfile-only 是否真的必要
```

---

# 最终合并判断

**当前仍建议：暂不合并。**

这版已经把上一轮大多数 P0 修掉了，但现在有两个合并阻断点：

```txt
1. canary 并发 group 用 github.sha，多个 main commit 可以并发发布，可能导致 canary dist-tag 回退
2. API snapshot 生成规则已经变了，但仓库里仍是旧格式 snapshot，api:check 大概率会失败
```

修掉这两个以后，这个分支就基本可以合并。后面的 P1/P2 可以视时间继续补。
