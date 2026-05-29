我的建议：**不要把“其余杂七杂八”放到根 `src`。根目录不要有业务源码池。Zeus 这种多包框架，最重要的是包边界清晰。用 `packages/core/*`、`packages/adapters/*`、`packages/create/*` 这种结构更合适。**

你现在仓库已经是 monorepo，`packages` 下有 `compiler`、`create-zeus`、`runtime-dom`、`shared`、`signal`、`vite-plugin`、`zeus`。README 里也已经把主包列成 `@zeus-js/zeus`、`@zeus-js/signal`、`@zeus-js/runtime-dom`、`@zeus-js/compiler`、`@zeus-js/vite-plugin`。([GitHub][1]) ([GitHub][2])

## 1. 发版策略：core 固定版本，生态包独立版本

### 结论

建议分两类：

```txt
core 固定版本组：
  @zeus-js/shared
  @zeus-js/signal
  @zeus-js/runtime-dom
  @zeus-js/compiler
  @zeus-js/zeus

ecosystem 独立版本组：
  @zeus-js/vite-plugin
  create-zeus
  未来的 @zeus-js/rollup-plugin
  未来的 @zeus-js/webpack-plugin
  未来的 eslint-plugin-zeus
  未来的 devtools
```

核心原因是：

`signal`、`runtime-dom`、`compiler`、`zeus` 之间是框架运行时/编译时主链路，用户不应该遇到 `runtime-dom@0.0.5` 搭配 `signal@0.0.3` 这种奇怪组合。尤其 0.x 阶段 API 还不稳定，更应该固定版本。

`vite-plugin`、`create-zeus` 属于生态工具，长期看可以独立发版。比如 Vite 适配修了一个小 bug，没必要让整个 runtime/compiler 都升版本。

## 2. 你现在的 Changesets 配置需要改

你现在 `.changeset/config.json` 用的是 `linked`，并且把 `@zeus-js/zeus`、`@zeus-js/signal`、`@zeus-js/runtime-dom`、`@zeus-js/compiler`、`@zeus-js/vite-plugin` 放在一起，但没有包含 `@zeus-js/shared`。([GitHub][3])

这里有两个问题：

第一，**`linked` 不等于“所有包一定一起发”**。Changesets 官方文档明确说，`linked packages` 只保证参与 release 的包共享版本计算，但不像 `fixed packages` 那样保证整组包都会一起 bump 和 publish。([GitHub][4])

第二，`@zeus-js/shared` 被 `signal` 和 `compiler` 依赖，但目前不在核心发布组里。你现在 `@zeus-js/signal` 依赖 `@zeus-js/shared: workspace:*`，`@zeus-js/compiler` 也依赖 `@zeus-js/shared: workspace:*`。([GitHub][5]) ([GitHub][6])

所以建议改成：

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [
    [
      "@zeus-js/shared",
      "@zeus-js/signal",
      "@zeus-js/runtime-dom",
      "@zeus-js/compiler",
      "@zeus-js/zeus"
    ]
  ],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@zeus-js/docs",
    "@zeus-js/playground",
    "@zeus-js/example-counter",
    "@zeus-js/example-todo",
    "@zeus-js/example-web-component"
  ]
}
```

`fixed` 的语义更符合你的诉求：一组包一起 version bump，一起 publish。Changesets 官方文档也说 `fixed packages` 会让组内包一起 versioned and published。([GitHub][7])

## 3. `vite-plugin` 要不要放 core？

我建议分阶段：

### MVP / 0.x 阶段

可以先把 `@zeus-js/vite-plugin` 也放进 fixed core 组里。

原因是现在 Zeus 编译器还在快速变，`vite-plugin` 又直接依赖 `@zeus-js/compiler`。如果 compiler 内部 API 变了，插件很容易不兼容。

### 1.0 稳定后

把 `vite-plugin` 移出去，独立版本。

```json
{
  "name": "@zeus-js/vite-plugin",
  "version": "0.1.0",
  "dependencies": {
    "@zeus-js/compiler": "workspace:^"
  },
  "peerDependencies": {
    "vite": "catalog:"
  }
}
```

`workspace:*`、`workspace:^` 在 pnpm publish / pack 时会被替换成真实版本；比如 `workspace:*` 会转成实际版本，`workspace:^` 会转成带 `^` 的 semver range。([pnpm][8])

我的取舍是：

```txt
core 内部依赖：workspace:*
生态包依赖 core：workspace:^
0.x 非稳定阶段：生态包也可以先用 workspace:*，等 API 稳了再改 workspace:^
```

## 4. 当前 release 脚本的问题

你现在 release workflow 是 tag 触发：

```yaml
on:
  push:
    tags:
      - 'v*'
```

然后执行：

```bash
pnpm release --publishOnly ${{ env.VERSION }} --skipBuild
```

([GitHub][9])

但是你的 `scripts/release/release.ts` 里是从 `linkedGroups[0]` 取 packages，然后只 publish 这组包。([GitHub][10])

这对“core 固定版本 + 生态独立版本”不够用。因为以后可能出现：

```txt
@zeus-js/zeus         0.2.0
@zeus-js/signal       0.2.0
@zeus-js/runtime-dom  0.2.0
@zeus-js/compiler     0.2.0

