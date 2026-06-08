可以。`zeus` 侧接入建议走 **“脚本名保持不变，内部改成 @baicie/release 薄封装”**。

原因是 `zeus` 当前根脚本已经把发版入口集中在 `scripts/release/*`：`release / release:publishOnly / release:precheck / release:dry / release:canary` 都已经存在。
正式 precheck 当前也已经是一组固定命令：`build / check:compiler-cjs / build-dts / api:check / check / lint / test-unit / examples / bench / docs / size / exports / repository`。

另外这次只是 **发版工具抽离**，不改 Zeus Web-C 架构；Web-C 相关方案里已经明确 `defineCustomElements / auto` 应由组件库产物提供，`@zeus-js/web-c-runtime` 只做底层 runtime。

---

# 0. 前置要求

先确保 `tools/packages/release` 已修完上一轮问题，并发布新版本，例如：

```bash
@baicie/release@0.3.0
```

要求它至少已经包含这些新 API：

```ts
defineReleaseConfig
runReleaseCli
runPrecheckCli
runPublishCli
runReadinessCli
runReleasePlanCli
runVersionPackagesCli
runCanaryCli
```

目前 `@baicie/release` 根入口已经保留旧 API，并新增 workspace API 导出。
旧 API 继续保留 `publish / release / generateChangelog`，所以不会破坏别的包。

---

# 1. 修改 `zeus/package.json`

## 1.1 新增 devDependency

在 `devDependencies` 里加：

```json
{
  "@baicie/release": "^0.3.0"
}
```

如果你还没发布 npm，可以临时用：

```json
{
  "@baicie/release": "workspace:*"
}
```

但 `zeus` 和 `tools` 不是同一个 workspace，所以最终建议还是发布 `@baicie/release@0.3.0`。

---

## 1.2 scripts 修改

保留原来的脚本名，增加 `release:plan / release:verify`：

```json
{
  "scripts": {
    "release": "tsx scripts/release/release.ts",
    "release:publishOnly": "tsx scripts/release/release.ts --publishOnly",
    "release:precheck": "tsx scripts/release/release-precheck.ts",
    "release:retry-tag": "tsx scripts/release/retry-release-tag.ts",
    "release:plan": "tsx scripts/release/release-plan.ts",
    "release:verify": "tsx scripts/release/check-release-readiness.ts",
    "release:dry": "tsx scripts/release/release.ts --dry --skipGit",
    "release:canary": "tsx scripts/release/release-canary.ts"
  }
}
```

`release:retry-tag` 可以先保留旧实现，不急着抽。

---

# 2. 新增 `scripts/release.config.ts`

这个是 Zeus 发版配置核心。

```ts
import { defineReleaseConfig } from '@baicie/release'

export const zeusFixedPackages = [
  '@zeus-js/shared',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/compiler',
  '@zeus-js/zeus',
  '@zeus-js/bundler-plugin',
  '@zeus-js/component-analyzer',
  '@zeus-js/component-dts',
  '@zeus-js/output-wc',
  '@zeus-js/output-react-wrapper',
  '@zeus-js/output-vue-wrapper',
  '@zeus-js/output-css',
  '@zeus-js/output-icons',
]

export default defineReleaseConfig({
  repo: 'baicie/zeus',
  repositoryUrl: 'https://github.com/baicie/zeus.git',
  mode: 'changesets-fixed',
  packageManager: 'pnpm',

  workspace: {
    roots: ['packages'],
    include: zeusFixedPackages,
    packageKind(relativeDir) {
      if (relativeDir.startsWith('packages/core/')) return 'core'
      if (relativeDir.startsWith('packages/web-c/')) return 'web-c'
      return undefined
    },
  },

  fixedPackages: zeusFixedPackages,
  rootVersionPackage: '@zeus-js/zeus',
  changesetFile: '.changeset/release.md',
  changelogFile: 'CHANGELOG.md',

  publish: {
    access: 'public',
    provenance: true,
    skipExisting: true,
    retry: 5,
  },

  precheck: {
    commands: [
      ['pnpm', 'check:branch'],
      ['pnpm', 'build'],
      ['pnpm', 'check:compiler-cjs'],
      ['pnpm', 'build-dts'],
      ['pnpm', 'api:check'],
      ['pnpm', 'check'],
      ['pnpm', 'lint'],
      ['pnpm', 'test-unit'],
      ['pnpm', 'examples:check:all'],
      ['pnpm', 'bench:component-host:ci'],
      ['pnpm', 'docs:build'],
      ['pnpm', 'size:ci'],
      ['pnpm', 'check:exports'],
      ['pnpm', 'check:repository'],
    ],
  },

  /**
   * Zeus 本身已经有 check:exports / check:repository / api:check 这些强约束，
   * 所以这里不要启用通用 common readiness。
   *
   * common readiness 会要求每个包都有 scripts.check / files: ["dist"] 等，
   * 这对 zeus 现有包结构可能过严。
   */
  readiness: {
    common: false,
    strict: false,
    allowZero: false,
    package(pkg) {
      const errors: string[] = []

      if (!pkg.name.startsWith('@zeus-js/')) {
        errors.push(`${pkg.name}: expected @zeus-js scope`)
      }

      if (!zeusFixedPackages.includes(pkg.name)) {
        errors.push(`${pkg.name}: package is not in zeus fixed release group`)
      }

      if (!pkg.packageJson.version) {
        errors.push(`${pkg.name}: missing version`)
      }

      if (pkg.packageJson.private) {
        errors.push(`${pkg.name}: private package should not be publishable`)
      }

      return errors
    },
  },

  canary: {
    enabled: true,
    prefix: 'canary',
    tag: 'canary',
    envName: 'ZEUS_CANARY_VERSION',
    dispatch: {
      tokenEnv: 'ZEUS_UI_DISPATCH_TOKEN',
      repository: 'baicie/zeus-ui',
      eventType: 'zeus-canary-published',
      payload: ({ version, sha }) => ({
        source: 'zeus',
        sha,
        version,
      }),
    },
  },
})
```

