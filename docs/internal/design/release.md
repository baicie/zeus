# Zeus 发版流程

本文档定义 Zeus 推荐的正式发版、dry-run 验证、canary 发版与异常恢复流程。

核心原则：

1. Zeus 使用 main-only trunk based development，不设置长期 `develop`。
2. `main` 必须始终可构建、可测试、可发 canary。
3. 正式发版只发布 `.changeset/config.json` fixed group 内的 `@zeus-js/*` 包。
4. 版本号以 `packages/core/zeus/package.json` 为当前基准，root `package.json` 跟随最终版本。
5. 用户可见变更必须先写 changeset。
6. 正式发布由 GitHub Actions 执行，本地只负责生成 release commit 和 tag。
7. `release:dry` 是“不会提交/打 tag/推送”的 dry-run，但仍会修改工作区文件。

分支策略详见 `docs/internal/design/branching.md`。

## 0. release 分支模型

平时所有功能和修复都通过短分支 PR 进入 `main`：

```txt
feat/<scope>-<topic>
fix/<scope>-<topic>
refactor/<scope>-<topic>
chore/<scope>-<topic>
docs/<scope>-<topic>
test/<scope>-<topic>
```

正式发版窗口临时从 `main` 拉：

```txt
release/0.1.0
```

release 分支只允许 release polish、文档、测试、lockfile、版本和阻塞修复，不再接收大功能。发版完成后 merge 回 `main`、打 tag、发布 stable，并删除 release 分支。

正式发布 workflow 运行在 `v<version>` tag 上，例如 `v0.1.0-beta.4`。`pnpm check:branch` 必须允许这种 release tag；普通开发分支仍按 `feat/*`、`fix/*` 等短分支规则检查。

---

## 1. 日常变更阶段

每个会影响发布说明或包版本的变更，都应包含 changeset：

```bash
pnpm changeset
```

changeset 要写清楚用户可感知的行为变化，不要只写内部实现细节。推荐格式：

```md
---
'@zeus-js/bundler-plugin': minor
'@zeus-js/output-react-wrapper': patch
---

Add Rollup and Rolldown bundler entry points...
```

规则：

- breaking change 用 `major`
- 新能力用 `minor`
- bugfix / 类型修复 / 小行为修正用 `patch`
- fixed group 发版时，脚本会把 fixed group 包统一到目标版本
- `.changeset/config.json` `ignore` 内的包不进入正式 release

---

## 2. 发版前检查

正式发版前先跑完整 precheck：

```bash
pnpm release:precheck
```

它会覆盖：

- build
- CJS compiler 检查
- d.ts 构建
- API snapshot 检查
- TypeScript 检查
- lint
- unit tests
- examples 检查
- docs build
- size CI
- package exports / repository metadata

如果只是快速确认当前 release 脚本或版本行为，可以先跑较小集合：

```bash
pnpm check
pnpm test-unit
pnpm api:check
```

但正式发版前仍以 `pnpm release:precheck` 为准。

---

## 3. Dry-run 验证

推荐先用显式版本 dry-run：

```bash
pnpm release:dry 0.1.0-beta.2
```

也可以使用交互式选择：

```bash
pnpm release:dry
```

注意：`release:dry` 会执行：

- 生成临时 `.changeset/release.md`
- `pnpm changeset version`
- 强制 fixed group 包版本为目标版本
- 生成根 `CHANGELOG.md`
- 删除各 package 独立 `CHANGELOG.md`
- 更新 root version
- `pnpm install --prefer-offline`

但它不会：

- commit
- tag
- push
- publish

dry-run 后必须检查：

```bash
git diff
git status --short
```

重点看：

- `CHANGELOG.md` 是否生成，并且条目内容正确
- root `package.json` 版本是否正确
- fixed group package 版本是否都一致
- `.changeset/*.md` 是否被消费
- 是否误改了 ignore 包或非发布包
- `pnpm-lock.yaml` 是否有合理变更

如果 dry-run 结果不满意，恢复工作区：

```bash
git checkout .
rm -f .changeset/release.md
pnpm install --frozen-lockfile
```

如果工作区里有未提交的开发改动，不要直接 `git checkout .`。先保存或只恢复 release 相关文件。

---

## 4. 正式发版

确认 dry-run diff 正确后，执行正式 release：

```bash
pnpm release 0.1.0-beta.2
```

或者交互式选择：

```bash
pnpm release
```

脚本会：

1. 读取当前 changesets
2. 生成临时 release changeset
3. 执行 `pnpm changeset version`
4. 强制 fixed group 包版本为目标版本
5. 生成根 `CHANGELOG.md`
6. 删除 package 内独立 `CHANGELOG.md`
7. 更新 root version
8. 更新 lockfile
9. commit release diff
10. 创建 `vX.Y.Z` tag
11. push tag 和 commit

GitHub Actions 会在 tag push 后执行 `.github/workflows/release.yml`：

```txt
tag v*
  -> release:precheck
  -> pnpm release --publishOnly <version> --skipBuild
  -> npm publish
  -> GitHub Release
```