@zeus-js/vite-plugin  0.1.7
create-zeus           0.0.6
```

这时候用一个根 `v0.2.0` tag 去驱动所有包，会越来越别扭。

## 5. 我推荐的发版流程

### 推荐方案：Changesets 管 version，自己的 publish 脚本负责发布未发布包

流程：

```bash
pnpm changeset
pnpm changeset version
pnpm install --lockfile-only
pnpm release:precheck
pnpm release:publish
```

`release:publish` 不应该再依赖 `linkedGroups[0]`，而是扫描 workspace 中所有可发布包：

```ts
// 伪代码
const packages = findWorkspacePackages()

for (const pkg of packages) {
  if (pkg.private) continue
  if (changesetIgnore.includes(pkg.name)) continue

  const published = await npmView(`${pkg.name}@${pkg.version}`)
  if (published) {
    console.log(`skip ${pkg.name}@${pkg.version}`)
    continue
  }

  await pnpmPublish(pkg.dir)
}
```

对应 package script 可以这样：

```json
{
  "scripts": {
    "release:version": "changeset version && pnpm install --lockfile-only",
    "release:precheck": "tsx scripts/release/release-precheck.ts",
    "release:publish": "tsx scripts/release/publish.ts",
    "release": "pnpm release:precheck && pnpm release:publish"
  }
}
```

这样有几个好处：

```txt
1. core fixed 组会被 Changesets 保证统一版本
2. vite-plugin / create-zeus 可以独立版本
3. publish 脚本只发布 npm 上不存在的 package@version
4. 不再依赖 root version
5. 不需要一个 v* tag 表示所有包版本
```

## 6. tag 策略建议

不要再只用：

```txt
v0.0.3
```

长期建议用 package tag：

```txt
@zeus-js/zeus@0.2.0
@zeus-js/compiler@0.2.0
@zeus-js/vite-plugin@0.1.7
create-zeus@0.0.6
```

如果你觉得 package tag 太乱，也可以 core 用一个简化 tag：

```txt
zeus-core@0.2.0
```

生态包继续独立 tag：

```txt
vite-plugin@0.1.7
create-zeus@0.0.6
```

## 7. 目录结构建议

我不建议：

```txt
src/
  一堆杂项
```

根 `src` 会导致几个问题：

```txt
1. 包边界不清楚
2. 哪些东西发 npm 不清楚
3. build / test / tsconfig / changeset 都不好按包管理
4. 后面生态包越来越多会变成垃圾桶
```

建议改成：

```txt
zeus/
├─ packages/
│  ├─ core/
│  │  ├─ shared/
│  │  ├─ signal/
│  │  ├─ runtime-dom/
│  │  ├─ compiler/
│  │  └─ zeus/
│  │
│  ├─ adapters/
│  │  └─ vite-plugin/
│  │
│  ├─ create/
│  │  └─ create-zeus/
│  │
│  ├─ devtools/
│  │  └─ devtools/
│  │
│  └─ testing/
│     └─ test-utils/
│
├─ apps/
│  ├─ docs/
│  └─ playground/
│
├─ examples/
│  ├─ counter/
│  ├─ todo/
│  └─ web-component/
│
├─ scripts/
├─ vendor/
├─ .changeset/
├─ pnpm-workspace.yaml
└─ package.json
```

更简洁一点也可以：

```txt
packages/
  core/
  ecosystem/
  create/
