结论：**这一版已经基本可合并，没有再看到明确的 P0 阻断问题。**
上一轮的核心阻断点——空的 `capabilities` snapshot、additional entry dts 不完整、canary 并发发布风险——这版都已经修掉了。

不过合并前我建议再处理几处 P1/P2，主要是类型质量、错误可观测性和文档一致性。

---

# 当前已修好的关键点

## 1. canary 发布并发风险已修

现在 `release-canary.yml` 使用：

```yaml
concurrency:
  group: release-canary-${{ github.ref }}
  cancel-in-progress: false
```

这样多个 main commit 不会并发发布，也不会中途取消正在发布的 canary。

## 2. additional entry dts 已改成真正 Rollup DTS bundle

`rollup.dts.config.ts` 现在不再简单复制 additional entry dts，而是为 `additionalEntries` 生成独立 Rollup config，走 `dts()` 和 `patchTypes()`。这能解决 `capabilities`、`vite`、`manifest` 子路径类型不完整的问题。

## 3. snapshot 空文件问题已修

`zeus.capabilities.api.md` 现在已经有完整类型内容，不再是空代码块。

`output-wc.capabilities.api.md` 也已经有完整类型。

## 4. `vite` / `manifest` 子路径 dts 已完整展开

`bundler-plugin/vite` 的 snapshot 现在已经展开了 `ZeusBundlerPluginOptions`、`ZeusComponentPlugin` 等相关类型，不再依赖不存在的 `./types`。

`bundler-plugin/manifest` 也已经包含 `ManifestOutputOptions` 和相关内部类型定义。

## 5. snapshot 校验增强是对的

`write-api-snapshots.ts` 现在会：

```txt
1. 清理 stale snapshot
2. 拒绝空 dts
3. 检查相对类型 import 是否可解析
```

这些都能防止坏的 public dts 被提交。

---

# P1：建议合并前处理

## 1. `capabilities.version` 现在是 `any`，建议改成 `string`

当前 snapshot 里：

```ts
readonly version: any
```

`@zeus-js/zeus/capabilities` 是这样。
`@zeus-js/output-wc/capabilities` 也是这样。

这说明 `__VERSION__` 在 dts 里没有被稳定推导成 `string`。这不是运行时问题，但会降低下游类型质量。

建议改：

```ts
const version = __VERSION__ as string

export const ZEUS_CAPABILITIES = {
  packageName: '@zeus-js/zeus',
  version,
  // ...
} as const
```

`output-wc` 同理：

```ts
const version = __VERSION__ as string

export const ZEUS_OUTPUT_WC_CAPABILITIES = {
  packageName: '@zeus-js/output-wc',
  version,
  // ...
} as const
```

预期 snapshot 变成：

```ts
readonly version: string
```

这比 `any` 更适合作为 public API。

---

## 2. `dryRunCheck()` 和 `publishCanary()` 吞掉了原始错误细节

现在 `dryRunCheck()` catch 后只抛固定错误：

```ts
throw new Error(
  `Dry-run failed for ${pkg.name}. Check package configuration (files, exports, version).`,
)
```

原始 npm 错误没有带出来。

`publishCanary()` 也是 catch 之后丢了 `err`，只抛自定义文案。

建议保留 cause：

```ts
} catch (err) {
  throw Object.assign(
    new Error(
      `Dry-run failed for ${pkg.name}. Check package configuration (files, exports, version).`,
    ),
    { cause: err },
  )
}
```

或者直接打印：

```ts
} catch (err) {
  console.error(err)
  throw new Error(...)
}
```

发布失败时，原始错误通常很重要，例如：

```txt
401 Unauthorized
403 provenance failed
422 package already exists
repository.url mismatch
```

这些不能被隐藏。

---

## 3. `release:canary` 发布前建议再跑一次 `api:check`

现在 `release:canary` 在临时改 canary version 后会重新：

```txt
pnpm install --lockfile-only
pnpm build
pnpm build-dts
pnpm check:exports
```

但没有再跑：

