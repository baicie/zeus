# Zeus 分支与主干策略

Zeus 采用 **Trunk Based Development 为主，短生命周期 feature/fix 分支为辅，release 分支只在发版窗口存在** 的模型。

一句话规则：

```txt
main 是唯一长期主干，所有改动走短分支 PR；功能用 feat/*，修复用 fix/*，发版临时用 release/*，不保留 develop。
```

## 分支类型

```txt
main
  稳定主干，随时可以发 canary / beta / stable

feat/*
  新功能分支

fix/*
  bug 修复分支

refactor/*
  重构分支

chore/*
  工程化 / CI / release / repo 配置

docs/*
  文档分支

test/*
  测试补充分支

release/*
  发版准备分支，短期存在，发完即删

hotfix/*
  线上稳定版紧急修复
```

## 命名规则

统一格式：

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
feat/web-c-minimal-wrapper
feat/compiler-output-types
fix/compiler-attrs
fix/compiler-jsx-cjs
fix/release-provenance
refactor/workspace-layout
chore/canary-downstream-dispatch
docs/web-c-lazy-design
test/compiler-attrs-cases
release/0.1.0
hotfix/0.1.0-web-c-loader
```

检查命令：

```bash
pnpm check:branch
```

## main 规则

`main` 必须满足：

```txt
1. pnpm install 能成功
2. pnpm build 能成功
3. pnpm test 能成功
4. pnpm lint 能成功
5. 示例项目能跑
6. canary 可以发
7. package exports / types / sideEffects 不破坏
```

禁止直接在 `main` 堆大功能。Web-C lazy loader、runtime、compiler output、wrapper、types、canary 下游验证这类跨包改动必须从短分支进入。

## 功能迭代流程

```txt
1. 从 main 拉分支
2. 小步提交
3. 分支内补测试
4. 本地跑 lint / test / build / affected examples
5. 开 PR
6. CI 通过
7. 需要时发 canary
8. 下游 zeus-ui / examples 验证
9. squash merge 到 main
10. 删除分支
```

大功能优先拆成多个短分支，例如：

```txt
feat/web-c-runtime-lazy
feat/web-c-output-manifest
feat/web-c-auto-loader
feat/web-c-minimal-vue-wrapper
feat/web-c-minimal-react-wrapper
feat/web-c-types
```

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

## release 分支

平时不用 `release/*`。正式发版窗口从 `main` 临时拉：

```txt
release/0.1.0
```

release 分支只允许：

```txt
fix/*
docs/*
chore/release-*
test/*
```

不允许继续塞大功能。

流程：

```txt
main
  ↓
release/0.1.0
  ↓
修 package version / changelog / examples / lockfile
  ↓
发 beta/canary 验证
  ↓
merge 回 main
  ↓
打 tag v0.1.0
  ↓
npm publish stable
  ↓
删除 release/0.1.0
```

## canary 策略

canary 不需要独立长期分支。当前仓库支持在 `main`、短分支、`release/*`、`hotfix/*` push 后发布 canary，也支持手动 `workflow_dispatch`。

canary 用于验证：

```txt
1. zeus-ui 能不能安装
2. vite/rollup/rolldown 示例能不能跑
3. types 能不能被消费
4. exports 是否正确
5. wrapper 是否能正常使用
6. web-c auto 是否不会被 tree-shaking 掉
```

## 合并策略

```txt
feature/fix/refactor 分支 -> PR -> squash merge -> main
release 分支 -> merge commit 或 squash merge -> main
hotfix 分支 -> PR -> squash merge -> main，然后必要时 cherry-pick 到 release/*
```

主分支保护应开启：

```txt
Require pull request
Require status checks
Require linear history
Require branches up to date before merging
Disallow direct push to main
```
