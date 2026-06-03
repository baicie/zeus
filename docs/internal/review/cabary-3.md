结论：**这版比上一轮又好了很多，但我仍建议暂不合并。**
现在 `canary` 发布链路本身大体稳了，真正的合并阻断点变成了：**additional entry 的 `.d.ts` 生成质量有问题，导致 `capabilities` 这类新公共子路径类型快照为空，部分子路径 dts 还可能引用不存在的相对类型文件。**

---

# 当前已经修好的点

这轮已经修掉了上一版的大部分关键问题：

1. `release-canary.yml` 的并发已经改成按 `github.ref` 串行，而且 `cancel-in-progress: false`，不会再出现多个 main commit 并发抢 npm `canary` tag 的问题。

2. canary version 已经带上 `GITHUB_RUN_ATTEMPT`，rerun workflow 会生成不同版本，避免重复 publish 同一个 npm version。

3. canary 脚本已经不再改 `workspace:*` 依赖，只改包自身版本。

4. `dryRunCheck` 和真实 publish 已共用 `getPublishArgs()`，并且带 `--no-git-checks`，真实 CI publish 才加 `--provenance`。

5. canary workflow 已经跑 `pnpm api:check`，并且触发下游时使用 `curl --fail-with-body`，payload 也带了 `version`。

6. snapshot 生成规则已经升级成按 exports subpath 生成，且会清理 stale snapshot。

7. `check-package-exports` 已经强制所有非 private 的 `@zeus-js/*` 包必须声明 `exports`，并禁止 `./*` 通配。

这些方向都对。

---

# P0：合并前必须修

## 1. `capabilities` 的 API snapshot 是空的，说明 public d.ts 生成有问题

当前这两个新增公共子路径的 snapshot 是空的：

```txt
docs/api/snapshots/zeus.capabilities.api.md
docs/api/snapshots/output-wc.capabilities.api.md
```

`zeus.capabilities.api.md` 代码块为空。
`output-wc.capabilities.api.md` 也是空代码块。

但源码里明明导出了：

```ts
export const ZEUS_CAPABILITIES = ...
export type ZeusCapabilities = typeof ZEUS_CAPABILITIES
```

这意味着发布后：

```ts
import { ZEUS_CAPABILITIES } from '@zeus-js/zeus/capabilities'
```

运行时可能能用，但 TypeScript 类型入口很可能是空的。这个是合并阻断。

### 建议修法

不要只用当前 `generateAdditionalEntryDts()` 里“复制 temp dts”的方式生成 additional entry dts。现在它只是从 temp 拿源码 dts，再写到 dist。

应该把 additional entries 也作为 Rollup DTS entry 来 bundle。

大致改成：

```ts
const mainConfigs: RollupOptions[] = targetPackages.map(pkg => {
  // 原来的主入口 dts config
})

const additionalEntryConfigs: RollupOptions[] = targetPackages.flatMap(pkg => {
  const pkgInfo = wsPkgsByShort.get(pkg)
  const pkgDir = pkgInfo?.dir
  const relativeDir = pkgInfo?.relativeDir
  const buildOptions = pkgInfo?.packageJson.buildOptions as
    | { additionalEntries?: Array<{ entry: string; output: string }> }
    | undefined

  if (!pkgDir || !relativeDir || !buildOptions?.additionalEntries) {
    return []
  }

  return buildOptions.additionalEntries.map(extra => {
    const input = `./temp/${relativeDir}/src/${extra.entry.replace(/\.ts$/, '.d.ts')}`
    const outputFile = `${pkgDir}/${extra.output.replace(/\.js$/, '.d.ts')}`

    return {
      input,
      output: {
        file: outputFile,
        format: 'es',
      },
      plugins: [dts(), patchTypes(pkg, pkgDir)],
      onwarn(warning, warn) {
        if (
          warning.code === 'UNRESOLVED_IMPORT' &&
          !warning.exporter?.startsWith('.')
        ) {
          return
        }
        warn(warning)
      },
    } satisfies RollupOptions
  })
})

export default [...mainConfigs, ...additionalEntryConfigs]
```

目标是让：

```txt
dist/capabilities.d.ts
dist/advanced.d.ts
dist/vite.d.ts
dist/outputPlugins/manifest.d.ts
```

都经过真正的 dts bundle，而不是简单拷贝。

---

## 2. `bundler-plugin/vite` 和 `bundler-plugin/manifest` 的 dts 可能引用不存在的相对文件

当前 `bundler-plugin.vite.api.md` 里有：

```ts
import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'
```

如果最终发布包里没有 `dist/types.d.ts`，那么：

```ts
import { zeus } from '@zeus-js/bundler-plugin/vite'
```

在 TS 下会解析失败。