```bash
pnpm api:check
```

虽然 workflow precheck 已经跑过 `api:check`，但那是在改 canary version 之前。

理论上现在 `version` 是 `any`，所以不会影响 snapshot；但如果你按上面建议把 `version` 改成 `string` 也没问题。如果未来 version 类型变成 literal 或 dts 生成逻辑变化，`release:canary` 自己最好也能兜底。

建议加在 `build-dts` 后：

```ts
await exec('pnpm', ['api:check'], {
  cwd: repoRoot,
  stdio: 'inherit',
})

await exec('pnpm', ['check:exports'], {
  cwd: repoRoot,
  stdio: 'inherit',
})
```

---

## 4. `checkRelativeTypeImports()` 只检查 `from './x'`，建议补 `import('./x')`

当前只匹配：

```ts
const importRE = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g
```

这能覆盖：

```ts
import type { A } from './a'
export { A } from './a'
```

但覆盖不到：

```ts
type A = import('./a').A
```

建议补一个正则：

```ts
const importTypeRE = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g
```

然后统一复用检查逻辑。

---

# P2：可以后续优化

## 5. `downstream-contract.md` 对 advanced 稳定性的描述不一致

文档前面写：

```txt
@zeus-js/zeus/advanced — advanced APIs (stable, but not recommended for general app code)
```

后面又写：

```txt
@zeus-js/zeus/advanced may change during beta.
```

这两句有点冲突。

建议统一成：

```md
- `@zeus-js/zeus/advanced` — advanced APIs for tooling/debugging. During beta, compatibility is best-effort and may change with release notes.
```

---

## 6. `downstream-contract.md` 的 Allowed Imports 可以补充 toolchain 子路径

现在 allowed imports 只列了：

```txt
@zeus-js/zeus
@zeus-js/zeus/advanced
@zeus-js/zeus/capabilities
@zeus-js/output-wc
@zeus-js/output-wc/capabilities
@zeus-js/preset-component-library
```

但你现在已经正式公开了：

```txt
@zeus-js/bundler-plugin/vite
@zeus-js/bundler-plugin/manifest
```

并且 snapshot 也覆盖了它们。

建议补充：

```md
- `@zeus-js/bundler-plugin`
- `@zeus-js/bundler-plugin/vite`
- `@zeus-js/bundler-plugin/manifest`
```

否则 downstream 文档和真实 exports/snapshot 不一致。

---

## 7. `docs/internal/review/cabary-3.md` 文件名有拼写错误

当前新增了：

```txt
docs/internal/review/cabary-3.md
```

这个应该是 `canary-3.md`。文件内容也是 canary review。

建议改名：

```txt
docs/internal/review/canary-3.md
```

或者如果这些 review 文档只是过程记录，也可以合并前删掉，只保留：

```txt
docs/internal/design/canary.md
docs/api/downstream-contract.md
```

---

## 8. `rollup.dts.config.ts` additional entry 现在会 skip 缺失 dts，是否要改成 hard error

现在 additional entry 如果 temp dts 不存在，会：

```ts
console.warn(`[dts] skipping ${extra.entry}: no temp dts found`)
continue
```

作为发布包，我更建议改成 hard error。因为 `package.json` 已经 exports 了对应子路径，如果 additional entry 的 dts 没生成，后面 `check:exports` 也许能发现缺文件，但这里直接失败更清晰。

建议：

```ts
if (!existsSync(inputDts)) {
  throw new Error(
    `[dts] missing temp dts for additional entry ${pkg}/${extra.entry}: ${inputDts}`,
  )
}
```

---

# 最终判断

**现在可以进入“合并前最后清理”阶段。**

我不再认为有 P0 阻断。建议你合并前至少修这 3 个小点：

```txt
1. capabilities.version 从 any 改成 string
2. dryRunCheck / publishCanary 保留原始错误信息
3. cabary-3.md 改名为 canary-3.md 或删除过程 review 文档
```

然后跑一遍：

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

如果这些都过，这个分支我认为可以合并到 `main`。
