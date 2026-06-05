# Contributing

Zeus 使用 main-only trunk based development：`main` 是唯一长期主干，必须始终处于可构建、可测试、可发 canary 的状态。不要建立长期 `develop` 分支。

## 分支模型

从最新 `main` 拉短生命周期分支：

```txt
feat/<scope>-<topic>
fix/<scope>-<topic>
refactor/<scope>-<topic>
chore/<scope>-<topic>
docs/<scope>-<topic>
test/<scope>-<topic>
release/<version>
hotfix/<version>-<topic>
```

示例：

```txt
feat/web-c-lazy-loader
fix/compiler-attrs
refactor/workspace-layout
chore/canary-downstream-dispatch
docs/web-c-lazy-design
test/compiler-attrs-cases
release/0.1.0
hotfix/0.1.0-web-c-loader
```

本地检查：

```bash
pnpm check:branch
```

规则：

- `feat/*`、`fix/*`、`refactor/*`、`chore/*`、`docs/*`、`test/*` 应尽量 1-7 天内合并，最长不要超过 2 周。
- `release/*` 只在正式发版窗口存在，发完删除。
- `hotfix/*` 只用于线上稳定版紧急修复。
- 分支名保持短而明确，具体设计放在 issue、docs 或 PR 描述里。

## 开发流程

```bash
pnpm install
pnpm dev
```

每个功能按以下流程推进：

1. 从 `main` 拉短分支。
2. 小步提交，提交信息使用 Conventional Commits。
3. 在分支内补测试、示例或文档。
4. 本地跑必要检查。
5. 开 PR 到 `main`。
6. CI 通过后，按需要发 canary 并做下游兼容验证。
7. squash merge 到 `main`。
8. 删除已合并分支。

## 必跑检查

基础检查：

```bash
pnpm check:branch
pnpm lint
pnpm check
pnpm test
pnpm build
```

涉及公开包、编译器输出、runtime、Web Components、wrapper、exports 或 types 时，还应跑：

```bash
pnpm build-dts
pnpm api:check
pnpm check:exports
pnpm examples:check:all
```

正式发版前以 release precheck 为准：

```bash
pnpm release:precheck
```

## Changesets

用户可见变更必须包含 changeset：

```bash
pnpm changeset
```

规则：

- breaking change 用 `major`
- 新能力用 `minor`
- bugfix、类型修复、小行为修正用 `patch`
- docs-only、test-only、CI-only 变更通常不需要 changeset

## Commit 模型

使用 Conventional Commits：

```txt
feat(web-c): add lazy proxy runtime
feat(web-c): generate loader and auto entry
fix(compiler): preserve boolean attributes
fix(release): align repository url for provenance
refactor(workspace): move integrations out of packages
test(web-c): cover lazy loading before connected
docs(web-c): document stencil-style loader design
```

## Package responsibilities

- `@zeus-js/signal`: reactivity core
- `@zeus-js/runtime-dom`: DOM runtime helpers
- `@zeus-js/compiler`: JSX compiler
- `@zeus-js/zeus`: framework entry
- `@zeus-js/vite-plugin`: Vite integration
- `@zeus-js/*` Web-C packages: component compiler host outputs, wrappers, manifest, runtime and bundler integration

## 合并要求

PR 合并前应满足：

- 分支名符合 `pnpm check:branch`
- CI 通过
- 示例或下游兼容验证覆盖受影响路径
- package `exports`、types、sideEffects 没有意外破坏
- 需要发布说明的变更已包含 changeset
- 大功能已拆成可审查的逻辑提交或拆成多个短分支