`manifest` 更明显：

```ts
import type { ZeusComponentPlugin } from '../types'

export default function manifestOutput(
  options?: ManifestOutputOptions,
): ZeusComponentPlugin
```

但源码里 `ManifestOutputOptions` 是这个文件自己导出的 interface。
snapshot 里却没有 interface 定义，说明这个 additional entry dts 已经不完整了。

### 建议修法

同上：additional entry dts 必须走 dts bundle。

另外 `api:snapshot` 应该新增校验：**如果 snapshot 里有相对 import，要确认对应 dts 文件真的存在。**

可以加：

```ts
function checkRelativeTypeImports(target: ApiEntry, dts: string) {
  const importRE = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g
  const dtsDir = path.dirname(target.dtsFile)

  for (const match of dts.matchAll(importRE)) {
    const specifier = match[1]
    const candidates = [
      path.resolve(dtsDir, `${specifier}.d.ts`),
      path.resolve(dtsDir, specifier, 'index.d.ts'),
    ]

    if (!candidates.some(fs.existsSync)) {
      throw new Error(
        `API snapshot for ${target.pkgName} (${target.subpath}) has unresolved relative type import: ${specifier}`,
      )
    }
  }
}
```

在写 snapshot 前调用：

```ts
const normalized = normalizeDts(dts)

if (!normalized) {
  throw new Error(
    `Empty declaration file for ${target.pkgName} (${target.subpath}): ${target.dtsFile}`,
  )
}

checkRelativeTypeImports(target, normalized)
```

这样以后不会再把空 dts 或坏 dts 提交进来。

---

## 3. `api:snapshot` 必须拒绝空 dts

现在 snapshot 脚本只是读文件、normalize、写入，没有判断 dts 是否为空。

这就是为什么空的 `capabilities.api.md` 能进仓库。

### 建议直接加硬校验

```ts
const dts = fs.readFileSync(target.dtsFile, 'utf-8')
const normalizedDts = normalizeDts(dts)

if (!normalizedDts) {
  throw new Error(
    `Empty declaration file for ${target.pkgName} (${target.subpath}): ${target.dtsFile}`,
  )
}

checkRelativeTypeImports(target, normalizedDts)

const snapshot = toSnapshot(target.pkgName, target.subpath, normalizedDts)
```

同时把 `toSnapshot` 改成接收已 normalize 的结果，避免重复处理：

```ts
function toSnapshot(pkgName: string, subpath: string, normalizedDts: string) {
  const subpathLabel = subpath === '.' ? 'main' : subpath

  return `# ${pkgName} (${subpathLabel}) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run \`pnpm api:snapshot\` to update.

