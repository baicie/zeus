# Zeus Workspace 重构方案

## 1. 发版策略

### 核心固定版本组

packages 下的包共享版本，一起 bump 一起发：

```txt
@zeus-js/shared
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/compiler
@zeus-js/zeus
```

### 生态独立版本组

addons 下的包独立版本：

```txt
@zeus-js/vite-plugin   (addons/vite-plugin)
create-zeus            (addons/create-zeus)
```

核心原因：`signal`、`runtime-dom`、`compiler`、`zeus` 之间是框架主链路，用户不应该遇到 `runtime-dom@0.0.5` 搭配 `signal@0.0.3` 这种奇怪组合。`vite-plugin`、`create-zeus` 属于生态工具，可以独立发版。

## 2. Changesets 配置

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
    "@zeus-js/example-web-component",
    "create-zeus"
  ]
}
```

`fixed` 语义保证组内包一起 version bump，一起 publish。

## 3. 依赖版本策略

```txt
packages/* 内部依赖：workspace:*
生态包依赖核心：workspace:^
```

## 4. 发版流程

Release workflow 通过 tag 触发：

```yaml
on:
  push:
    tags:
      - 'v*'
```

执行：

```bash
pnpm release --publishOnly ${{ env.VERSION }} --skipBuild
```

流程：

```bash
pnpm changeset
pnpm changeset version
pnpm install --lockfile-only
pnpm release:precheck
pnpm release:publish
```

## 5. 目录结构

```txt
packages/                    # 框架核心包（fixed 版本组）
  zeus/                      # @zeus-js/zeus - 框架主入口
  signal/                    # @zeus-js/signal - 响应式核心
  runtime-dom/              # @zeus-js/runtime-dom - DOM 运行时
  compiler/                  # @zeus-js/compiler - Babel 编译器
  shared/                    # @zeus-js/shared - 共享工具

addons/                      # 生态工具包（独立版本）
  vite-plugin/               # @zeus-js/vite-plugin - Vite 集成插件
  create-zeus/              # create-zeus - 项目脚手架

examples/                    # 示例项目（private）
  counter/
  todo/
  context/
  light-dom-slots/
  web-component/
  project-board/
  render-demo/
  compiler/
  zeus-app/

docs/                        # VitePress 文档
```

pnpm-workspace.yaml：

```yaml
packages:
  - 'packages/*' # 框架核心
  - 'addons/*' # 生态工具
  - 'examples/*' # 示例
  - 'docs' # 文档
```

## 6. 已修复的脚本

所有脚本统一使用 `findWorkspacePackages()` 工具函数，通过扫描 `packages/*` 和 `addons/*` 自动发现包，不再硬编码目录路径。

### scripts/shared/utils.ts

```ts
export function findWorkspacePackages(): WorkspacePackage[] {
  const results: WorkspacePackage[] = []
  for (const topDir of ['packages', 'addons']) {
    const topPath = path.resolve(_rootDir, topDir)
    if (!fs.existsSync(topPath)) continue
    for (const name of fs.readdirSync(topPath)) {
      const pkgJsonPath = path.resolve(topPath, name, 'package.json')
      if (!fs.existsSync(pkgJsonPath)) continue
      // ...
    }
  }
  return results
}
```

### scripts/shared/aliases.ts

同样扫描 `packages` 和 `addons` 生成 alias entries。

### scripts/bundler/rolldown.config.ts

按顺序查找 `packages/*` 和 `addons/*` 目录中的包。

### scripts/release/release.ts

使用 `findWorkspacePackages()` 扫描可发布包，通过 `existsSync` 兼容 `addons/` 和 `packages/` 两处位置。版本从 `packages/zeus/package.json` 读取。

## 7. tsconfig 配置

tsconfig.json paths：

```json
{
  "paths": {
    "@zeus-js/*": ["./packages/*/src"]
  }
}
```

tsconfig.build.json include：

```json
{
  "include": [
    "packages/shared/src",
    "packages/signal/src",
    "packages/runtime-dom/src",
    "packages/compiler/src",
    "packages/zeus/src",
    "addons/vite-plugin/src"
  ]
}
```

## 8. 决策规则

```txt
1. packages/* 下的包使用 fixed version。
2. packages/* 下的包只要一个包发版，整组一起发。
3. addons/* 独立发版。
4. 根 package.json 的 version 不作为真实版本来源。
5. release 脚本扫描 workspace package。
6. 不要新增根 src 目录。
7. 所有要发 npm 的东西必须是独立 package.json。
8. 所有不发 npm 的东西放 examples/docs/scripts，不混进 packages。
```