apps/
examples/
scripts/
vendor/
```

其中：

```txt
packages/core       框架核心，固定版本
packages/adapters   构建工具适配器，独立版本
packages/create     脚手架，独立版本
packages/devtools   调试工具，独立版本
apps                文档、playground 这种不发布的应用
examples            示例
scripts             仓库工程脚本
vendor              第三方 vendored 代码
```

## 8. pnpm workspace 要改

现在 `pnpm-workspace.yaml` 是：

```yaml
packages:
  - packages/*
  - playground/*
  - examples/*
  - docs
```

([GitHub][11])

改成：

```yaml
packages:
  - 'packages/core/*'
  - 'packages/adapters/*'
  - 'packages/create/*'
  - 'packages/devtools/*'
  - 'packages/testing/*'
  - 'apps/*'
  - 'examples/*'
```

如果暂时不迁移 docs/playground，也可以过渡期这样：

```yaml
packages:
  - 'packages/core/*'
  - 'packages/adapters/*'
  - 'packages/create/*'
  - 'packages/devtools/*'
  - 'packages/testing/*'
  - 'docs'
  - 'playground/*'
  - 'examples/*'
```

## 9. 需要同步改的脚本

你现在不少脚本硬编码了 `packages/*`。

例如 build 脚本里直接拼：

```ts
const pkgBase = `packages`
const pkgDir = path.resolve(`${pkgBase}/${target}`)
```

([GitHub][12])

`targets` 也是直接 `fs.readdirSync('packages')`。([GitHub][13])

所以迁移目录后，要抽一个统一的 package discovery：

```ts
// scripts/shared/packages.ts
export interface WorkspacePackage {
  name: string
  dir: string
  relativeDir: string
  shortName: string
  packageJson: Record<string, unknown>
}

export function findWorkspacePackages(): WorkspacePackage[] {
  // 扫 packages/core/*、packages/adapters/*、packages/create/* ...
}

export function getBuildablePackages(): WorkspacePackage[] {
  return findWorkspacePackages().filter(pkg => {
    return !pkg.packageJson.private && pkg.packageJson.buildOptions
  })
}
```

之后 build、dts、size、release、check exports 都用这个工具，不要每个脚本自己猜路径。

## 10. tsconfig 也要改

现在 paths 是：

```json
{
  "@zeus-js/*": ["./packages/*/src"]
}
```

include 也是 `packages/*/src` 这种结构。([GitHub][14])

迁移后改成：

```json
{
  "compilerOptions": {
    "paths": {
      "@zeus-js/*": [
        "./packages/core/*/src",
        "./packages/adapters/*/src",
        "./packages/create/*/src",
        "./packages/devtools/*/src",
        "./packages/testing/*/src"
      ]
    }
  },
  "include": [
    "packages/global.d.ts",
    "packages/core/*/src",
    "packages/core/*/__tests__",
    "packages/adapters/*/src",
    "packages/adapters/*/__tests__",
    "packages/create/*/src",
    "packages/devtools/*/src",
    "scripts/**/*.ts"
  ]
}
```

`tsconfig.build.json` 也不要手写固定包：

```json
{
  "include": [
    "packages/core/shared/src",
    "packages/core/zeus/src",
    "packages/core/signal/src",
    "packages/core/runtime-dom/src",
    "packages/core/compiler/src",
    "packages/adapters/vite-plugin/src"
  ]
}
```

后面更好的方式是生成临时 tsconfig，或者 build-dts 脚本基于 `buildOptions` 自动找包。

## 11. 我的最终建议

你可以这样定规则：

```txt
1. packages/core/* 下的包使用 fixed version。
2. packages/core/* 下的包只要一个包发版，整组一起发。
3. packages/adapters/*、packages/create/*、packages/devtools/* 独立发版。
4. 根 package.json 的 version 不作为真实版本来源，可以保留但不要依赖。
5. release 脚本不要从 linkedGroups[0] 取包，要扫描 workspace package。
6. 不要新增根 src 目录。
7. 所有要发 npm 的东西必须是独立 package.json。
8. 所有不发 npm 的东西放 apps/examples/scripts/docs，不混进 packages/core。
```

我会优先落地这个结构：

```txt
packages/core/shared
packages/core/signal
packages/core/runtime-dom
packages/core/compiler
packages/core/zeus

packages/adapters/vite-plugin
packages/create/create-zeus

apps/docs
apps/playground

examples/counter
examples/todo
examples/web-component
```

当前阶段最优发版策略是：

```txt
0.x 阶段：
  core + vite-plugin 可以先 fixed，一起发，少踩兼容坑。

接近 1.0：
  core fixed。
  vite-plugin / create-zeus / devtools 独立发。
```

这样不会过早把系统复杂化，又不会把后续生态包全部绑死在 core 版本上。

[1]: https://github.com/baicie/zeus/tree/main/packages 'zeus/packages at main · baicie/zeus · GitHub'
[2]: https://github.com/baicie/zeus 'GitHub - baicie/zeus: 尝试一下Zeus大概 · GitHub'
[3]: https://raw.githubusercontent.com/baicie/zeus/main/.changeset/config.json 'raw.githubusercontent.com'
[4]: https://github.com/changesets/changesets/blob/main/docs/linked-packages.md 'changesets/docs/linked-packages.md at main · changesets/changesets · GitHub'
[5]: https://raw.githubusercontent.com/baicie/zeus/main/packages/signal/package.json 'raw.githubusercontent.com'
[6]: https://raw.githubusercontent.com/baicie/zeus/main/packages/compiler/package.json 'raw.githubusercontent.com'
[7]: https://github.com/changesets/changesets/blob/main/docs/fixed-packages.md 'changesets/docs/fixed-packages.md at main · changesets/changesets · GitHub'
[8]: https://pnpm.io/workspaces?utm_source=chatgpt.com 'Workspace'
[9]: https://raw.githubusercontent.com/baicie/zeus/main/.github/workflows/release.yml 'raw.githubusercontent.com'
[10]: https://raw.githubusercontent.com/baicie/zeus/main/scripts/release/release.ts 'raw.githubusercontent.com'
[11]: https://raw.githubusercontent.com/baicie/zeus/main/pnpm-workspace.yaml 'raw.githubusercontent.com'
[12]: https://raw.githubusercontent.com/baicie/zeus/main/scripts/bundler/build.ts 'raw.githubusercontent.com'
[13]: https://raw.githubusercontent.com/baicie/zeus/main/scripts/shared/utils.ts 'raw.githubusercontent.com'
[14]: https://raw.githubusercontent.com/baicie/zeus/main/tsconfig.json 'raw.githubusercontent.com'