\`\`\`ts
${normalizedDts}
\`\`\`
`
}
```

---

# P1：强烈建议修

## 4. canary 发布范围和 changeset ignore 范围仍然不一致，需要明确策略

`release-canary.ts` 当前发布所有非 private 的 `@zeus-js/*` 包：

```ts
return pkg.name.startsWith('@zeus-js/')
```

这会包括 `@zeus-js/vite-plugin`。但 `.changeset/config.json` 里正式 release 仍 ignore 了 `@zeus-js/vite-plugin`。之前看过该 ignore 列表里确实包含它。这个策略不一定错，但必须明确。

我建议保留“canary 发布所有 `@zeus-js/*`”这个策略，因为 zeus-ui 真实下游可能会依赖 vite-plugin 或 web-c 工具链。但要把这个写进文档：

```md
## Canary publish scope

Canary release intentionally publishes all non-private `@zeus-js/*` packages,
including packages ignored by the formal changeset release.

Reason:

- canary is used for downstream compatibility testing
- downstream projects may consume tooling packages such as `@zeus-js/vite-plugin`
- canary dist-tag is independent from latest/beta/rc tags
```

如果你不想这样，那就让 canary 读取 `.changeset/config.json` 的 ignore：

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

但我更推荐前者：**canary 发布全量 `@zeus-js/*`，用于下游验收。**

---

## 5. `check-package-exports` 应该进一步校验每个 public subpath 都有 `types`

当前 `check-package-exports` 已经检查：

```txt
1. 必须有 exports
2. 禁止 ./*
3. exports 指向的文件必须存在
```

但它还没有强制：

```txt
每个 public subpath 都必须有 types
```

比如：

```json
"./foo": {
  "import": "./dist/foo.js"
}
```

这种现在可能不报错，但对你这种库项目来说不应该允许。

### 建议加校验

```ts
function hasTypesTarget(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  const obj = value as Record<string, unknown>

  if (typeof obj.types === 'string') return true

  for (const nested of Object.values(obj)) {
    if (hasTypesTarget(nested)) return true
  }

  return false
}
```

在 `checkExports` 里：

```ts
for (const [key, value] of Object.entries(exportsField)) {
  if (!hasTypesTarget(value)) {
    error(`${pkgName} export "${key}" is missing "types" condition`)
  }

  checkExportValue(pkgName, pkgDir, key, value)
}
```

这样 snapshot、exports、types 三者才形成闭环。

---

## 6. `release:canary` 在 publish 前最好跑一次 `check:exports`

canary workflow 里已经跑了 `check:exports`。
但 `release-canary.ts` 自己在改版本、`pnpm install --lockfile-only`、重新 build、build-dts 后，没有再跑 `check:exports`。

理论上 API 没变，只是版本变了；但从“发布脚本自洽性”看，发布前自己跑一遍更稳：

```ts
await exec('pnpm', ['check:exports'], {
  cwd: repoRoot,
  stdio: 'inherit',
})
```

放在 `build-dts` 后、`dryRunCheck` 前。

可选再加：

```ts
await exec('pnpm', ['api:check'], {
  cwd: repoRoot,
  stdio: 'inherit',
})
```

但注意：`api:check` 会因为 package.json 版本和 lockfile 改动导致工作区 dirty，不过它只看 `docs/api/snapshots`，所以问题不大。真正要防的是 dts 文件坏掉。

---

## 7. `release:canary` 的 `pnpm install --lockfile-only` 可以保留，但建议注释说明原因

现在脚本改版本后执行：

```ts
await exec('pnpm', ['install', '--lockfile-only'], ...)
```

因为你已经不改 `workspace:*` 依赖，这一步不一定必须。但它也不是错，可能用于同步 lockfile 中 workspace package version 元信息。

建议加注释：

```ts
// Keep lockfile metadata in sync with temporary canary package versions.
// We keep `workspace:*` ranges unchanged; pnpm will rewrite workspace deps
// during publish/pack.
await exec('pnpm', ['install', '--lockfile-only'], {
  cwd: repoRoot,
  stdio: 'inherit',
})
```

---

# P2：可后续优化

## 8. capabilities 测试可以更严格

现在 `@zeus-js/zeus` capabilities 测试只验证了一部分字段，比如 `defineElement / Host / Slot`。

这能防止大方向漂移，但不能覆盖：

```txt
shadowDom
lightDom
namedSlots
defaultSlot
props
attrs
reflect
events
styles
context
```

这些是能力而不是直接导出，不好简单 `toHaveProperty`。后续可以加一个最小 custom element contract test，例如：

```tsx
it('defineElement supports props, attrs and event emit contract', () => {
  expect(ZEUS_CAPABILITIES.webComponents.props).toBe(true)
  expect(ZEUS_CAPABILITIES.webComponents.attrs).toBe(true)
  expect(ZEUS_CAPABILITIES.webComponents.events).toBe(true)
})
```

更进一步可以真的用 `defineElement` 注册一个测试组件，验证 prop/attr/event 是否能跑。

---

## 9. `output-wc` capabilities 测试已经补上，方向对

`output-wc` 的 capabilities 测试现在覆盖了 Web Component 输出、manifest 生成，以及 react/vue wrappers 为 false。

这个可以保留，后续如果 `output-react-wrapper` / `output-vue-wrapper` 也加 capabilities，再分别给对应包加测试。

---

## 10. `docs/internal/review/canary*.md` 是否要提交进主线可以再想一下

分支里现在新增了：

```txt
docs/internal/review/canary.md
docs/internal/review/canary-2.md
```

这类 review 文档对过程追踪有用，但会让仓库文档越来越重。如果这些只是临时审查记录，建议合并前二选一：

```txt
保留到 docs/internal/review/，作为设计审查记录
或者删除，只保留 docs/internal/design/canary.md 和 docs/api/downstream-contract.md
```

不阻塞合并，但建议统一规则。

---

# 最终建议

**当前仍建议：暂不合并。**

现在 canary 发布 workflow 的核心风险基本处理好了，合并阻断点只剩一个大类：

```txt
additional entry d.ts 生成不可靠
```

具体表现是：

```txt
1. zeus.capabilities.api.md 是空的
2. output-wc.capabilities.api.md 是空的
3. bundler-plugin/vite.d.ts 可能引用不存在的 ./types
4. bundler-plugin/manifest.d.ts 可能引用不存在的 ../types
5. manifest snapshot 里引用了 ManifestOutputOptions，但没有声明它
```

修完这块后，我认为这个分支就可以合并。推荐最后再跑一遍：

```bash
pnpm clean
pnpm install --frozen-lockfile
pnpm build
pnpm build-dts
pnpm api:check
pnpm check:exports
pnpm check
pnpm test-unit
```

如果这些都过，再合并到 `main`。