重点：

```txt
workspace.roots 直接写 packages
include 限定 fixed group 包
mode 使用 changesets-fixed
rootVersionPackage 使用 @zeus-js/zeus
readiness.common = false，避免和 zeus 现有包结构冲突
```

---

# 3. 替换 release 脚本为薄封装

## 3.1 替换 `scripts/release/release.ts`

```ts
import { runReleaseCli } from '@baicie/release'
import config from '../release.config'

await runReleaseCli(config)
```

这个文件会同时支持：

```bash
pnpm release 0.1.0-beta.6
pnpm release --dry --skipGit
pnpm release:publishOnly 0.1.0-beta.6 --skipBuild
```

---

## 3.2 替换 `scripts/release/release-precheck.ts`

```ts
import { runPrecheckCli } from '@baicie/release'
import config from '../release.config'

await runPrecheckCli(config)
```

这会继续跑原来的 precheck commands。原来的 precheck 命令列表已经完整迁移到 `release.config.ts`。

---

## 3.3 新增 `scripts/release/release-plan.ts`

```ts
import { runReleasePlanCli } from '@baicie/release'
import config from '../release.config'

await runReleasePlanCli(config)
```

用于本地查看发版计划：

```bash
pnpm release:plan --version 0.1.0-beta.6 --tag beta
pnpm release:plan --version 0.1.0-beta.6 --tag beta --check-npm
pnpm release:plan --version 0.1.0-beta.6 --tag beta --json
```

---

## 3.4 新增 `scripts/release/check-release-readiness.ts`

```ts
import { runReadinessCli } from '@baicie/release'
import config from '../release.config'

await runReadinessCli(config)
```

用于：

```bash
pnpm release:verify
pnpm release:verify --allow-zero
pnpm release:verify --strict
```

---

## 3.5 替换 `scripts/release/release-canary.ts`

```ts
import { runCanaryCli } from '@baicie/release'
import config from '../release.config'

await runCanaryCli(config)
```

这个会复用配置里的：

```txt
ZEUS_CANARY_VERSION
ZEUS_UI_DISPATCH_TOKEN
repository_dispatch -> baicie/zeus-ui
```

现有 canary workflow 如果已经依赖 `ZEUS_CANARY_VERSION`，可以保持不变。

---

# 4. 旧文件怎么处理

可以删除或保留备份：

```txt
scripts/release/release.ts              替换
scripts/release/release-precheck.ts     替换
scripts/release/release-canary.ts       替换
```

建议先不要删：

```txt
scripts/release/retry-release-tag.ts
scripts/release/create-rc-notes.ts
scripts/release/check-registry-cli.ts
```

这些不是主发版内核，不影响这次抽离。

---

# 5. GitHub Actions 是否要改

## 正式 release workflow

大概率不用改。

因为它原来调用的是：

```bash
pnpm release:precheck
pnpm release --publishOnly $VERSION --skipBuild
```

而这两个脚本名都保留了。根脚本目前也已经这么定义。

只要 workflow 是 tag 触发 `v*`，仍然可以工作。

---

## canary workflow

大概率也不用改。

只要它继续调用：

```bash
pnpm release:canary
```

并设置：

