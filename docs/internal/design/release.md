你这个现象的原因不是命令空格问题，核心是 **当前 `release.ts` 对自定义 prerelease 版本支持不完整**。

你输入目标是：

```bash
0.1.0-beta.0
```

但脚本最终生成：

```txt
final: v0.0.3
```

原因在这里：

```ts
const getBumpType = (target: string): string => {
  const diff = semver.diff(currentVersion, target)
  if (diff === 'major') return 'major'
  if (diff === 'minor') return 'minor'
  return 'patch'
}
```

当 `currentVersion = 0.0.2`，`targetVersion = 0.1.0-beta.0` 时，`semver.diff()` 返回的不是普通 `minor`，而是类似 `preminor`。但你的 `getBumpType()` 没处理 `preminor`，最后落到了 `patch`，所以 changeset 把版本升成了 `0.0.3`。

---

## 你现在先怎么处理

你在提示：

```txt
Changelog generated (final: v0.0.3). Does it look good?
```

这里应该选：

```txt
N
```

如果已经选了 false，脚本会执行 revert：

```ts
git checkout .
rm .changeset/release.md
```

这段逻辑已经在脚本里。

然后确认一下：

```bash
git status
```

如果还有残留：

```bash
git checkout .
rm -f .changeset/release.md
pnpm install --frozen-lockfile
```

---

# 正确修法

你要改 `scripts/release/release.ts`，让它支持 prerelease。

## 方案 A：最小修复

把：

```ts
const getBumpType = (target: string): string => {
  const diff = semver.diff(currentVersion, target)
  if (diff === 'major') return 'major'
  if (diff === 'minor') return 'minor'
  return 'patch'
}
```

改成：

```ts
const getBumpType = (target: string): string => {
  const diff = semver.diff(currentVersion, target)

  if (diff === 'major' || diff === 'premajor') return 'major'
  if (diff === 'minor' || diff === 'preminor') return 'minor'
  if (diff === 'patch' || diff === 'prepatch' || diff === 'prerelease') {
    return 'patch'
  }

  return 'patch'
}
```

这样 `0.0.2 -> 0.1.0-beta.0` 会按 `minor` 处理，不会再变成 `0.0.3`。

但是注意：**只这样改，changeset 可能会生成 `0.1.0`，不一定生成 `0.1.0-beta.0`**。因为 changeset 的 frontmatter 只有 `major/minor/patch`，不是精确版本。

---

# 更稳的方案：显式覆盖 fixed group 版本

你的脚本目标是“传入什么版本，就发布什么版本”。那就应该在 `changeset version` 后，把 fixed group 包和 root version 强制改成 `targetVersion`。

在这里：

```ts
await run('pnpm', ['changeset', 'version'])
```

之后加一个函数：

```ts
await forceFixedGroupVersion(targetVersion)
```

也就是改成：

```ts
await run('pnpm', ['changeset', 'version'])

await forceFixedGroupVersion(targetVersion)
```

新增函数：

```ts
function forceFixedGroupVersion(version: string) {
  for (const pkgName of fixedGroupPackages) {
    const pkgRoot = getPkgRoot(pkgName)
    const pkgPath = path.join(pkgRoot, 'package.json')

    if (!fs.existsSync(pkgPath)) {
      throw new Error(`Package not found: ${pkgName} at ${pkgPath}`)
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    pkg.version = version

    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}
```

然后下面这段：

```ts
const finalVersion = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../packages/core/zeus/package.json'),
    'utf-8',
  ),
).version
```

就会读到：

```txt
0.1.0-beta.0
```

---

# 推荐最终修改

同时做这两处：

## 1. 修 `getBumpType`

```ts
const getBumpType = (target: string): string => {
  const diff = semver.diff(currentVersion, target)

  if (diff === 'major' || diff === 'premajor') return 'major'
  if (diff === 'minor' || diff === 'preminor') return 'minor'

  return 'patch'
}
```

## 2. 在 `changeset version` 后强制设置目标版本

```ts
await run('pnpm', ['changeset', 'version'])
forceFixedGroupVersion(targetVersion)
```

```ts
function forceFixedGroupVersion(version: string) {
  for (const pkgName of fixedGroupPackages) {
    const pkgRoot = getPkgRoot(pkgName)
    const pkgPath = path.join(pkgRoot, 'package.json')

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    pkg.version = version

    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}
```

---

# 修完后重新 dry-run

```bash
pnpm release:dry 0.1.0-beta.0
```

这次你应该看到：

```txt
Releasing v0.1.0-beta.0
...
Changelog generated (final: v0.1.0-beta.0)
```

如果看到的还是：

```txt
final: v0.0.3
```

就不要继续，继续选 `N`。

---

# 还有一个建议

你的 dry-run 现在虽然叫 dry-run，但它仍然会执行：

```ts
pnpm changeset version
pnpm install --prefer-offline
```

也就是会改文件。

所以每次 dry-run 后都建议看：

```bash
git diff
```

如果不满意：

```bash
git checkout .
rm -f .changeset/release.md
```

---

最终结论：

```txt
当前 release 脚本不支持精确发布 0.1.0-beta.0。
它把 preminor 错当 patch，所以变成了 0.0.3。
先不要继续发布，先修 release.ts。
```