发布状态看：

```txt
https://github.com/baicie/zeus/actions/workflows/release.yml
```

---

## 5. CI 发布阶段

正式发布由 CI 执行，不推荐本地直接 publish。

CI 的 publish 阶段使用：

```bash
pnpm release --publishOnly <version> --skipBuild
```

语义：

- 不生成 changelog
- 不改版本
- 不 commit / tag
- 读取当前 package version
- 发布未被 ignore 的非 private workspace package
- prerelease 自动选择 npm tag：
  - `alpha` -> `alpha`
  - `beta` -> `beta`
  - `rc` -> `rc`
  - stable -> latest

本地只有在 CI 故障且确认需要人工补发时，才考虑 `--publishOnly`。

---

## 6. Canary 发版

canary 用于 PR / 短分支 / main 合并后的下游兼容性验证，不污染正式 release 流程。

CI 触发：

```txt
push main / feat/* / fix/* / refactor/* / chore/* / test/* / release/* / hotfix/*
  -> .github/workflows/release-canary.yml
  -> pnpm release:canary
```

也可以通过 GitHub Actions `workflow_dispatch` 手动触发。PR 需要 canary 时，由维护者从对应分支手动触发，避免在 PR 上扩大 npm token 暴露面。

本地默认禁止运行，因为它会临时改 package versions。确实要本地调试时：

```bash
pnpm release:canary --force-local
```

canary 版本格式：

```txt
<base>-canary.<yyyymmdd>.<runNumber>.<runAttempt>.<shortSha>
```

例如：

```txt
0.1.0-canary.20260604.123.1.a1b2c3d4
```

canary 发布前会执行：

- 版本临时改写
- lockfile metadata 更新
- build
- build-dts
- api:check
- check:exports
- check:repository
- npm publish dry-run
- npm publish --tag canary

---

## 7. 推荐命令清单

普通变更：

```bash
pnpm changeset
```

正式发版前：

```bash
pnpm release:precheck
pnpm release:dry 0.1.0-beta.2
git diff
```

正式发版：

```bash
pnpm release 0.1.0-beta.2
```

只发布已由 tag / commit 准备好的版本：

```bash
pnpm release --publishOnly 0.1.0-beta.2 --skipBuild
```

重复触发一个尚未发布到 npm 的版本：

```bash
pnpm release:retry-tag 0.1.0-beta.2 --yes
```

本地调试 canary：

```bash
pnpm release:canary --force-local
```

---

## 8. 常见问题

### dry-run 后没有 changelog

这是脚本必须避免的回归。根因通常是先执行了 `pnpm changeset version`，再读取 `.changeset/*.md`，导致 changeset 已经被消费。

正确顺序：

```txt
readChangesets()
write .changeset/release.md
pnpm changeset version
generateUnifiedChangelog()
```

### dry-run 后工作区变脏

这是预期行为。`release:dry` 不提交、不打 tag，但会真实改文件用于审查。

不满意时恢复：

```bash
git checkout .
rm -f .changeset/release.md
pnpm install --frozen-lockfile
```

### final version 和目标版本不一致

不要继续确认。选择 `N`，让脚本回滚。

应检查：

- `getBumpType()` 是否正确处理 `premajor/preminor/prepatch/prerelease`
- `forceFixedGroupVersion(targetVersion)` 是否在 `changeset version` 后执行
- fixed group 是否包含目标发布包

### GitHub Actions 发布失败但部分包已 publish

npm 版本不可覆盖。不要重试同一个版本盲发。

处理方式：

1. 看失败包和已发布包列表
2. 如果只是 CI 中断，确认哪些包已经发布
3. 必要时提升到新 patch / prerelease 版本重新发
4. canary 失败可重新跑 workflow，`GITHUB_RUN_ATTEMPT` 会生成新 canary 版本

### GitHub Actions 在 publish 前失败，npm 包没发出去

可以复用同一个版本，但必须先让 tag 指向包含修复的最新 commit。

推荐命令：

```bash
pnpm release:retry-tag 0.1.0-beta.2 --yes
```

这个命令会：

- 要求工作区干净。
- 确认所有待发布包的 `package.json` 已经是目标版本。
- 检查 npm 上对应版本还没有发布。
- 删除本地和远端同名 `v<version>` tag。
- 在当前 `HEAD` 重新创建并推送 `v<version>` tag。

如果 npm 上已经存在任何一个待发布包的目标版本，命令会失败。此时必须提升到新版本，例如从 `0.1.0-beta.4` 改发 `0.1.0-beta.3`。

---

## 9. 发版前人工检查清单

- [ ] `pnpm release:precheck` 通过
- [ ] 所有用户可见变更都有 changeset
- [ ] `.changeset/config.json` fixed / ignore 范围符合预期
- [ ] `pnpm release:dry <version>` 生成的版本正确
- [ ] `CHANGELOG.md` 内容正确
- [ ] package versions 和 root version 一致
- [ ] lockfile diff 合理
- [ ] 没有误删非 release 文件
- [ ] 正式 release tag 推送后 GitHub Actions 通过