```txt
NODE_AUTH_TOKEN
ZEUS_UI_DISPATCH_TOKEN
```

就可以。

---

# 6. 本地自测流程

## 6.1 安装依赖

```bash
pnpm install
```

确认 `@baicie/release` 能被解析：

```bash
pnpm exec tsx -e "import('@baicie/release').then(m => console.log(Object.keys(m)))"
```

期望输出里有：

```txt
runReleaseCli
runPrecheckCli
runReleasePlanCli
runReadinessCli
runCanaryCli
defineReleaseConfig
```

---

## 6.2 类型检查

```bash
pnpm check
```

单独测 release 脚本能否被 tsx 编译：

```bash
pnpm exec tsx scripts/release/release-plan.ts --version 0.1.0-beta.999 --tag beta --json
```

如果当前所有 fixed 包版本不是 `0.1.0-beta.999`，这个命令可能报：

```txt
Requested version 0.1.0-beta.999 does not match package version ...
```

这是正常的，因为 `release-plan` 不负责改版本。

---

## 6.3 release readiness 自测

先跑轻量检查：

```bash
pnpm release:verify --allow-zero
```

期望：

```txt
Release readiness check passed.
```

如果报：

```txt
expected @zeus-js scope
package is not in zeus fixed release group
```

说明 `workspace.include` 或 fixedPackages 列表和真实包名不一致，需要修 `zeusFixedPackages`。

---

## 6.4 precheck 自测

完整 precheck 很重，会跑 build、docs、bench、size。

完整跑：

```bash
pnpm release:precheck --allow-zero
```

如果只是先确认脚本链路，可以临时在本地用一个简化配置验证，但不要提交简化版。

正式提交前必须跑：

```bash
pnpm release:precheck --strict
```

---

## 6.5 dry release 自测

选择一个不会发布的版本，例如：

```bash
pnpm release:dry 0.1.0-beta.999 --tag beta --skipPrecheck
```

这个命令应该做这些事：

```txt
生成临时 .changeset/release.md
执行 pnpm changeset version
强制 fixed group 版本为 0.1.0-beta.999
更新 lockfile
输出 release plan
执行 pnpm publish --dry-run
不 commit
不 tag
不 push
```

注意：dry-run 会修改 package.json 和 lockfile，这是预期行为。跑完看 diff：

```bash
git diff
```

确认没问题后恢复：

```bash
git checkout -- .
git clean -fd
pnpm install --frozen-lockfile
```

---

## 6.6 publishOnly 自测

先确保当前 package.json 版本就是当前版本，例如根是 `0.1.0-beta.5`，Zeus 当前 root version 是 `0.1.0-beta.5`。

然后跑 publish dry-run：

```bash
NODE_AUTH_TOKEN=dummy pnpm exec tsx scripts/release/release.ts --publishOnly 0.1.0-beta.5 --skipBuild --tag beta --dry-run
```

但注意：当前 `runReleaseCli` 的 `publishOnly` 如果没有专门支持 `--dry-run + publishOnly`，建议先不要依赖这个命令。更稳的是新增一个直接 publish 薄封装。

---

# 7. 可选增强：新增 publish dry-run 脚本

如果你希望更好自测 `publishOnly`，建议补一个：

## 新增 `scripts/release/publish.ts`

```ts
import { runPublishCli } from '@baicie/release'
import config from '../release.config'

await runPublishCli(config)
```

## package.json 增加：

```json
{
  "scripts": {
    "ci-publish": "tsx scripts/release/publish.ts"
  }
}
```

然后自测：

```bash
pnpm ci-publish --dry-run --version 0.1.0-beta.5 --tag beta
```

正式 workflow 仍然可以继续用：

```bash
pnpm release:publishOnly 0.1.0-beta.5 --skipBuild
```

---

# 8. canary 自测

本地 canary 默认会拒绝运行，因为 canary 是 CI 场景。

本地强制 dry 环境自测命令：

```bash
CI=1 \
NODE_AUTH_TOKEN=dummy \
GITHUB_SHA=0000000000000000000000000000000000000000 \
GITHUB_RUN_NUMBER=1 \
GITHUB_RUN_ATTEMPT=1 \
pnpm release:canary --force-local
```

但是它会真的走 publish dry-run 后再走 publish。如果 `@baicie/release` 当前 canary 还没有 `--dry-run-only`，本地不要跑完整 canary，除非你确认 token 是 dummy 且 publish 会失败在认证阶段。

更建议给 `@baicie/release` 的 `runCanaryCli` 补一个参数：

```txt
--dry-run-only
```

然后本地跑：

```bash
CI=1 \
NODE_AUTH_TOKEN=dummy \
GITHUB_SHA=0000000000000000000000000000000000000000 \
GITHUB_RUN_NUMBER=1 \
GITHUB_RUN_ATTEMPT=1 \
pnpm release:canary --force-local --dry-run-only
```

如果暂时不改 tools，那 zeus 侧 canary 自测只跑：

```bash
pnpm exec tsx scripts/release/release-canary.ts --force-local
```

并在它进入真实 publish 前中断，不作为最终验收。

---

# 9. 建议补一组 Zeus 侧 contract 测试

新增：

```txt
scripts/release/__tests__/release-config.spec.ts
```

```ts
import config, { zeusFixedPackages } from '../release.config'

describe('zeus release config', () => {
  it('uses changesets fixed release mode', () => {
    expect(config.mode).toBe('changesets-fixed')
    expect(config.repo).toBe('baicie/zeus')
    expect(config.repositoryUrl).toBe('https://github.com/baicie/zeus.git')
    expect(config.rootVersionPackage).toBe('@zeus-js/zeus')
  })

  it('keeps fixed package group explicit', () => {
    expect(zeusFixedPackages).toEqual([
      '@zeus-js/shared',
      '@zeus-js/signal',
      '@zeus-js/runtime-dom',
      '@zeus-js/compiler',
      '@zeus-js/zeus',
      '@zeus-js/bundler-plugin',
      '@zeus-js/component-analyzer',
      '@zeus-js/component-dts',
      '@zeus-js/output-wc',
      '@zeus-js/output-react-wrapper',
      '@zeus-js/output-vue-wrapper',
      '@zeus-js/output-css',
      '@zeus-js/output-icons',
    ])
  })

  it('keeps release gates aligned with current zeus release precheck', () => {
    expect(config.precheck?.commands).toEqual([
      ['pnpm', ['check:branch']],
      ['pnpm', ['build']],
      ['pnpm', ['check:compiler-cjs']],
      ['pnpm', ['build-dts']],
      ['pnpm', ['api:check']],
      ['pnpm', ['check']],
      ['pnpm', ['lint']],
      ['pnpm', ['test-unit']],
      ['pnpm', ['examples:check:all']],
      ['pnpm', ['bench:component-host:ci']],
      ['pnpm', ['docs:build']],
      ['pnpm', ['size:ci']],
      ['pnpm', ['check:exports']],
      ['pnpm', ['check:repository']],
    ])
  })

  it('keeps canary downstream dispatch compatible with zeus-ui', () => {
    expect(config.canary).toMatchObject({
      enabled: true,
      prefix: 'canary',
      tag: 'canary',
      envName: 'ZEUS_CANARY_VERSION',
      dispatch: {
        tokenEnv: 'ZEUS_UI_DISPATCH_TOKEN',
        repository: 'baicie/zeus-ui',
        eventType: 'zeus-canary-published',
      },
    })
  })
})
```

运行：

```bash
pnpm test-unit scripts/release/__tests__/release-config.spec.ts
```

如果 vitest 配置不支持直接传文件，就用：

```bash
pnpm vitest --run scripts/release/__tests__/release-config.spec.ts
```

---

# 10. 推荐最终验收顺序

```bash
# 1. 依赖安装
pnpm install

# 2. 类型检查
pnpm check

# 3. release config contract
pnpm vitest --run scripts/release/__tests__/release-config.spec.ts

# 4. readiness
pnpm release:verify --allow-zero

# 5. release plan
pnpm release:plan --version 0.1.0-beta.5 --tag beta --json

# 6. 轻量 dry release，不跑完整 precheck
pnpm release:dry 0.1.0-beta.999 --tag beta --skipPrecheck

# 7. 检查 diff
git diff

# 8. 恢复
git checkout -- .
git clean -fd
pnpm install --frozen-lockfile

# 9. 完整 precheck
pnpm release:precheck --strict
```

真正发 beta：

```bash
pnpm release 0.1.0-beta.6 --tag beta
```

tag push 后 GitHub Actions 继续执行：

```bash
pnpm release:precheck
pnpm release:publishOnly 0.1.0-beta.6 --skipBuild
```

---

# 11. 建议提交

```txt
refactor(release): use @baicie/release workspace kit
```

PR 描述可以写：

```txt
- Add shared release config for zeus fixed package group
- Replace local release/precheck/canary scripts with @baicie/release wrappers
- Add release plan and readiness script entries
- Keep existing release command names and GitHub Actions compatibility
- Add release config contract tests
```

核心就是：**Zeus 保留现有命令和 workflow 心智，只把发版内核迁移到 `@baicie/release`。**
